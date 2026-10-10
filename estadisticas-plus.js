/* Estadísticas ampliadas · AC·LLAR limpieza
   Se monta en #acllar-stats-plus (pestaña Estadísticas de la app de gestión).
   Fuentes: limpiezas (tiempos), limpieza-historial + facturacion-registros + tarifas (lo contado/facturado),
   acllar_personal_dia (personas), acllar_hq_movimientos (entregas/devoluciones HQ, si existe). */
(function () {
  "use strict";
  if (window.__ACLLAR_STATS_PLUS__) return;
  window.__ACLLAR_STATS_PLUS__ = true;

  var C_DEV = "#C85F00", C_LIMP = "#6F5AA6"; // validados (CVD ΔE 22)
  var MIN_VALIDO = 10; // minutos: por debajo se considera error de registro
  var DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
  var RE_TEST = /^(AC-\d{4,}|PRUEBA.*|TEST.*)$/i;
  var RE_FLOTA = /^AC-\d{2,3}[A-Z]?$/i;

  var st = { data: null, loading: false, err: null, f: { periodo: "todo", mes: "", desde: "", hasta: "", empresa: "", persona: "", tamano: "", tipo: "" }, sortVeh: { k: "media", d: -1 } };

  // ---------- utilidades ----------
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function normNombre(s) {
    s = String(s || "").trim(); if (!s) return "";
    s = s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");
    return s.replace(/(^|\s)\S/g, function (m) { return m.toUpperCase(); });
  }
  function baseAc(a) { a = String(a || "").trim().toUpperCase(); var m = a.match(/^(AC-\d{2,3})[A-Z]?$/); return m ? m[1] : a; }
  function dkey(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function localKey(iso) { return iso ? dkey(new Date(iso)) : null; }
  function parseDay(k) { var p = k.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(k, n) { var d = parseDay(k); d.setDate(d.getDate() + n); return dkey(d); }
  function diffDays(a, b) { return Math.round((parseDay(b) - parseDay(a)) / 864e5); }
  function dow(k) { return (parseDay(k).getDay() + 6) % 7; } // 0=lunes
  function weekStart(k) { return addDays(k, -dow(k)); }
  function fmtDay(k) { var d = parseDay(k); return DIAS[dow(k)] + " " + d.getDate() + "/" + (d.getMonth() + 1); }
  function fmtShort(k) { var d = parseDay(k); return d.getDate() + "/" + (d.getMonth() + 1); }
  function eur(n) { return (n || 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €"; }
  function hm(min) { if (min == null || !isFinite(min)) return "—"; min = Math.round(min); var h = Math.floor(min / 60), m = min % 60; return h ? h + " h " + String(m).padStart(2, "0") + " min" : m + " min"; }
  function num(n, d) { return n == null || !isFinite(n) ? "—" : n.toLocaleString("es-ES", { maximumFractionDigits: d == null ? 1 : d }); }
  function median(a) { if (!a.length) return null; var s = a.slice().sort(function (x, y) { return x - y; }), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
  function mean(a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : null; }
  function today() { return dkey(new Date()); }
  function sb() { return window.__ACLLAR_SUPABASE; }

  // ---------- carga ----------
  async function load() {
    var s = sb(); if (!s) throw new Error("Sin conexión con Supabase");
    var uid = (await s.auth.getUser()).data.user.id;
    var res = await Promise.all([
      s.from("limpiezas").select("id,ac_id,tamano,empresa,nombre,inicio,fin,estado,tiempo_acumulado_segundos").order("inicio", { ascending: true }).limit(5000),
      s.from("acllar_app_data").select("key,value").eq("owner_id", uid).in("key", ["limpieza-historial", "facturacion-registros", "facturacion-tarifas", "acllar-tamano-por-ac"]),
      s.from("acllar_personal_dia").select("fecha,empresa,nombres").limit(5000),
      s.from("acllar_hq_movimientos").select("reserva_key,ac_id,entrega,devolucion,lugar,estatus,cancelada").limit(20000)
    ]);
    if (res[0].error) throw res[0].error; if (res[1].error) throw res[1].error; if (res[2].error) throw res[2].error;
    var kv = {}; (res[1].data || []).forEach(function (r) { try { kv[r.key] = JSON.parse(r.value || "null"); } catch (e) { kv[r.key] = null; } });
    return build(res[0].data || [], kv, res[2].data || [], res[3].error ? null : (res[3].data || []));
  }

  function build(limpRows, kv, persRows, hqRows) {
    var hist = kv["limpieza-historial"] || {}, fact = kv["facturacion-registros"] || {}, tarifas = kv["facturacion-tarifas"] || {}, tamPorAc = kv["acllar-tamano-por-ac"] || {};
    var tamTimed = {}; limpRows.forEach(function (r) { if (r.tamano) tamTimed[String(r.ac_id).toUpperCase()] = r.tamano; });
    function precio(emp, tam) {
      var t = ((tarifas[emp] || {}).tipos || []).find(function (x) { return String(x.nombre).toLowerCase().slice(0, 5) === String(tam).toLowerCase().slice(0, 5); });
      return t ? Number(t.precio) || 0 : 0;
    }
    var calidad = { test: [], sinEmpresa: [], cortas: [], abiertas: [], sinPersonal: [] };

    // Limpiezas contadas (lo mismo que cuenta la app: historial.cleaned)
    var contadas = [];
    Object.keys(hist).sort().forEach(function (d) {
      var node = hist[d]; if (!node || !node.cleaned || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
      var mes = d.slice(0, 7), reg = fact[mes] || {}, asig = reg.asignaciones || {}, pers = reg.personasPorAc || {};
      Object.keys(node.cleaned).forEach(function (k) {
        var ac = String(node.cleaned[k]).trim().toUpperCase();
        if (RE_TEST.test(ac)) { calidad.test.push(ac + " · " + d); return; }
        var emp = asig[ac + "|" + d] || "Sin asignar";
        var tam = tamPorAc[ac] || (node.tamanoPorAc && node.tamanoPorAc[ac]) || tamTimed[ac] || "Grande";
        if (emp === "Sin asignar") calidad.sinEmpresa.push(ac + " · " + d);
        contadas.push({ fecha: d, ac: ac, base: baseAc(ac), emp: emp, tam: tam, persona: normNombre(pers[ac + "|" + d]), flota: RE_FLOTA.test(ac), coste: emp === "Sin asignar" ? 0 : precio(emp, tam) });
      });
    });
    // Extras (repasos, etc.)
    var extras = [];
    Object.keys(fact).forEach(function (mes) {
      (((fact[mes] || {}).extras) || []).forEach(function (x) {
        var t = ((tarifas[x.empresa] || {}).tipos || []).find(function (y) { return y.id === x.tipoId; });
        var u = Number(x.unidades) || 0; if (!x.fecha || !u) return;
        extras.push({ fecha: String(x.fecha).slice(0, 10), emp: x.empresa, tipo: t ? t.nombre : x.tipoId, uds: u, coste: u * (t ? Number(t.precio) || 0 : 0) });
      });
    });
    // Tiempos
    var tiempos = [];
    limpRows.forEach(function (r) {
      var ac = String(r.ac_id || "").trim().toUpperCase();
      if (r.estado !== "terminada" || !r.fin) {
        if (r.inicio && localKey(r.inicio) < today()) calidad.abiertas.push(ac + " · " + localKey(r.inicio) + " · " + r.estado);
        return;
      }
      if (RE_TEST.test(ac)) return;
      var seg = Number(r.tiempo_acumulado_segundos) > 0 ? Number(r.tiempo_acumulado_segundos) : (new Date(r.fin) - new Date(r.inicio)) / 1000;
      var o = { id: r.id, fecha: localKey(r.inicio), ac: ac, base: baseAc(ac), tam: r.tamano || tamPorAc[ac] || "Grande", emp: r.empresa || "Sin asignar", persona: normNombre(r.nombre) || "Sin nombre", min: seg / 60, flota: RE_FLOTA.test(ac), hora: new Date(r.inicio).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) };
      if (o.min < MIN_VALIDO) { calidad.cortas.push(o); return; }
      tiempos.push(o);
    });
    // Personas por día
    var personas = {};
    persRows.forEach(function (r) { var n = Array.isArray(r.nombres) ? r.nombres.length : 0; personas[r.fecha] = (personas[r.fecha] || 0) + n; });
    var diasConLimp = {}; contadas.forEach(function (c) { diasConLimp[c.fecha] = 1; });
    Object.keys(diasConLimp).forEach(function (d) { if (!personas[d]) calidad.sinPersonal.push(d); });
    // HQ
    var hq = null;
    if (hqRows) {
      hq = hqRows.filter(function (r) { return !r.cancelada && r.entrega && r.devolucion && (!r.lugar || /valencia/i.test(r.lugar)) && !/presupuesto|cancel/i.test(r.estatus || ""); })
        .map(function (r) { return { key: r.reserva_key, base: baseAc(r.ac_id), ent: localKey(r.entrega), dev: localKey(r.devolucion) }; });
    }
    var meses = {}; contadas.forEach(function (c) { meses[c.fecha.slice(0, 7)] = 1; }); tiempos.forEach(function (t) { meses[t.fecha.slice(0, 7)] = 1; });
    return { contadas: contadas, extras: extras, tiempos: tiempos, personas: personas, hq: hq, calidad: calidad, meses: Object.keys(meses).sort().reverse(), cargado: new Date() };
  }

  // ---------- filtros ----------
  function rango() {
    var f = st.f, t = today();
    if (f.periodo === "mes" && f.mes) { var p = f.mes.split("-"); var fin = new Date(+p[0], +p[1], 0); return [f.mes + "-01", dkey(fin)]; }
    if (f.periodo === "30") return [addDays(t, -29), t];
    if (f.periodo === "custom") return [f.desde || "2000-01-01", f.hasta || t];
    return ["2000-01-01", t];
  }
  function enRango(d, r) { return d && d >= r[0] && d <= r[1]; }
  function filtra(arr, r, conPersona) {
    var f = st.f;
    return arr.filter(function (x) {
      return enRango(x.fecha, r) && (!f.empresa || x.emp === f.empresa) && (!f.tamano || x.tam === f.tamano) &&
        (!f.tipo || (f.tipo === "flota") === x.flota) && (!conPersona || !f.persona || x.persona === f.persona);
    });
  }

  // ---------- agregados ----------
  function stats(list) {
    var m = list.map(function (x) { return x.min; });
    var mn = null, mx = null; list.forEach(function (x) { if (!mn || x.min < mn.min) mn = x; if (!mx || x.min > mx.min) mx = x; });
    return { n: list.length, media: mean(m), mediana: median(m), min: mn, max: mx };
  }
  function groupBy(list, fn) { var g = {}; list.forEach(function (x) { var k = fn(x); (g[k] = g[k] || []).push(x); }); return g; }

  // ---------- render helpers ----------
  var CSS = "#acllar-stats-plus{margin-top:28px;font-family:inherit;color:var(--ink,#3A1F0F)}" +
    "#acllar-stats-plus h3{font-size:15px;font-weight:700;margin:26px 0 4px}" +
    "#acllar-stats-plus .sp-sub{font-size:11px;color:var(--muted,#6B625B);margin-bottom:10px}" +
    "#acllar-stats-plus .sp-card{background:var(--card,#fff);border:1px solid var(--line,#E6D7CC);border-radius:12px;padding:14px;margin-bottom:12px;overflow-x:auto}" +
    "#acllar-stats-plus .sp-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:12px}" +
    "#acllar-stats-plus .sp-kpi{background:var(--card,#fff);border:1px solid var(--line,#E6D7CC);border-radius:12px;padding:12px}" +
    "#acllar-stats-plus .sp-kpi .l{font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted,#6B625B)}" +
    "#acllar-stats-plus .sp-kpi .v{font-size:22px;font-weight:700;margin-top:4px;font-variant-numeric:tabular-nums}" +
    "#acllar-stats-plus .sp-kpi .s{font-size:11px;color:var(--muted,#6B625B);margin-top:3px}" +
    "#acllar-stats-plus table{border-collapse:collapse;width:100%;font-size:12px}" +
    "#acllar-stats-plus th{text-align:left;font-weight:600;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted,#6B625B);padding:6px 8px;border-bottom:1px solid var(--line,#E6D7CC);white-space:nowrap}" +
    "#acllar-stats-plus td{padding:5px 8px;border-bottom:1px solid #F4ECE7;font-variant-numeric:tabular-nums;white-space:nowrap}" +
    "#acllar-stats-plus td.n,#acllar-stats-plus th.n{text-align:right}" +
    "#acllar-stats-plus th.sort{cursor:pointer}#acllar-stats-plus th.sort:hover{color:var(--ink,#3A1F0F)}" +
    "#acllar-stats-plus .sp-filters{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end;background:var(--paper,#F5EDE6);border-radius:12px;padding:10px 12px;position:sticky;top:0;z-index:5}" +
    "#acllar-stats-plus .sp-filters label{display:block;font-size:10px;color:var(--muted,#6B625B);margin-bottom:2px}" +
    "#acllar-stats-plus select,#acllar-stats-plus input{font-size:12px;padding:5px 7px;border:1px solid var(--line,#E6D7CC);border-radius:6px;background:#fff}" +
    "#acllar-stats-plus button.sp-btn{font-size:12px;padding:6px 10px;border-radius:6px;border:1px solid var(--line,#E6D7CC);background:#fff;cursor:pointer}" +
    "#acllar-stats-plus .sp-bars{display:flex;align-items:flex-end;gap:2px;height:120px;padding-top:8px}" +
    "#acllar-stats-plus .sp-bar{flex:1;min-width:6px;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;position:relative}" +
    "#acllar-stats-plus .sp-bar i{display:block;width:100%;border-radius:4px 4px 0 0}" +
    "#acllar-stats-plus .sp-bar:hover i{filter:brightness(.85)}" +
    "#acllar-stats-plus .sp-xl{display:flex;gap:2px;font-size:9px;color:var(--muted,#6B625B);margin-top:4px}" +
    "#acllar-stats-plus .sp-xl span{flex:1;min-width:6px;text-align:center;overflow:hidden}" +
    "#acllar-stats-plus .sp-legend{display:flex;gap:14px;font-size:11px;color:var(--muted,#6B625B);margin-bottom:4px}" +
    "#acllar-stats-plus .sp-legend b{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:5px;vertical-align:-1px}" +
    "#acllar-stats-plus .sp-hbar{display:inline-block;height:8px;border-radius:0 4px 4px 0;vertical-align:middle;margin-right:6px}" +
    "#acllar-stats-plus .sp-note{font-size:11px;color:var(--muted,#6B625B);background:var(--paper,#F5EDE6);border-radius:8px;padding:8px 10px;margin-bottom:10px}" +
    "#acllar-stats-plus .sp-warn{border-left:3px solid var(--clay,#C24B3F)}" +
    "#acllar-stats-plus details summary{cursor:pointer;font-size:12px;font-weight:600}" +
    "#acllar-stats-plus .mut{color:var(--muted,#6B625B)}";

  function kpi(l, v, s) { return '<div class="sp-kpi"><div class="l">' + esc(l) + '</div><div class="v">' + v + '</div>' + (s ? '<div class="s">' + s + '</div>' : "") + '</div>'; }
  function table(head, rows, opts) {
    opts = opts || {};
    var h = "<table><thead><tr>" + head.map(function (c, i) { var cls = (c.n ? "n " : "") + (c.sort ? "sort" : ""); return '<th class="' + cls + '"' + (c.sort ? ' data-sort="' + c.sort + '"' : "") + ">" + esc(c.t) + (opts.sortKey && c.sort === opts.sortKey ? (opts.sortDir > 0 ? " ▲" : " ▼") : "") + "</th>"; }).join("") + "</tr></thead><tbody>";
    if (!rows.length) h += '<tr><td colspan="' + head.length + '" class="mut">Sin datos para los filtros elegidos.</td></tr>';
    rows.forEach(function (r) { h += "<tr>" + r.map(function (v, i) { return '<td class="' + (head[i].n ? "n" : "") + '">' + v + "</td>"; }).join("") + "</tr>"; });
    return h + "</tbody></table>";
  }
  function detalle(x) { return x ? esc(x.ac) + " · " + fmtShort(x.fecha) + " · " + esc(x.persona) : ""; }
  function statRow(label, s) { return [label, num(s.n, 0), hm(s.media), hm(s.mediana), hm(s.min && s.min.min) + ' <span class="mut">' + detalle(s.min) + "</span>", hm(s.max && s.max.min) + ' <span class="mut">' + detalle(s.max) + "</span>"]; }
  var STAT_HEAD = [{ t: "" }, { t: "Nº", n: 1 }, { t: "Promedio", n: 1 }, { t: "Mediana", n: 1 }, { t: "Mínimo" }, { t: "Máximo" }];
  function bars(series, labels, opts) {
    opts = opts || {}; var max = 0; series.forEach(function (s) { s.vals.forEach(function (v) { if (v > max) max = v; }); }); if (!max) max = 1;
    var h = "";
    if (series.length > 1) h += '<div class="sp-legend">' + series.map(function (s) { return '<span><b style="background:' + s.color + '"></b>' + esc(s.name) + "</span>"; }).join("") + "</div>";
    h += '<div class="sp-bars">';
    labels.forEach(function (lab, i) {
      h += '<div style="flex:1;display:flex;gap:2px;align-items:flex-end;height:100%">';
      series.forEach(function (s) {
        var v = s.vals[i] || 0, px = Math.round(v / max * 108);
        h += '<div class="sp-bar" title="' + esc(lab + " · " + s.name + ": " + num(v, opts.dec == null ? 1 : opts.dec)) + '"><i style="height:' + Math.max(v ? 2 : 0, px) + 'px;background:' + s.color + '"></i></div>';
      });
      h += "</div>";
    });
    h += '</div><div class="sp-xl">' + labels.map(function (l) { return "<span>" + esc(l) + "</span>"; }).join("") + "</div>";
    return h;
  }
  function hbar(v, max, color) { return '<span class="sp-hbar" style="width:' + Math.round((v / (max || 1)) * 80) + 'px;background:' + color + '"></span>'; }

  // ---------- secciones ----------
  function secFiltros(D) {
    var f = st.f, personas = {}; D.tiempos.forEach(function (t) { personas[t.persona] = 1; }); D.contadas.forEach(function (c) { if (c.persona) personas[c.persona] = 1; });
    function sel(id, val, opts) { return '<select data-f="' + id + '">' + opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (o[0] === val ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join("") + "</select>"; }
    var h = '<div class="sp-filters">';
    h += "<div><label>Periodo</label>" + sel("periodo", f.periodo, [["todo", "Todo el histórico"], ["mes", "Un mes"], ["30", "Últimos 30 días"], ["custom", "Personalizado"]]) + "</div>";
    if (f.periodo === "mes") h += "<div><label>Mes</label>" + sel("mes", f.mes, D.meses.map(function (m) { return [m, m]; })) + "</div>";
    if (f.periodo === "custom") h += '<div><label>Desde</label><input type="date" data-f="desde" value="' + esc(f.desde) + '"></div><div><label>Hasta</label><input type="date" data-f="hasta" value="' + esc(f.hasta) + '"></div>';
    h += "<div><label>Empresa</label>" + sel("empresa", f.empresa, [["", "Todas"], ["DOGOR", "DOGOR"], ["ISMED", "ISMED"]]) + "</div>";
    h += "<div><label>Persona</label>" + sel("persona", f.persona, [["", "Todas"]].concat(Object.keys(personas).filter(Boolean).sort().map(function (p) { return [p, p]; }))) + "</div>";
    h += "<div><label>Tamaño</label>" + sel("tamano", f.tamano, [["", "Todos"], ["Grande", "Grande"], ["Mediano", "Mediano"]]) + "</div>";
    h += "<div><label>Vehículos</label>" + sel("tipo", f.tipo, [["", "Todos"], ["flota", "Flota de alquiler"], ["fuera", "Fuera de flota"]]) + "</div>";
    h += '<div style="margin-left:auto"><button class="sp-btn" data-act="reload">↻ Actualizar datos</button><div class="mut" style="font-size:10px;margin-top:2px">Datos de ' + D.cargado.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) + "</div></div>";
    return h + "</div>";
  }

  function secResumen(D, r) {
    var cont = filtra(D.contadas, r, true), ext = D.extras.filter(function (x) { return enRango(x.fecha, r) && (!st.f.empresa || x.emp === st.f.empresa); });
    var coste = cont.reduce(function (a, c) { return a + c.coste; }, 0) + ext.reduce(function (a, x) { return a + x.coste; }, 0);
    var t = filtra(D.tiempos, r, true), g = t.filter(function (x) { return x.tam === "Grande"; }), m = t.filter(function (x) { return x.tam === "Mediano"; });
    var dias = {}; cont.forEach(function (c) { dias[c.fecha] = 1; }); var pd = Object.keys(dias).reduce(function (a, d) { return a + (D.personas[d] || 0); }, 0);
    var devs = D.hq ? D.hq.filter(function (h) { return enRango(h.dev, r) && h.dev <= today(); }).length : null;
    var h = '<div class="sp-grid">';
    h += kpi("Limpiezas contadas", num(cont.length, 0), cont.filter(function (c) { return !c.flota; }).length + " fuera de flota");
    h += kpi("Coste limpieza", eur(coste), ext.length ? "incl. " + ext.reduce(function (a, x) { return a + x.uds; }, 0) + " extras/repasos" : "");
    h += kpi("Devoluciones HQ", devs == null ? "—" : num(devs, 0), devs ? "coste/devolución " + eur(coste / devs) : (D.hq ? "" : "histórico HQ no disponible"));
    h += kpi("Limpiezas por persona-día", pd ? num(cont.length / pd, 2) : "—", pd ? num(pd, 0) + " personas-día" : "");
    h += kpi("Tiempo medio grande", hm(mean(g.map(function (x) { return x.min; }))), g.length + " cronometradas");
    h += kpi("Tiempo medio mediano", hm(mean(m.map(function (x) { return x.min; }))), m.length + " cronometradas");
    return h + "</div>";
  }

  function secTiempos(D, r) {
    var t = filtra(D.tiempos, r, true);
    var h = "<h3>Tiempos de limpieza</h3><div class='sp-sub'>Tiempo trabajado sin pausas. Se excluyen los registros de menos de " + MIN_VALIDO + " min (errores) — ver «Calidad de datos».</div>";
    var s = stats(t);
    h += '<div class="sp-grid">' + kpi("Cronometradas", num(s.n, 0)) + kpi("Promedio", hm(s.media)) + kpi("Mediana", hm(s.mediana)) +
      kpi("Mínimo", hm(s.min && s.min.min), detalle(s.min)) + kpi("Máximo", hm(s.max && s.max.min), detalle(s.max)) + "</div>";
    function bloque(titulo, groups, order) {
      var keys = order || Object.keys(groups).sort();
      return '<div class="sp-card"><div style="font-size:13px;font-weight:600;margin-bottom:6px">' + esc(titulo) + "</div>" +
        table(STAT_HEAD, keys.filter(function (k) { return groups[k]; }).map(function (k) { return statRow(esc(String(k).replace(/^\d /, "")), stats(groups[k])); })) + "</div>";
    }
    h += bloque("Por tamaño", groupBy(t, function (x) { return x.tam; }), ["Grande", "Mediano"]);
    h += bloque("Por empresa y tamaño", groupBy(t, function (x) { return x.emp + " · " + x.tam; }));
    h += bloque("Por persona y tamaño", groupBy(t, function (x) { return x.persona + " (" + x.emp + ") · " + x.tam; }));
    h += bloque("Flota de alquiler vs. fuera de flota", groupBy(t, function (x) { return (x.flota ? "Flota" : "Fuera de flota") + " · " + x.tam; }));
    h += bloque("Por día de la semana", groupBy(t, function (x) { return dow(x.fecha) + " " + DIAS[dow(x.fecha)] + " · " + x.tam; }));
    // evolución semanal
    var wk = groupBy(t, function (x) { return weekStart(x.fecha); }), wks = Object.keys(wk).sort();
    var gv = wks.map(function (w) { return mean(wk[w].filter(function (x) { return x.tam === "Grande"; }).map(function (x) { return x.min; })) || 0; });
    var mv = wks.map(function (w) { return mean(wk[w].filter(function (x) { return x.tam === "Mediano"; }).map(function (x) { return x.min; })) || 0; });
    h += '<div class="sp-card"><div style="font-size:13px;font-weight:600;margin-bottom:6px">Evolución semanal del promedio (min)</div>' +
      bars([{ name: "Grande", color: C_DEV, vals: gv }, { name: "Mediano", color: C_LIMP, vals: mv }], wks.map(function (w) { return "sem " + fmtShort(w); }), { dec: 0 }) + "</div>";
    // por vehículo
    var byV = groupBy(t, function (x) { return x.ac; }), rows = Object.keys(byV).map(function (k) { var s = stats(byV[k]); var last = byV[k][byV[k].length - 1]; return { ac: k, tam: byV[k][0].tam, n: s.n, media: s.media, min: s.min.min, max: s.max.min, ultima: last.fecha }; });
    var sk = st.sortVeh.k, sd = st.sortVeh.d;
    rows.sort(function (a, b) { var x = a[sk], y = b[sk]; return (typeof x === "string" ? String(x).localeCompare(y) : (x - y)) * sd; });
    var maxMedia = Math.max.apply(null, rows.map(function (x) { return x.media; }).concat([1]));
    h += '<div class="sp-card"><div style="font-size:13px;font-weight:600;margin-bottom:6px">Por vehículo <span class="mut" style="font-weight:400">(pulsa una columna para ordenar)</span></div>' +
      table([{ t: "Vehículo", sort: "ac" }, { t: "Tamaño", sort: "tam" }, { t: "Nº", n: 1, sort: "n" }, { t: "Promedio", sort: "media" }, { t: "Mínimo", n: 1, sort: "min" }, { t: "Máximo", n: 1, sort: "max" }, { t: "Última", sort: "ultima" }],
        rows.map(function (x) { return [esc(x.ac), esc(x.tam), x.n, hbar(x.media, maxMedia, x.tam === "Grande" ? C_DEV : C_LIMP) + hm(x.media), hm(x.min), hm(x.max), fmtShort(x.ultima)]; }), { sortKey: sk, sortDir: sd }) + "</div>";
    return h;
  }

  function secActividad(D, r) {
    var cont = filtra(D.contadas, r, true), ext = D.extras.filter(function (x) { return enRango(x.fecha, r) && (!st.f.empresa || x.emp === st.f.empresa); });
    var t = filtra(D.tiempos, r, true);
    var hq = D.hq;
    function agg(keyFn) {
      var o = {};
      function g(k) { return o[k] = o[k] || { devol: 0, ent: 0, flota: 0, fuera: 0, extras: 0, coste: 0, dias: {}, min: 0 }; }
      cont.forEach(function (c) { var x = g(keyFn(c.fecha)); c.flota ? x.flota++ : x.fuera++; x.coste += c.coste; x.dias[c.fecha] = 1; });
      ext.forEach(function (e) { var x = g(keyFn(e.fecha)); x.extras += e.uds; x.coste += e.coste; });
      t.forEach(function (e) { g(keyFn(e.fecha)).min += e.min; });
      if (hq) { hq.forEach(function (h) { if (enRango(h.dev, r) && h.dev <= today()) g(keyFn(h.dev)).devol++; if (enRango(h.ent, r) && h.ent <= today()) g(keyFn(h.ent)).ent++; }); }
      Object.keys(o).forEach(function (k) { o[k].pd = Object.keys(o[k].dias).reduce(function (a, d) { return a + (D.personas[d] || 0); }, 0); });
      return o;
    }
    function tabla(o, labelFn) {
      var keys = Object.keys(o).sort();
      return table([{ t: "Periodo" }, { t: "Devol. HQ", n: 1 }, { t: "Entregas HQ", n: 1 }, { t: "Limp. flota", n: 1 }, { t: "Fuera flota", n: 1 }, { t: "Extras", n: 1 }, { t: "Personas-día", n: 1 }, { t: "Coste", n: 1 }, { t: "Coste/devol.", n: 1 }, { t: "Limp./devol.", n: 1 }, { t: "Limp./persona-día", n: 1 }, { t: "h crono/persona-día", n: 1 }],
        keys.map(function (k) { var x = o[k]; var tot = x.flota + x.fuera; return [labelFn(k), hq ? x.devol : "—", hq ? x.ent : "—", x.flota, x.fuera, x.extras, x.pd, eur(x.coste), hq && x.devol ? eur(x.coste / x.devol) : "—", hq && x.devol ? num(x.flota / x.devol, 2) : "—", x.pd ? num(tot / x.pd, 2) : "—", x.pd && x.min ? num(x.min / 60 / x.pd, 1) : "—"]; }));
    }
    var h = "<h3>Actividad, coste y carga</h3><div class='sp-sub'>Limpiezas = las que cuenta la pantalla de control (facturación). Coste según tarifas vigentes, incluidos repasos y extras. «h crono» solo cuenta lo cronometrado.</div>";
    if (!hq) h += '<div class="sp-note sp-warn">El histórico de entregas/devoluciones de HQ aún no está activado en la base de datos, así que no se muestran devoluciones, entregas ni coste por devolución.</div>';
    else h += '<div class="sp-note">Devoluciones y entregas: reservas de HQ con lugar Valencia (fecha prevista de devolución/entrega). Histórico desde el 17/08/2026; del 2 al 7 de octubre puede faltar alguna reserva.</div>';
    h += '<div class="sp-card"><div style="font-size:13px;font-weight:600;margin-bottom:6px">Por semana (lunes)</div>' + tabla(agg(weekStart), function (k) { return "sem " + fmtShort(k); }) + "</div>";
    h += '<div class="sp-card"><div style="font-size:13px;font-weight:600;margin-bottom:6px">Por mes</div>' + tabla(agg(function (d) { return d.slice(0, 7); }), function (k) { return k; }) + "</div>";
    // día de la semana
    var dd = {}; for (var i = 0; i < 7; i++) dd[i] = { devol: 0, ent: 0, limp: 0, pers: 0, dias: {} };
    var d0 = r[0] < "2026-08-17" ? (cont.length ? cont[0].fecha : today()) : r[0], d1 = r[1] > today() ? today() : r[1];
    var nd = {}; for (var k = d0; k <= d1; k = addDays(k, 1)) { nd[dow(k)] = (nd[dow(k)] || 0) + 1; dd[dow(k)].pers += D.personas[k] || 0; }
    cont.forEach(function (c) { dd[dow(c.fecha)].limp++; });
    if (hq) hq.forEach(function (h2) { if (enRango(h2.dev, [d0, d1]) && h2.dev >= "2026-08-17") dd[dow(h2.dev)].devol++; if (enRango(h2.ent, [d0, d1]) && h2.ent >= "2026-08-17") dd[dow(h2.ent)].ent++; });
    var idx = [0, 1, 2, 3, 4, 5, 6];
    var series = [{ name: "Limpiezas / día", color: C_LIMP, vals: idx.map(function (i) { return nd[i] ? dd[i].limp / nd[i] : 0; }) }];
    if (hq) series.unshift({ name: "Devoluciones / día", color: C_DEV, vals: idx.map(function (i) { return nd[i] ? dd[i].devol / nd[i] : 0; }) });
    h += '<div class="sp-card"><div style="font-size:13px;font-weight:600;margin-bottom:6px">Por día de la semana (media diaria)</div>' + bars(series, DIAS) +
      table([{ t: "Día" }, { t: "Devoluciones", n: 1 }, { t: "Entregas", n: 1 }, { t: "Limpiezas", n: 1 }, { t: "Personas", n: 1 }],
        idx.map(function (i) { var n = nd[i] || 1; return [DIAS[i], hq ? num(dd[i].devol / n) : "—", hq ? num(dd[i].ent / n) : "—", num(dd[i].limp / n), num(dd[i].pers / n)]; })) + "</div>";
    return h;
  }

  function matchDevoluciones(D, r) {
    // Para cada devolución HQ (Valencia) en el rango: limpieza siguiente del mismo AC y entrega siguiente
    var limp = groupBy(D.contadas.filter(function (c) { return c.flota; }), function (c) { return c.base; });
    Object.keys(limp).forEach(function (k) { limp[k].sort(function (a, b) { return a.fecha < b.fecha ? -1 : 1; }); });
    var porAc = groupBy(D.hq, function (h) { return h.base; });
    Object.keys(porAc).forEach(function (k) { porAc[k].sort(function (a, b) { return a.ent < b.ent ? -1 : 1; }); });
    var out = [];
    D.hq.forEach(function (h) {
      if (!enRango(h.dev, r) || h.dev > today()) return;
      var sig = (porAc[h.base] || []).filter(function (x) { return x.ent >= h.dev && x.key !== h.key; })[0] || null;
      var l = (limp[h.base] || []).filter(function (c) { return c.fecha >= h.dev && (!sig || c.fecha <= sig.ent); })[0] || null;
      out.push({ ac: h.base, dev: h.dev, limp: l ? l.fecha : null, ent: sig ? sig.ent : null });
    });
    return out;
  }

  function secPlazos(D, r) {
    var h = "<h3>Plazos: devolución → limpieza → entrega</h3>";
    if (!D.hq) return h + '<div class="sp-note sp-warn">Necesita el histórico de HQ (pendiente de activar).</div>';
    var M = matchDevoluciones(D, r);
    var conL = M.filter(function (x) { return x.limp; }), dist = {};
    conL.forEach(function (x) { var d = diffDays(x.dev, x.limp); var b = d >= 7 ? "7+" : String(d); dist[b] = (dist[b] || 0) + 1; });
    var buckets = ["0", "1", "2", "3", "4", "5", "6", "7+"];
    var conE = M.filter(function (x) { return x.ent && x.ent <= today(); });
    var mismoDia = conE.filter(function (x) { return x.limp && x.limp === x.ent; });
    var sinLimp = conE.filter(function (x) { return !x.limp; });
    var pendientes = M.filter(function (x) { return !x.limp && !x.ent && diffDays(x.dev, today()) > 3; });
    h += '<div class="sp-grid">' + kpi("Devoluciones", num(M.length, 0)) + kpi("Días hasta limpiar (mediana)", num(median(conL.map(function (x) { return diffDays(x.dev, x.limp); })), 1), conL.length + " con limpieza registrada") +
      kpi("Limpiadas el día de la entrega", conE.length ? num(100 * mismoDia.length / conE.length, 0) + " %" : "—", mismoDia.length + " de " + conE.length) +
      kpi("Entregadas sin limpieza registrada", num(sinLimp.length, 0), sinLimp.length ? "revisar abajo" : "ninguna") + "</div>";
    h += '<div class="sp-card"><div style="font-size:13px;font-weight:600;margin-bottom:6px">Días entre devolución y limpieza</div>' + bars([{ name: "Devoluciones", color: C_DEV, vals: buckets.map(function (b) { return dist[b] || 0; }) }], buckets.map(function (b) { return b + " d"; }), { dec: 0 }) + "</div>";
    // cola diaria
    var d0 = r[0] < "2026-08-24" ? "2026-08-24" : r[0], d1 = r[1] > today() ? today() : r[1], labs = [], vals = [];
    for (var k = d0; k <= d1; k = addDays(k, 1)) {
      if (dow(k) > 4) continue;
      labs.push(fmtShort(k)); vals.push(M.filter(function (x) { return x.dev <= k && (x.limp ? x.limp > k : (!x.ent || x.ent > k)); }).length);
    }
    if (labs.length) h += '<div class="sp-card"><div style="font-size:13px;font-weight:600;margin-bottom:6px">Cola: vehículos devueltos pendientes de limpiar al cierre de cada día (lun–vie)</div>' + bars([{ name: "Pendientes", color: C_DEV, vals: vals }], labs, { dec: 0 }) + "</div>";
    if (sinLimp.length) h += '<div class="sp-card sp-warn"><div style="font-size:13px;font-weight:600;margin-bottom:6px">Entregados sin limpieza registrada desde su devolución</div>' +
      table([{ t: "Vehículo" }, { t: "Devolución" }, { t: "Siguiente entrega" }], sinLimp.map(function (x) { return [esc(x.ac), fmtDay(x.dev), fmtDay(x.ent)]; })) + "</div>";
    if (pendientes.length) h += '<div class="sp-card"><div style="font-size:13px;font-weight:600;margin-bottom:6px">Devueltos hace más de 3 días sin limpieza registrada</div>' +
      table([{ t: "Vehículo" }, { t: "Devolución" }, { t: "Días" , n: 1 }], pendientes.map(function (x) { return [esc(x.ac), fmtDay(x.dev), diffDays(x.dev, today())]; })) + "</div>";
    return h;
  }

  function secFuera(D, r) {
    var c = D.contadas.filter(function (x) { return !x.flota && enRango(x.fecha, r) && (!st.f.empresa || x.emp === st.f.empresa); });
    var tot = D.contadas.filter(function (x) { return enRango(x.fecha, r) && (!st.f.empresa || x.emp === st.f.empresa); }).length;
    var tmap = {}; D.tiempos.forEach(function (t) { tmap[t.ac + "|" + t.fecha] = t.min; });
    var h = "<h3>Limpiezas fuera de la flota de alquiler</h3><div class='sp-sub'>Vehículos de venta, nuevos u otros que no son AC de alquiler.</div>";
    h += '<div class="sp-grid">' + kpi("Limpiezas", num(c.length, 0), tot ? num(100 * c.length / tot, 1) + " % del total" : "") + kpi("Coste", eur(c.reduce(function (a, x) { return a + x.coste; }, 0))) + "</div>";
    h += '<div class="sp-card">' + table([{ t: "Fecha" }, { t: "Vehículo" }, { t: "Tamaño" }, { t: "Empresa" }, { t: "Tiempo", n: 1 }, { t: "Coste", n: 1 }], c.slice().reverse().map(function (x) { return [fmtDay(x.fecha), esc(x.ac), esc(x.tam), esc(x.emp), hm(tmap[x.ac + "|" + x.fecha]), eur(x.coste)]; })) + "</div>";
    return h;
  }

  function secCalidad(D) {
    var q = D.calidad, items = [];
    if (q.cortas.length) items.push(["Limpiezas de menos de " + MIN_VALIDO + " min (excluidas de los tiempos)", q.cortas.map(function (x) { return x.ac + " · " + fmtShort(x.fecha) + " " + x.hora + " · " + num(x.min, 0) + " min"; })]);
    if (q.abiertas.length) items.push(["Limpiezas iniciadas en días anteriores sin terminar", q.abiertas]);
    if (q.test.length) items.push(["Registros de prueba ignorados", q.test]);
    if (q.sinEmpresa.length) items.push(["Limpiezas contadas sin empresa asignada", q.sinEmpresa]);
    if (q.sinPersonal.length) items.push(["Días con limpiezas pero sin personal registrado", q.sinPersonal.map(fmtDay)]);
    var h = "<h3>Calidad de datos</h3>";
    if (!items.length) return h + '<div class="sp-note">Sin incidencias.</div>';
    return h + '<div class="sp-card">' + items.map(function (it) { return "<details><summary>" + esc(it[0]) + " (" + it[1].length + ")</summary><div class='mut' style='font-size:11px;margin:6px 0 10px;line-height:1.7'>" + it[1].map(esc).join("<br>") + "</div></details>"; }).join("") + "</div>";
  }

  // ---------- montaje ----------
  function render(el) {
    if (!document.getElementById("acllar-stats-plus-css")) { var s = document.createElement("style"); s.id = "acllar-stats-plus-css"; s.textContent = CSS; document.head.appendChild(s); }
    if (st.err) { el.innerHTML = '<div class="sp-note sp-warn">No se pudieron cargar las estadísticas ampliadas: ' + esc(st.err) + ' <button class="sp-btn" data-act="reload">Reintentar</button></div>'; return; }
    if (!st.data) { el.innerHTML = '<div class="sp-note">Cargando estadísticas ampliadas…</div>'; return; }
    var D = st.data, r = rango();
    if (st.f.periodo === "mes" && !st.f.mes) st.f.mes = D.meses[0] || "";
    el.innerHTML = '<div style="font-size:18px;font-weight:700;margin-bottom:8px">Estadísticas ampliadas</div>' + secFiltros(D) +
      '<div style="margin-top:12px">' + secResumen(D, r) + "</div>" + secTiempos(D, r) + secActividad(D, r) + secPlazos(D, r) + secFuera(D, r) + secCalidad(D);
  }
  async function refresh(el) {
    if (st.loading) return; st.loading = true; st.err = null; render(el);
    try { st.data = await load(); } catch (e) { st.err = (e && e.message) || String(e); }
    st.loading = false; render(el);
  }
  function wire(el) {
    el.addEventListener("change", function (e) {
      var k = e.target.getAttribute("data-f"); if (!k) return;
      st.f[k] = e.target.value; if (k === "periodo" && st.f.periodo === "mes" && !st.f.mes && st.data) st.f.mes = st.data.meses[0] || "";
      render(el);
    });
    el.addEventListener("click", function (e) {
      var b = e.target.closest("[data-act]"); if (b && b.getAttribute("data-act") === "reload") { refresh(el); return; }
      var th = e.target.closest("th[data-sort]");
      if (th) { var k = th.getAttribute("data-sort"); st.sortVeh = { k: k, d: st.sortVeh.k === k ? -st.sortVeh.d : (k === "ac" || k === "tam" ? 1 : -1) }; render(el); }
    });
  }
  setInterval(function () {
    var el = document.getElementById("acllar-stats-plus");
    if (!el || !el.offsetParent) return;
    if (!el.__wired) { el.__wired = true; wire(el); }
    if (!st.data && !st.loading && !st.err) refresh(el);
    else if (!el.firstChild) render(el);
  }, 800);
})();
