(() => {
  "use strict";

  const DB_NAME = "nichijo-shusai", DB_VERSION = 3, LEGACY_KEY = "nichijo-shusai-cards-v1", SESSION_KEY = "nichijo-shusai-session-v1", WEEKLY_COPY_VERSION = "natural-ja-v1";
  const TEST_USERS = [
    { id: "demo-user-2", password: "demo-user-2", name: "デモユーザー2" },
    { id: "demo-user-1", password: "demo-user-1", name: "デモユーザー1" }
  ];
  const PRESENTATION_USER = { id: "presentation", name: "審査デモ" };
  const MOOD_NEIGHBORS = { calm: ["refresh", "surprise"], refresh: ["calm", "adventure"], adventure: ["refresh", "surprise"], surprise: ["calm", "adventure"] };
  const SEED_COPY = [
    "朝の光がいつもよりやわらかかった。",
    "道端の赤い色が気になって、立ち止まった。",
    "重なった葉の色が少し変わっていた。",
    "足元の影が長く伸びていた。",
    "窓の外が静かだったので、写真に残した。",
    "遠回りしたら、見慣れない看板を見つけた。",
    "棚の奥に空いた場所があった。",
    "しゃがんで見ると、地面の模様がよく見えた。",
    "夕方の空がオレンジ色になっていた。",
    "普段なら撮らないものを写真に残せた。"
  ];
  const TAG_FACTS = { light: "明るい部分と影が隣り合っている。", color: "画面の中に目を引く色がある。", traces: "時間の経過を感じる跡が写っている。", nature: "植物や季節を感じる形が写っている。", people: "人の営みを思わせる物が配置されている。", space: "物と物の間に空いた場所がある。", sound: "音を連想できる形や動きが写っている。", detail: "小さな形や模様が繰り返されている。" };
  const TAG_LABELS = { light:"光",color:"色",traces:"時間の気配",nature:"季節",people:"人の気配",space:"すき間",sound:"音",detail:"小さな違い" };
  const $ = (id) => document.getElementById(id);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const data = window.NICHIJO_DATA || { moods: [], missions: [], reportTemplates: {} };
  const state = { screen: "today", dateKey: localDateKey(), draft: null, pending: null, objectUrl: null, collectionUrls: [], feedUrls: [], feedPosts: [], aiReceipts: [], weeklyReport: null, weeklyEntries: [], saving: false, costProbeLoading: false, finishingStale: false, user: null, profile: null, aiStatus: "", presentationIndex: -1 };
  let db;

  function localDateKey(d = new Date()) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
  function labelDate(k = localDateKey()) { const [y,m,d]=k.split("-").map(Number); return new Intl.DateTimeFormat("ja-JP",{year:"numeric",month:"long",day:"numeric",weekday:"short"}).format(new Date(y,m-1,d)); }
  const esc = (v="") => String(v).replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
  function toast(message) { const el=$("toast"); if (!el) return; el.textContent=message; el.classList.add("is-visible"); clearTimeout(toast.t); toast.t=setTimeout(()=>el.classList.remove("is-visible"),3000); }
  // 旧形式のDBにも、ログイン後に必要なユーザー別ストアを追加する。既存の記録は削除しない。
  function openDB() { return new Promise((resolve,reject)=>{ const r=indexedDB.open(DB_NAME,DB_VERSION); r.onupgradeneeded=()=>{const d=r.result; if(!d.objectStoreNames.contains("entries"))d.createObjectStore("entries",{keyPath:"dateKey"}); if(!d.objectStoreNames.contains("drafts"))d.createObjectStore("drafts",{keyPath:"dateKey"}); if(!d.objectStoreNames.contains("meta"))d.createObjectStore("meta",{keyPath:"key"}); if(!d.objectStoreNames.contains("userEntries"))d.createObjectStore("userEntries",{keyPath:"id"}); if(!d.objectStoreNames.contains("userDrafts"))d.createObjectStore("userDrafts",{keyPath:"id"});}; r.onsuccess=()=>{const database=r.result;database.onversionchange=()=>database.close();resolve(database);}; r.onerror=()=>reject(r.error); r.onblocked=()=>reject(new Error("database-upgrade-blocked")); }); }
  function tx(store, mode, fn) { return new Promise((resolve,reject)=>{ const t=db.transaction(store,mode), s=t.objectStore(store); let result; try { result=fn(s); } catch(e){reject(e);return;} t.oncomplete=()=>resolve(result); t.onerror=()=>reject(t.error); }); }
  const rawGet = (s,k) => new Promise((resolve,reject)=>{const r=db.transaction(s).objectStore(s).get(k);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  const rawAll = (s) => new Promise((resolve,reject)=>{const r=db.transaction(s).objectStore(s).getAll();r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error);});
  const rawPut = (s,v) => tx(s,"readwrite",x=>x.put(v));
  const rawDel = (s,k) => tx(s,"readwrite",x=>x.delete(k));
  const scoped = (s) => ["entries", "drafts"].includes(s) && Boolean(state.user);
  const scopedStore = (s) => s === "entries" ? "userEntries" : "userDrafts";
  const scopedId = (key) => `${state.user.id}:${key}`;
  const get = (s,k) => scoped(s) ? rawGet(scopedStore(s), scopedId(k)) : rawGet(s,k);
  const all = async (s) => scoped(s) ? (await rawAll(scopedStore(s))).filter((item) => item.userId === state.user.id) : rawAll(s);
  const put = (s,v) => scoped(s) ? rawPut(scopedStore(s), { ...v, id: scopedId(v.dateKey), userId: state.user.id }) : rawPut(s,v);
  const del = (s,k) => scoped(s) ? rawDel(scopedStore(s), scopedId(k)) : rawDel(s,k);
  function dateDaysAgo(days) { const date = new Date(); date.setHours(12, 0, 0, 0); date.setDate(date.getDate() - days); return localDateKey(date); }
  async function seedDemoEntries() { const marker = await get("meta", "demo-logs-v1"); if (marker?.done) return; for (const [userIndex, user] of TEST_USERS.entries()) { for (let offset = 0; offset < 10; offset += 1) { const dateKey = dateDaysAgo(offset); const id = `${user.id}:${dateKey}`; if (await rawGet("userEntries", id)) continue; const mission = data.missions[(offset + userIndex * 3) % data.missions.length]; const createdAt = new Date(`${dateKey}T${String(9 + userIndex).padStart(2, "0")}:00:00`).getTime(),fact=TAG_FACTS[mission.perspectiveTags?.[0]]||"写真の中に小さな形が写っている。"; await rawPut("userEntries", { id, userId: user.id, dateKey, kind: "photo", mood: mission.moodTypes[0], missionId: mission.id, noveltyType: mission.noveltyType, tags: mission.perspectiveTags, observations:[{id:`demo-${user.id}-${dateKey}`,originalText:fact,text:fact,status:"accepted",source:"demo"}],analysisEligible: true, mode: offset % 3 === 0 ? "indoor" : "outdoor", answer: SEED_COPY[(offset + userIndex * 2) % SEED_COPY.length], question: mission.question, title: mission.title, instruction: mission.instruction, photoBlob: null, sampleVisual: ["window", "street", "plant"][offset % 3], createdAt, updatedAt: createdAt, legacy: false, seeded: true }); } } await put("meta", { key: "demo-logs-v1", done: true, updatedAt: Date.now() }); }
  async function resetDemoEntries() { const entries = await rawAll("userEntries"); await Promise.all(entries.filter((entry) => entry.seeded).map((entry) => rawDel("userEntries", entry.id))); await rawDel("meta", "demo-logs-v1"); await seedDemoEntries(); }
  async function preparePresentationData() {
    const [entries,drafts]=await Promise.all([rawAll("userEntries"),rawAll("userDrafts")]);
    await Promise.all(entries.filter(entry=>entry.userId===PRESENTATION_USER.id).map(entry=>rawDel("userEntries",entry.id)));
    await Promise.all(drafts.filter(draft=>draft.userId===PRESENTATION_USER.id).map(draft=>rawDel("userDrafts",draft.id)));
    await Promise.all([rawDel("meta",`weekly-report:${PRESENTATION_USER.id}`),rawDel("meta",`ai-receipts:${PRESENTATION_USER.id}`)]);
    for(let offset=1;offset<=7;offset+=1){const dateKey=dateDaysAgo(offset),mission=data.missions[(offset-1)%data.missions.length],createdAt=new Date(`${dateKey}T10:00:00`).getTime(),fact=TAG_FACTS[mission.perspectiveTags?.[0]]||"写真の中に小さな形が写っている。";await rawPut("userEntries",{id:`${PRESENTATION_USER.id}:${dateKey}`,userId:PRESENTATION_USER.id,dateKey,kind:"photo",mood:mission.moodTypes[0],missionId:mission.id,noveltyType:mission.noveltyType,tags:mission.perspectiveTags,observations:[{id:`presentation-${dateKey}`,originalText:fact,text:fact,status:"accepted",source:"demo-approved"}],analysisEligible:true,mode:offset%3===0?"indoor":"outdoor",answer:SEED_COPY[offset-1],question:mission.question,title:mission.title,instruction:mission.instruction,photoBlob:null,sampleVisual:["window","street","plant"][(offset-1)%3],createdAt,updatedAt:createdAt,legacy:false,seeded:true});}
    await rawPut("meta",{key:`profile:${PRESENTATION_USER.id}`,userId:PRESENTATION_USER.id,displayName:"審査デモ",visibility:"private",onboardingSeen:true,updatedAt:Date.now()});
  }
  function confirmDialog(title, body) { return new Promise(resolve=>{ const d=$("confirm-dialog"); if(!d){resolve(window.confirm(`${title}\n${body}`));return;} let settled=false; const done=v=>{if(settled)return;settled=true;d.removeEventListener("cancel",cancel);d.close();resolve(v);},cancel=e=>{e.preventDefault();done(false)}; $("confirm-title").textContent=title; $("confirm-body").textContent=body; $("confirm-accept").onclick=()=>done(true); $("confirm-cancel").onclick=()=>done(false); d.addEventListener("cancel",cancel); d.showModal(); }); }
  function focusHeading() { requestAnimationFrame(()=>{const h=$("screen-"+state.screen)?.querySelector("h1"); if(h){h.setAttribute("tabindex","-1");h.focus({preventScroll:true});}}); }
  function navigate(name) {
    if (name === "record" && !state.draft?.photoBlob) return;
    if (!['record', 'card'].includes(name) && state.objectUrl) {
      URL.revokeObjectURL(state.objectUrl);
      state.objectUrl = null;
    }
    if (name !== "collection") {
      state.collectionUrls.forEach(URL.revokeObjectURL);
      state.collectionUrls = [];
    }
    if (!["feed", "community-profile"].includes(name)) {
      state.feedUrls.forEach(URL.revokeObjectURL);
      state.feedUrls = [];
    }
    state.screen = name;
    $$(".screen").forEach((screen) => {
      const active = screen.id === `screen-${name}`;
      screen.hidden = !active;
      screen.classList.toggle("is-active", active);
    });
    $$('[data-screen-link]').forEach((item) => {
      const active = item.dataset.screenLink === name;
      item.classList.toggle("is-active", active);
      item.toggleAttribute("aria-current", active);
    });
    scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    focusHeading();
  }
  function missionById(id){return data.missions.find(m=>m.id===id);}
  function hash(str){let h=2166136261;for(const c of str){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
  async function pickMission(mood, suggestionIndex=0) { const recent=(await all("entries")).filter(e=>e.kind==="photo"&&!e.legacy).sort((a,b)=>b.createdAt-a.createdAt), ids=new Set(recent.slice(0,7).map(e=>e.missionId)), nov=new Set(recent.slice(0,2).map(e=>e.noveltyType)); let pool=mood==="surprise"||mood==="おまかせ"?data.missions:data.missions.filter(m=>m.moodTypes.includes(mood)); let candidates=pool.filter(m=>!ids.has(m.id)&&!nov.has(m.noveltyType)); if(!candidates.length)candidates=pool.filter(m=>!ids.has(m.id)); if(!candidates.length)candidates=pool; return candidates[hash(`${state.dateKey}:${mood}:${suggestionIndex}`)%candidates.length]; }
  async function saveDraft(){ if(!state.draft)return; try{await put("drafts",state.draft);}catch(e){toast("下書きを保存できませんでした。容量を確認して再試行してください。");} }
  async function ensureCurrentDate() {
    if (state.finishingStale) return true;
    const current = localDateKey();
    if (state.dateKey === current) return true;

    const previousDraft = state.draft;
    if (previousDraft?.photoBlob) {
      state.stale = previousDraft;
      $("stale-draft-banner").hidden = false;
    } else if (previousDraft) {
      await del("drafts", previousDraft.dateKey);
    }

    state.dateKey = current;
    state.draft = await get("drafts", current);
    state.pending = null;
    await renderToday();
    navigate("today");
    toast(previousDraft?.photoBlob ? "昨日の一枚を仕上げるか、破棄してください。" : "日付が変わったため、今日の寄り道を用意しました。");
    return false;
  }
  async function recentContext(){return (await all("entries")).filter(entry=>entry.kind==="photo").sort((a,b)=>b.createdAt-a.createdAt).slice(0,7).map(entry=>({title:entry.title,answer:entry.answer,tags:entry.tags}));}
  function privateProfileContext(include = false) { if (!include || !state.profile) return {}; const { ageRange = "", role = "", lifeState = "", mbti = "" } = state.profile; return { ageRange, role, lifeState, mbti }; }
  function receiptLabel(receipt) { if(receipt?.simulation)return "固定文へ切替（テスト）";return ({ success: "AI処理完了", "local-fallback": "固定文へ切替", "user-skipped": "AI送信なし" })[receipt?.status] || receipt?.status || "未記録"; }
  function formatBytes(bytes = 0) { const value=Math.max(0,Number(bytes)||0);return value>=1024*1024?`${(value/1024/1024).toFixed(2)} MB`:value>=1024?`${Math.round(value/1024)} KB`:`${Math.round(value)} B`; }
  function formatCost(cost, kind) { if (!Number.isFinite(Number(cost))) return "算出なし"; const value = Number(cost); return `$${value < 0.01 ? value.toFixed(6) : value.toFixed(4)}${kind === "estimated-from-measured-tokens" ? "（推定）" : ""}`; }
  function renderReceipt(id, receipt) { const box=$(id);if(!box)return;box.hidden=!receipt;if(!receipt)return;const body=box.querySelector("[data-receipt-body]");if(!body)return;body.innerHTML=`<dl><div><dt>結果</dt><dd>${esc(receiptLabel(receipt))}</dd></div><div><dt>用途</dt><dd>${esc(receipt.purpose||"-")}</dd></div><div><dt>モデル</dt><dd>${esc(receipt.resolvedModel||receipt.requestedModel||"未送信")}</dd></div><div><dt>送信量</dt><dd>${esc(formatBytes(receipt.requestBytes))}（画像 ${esc(formatBytes(receipt.imageBytes))}）</dd></div><div><dt>トークン</dt><dd>${Number(receipt.totalTokens)||0}（入力 ${Number(receipt.promptTokens)||0} / 出力 ${Number(receipt.completionTokens)||0}）</dd></div><div><dt>応答時間</dt><dd>${Number(receipt.latencyMs)||0} ms</dd></div><div><dt>コスト</dt><dd>${esc(formatCost(receipt.costUsd,receipt.costKind))}</dd></div></dl><p>画像本文・プロンプト・応答本文はレシートに保存しません。</p>`;}
  async function rememberReceipt(receipt){if(!receipt||!state.user)return;const key=`ai-receipts:${state.user.id}`,prior=await rawGet("meta",key),receipts=[...(prior?.receipts||[]),receipt].slice(-50);state.aiReceipts=receipts;await rawPut("meta",{key,userId:state.user.id,receipts,updatedAt:Date.now()});}
  function skippedReceipt(purpose,imageBytes=0){return{id:`${purpose}-${Date.now()}-skipped`,purpose,status:"user-skipped",requestedModel:"未送信",resolvedModel:"未送信",requestBytes:0,imageBytes,promptTokens:0,completionTokens:0,totalTokens:0,latencyMs:0,costUsd:null,costKind:"unavailable",costBasis:"AIへ送信していません",createdAt:Date.now()};}
  function renderJudgePanel(){const panel=$("judge-panel");if(!panel)return;const visible=state.user?.id===PRESENTATION_USER.id;panel.hidden=!visible;if(!visible)return;const receipts=state.aiReceipts||[],measured=receipts.filter(receipt=>receipt.status!=="user-skipped"&&!receipt.simulation),simulated=receipts.filter(receipt=>receipt.simulation),success=measured.filter(receipt=>receipt.status==="success").length,fallbacks=measured.filter(receipt=>receipt.status==="local-fallback").length,skipped=receipts.filter(receipt=>receipt.status==="user-skipped").length,totalBytes=measured.reduce((sum,receipt)=>sum+(Number(receipt.requestBytes)||0),0),totalTokens=measured.reduce((sum,receipt)=>sum+(Number(receipt.totalTokens)||0),0),latencies=measured.filter(receipt=>Number(receipt.latencyMs)>0),averageLatency=latencies.length?Math.round(latencies.reduce((sum,receipt)=>sum+Number(receipt.latencyMs),0)/latencies.length):0,costs=measured.filter(receipt=>receipt.costUsd!==null&&receipt.costUsd!==undefined&&Number.isFinite(Number(receipt.costUsd))).map(receipt=>Number(receipt.costUsd)),totalCost=costs.reduce((sum,cost)=>sum+cost,0),models=[...new Set(measured.map(receipt=>receipt.resolvedModel||receipt.requestedModel).filter(Boolean))];$("receipt-summary").innerHTML=`<p class="receipt-status-line">実測：成功 ${success}件・フォールバック ${fallbacks}件・送信しない選択 ${skipped}件${simulated.length?` ／ テスト ${simulated.length}件`:""}</p><div class="receipt-metrics"><div><strong>${measured.length}</strong><span>実測AI処理</span></div><div><strong>${esc(models.join(" / ")||"未計測")}</strong><span>利用モデル</span></div><div><strong>${esc(formatBytes(totalBytes))}</strong><span>外部送信量</span></div><div><strong>${totalTokens}</strong><span>実測token</span></div><div><strong>${averageLatency?`${averageLatency} ms`:"未計測"}</strong><span>平均応答</span></div><div><strong>${costs.length?esc(formatCost(totalCost,"estimated-from-measured-tokens")):"未計測"}</strong><span>実測token基準</span></div></div>`;const log=$("receipt-log");log.innerHTML=receipts.length?receipts.slice(-6).reverse().map(receipt=>`<article class="${receipt.simulation?"is-simulation":""}"><div><span class="receipt-state receipt-state-${esc(receipt.status)}">${esc(receiptLabel(receipt))}</span><time>${new Intl.DateTimeFormat("ja-JP",{hour:"2-digit",minute:"2-digit",second:"2-digit"}).format(new Date(receipt.createdAt||Date.now()))}</time></div><h3>${esc(receipt.purpose||"AI処理")}</h3><dl><div><dt>モデル</dt><dd>${esc(receipt.resolvedModel||receipt.requestedModel||"未送信")}</dd></div><div><dt>外部送信量</dt><dd>${esc(formatBytes(receipt.requestBytes))}</dd></div><div><dt>応答</dt><dd>${Number(receipt.latencyMs)||0} ms</dd></div><div><dt>コスト</dt><dd>${esc(formatCost(receipt.costUsd,receipt.costKind))}</dd></div></dl></article>`).join(""):"<p class=\"empty-receipt\">実測レシートはまだありません。固定文テストまたはフォールバック再現を実行すると、ここに追加されます。</p>";const button=$("run-cost-probe");button.disabled=state.costProbeLoading;button.textContent=state.costProbeLoading?"AIを実測中…":"固定文だけでAIを実測";}
  async function runCostProbe(){if(state.costProbeLoading||!await confirmDialog("固定プロンプトでAIを1回実行しますか？","送るのは機能確認用の固定文だけです。写真・記録・プロフィール・名前は含みません。API利用料が発生します。"))return;state.costProbeLoading=true;$("cost-probe-status").textContent="固定文だけを送り、token・応答時間・推定コストを計測しています…";renderJudgePanel();let receipt=null;try{const response=await fetch("/api/cost-probe",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"}),body=await response.json();receipt=body.receipt||null;if(receipt)await rememberReceipt(receipt);if(!response.ok||!body.ok)throw new Error(body.error||"cost-probe-failed");$("cost-probe-status").textContent="実AIの処理レシートを記録しました。推定コストは実測tokenに設定単価を掛けた値です。";}catch{$("cost-probe-status").textContent=receipt?.status==="local-fallback"?"AIへ接続できず、固定文へのフォールバックと処理レシートを記録しました。":"AI実測を完了できませんでした。アプリ本体は固定文で続けられます。";}finally{state.costProbeLoading=false;renderJudgePanel();}}
  async function simulateFallback(){let receipt=null;try{const response=await fetch("/api/cost-probe",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mode:"forced-fallback"})}),body=await response.json();receipt=body.receipt||null;if(receipt)await rememberReceipt(receipt);if(response.ok)throw new Error("forced-fallback-not-triggered");$("cost-probe-status").textContent="テストフックでサーバーの失敗処理を通し、外部送信0 Bで固定文へ切り替わることを確認しました。";}catch{$("cost-probe-status").textContent=receipt?"サーバーのフォールバック処理を確認しました。":"フォールバックテストを実行できませんでした。";}renderJudgePanel();}
  function draftMission(d=state.draft){const fixed=missionById(d?.missionId)||{};return {...fixed,...(d?.aiMission||{})};}
  async function chooseProposal(index=0) { if(!await ensureCurrentDate())return; const mood=$("mood-form")?.querySelector('input[name="mood"]:checked')?.value||state.draft?.mood; if(!mood){toast("これから得たい気分をひとつ選んでください。");return;} const m=await pickMission(mood,index), requestId=Date.now(); state.draft={dateKey:state.dateKey,mood,missionId:m.id,suggestionIndex:index,mode:"outdoor",status:"proposal",answer:"",missionRequestId:requestId,missionLoading:true,missionStatus:"あなたの採集に合わせて、今日のお題を考えています…",startedAt:Date.now(),updatedAt:Date.now()}; await saveDraft(); renderProposal(); personalizeMission(requestId); }
  async function personalizeMission(requestId){let receipt=null;try{const response=await fetch("/api/mission",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mood:state.draft?.mood,profile:{},recent:await recentContext()})});const body=await response.json();receipt=body.receipt||null;if(!response.ok||!body.title||!body.instruction||!body.indoorInstruction||!body.question)throw new Error(body.error||"AIから今日のお題を受け取れませんでした。");if(state.draft?.missionRequestId!==requestId)return;state.draft.aiMission={title:body.title,instruction:body.instruction,indoorInstruction:body.indoorInstruction,question:body.question,model:body.model};state.draft.missionStatus="気分と最近の記録に合わせた、今日のお題が届きました。";}catch{if(state.draft?.missionRequestId!==requestId)return;state.draft.missionStatus="固定のお題で続けられます。";}finally{if(state.draft?.missionRequestId!==requestId)return;if(receipt){state.draft.missionReceipt=receipt;await rememberReceipt(receipt);}state.draft.missionLoading=false;state.draft.updatedAt=Date.now();await saveDraft();if(state.draft.status==="proposal")renderProposal();else if(state.draft.status==="active")renderActive();}}
  async function renderToday() {
    const date = $("today-date");
    if (date) {
      date.textContent = labelDate(state.dateKey);
      date.dateTime = state.dateKey;
    }

    const complete = $("day-complete");
    const entry = await get("entries", state.dateKey);
    if (!complete) return;

    if (entry) {
      $("mood-step").hidden = true;
      $("proposal-step").hidden = true;
      $("active-step").hidden = true;
      complete.hidden = false;

      if (entry.kind === "blank") {
        complete.innerHTML = `<h2>今日は余白にしました。</h2><p>また見つけたくなったら、ここから始められます。</p><button type="button" class="button button-primary" id="restart-from-blank">やっぱり採集する</button>`;
        $("restart-from-blank").addEventListener("click", () => {
          state.draft = null;
          complete.hidden = true;
          complete.innerHTML = "";
          $("mood-form").querySelectorAll('input[name="mood"]').forEach((input) => { input.checked = false; });
          $("mood-step").hidden = false;
        });
        return;
      }

      const canEdit = Boolean(entry.photoBlob && entry.missionId);
      complete.innerHTML = `<h2>今日の景色は、My Routeの中に。</h2><p>持ち帰った一枚と余韻を、いつでも見返せます。</p><button type="button" class="button button-primary" id="view-collection">My Routeで見る</button>${canEdit ? '<button type="button" class="text-button" id="edit-entry">この記録を編集する</button>' : ""}`;
      $("view-collection").addEventListener("click", async () => {
        await renderCollection();
        navigate("collection");
      });
      $("edit-entry")?.addEventListener("click", async () => {
        state.draft = {
          dateKey: entry.dateKey,
          mood: entry.mood,
          missionId: entry.missionId,
          suggestionIndex: 0,
          mode: entry.mode || "outdoor",
          status: "record",
          photoBlob: entry.photoBlob,
          answer: entry.answer || "",
          aiReflection: entry.aiComment || entry.aiReceipt?.status === "success" ? { comment: entry.aiComment || "", question: entry.question || "" } : null,
          observations: (entry.observations || []).map((item) => ({ ...item })),
          reflectionReceipt: entry.aiReceipt || null,
          startedAt: entry.createdAt,
          updatedAt: Date.now()
        };
        await saveDraft();
        renderRecord();
        navigate("record");
      });
      return;
    }

    complete.hidden = true;
    complete.innerHTML = "";
    if (!state.draft) {
      $("mood-step").hidden = false;
      $("proposal-step").hidden = true;
      $("active-step").hidden = true;
    } else if (state.draft.status === "proposal") {
      renderProposal();
    } else {
      renderActive();
    }
  }
  function renderProposal(){const d=state.draft,m=draftMission(d); if(!m.title)return; $("proposal-mood").textContent=(data.moods.find(x=>(x.id||x.value)===d.mood)?.label)||d.mood; $("proposal-source").textContent=d.aiMission?"AI":"固定"; const status=$("mission-ai-status");status.textContent=d.missionStatus||"";status.hidden=!d.missionStatus;renderReceipt("mission-receipt",d.missionReceipt); $("mission-duration").textContent=`${m.durationMinutes||10}分`; $("mission-mode").textContent=d.mode==="indoor"?"室内版":"屋外"; $("toggle-indoor").textContent=d.mode==="indoor"?"屋外版にする":"室内版にする"; $("mission-title").textContent=m.title; $("mission-instruction").textContent=d.mode==="indoor"?m.indoorInstruction:m.instruction;const reason=$("mission-reason");reason.textContent=d.nextReason?`この招待の理由：${d.nextReason}`:"";reason.hidden=!d.nextReason; $("mood-step").hidden=true; $("proposal-step").hidden=false; $("active-step").hidden=true;}
  function renderActive(){const m=draftMission();if(!m.title)return; $("active-mission-title").textContent=m.title; $("active-mission-instruction").textContent=state.draft.mode==="indoor"?m.indoorInstruction:m.instruction; $("active-mission-meta").textContent=`${m.durationMinutes||10}分 · ${state.draft.mode==="indoor"?"室内版":"屋外"}`; $("capture-photo").innerHTML=state.draft.photoBlob?'選んだ一枚を確認する <span aria-hidden="true">→</span>':'一枚を持ち帰る <span aria-hidden="true">＋</span>'; $("mood-step").hidden=true;$("proposal-step").hidden=true;$("active-step").hidden=false;}
  function preview(blob){const img=$("photo-preview");if(!img)return;if(state.objectUrl)URL.revokeObjectURL(state.objectUrl);state.objectUrl=blob?URL.createObjectURL(blob):null;img.src=state.objectUrl||"";img.hidden=!blob;const placeholder=img.parentElement?.querySelector(".photo-placeholder");if(placeholder)placeholder.hidden=Boolean(blob);}
  function renderObservationReview(){const section=$("observation-review"),list=$("observation-list"),items=state.draft?.observations||[];if(!section||!list)return;section.hidden=!items.length;list.innerHTML=items.map((item,index)=>`<article class="observation-item" data-observation-index="${index}"><label for="observation-${index}">根拠候補 ${index+1}<span class="observation-status observation-status-${esc(item.status||"pending")}">${esc(({pending:"未選択",accepted:"採用",edited:"修正済み",hidden:"非表示"})[item.status]||item.status)}</span></label><textarea id="observation-${index}" maxlength="90" rows="2">${esc(item.text||item.originalText)}</textarea><div><button class="small-button" type="button" data-observation-action="accepted">採用</button><button class="small-button" type="button" data-observation-action="edited">修正を保存</button><button class="text-button" type="button" data-observation-action="hidden">非表示</button></div></article>`).join("");list.querySelectorAll("[data-observation-action]").forEach(button=>button.addEventListener("click",async()=>{const card=button.closest("[data-observation-index]"),index=Number(card?.dataset.observationIndex),item=state.draft?.observations?.[index];if(!item)return;const action=button.dataset.observationAction,input=card.querySelector("textarea"),edited=(input?.value||"").trim().slice(0,90);if(action==="edited"&&!edited){toast("修正した根拠を入力してください。");return;}item.status=action;item.text=action==="accepted"?item.originalText:action==="edited"?edited:item.text;state.draft.updatedAt=Date.now();await saveDraft();renderObservationReview();}));}
  function renderRecord(){const m=draftMission(), reflection=state.draft?.aiReflection;preview(state.draft?.photoBlob); $("question-text").textContent=reflection?.question||m?.question||"今日、何に気づきましたか？"; $("question-source").textContent=reflection?"AI":"固定"; const comment=$("ai-comment");comment.textContent=reflection?.comment||"";comment.hidden=!reflection?.comment; const status=$("ai-status");status.textContent=state.aiStatus||"まだAIへ送信していません。";status.hidden=false;const include=$("include-private-profile");if(include)include.checked=Boolean(state.draft?.includePrivateProfile);const request=$("request-ai-reflection");if(request){request.disabled=Boolean(state.aiLoading);request.textContent=state.aiLoading?"AIへ送信中…":reflection?"AIでもう一度つくる":"この内容でAIに送る";}renderReceipt("reflection-receipt",state.draft?.reflectionReceipt);renderObservationReview(); const a=$("answer-input");a.value=state.draft?.answer||""; $("answer-count").textContent=`${a.value.length} / 120`;}
  function blobAsDataURL(blob){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});}
  async function askAI(){if(!state.draft?.photoBlob||state.aiLoading)return;state.aiLoading=true;state.draft.includePrivateProfile=Boolean($("include-private-profile")?.checked);state.aiStatus="縮小画像をOrcaRouterへ送り、一問と根拠候補を考えています…";renderRecord();let receipt=null;try{const response=await fetch("/api/reflection",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({imageData:await blobAsDataURL(state.draft.photoBlob),mood:state.draft.mood,profile:privateProfileContext(state.draft.includePrivateProfile),recent:await recentContext()})});const body=await response.json();receipt=body.receipt||null;if(!response.ok||!body.comment||!body.question||!body.observations?.length)throw new Error(body.error||"AIから一問を受け取れませんでした。");state.draft.aiReflection={comment:body.comment,question:body.question,model:body.model,createdAt:Date.now()};state.draft.observations=body.observations.map((text,index)=>({id:`${state.draft.dateKey}-${Date.now()}-${index}`,originalText:text,text,status:"pending",source:"vision"}));state.aiStatus="AIから一問と根拠候補が届きました。候補の扱いは自分で選べます。";}catch{state.draft.observations=[];state.aiStatus="AIに接続できませんでした。固定の一問で続けられます。";}finally{if(receipt){state.draft.reflectionReceipt=receipt;await rememberReceipt(receipt);}state.draft.updatedAt=Date.now();await saveDraft();state.aiLoading=false;renderRecord();}}
  function makeEntry(kind){const m=draftMission(), reflection=state.draft.aiReflection,observations=kind==="photo"?(state.draft.observations||[]).filter(item=>["accepted","edited"].includes(item.status)).map(item=>({id:item.id,originalText:item.originalText,text:item.text,status:item.status,source:item.source})):[]; return {dateKey:state.draft.dateKey||state.dateKey,kind,missionId:state.draft.missionId||null,noveltyType:m?.noveltyType||null,tags:kind==="photo"?(m?.perspectiveTags||[]):[],observations,invitationEvidenceIds:[...(state.draft.nextSourceIds||[])],analysisEligible:kind==="photo",mood:state.draft.mood,mode:state.draft.mode,answer:state.draft.answer||"",question:reflection?.question||m?.question||"",aiComment:reflection?.comment||"",aiReceipt:state.draft.reflectionReceipt||null,title:m?.title||"",instruction:state.draft.mode==="indoor"?(m?.indoorInstruction||""):(m?.instruction||""),photoBlob:kind==="photo"?state.draft.photoBlob:null,createdAt:Date.now(),updatedAt:Date.now(),legacy:false};}
  function renderCard(){const x=state.pending;const el=$("daily-card"); if(!x||!el)return; $("card-ai-disclaimer").textContent=x.aiComment?"AIの一問と、あなたが採用・修正した根拠だけを保存します。":"AIへ送信していません。お題と本人の言葉だけを保存します。"; $("share-card-actions").hidden=x.kind!=="photo"; if(x.kind==="blank"){el.innerHTML=`<div class="daily-card-blank"><span>✳</span><p>余白の日</p><h2>今日は、<em>余白にしました。</em></h2><time>${esc(labelDate(x.dateKey))}</time></div>`;return;} preview(x.photoBlob); const u=state.objectUrl,evidence=x.observations?.length?`<div class="card-evidence"><p>自分で確かめた根拠</p><ul>${x.observations.map(item=>`<li>${esc(item.text)}</li>`).join("")}</ul></div>`:"";el.innerHTML=`<img class="daily-card-photo" src="${u}" alt="今日選んだ写真"><div class="daily-card-copy"><p>今日の寄り道</p><h2>${esc(x.title)}</h2><p>${esc(x.answer||"まだ言葉にしていない。")}</p>${evidence}</div>`;}
  function wrapCanvasText(ctx, text, maxWidth){const chars=[...String(text||"")],lines=[];let line="";for(const char of chars){if(ctx.measureText(line+char).width>maxWidth&&line){lines.push(line);line=char;}else line+=char;}if(line)lines.push(line);return lines;}
  async function makeShareCard(){const entry=state.pending;if(!entry?.photoBlob)throw new Error("写真がありません。");const canvas=document.createElement("canvas"),ctx=canvas.getContext("2d"),size=1080,pad=72;canvas.width=size;canvas.height=1350;ctx.fillStyle="#f4f1ea";ctx.fillRect(0,0,size,1350);const bitmap=await createImageBitmap(entry.photoBlob);const frame={x:pad,y:72,w:size-pad*2,h:690},scale=Math.max(frame.w/bitmap.width,frame.h/bitmap.height),sw=frame.w/scale,sh=frame.h/scale,sx=(bitmap.width-sw)/2,sy=(bitmap.height-sh)/2;ctx.drawImage(bitmap,sx,sy,sw,sh,frame.x,frame.y,frame.w,frame.h);bitmap.close?.();ctx.fillStyle="#385548";ctx.font='700 25px "Hiragino Kaku Gothic ProN", sans-serif';ctx.fillText("今日の寄り道",pad,858);ctx.fillStyle="#242823";ctx.font='400 64px "Yu Mincho", serif';const titleLines=wrapCanvasText(ctx,entry.title||"今日の採集",size-pad*2).slice(0,2);titleLines.forEach((line,index)=>ctx.fillText(line,pad,942+index*78));ctx.fillStyle="#5e655e";ctx.font='400 32px "Yu Mincho", serif';const bodyLines=wrapCanvasText(ctx,entry.answer||"まだ言葉にしていない。",size-pad*2).slice(0,3);bodyLines.forEach((line,index)=>ctx.fillText(line,pad,1120+index*45));ctx.strokeStyle="#c9c7bd";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(pad,1250);ctx.lineTo(size-pad,1250);ctx.stroke();ctx.fillStyle="#5e655e";ctx.font='400 24px "Hiragino Kaku Gothic ProN", sans-serif';ctx.fillText(labelDate(entry.dateKey),pad,1300);ctx.fillStyle="#af593f";ctx.font='700 27px "Yu Mincho", serif';ctx.textAlign="right";ctx.fillText("Routeoff",size-pad,1300);ctx.textAlign="start";return new Promise(resolve=>canvas.toBlob(resolve,"image/png"));}
  async function saveShareCard(){const blob=await makeShareCard();if(!blob)throw new Error("共有画像を作れませんでした。");const url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download=`Routeoff_${state.pending.dateKey}.png`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function shareCaption(){const entry=state.pending;return `今日、${entry.title||"一枚の景色"}を持ち帰った。${entry.answer?`\n${entry.answer}`:""}\n#Routeoff`;}
  async function copyShareCaption(){try{if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(shareCaption());else{const area=document.createElement("textarea");area.value=shareCaption();document.body.append(area);area.select();document.execCommand("copy");area.remove();}toast("投稿文をコピーしました。");}catch{toast("投稿文をコピーできませんでした。");}}
  async function shareCard(){try{const blob=await makeShareCard();if(!blob)throw new Error("共有画像を作れませんでした。");const file=new File([blob],`Routeoff_${state.pending.dateKey}.png`,{type:"image/png"});if(!navigator.share||!navigator.canShare?.({files:[file]})){await saveShareCard();toast("この環境では共有メニューを開けないため、画像を保存しました。");return;}await navigator.share({title:"Routeoff",text:shareCaption(),files:[file]});}catch(error){if(error?.name!=="AbortError"){await saveShareCard();toast("共有メニューを開けないため、画像を保存しました。");}}}
  async function saveEntry(){if(!state.pending||state.saving)return;if(!await ensureCurrentDate())return;state.saving=true;const button=$("save-card");if(button)button.disabled=true;try{const old=await get("entries",state.pending.dateKey);if(old){if(old.kind==="photo"&&state.pending.kind==="blank")throw new Error("photo-to-blank");if(!await confirmDialog("今日の記録を更新しますか？","保存すると既存の採集記録を置き換えます。"))return;state.pending.createdAt=old.createdAt;state.pending.updatedAt=Date.now();}await put("entries",state.pending);await del("drafts",state.pending.dateKey);state.draft=null;state.pending=null;state.finishingStale=false;toast("採集帳に保存しました。");if(state.dateKey!==localDateKey()){state.dateKey=localDateKey();state.draft=await get("drafts",state.dateKey);await renderToday();}await renderCollection();navigate("collection");}catch(e){toast(e.message==="photo-to-blank"?"写真の記録を余白へ変更することはできません。":"保存できませんでした。下書きは保持しています。再試行してください。");}finally{state.saving=false;if(button)button.disabled=false;}}
  async function renderCollection(){state.collectionUrls.forEach(URL.revokeObjectURL);state.collectionUrls=[];const entries=(await all("entries")).sort((a,b)=>b.createdAt-a.createdAt); $("collection-count").textContent=`持ち帰った景色 ${entries.filter(x=>x.kind==="photo").length}枚`; const list=$("collection-list"),empty=$("collection-empty");empty.hidden=!!entries.length; list.innerHTML=""; for(const x of entries){let visual=x.kind==="photo"&&x.photoBlob?`<img alt="${esc(labelDate(x.dateKey))}の採集写真">`:x.sampleVisual?`<img class="seed-photo seed-photo-${esc(x.sampleVisual)}" src="assets/timeline-sample-strip.png" alt="${esc(labelDate(x.dateKey))}のサンプル採集写真">`:"<div class=\"entry-blank\">✳</div>"; const evidence=x.observations?.length?`<ul class="entry-evidence-mini">${x.observations.slice(0,2).map(item=>`<li>${esc(item.text)}</li>`).join("")}</ul>`:"";const a=document.createElement("article");a.className="collection-entry";a.innerHTML=`${visual}<div><time>${esc(labelDate(x.dateKey))}</time><h3>${esc(x.kind==="blank"?"今日は余白にしました。":x.title||"採集記録")}</h3><p>${esc(x.answer||x.instruction||"")}</p>${evidence}<button type="button" class="text-button" data-delete="${x.dateKey}">削除</button></div>`; if(x.kind==="photo"&&x.photoBlob){const u=URL.createObjectURL(x.photoBlob);state.collectionUrls.push(u);a.querySelector("img").src=u;}list.append(a);} list.querySelectorAll("[data-delete]").forEach(b=>b.onclick=async()=>{if(await confirmDialog("この記録を削除しますか？","削除すると元に戻せません。")){const dateKey=b.dataset.delete;await del("entries",dateKey);await del("drafts",dateKey);if(dateKey===state.dateKey){state.draft=null;state.pending=null;}await renderCollection();}}); renderMyRouteToday(entries);await renderReport(entries);renderJudgePanel();}
  function renderMyRouteToday(entries) {
    const box = $("my-route-today");
    if (!box) return;
    const today = entries.find((entry) => entry.dateKey === state.dateKey);
    if (!today) {
      box.innerHTML = '<article class="my-route-card my-route-start"><p class="kicker">TODAY\'S DETOUR</p><h2>今日の寄り道を、<br><em>はじめよう。</em></h2><p>まだ何も持ち帰っていない今日も、ここから小さな一歩を選べます。</p><button class="button button-primary" type="button" data-go-today>寄り道をはじめる <span aria-hidden="true">→</span></button></article>';
    } else {
      const isPhoto = today.kind === "photo";
      const visual = isPhoto && today.photoBlob ? '<img data-my-route-photo alt="今日の寄り道の写真">' : today.sampleVisual ? '<img src="assets/timeline-sample-strip.png" class="seed-photo seed-photo-' + esc(today.sampleVisual) + '" alt="今日の寄り道のサンプル写真">' : '<div class="my-route-blank">✳</div>';
      const title = today.kind === "blank" ? "今日は余白にしました。" : today.title || "今日の寄り道";
      const description = today.kind === "blank" ? "明日また気になった景色があれば、そこから続けられます。" : today.answer || "今日見つけた景色は、もうあなたのMy Routeに残っています。";
      box.innerHTML = '<article class="my-route-card my-route-complete"><div class="my-route-visual">' + visual + '</div><div><p class="kicker">TODAY\'S ROUTE</p><h2>' + esc(title) + '</h2><p>' + esc(description) + '</p><button class="text-button" type="button" data-go-today>今日の一枚を見る</button></div></article>';
      if (isPhoto && today.photoBlob) {
        const url = URL.createObjectURL(today.photoBlob);
        state.collectionUrls.push(url);
        box.querySelector("[data-my-route-photo]").src = url;
      }
    }
    box.querySelector("[data-go-today]")?.addEventListener("click", async () => {
      await renderToday();
      navigate("today");
    });
  }
  function weeklyEligible(entries){return entries.filter(entry=>entry.kind==="photo"&&entry.analysisEligible!==false&&!entry.legacy&&entry.dateKey>=dateDaysAgo(7)&&(entry.answer?.trim()||entry.observations?.length)).sort((a,b)=>b.createdAt-a.createdAt).slice(0,7);}
  function weeklyFingerprint(entries){return String(hash(`${WEEKLY_COPY_VERSION}:${JSON.stringify(entries.map(entry=>({id:entry.dateKey,answer:entry.answer||"",observations:(entry.observations||[]).map(item=>item.text),tags:entry.tags||[],updatedAt:entry.updatedAt||entry.createdAt})))}`));}
  function dominantTag(entries){const counts=new Map(),recent=new Map();entries.forEach((entry,index)=>(entry.tags||[]).forEach(tag=>{counts.set(tag,(counts.get(tag)||0)+1);if(!recent.has(tag))recent.set(tag,index);}));return [...counts].sort((a,b)=>b[1]-a[1]||(recent.get(a[0])||0)-(recent.get(b[0])||0))[0]?.[0]||"detail";}
  function fallbackWeeklyReport(entries){if(!entries.length)return null;const tag=dominantTag(entries),taggedEntries=entries.filter(entry=>(entry.tags||[]).includes(tag)),wordEntry=entries.find(entry=>entry.answer?.trim()),mission=data.missions.find(item=>!(item.perspectiveTags||[]).includes(tag))||data.missions[0],label=TAG_LABELS[tag]||tag,sourceIds=taggedEntries.slice(0,3).map(entry=>entry.dateKey);return{source:"rule",lines:[{text:`この1週間は、${entries.length}枚の写真を残しました。`,evidenceIds:entries.slice(0,3).map(entry=>entry.dateKey)},{text:`今週は、${label}に目を向けた写真が多くありました。`,evidenceIds:sourceIds.length?sourceIds:[entries[0].dateKey]},{text:wordEntry?"写真だけでなく、そのとき気づいたことも言葉で残せています。":"写真の中で気になったことを、記録として残せています。",evidenceIds:[(wordEntry||entries[0]).dateKey]}],nextDetour:{missionId:mission.id,title:mission.title,instruction:mission.instruction,indoorInstruction:mission.indoorInstruction,question:mission.question,reason:`今週は${label}を写した写真が多かったので、次は「${mission.title}」を試してみましょう。`,sourceIds:sourceIds.length?sourceIds:[entries[0].dateKey]}};}
  function openEvidence(ids,entries){const dialog=$("evidence-dialog"),body=$("evidence-body");if(!dialog||!body)return;const sources=ids.map(id=>entries.find(entry=>entry.dateKey===id)).filter(Boolean);body.innerHTML=sources.map(entry=>`<article class="evidence-source"><time>${esc(labelDate(entry.dateKey))}</time><h3>${esc(entry.title||"寄り道の記録")}</h3>${(entry.observations||[]).length?`<ul>${entry.observations.map(item=>`<li><span>写真で確認したこと</span>${esc(item.text)}</li>`).join("")}</ul>`:""}${entry.answer?`<p><span>その日に書いた言葉</span>${esc(entry.answer)}</p>`:""}</article>`).join("")||"<p>もとになった記録を表示できませんでした。</p>";dialog.showModal();}
  async function startNextDetour(next){if(await get("entries",state.dateKey)){toast("今日の寄り道はすでにMy Routeにあります。");return;}const fixed=missionById(next.missionId),hasCustom=!fixed||next.title!==fixed.title;state.draft={dateKey:state.dateKey,mood:"surprise",missionId:fixed?.id||data.missions[0]?.id,suggestionIndex:0,mode:"outdoor",status:"proposal",answer:"",aiMission:hasCustom?{title:next.title,instruction:next.instruction,indoorInstruction:next.indoorInstruction,question:next.question}:null,nextReason:next.reason,nextSourceIds:[...(next.sourceIds||[])],missionStatus:"今週のまとめから、次のお題を選びました。",startedAt:Date.now(),updatedAt:Date.now()};await saveDraft();renderProposal();navigate("today");}
  function renderNextDetour(next){const box=$("next-detour");if(!box)return;box.hidden=!next;if(!next){box.innerHTML="";return;}box.innerHTML=`<p class="kicker">次の寄り道</p><h3 id="next-detour-title">${esc(next.title)}</h3><p>${esc(next.reason)}</p><button class="button button-primary" type="button">このお題で寄り道する <span aria-hidden="true">→</span></button>`;box.querySelector("button").addEventListener("click",()=>startNextDetour(next));}
  async function requestWeeklyAI(entries,fingerprint){if(!await confirmDialog("7日分の記録をAIでまとめますか？","送るのは、写真で確認した内容と、その日に書いた言葉です。写真・名前・プロフィールは送りません。"))return;const button=$("refresh-weekly-ai");button.disabled=true;button.textContent="今週をまとめています…";let receipt=null;try{const payload={entries:entries.map(entry=>({id:entry.dateKey,dateKey:entry.dateKey,answer:entry.answer||"",observations:(entry.observations||[]).map(item=>item.text)}))},response=await fetch("/api/weekly-reflection",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)}),body=await response.json();receipt=body.receipt||null;if(!response.ok||body.lines?.length!==3||!body.nextDetour)throw new Error(body.error||"weekly-failed");const report={source:"AI",lines:body.lines,nextDetour:body.nextDetour,receipt};await rawPut("meta",{key:`weekly-report:${state.user.id}`,userId:state.user.id,fingerprint,report,updatedAt:Date.now()});if(receipt)await rememberReceipt(receipt);toast("AIで今週をまとめました。");}catch{if(receipt)await rememberReceipt(receipt);toast("AIに接続できないため、この端末でまとめた内容を表示します。");}finally{button.disabled=false;button.textContent="AIで今週をまとめる";await renderReport(state.weeklyEntries);}}
  async function renderReport(entries){const eligible=weeklyEligible(entries),title=$("perspective-title"),body=$("perspective-body"),note=$("perspective-note"),source=$("weekly-source"),button=$("refresh-weekly-ai");if(!title||!body||!note)return;state.weeklyEntries=eligible;const fingerprint=weeklyFingerprint(eligible),cached=await rawGet("meta",`weekly-report:${state.user.id}`),report=cached?.fingerprint===fingerprint?cached.report:fallbackWeeklyReport(eligible);state.weeklyReport=report;button.hidden=!eligible.length;button.onclick=()=>requestWeeklyAI(eligible,fingerprint);if(!report){source.textContent="端末";title.textContent="今週の記録は、これから。";body.innerHTML="<p>写真を残すと、1週間の傾向をここで確認できます。</p>";note.textContent="まずは今日の寄り道を残してみましょう。";renderReceipt("weekly-receipt",null);renderNextDetour(null);return;}source.textContent=report.source==="AI"?"AI":"端末";title.textContent="今週、よく目が向いたもの";body.innerHTML=report.lines.map((line,index)=>`<button class="evidence-line" type="button" data-evidence-ids="${esc(line.evidenceIds.join(","))}"><span>${index+1}</span><strong>${esc(line.text)}</strong><small>もとになった記録</small></button>`).join("");body.querySelectorAll("[data-evidence-ids]").forEach(item=>item.addEventListener("click",()=>openEvidence(item.dataset.evidenceIds.split(","),eligible)));note.textContent=report.source==="AI"?"7日分の記録からまとめました。写真・名前・プロフィールはAIに送っていません。":"7日分の記録を、この端末でまとめました。";renderReceipt("weekly-receipt",report.receipt);renderNextDetour(report.nextDetour);}
  async function collectFeedPosts(){const localPosts=(await rawAll("userEntries")).filter(item=>item.kind==="photo").map(item=>({...item,user:TEST_USERS.find(user=>user.id===item.userId)})).filter(item=>item.user);return [...(window.NICHIJO_COMMUNITY_POSTS||[]),...localPosts].sort((a,b)=>b.createdAt-a.createdAt).map((post,index)=>({...post,feedKey:post.id||`local-${post.userId}-${post.dateKey}-${index}`}));}
  function feedVisual(post,index,variant="feed-photo"){if(post.imageUrl)return `<img class="${variant}" src="${esc(post.imageUrl)}" alt="${esc(post.imageAlt||post.title)}">`;if(post.photoBlob)return `<img class="${variant}" data-feed-photo="${index}" alt="${esc(post.title)}の採集写真">`;return `<div class="feed-visual feed-visual-${esc(post.sampleVisual||"window")}" role="img" aria-label="${esc(post.title)}のサンプル写真"></div>`;}
  function bindFeedPhotos(container,posts){posts.forEach((post,index)=>{if(post.photoBlob){const url=URL.createObjectURL(post.photoBlob);state.feedUrls.push(url);const image=container.querySelector(`[data-feed-photo="${index}"]`);if(image)image.src=url;}});}
  async function renderFeed(){state.feedUrls.forEach(URL.revokeObjectURL);state.feedUrls=[];const posts=await collectFeedPosts();state.feedPosts=posts;$("feed-lead").textContent="気になった一枚から、その人の寄り道をのぞいてみよう。";const list=$("feed-list");list.innerHTML=posts.map((post,index)=>`<button class="feed-tile" type="button" data-feed-key="${esc(post.feedKey)}" aria-label="${esc(post.user.name)}の投稿「${esc(post.title)}」を開く">${feedVisual(post,index,"feed-photo")}</button>`).join("");bindFeedPhotos(list,posts);list.querySelectorAll("[data-feed-key]").forEach(button=>button.addEventListener("click",()=>openFeedPost(button.dataset.feedKey)));}
  function openFeedPost(feedKey){const post=state.feedPosts.find(item=>item.feedKey===feedKey);if(!post)return;renderCommunityProfile(post.userId,feedKey);navigate("community-profile");}
  function renderCommunityProfile(userId,selectedKey){const posts=state.feedPosts.filter(post=>post.userId===userId),selected=posts.find(post=>post.feedKey===selectedKey)||posts[0],user=selected?.user;if(!selected||!user)return;const others=posts.filter(post=>post.feedKey!==selected.feedKey),content=$("community-profile-content");$("community-profile-title")?.remove();content.innerHTML=`<header class="community-profile-header"><span class="feed-avatar">${esc(user.name.slice(0,1))}</span><div><p class="kicker">${selected.fictional?"DEMO MEMBER":"YOUR ROUTEOFF"}</p><h1>${esc(user.name)}${selected.userId===state.user.id?" <span class=\"own-label\">あなた</span>":""}</h1><p class="lead">${posts.length}枚の寄り道を持ち帰っています。</p></div></header><article class="selected-post"><div class="selected-post-visual">${feedVisual(selected,0,"feed-photo")}</div><div class="selected-post-copy"><time>${esc(labelDate(selected.dateKey))}</time><h2>${esc(selected.title)}</h2><p>${esc(selected.answer||"まだ言葉にしていない。")}</p></div></article><section class="profile-posts" aria-labelledby="other-posts-title"><div class="section-heading"><p class="kicker">MORE DETOURS</p><h2 id="other-posts-title">ほかの寄り道</h2></div><div class="feed-grid feed-grid-small">${others.map((post,index)=>`<button class="feed-tile" type="button" data-profile-key="${esc(post.feedKey)}" aria-label="${esc(post.title)}を開く">${feedVisual(post,index+1,"feed-photo")}</button>`).join("")||"<p class=\"empty-state\">ほかの寄り道は、これから増えていきます。</p>"}</div></section>`;bindFeedPhotos(content,[selected,...others]);content.querySelectorAll("[data-profile-key]").forEach(button=>button.addEventListener("click",()=>openFeedPost(button.dataset.profileKey)));}
  function compress(file) {
    return new Promise((resolve, reject) => {
      if (!file?.type.startsWith("image/")) {
        reject(new Error("not-image"));
        return;
      }
      const image = new Image();
      const objectUrl = URL.createObjectURL(file);
      const fail = (reason) => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error(reason));
      };
      image.onload = () => {
        const ratio = Math.min(1, 1400 / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
        const context = canvas.getContext("2d");
        if (!context) {
          fail("canvas-unavailable");
          return;
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          URL.revokeObjectURL(objectUrl);
          if (blob) resolve(blob);
          else reject(new Error("image-conversion-failed"));
        }, "image/jpeg", 0.82);
      };
      image.onerror = () => fail("image-decode-failed");
      image.src = objectUrl;
    });
  }
  function dataUrlBlob(value){const m=/^data:([^;,]+)?(?:;base64)?,(.*)$/s.exec(value||"");if(!m)throw new Error("invalid-data-url");const binary=atob(m[2]),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return new Blob([bytes],{type:m[1]||"image/jpeg"});}
  async function migrate(){const prior=await get("meta","legacy-v1");if(prior?.done&&!prior.failures?.length)return;let cards=[],failures=[];try{cards=JSON.parse(localStorage.getItem(LEGACY_KEY)||"[]");if(!Array.isArray(cards))throw new Error("invalid-json-shape");}catch(e){failures.push({dateKey:null,reason:"legacy-json:"+(e.message||"invalid")});cards=[];}const newest=new Map();cards.filter(c=>!c.sample&&!String(c.id||"").startsWith("sample-")).forEach(c=>{const k=c.dateKey||c.date;if(k&&(!newest.has(k)||(newest.get(k).createdAt||0)<(c.createdAt||0)))newest.set(k,c);});for(const [k,c] of newest){try{const existing=await get("entries",k);const kind=c.kind==="blank"?"blank":"photo",raw=c.photo||c.photoData||c.image;const retryPhoto=kind==="photo"&&existing?.legacy&&!existing.photoBlob;if(existing&&!retryPhoto)continue;let blob=existing?.photoBlob||null;if(kind==="photo"){if(raw){try{blob=dataUrlBlob(raw);}catch(e){failures.push({dateKey:k,reason:"photo:"+(e.message||"invalid")});}}else{failures.push({dateKey:k,reason:"photo:missing"});}}await put("entries",{dateKey:k,kind,answer:c.answer||existing?.answer||"",title:c.prompt||existing?.title||"",instruction:c.prompt||existing?.instruction||"",createdAt:existing?.createdAt||c.createdAt||Date.now(),updatedAt:Date.now(),legacy:true,analysisEligible:false,tags:[],photoBlob:blob});}catch(e){failures.push({dateKey:k,reason:"entry:"+(e.message||"failed")});}}await put("meta",{key:"legacy-v1",done:failures.length===0,failures,updatedAt:Date.now()});}
  async function migrateV1UserData() {
    const marker = await get("meta", "user-storage-v2");
    if (marker?.done) return;
    const existingEntries = await rawAll("entries");
    const existingDrafts = await rawAll("drafts");
    for (const entry of existingEntries) await rawPut("userEntries", { ...entry, id: `demo-user-1:${entry.dateKey}`, userId: "demo-user-1" });
    for (const draft of existingDrafts) await rawPut("userDrafts", { ...draft, id: `demo-user-1:${draft.dateKey}`, userId: "demo-user-1" });
    await put("meta", { key: "user-storage-v2", done: true, updatedAt: Date.now() });
  }
  function showLogin() { $("app-shell").hidden = true; $("login-screen").hidden = false; $("login-form")?.reset(); $("login-error").hidden = true; $("login-id")?.focus(); }
  function renderUser() { const name = state.profile?.displayName || state.user.name; $("current-user-name").textContent = name; $("current-user-initial").textContent = name.slice(0, 1); }
  function toggleUserMenu(force) { const menu = $("user-menu"), button = $("user-menu-button"), visible = force ?? menu.hidden; menu.hidden = !visible; button.setAttribute("aria-expanded", String(visible)); }
  function renderProfile() { const profile = state.profile || {}; $("profile-name").value = profile.displayName || ""; ["ageRange", "role", "lifeState"].forEach((field) => { const input = $("profile-form").querySelector(`input[name="${field}"][value="${CSS.escape(profile[field] || "")}"]`); if (input) input.checked = true; }); $("profile-mbti").value = profile.mbti || ""; }
  function openProfile() { toggleUserMenu(false); renderProfile(); navigate("profile"); }
  async function saveProfile({ skipped = false } = {}) { const form = $("profile-form"), value = (name) => new FormData(form).get(name) || ""; state.profile = { key: `profile:${state.user.id}`, userId: state.user.id, displayName: skipped ? "" : value("displayName").trim(), ageRange: skipped ? "" : value("ageRange"), role: skipped ? "" : value("role"), lifeState: skipped ? "" : value("lifeState"), mbti: skipped ? "" : value("mbti"), visibility: "private", onboardingSeen: true, updatedAt: Date.now() }; await rawPut("meta", state.profile); renderUser(); toast(skipped ? "プロフィールは、いつでも設定できます。" : "設定を保存しました。"); await renderCollection(); navigate("collection"); }
  const PRESENTATION_STEPS = [
    { screen: "collection", focusId: "perspective-report", title: "7日分の記録を、3行で確認する。", copy: "写真で確認した内容と、その日に書いた言葉から、今週よく目が向いたものをまとめます。" },
    { screen: "collection", focusId: "perspective-body", title: "AIでもう一度まとめる。", copy: "『もとになった記録』で内容を確認し、『AIで今週をまとめる』を押します。写真・名前・プロフィールは送りません。" },
    { screen: "today", action: "start-next-detour", focusId: "proposal-step", title: "まとめから、次のお題を選ぶ。", copy: "今週よく見ていたものを理由に、次に試すお題を一つ選びます。" },
    { screen: "collection", focusId: "judge-panel", title: "AIの利用量と安全性も、見える。", copy: "固定文だけの実AIテストと、サーバーの通信失敗処理テストができます。用途・モデル・外部送信量・token・応答時間・推定コストを同じ画面で説明します。" },
    { screen: "feed", focusId: "feed-list", title: "自分の道から、誰かの寄り道へ。", copy: "最後に『みつける』で、競争指標を置かず、写真から誰かの寄り道をのぞく広がりを見せます。" }
  ];
  async function showPresentationStep(index) { state.presentationIndex = index; const item = PRESENTATION_STEPS[index]; if (!item) { $("presentation-guide").hidden = true; state.presentationIndex = -1; return; } if(item.action==="start-next-detour"){await renderCollection();if(state.weeklyReport?.nextDetour)await startNextDetour(state.weeklyReport.nextDetour);} if (item.screen === "collection") await renderCollection(); if (item.screen === "feed") await renderFeed(); if (item.screen === "today") await renderToday(); navigate(item.screen); $("presentation-guide").hidden = false; $("presentation-step").textContent = `${index + 1} / ${PRESENTATION_STEPS.length}`; $("presentation-title").textContent = item.title; $("presentation-copy").textContent = item.copy; $("presentation-next").textContent = index === PRESENTATION_STEPS.length - 1 ? "完了" : "次へ"; requestAnimationFrame(()=>$(item.focusId)?.scrollIntoView({block:"center",behavior:"smooth"})); }
  async function startPresentation(){await preparePresentationData();await startUser(PRESENTATION_USER);await showPresentationStep(0);}
  async function startUser(user) {
    state.user = user;
    state.dateKey = localDateKey();
    state.draft = null;
    state.pending = null;
    state.stale = null;
    $$("input[name=\"mood\"]").forEach((input) => { input.checked = false; });
    localStorage.setItem(SESSION_KEY, user.id);
    await migrateV1UserData();
    await migrate();
    await seedDemoEntries();
    state.profile = await rawGet("meta", `profile:${user.id}`);
    state.aiReceipts = (await rawGet("meta", `ai-receipts:${user.id}`))?.receipts || [];
    renderUser();
    $("login-screen").hidden = true;
    $("app-shell").hidden = false;
    await restore();
    await renderCollection();
    navigate("collection");
    if (!state.profile?.onboardingSeen) openProfile();
  }
  function bindLogin() {
    $("login-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const id = $("login-id").value.trim();
      const password = $("login-password").value;
      const user = TEST_USERS.find((candidate) => candidate.id === id && candidate.password === password);
      if (!user) { const error = $("login-error"); error.textContent = "テストIDまたはパスワードを確認してください。"; error.hidden = false; return; }
      await startUser(user);
    });
    $("start-presentation")?.addEventListener("click", startPresentation);
    $("user-menu-button")?.addEventListener("click", () => toggleUserMenu());
    $("open-profile")?.addEventListener("click", openProfile);
    $("logout-button")?.addEventListener("click", () => { toggleUserMenu(false); localStorage.removeItem(SESSION_KEY); state.user = null; state.profile = null; showLogin(); });
    $("profile-form")?.addEventListener("submit", async (event) => { event.preventDefault(); await saveProfile(); });
    $("skip-profile")?.addEventListener("click", () => saveProfile({ skipped: true }));
    $("back-from-profile")?.addEventListener("click", async () => { await renderCollection(); navigate("collection"); });
    $("presentation-button")?.addEventListener("click", startPresentation);
    $("presentation-next")?.addEventListener("click", () => showPresentationStep(state.presentationIndex + 1));
    $("presentation-close")?.addEventListener("click", () => { $("presentation-guide").hidden = true; state.presentationIndex = -1; });
  }
  async function restore(){state.dateKey=localDateKey();const drafts=await all("drafts");for(const d of drafts){if(d.dateKey!==state.dateKey){if(d.photoBlob){$("stale-draft-banner").hidden=false;state.stale=d;}else await del("drafts",d.dateKey);}}state.draft=await get("drafts",state.dateKey);if(state.draft){if(state.draft.status==="active")renderActive();else if(state.draft.status==="proposal")renderProposal();else if(["record","captured"].includes(state.draft.status)){renderRecord();navigate("record");}else if(state.draft.status==="preview"){state.pending=makeEntry(state.draft.previewKind||"photo");renderCard();navigate("card");}}await renderToday();}
  function bind() {
    $("mood-form")?.addEventListener("change", () => chooseProposal(0));
    $("choose-new-mission")?.addEventListener("click", () => chooseProposal((state.draft?.suggestionIndex || 0) + 1));
    $("toggle-indoor")?.addEventListener("click", async () => {
      if (!await ensureCurrentDate()) return;
      state.draft.mode = state.draft.mode === "indoor" ? "outdoor" : "indoor";
      state.draft.updatedAt = Date.now();
      await saveDraft();
      renderProposal();
    });
    $("start-mission")?.addEventListener("click", async () => {
      if (!await ensureCurrentDate()) return;
      state.draft.status = "active";
      state.draft.updatedAt = Date.now();
      await saveDraft();
      renderActive();
    });
    $("cancel-mission")?.addEventListener("click", async () => {
      if (!await ensureCurrentDate()) return;
      state.draft.status = "proposal";
      state.draft.updatedAt = Date.now();
      await saveDraft();
      renderProposal();
    });
    $("capture-photo")?.addEventListener("click", async () => {
      if (!await ensureCurrentDate()) return;
      if (state.draft?.photoBlob) {
        renderRecord();
        navigate("record");
      } else {
        $("photo-input").click();
      }
    });
    $("photo-input")?.addEventListener("change", async (event) => {
      const file = event.target.files[0];
      if (!file) return;
      if (!await ensureCurrentDate()) {
        event.target.value = "";
        return;
      }
      try {
        state.draft.photoBlob = await compress(file);
        state.draft.status = "record";
        state.draft.aiReflection = null;
        state.draft.observations = [];
        state.draft.reflectionReceipt = null;
        state.draft.includePrivateProfile = false;
        state.draft.updatedAt = Date.now();
        state.aiStatus = "まだAIへ送信していません。内容を確認して選んでください。";
        await saveDraft();
        renderRecord();
        navigate("record");
      } catch {
        toast("画像を読み込めませんでした。別の画像を選んでください。");
      } finally {
        event.target.value = "";
      }
    });
    $("download-share-card")?.addEventListener("click", async()=>{try{await saveShareCard();toast("採集カードを保存しました。");}catch(error){toast(error.message||"画像を保存できませんでした。");}});
    $("include-private-profile")?.addEventListener("change", async (event) => { if(!state.draft)return;state.draft.includePrivateProfile=event.target.checked;state.draft.updatedAt=Date.now();await saveDraft(); });
    $("request-ai-reflection")?.addEventListener("click", askAI);
    $("skip-ai-reflection")?.addEventListener("click", async () => { if(!state.draft?.photoBlob)return;const receipt=skippedReceipt("photo-reflection",state.draft.photoBlob.size);state.draft.aiReflection=null;state.draft.observations=[];state.draft.reflectionReceipt=receipt;state.aiStatus="AIへ送信せず、固定の一問で続けます。";state.draft.updatedAt=Date.now();await rememberReceipt(receipt);await saveDraft();renderRecord(); });
    $("share-card")?.addEventListener("click", shareCard);
    $("copy-share-caption")?.addEventListener("click", copyShareCaption);
    $("back-to-active")?.addEventListener("click", async () => {
      if (!await ensureCurrentDate()) return;
      state.draft.status = "active";
      state.draft.updatedAt = Date.now();
      await saveDraft();
      renderActive();
      navigate("today");
    });
    $("answer-input")?.addEventListener("input", async (event) => {
      if (event.isComposing) return;
      if (!await ensureCurrentDate()) return;
      state.draft.answer = event.target.value.slice(0, 120);
      $("answer-count").textContent = `${state.draft.answer.length} / 120`;
      state.draft.updatedAt = Date.now();
      saveDraft();
    });
    $("skip-answer")?.addEventListener("click", async () => {
      if (!await ensureCurrentDate()) return;
      state.draft.answer = "";
      state.draft.updatedAt = Date.now();
      renderRecord();
      saveDraft();
    });
    $("make-card")?.addEventListener("click", async () => {
      if (!await ensureCurrentDate()) return;
      if (!state.draft?.photoBlob) return;
      state.draft.answer = ($("answer-input")?.value || state.draft.answer || "").slice(0, 120);
      state.draft.status = "preview";
      state.draft.previewKind = "photo";
      state.draft.updatedAt = Date.now();
      await saveDraft();
      state.pending = makeEntry("photo");
      renderCard();
      navigate("card");
    });
    $("back-to-record")?.addEventListener("click", async () => {
      if (!await ensureCurrentDate()) return;
      state.draft.status = "record";
      state.draft.updatedAt = Date.now();
      await saveDraft();
      renderRecord();
      navigate("record");
    });
    $("save-card")?.addEventListener("click", saveEntry);
    $("save-blank")?.addEventListener("click", async () => {
      if (!await ensureCurrentDate()) return;
      const old = await get("entries", state.dateKey);
      if (old?.kind === "photo") {
        toast("写真の記録を余白へ変更することはできません。");
        return;
      }
      state.draft.status = "preview";
      state.draft.previewKind = "blank";
      state.draft.updatedAt = Date.now();
      await saveDraft();
      state.pending = makeEntry("blank");
      renderCard();
      navigate("card");
    });
    $("finish-stale")?.addEventListener("click", () => {
      state.draft = state.stale;
      state.dateKey = state.stale.dateKey;
      state.finishingStale = true;
      $("stale-draft-banner").hidden = true;
      renderRecord();
      navigate("record");
    });
    $("discard-stale")?.addEventListener("click", async () => {
      await del("drafts", state.stale.dateKey);
      state.stale = null;
      state.finishingStale = false;
      $("stale-draft-banner").hidden = true;
    });
    $("reset-data")?.addEventListener("click", async () => {
      if (!await confirmDialog("採集帳をすべてリセットしますか？", "この端末に保存した採集記録と下書きを削除します。")) return;
      await Promise.all((await all("entries")).map((entry) => del("entries", entry.dateKey)));
      await Promise.all((await all("drafts")).map((draft) => del("drafts", draft.dateKey)));
      state.draft = null;
      state.pending = null;
      await renderCollection();
      toast("採集帳をリセットしました。");
    });
    $("back-to-feed")?.addEventListener("click", async () => {
      await renderFeed();
      navigate("feed");
    });
    $("run-cost-probe")?.addEventListener("click", runCostProbe);
    $("simulate-fallback")?.addEventListener("click", simulateFallback);
    $("evidence-close")?.addEventListener("click", () => $("evidence-dialog")?.close());
    $$('[data-screen-link]').forEach((item) => item.addEventListener("click", async (event) => {
      event.preventDefault();
      const name = item.dataset.screenLink;
      if (name === "collection") await renderCollection();
      if (name === "feed") await renderFeed();
      if (name === "today") await renderToday();
      navigate(name);
    }));
  }

  (async()=>{try{db=await openDB();bind();bindLogin();const savedId=localStorage.getItem(SESSION_KEY), user=TEST_USERS.find((candidate)=>candidate.id===savedId);if(user)await startUser(user);else showLogin();}catch(e){console.error(e);toast("このブラウザでは保存を初期化できませんでした。");}})();
})();
