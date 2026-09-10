(function(){
'use strict';
if(window.__ACLLAR_ORDEN_V8__)return;
window.__ACLLAR_ORDEN_V8__=true;

var AC=/^AC-\d{3}[A-Z]?$/i;
function visible(e){var s=getComputedStyle(e),r=e.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0;}
function between(a,b,e){
  if(!a||!e)return false;
  if(a===e)return false;
  if(a.compareDocumentPosition(e)&Node.DOCUMENT_POSITION_FOLLOWING){
    if(!b)return true;
    return !!(e.compareDocumentPosition(b)&Node.DOCUMENT_POSITION_FOLLOWING);
  }
  return false;
}
function exactACs(){
  var hs=[].slice.call(document.querySelectorAll('*')).filter(function(e){return /^A LIMPIAR\s*\(/i.test((e.innerText||'').trim())&&visible(e);});
  if(!hs.length)return [];
  var h=hs[0];
  var ss=[].slice.call(document.querySelectorAll('*')).filter(function(e){return /^SALEN HOY\s*\(/i.test((e.innerText||'').trim())&&visible(e)&&between(h,null,e);});
  var stop=ss[0]||null,seen={},out=[];
  var els=[].slice.call(document.querySelectorAll('*'));
  els.forEach(function(e){
    var t=(e.textContent||'').trim();
    if(!AC.test(t)||!visible(e)||!between(h,stop,e))return;
    if(e.children.length)return;
    var ac=t.toUpperCase();
    if(!seen[ac]){seen[ac]=1;out.push({ac:ac,el:e,row:e.parentElement});}
  });
  return out;
}
function today(){var d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function client(){return window.__ACLLAR_SUPABASE||window.supabaseClient||window.supabase||null;}
function mount(){
  var p=document.getElementById('acllar-order-v8');
  if(p)return p;
  p=document.createElement('div');p.id='acllar-order-v8';
  p.style.cssText='position:fixed;right:18px;bottom:18px;width:330px;max-height:70vh;overflow:auto;background:#fff;border:3px solid #15302b;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.3);z-index:2147483647;padding:12px;font-family:Arial,sans-serif;color:#15302b;display:block!important;visibility:visible!important;opacity:1!important;';
  document.body.appendChild(p);return p;
}
function draw(list,msg){
  var p=mount(),h='<div style="font-weight:800;font-size:16px">ORDEN DE LIMPIEZA</div><div style="font-size:11px;color:#65736e;margin:3px 0 8px">Mueve los AC pendientes con ▲ y ▼</div>';
  if(msg)h+='<div style="font-size:12px;padding:8px 0">'+msg+'</div>';
  else list.forEach(function(x,i){h+='<div style="display:flex;align-items:center;gap:7px;border-top:1px solid #e3e8e5;padding:7px 0"><span style="width:20px;color:#7a8882;font-weight:700">'+(i+1)+'</span><b style="font-family:monospace;flex:1;font-size:14px">'+x.ac+'</b><button data-up="'+x.ac+'" style="width:38px;height:32px;border:1px solid #7f9189;border-radius:7px;background:#eef4f1;font-size:19px;font-weight:900">▲</button><button data-down="'+x.ac+'" style="width:38px;height:32px;border:1px solid #7f9189;border-radius:7px;background:#eef4f1;font-size:19px;font-weight:900">▼</button></div>';});
  p.innerHTML=h;
  p.querySelectorAll('[data-up]').forEach(function(b){b.onclick=function(){move(list,b.dataset.up,-1);};});
  p.querySelectorAll('[data-down]').forEach(function(b){b.onclick=function(){move(list,b.dataset.down,1);};});
}
async function getPlan(){var c=client();if(!c||typeof c.from!=='function')return [];try{var r=await c.from('limpieza_plan').select('ac_id,prioridad').eq('fecha',today());return r.error?[]:(r.data||[]);}catch(e){return [];}}
async function saveOrder(list){var c=client();if(!c||typeof c.from!=='function'){draw(list,'No se pudo conectar con Supabase.');return false;}for(var i=0;i<list.length;i++){try{var r=await c.from('limpieza_plan').update({prioridad:i+1}).eq('fecha',today()).eq('ac_id',list[i].ac);if(r.error)throw r.error;}catch(e){draw(list,'Error guardando el orden.');return false;}}return true;}
function sortList(rows,plan){var m={};plan.forEach(function(x){if(x.prioridad!==null&&x.prioridad!==undefined)m[String(x.ac_id).toUpperCase()]=Number(x.prioridad);});return rows.slice().sort(function(a,b){var pa=Number.isFinite(m[a.ac])?m[a.ac]:999999,pb=Number.isFinite(m[b.ac])?m[b.ac]:999999;return pa-pb||a.ac.localeCompare(b.ac);});}
async function render(){var rows=exactACs();if(!rows.length){draw([],'No se han detectado AC pendientes en «A LIMPIAR».');return;}var plan=await getPlan();draw(sortList(rows,plan));}
async function move(list,ac,dir){var i=list.findIndex(function(x){return x.ac===ac;}),j=i+dir;if(i<0||j<0||j>=list.length)return;var tmp=list[i];list[i]=list[j];list[j]=tmp;draw(list);var ok=await saveOrder(list);if(ok){setTimeout(function(){location.reload();},250);}}
function start(){mount();render();setInterval(render,15000);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
