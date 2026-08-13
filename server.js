"use strict";

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { execFile } = require("node:child_process");

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 8000);
const MAX_BODY_BYTES = 5 * 1024 * 1024;
const MIME_TYPES = { ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".png": "image/png" };
const DEFAULT_MODEL = "openai/gpt-4o-mini";
const DEFAULT_PRICES = {
  "openai/gpt-4o-mini": { input: 0.15, output: 0.60, source: "OpenAI published price (USD / 1M tokens)" }
};

function loadLocalEnv() {
  const envFile = path.join(ROOT, ".env.local");
  if (!fs.existsSync(envFile)) return;
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) { reject(new Error("payload-too-large")); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function string(value, max) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function priceFor(model) {
  const configuredInput = finiteNumber(process.env.ORCAROUTER_INPUT_USD_PER_MILLION);
  const configuredOutput = finiteNumber(process.env.ORCAROUTER_OUTPUT_USD_PER_MILLION);
  if (configuredInput !== null && configuredOutput !== null) {
    return { input: configuredInput, output: configuredOutput, source: "configured rates (USD / 1M tokens)" };
  }
  return DEFAULT_PRICES[model] || null;
}

function buildReceipt({ purpose, status, startedAt, requestBytes = 0, imageBytes = 0, requestedModel = DEFAULT_MODEL, resolvedModel = requestedModel, usage = {}, actualCostUsd = null, fallbackLevel = null }) {
  const promptTokens = finiteNumber(usage.prompt_tokens) || 0;
  const completionTokens = finiteNumber(usage.completion_tokens) || 0;
  const totalTokens = finiteNumber(usage.total_tokens) ?? (promptTokens + completionTokens);
  const rates = priceFor(resolvedModel);
  const measuredCost = finiteNumber(actualCostUsd);
  const estimatedCost = rates && totalTokens > 0 ? (promptTokens * rates.input + completionTokens * rates.output) / 1_000_000 : null;
  return {
    id: `${purpose}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    purpose,
    status,
    requestedModel,
    resolvedModel,
    fallbackLevel,
    requestBytes,
    imageBytes,
    promptTokens,
    completionTokens,
    totalTokens,
    latencyMs: Math.max(0, Date.now() - startedAt),
    costUsd: measuredCost ?? estimatedCost,
    costKind: measuredCost !== null ? "provider-reported" : estimatedCost !== null ? "estimated-from-measured-tokens" : "unavailable",
    costBasis: measuredCost !== null ? "upstream response" : rates?.source || "token price not configured",
    createdAt: Date.now()
  };
}

function extractJson(content) {
  const text = typeof content === "string" ? content : "";
  const candidate = text.match(/\{[\s\S]*\}/)?.[0] || text;
  const parsed = JSON.parse(candidate);
  const comment = string(parsed.comment, 180);
  const question = string(parsed.question, 120);
  if (!comment || !question) throw new Error("invalid-model-response");
  return { comment, question };
}

function extractMission(content) {
  const text = typeof content === "string" ? content : "";
  const candidate = text.match(/\{[\s\S]*\}/)?.[0] || text;
  const parsed = JSON.parse(candidate);
  const title = string(parsed.title, 40);
  const instruction = string(parsed.instruction, 140);
  const indoorInstruction = string(parsed.indoorInstruction, 140);
  const question = string(parsed.question, 120);
  if (!title || !instruction || !indoorInstruction || !question) throw new Error("invalid-model-response");
  return { title, instruction, indoorInstruction, question };
}

function contextFrom(payload) {
  const profile = payload.profile && typeof payload.profile === "object" ? {
    ageRange: string(payload.profile.ageRange, 20), role: string(payload.profile.role, 20), lifeState: string(payload.profile.lifeState, 30), mbti: string(payload.profile.mbti, 8)
  } : {};
  const recent = Array.isArray(payload.recent) ? payload.recent.slice(0, 7).map((entry) => ({ title: string(entry?.title, 60), answer: string(entry?.answer, 140), tags: Array.isArray(entry?.tags) ? entry.tags.map((tag) => string(tag, 24)).filter(Boolean).slice(0, 5) : [] })) : [];
  return { mood: string(payload.mood, 40), profile, recent };
}

async function chat(prompt, imageData, maxTokens = 180, purpose = "ai", requestBytes = 0, imageBytes = 0) {
  const startedAt = Date.now();
  const apiKey = process.env.ORCAROUTER_API_KEY;
  const requestedModel = process.env.ORCAROUTER_MODEL || DEFAULT_MODEL;
  if (!apiKey) {
    const error = new Error("not-configured");
    error.status = 503;
    error.receipt = buildReceipt({ purpose, status: "local-fallback", startedAt, requestBytes, imageBytes, requestedModel });
    throw error;
  }
  const endpoint = `${(process.env.ORCAROUTER_BASE_URL || "https://api.orcarouter.ai/v1").replace(/\/$/, "")}/chat/completions`;
  const content = [{ type: "text", text: prompt }];
  if (imageData) content.push({ type: "image_url", image_url: { url: imageData } });
  let upstream;
  try {
    upstream = await fetch(endpoint, { method: "POST", headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: requestedModel, temperature: 0.7, max_tokens: maxTokens, messages: [{ role: "user", content }] }) });
  } catch (cause) {
    const error = new Error("upstream-unreachable", { cause });
    error.status = 502;
    error.receipt = buildReceipt({ purpose, status: "local-fallback", startedAt, requestBytes, imageBytes, requestedModel });
    throw error;
  }
  const responseBody = await upstream.json().catch(() => ({}));
  const resolvedModel = upstream.headers.get("x-orca-resolved-model") || upstream.headers.get("x-orca-fallback-model") || responseBody.model || requestedModel;
  const fallbackLevel = finiteNumber(upstream.headers.get("x-orca-fallback-level"));
  const receipt = buildReceipt({ purpose, status: upstream.ok ? "success" : "local-fallback", startedAt, requestBytes, imageBytes, requestedModel, resolvedModel, usage: responseBody.usage, actualCostUsd: responseBody.cost ?? responseBody.usage?.cost, fallbackLevel });
  if (!upstream.ok) { const error = new Error("upstream-failed"); error.status = 502; error.receipt = receipt; throw error; }
  return { content: responseBody?.choices?.[0]?.message?.content, model: resolvedModel, receipt };
}

async function reflect(payload, requestBytes = 0) {
  const imageData = string(payload.imageData, MAX_BODY_BYTES);
  if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(imageData)) throw new Error("invalid-image");
  const { mood, profile, recent } = contextFrom(payload);
  const prompt = [
    "あなたは『Routeoff』の穏やかな伴走者です。添付画像について、見えない事実・人物属性・場所・感情を断定しません。",
    "日本語で、写真から読み取れる色、光、形、配置、質感などを一つだけ肯定的にコメントし、その人自身の発見を促す質問を一つ返します。",
    "コメントは90文字以内、質問は60文字以内。評価・助言・命令・SNS風の煽り・絵文字は不要です。個人情報は繰り返さず、プロフィールは質問の距離感を調整する参考にだけ使ってください。",
    `いま得たい気分: ${mood || "未選択"}`,
    `非公開プロフィール: ${JSON.stringify(profile)}`,
    `最近の採集（最大7件）: ${JSON.stringify(recent)}`,
    '必ず次のJSONだけを返してください: {"comment":"...","question":"..."}'
  ].join("\n");
  const result = await chat(prompt, imageData, 180, "photo-reflection", requestBytes, Math.floor((imageData.split(",")[1]?.length || 0) * 0.75));
  return { ...extractJson(result.content), model: result.model, receipt: result.receipt };
}

async function mission(payload, requestBytes = 0) {
  const { mood, profile, recent } = contextFrom(payload);
  const prompt = [
    "あなたは『Routeoff』の穏やかな伴走者です。利用者の気分と過去の採集に合わせ、5〜15分でできる小さな寄り道を一つ提案します。",
    "プロフィールは距離感を調整する参考にだけ使い、個人情報や属性を回答内で繰り返しません。安全で、場所や人物を特定しない、評価や達成を求めない提案にしてください。",
    "屋外版と室内版は同じ視点を保ちます。質問は写真を撮った後に自分の発見を言葉にするための、断定しない一問です。",
    `いま得たい気分: ${mood || "未選択"}`,
    `非公開プロフィール: ${JSON.stringify(profile)}`,
    `最近の採集（最大7件）: ${JSON.stringify(recent)}`,
    '必ず次のJSONだけを返してください: {"title":"...","instruction":"...","indoorInstruction":"...","question":"..."}'
  ].join("\n");
  const result = await chat(prompt, null, 260, "daily-mission", requestBytes, 0);
  return { ...extractMission(result.content), model: result.model, receipt: result.receipt };
}

loadLocalEnv();
const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/api/health") return sendJson(res, 200, { configured: Boolean(process.env.ORCAROUTER_API_KEY) });
  if (req.method === "POST" && req.url === "/api/reflection") {
    try { const raw = await readBody(req); return sendJson(res, 200, await reflect(JSON.parse(raw), Buffer.byteLength(raw))); }
    catch (error) { return sendJson(res, error.status || 400, { error: error.message === "not-configured" ? "AI接続はまだ設定されていません。" : "AIから一問を受け取れませんでした。", receipt: error.receipt }); }
  }
  if (req.method === "POST" && req.url === "/api/mission") {
    try { const raw = await readBody(req); return sendJson(res, 200, await mission(JSON.parse(raw), Buffer.byteLength(raw))); }
    catch (error) { return sendJson(res, error.status || 400, { error: error.message === "not-configured" ? "AI接続はまだ設定されていません。" : "AIから今日のお題を受け取れませんでした。", receipt: error.receipt }); }
  }
  if (req.method !== "GET" && req.method !== "HEAD") return sendJson(res, 405, { error: "method-not-allowed" });
  const requestPath = decodeURIComponent((req.url || "/").split("?")[0]);
  const filePath = path.resolve(ROOT, `.${requestPath === "/" ? "/index.html" : requestPath}`);
  if (!filePath.startsWith(`${ROOT}${path.sep}`) || path.basename(filePath).startsWith(".") || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return sendJson(res, 404, { error: "not-found" });
  res.writeHead(200, { "Content-Type": MIME_TYPES[path.extname(filePath)] || "application/octet-stream", "Cache-Control": "no-store" });
  if (req.method === "HEAD") return res.end();
  fs.createReadStream(filePath).pipe(res);
});
function openBrowser(url) {
  if (process.env.OPEN_BROWSER === "0") return;
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  execFile(command, args, () => {});
}

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`ポート${PORT}はすでに使われています。別のアプリを止めるか、PORT=8001 npm start を試してください。`);
  } else {
    console.error("ローカルサーバーを起動できませんでした。", error.message);
  }
  process.exitCode = 1;
});
server.listen(PORT, "127.0.0.1", () => {
  const url = `http://127.0.0.1:${PORT}`;
  console.log(`Routeoff: ${url}`);
  openBrowser(url);
});
