(function(){
'use strict';
if(window.__ACLLAR_ORDEN_V7__)return;
window.__ACLLAR_ORDEN_V7__=true;

function findRows(){
  var seen={}, out=[];
  document.querySelectorAll('input[type="checkbox"]').forEach(function(cb){
    var n=cb.parentElement, row=null, ac=null;
    for(var i=0;i<10&&n;i++,n=n.parentElement){
      var t=n.innerText||'';
      var m=t.match(/AC-\d{3}[A-Z]?/g)||[];
      if(m.length===1){ac=m[0];row=n;break;}
    }
    if(ac&&!seen[ac]){seen[ac]=1;out.push({ac:ac,row:row});}
  });
  return out;
}
function today(){var d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function client(){return window.__ACLLAR_SUPABASE||window.supabaseClient||window.supabase||null;}
function mount(){
  var p=document.getElementById('acllar-order-v7');
  if(p)return p;
  p=document.createElement('div');
  p.id='acllar-order-v7';
  p.style.cssText='position:fixed;right:20px;bottom:20px;width:300px;background:#ffffff;border:3px solid #15302b;border-radius:14px;box-shadow:0 10px 35px rgba(0,0,0,.28);z-index:2147483647;padding:12px;font-family:Arial,sans-serif;color:#15302b;display:block!important;visibility:visible!important;opacity:1!important;';
  document.body.appendChild(p);
  return p;
}
function draw(list){
  var p=mount();
  var h='<div style="font-weight:800;font-size:16px;margin-bottom:4px">ORDEN DE LIMPIEZA</div><div style="font-size:11px;margin-bottom:8px;color:#65736e">Sube o baja los AC pendientes</div>';
  if(!list.length){h+='<div style="padding:10px 0;font-size:12px">No se han detectado AC pendientes todavía.</div>';p.innerHTML=h;return;}
  list.forEach(function(x,i){
    h+='<div data-ac="'+x.ac+'" style="display:flex;align-items:center;gap:7px;border-top:1px solid #e3e8e5;padding:7px 0">'+
      '<span style="width:20px;font-weight:700;color:#7a8882">'+(i+1)+'</span>'+
      '<b style="font-family:monospace;flex:1;font-size:14px">'+x.ac+'</b>'+
      '<button data-up="'+x.ac+'" style="width:34px;height:30px;border:1px solid #9eaea5;border-radius:7px;background:#f6f9f7;font-size:18px;font-weight:800;cursor:pointer" '+(i===0?'disabled':'')+'>▲</button>'+
      '<button data-down="'+x.ac+'" style="width:34px;height:30px;border:1px solid #9eaea5;border-radius:7px;background:#f6f9f7;font-size:18px;font-weight:800;cursor:pointer" '+(i===list.length-1?'disabled':'')+'>▼</button>'+
      '</div>';
  });
  p.innerHTML=h;
  p.querySelectorAll('button[data-up]').forEach(function(b){b.onclick=function(){move(list,b.getAttribute('data-up'),-1);};});
  p.querySelectorAll('button[data-down]').forEach(function(b){b.onclick=function(){move(list,b.getAttribute('data-down'),1);};});
}
async function getPlan(){
  var c=client();
  if(!c||typeof c.from!=='function')return [];
  try{var r=await c.from('limpieza_plan').select('ac_id,prioridad').eq('fecha',today());return r.error?[]:(r.data||[]);}catch(e){return [];}
}
async function setPriority(ac,p){
  var c=client();
  if(!c||typeof c.from!=='function')return;
  try{await c.from('limpieza_plan').update({prioridad:p}).eq('fecha',today()).eq('ac_id',ac);}catch(e){}
}
function sortList(rows,plan){
  var map={};
  plan.forEach(function(x){if(x.prioridad!==null&&x.prioridad!==undefined)map[String(x.ac_id)]=Number(x.prioridad);});
  return rows.slice().sort(function(a,b){var pa=Number.isFinite(map[a.ac])?map[a.ac]:999999;var pb=Number.isFinite(map[b.ac])?map[b.ac]:999999;return pa-pb||a.ac.localeCompare(b.ac);});
}
async function render(){
  var rows=findRows();
  var plan=await getPlan();
  var list=sortList(rows,plan);
  draw(list);
}
async function move(list,ac,dir){
  var i=list.findIndex(function(x){return x.ac===ac;});
  var j=i+dir;
  if(i<0||j<0||j>=list.length)return;
  var a=list[i],b=list[j];
  list[i]=b;list[j]=a;
  draw(list);
  var plan=await getPlan(),map={};
  plan.forEach(function(x){map[String(x.ac_id)]=Number(x.prioridad);});
  var pa=Number.isFinite(map[a.ac])?map[a.ac]:i+1;
  var pb=Number.isFinite(map[b.ac])?map[b.ac]:j+1;
  await setPriority(a.ac,pb);
  await setPriority(b.ac,pa);
  var rows=findRows();
  var by={};rows.forEach(function(x){by[x.ac]=x;});
  var ordered=list.map(function(x){return by[x.ac];}).filter(Boolean);
  if(ordered.length>1){var parent=ordered[0].row&&ordered[0].row.parentElement;if(parent)ordered.forEach(function(x){if(x.row&&x.row.parentElement===parent)parent.appendChild(x.row);});}
}
function start(){
  mount();
  draw(findRows());
  setTimeout(function(){render();},1200);
  setInterval(function(){render();},15000);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
