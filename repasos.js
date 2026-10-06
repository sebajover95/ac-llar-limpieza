(function(){
const sb=window.__ACLLAR_SUPABASE;
if(!sb)return;
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const css=`
#acllar-repaso-tab{display:none!important}
#acllar-repaso-modal{position:fixed;inset:0;z-index:99999;background:rgba(21,48,43,.48);display:none;align-items:flex-start;justify-content:center;padding:24px;overflow:auto}
#acllar-repaso-card{width:min(760px,100%);background:#e7ece8;border-radius:22px;padding:20px;box-shadow:0 20px 60px rgba(0,0,0,.25);font-family:Inter,system-ui;color:#15302b}
#acllar-repaso-card input,#acllar-repaso-card textarea{width:100%;box-sizing:border-box;border:1px solid #d6ded8;border-radius:12px;background:#fff;padding:12px;font:inherit}
#acllar-repaso-card textarea{min-height:90px;resize:vertical}
.acr-grid{display:grid;grid-template-columns:1fr 1.4fr;gap:10px}.acr-row{background:#fff;border:1px solid #d6ded8;border-radius:16px;padding:14px;margin-top:10px}.acr-photo{width:100%;max-height:280px;object-fit:cover;border-radius:12px;margin-top:8px}.acr-btn{border:0;border-radius:12px;padding:12px 15px;font-weight:700;cursor:pointer}.acr-primary{background:#2f8f7c;color:#fff}.acr-danger{background:#c24b3f;color:#fff}.acr-muted{background:#fff;border:1px solid #d6ded8;color:#15302b}@media(max-width:600px){#acllar-repaso-modal{padding:10px}.acr-grid{grid-template-columns:1fr}}
`;
const st=document.createElement("style");st.textContent=css;document.head.appendChild(st);
const tab=document.createElement("button");tab.id="acllar-repaso-tab";tab.textContent="↻ REPASAR VEHÍCULOS";document.body.appendChild(tab);
function placeRepasosTab(){}

const modal=document.createElement("div");modal.id="acllar-repaso-modal";modal.innerHTML=`<div id="acllar-repaso-card">
<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px"><div style="font-size:22px;font-weight:800;flex:1">REPASAR VEHÍCULOS</div><button id="acr-close" class="acr-btn acr-muted">Cerrar</button></div>
<div style="background:#fff;border:1px solid #d6ded8;border-radius:16px;padding:14px">
<div style="font-weight:700;margin-bottom:10px">Nuevo aviso de repaso</div>
<div class="acr-grid"><div><label style="font-size:12px;font-weight:700">VEHÍCULO</label><input id="acr-ac" placeholder="Ej. 307 o AC-307"></div><div><label style="font-size:12px;font-weight:700">ZONA A REPASAR</label><div style="display:flex;gap:7px"><input id="acr-zona" placeholder="Ej. baño, cocina, suelo…" style="flex:1"><button id="acr-add-zone" type="button" class="acr-btn acr-muted" style="white-space:nowrap">Añadir zona</button></div><div id="acr-zones" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px"></div></div></div>
<div style="margin-top:10px"><label style="font-size:12px;font-weight:700">DETALLE (opcional)</label><textarea id="acr-detalle" placeholder="Qué debe revisarse exactamente…"></textarea></div>
<div style="margin-top:10px"><label style="font-size:12px;font-weight:700">FOTOS</label><input id="acr-files" type="file" accept="image/jpeg,image/png,image/webp" multiple style="padding:8px"></div>
<div id="acr-msg" style="font-size:13px;margin-top:8px;color:#5d6b65"></div>
<div style="display:flex;justify-content:flex-end;margin-top:12px"><button id="acr-save" class="acr-btn acr-primary">GUARDAR REPASO</button></div>
</div>
<div style="font-weight:800;margin-top:18px">REPASOS PENDIENTES</div><div id="acr-list"></div>
</div>`;document.body.appendChild(modal);
const $=id=>document.getElementById(id);let pendingZones=[];
const normalizeAc=v=>{let x=String(v||"").trim().toUpperCase();return /^\d{3}[A-Z]?$/.test(x)?"AC-"+x:x};
async function signed(path){const r=await sb.storage.from("limpieza-repasos").createSignedUrl(path,3600);return r.data?.signedUrl||""}
async function load(){
  const list=$("acr-list"); list.innerHTML='<div style="padding:14px;color:#5d6b65">Cargando…</div>';
  const q=await sb.from("limpieza_repasos").select("id,fecha,ac_id,zona,detalle,estado,creado_at").eq("estado","pendiente").order("creado_at",{ascending:false});
  if(q.error){list.innerHTML='<div class="acr-row">No se pudieron cargar los repasos: '+esc(q.error.message)+'</div>';return}
  const rows=q.data||[];
  if(!rows.length){list.innerHTML='<div class="acr-row" style="color:#5d6b65">No hay vehículos pendientes de repaso.</div>';return}
  const ids=rows.map(x=>x.id), fr=await sb.from("limpieza_repaso_fotos").select("id,repaso_id,storage_path,nombre_archivo").in("repaso_id",ids);
  const photos=fr.data||[], by=new Map();
  for(const p of photos){if(!by.has(p.repaso_id))by.set(p.repaso_id,[]);by.get(p.repaso_id).push({...p,url:await signed(p.storage_path)})}
  list.innerHTML="";
  rows.forEach(x=>{
    const el=document.createElement("div");el.className="acr-row";
    el.innerHTML='<div style="display:flex;align-items:center;gap:8px"><b style="font:700 22px Space Mono,monospace">'+esc(x.ac_id)+'</b><span style="background:#fff6e5;border:1px solid #f3d28a;border-radius:999px;padding:4px 8px;font-size:11px">PENDIENTE</span></div><div style="font-weight:700;margin-top:7px">Zona: '+esc(x.zona)+'</div>'+(x.detalle?'<div style="margin-top:6px">'+esc(x.detalle)+'</div>':'')+'<div style="font-size:12px;color:#5d6b65;margin-top:4px">'+new Date(x.creado_at).toLocaleString("es-ES")+'</div>';
    const ps=by.get(x.id)||[];ps.forEach(p=>{if(p.url){const im=document.createElement("img");im.className="acr-photo";im.src=p.url;im.alt=p.nombre_archivo||"Foto del repaso";el.appendChild(im)}});
    const del=document.createElement("button");
    del.className="acr-btn acr-danger";del.style.marginTop="12px";del.textContent="ELIMINAR REPASO";
    del.onclick=()=>deleteRepaso(x,del);
    el.appendChild(del);
    list.appendChild(el);
  });
}

async function deleteRepaso(x,btn){
  if(!confirm("¿Eliminar este repaso de "+x.ac_id+"? Esta acción no se puede deshacer."))return;
  btn.disabled=true;btn.textContent="ELIMINANDO…";
  try{
    const fr=await sb.from("limpieza_repaso_fotos").select("id,storage_path").eq("repaso_id",x.id);
    if(fr.error)throw fr.error;
    const paths=(fr.data||[]).map(p=>p.storage_path).filter(Boolean);
    if(paths.length){const sr=await sb.storage.from("limpieza-repasos").remove(paths);if(sr.error)throw sr.error;}
    const dr=await sb.from("limpieza_repaso_fotos").delete().eq("repaso_id",x.id);
    if(dr.error)throw dr.error;
    const rr=await sb.from("limpieza_repasos").delete().eq("id",x.id);
    if(rr.error)throw rr.error;
    await load();
  }catch(e){alert("No se pudo eliminar el repaso: "+(e.message||e));btn.disabled=false;btn.textContent="ELIMINAR REPASO"}
}
tab.onclick=async()=>{modal.style.display="flex";await load()};
$("acr-close").onclick=()=>modal.style.display="none";
modal.addEventListener("click",e=>{if(e.target===modal)modal.style.display="none"});
function renderZones(){const box=$("acr-zones");if(!box)return;box.innerHTML="";pendingZones.forEach((z,i)=>{const chip=document.createElement("span");chip.style.cssText="display:inline-flex;align-items:center;gap:6px;background:#fff;border:1px solid #d6ded8;border-radius:999px;padding:5px 9px;font-size:12px;font-weight:700";chip.textContent=z;const b=document.createElement("button");b.type="button";b.textContent="×";b.style.cssText="border:0;background:transparent;font-weight:900;cursor:pointer;color:#c24b3f";b.onclick=()=>{pendingZones.splice(i,1);renderZones()};chip.appendChild(b);box.appendChild(chip)})}
function addZone(){const input=$("acr-zona"),z=input.value.trim();if(!z)return;const key=z.toLocaleLowerCase("es-ES");if(pendingZones.some(x=>x.toLocaleLowerCase("es-ES")===key)){input.value="";return}pendingZones.push(z);input.value="";renderZones();input.focus()}
$("acr-add-zone").onclick=addZone;$("acr-zona").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();addZone()}});
$("acr-save").onclick=async()=>{
  const msg=$("acr-msg"),btn=$("acr-save");let ac=normalizeAc($("acr-ac").value),zonaActual=$("acr-zona").value.trim();if(zonaActual)addZone();let zonas=[...pendingZones],detalle=$("acr-detalle").value.trim(),files=[...($("acr-files").files||[])];
  if(!ac||!zonas.length){msg.textContent="Indica el vehículo y añade al menos una zona.";msg.style.color="#c24b3f";return}
  btn.disabled=true;msg.textContent="Guardando "+zonas.length+" zona"+(zonas.length!==1?"s":"")+"…";msg.style.color="#5d6b65";
  const created=[];
  try{
    const ses=await sb.auth.getSession(),uid=ses.data.session?.user?.id||null;
    for(const zona of zonas){
      const ins=await sb.from("limpieza_repasos").insert({ac_id:ac,zona,detalle:detalle||null,creado_por:uid}).select("id").single();
      if(ins.error)throw ins.error;
      const rid=ins.data.id;created.push(rid);
      for(let i=0;i<files.length;i++){
        let f=files[i];
        if(f.size>1800000){try{f=await new Promise((res,rej)=>{const im=new Image(),u=URL.createObjectURL(f);im.onload=()=>{const max=1600,sc=Math.min(1,max/Math.max(im.width,im.height)),can=document.createElement("canvas");can.width=Math.round(im.width*sc);can.height=Math.round(im.height*sc);can.getContext("2d").drawImage(im,0,0,can.width,can.height);can.toBlob(b=>{URL.revokeObjectURL(u);b?res(new File([b],"foto.jpg",{type:"image/jpeg"})):rej(new Error("No se pudo preparar la foto"))},"image/jpeg",.82)};im.onerror=rej;im.src=u})}catch{}}
        const ext=f.type==="image/png"?"png":f.type==="image/webp"?"webp":"jpg",path=rid+"/"+Date.now()+"-"+i+"."+ext;
        const up=await sb.storage.from("limpieza-repasos").upload(path,f,{contentType:f.type==="image/png"?"image/png":f.type==="image/webp"?"image/webp":"image/jpeg",upsert:false});if(up.error)throw up.error;
        const mr=await sb.from("limpieza_repaso_fotos").insert({repaso_id:rid,storage_path:path,nombre_archivo:f.name,mime_type:f.type,creado_por:uid});if(mr.error)throw mr.error;
      }
    }
    $("acr-ac").value="";$("acr-zona").value="";$("acr-detalle").value="";$("acr-files").value="";pendingZones=[];renderZones();msg.textContent="Repaso guardado: "+zonas.length+" zona"+(zonas.length!==1?"s":"")+" independiente"+(zonas.length!==1?"s":"")+". Ya aparece en la tablet.";msg.style.color="#2f8f7c";await load();
  }catch(e){if(created.length)await sb.from("limpieza_repasos").delete().in("id",created);msg.textContent="No se pudo guardar: "+(e.message||e);msg.style.color="#c24b3f"}finally{btn.disabled=false}
};

})();
