(()=>{"use strict";
if(window.__ACLLAR_ORDEN_UNIFICADO_V16__)return;window.__ACLLAR_ORDEN_UNIFICADO_V16__=true;

const KEY="limpieza-pendientes-preferencias";
const AC=/\b[A-Z]{2,3}-\d{2,3}[A-Z]?\b/i;
const canon=x=>String(x||"").trim().toUpperCase();
const acFromText=t=>{const m=String(t||"").match(AC);return m?canon(m[0]):null};
const todayKey=()=>{const d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")};

let prefs={ordenPorFecha:{},ocultosTablet:[]};
let prefsLoaded=false,loading=false,saveTimer=null;

function normalise(v){
  const old=Array.isArray(v?.orden)?v.orden.map(canon).filter(Boolean):[];
  const byDate=(v?.ordenPorFecha&&typeof v.ordenPorFecha==="object")?v.ordenPorFecha:{};
  return {
    ordenPorFecha:Object.fromEntries(Object.entries(byDate).map(([d,a])=>[d,Array.isArray(a)?a.map(canon).filter(Boolean):[]])),
    ocultosTablet:Array.isArray(v?.ocultosTablet)?v.ocultosTablet.map(canon).filter(Boolean):[]
  };
}
function client(){return window.__ACLLAR_SUPABASE||window.supabaseClient||null}
function currentOrder(){return prefs.ordenPorFecha[todayKey()]||[]}

async function loadPrefs(){
  if(loading)return;
  const c=client();
  if(!c?.from){setTimeout(loadPrefs,1200);return}
  loading=true;
  try{
    const r=await c.from("acllar_app_data").select("key,value").eq("key",KEY).maybeSingle();
    if(!r.error&&r.data){
      try{prefs=normalise(JSON.parse(r.data.value||"{}"))}catch{}
    }
    prefsLoaded=true;
  }catch{}finally{loading=false}
}
async function savePrefs(){
  const c=client();if(!c?.from)return;
  try{
    const session=(await c.auth.getSession()).data?.session;
    const owner=session?.user?.id;if(!owner)return;
    await c.from("acllar_app_data").upsert({
      owner_id:owner,key:KEY,value:JSON.stringify(prefs),updated_at:new Date().toISOString()
    },{onConflict:"owner_id,key"});
  }catch{}
}
function queueSave(){clearTimeout(saveTimer);saveTimer=setTimeout(savePrefs,150)}
function orderedIds(ids){
  const unique=[...new Set(ids.map(canon).filter(Boolean))];
  const pos=new Map(currentOrder().map((id,i)=>[id,i]));
  if(!currentOrder().length)return unique;
  return unique.slice().sort((a,b)=>{
    const pa=pos.has(a)?pos.get(a):999999,pb=pos.has(b)?pos.get(b):999999;
    return pa-pb||unique.indexOf(a)-unique.indexOf(b);
  });
}
function mergeOrder(ids){
  const unique=[...new Set(ids.map(canon).filter(Boolean))];
  const old=currentOrder();
  return [...old.filter(id=>unique.includes(id)),...unique.filter(id=>!old.includes(id))];
}

function nativePanel(){
  const btn=[...document.querySelectorAll("button")].find(b=>{
    const t=(b.textContent||"").trim();
    return /^PENDIENTES REALES\s*·/i.test(t)&&/Se muestran todos los vehículos devueltos/i.test(t);
  });
  return btn?.closest(".rounded-xl")||btn?.parentElement||null;
}
function nativeRows(panel){
  if(!panel)return {list:null,rows:[]};
  let list=panel.querySelector(".divide-y");
  if(!list){
    list=[...panel.children].find(x=>[...x.classList].includes("divide-y"))||null;
  }
  if(!list)return {list:null,rows:[]};
  const rows=[...list.children].filter(r=>acFromText(r.textContent));
  return {list,rows};
}
function buttonBase(title){
  const b=document.createElement("button");
  b.type="button";b.title=title;
  b.style.cssText="width:29px;height:28px;border:1px solid var(--line);border-radius:7px;background:#fff;color:var(--ink);font-weight:700;font-size:13px;display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;cursor:pointer;";
  return b;
}
function eyeOff(){
  const s=document.createElement("span");
  s.setAttribute("aria-hidden","true");
  s.innerHTML='<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/><path d="m4 4 16 16"/></svg>';
  return s;
}
function eyeOn(){
  const s=document.createElement("span");
  s.setAttribute("aria-hidden","true");
  s.innerHTML='<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/></svg>';
  return s;
}
function reorderDom(list,rows,order){
  const by=new Map(rows.map(r=>[acFromText(r.textContent),r]));
  order.forEach(id=>{const row=by.get(id);if(row)list.appendChild(row)});
}
function moveNative(id,delta){
  const panel=nativePanel(),{list,rows}=nativeRows(panel);if(!list||!rows.length)return;
  const ids=rows.map(r=>acFromText(r.textContent));
  const order=mergeOrder(ids);
  const i=order.indexOf(id),j=i+delta;if(i<0||j<0||j>=order.length)return;
  [order[i],order[j]]=[order[j],order[i]];
  prefs.ordenPorFecha[todayKey()]=order;
  queueSave();reorderDom(list,rows,order);
  setTimeout(enhanceNative,80);
}
function enhanceNative(){
  const panel=nativePanel();if(!panel)return;
  const {list,rows}=nativeRows(panel);if(!list||!rows.length)return;
  const order=currentOrder();
  if(order.length)reorderDom(list,rows,orderedIds(rows.map(r=>acFromText(r.textContent))));
  const hidden=new Set(prefs.ocultosTablet||[]);
  [...list.children].filter(r=>acFromText(r.textContent)).forEach(row=>{
    const id=acFromText(row.textContent);if(!id)return;
    row.style.display="";
    let controls=row.querySelector('[data-ac-orden-controls="1"]');
    if(!controls){
      controls=document.createElement("span");
      controls.dataset.acOrdenControls="1";
      controls.style.cssText="margin-left:auto;display:flex;align-items:center;gap:4px;flex:0 0 auto;";
      const up=buttonBase("Subir prioridad");
      const down=buttonBase("Bajar prioridad");
      const hide=buttonBase("Ocultar en Tablet");
      up.textContent="▲";down.textContent="▼";
      hide.appendChild(eyeOff());
      up.onclick=e=>{e.preventDefault();e.stopPropagation();moveNative(id,-1)};
      down.onclick=e=>{e.preventDefault();e.stopPropagation();moveNative(id,1)};
      hide.onclick=e=>{
        e.preventDefault();e.stopPropagation();
        const set=new Set(prefs.ocultosTablet||[]);
        if(set.has(id)){set.delete(id);hide.title="Ocultar en Tablet";hide.replaceChildren(eyeOff())}
        else{set.add(id);hide.title="Mostrar en Tablet";hide.replaceChildren(eyeOn())}
        prefs.ocultosTablet=[...set];queueSave();
      };
      controls.append(up,down,hide);row.appendChild(controls);
    }
    const hide=controls.lastElementChild;
    const isHidden=hidden.has(id);
    hide.title=isHidden?"Mostrar en Tablet":"Ocultar en Tablet";
    hide.replaceChildren(isHidden?eyeOn():eyeOff());
  });
}
function tabletRows(){
  if(!/\/tablet(?:\/|$)/i.test(location.pathname))return [];
  const out=[];
  for(const el of [...document.querySelectorAll("button")]){
    const id=acFromText(el.textContent);
    if(!id||!el.closest("#root"))continue;
    const txt=(el.textContent||"").trim().toUpperCase();
    if(!txt.startsWith(id))continue;
    out.push(el);
  }
  return [...new Set(out)];
}
function applyTablet(){
  const rows=tabletRows();if(!rows.length)return;
  const hidden=new Set(prefs.ocultosTablet||[]);
  rows.forEach(el=>{const id=acFromText(el.textContent);el.style.display=hidden.has(id)?"none":""});
  const visible=rows.filter(el=>!hidden.has(acFromText(el.textContent)));
  const byParent=new Map();
  visible.forEach(el=>{const p=el.parentElement;if(p)byParent.set(p,[...(byParent.get(p)||[]),el])});
  for(const [parent,items] of byParent){
    if(items.length<2)continue;
    const order=orderedIds(items.map(x=>acFromText(x.textContent)));
    const by=new Map(items.map(x=>[acFromText(x.textContent),x]));
    order.forEach(id=>{const el=by.get(id);if(el)parent.appendChild(el)});
  }
}
async function tick(){
  if(!prefsLoaded)await loadPrefs();
  if(/\/tablet(?:\/|$)/i.test(location.pathname))applyTablet();
  else enhanceNative();
}
tick();setInterval(tick,1000);
})();