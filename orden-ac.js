(()=>{"use strict";
if(window.__ACLLAR_ORDEN_UNIFICADO_V18__)return;window.__ACLLAR_ORDEN_UNIFICADO_V18__=true;

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
function panelDateKey(panel){
  try{
    const t=(panel?.querySelector("button")?.textContent||"").trim();
    const m=t.match(/(\d{1,2})\s*\/\s*(\d{1,2})/);
    if(!m)return todayKey();
    const now=new Date(),y=now.getFullYear(),mo=Number(m[2]),d=Number(m[1]);
    let yy=y;
    if(now.getMonth()+1===1&&mo===12)yy=y-1;
    if(now.getMonth()+1===12&&mo===1)yy=y+1;
    return yy+"-"+String(mo).padStart(2,"0")+"-"+String(d).padStart(2,"0");
  }catch{return todayKey()}
}
function currentOrder(dayKey=todayKey()){return prefs.ordenPorFecha[dayKey]||[]}

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
function orderedIds(ids,dayKey=todayKey()){
  const unique=[...new Set(ids.map(canon).filter(Boolean))];
  const saved=currentOrder(dayKey);
  const pos=new Map(saved.map((id,i)=>[id,i]));
  if(!saved.length)return unique;
  return unique.slice().sort((a,b)=>{
    const pa=pos.has(a)?pos.get(a):999999,pb=pos.has(b)?pos.get(b):999999;
    return pa-pb||unique.indexOf(a)-unique.indexOf(b);
  });
}
function mergeOrder(ids,dayKey=todayKey()){
  const unique=[...new Set(ids.map(canon).filter(Boolean))];
  const old=currentOrder(dayKey);
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

  // React cambia las clases de estas filas con frecuencia. Las detectamos
  // por su contenido: una sola AC + la información "sale ..." / "volvió ...".
  const all=[...panel.querySelectorAll("div")];
  const candidates=all.filter(r=>{
    const txt=(r.textContent||"").replace(/\s+/g," ").trim();
    const ids=txt.match(/\b[A-Z]{2,3}-\d{2,3}[A-Z]?\b/gi)||[];
    return ids.length===1 && /\bsale\b/i.test(txt) && txt.length<120;
  });

  // Nos quedamos con el elemento más pequeño para cada fila visual.
  const rows=[];
  for(const r of candidates){
    const id=acFromText(r.textContent);
    if(!id)continue;
    const child=candidates.find(x=>x!==r && r.contains(x) && acFromText(x.textContent)===id);
    if(!child)rows.push(r);
  }
  if(rows.length){
    const list=rows[0].parentElement;
    return {list,rows};
  }

  // Fallback para versiones anteriores de la UI.
  const list=panel.querySelector(".divide-y")||[...panel.children].find(x=>[...x.classList].includes("divide-y"))||null;
  if(!list)return {list:null,rows:[]};
  return {list,rows:[...list.children].filter(r=>acFromText(r.textContent))};
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
async function persistPriorities(dayKey,order){
  const c=client();if(!c?.from)return;
  try{
    const r=await c.from("limpieza_plan").select("id,ac_id").eq("fecha",dayKey);
    if(r.error)throw r.error;
    const by=new Map((r.data||[]).map(x=>[canon(x.ac_id),x.id]));
    for(let i=0;i<order.length;i++){
      const rowId=by.get(canon(order[i]));
      if(rowId){
        const up=await c.from("limpieza_plan").update({prioridad:i}).eq("id",rowId);
        if(up.error)throw up.error;
      }
    }
  }catch(e){console.warn("No se pudo guardar el orden de las AC en limpieza_plan:",e)}
}
async function moveNative(id,delta){
  const panel=nativePanel(),{list,rows}=nativeRows(panel);if(!list||!rows.length)return;
  const dayKey=panelDateKey(panel);
  const ids=rows.map(r=>acFromText(r.textContent));
  const order=mergeOrder(ids,dayKey);
  const i=order.indexOf(id),j=i+delta;if(i<0||j<0||j>=order.length)return;
  [order[i],order[j]]=[order[j],order[i]];
  prefs.ordenPorFecha[dayKey]=order;
  queueSave();
  reorderDom(list,rows,order);
  await persistPriorities(dayKey,order);
  setTimeout(enhanceNative,80);
}
function cleaningRows(){
  // En la UI real de "A LIMPIAR", el botón de limpieza está dentro
  // de la propia fila. No buscamos ancestros ni texto auxiliar:
  // el padre directo del checkbox ES la fila que queremos mejorar.
  const found=new Map();
  const checks=[...document.querySelectorAll(
    'button[aria-label="Marcar como limpiada"],button[aria-label="Desmarcar limpieza"]'
  )];
  for(const check of checks){
    const row=check.parentElement;
    if(!row)continue;
    const id=acFromText(row.textContent);
    if(!id)continue;
    found.set(id,row);
  }
  return [...found.entries()].map(([id,row])=>({id,row}));
}
function cleaningDayKey(){
  const h=[...document.querySelectorAll("div,span,h1,h2,h3")].find(x=>/^A LIMPIAR\s*\(/i.test((x.textContent||"").trim()));
  return h?panelDateKey(h.closest(".rounded-xl")||h.parentElement):todayKey();
}
function renderPriorityOverlays(){
  // Las flechas forman parte de cada tarjeta de "A LIMPIAR".
  document.querySelectorAll("[data-ac-priority-controls]").forEach(x=>x.remove());
  const rows=cleaningRows();
  if(!rows.length)return;
  const dayKey=cleaningDayKey();
  const order=orderedIds(rows.map(x=>x.id),dayKey);
  const byId=new Map(rows.map(x=>[x.id,x.row]));
  const visible=order.map(id=>byId.get(id)).filter(Boolean);
  visible.forEach((row,index)=>{
    const id=acFromText(row.textContent);
    if(!id)return;
    const box=document.createElement("span");
    box.dataset.acPriorityControls="1";
    box.style.cssText="display:inline-flex;align-items:center;gap:3px;flex:0 0 auto;margin-left:2px;";
    const up=buttonBase("Subir prioridad"),down=buttonBase("Bajar prioridad");
    up.textContent="▲";down.textContent="▼";
    up.style.width="27px";down.style.width="27px";
    up.style.height="26px";down.style.height="26px";
    up.disabled=index===0;down.disabled=index===visible.length-1;
    if(up.disabled)up.style.opacity=".35";
    if(down.disabled)down.style.opacity=".35";
    up.onclick=e=>{e.preventDefault();e.stopPropagation();moveCleaning(id,-1)};
    down.onclick=e=>{e.preventDefault();e.stopPropagation();moveCleaning(id,1)};
    box.append(up,down);
    const checkbox=row.querySelector("button");
    if(checkbox)row.insertBefore(box,checkbox.nextSibling);
    else row.insertBefore(box,row.firstChild);
  });
}
function enhanceCleaningOrder(){
  renderPriorityOverlays();
}
async function moveCleaning(id,delta){
  const rows=cleaningRows();
  if(!rows.length)return;
  const item=rows.find(x=>x.id===id);
  const list=item?.row.parentElement;
  if(!list)return;
  const items=rows.filter(x=>x.row.parentElement===list);
  const dayKey=(()=>{
    const h=[...document.querySelectorAll("div,span,h1,h2,h3")].find(x=>/^A LIMPIAR\s*\(/i.test((x.textContent||"").trim()));
    return h?panelDateKey(h.closest(".rounded-xl")||h.parentElement):todayKey();
  })();
  const order=mergeOrder(items.map(x=>x.id),dayKey);
  const i=order.indexOf(id),j=i+delta;
  if(i<0||j<0||j>=order.length)return;
  [order[i],order[j]]=[order[j],order[i]];
  prefs.ordenPorFecha[dayKey]=order;
  queueSave();
  const by=new Map(items.map(x=>[x.id,x.row]));
  order.forEach(ac=>{const row=by.get(ac);if(row)list.appendChild(row)});
  await persistPriorities(dayKey,order);
}
function enhanceNative(){
  const panel=nativePanel();if(!panel)return;
  const {list,rows}=nativeRows(panel);if(!list||!rows.length)return;
  const dayKey=panelDateKey(panel);
  const order=currentOrder(dayKey);
  if(order.length)reorderDom(list,rows,orderedIds(rows.map(r=>acFromText(r.textContent)),dayKey));
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
    const order=orderedIds(items.map(x=>acFromText(x.textContent)),todayKey());
    const by=new Map(items.map(x=>[acFromText(x.textContent),x]));
    order.forEach(id=>{const el=by.get(id);if(el)parent.appendChild(el)});
  }
}
async function tick(){
  if(!prefsLoaded)await loadPrefs();
  if(/\/tablet(?:\/|$)/i.test(location.pathname))applyTablet();
  else { enhanceNative(); enhanceCleaningOrder(); }
}
tick();setInterval(tick,1000);
/* AC·LLAR · identificador de sesión y cambio de usuario */
(()=>{
  "use strict";
  if(window.__ACLLAR_SESSION_UI__)return;
  window.__ACLLAR_SESSION_UI__=true;

  const sb=()=>window.__ACLLAR_SUPABASE||null;
  const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));

  function ensureButton(){
    if(document.getElementById("acllar-session-settings"))return;
    const b=document.createElement("button");
    b.id="acllar-session-settings";
    b.type="button";
    b.setAttribute("aria-label","Configuración y sesión");
    b.title="Sesión y configuración";
    b.innerHTML='<span style="font-size:20px;line-height:1">⚙</span>';
    b.style.cssText=[
      "position:fixed","right:14px","bottom:14px","z-index:2147483647",
      "width:44px","height:44px","border-radius:50%","border:1px solid #E3E7E9",
      "background:#fff","color:#3A1F0F","box-shadow:0 5px 20px rgba(32,39,43,.18)",
      "display:flex","align-items:center","justify-content:center","cursor:pointer"
    ].join(";");
    b.onclick=openPanel;
    document.body.appendChild(b);
  }

  async function getSessionInfo(){
    const c=sb();
    if(!c?.auth)return null;
    try{
      const r=await c.auth.getSession();
      const session=r.data?.session;
      if(!session?.user)return null;
      let role="—";
      try{
        const p=await c.from("profiles").select("rol").eq("id",session.user.id).maybeSingle();
        if(p.data?.rol)role=p.data.rol;
      }catch{}
      return {email:session.user.email||"—",role,userId:session.user.id,expires:session.expires_at};
    }catch{return null}
  }

  function closePanel(){
    document.getElementById("acllar-session-panel")?.remove();
  }

  async function openPanel(){
    closePanel();
    const panel=document.createElement("div");
    panel.id="acllar-session-panel";
    panel.style.cssText=[
      "position:fixed","right:14px","bottom:68px","z-index:2147483647",
      "width:min(340px,calc(100vw - 28px))","background:#fff",
      "border:1px solid #E3E7E9","border-radius:16px","padding:16px",
      "box-shadow:0 14px 45px rgba(32,39,43,.22)",
      "font-family:Inter,system-ui,-apple-system,sans-serif","color:#20272B"
    ].join(";");
    panel.innerHTML='<div style="font-weight:700;font-size:15px">Sesión activa</div><div style="margin-top:10px;color:#66727A;font-size:12px">Comprobando…</div>';
    document.body.appendChild(panel);

    const info=await getSessionInfo();
    if(!info){
      panel.innerHTML='<div style="font-weight:700;font-size:15px">Sin sesión</div><div style="margin-top:8px;color:#66727A;font-size:12px">No hay una cuenta iniciada en este dispositivo.</div><button id="acllar-session-close" type="button" style="margin-top:12px;width:100%;height:38px;border:1px solid #E3E7E9;border-radius:9px;background:#fff;font-weight:600">Cerrar</button>';
      document.getElementById("acllar-session-close").onclick=closePanel;
      return;
    }

    const roleLabel={gestion:"Gestión",limpieza:"Limpieza",lavadero:"Lavadero"}[info.role]||info.role;
    panel.innerHTML=
      '<div style="font-weight:700;font-size:15px">Sesión activa</div>'+
      '<div style="margin-top:12px;padding:11px;border-radius:11px;background:#F5F7F8;border:1px solid #E3E7E9">'+
        '<div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#66727A">Usuario</div>'+
        '<div style="margin-top:3px;font-size:14px;font-weight:600;word-break:break-word">'+esc(info.email)+'</div>'+
        '<div style="margin-top:9px;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#66727A">Rol</div>'+
        '<div style="margin-top:3px;font-size:14px;font-weight:600">'+esc(roleLabel)+'</div>'+
      '</div>'+
      '<div style="margin-top:10px;color:#66727A;font-size:11px">Esta es la cuenta guardada en este dispositivo. El acceso a las secciones depende de su rol.</div>'+
      '<button id="acllar-session-switch" type="button" style="margin-top:12px;width:100%;height:40px;border:0;border-radius:9px;background:#3A1F0F;color:#fff;font-weight:600">Cerrar sesión / cambiar usuario</button>'+
      '<button id="acllar-session-close" type="button" style="margin-top:7px;width:100%;height:36px;border:1px solid #E3E7E9;border-radius:9px;background:#fff;font-weight:600">Cerrar</button>';

    document.getElementById("acllar-session-close").onclick=closePanel;
    document.getElementById("acllar-session-switch").onclick=async()=>{
      const btn=document.getElementById("acllar-session-switch");
      btn.disabled=true;btn.textContent="Cerrando sesión…";
      try{await sb().auth.signOut()}catch{}
      location.reload();
    };
  }

  ensureButton();
  setInterval(ensureButton,3000);
})();

})();