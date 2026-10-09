/* Partes firmados → carpeta de OneDrive (sincronizada en el PC).
   - Copia solo las fotos con exportado_at = null y luego las marca.
   - La carpeta se elige una vez y se recuerda (IndexedDB).
   - Solo el usuario sebastian@ac-llar.com puede exportar. */
(function () {
  "use strict";
  if (window.ACLLAR_PARTES) return;

  var BUCKET = "limpieza-partes";
  var ADMIN = "sebastian@ac-llar.com";
  var DB = "acllar-partes-onedrive", STORE = "handles", KEY = "carpeta";

  function sb() { return window.__ACLLAR_SUPABASE; }

  function idb(mode, fn) {
    return new Promise(function (res, rej) {
      var r = indexedDB.open(DB, 1);
      r.onupgradeneeded = function () { r.result.createObjectStore(STORE); };
      r.onerror = function () { rej(r.error); };
      r.onsuccess = function () {
        var tx = r.result.transaction(STORE, mode), st = tx.objectStore(STORE), q = fn(st);
        tx.oncomplete = function () { res(q && q.result); };
        tx.onerror = function () { rej(tx.error); };
      };
    });
  }
  var getHandle = function () { return idb("readonly", function (s) { return s.get(KEY); }).catch(function () { return null; }); };
  var setHandle = function (h) { return idb("readwrite", function (s) { return s.put(h, KEY); }); };

  async function elegirCarpeta() {
    if (!window.showDirectoryPicker) throw new Error("Este navegador no permite elegir carpetas. Usa Edge o Chrome en el PC.");
    var h = await window.showDirectoryPicker({ id: "acllar-partes", mode: "readwrite" });
    await setHandle(h);
    return h;
  }

  async function permiso(h) {
    var p = await h.queryPermission({ mode: "readwrite" });
    if (p !== "granted") p = await h.requestPermission({ mode: "readwrite" });
    return p === "granted";
  }

  // "09/10" -> "09.10"; quita caracteres no válidos en nombres de archivo
  function nombreArchivo(nombre, mime) {
    var base = String(nombre || "parte").trim().replace(/\//g, ".").replace(/[\\:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim() || "parte";
    if (/\.(jpe?g|png|webp|heic)$/i.test(base)) return base;
    var ext = (mime || "").indexOf("png") >= 0 ? ".png" : (mime || "").indexOf("webp") >= 0 ? ".webp" : ".jpg";
    return base + ext;
  }

  async function existe(dir, name) {
    try { await dir.getFileHandle(name, { create: false }); return true; } catch (e) { return false; }
  }

  async function nombreLibre(dir, name) {
    if (!(await existe(dir, name))) return name;
    var dot = name.lastIndexOf("."), b = dot > 0 ? name.slice(0, dot) : name, ext = dot > 0 ? name.slice(dot) : "";
    for (var i = 2; i < 500; i++) { var n = b + " (" + i + ")" + ext; if (!(await existe(dir, n))) return n; }
    throw new Error("Demasiados archivos con el nombre " + name);
  }

  async function esAdmin() {
    var s = sb(); if (!s) return false;
    var u = (await s.auth.getUser()).data.user;
    return !!u && String(u.email || "").toLowerCase() === ADMIN;
  }

  async function exportar(opts) {
    opts = opts || {};
    try {
      var s = sb();
      if (!s) throw new Error("No hay conexión con la base de datos.");
      if (!(await esAdmin())) { alert("Solo el usuario de Sebastián puede exportar los partes a OneDrive."); return; }

      var dir = opts.cambiar ? null : await getHandle();
      if (!dir) {
        if (!opts.cambiar && !confirm("Elige la carpeta de OneDrive donde guardar los partes.\n(Solo se pide la primera vez.)")) return;
        dir = await elegirCarpeta();
        if (opts.cambiar) { alert("Carpeta guardada: " + dir.name); return; }
      }
      if (!(await permiso(dir))) { alert("Sin permiso para escribir en la carpeta \"" + dir.name + "\"."); return; }

      var q = await s.from("limpieza_partes_fotos")
        .select("id,storage_path,nombre,mime_type,created_at,limpieza_partes(fecha,empresa)")
        .is("exportado_at", null).order("created_at", { ascending: true });
      if (q.error) throw q.error;
      var pendientes = q.data || [];
      if (!pendientes.length) { alert("No hay partes nuevos para exportar.\nCarpeta: " + dir.name); return; }

      var ok = [], fallos = [];
      for (var i = 0; i < pendientes.length; i++) {
        var f = pendientes[i];
        try {
          var d = await s.storage.from(BUCKET).download(f.storage_path);
          if (d.error) throw d.error;
          var name = await nombreLibre(dir, nombreArchivo(f.nombre, f.mime_type || d.data.type));
          var w = await (await dir.getFileHandle(name, { create: true })).createWritable();
          await w.write(d.data); await w.close();
          var up = await s.from("limpieza_partes_fotos").update({ exportado_at: new Date().toISOString() }).eq("id", f.id);
          if (up.error) throw up.error;
          ok.push(name);
        } catch (e) {
          fallos.push((f.nombre || f.storage_path) + ": " + (e && e.message ? e.message : e));
        }
      }
      var msg = "✓ " + ok.length + " parte" + (ok.length === 1 ? "" : "s") + " exportado" + (ok.length === 1 ? "" : "s") + " a \"" + dir.name + "\"";
      if (ok.length) msg += ":\n• " + ok.join("\n• ");
      if (fallos.length) msg += "\n\n⚠ No se pudieron exportar " + fallos.length + ":\n" + fallos.join("\n");
      alert(msg);
    } catch (e) {
      if (e && e.name === "AbortError") return; // canceló el selector de carpeta
      alert("Error al exportar a OneDrive: " + (e && e.message ? e.message : e));
    }
  }

  async function renombrar(fotoId, actual) {
    if (!fotoId) { alert("Esta foto aún no está guardada en la nube."); return false; }
    var nuevo = prompt("Nombre del parte (fecha en formato DD/MM):", actual || "");
    if (nuevo == null) return false;
    nuevo = nuevo.trim();
    if (!nuevo || nuevo === actual) return false;
    var r = await sb().from("limpieza_partes_fotos").update({ nombre: nuevo }).eq("id", fotoId);
    if (r.error) { alert("No se pudo renombrar: " + r.error.message); return false; }
    window.dispatchEvent(new Event("acllar-partes-refresh"));
    return true;
  }

  window.ACLLAR_PARTES = { exportar: exportar, cambiarCarpeta: function () { return exportar({ cambiar: true }); }, renombrar: renombrar };
})();
