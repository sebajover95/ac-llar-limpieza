(()=>{"use strict";
if(window.__ACLLAR_ORDEN_UNIFICADO__)return;window.__ACLLAR_ORDEN_UNIFICADO__=true;

const KEY="limpieza-pendientes-preferencias";
const AC=/\bAC-\d{3}[A-Z]?\b/i;
const supa=()=>window.__ACLLAR_SUPABASE||window.supabaseClient||null;
const canon=x=>String(x||"").trim().toUpperCase();
const acFromText=t=>{const m=String(t||"").match(AC);return m?canon(m[0]):null};

let prefs={orden:[],ocultosTablet:[]};
let prefsLoaded=false;
let saveTimer=null;

async function loadPrefs(){
  const c=supa(); if(!c?.from)return prefs;
  try{
    const r=await c.from("acllar_app_data").select("key,value").eq("key",KEY).maybeSingle();
    if(!r.error&&r.data){
      const v=JSON.parse(r.data.value||"{}");
      prefs={
        orden:Array.isArray(v?.orden)?v.orden.map(canon).filter(Boolean):[],
        ocultosTablet:Array.isArray(v?.ocultosTablet)?v.ocultosTablet.map(canon).filter(Boolean):[]
      };
    }
  }catch{}
  prefsLoaded=true;
  return prefs;
}
async function savePrefs(next){
  prefs={
    orden:Array.isArray(next.orden)?next.orden.map(canon).filter(Boolean):[],
    ocultosTablet:Array.isArray(next.ocultosTablet)?next.ocultosTablet.map(canon).filter(Boolean):[]
  };
  const c=supa(); if(!c?.from)return;
  try{
    const session=(await c.auth.getSession()).data?.session;
    const owner=session?.user?.id;
    if(!owner)return;
    await c.from("acllar_app_data").upsert(
      {owner_id:owner,key:KEY,value:JSON.stringify(prefs),updated_at:new Date().toISOString()},
      {onConflict:"owner_id,key"}
    );
  }catch{}
}
function scheduleSave(next){
  prefs=next;
  clearTimeout(saveTimer);
  saveTimer=setTimeout(()=>savePrefs(prefs),120);
}
function orderedIds(ids){
  const unique=[...new Set(ids.map(canon).filter(Boolean))];
  const pos=new Map((prefs.orden||[]).map((id,i)=>[id,i]));
  return unique.slice().sort((a,b)=>{
    const pa=pos.has(a)?pos.get(a):999999;
    const pb=pos.has(b)?pos.get(b):999999;
    return pa-pb||unique.indexOf(a)-unique.indexOf(b);
  });
}
function mergeOrder(ids){
  const unique=[...new Set(ids.map(canon).filter(Boolean))];
  const current=prefs.orden||[];
  return [...current.filter(x=>unique.includes(x)),...unique.filter(x=>!current.includes(x))];
}

function removeLegacyPanels(){
  document.querySelectorAll('[id^="orden-ac-"]').forEach(x=>x.remove());
}

function nativePanel(){
  return [...document.querySelectorAll("button")].find(b=>{
    const t=(b.textContent||"").trim();
    return /^PENDIENTES REALES\s*·/i.test(t)&&t.includes("Se muestran todos los vehículos devueltos");
  })?.parentElement||null;
}
function nativeRows(panel){
  const list=panel?.querySelector(".divide-y");
  if(!list)return {list:null,rows:[]};
  const rows=[...list.children].filter(r=>acFromText(r.textContent));
  return {list,rows};
}
function styleBtn(b,title,txt){
  b.type="button"; b.title=title; b.textContent=txt;
  b.style.cssText="width:30px;height:28px;border:1px solid var(--line);border-radius:7px;background:#fff;color:var(--ink);font-weight:700;font-size:13px;display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;";
}
function applyNativeOrder(panel){
  const {list,rows}=nativeRows(panel); if(!list||!rows.length)return;
  const ids=rows.map(r=>acFromText(r.textContent));
  const wanted=orderedIds(ids);
  const by=new Map(rows.map(r=>[acFromText(r.textContent),r]));
  wanted.forEach(id=>{const row=by.get(id);if(row)list.appendChild(row)});
  const full=mergeOrder(ids);
  if(JSON.stringify(full)!==JSON.stringify(prefs.orden)){
    prefs.orden=full;
    scheduleSave(prefs);
  }
}
function enhanceNative(){
  removeLegacyPanels();
  const panel=nativePanel(); if(!panel)return;
  const {list,rows}=nativeRows(panel); if(!list||!rows.length)return;
  applyNativeOrder(panel);
  const hidden=new Set(prefs.ocultosTablet||[]);
  rows.forEach((row)=>{
    const id=acFromText(row.textContent); if(!id)return;
    if(row.dataset.acOrdenUnificado==="1")return;
    row.dataset.acOrdenUnificado="1";
    row.style.flexWrap="wrap";
    const controls=document.createElement("span");
    controls.dataset.acOrdenControls="1";
    controls.style.cssText="margin-left:auto;display:flex;align-items:center;gap:4px;flex:0 0 auto;";
    const up=document.createElement("button"),down=document.createElement("button"),hide=document.createElement("button");
    styleBtn(up,"Subir prioridad","▲"); styleBtn(down,"Bajar prioridad","▼");
    hide.style.cssText="height:28px;padding:0 7px;border:1px solid var(--line);border-radius:7px;background:#fff;color:var(--ink);font-size:10px;font-weight:600;display:inline-flex;align-items:center;justify-content:center;";
    hide.title=hidden.has(id)?"Mostrar en Tablet":"Ocultar en Tablet";
    hide.textContent=hidden.has(id)?"🚫":"👁";
    controls.append(up,down,hide); row.appendChild(controls);

    up.onclick=(ev)=>{ev.stopPropagation(); moveNative(id,-1)};
    down.onclick=(ev)=>{ev.stopPropagation(); moveNative(id,1)};
    hide.onclick=(ev)=>{
      ev.stopPropagation();
      const set=new Set(prefs.ocultosTablet||[]);
      set.has(id)?set.delete(id):set.add(id);
      hide.textContent=set.has(id)?"🚫":"👁";
      hide.title=set.has(id)?"Mostrar en Tablet":"Ocultar en Tablet";
      prefs.ocultosTablet=[...set];
      scheduleSave(prefs);
    };
  });
}
async function moveNative(id,delta){
  const panel=nativePanel(); const {list,rows}=nativeRows(panel); if(!list)return;
  const ids=rows.map(r=>acFromText(r.textContent));
  const order=mergeOrder(ids);
  const i=order.indexOf(id),j=i+delta;
  if(i<0||j<0||j>=order.length)return;
  [order[i],order[j]]=[order[j],order[i]];
  prefs.orden=order;
  scheduleSave(prefs);
  const by=new Map(rows.map(r=>[acFromText(r.textContent),r]));
  order.forEach(x=>{if(by.has(x))list.appendChild(by.get(x))});
  setTimeout(enhanceNative,50);
}

function tabletRows(){
  const out=[];
  for(const b of [...document.querySelectorAll("button")]){
    const id=acFromText(b.textContent);
    if(!id||!/^AC-\d{3}[A-Z]?$/i.test(id))continue;
    if(!b.textContent.trim().toUpperCase().startsWith(id))continue;
    if(!b.closest("#root"))continue;
    out.push(b);
  }
  return [...new Set(out)];
}
function applyTablet(){
  if(!/\/tablet(?:\/|$)/i.test(location.pathname))return;
  const rows=tabletRows(); if(!rows.length)return;
  const hidden=new Set(prefs.ocultosTablet||[]);
  rows.forEach(b=>{
    const id=acFromText(b.textContent); if(!id)return;
    b.style.display=hidden.has(id)?"none":"";
  });
  const visible=rows.filter(b=>!hidden.has(acFromText(b.textContent)));
  const groups=new Map();
  visible.forEach(b=>{const p=b.parentElement;if(p)groups.set(p,(groups.get(p)||[]).concat(b))});
  for(const [parent,items] of groups){
    if(items.length<2)continue;
    const wanted=orderedIds(items.map(b=>acFromText(b.textContent)));
    const by=new Map(items.map(b=>[acFromText(b.textContent),b]));
    wanted.forEach(id=>{const b=by.get(id);if(b)parent.appendChild(b)});
  }
}
async function tick(){
  if(!prefsLoaded)await loadPrefs();
  if(/\/tablet(?:\/|$)/i.test(location.pathname))applyTablet();
  else enhanceNative();
}
tick();
setInterval(tick,1800);
})();