(() => {
  "use strict";

  const DB_NAME = "nichijo-shusai", DB_VERSION = 3, LEGACY_KEY = "nichijo-shusai-cards-v1", SESSION_KEY = "nichijo-shusai-session-v1";
  const TEST_USERS = [
    { id: "demo-user-2", password: "demo-user-2", name: "デモユーザー2" },
    { id: "demo-user-1", password: "demo-user-1", name: "デモユーザー1" }
  ];
  const MOOD_NEIGHBORS = { calm: ["refresh", "surprise"], refresh: ["calm", "adventure"], adventure: ["refresh", "surprise"], surprise: ["calm", "adventure"] };
  const SEED_COPY = [
    "朝の光が、いつもより少しやわらかく見えた。",
    "通り過ぎそうな色に、今日は立ち止まれた。",
    "葉の重なりに、小さな季節を見つけた。",
    "足元の影が、時間をゆっくりにしてくれた。",
    "窓の外の静けさを、一枚に残しておく。",
    "遠回りした道で、見慣れない形に出会った。",
    "いつもの棚にも、気づかなかった余白がある。",
    "少し低い目線で見ると、景色が新しかった。",
    "夕方の色が、今日の終わりを教えてくれた。",
    "何気ない一枚を持ち帰れて、少し満足した。"
  ];
  const $ = (id) => document.getElementById(id);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const data = window.NICHIJO_DATA || { moods: [], missions: [], reportTemplates: {} };
  const state = { screen: "today", dateKey: localDateKey(), draft: null, pending: null, objectUrl: null, collectionUrls: [], feedUrls: [], saving: false, finishingStale: false, user: null, profile: null, aiStatus: "", presentationIndex: -1 };
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
  async function seedDemoEntries() { const marker = await get("meta", "demo-logs-v1"); if (marker?.done) return; for (const [userIndex, user] of TEST_USERS.entries()) { for (let offset = 0; offset < 10; offset += 1) { const dateKey = dateDaysAgo(offset); const id = `${user.id}:${dateKey}`; if (await rawGet("userEntries", id)) continue; const mission = data.missions[(offset + userIndex * 3) % data.missions.length]; const createdAt = new Date(`${dateKey}T${String(9 + userIndex).padStart(2, "0")}:00:00`).getTime(); await rawPut("userEntries", { id, userId: user.id, dateKey, kind: "photo", mood: mission.moodTypes[0], missionId: mission.id, noveltyType: mission.noveltyType, tags: mission.perspectiveTags, analysisEligible: true, mode: offset % 3 === 0 ? "indoor" : "outdoor", answer: SEED_COPY[(offset + userIndex * 2) % SEED_COPY.length], question: mission.question, title: mission.title, instruction: mission.instruction, photoBlob: null, sampleVisual: ["window", "street", "plant"][offset % 3], createdAt, updatedAt: createdAt, legacy: false, seeded: true }); } } await put("meta", { key: "demo-logs-v1", done: true, updatedAt: Date.now() }); }
  async function resetDemoEntries() { const entries = await rawAll("userEntries"); await Promise.all(entries.filter((entry) => entry.seeded).map((entry) => rawDel("userEntries", entry.id))); await rawDel("meta", "demo-logs-v1"); await seedDemoEntries(); }
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
    if (name !== "feed") {
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
  function draftMission(d=state.draft){const fixed=missionById(d?.missionId)||{};return {...fixed,...(d?.aiMission||{})};}
  async function chooseProposal(index=0) { if(!await ensureCurrentDate())return; const mood=$("mood-form")?.querySelector('input[name="mood"]:checked')?.value||state.draft?.mood; if(!mood){toast("これから得たい気分をひとつ選んでください。");return;} const m=await pickMission(mood,index), requestId=Date.now(); state.draft={dateKey:state.dateKey,mood,missionId:m.id,suggestionIndex:index,mode:"outdoor",status:"proposal",answer:"",missionRequestId:requestId,missionLoading:true,missionStatus:"あなたの採集に合わせて、今日のお題を考えています…",startedAt:Date.now(),updatedAt:Date.now()}; await saveDraft(); renderProposal(); personalizeMission(requestId); }
  async function personalizeMission(requestId){try{const response=await fetch("/api/mission",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mood:state.draft?.mood,profile:state.profile,recent:await recentContext()})});const body=await response.json();if(!response.ok||!body.title||!body.instruction||!body.indoorInstruction||!body.question)throw new Error(body.error||"AIから今日のお題を受け取れませんでした。");if(state.draft?.missionRequestId!==requestId)return;state.draft.aiMission={title:body.title,instruction:body.instruction,indoorInstruction:body.indoorInstruction,question:body.question,model:body.model};state.draft.missionStatus="あなたの採集に合わせた、今日のお題が届きました。";}catch{if(state.draft?.missionRequestId!==requestId)return;state.draft.missionStatus="固定のお題で続けられます。";}finally{if(state.draft?.missionRequestId!==requestId)return;state.draft.missionLoading=false;state.draft.updatedAt=Date.now();await saveDraft();if(state.draft.status==="proposal")renderProposal();else if(state.draft.status==="active")renderActive();}}
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
      complete.innerHTML = `<h2>今日の景色は、採集帳の中に。</h2><p>持ち帰った一枚と余韻を、いつでも見返せます。</p><button type="button" class="button button-primary" id="view-collection">採集帳で見る</button>${canEdit ? '<button type="button" class="text-button" id="edit-entry">この記録を編集する</button>' : ""}`;
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
  function renderProposal(){const d=state.draft,m=draftMission(d); if(!m.title)return; $("proposal-mood").textContent=(data.moods.find(x=>(x.id||x.value)===d.mood)?.label)||d.mood; $("proposal-source").textContent=d.aiMission?"AI":"固定"; const status=$("mission-ai-status");status.textContent=d.missionStatus||"";status.hidden=!d.missionStatus; $("mission-duration").textContent=`${m.durationMinutes||10}分`; $("mission-mode").textContent=d.mode==="indoor"?"室内版":"屋外"; $("toggle-indoor").textContent=d.mode==="indoor"?"屋外版にする":"室内版にする"; $("mission-title").textContent=m.title; $("mission-instruction").textContent=d.mode==="indoor"?m.indoorInstruction:m.instruction; $("mood-step").hidden=true; $("proposal-step").hidden=false; $("active-step").hidden=true;}
  function renderActive(){const m=draftMission();if(!m.title)return; $("active-mission-title").textContent=m.title; $("active-mission-instruction").textContent=state.draft.mode==="indoor"?m.indoorInstruction:m.instruction; $("active-mission-meta").textContent=`${m.durationMinutes||10}分 · ${state.draft.mode==="indoor"?"室内版":"屋外"}`; $("capture-photo").innerHTML=state.draft.photoBlob?'選んだ一枚を確認する <span aria-hidden="true">→</span>':'一枚を持ち帰る <span aria-hidden="true">＋</span>'; $("mood-step").hidden=true;$("proposal-step").hidden=true;$("active-step").hidden=false;}
  function preview(blob){const img=$("photo-preview");if(!img)return;if(state.objectUrl)URL.revokeObjectURL(state.objectUrl);state.objectUrl=blob?URL.createObjectURL(blob):null;img.src=state.objectUrl||"";img.hidden=!blob;const placeholder=img.parentElement?.querySelector(".photo-placeholder");if(placeholder)placeholder.hidden=Boolean(blob);}
  function renderRecord(){const m=draftMission(), reflection=state.draft?.aiReflection;preview(state.draft?.photoBlob); $("question-text").textContent=reflection?.question||m?.question||"今日、何に気づきましたか？"; $("question-source").textContent=reflection?"AI":"固定"; const comment=$("ai-comment");comment.textContent=reflection?.comment||"";comment.hidden=!reflection?.comment; const status=$("ai-status");status.textContent=state.aiStatus;status.hidden=!state.aiStatus; const a=$("answer-input");a.value=state.draft?.answer||""; $("answer-count").textContent=`${a.value.length} / 120`;}
  function blobAsDataURL(blob){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});}
  async function askAI(){if(!state.draft?.photoBlob||state.aiLoading)return;state.aiLoading=true;state.aiStatus="写真から、あなたへの一問を考えています…";renderRecord();try{const response=await fetch("/api/reflection",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({imageData:await blobAsDataURL(state.draft.photoBlob),mood:state.draft.mood,profile:state.profile,recent:await recentContext()})});const body=await response.json();if(!response.ok||!body.comment||!body.question)throw new Error(body.error||"AIから一問を受け取れませんでした。");state.draft.aiReflection={comment:body.comment,question:body.question,model:body.model,createdAt:Date.now()};state.draft.updatedAt=Date.now();await saveDraft();state.aiStatus="AIから、この一枚のための一問が届きました。";}catch{state.aiStatus="AIに接続できませんでした。固定の一問で続けられます。";}finally{state.aiLoading=false;renderRecord();}}
  function makeEntry(kind){const m=draftMission(), reflection=state.draft.aiReflection; return {dateKey:state.draft.dateKey||state.dateKey,kind,missionId:state.draft.missionId||null,noveltyType:m?.noveltyType||null,tags:kind==="photo"?(m?.perspectiveTags||[]):[],analysisEligible:kind==="photo",mood:state.draft.mood,mode:state.draft.mode,answer:state.draft.answer||"",question:reflection?.question||m?.question||"",aiComment:reflection?.comment||"",title:m?.title||"",instruction:state.draft.mode==="indoor"?(m?.indoorInstruction||""):(m?.instruction||""),photoBlob:kind==="photo"?state.draft.photoBlob:null,createdAt:Date.now(),updatedAt:Date.now(),legacy:false};}
  function renderCard(){const x=state.pending;const el=$("daily-card"); if(!x||!el)return; $("card-ai-disclaimer").textContent=x.aiComment?"AIが写真を参照して作った一問です。写真は記録保存以外には使いません。":"お題と記録から作ったモックです。写真そのものは解析していません。"; $("share-card-actions").hidden=x.kind!=="photo"; if(x.kind==="blank"){el.innerHTML=`<div class="daily-card-blank"><span>✳</span><p>余白の日</p><h2>今日は、<em>余白にしました。</em></h2><time>${esc(labelDate(x.dateKey))}</time></div>`;return;} preview(x.photoBlob); const u=state.objectUrl;el.innerHTML=`<img class="daily-card-photo" src="${u}" alt="今日選んだ写真"><div class="daily-card-copy"><p>今日の寄り道</p><h2>${esc(x.title)}</h2><p>${esc(x.answer||"まだ言葉にしていない。")}</p></div>`;}
  function wrapCanvasText(ctx, text, maxWidth){const chars=[...String(text||"")],lines=[];let line="";for(const char of chars){if(ctx.measureText(line+char).width>maxWidth&&line){lines.push(line);line=char;}else line+=char;}if(line)lines.push(line);return lines;}
  async function makeShareCard(){const entry=state.pending;if(!entry?.photoBlob)throw new Error("写真がありません。");const canvas=document.createElement("canvas"),ctx=canvas.getContext("2d"),size=1080,pad=72;canvas.width=size;canvas.height=1350;ctx.fillStyle="#f4f1ea";ctx.fillRect(0,0,size,1350);const bitmap=await createImageBitmap(entry.photoBlob);const frame={x:pad,y:72,w:size-pad*2,h:690},scale=Math.max(frame.w/bitmap.width,frame.h/bitmap.height),sw=frame.w/scale,sh=frame.h/scale,sx=(bitmap.width-sw)/2,sy=(bitmap.height-sh)/2;ctx.drawImage(bitmap,sx,sy,sw,sh,frame.x,frame.y,frame.w,frame.h);bitmap.close?.();ctx.fillStyle="#385548";ctx.font='700 25px "Hiragino Kaku Gothic ProN", sans-serif';ctx.fillText("今日の寄り道",pad,858);ctx.fillStyle="#242823";ctx.font='400 64px "Yu Mincho", serif';const titleLines=wrapCanvasText(ctx,entry.title||"今日の採集",size-pad*2).slice(0,2);titleLines.forEach((line,index)=>ctx.fillText(line,pad,942+index*78));ctx.fillStyle="#5e655e";ctx.font='400 32px "Yu Mincho", serif';const bodyLines=wrapCanvasText(ctx,entry.answer||"まだ言葉にしていない。",size-pad*2).slice(0,3);bodyLines.forEach((line,index)=>ctx.fillText(line,pad,1120+index*45));ctx.strokeStyle="#c9c7bd";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(pad,1250);ctx.lineTo(size-pad,1250);ctx.stroke();ctx.fillStyle="#5e655e";ctx.font='400 24px "Hiragino Kaku Gothic ProN", sans-serif';ctx.fillText(labelDate(entry.dateKey),pad,1300);ctx.fillStyle="#af593f";ctx.font='700 27px "Yu Mincho", serif';ctx.textAlign="right";ctx.fillText("日常採集",size-pad,1300);ctx.textAlign="start";return new Promise(resolve=>canvas.toBlob(resolve,"image/png"));}
  async function saveShareCard(){const blob=await makeShareCard();if(!blob)throw new Error("共有画像を作れませんでした。");const url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download=`日常採集_${state.pending.dateKey}.png`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function shareCaption(){const entry=state.pending;return `今日、${entry.title||"一枚の景色"}を持ち帰った。${entry.answer?`\n${entry.answer}`:""}\n#日常採集`;}
  async function copyShareCaption(){try{if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(shareCaption());else{const area=document.createElement("textarea");area.value=shareCaption();document.body.append(area);area.select();document.execCommand("copy");area.remove();}toast("投稿文をコピーしました。");}catch{toast("投稿文をコピーできませんでした。");}}
  async function shareCard(){try{const blob=await makeShareCard();if(!blob)throw new Error("共有画像を作れませんでした。");const file=new File([blob],`日常採集_${state.pending.dateKey}.png`,{type:"image/png"});if(!navigator.share||!navigator.canShare?.({files:[file]})){await saveShareCard();toast("この環境では共有メニューを開けないため、画像を保存しました。");return;}await navigator.share({title:"日常採集",text:shareCaption(),files:[file]});}catch(error){if(error?.name!=="AbortError"){await saveShareCard();toast("共有メニューを開けないため、画像を保存しました。");}}}
  async function saveEntry(){if(!state.pending||state.saving)return;if(!await ensureCurrentDate())return;state.saving=true;const button=$("save-card");if(button)button.disabled=true;try{const old=await get("entries",state.pending.dateKey);if(old){if(old.kind==="photo"&&state.pending.kind==="blank")throw new Error("photo-to-blank");if(!await confirmDialog("今日の記録を更新しますか？","保存すると既存の採集記録を置き換えます。"))return;state.pending.createdAt=old.createdAt;state.pending.updatedAt=Date.now();}await put("entries",state.pending);await del("drafts",state.pending.dateKey);state.draft=null;state.pending=null;state.finishingStale=false;toast("採集帳に保存しました。");if(state.dateKey!==localDateKey()){state.dateKey=localDateKey();state.draft=await get("drafts",state.dateKey);await renderToday();}await renderCollection();navigate("collection");}catch(e){toast(e.message==="photo-to-blank"?"写真の記録を余白へ変更することはできません。":"保存できませんでした。下書きは保持しています。再試行してください。");}finally{state.saving=false;if(button)button.disabled=false;}}
  async function renderCollection(){state.collectionUrls.forEach(URL.revokeObjectURL);state.collectionUrls=[];const entries=(await all("entries")).sort((a,b)=>b.createdAt-a.createdAt); $("collection-count").textContent=`持ち帰った景色 ${entries.filter(x=>x.kind==="photo").length}枚`; const list=$("collection-list"),empty=$("collection-empty");empty.hidden=!!entries.length; list.innerHTML=""; for(const x of entries){let visual=x.kind==="photo"&&x.photoBlob?`<img alt="${esc(labelDate(x.dateKey))}の採集写真">`:x.sampleVisual?`<img class="seed-photo seed-photo-${esc(x.sampleVisual)}" src="assets/timeline-sample-strip.png" alt="${esc(labelDate(x.dateKey))}のサンプル採集写真">`:"<div class=\"entry-blank\">✳</div>"; const a=document.createElement("article");a.className="collection-entry";a.innerHTML=`${visual}<div><time>${esc(labelDate(x.dateKey))}</time><h3>${esc(x.kind==="blank"?"今日は余白にしました。":x.title||"採集記録")}</h3><p>${esc(x.answer||x.instruction||"")}</p><button type="button" class="text-button" data-delete="${x.dateKey}">削除</button></div>`; if(x.kind==="photo"&&x.photoBlob){const u=URL.createObjectURL(x.photoBlob);state.collectionUrls.push(u);a.querySelector("img").src=u;}list.append(a);} list.querySelectorAll("[data-delete]").forEach(b=>b.onclick=async()=>{if(await confirmDialog("この記録を削除しますか？","削除すると元に戻せません。")){const dateKey=b.dataset.delete;await del("entries",dateKey);await del("drafts",dateKey);if(dateKey===state.dateKey){state.draft=null;state.pending=null;}await renderCollection();}}); renderReport(entries);}
  function renderReport(entries){const eligible=entries.filter(x=>x.kind==="photo"&&x.analysisEligible!==false&&!x.legacy&&x.tags?.length).slice(0,7),title=$("perspective-title"),body=$("perspective-body"),note=$("perspective-note"),box=$("perspective-report");if(!box)return;note.textContent="採集のお題と記録から作ったモックです。写真そのものは解析していません。";let next=box.querySelector(".report-next");if(eligible.length<3){title.textContent="視点は、ゆっくり育ちます。";body.textContent="3枚以上の採集がたまると、よく持ち帰る視点をお知らせします。ノルマではありません。";next?.remove();return;}const counts=new Map(),recent=new Map();eligible.forEach((e,i)=>e.tags.forEach(t=>{counts.set(t,(counts.get(t)||0)+1);if(!recent.has(t))recent.set(t,i);}));const tag=[...counts].sort((a,b)=>b[1]-a[1]||recent.get(a[0])-recent.get(b[0]))[0][0],tpl=data.reportTemplates[tag]||{};title.textContent=tpl.headline||"あなたの視点レポート";body.textContent=tpl.body||`最近のあなたは、「${tag}」をよく持ち帰っています。`;if(tpl.nextPrompt){next??=Object.assign(document.createElement("p"),{className:"report-next"});next.textContent=tpl.nextPrompt;box.append(next);}else next?.remove();}
  async function renderFeed() { state.feedUrls.forEach(URL.revokeObjectURL); state.feedUrls = []; const entry = await get("entries", state.dateKey); const mood = state.draft?.mood || entry?.mood; const score = (postMood) => postMood === mood ? 2 : MOOD_NEIGHBORS[mood]?.includes(postMood) ? 1 : 0; const localPosts = (await rawAll("userEntries")).filter((item) => item.kind === "photo").map((item) => ({ ...item, user: TEST_USERS.find((user) => user.id === item.userId) })).filter((item) => item.user); const posts = [...(window.NICHIJO_COMMUNITY_POSTS || []), ...localPosts].sort((a, b) => score(b.mood) - score(a.mood) || b.createdAt - a.createdAt); $("feed-lead").textContent = mood ? "選んだ気分にぴったりの景色、少し近い景色の順に並べています。架空の参加者によるデモ投稿です。" : "架空の参加者10名による10日分のデモ投稿です。気分を選ぶと、近い投稿を先に並べます。"; $("feed-list").innerHTML = posts.map((post, index) => `<article class="feed-post"><header><span class="feed-avatar">${esc(post.user.name.slice(0, 1))}</span><div><h2>${esc(post.user.name)}${post.userId === state.user.id ? " <span class=\"own-label\">あなたの記録</span>" : ""}</h2><time>${esc(labelDate(post.dateKey))}</time></div></header>${post.imageUrl ? `<img class="feed-photo" src="${esc(post.imageUrl)}" alt="${esc(post.imageAlt)}">` : post.photoBlob ? `<img class="feed-photo" data-feed-photo="${index}" alt="${esc(post.title)}の採集写真">` : `<div class="feed-visual feed-visual-${esc(post.sampleVisual || "window")}" role="img" aria-label="${esc(post.title)}のサンプル写真"></div>`}<div class="feed-copy"><p>${post.fictional ? "架空の参加者によるデモ投稿" : score(post.mood) === 2 ? "いまの気分にぴったり" : score(post.mood) === 1 ? "いまの気分に少し近い" : "ちがう気分の景色"}</p><h3>${esc(post.title)}</h3><p>${esc(post.answer)}</p></div></article>`).join(""); posts.forEach((post, index) => { if (post.photoBlob) { const url = URL.createObjectURL(post.photoBlob); state.feedUrls.push(url); $("feed-list").querySelector(`[data-feed-photo="${index}"]`).src = url; } }); }
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
  async function saveProfile({ skipped = false } = {}) { const form = $("profile-form"), value = (name) => new FormData(form).get(name) || ""; state.profile = { key: `profile:${state.user.id}`, userId: state.user.id, displayName: skipped ? "" : value("displayName").trim(), ageRange: skipped ? "" : value("ageRange"), role: skipped ? "" : value("role"), lifeState: skipped ? "" : value("lifeState"), mbti: skipped ? "" : value("mbti"), visibility: "private", onboardingSeen: true, updatedAt: Date.now() }; await rawPut("meta", state.profile); renderUser(); toast(skipped ? "プロフィールは、いつでも設定できます。" : "設定を保存しました。"); await renderToday(); navigate("today"); }
  const PRESENTATION_STEPS = [
    { screen: "today", title: "気分から、今日の寄り道へ。", copy: "まず、いま得たい気分を選びます。評価や連続記録ではなく、その日の自分から始めます。" },
    { screen: "collection", title: "一枚が、視点の記憶になる。", copy: "写真と短い言葉は、10日分の採集帳として残ります。AI接続がない場合も固定の一問で体験を完走できます。" },
    { screen: "feed", title: "同じ気分の景色が届く。", copy: "いいね数やフォロワー数ではなく、いまの気分に近い人の景色を先に並べます。" },
    { screen: "collection", title: "日記でも、SNSでもない。", copy: "競争や義務感を作らず、自分と周囲の見え方を少しずつ変える体験です。" }
  ];
  async function showPresentationStep(index) { state.presentationIndex = index; const item = PRESENTATION_STEPS[index]; if (!item) { $("presentation-guide").hidden = true; state.presentationIndex = -1; return; } if (item.screen === "collection") await renderCollection(); if (item.screen === "feed") await renderFeed(); if (item.screen === "today") await renderToday(); navigate(item.screen); $("presentation-guide").hidden = false; $("presentation-step").textContent = `${index + 1} / ${PRESENTATION_STEPS.length}`; $("presentation-title").textContent = item.title; $("presentation-copy").textContent = item.copy; $("presentation-next").textContent = index === PRESENTATION_STEPS.length - 1 ? "完了" : "次へ"; }
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
    renderUser();
    $("login-screen").hidden = true;
    $("app-shell").hidden = false;
    await restore();
    navigate("today");
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
    $("start-presentation")?.addEventListener("click", async () => { await resetDemoEntries(); await startUser(TEST_USERS.find((user) => user.id === "demo-user-1")); await showPresentationStep(0); });
    $("user-menu-button")?.addEventListener("click", () => toggleUserMenu());
    $("open-profile")?.addEventListener("click", openProfile);
    $("logout-button")?.addEventListener("click", () => { toggleUserMenu(false); localStorage.removeItem(SESSION_KEY); state.user = null; state.profile = null; showLogin(); });
    $("profile-form")?.addEventListener("submit", async (event) => { event.preventDefault(); await saveProfile(); });
    $("skip-profile")?.addEventListener("click", () => saveProfile({ skipped: true }));
    $("back-from-profile")?.addEventListener("click", async () => { await renderToday(); navigate("today"); });
    $("presentation-button")?.addEventListener("click", () => showPresentationStep(0));
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
        state.draft.updatedAt = Date.now();
        await saveDraft();
        renderRecord();
        navigate("record");
        askAI();
      } catch {
        toast("画像を読み込めませんでした。別の画像を選んでください。");
      } finally {
        event.target.value = "";
      }
    });
    $("download-share-card")?.addEventListener("click", async()=>{try{await saveShareCard();toast("採集カードを保存しました。");}catch(error){toast(error.message||"画像を保存できませんでした。");}});
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
