(() => {
  "use strict";

  const DB_NAME = "nichijo-shusai", DB_VERSION = 1, LEGACY_KEY = "nichijo-shusai-cards-v1";
  const $ = (id) => document.getElementById(id);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const data = window.NICHIJO_DATA || { moods: [], missions: [], reportTemplates: {} };
  const state = { screen: "today", dateKey: localDateKey(), draft: null, pending: null, objectUrl: null, collectionUrls: [], saving: false, finishingStale: false };
  let db;

  function localDateKey(d = new Date()) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
  function labelDate(k = localDateKey()) { const [y,m,d]=k.split("-").map(Number); return new Intl.DateTimeFormat("ja-JP",{year:"numeric",month:"long",day:"numeric",weekday:"short"}).format(new Date(y,m-1,d)); }
  const esc = (v="") => String(v).replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
  function toast(message) { const el=$("toast"); if (!el) return; el.textContent=message; el.classList.add("is-visible"); clearTimeout(toast.t); toast.t=setTimeout(()=>el.classList.remove("is-visible"),3000); }
  function openDB() { return new Promise((resolve,reject)=>{ const r=indexedDB.open(DB_NAME,DB_VERSION); r.onupgradeneeded=()=>{const d=r.result; if(!d.objectStoreNames.contains("entries"))d.createObjectStore("entries",{keyPath:"dateKey"}); if(!d.objectStoreNames.contains("drafts"))d.createObjectStore("drafts",{keyPath:"dateKey"}); if(!d.objectStoreNames.contains("meta"))d.createObjectStore("meta",{keyPath:"key"});}; r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error); }); }
  function tx(store, mode, fn) { return new Promise((resolve,reject)=>{ const t=db.transaction(store,mode), s=t.objectStore(store); let result; try { result=fn(s); } catch(e){reject(e);return;} t.oncomplete=()=>resolve(result); t.onerror=()=>reject(t.error); }); }
  const get = (s,k) => new Promise((resolve,reject)=>{const r=db.transaction(s).objectStore(s).get(k);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  const all = (s) => new Promise((resolve,reject)=>{const r=db.transaction(s).objectStore(s).getAll();r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error);});
  const put = (s,v) => tx(s,"readwrite",x=>x.put(v));
  const del = (s,k) => tx(s,"readwrite",x=>x.delete(k));
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
  async function chooseProposal(index=0) { if(!await ensureCurrentDate())return; const mood=$("mood-form")?.querySelector('input[name="mood"]:checked')?.value; if(!mood){toast("これから得たい気分をひとつ選んでください。");return;} const m=await pickMission(mood,index); state.draft={dateKey:state.dateKey,mood,missionId:m.id,suggestionIndex:index,mode:"outdoor",status:"proposal",answer:"",startedAt:Date.now(),updatedAt:Date.now()}; await saveDraft(); renderProposal(); }
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
  function renderProposal(){const d=state.draft,m=missionById(d?.missionId); if(!m)return; $("proposal-mood").textContent=(data.moods.find(x=>(x.id||x.value)===d.mood)?.label)||d.mood; $("mission-duration").textContent=`${m.durationMinutes}分`; $("mission-mode").textContent=d.mode==="indoor"?"室内版":"屋外"; $("toggle-indoor").textContent=d.mode==="indoor"?"屋外版にする":"室内版にする"; $("mission-title").textContent=m.title; $("mission-instruction").textContent=d.mode==="indoor"?m.indoorInstruction:m.instruction; $("mood-step").hidden=true; $("proposal-step").hidden=false; $("active-step").hidden=true;}
  function renderActive(){const m=missionById(state.draft?.missionId);if(!m)return; $("active-mission-title").textContent=m.title; $("active-mission-instruction").textContent=state.draft.mode==="indoor"?m.indoorInstruction:m.instruction; $("active-mission-meta").textContent=`${m.durationMinutes}分 · ${state.draft.mode==="indoor"?"室内版":"屋外"}`; $("capture-photo").innerHTML=state.draft.photoBlob?'選んだ一枚を確認する <span aria-hidden="true">→</span>':'一枚を持ち帰る <span aria-hidden="true">＋</span>'; $("mood-step").hidden=true;$("proposal-step").hidden=true;$("active-step").hidden=false;}
  function preview(blob){const img=$("photo-preview");if(!img)return;if(state.objectUrl)URL.revokeObjectURL(state.objectUrl);state.objectUrl=blob?URL.createObjectURL(blob):null;img.src=state.objectUrl||"";img.hidden=!blob;const placeholder=img.parentElement?.querySelector(".photo-placeholder");if(placeholder)placeholder.hidden=Boolean(blob);}
  function renderRecord(){const m=missionById(state.draft?.missionId);preview(state.draft?.photoBlob); $("question-text").textContent=m?.question||"今日、何に気づきましたか？"; const a=$("answer-input");a.value=state.draft?.answer||""; $("answer-count").textContent=`${a.value.length} / 120`;}
  function makeEntry(kind){const m=missionById(state.draft.missionId); return {dateKey:state.draft.dateKey||state.dateKey,kind,missionId:m?.id||null,noveltyType:m?.noveltyType||null,tags:kind==="photo"?(m?.perspectiveTags||[]):[],analysisEligible:kind==="photo",mood:state.draft.mood,mode:state.draft.mode,answer:state.draft.answer||"",question:m?.question||"",title:m?.title||"",instruction:state.draft.mode==="indoor"?(m?.indoorInstruction||""):(m?.instruction||""),photoBlob:kind==="photo"?state.draft.photoBlob:null,createdAt:Date.now(),updatedAt:Date.now(),legacy:false};}
  function renderCard(){const x=state.pending;const el=$("daily-card"); if(!x||!el)return; if(x.kind==="blank"){el.innerHTML=`<div class="daily-card-blank"><span>✳</span><p>余白の日</p><h2>今日は、<em>余白にしました。</em></h2><time>${esc(labelDate(x.dateKey))}</time></div>`;return;} preview(x.photoBlob); const u=state.objectUrl;el.innerHTML=`<img class="daily-card-photo" src="${u}" alt="今日選んだ写真"><div class="daily-card-copy"><p>今日の寄り道</p><h2>${esc(x.title)}</h2><p>${esc(x.answer||"まだ言葉にしていない。")}</p></div>`;}
  async function saveEntry(){if(!state.pending||state.saving)return;if(!await ensureCurrentDate())return;state.saving=true;const button=$("save-card");if(button)button.disabled=true;try{const old=await get("entries",state.pending.dateKey);if(old){if(old.kind==="photo"&&state.pending.kind==="blank")throw new Error("photo-to-blank");if(!await confirmDialog("今日の記録を更新しますか？","保存すると既存の採集記録を置き換えます。"))return;state.pending.createdAt=old.createdAt;state.pending.updatedAt=Date.now();}await put("entries",state.pending);await del("drafts",state.pending.dateKey);state.draft=null;state.pending=null;state.finishingStale=false;toast("採集帳に保存しました。");if(state.dateKey!==localDateKey()){state.dateKey=localDateKey();state.draft=await get("drafts",state.dateKey);await renderToday();}await renderCollection();navigate("collection");}catch(e){toast(e.message==="photo-to-blank"?"写真の記録を余白へ変更することはできません。":"保存できませんでした。下書きは保持しています。再試行してください。");}finally{state.saving=false;if(button)button.disabled=false;}}
  async function renderCollection(){state.collectionUrls.forEach(URL.revokeObjectURL);state.collectionUrls=[];const entries=(await all("entries")).sort((a,b)=>b.createdAt-a.createdAt); $("collection-count").textContent=`持ち帰った景色 ${entries.filter(x=>x.kind==="photo").length}枚`; const list=$("collection-list"),empty=$("collection-empty");empty.hidden=!!entries.length; list.innerHTML=""; for(const x of entries){let visual=x.kind==="photo"&&x.photoBlob?`<img alt="${esc(labelDate(x.dateKey))}の採集写真">`:"<div class=\"entry-blank\">✳</div>"; const a=document.createElement("article");a.className="collection-entry";a.innerHTML=`${visual}<div><time>${esc(labelDate(x.dateKey))}</time><h3>${esc(x.kind==="blank"?"今日は余白にしました。":x.title||"採集記録")}</h3><p>${esc(x.answer||x.instruction||"")}</p><button type="button" class="text-button" data-delete="${x.dateKey}">削除</button></div>`; if(x.kind==="photo"&&x.photoBlob){const u=URL.createObjectURL(x.photoBlob);state.collectionUrls.push(u);a.querySelector("img").src=u;}list.append(a);} list.querySelectorAll("[data-delete]").forEach(b=>b.onclick=async()=>{if(await confirmDialog("この記録を削除しますか？","削除すると元に戻せません。")){await del("entries",b.dataset.delete);await renderCollection();}}); renderReport(entries);}
  function renderReport(entries){const eligible=entries.filter(x=>x.kind==="photo"&&x.analysisEligible!==false&&!x.legacy&&x.tags?.length).slice(0,7),title=$("perspective-title"),body=$("perspective-body"),note=$("perspective-note"),box=$("perspective-report");if(!box)return;note.textContent="採集のお題と記録から作ったモックです。写真そのものは解析していません。";let next=box.querySelector(".report-next");if(eligible.length<3){title.textContent="視点は、ゆっくり育ちます。";body.textContent="3枚以上の採集がたまると、よく持ち帰る視点をお知らせします。ノルマではありません。";next?.remove();return;}const counts=new Map(),recent=new Map();eligible.forEach((e,i)=>e.tags.forEach(t=>{counts.set(t,(counts.get(t)||0)+1);if(!recent.has(t))recent.set(t,i);}));const tag=[...counts].sort((a,b)=>b[1]-a[1]||recent.get(a[0])-recent.get(b[0]))[0][0],tpl=data.reportTemplates[tag]||{};title.textContent=tpl.headline||"あなたの視点レポート";body.textContent=tpl.body||`最近のあなたは、「${tag}」をよく持ち帰っています。`;if(tpl.nextPrompt){next??=Object.assign(document.createElement("p"),{className:"report-next"});next.textContent=tpl.nextPrompt;box.append(next);}else next?.remove();}
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
        state.draft.updatedAt = Date.now();
        await saveDraft();
        renderRecord();
        navigate("record");
      } catch {
        toast("画像を読み込めませんでした。別の画像を選んでください。");
      } finally {
        event.target.value = "";
      }
    });
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
      await tx("entries", "readwrite", (store) => store.clear());
      await tx("drafts", "readwrite", (store) => store.clear());
      state.draft = null;
      state.pending = null;
      await renderCollection();
      toast("採集帳をリセットしました。");
    });
    $$('[data-screen-link]').forEach((item) => item.addEventListener("click", async (event) => {
      event.preventDefault();
      const name = item.dataset.screenLink;
      if (name === "collection") await renderCollection();
      if (name === "today") await renderToday();
      navigate(name);
    }));
  }

  (async()=>{try{db=await openDB();await migrate();bind();await restore();}catch(e){console.error(e);toast("このブラウザでは保存を初期化できませんでした。");}})();
})();
