(function(){
const sb=window.supabase.createClient("https://gewwdkmxbdwisetwuyvi.supabase.co","sb_publishable_jLCL0bNDqvLmKqa7aj1iWw_G5JtJIPY");
if(!sb)return;
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const css=`
#acllar-repaso-tab-t{position:fixed;top:14px;right:18px;z-index:99990;background:#c24b3f;color:#fff;border:0;border-radius:12px;padding:12px 18px;font:800 14px Inter,system-ui;box-shadow:0 6px 18px rgba(0,0,0,.18);letter-spacing:.2px;display:flex;align-items:center;gap:8px}#acllar-repaso-count-t{display:none;min-width:22px;height:22px;padding:0 6px;border-radius:999px;background:#fff;color:#c24b3f;align-items:center;justify-content:center;font:800 12px Inter,system-ui}
#acllar-repaso-modal-t{position:fixed;inset:0;z-index:99999;background:rgba(21,48,43,.48);display:none;align-items:flex-start;justify-content:center;padding:10px;overflow:auto}
#acllar-repaso-card-t{width:min(760px,100%);background:#e7ece8;border-radius:22px;padding:16px;box-shadow:0 20px 60px rgba(0,0,0,.25);font-family:Inter,system-ui;color:#15302b}
.acrt-row{background:#fff;border:1px solid #d6ded8;border-radius:16px;padding:14px;margin-top:10px}.acrt-photo{width:100%;max-height:320px;object-fit:cover;border-radius:12px;margin-top:8px}.acrt-btn{border:0;border-radius:12px;padding:12px 15px;font-weight:800;font-size:16px}
`;const st=document.createElement("style");st.textContent=css;document.head.appendChild(st);
const tab=document.createElement("button");tab.id="acllar-repaso-tab-t";tab.innerHTML="↻ VEHÍCULOS A REPASAR <span id="acllar-repaso-count-t"></span>";document.body.appendChild(tab);
const modal=document.createElement("div");modal.id="acllar-repaso-modal-t";modal.innerHTML=`<div id="acllar-repaso-card-t"><div style="display:flex;align-items:center;gap:8px"><div style="font-size:22px;font-weight:800;flex:1">VEHÍCULOS A REPASAR</div><button id="acrt-close" class="acrt-btn" style="background:#fff;border:1px solid #d6ded8">Cerrar</button></div><div id="acrt-list" style="margin-top:6px"></div></div>`;document.body.appendChild(modal);
const $=id=>document.getElementById(id);let knownIds=null;let loading=false;
async function load(){
 const list=$("acrt-list");list.innerHTML='<div class="acrt-row">Cargando repasos…</div>';
 const q=await sb.from("limpieza_repasos").select("id,fecha,ac_id,zona,detalle,estado,creado_at").eq("estado","pendiente").order("creado_at",{ascending:false});
 if(q.error){list.innerHTML='<div class="acrt-row">No se pudieron cargar los repasos: '+esc(q.error.message)+'</div>';return}
 const rows=q.data||[];const countEl=$("acllar-repaso-count-t");if(countEl){countEl.textContent=rows.length;countEl.style.display=rows.length?"inline-flex":"none"}const ids=new Set(rows.map(x=>String(x.id)));if(knownIds!==null){const nuevos=rows.filter(x=>!knownIds.has(String(x.id)));if(nuevos.length){try{navigator.vibrate?.([250,120,250])}catch{};alert("🚨 NUEVO REPASO\n"+nuevos.map(x=>x.ac_id).join(", ")+" entró/entraron en vehículos a repasar.");}}knownIds=ids;if(!rows.length){list.innerHTML='<div class="acrt-row" style="text-align:center;color:#5d6b65;padding:25px">No hay vehículos pendientes de repaso. 👍</div>';return}
 const ids=rows.map(x=>x.id),fr=await sb.from("limpieza_repaso_fotos").select("id,repaso_id,storage_path,nombre_archivo").in("repaso_id",ids),photos=fr.data||[],by=new Map();
 for(const p of photos){if(!by.has(p.repaso_id))by.set(p.repaso_id,[]);const u=await sb.storage.from("limpieza-repasos").createSignedUrl(p.storage_path,3600);by.get(p.repaso_id).push({...p,url:u.data?.signedUrl||""})}
 list.innerHTML="";
 rows.forEach(x=>{
  const el=document.createElement("div");el.className="acrt-row";
  el.innerHTML='<div style="display:flex;align-items:center;gap:8px"><b style="font:700 25px Space Mono,monospace">'+esc(x.ac_id)+'</b><span style="background:#c24b3f;color:#fff;border-radius:999px;padding:5px 9px;font-size:11px;font-weight:800">REPASAR</span></div><div style="font-size:18px;font-weight:800;margin-top:8px">Zona: '+esc(x.zona)+'</div>'+(x.detalle?'<div style="font-size:14px;margin-top:6px">Detalle: '+esc(x.detalle)+'</div>':'')+'<div style="font-size:12px;color:#5d6b65;margin-top:4px">Avisado el '+new Date(x.creado_at).toLocaleString("es-ES")+'</div>';
  (by.get(x.id)||[]).forEach(p=>{if(p.url){const im=document.createElement("img");im.className="acrt-photo";im.src=p.url;im.alt="Foto del repaso";el.appendChild(im)}});
  const b=document.createElement("button");b.className="acrt-btn";b.style.cssText="width:100%;margin-top:12px;background:#2f8f7c;color:#fff";b.textContent="✓ REPASO REALIZADO";b.onclick=async()=>{if(!confirm("¿Marcar este repaso como realizado?"))return;b.disabled=true;const ses=await sb.auth.getSession(),uid=ses.data.session?.user?.id||null;const u=await sb.from("limpieza_repasos").update({estado:"terminado",completado_por:uid,completado_at:new Date().toISOString()}).eq("id",x.id);if(u.error){b.disabled=false;alert("No se pudo marcar: "+u.error.message);return}await load()};el.appendChild(b);list.appendChild(el);
 });
}
tab.onclick=async()=>{modal.style.display="flex";loading=true;try{await load()}finally{loading=false}};$("acrt-close").onclick=()=>modal.style.display="none";modal.addEventListener("click",e=>{if(e.target===modal)modal.style.display="none"});
setInterval(()=>{if(!loading){loading=true;load().finally(()=>{loading=false})}},15000);
})();
