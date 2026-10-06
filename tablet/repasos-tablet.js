(function(){
"use strict";
const sb=window.__ACLLAR_SUPABASE;
if(!sb)return;
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const css=`
#acllar-repaso-tab{position:fixed;right:14px;top:14px;z-index:99990;border:0;border-radius:14px;padding:12px 15px;background:#c24b3f;color:#fff;font:800 14px Inter,system-ui;box-shadow:0 6px 20px rgba(0,0,0,.18);display:none}
#acllar-repaso-badge{display:inline-flex;min-width:22px;height:22px;margin-left:7px;align-items:center;justify-content:center;border-radius:999px;background:#fff;color:#c24b3f;font:800 12px Inter}
#acllar-repaso-modal{position:fixed;inset:0;z-index:99999;background:rgba(21,48,43,.55);display:none;align-items:flex-start;justify-content:center;padding:14px;overflow:auto}
#acllar-repaso-card{width:min(760px,100%);margin-top:8px;background:#e7ece8;border-radius:22px;padding:18px;box-shadow:0 20px 60px rgba(0,0,0,.3);font-family:Inter,system-ui;color:#15302b}
.acr-row{background:#fff;border:1px solid #d6ded8;border-radius:16px;padding:14px;margin-top:10px}.acr-btn{border:0;border-radius:12px;padding:12px 15px;font-weight:800;cursor:pointer}.acr-primary{background:#2f8f7c;color:#fff}.acr-muted{background:#fff;border:1px solid #d6ded8;color:#15302b}.acr-photo{display:block;width:100%;max-height:330px;object-fit:contain;border-radius:12px;margin-top:9px;background:#eef2ef;border:1px solid #d6ded8}
`;
const st=document.createElement("style");st.textContent=css;document.head.appendChild(st);
const tab=document.createElement("button");tab.id="acllar-repaso-tab";tab.innerHTML='REPASAR VEHÍCULOS <span id="acllar-repaso-badge">0</span>';document.body.appendChild(tab);
const modal=document.createElement("div");modal.id="acllar-repaso-modal";modal.innerHTML=`<div id="acllar-repaso-card"><div style="display:flex;align-items:center;gap:10px"><div style="flex:1;font-size:22px;font-weight:800">REPASAR VEHÍCULOS</div><button id="acr-close" class="acr-btn acr-muted">Cerrar</button></div><div id="acr-alert" style="display:none;margin-top:12px;background:#fff6e5;border:2px solid #e8a13a;border-radius:14px;padding:12px;font-weight:800">⚠️ Hay vehículos que necesitan repaso. Detén la limpieza actual y revisa la lista.</div><div id="acr-list" style="margin-top:14px"></div></div>`;document.body.appendChild(modal);
const $=id=>document.getElementById(id);let lastIds=new Set(),firstLoad=true,loading=false,realtimeTimer=null;
async function signed(path){try{const r=await sb.storage.from("limpieza-repasos").createSignedUrl(path,3600);return r.data?.signedUrl||""}catch{return""}}
async function load(){
 if(loading)return;
 loading=true;
 try{
  const list=$("acr-list");
  const q=await sb.from("limpieza_repasos").select("id,fecha,ac_id,zona,detalle,estado,creado_at,completado_por,completado_at").eq("estado","pendiente").order("creado_at",{ascending:false});
  if(q.error){$("acllar-repaso-badge").textContent="!";tab.style.display="block";list.innerHTML='<div class="acr-row" style="border:2px solid #c24b3f">No se pudieron cargar los repasos: '+esc(q.error.message)+'</div>';return}
  const rows=q.data||[],ids=new Set(rows.map(x=>String(x.id))),nuevos=rows.filter(x=>!lastIds.has(String(x.id)));
  if(!firstLoad&&nuevos.length)notify(nuevos);
  lastIds=ids;firstLoad=false;
  $("acllar-repaso-badge").textContent=String(rows.length);tab.style.display="block";$("acr-alert").style.display=rows.length?"block":"none";
  if(!rows.length){list.innerHTML='<div class="acr-row" style="color:#5d6b65;text-align:center">No hay vehículos pendientes de repaso.</div>';return}
  const idsArr=rows.map(x=>x.id);
  const fr=await sb.from("limpieza_repaso_fotos").select("id,repaso_id,storage_path,nombre_archivo").in("repaso_id",idsArr);
  const photos=fr.data||[],by=new Map();
  for(const p of photos){if(!by.has(p.repaso_id))by.set(p.repaso_id,[]);by.get(p.repaso_id).push({...p,url:await signed(p.storage_path)})}
  list.innerHTML="";
  rows.forEach(x=>{
   const el=document.createElement("div");el.className="acr-row";
   el.innerHTML='<div style="display:flex;align-items:center;gap:8px"><b style="font:800 23px Space Mono,monospace">'+esc(x.ac_id)+'</b><span style="background:#fff6e5;border:1px solid #f3d28a;border-radius:999px;padding:4px 8px;font-size:11px;font-weight:800">PENDIENTE</span></div><div style="font-weight:800;margin-top:8px">Zona: '+esc(x.zona)+'</div>'+(x.detalle?'<div style="margin-top:5px">'+esc(x.detalle)+'</div>':'')+'<div style="font-size:12px;color:#5d6b65;margin-top:6px">'+new Date(x.creado_at).toLocaleString("es-ES")+'</div>';
   (by.get(x.id)||[]).forEach(p=>{if(p.url){const im=document.createElement("img");im.className="acr-photo";im.src=p.url;im.alt=p.nombre_archivo||"Foto del repaso";el.appendChild(im)}});
   const done=document.createElement("button");done.className="acr-btn acr-primary";done.style.marginTop="12px";done.textContent="MARCAR REPASO TERMINADO";done.onclick=()=>finish(x.id,done);el.appendChild(done);list.appendChild(el);
  });
 }finally{loading=false}
}
async function finish(id,btn){btn.disabled=true;btn.textContent="GUARDANDO…";const ses=await sb.auth.getSession(),uid=ses.data.session?.user?.id||null,r=await sb.from("limpieza_repasos").update({estado:"terminado",completado_at:new Date().toISOString(),completado_por:uid}).eq("id",id);if(r.error){alert("No se pudo marcar el repaso: "+r.error.message);btn.disabled=false;btn.textContent="MARCAR REPASO TERMINADO";return}await load()}
function notify(rows){const names=rows.map(x=>x.ac_id).join(", ");if("Notification" in window&&Notification.permission==="granted")new Notification("REPASAR VEHÍCULOS",{body:"Hay que revisar: "+names});alert("⚠️ REPASAR VEHÍCULOS\n\nHa entrado un vehículo para corregir: "+names+"\n\nDetén la limpieza actual y ve a REPASAR VEHÍCULOS.")}
function scheduleLoad(delay){clearTimeout(realtimeTimer);realtimeTimer=setTimeout(()=>load(),delay)}
tab.onclick=async()=>{modal.style.display="flex";await load()};$("acr-close").onclick=()=>modal.style.display="none";modal.addEventListener("click",e=>{if(e.target===modal)modal.style.display="none"});
const channel=sb.channel("acllar-repasos-tablet-realtime").on("postgres_changes",{event:"INSERT",schema:"public",table:"limpieza_repasos"},()=>scheduleLoad(1500)).on("postgres_changes",{event:"INSERT",schema:"public",table:"limpieza_repaso_fotos"},()=>scheduleLoad(800)).on("postgres_changes",{event:"UPDATE",schema:"public",table:"limpieza_repasos"},()=>scheduleLoad(300)).subscribe(status=>console.log("REALTIME REPASOS TABLET:",status));
(async()=>{try{const session=(await sb.auth.getSession()).data.session||null;if(session)await load();else{tab.style.display="block";$("acllar-repaso-badge").textContent="!"}sb.auth.onAuthStateChange((_event,newSession)=>{if(newSession)scheduleLoad(0)})}catch(e){console.error("No se pudo iniciar REPASAR VEHÍCULOS:",e)}})();
setInterval(()=>{if(document.visibilityState!=="hidden")load()},10000);
})();