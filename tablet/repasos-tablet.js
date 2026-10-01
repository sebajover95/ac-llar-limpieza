(function(){
"use strict";
const sb=window.__ACLLAR_SUPABASE;
if(!sb)return;

const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const css=`
#acllar-repaso-tab{
 position:fixed;right:14px;top:14px;z-index:99990;border:0;border-radius:14px;
 padding:12px 15px;background:#c24b3f;color:#fff;font:800 14px Inter,system-ui;
 box-shadow:0 6px 20px rgba(0,0,0,.18);display:none
}
#acllar-repaso-badge{display:inline-flex;min-width:22px;height:22px;margin-left:7px;
 align-items:center;justify-content:center;border-radius:999px;background:#fff;color:#c24b3f;font:800 12px Inter}
#acllar-repaso-modal{position:fixed;inset:0;z-index:99999;background:rgba(21,48,43,.55);
 display:none;align-items:flex-start;justify-content:center;padding:14px;overflow:auto}
#acllar-repaso-card{width:min(760px,100%);margin-top:8px;background:#e7ece8;border-radius:22px;
 padding:18px;box-shadow:0 20px 60px rgba(0,0,0,.3);font-family:Inter,system-ui;color:#15302b}
.acr-row{background:#fff;border:1px solid #d6ded8;border-radius:16px;padding:14px;margin-top:10px}
.acr-btn{border:0;border-radius:12px;padding:12px 15px;font-weight:800;cursor:pointer}
.acr-primary{background:#2f8f7c;color:#fff}.acr-muted{background:#fff;border:1px solid #d6ded8;color:#15302b}
.acr-danger{background:#c24b3f;color:#fff}
`;
const st=document.createElement("style");st.textContent=css;document.head.appendChild(st);

const tab=document.createElement("button");
tab.id="acllar-repaso-tab";
tab.innerHTML='REPASAR VEHÍCULOS <span id="acllar-repaso-badge">0</span>';
document.body.appendChild(tab);

const modal=document.createElement("div");
modal.id="acllar-repaso-modal";
modal.innerHTML=`<div id="acllar-repaso-card">
 <div style="display:flex;align-items:center;gap:10px">
  <div style="flex:1;font-size:22px;font-weight:800">REPASAR VEHÍCULOS</div>
  <button id="acr-close" class="acr-btn acr-muted">Cerrar</button>
 </div>
 <div id="acr-alert" style="display:none;margin-top:12px;background:#fff6e5;border:2px solid #e8a13a;border-radius:14px;padding:12px;font-weight:800">
  ⚠️ Hay vehículos que necesitan repaso. Detén la limpieza actual y revisa la lista.
 </div>
 <div id="acr-list" style="margin-top:14px"></div>
 </div>`;
document.body.appendChild(modal);

const $=id=>document.getElementById(id);
let lastIds=new Set();
let firstLoad=true;

async function load(){
 const list=$("acr-list");
 const q=await sb.from("limpieza_repasos")
   .select("id,fecha,ac_id,zona,detalle,estado,creado_at,completado_por,completado_at")
   .eq("estado","pendiente")
   .order("creado_at",{ascending:false});
 if(q.error){
   $("acllar-repaso-badge").textContent="!";
   tab.style.display="block";
   list.innerHTML='<div class="acr-row" style="border:2px solid #c24b3f">No se pudieron cargar los repasos: '+esc(q.error.message)+'</div>';
   return;
 }
 const rows=q.data||[];
 const ids=new Set(rows.map(x=>String(x.id)));
 let nuevos=rows.filter(x=>!lastIds.has(String(x.id)));
 if(!firstLoad && nuevos.length){
   notify(nuevos);
 }
 lastIds=ids;
 firstLoad=false;

 $("acllar-repaso-badge").textContent=String(rows.length);
 tab.style.display=rows.length?"block":"block";
 $("acr-alert").style.display=rows.length?"block":"none";

 if(!rows.length){
   list.innerHTML='<div class="acr-row" style="color:#5d6b65;text-align:center">No hay vehículos pendientes de repaso.</div>';
   return;
 }
 list.innerHTML="";
 rows.forEach(x=>{
   const el=document.createElement("div");el.className="acr-row";
   el.innerHTML='<div style="display:flex;align-items:center;gap:8px"><b style="font:800 23px Space Mono,monospace">'+esc(x.ac_id)+'</b><span style="background:#fff6e5;border:1px solid #f3d28a;border-radius:999px;padding:4px 8px;font-size:11px;font-weight:800">PENDIENTE</span></div>'+
     '<div style="font-weight:800;margin-top:8px">Zona: '+esc(x.zona)+'</div>'+
     (x.detalle?'<div style="margin-top:5px">'+esc(x.detalle)+'</div>':'')+
     '<div style="font-size:12px;color:#5d6b65;margin-top:6px">'+new Date(x.creado_at).toLocaleString("es-ES")+'</div>';
   const done=document.createElement("button");
   done.className="acr-btn acr-primary";done.style.marginTop="12px";done.textContent="MARCAR REPASO TERMINADO";
   done.onclick=()=>finish(x.id,done);
   el.appendChild(done);list.appendChild(el);
 });
}

async function finish(id,btn){
 btn.disabled=true;btn.textContent="GUARDANDO…";
 const ses=await sb.auth.getSession();\n const uid=ses.data.session?.user?.id||null;\n const r=await sb.from("limpieza_repasos").update({estado:"terminado",completado_at:new Date().toISOString(),completado_por:uid}).eq("id",id);
 if(r.error){alert("No se pudo marcar el repaso: "+r.error.message);btn.disabled=false;btn.textContent="MARCAR REPASO TERMINADO";return}
 await load();
}

function notify(rows){
 const names=rows.map(x=>x.ac_id).join(", ");
 if("Notification" in window && Notification.permission==="granted"){
   new Notification("REPASAR VEHÍCULOS",{body:"Hay que revisar: "+names});
 }
 alert("⚠️ REPASAR VEHÍCULOS\n\nHa entrado un vehículo para corregir: "+names+"\n\nDetén la limpieza actual y ve a REPASAR VEHÍCULOS.");
}
tab.onclick=async()=>{modal.style.display="flex";await load()};
$("acr-close").onclick=()=>modal.style.display="none";
modal.addEventListener("click",e=>{if(e.target===modal)modal.style.display="none"});

(async()=>{
 let session=null;
 try{session=(await sb.auth.getSession()).data.session||null}catch(e){console.error(e)}
 if(session) await load();
 else {
   $("acllar-repaso-badge").textContent="!";
   tab.style.display="block";
 }
 sb.auth.onAuthStateChange((_event,newSession)=>{if(newSession) setTimeout(load,0)});
 setInterval(async()=>{try{const ses=(await sb.auth.getSession()).data.session;if(ses)await load()}catch(e){console.error(e)}},5000);
})();
})();