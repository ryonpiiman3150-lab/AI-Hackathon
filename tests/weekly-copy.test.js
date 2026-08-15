"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { WEEKLY_TEMPERATURE, buildWeeklyPrompt, validateWeeklyReport } = require("../weekly-reflection");

const ROOT = path.join(__dirname, "..");

test("週次プロンプトは3行の役割と自然な文体を明示する", () => {
  const prompt = buildWeeklyPrompt([
    { id: "2026-08-13", dateKey: "2026-08-13", answer: "葉の重なりが気になった。", observations: ["葉が重なっている。"] },
    { id: "2026-08-12", dateKey: "2026-08-12", answer: "足元の影で立ち止まった。", observations: ["地面に影がある。"] }
  ]);

  assert.match(prompt, /1行目.+共通する傾向/);
  assert.match(prompt, /2行目.+具体的な気づきや行動/);
  assert.match(prompt, /3行目.+肯定的にまとめ/);
  assert.match(prompt, /"role":"trend"/);
  assert.match(prompt, /"role":"action"/);
  assert.match(prompt, /"role":"positive"/);
  assert.match(prompt, /入力文をそのまま並べない/);
  assert.match(prompt, /詩的な比喩や抽象的な言い回しを避け/);
  assert.match(prompt, /5〜15分で実行できる具体的な行動/);
  assert.match(prompt, /理由は今週の記録と直接結び付け/);
  assert.equal(WEEKLY_TEMPERATURE, 0.3);
});

test("入力の丸写しや曖昧な定型句をAI結果として採用しない", () => {
  const entries = [
    { id: "2026-08-13", answer: "葉の重なりに、小さな季節を見つけた。", observations: ["葉が重なっている。"] },
    { id: "2026-08-12", answer: "足元の影で立ち止まった。", observations: ["地面に影がある。"] }
  ];
  const unnatural = {
    lines: [
      { role: "trend", text: "葉の重なりに、小さな季節を見つけた。", evidenceIds: ["2026-08-13"] },
      { role: "action", text: "足元の影が、時間をゆっくりにしてくれた。", evidenceIds: ["2026-08-12"] },
      { role: "positive", text: "窓の外の静けさを、一枚に残しておく。", evidenceIds: ["2026-08-13"] }
    ],
    nextDetour: { title: "新しい視点での散歩", reason: "新しい視点は、新たな発見をもたらすかもしれません。", instruction: "歩く。", indoorInstruction: "見る。", question: "何が見えましたか？", sourceIds: ["2026-08-13"] }
  };
  const natural = {
    lines: [
      { role: "trend", text: "今週は、葉や光に目を向けた写真が多くありました。", evidenceIds: ["2026-08-13", "2026-08-12"] },
      { role: "action", text: "足元や窓の外で立ち止まった記録が残っています。", evidenceIds: ["2026-08-12"] },
      { role: "positive", text: "写真と一緒に、そのとき気づいたことも書けています。", evidenceIds: ["2026-08-13"] }
    ],
    nextDetour: { title: "目線を下げて歩く", reason: "足元を写した記録があったので、次は高さを変えて見てみます。", instruction: "5分歩き、低い位置から一枚撮る。", indoorInstruction: "5分間、座った高さから一枚撮る。", question: "高さを変えると何が見えましたか？", sourceIds: ["2026-08-12"] }
  };
  const vagueDetour = {
    ...natural,
    nextDetour: { ...natural.nextDetour, reason: "今週の記録を踏まえました。", instruction: "外を見る。", indoorInstruction: "部屋を見る。" }
  };
  const accidentalMatchDetour = {
    ...natural,
    nextDetour: { ...natural.nextDetour, reason: "続ける意味があり、今週の記録から選びました。" }
  };
  const genericLines = {
    ...natural,
    lines: [
      { role: "trend", text: "写真を何枚か残しました。", evidenceIds: ["2026-08-13", "2026-08-12"] },
      { role: "action", text: "いくつかの記録があります。", evidenceIds: ["2026-08-12"] },
      { role: "positive", text: "今週も記録できています。", evidenceIds: ["2026-08-13"] }
    ]
  };

  assert.throws(() => validateWeeklyReport(unnatural, entries), /unnatural-weekly-copy/);
  assert.throws(() => validateWeeklyReport(vagueDetour, entries), /invalid-weekly-detour/);
  assert.throws(() => validateWeeklyReport(accidentalMatchDetour, entries), /invalid-weekly-detour/);
  assert.throws(() => validateWeeklyReport(genericLines, entries), /invalid-weekly-lines/);
  assert.doesNotThrow(() => validateWeeklyReport(natural, entries));
});

test("My Routeの通常画面は技術用語より利用者の言葉を使う", () => {
  const app = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const copy = `${app}\n${html}`;

  for (const oldCopy of ["根拠を見る", "承認済みの根拠だけでAI更新", "週次AIの処理レシート", "この寄り道を次にする"]) {
    assert.doesNotMatch(copy, new RegExp(oldCopy));
  }
  for (const newCopy of ["もとになった記録", "AIで今週をまとめる", "AI利用情報", "このお題で寄り道する"]) {
    assert.match(copy, new RegExp(newCopy));
  }
  assert.match(app, /今週は、\$\{label\}に目を向けた写真が\$\{taggedEntries\.length\}枚ありました/);
  assert.match(app, /\$\{wordEntries\.length\}枚に、そのとき気づいたことを書いています/);
  assert.doesNotMatch(app, /この1週間は、\$\{entries\.length\}枚の写真を残しました/);
  assert.match(app, /WEEKLY_COPY_VERSION/);
  assert.match(app, /weeklyFingerprint\(entries\).*WEEKLY_COPY_VERSION/);
});

test("旧称の採集帳をMy Routeへ統一している", () => {
  const app = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const copy = `${app}\n${html}`;

  assert.doesNotMatch(copy, /採集帳/);
  assert.match(html, /My Routeに保存する/);
  assert.match(app, /My Routeに保存しました/);
  assert.match(app, /My Routeをすべてリセットしますか/);
  assert.match(app, /My Routeをリセットしました/);
});
