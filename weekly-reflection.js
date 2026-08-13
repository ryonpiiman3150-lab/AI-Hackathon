"use strict";

const WEEKLY_TEMPERATURE = 0.3;
const DISALLOWED_WEEKLY_PHRASES = [
  "そっと",
  "かもしれません",
  "新しい視点",
  "新たな発見",
  "次の視点",
  "素敵",
  "あなたらしい",
  "今週の見方",
  "してくれ"
];
const GENERIC_EVIDENCE_BIGRAMS = new Set(["写真", "記録", "今週", "言葉", "内容", "一枚", "その", "こと", "もの", "ます", "した", "して", "いる", "ある", "です", "から", "ので"]);

function normalizeCopy(value) {
  return String(value || "").replace(/[\s。、，．「」『』“”'\"]/g, "");
}

function minutesIn(text) {
  const normalized = String(text || "").replace(/[０-９]/g, (digit) => String("０１２３４５６７８９".indexOf(digit)));
  return [...normalized.matchAll(/(\d{1,2})\s*分/g)].map((match) => Number(match[1]));
}

function evidenceBigrams(entries) {
  const terms = (entries || []).flatMap((entry) => [entry?.answer, ...(entry?.observations || [])]).map(normalizeCopy).flatMap((text) => {
    const characters = [...text];
    return characters.slice(0, -1).map((character, index) => character + characters[index + 1]);
  });
  return [...new Set(terms.filter((term) => !GENERIC_EVIDENCE_BIGRAMS.has(term)))];
}

function validateWeeklyReport(report, entries) {
  const lineTexts = (report?.lines || []).map((line) => String(line?.text || ""));
  const nextTexts = report?.nextDetour ? ["title", "instruction", "indoorInstruction", "question", "reason"].map((key) => String(report.nextDetour[key] || "")) : [];
  const generatedTexts = [...lineTexts, ...nextTexts];
  const sourceTexts = (entries || []).flatMap((entry) => [entry?.answer, ...(entry?.observations || [])]).map(normalizeCopy).filter((text) => text.length >= 8);
  const hasDisallowedPhrase = generatedTexts.some((text) => DISALLOWED_WEEKLY_PHRASES.some((phrase) => text.includes(phrase)));
  const copiesSource = lineTexts.some((text) => sourceTexts.includes(normalizeCopy(text)));
  if (hasDisallowedPhrase || copiesSource) throw new Error("unnatural-weekly-copy");
  const next = report?.nextDetour || {};
  const instructionMinutes = [next.instruction, next.indoorInstruction].map(minutesIn);
  const hasValidDuration = instructionMinutes.every((values) => values.length && values.every((minutes) => minutes >= 5 && minutes <= 15));
  const sourceIds = new Set(next.sourceIds || []);
  const referencedEntries = (entries || []).filter((entry) => sourceIds.has(entry.id));
  const reason = normalizeCopy(next.reason);
  const hasSpecificReason = evidenceBigrams(referencedEntries).some((term) => reason.includes(term));
  if (!hasValidDuration || normalizeCopy(next.instruction).length < 10 || normalizeCopy(next.indoorInstruction).length < 10 || !hasSpecificReason) throw new Error("invalid-weekly-detour");
  return report;
}

function buildWeeklyPrompt(entries) {
  return [
    "あなたは『Routeoff』の週次編集者です。利用者が確認または修正した写真の内容と、その日に書いた言葉だけを使います。",
    "感情、場所、人物属性、出来事、因果関係を推測しません。結論を先に、普段の会話で使う自然な日本語で、各行60文字以内にします。",
    "入力文をそのまま並べないでください。複数の記録を見比べ、3行を次の役割に分けます。1行目：複数の記録に共通する傾向。2行目：記録から分かる具体的な気づきや行動。3行目：できていたことを根拠の範囲で肯定的にまとめる。",
    `詩的な比喩や抽象的な言い回しを避け、次の定型句や言い回しを使いません：「${DISALLOWED_WEEKLY_PHRASES.join("」「")}」。大げさに褒めず、読んですぐ意味が分かる文にします。`,
    "各行に、もとにした入力IDを必ず付けます。複数の記録に共通する傾向には、可能な限り2件以上のIDを付けます。",
    "振り返りをもとに、5〜15分で実行できる具体的な行動を、次の寄り道として一つ提案します。屋外と室内の手順には、それぞれ所要時間を『5分』『10分』『15分』のいずれかで明記します。題名は行動が分かる言葉にします。理由は今週の記録と直接結び付け、参照する記録に出てくる具体的な物や行動を一つ以上そのまま含めます。一般論だけにしません。理由と提案にも入力IDを付けます。",
    `確認済みの記録: ${JSON.stringify(entries)}`,
    '必ず次のJSONだけを返してください: {"lines":[{"text":"...","evidenceIds":["id"]},{"text":"...","evidenceIds":["id"]},{"text":"...","evidenceIds":["id"]}],"nextDetour":{"title":"...","instruction":"...","indoorInstruction":"...","question":"...","reason":"...","sourceIds":["id"]}}'
  ].join("\n");
}

module.exports = { WEEKLY_TEMPERATURE, buildWeeklyPrompt, validateWeeklyReport };
