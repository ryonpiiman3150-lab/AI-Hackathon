"use strict";

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 8000);
const MAX_BODY_BYTES = 5 * 1024 * 1024;
const MIME_TYPES = { ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".png": "image/png" };

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

function extractJson(content) {
  const text = typeof content === "string" ? content : "";
  const candidate = text.match(/\{[\s\S]*\}/)?.[0] || text;
  const parsed = JSON.parse(candidate);
  const comment = string(parsed.comment, 180);
  const question = string(parsed.question, 120);
  if (!comment || !question) throw new Error("invalid-model-response");
  return { comment, question };
}

async function reflect(payload) {
  const imageData = string(payload.imageData, MAX_BODY_BYTES);
  if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(imageData)) throw new Error("invalid-image");
  const apiKey = process.env.ORCAROUTER_API_KEY;
  if (!apiKey) { const error = new Error("not-configured"); error.status = 503; throw error; }

  const mood = string(payload.mood, 40);
  const profile = payload.profile && typeof payload.profile === "object" ? {
    ageRange: string(payload.profile.ageRange, 20), role: string(payload.profile.role, 20), lifeState: string(payload.profile.lifeState, 30), mbti: string(payload.profile.mbti, 8)
  } : {};
  const recent = Array.isArray(payload.recent) ? payload.recent.slice(0, 7).map((entry) => ({ title: string(entry?.title, 60), answer: string(entry?.answer, 140), tags: Array.isArray(entry?.tags) ? entry.tags.map((tag) => string(tag, 24)).filter(Boolean).slice(0, 5) : [] })) : [];
  const prompt = [
    "あなたは『日常採集』の穏やかな伴走者です。添付画像について、見えない事実・人物属性・場所・感情を断定しません。",
    "日本語で、写真から読み取れる色、光、形、配置、質感などを一つだけ肯定的にコメントし、その人自身の発見を促す質問を一つ返します。",
    "コメントは90文字以内、質問は60文字以内。評価・助言・命令・SNS風の煽り・絵文字は不要です。個人情報は繰り返さず、プロフィールは質問の距離感を調整する参考にだけ使ってください。",
    `いま得たい気分: ${mood || "未選択"}`,
    `非公開プロフィール: ${JSON.stringify(profile)}`,
    `最近の採集（最大7件）: ${JSON.stringify(recent)}`,
    '必ず次のJSONだけを返してください: {"comment":"...","question":"..."}'
  ].join("\n");
  const endpoint = `${(process.env.ORCAROUTER_BASE_URL || "https://api.orcarouter.ai/v1").replace(/\/$/, "")}/chat/completions`;
  const upstream = await fetch(endpoint, {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: process.env.ORCAROUTER_MODEL || "openai/gpt-4o-mini", temperature: 0.7, max_tokens: 180, messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: imageData } }] }] })
  });
  if (!upstream.ok) { const error = new Error("upstream-failed"); error.status = 502; throw error; }
  const result = await upstream.json();
  return { ...extractJson(result?.choices?.[0]?.message?.content), model: process.env.ORCAROUTER_MODEL || "openai/gpt-4o-mini" };
}

loadLocalEnv();
const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/api/health") return sendJson(res, 200, { configured: Boolean(process.env.ORCAROUTER_API_KEY) });
  if (req.method === "POST" && req.url === "/api/reflection") {
    try { return sendJson(res, 200, await reflect(JSON.parse(await readBody(req)))); }
    catch (error) { return sendJson(res, error.status || 400, { error: error.message === "not-configured" ? "AI接続はまだ設定されていません。" : "AIから一問を受け取れませんでした。" }); }
  }
  if (req.method !== "GET" && req.method !== "HEAD") return sendJson(res, 405, { error: "method-not-allowed" });
  const requestPath = decodeURIComponent((req.url || "/").split("?")[0]);
  const filePath = path.resolve(ROOT, `.${requestPath === "/" ? "/index.html" : requestPath}`);
  if (!filePath.startsWith(`${ROOT}${path.sep}`) || path.basename(filePath).startsWith(".") || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return sendJson(res, 404, { error: "not-found" });
  res.writeHead(200, { "Content-Type": MIME_TYPES[path.extname(filePath)] || "application/octet-stream", "Cache-Control": "no-store" });
  if (req.method === "HEAD") return res.end();
  fs.createReadStream(filePath).pipe(res);
});
server.listen(PORT, "127.0.0.1", () => console.log(`日常採集: http://127.0.0.1:${PORT}`));
