(function(){
'use strict';
if(window.__ACLLAR_ORDEN_TODAS__)return;
window.__ACLLAR_ORDEN_TODAS__=true;
const AC=/^AC-\d{3}[A-Z]?$/i;
function supa(){return window.__ACLLAR_SUPABASE||window.supabaseClient||window.supabase||null}
async function load(date){const c=supa();if(!c?.from)return[];try{const r=await c.from('limpieza_plan').select('ac_id,prioridad,estado').eq('fecha',date).eq('estado','pendiente').order('prioridad',{ascending:true}).order('ac_id',{ascending:true});return r.error?[]:(r.data||[]).map(x=>({ac:String(x.ac_id).toUpperCase(),prioridad:x.prioridad}))}catch{return[]}}
async function save(date,list){const c=supa();if(!c?.from)return;for(let i=0;i<list.length;i++)await c.from('limpieza_plan').update({prioridad:i+1}).eq('fecha',date).eq('ac_id',list[i].ac)}
function panelForDate(date){return document.getElementById('orden-ac-'+date)}
function render(p,date,list){if(!p)return;p.innerHTML='<b style="font-size:14px">ORDEN DE LIMPIEZA</b><div style="font-size:11px;color:#65736e;margin:2px 0 6px">Todas las pendientes disponibles · <b>'+list.length+' pendientes</b> · sube o baja</div>'+(list.length?list.map((x,i)=>'<div style="display:flex;align-items:center;gap:6px;border-top:1px solid #dfe6e2;padding:5px 0"><span style="width:18px;color:#7a8882;font-weight:700">'+(i+1)+'</span><b style="font-family:monospace;flex:1">'+x.ac+'</b><button data-up="'+x.ac+'" style="width:36px;height:30px">▲</button><button data-down="'+x.ac+'" style="width:36px;height:30px">▼</button></div>').join(''):'<div style="font-size:12px;color:#65736e;padding:6px 0">No hay limpiezas pendientes para este día.</div>');p.querySelectorAll('[data-up]').forEach(b=>b.onclick=()=>move(date,list,b.dataset.up,-1));p.querySelectorAll('[data-down]').forEach(b=>b.onclick=()=>move(date,list,b.dataset.down,1))}
async function move(date,list,ac,d){const i=list.findIndex(x=>x.ac===ac),j=i+d;if(i<0||j<0||j>=list.length)return;[list[i],list[j]]=[list[j],list[i]];render(panelForDate(date),date,list);await save(date,list)}
async function refresh(){const panels=[...document.querySelectorAll('[id^="orden-ac-"]')];for(const p of panels){const date=p.id.slice(9);if(!/^\d{4}-\d{2}-\d{2}$/.test(date))continue;const list=await load(date);render(p,date,list)}}
setTimeout(refresh,1000);setInterval(refresh,5000);
})();
