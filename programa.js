/* Acordes: transposición, notación (C-D-E / Do-Re-Mi) y pintado de canciones.
   Lo usan la aplicación y los cancioneros HTML que se descargan. Sin dependencias. */
(function (global) {
  "use strict";

  const SUFIJO = "(?:maj|min|dim|aug|sus|add|º|°|\\+)?\\d*(?:(?:maj|sus|add|[#b])\\d+)*";
  const AMERICANO = new RegExp("^[A-G][#b]?(?:m(?!aj))?" + SUFIJO + "(?:/[A-G][#b]?)?$");
  const NOTAS = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
  const SOSTENIDOS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const BEMOLES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
  // tonos que se escriben con bemoles (mayores: F Bb Eb Ab Db; menores: Dm Gm Cm Fm Bbm Ebm)
  const MAYOR_BEMOL = [5, 10, 3, 8, 1], MENOR_BEMOL = [2, 7, 0, 5, 10, 3];
  const MAYOR_SOST = [7, 2, 9, 4, 11, 6], MENOR_SOST = [4, 11, 6, 1, 8];
  const INDICE = { C: 0, "B#": 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, Fb: 4, F: 5, "E#": 5,
    "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11, Cb: 11 };
  const SOLFEO = { C: "Do", D: "Re", E: "Mi", F: "Fa", G: "Sol", A: "La", B: "Si" };

  function esAcorde(parte) { return AMERICANO.test(parte); }

  const mod12 = (x) => ((x % 12) + 12) % 12;

  /* Grafía del tono de destino: "b" (bemoles), "#" (sostenidos) o "" (mixta). */
  function grafia(tonoOriginal, n) {
    const m = /^([A-G][#b]?)(m?)/.exec(tonoOriginal || "");
    if (!m || INDICE[m[1]] === undefined) return "";
    const i = mod12(INDICE[m[1]] + n), menor = m[2] === "m";
    if ((menor ? MENOR_BEMOL : MAYOR_BEMOL).includes(i)) return "b";
    if ((menor ? MENOR_SOST : MAYOR_SOST).includes(i)) return "#";
    return "";
  }

  function moverNota(nota, n, g) {
    const i = INDICE[nota];
    if (i === undefined) return nota;
    const j = mod12(i + n);
    return (g === "b" ? BEMOLES : g === "#" ? SOSTENIDOS : NOTAS)[j];
  }

  function transportarAcorde(acorde, n, g) {
    if (!n || !esAcorde(acorde)) return acorde;
    return acorde
      .replace(/^([A-G][#b]?)/, (m) => moverNota(m, n, g))
      .replace(/\/([A-G][#b]?)$/, (m, b) => "/" + moverNota(b, n, g));
  }

  function nombre(acorde, notacion) {
    if (notacion !== "solfeo" || !esAcorde(acorde)) return acorde;
    return acorde.replace(/[A-G]/g, (l) => SOLFEO[l]);
  }

  /* Transpone y renombra una línea de acordes sin mover cada acorde de su columna. */
  function linea(texto, n, notacion, g) {
    let salida = "";
    const re = /\S+/g;
    let m;
    while ((m = re.exec(texto))) {
      const nuevo = m[0].replace(/[^-()|.,]+/g, (p) => nombre(transportarAcorde(p, n, g), notacion));
      if (salida.length < m.index) salida += " ".repeat(m.index - salida.length);
      else if (salida.length) salida += " ";
      salida += nuevo;
    }
    return salida;
  }

  function tono(acorde, n, notacion) {
    if (!acorde) return "";
    return nombre(transportarAcorde(acorde, n, grafia(acorde, n)), notacion);
  }

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  /* cancion.lineas: [{t: 'acordes'|'letra'|'etiqueta'|'vacia', x: texto, b: negrita}] */
  function pintar(cancion, opciones) {
    const n = (opciones && opciones.semitonos) || 0;
    const notacion = (opciones && opciones.notacion) || "solfeo";
    const g = grafia(cancion.tono, n);
    const out = [];
    let bloque = [];
    const cerrar = () => {
      if (bloque.length) out.push('<div class="estrofa">' + bloque.join("") + "</div>");
      bloque = [];
    };
    for (const l of cancion.lineas) {
      if (l.t === "vacia") { cerrar(); continue; }
      if (l.t === "acordes") bloque.push('<div class="l ac">' + esc(linea(l.x, n, notacion, g)) + "</div>");
      else if (l.t === "etiqueta") bloque.push('<div class="l et">' + esc(l.x.replace(/^\s*>\s?/, "")) + "</div>");
      else bloque.push('<div class="l le' + (l.b ? " b" : "") + '">' + esc(l.x) + "</div>");
    }
    cerrar();
    return out.join("");
  }

  function quitarTildes(s) {
    return String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }

  global.Acordes = { esAcorde, grafia, transportarAcorde, nombre, linea, tono, pintar, esc, quitarTildes };
})(typeof window !== "undefined" ? window : this);

;
/* Cancionero portátil: hace en el navegador lo que en la app normal hace herramientas/servidor.py.
   - Las canciones van dentro del HTML (window.DATOS_PORTATIL).
   - Las alabanzas y el «tono habitual» se guardan en este navegador (localStorage).
   - El PowerPoint y el cancionero HTML se generan aquí, con la misma plantilla y el mismo formato.
   Sin dependencias y sin internet. */
(function () {
  "use strict";
  const A = window.Acordes;
  const D = window.DATOS_PORTATIL;
  const PREF = "cancionero-portatil.";
  const memoria = {};  // por si el navegador no deja guardar (modo privado, etc.)
  const leerJ = (k, def) => {
    try { const v = localStorage.getItem(PREF + k); if (v !== null) return JSON.parse(v); } catch (e) { /* sin almacenamiento */ }
    return k in memoria ? JSON.parse(memoria[k]) : def;
  };
  const guardarJ = (k, v) => {
    memoria[k] = JSON.stringify(v);
    try { localStorage.setItem(PREF + k, memoria[k]); } catch (e) { /* sin almacenamiento: queda en memoria */ }
  };
  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre",
    "noviembre", "diciembre"];
  const porId = new Map(D.canciones.map((c) => [c.id, c]));
  const entero = (v, def, min, max) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def; };

  /* ---------------------------------------------- canciones (con tono habitual) --- */
  function cancion(id) {
    const c = porId.get(id); if (!c) return null;
    const h = leerJ("habituales", {})[id];
    if (!h) return c;
    const n = h.semitonos || 0, g = A.grafia(c.tono, n);
    return Object.assign({}, c, {
      capo: h.cejilla ? String(h.cejilla) : "",
      tono: n ? A.transportarAcorde(c.tono, n, g) : c.tono,
      lineas: n ? c.lineas.map((l) => (l.t === "acordes" ? Object.assign({}, l, { x: A.linea(l.x, n, "letras", g) }) : l)) : c.lineas,
    });
  }
  function datos() {
    return { canciones: D.canciones.map((c) => cancion(c.id)), tipos: D.tipos, listas: [], plantilla: true, fuentes: {} };
  }
  function guardarHabitual(pet) {
    const id = String(pet.id || "");
    if (!porId.has(id)) throw new Error("Canción no válida");
    const n = entero(pet.semitonos, 0, -11, 11), cej = entero(pet.cejilla, 0, 0, 11);
    const hs = leerJ("habituales", {});
    let total = ((((hs[id] && hs[id].semitonos) || 0) + n) % 12 + 12) % 12;
    if (total > 6) total -= 12;
    hs[id] = { semitonos: total, cejilla: cej };
    guardarJ("habituales", hs);
    let ajustadas = 0;
    if (n) {
      const als = leerJ("alabanzas", []);
      als.forEach((a) => {
        let cambio = false;
        a.canciones.forEach((e) => { if (e.id === id) { e.semitonos = (parseInt(e.semitonos, 10) || 0) - n; cambio = true; } });
        if (cambio) ajustadas++;
      });
      guardarJ("alabanzas", als);
    }
    return { cancion: cancion(id), semitonos: n, alabanzas: ajustadas };
  }

  /* -------------------------------------------------------------- alabanzas --- */
  const slug = (t) => t.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "alabanza";
  const nombreArchivo = (t) => (t.replace(/[<>:"/\\|?*\x00-\x1f]/g, "").replace(/^[ .]+|[ .]+$/g, "").slice(0, 80) || "Alabanza");
  const ahora = () => { const d = new Date(), p = (x) => String(x).padStart(2, "0"); return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + "T" + p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds()); };
  const lista = () => leerJ("alabanzas", []).slice().sort((a, b) => ((b.fecha + b.creada) > (a.fecha + a.creada) ? 1 : -1));

  function crearAlabanza(pet) {
    const nombre = String(pet.nombre || "Alabanza").trim().slice(0, 80) || "Alabanza";
    const fecha = String(pet.fecha || ahora().slice(0, 10)).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error("Fecha no válida");
    const elegidas = (pet.canciones || []).filter((e) => porId.has(e.id));
    if (!elegidas.length) throw new Error("Elige al menos una canción");
    const op = pet.opciones || {};
    let tamano = entero(op.tamano, PPT.TAMANO_DEFECTO, 0, 999);
    if (PPT.TAMANOS.indexOf(tamano) < 0) tamano = PPT.TAMANO_DEFECTO;
    const opciones = { portada: op.portada !== false, titulos: !!op.titulos, repetir: !!op.repetir, tamano };
    const canciones = elegidas.map((e) => {
      const c = cancion(e.id);
      const cej = e.cejilla === undefined || e.cejilla === null || e.cejilla === "" ? entero(c.capo, 0, 0, 11) : entero(e.cejilla, 0, 0, 11);
      return { id: e.id, titulo: c.titulo, semitonos: parseInt(e.semitonos, 10) || 0, cejilla: cej };
    });
    const als = leerJ("alabanzas", []);
    const anterior = pet.id ? als.find((a) => a.id === pet.id) : null;
    let id;
    if (anterior) id = anterior.id;
    else {
      const base = fecha + "-" + slug(nombre); id = base;
      for (let n = 2; als.some((a) => a.id === id); n++) id = base + "-" + n;
    }
    const base = nombreArchivo(nombre + " " + fecha);
    const a = { id, nombre, fecha, creada: anterior ? anterior.creada : ahora(), modificada: ahora(), opciones, canciones,
      diapositivas: 0, archivos: { html: base + ".html", pptx: base + ".pptx" } };
    a.diapositivas = diapositivas(a).length;
    guardarJ("alabanzas", als.filter((x) => x.id !== id).concat([a]));
    return a;
  }
  function eliminarAlabanza(id) {
    guardarJ("alabanzas", leerJ("alabanzas", []).filter((a) => a.id !== id));
    return { ok: true };
  }

  /* ------------------------------------------------- peticiones de la app --- */
  async function api(ruta, opciones) {
    const metodo = ((opciones && opciones.method) || "GET").toUpperCase();
    const cuerpo = opciones && opciones.body ? JSON.parse(opciones.body) : {};
    if (ruta === "/api/datos") return datos();
    if (ruta === "/api/alabanzas" && metodo === "GET") return lista();
    if (ruta === "/api/alabanzas" && metodo === "POST") return crearAlabanza(cuerpo);
    if (ruta.indexOf("/api/alabanzas/") === 0 && metodo === "DELETE") return eliminarAlabanza(decodeURIComponent(ruta.slice(15)));
    if (ruta === "/api/canciones/habitual") return guardarHabitual(cuerpo);
    throw new Error("No está disponible en la versión portátil");
  }

  /* ------------------------------------------------- cancionero HTML (hoja) --- */
  const escHTML = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
  function fechaLarga(iso) {
    const m = /^(\d+)-(\d+)-(\d+)$/.exec(iso || "");
    return m ? (+m[3]) + " de " + MESES[+m[2] - 1] + " de " + (+m[1]) : (iso || "");
  }
  function hojaHTML(a) {
    const canciones = a.canciones.filter((e) => porId.has(e.id)).map((e) => {
      const c = cancion(e.id);
      return { titulo: c.titulo, autor: c.autor, capo: e.cejilla ? String(e.cejilla) : "", tono: c.tono, lineas: c.lineas, semitonos: e.semitonos || 0 };
    });
    const datosJSON = JSON.stringify({ nombre: a.nombre, fecha: a.fecha, canciones }).replace(/<\//g, "<\\/");
    const titulo = a.fecha ? a.nombre + " · " + fechaLarga(a.fecha) : a.nombre;
    return D.hoja.replace("__TITULO__", () => escHTML(titulo)).replace("__NOMBRE__", () => escHTML(a.nombre))
      .replace("__FECHA__", () => escHTML(fechaLarga(a.fecha))).replace("__DATOS__", () => datosJSON);
  }

  /* ----------------------------------------------- PowerPoint (presentacion.py) --- */
  const PPT = (function () {
    const EMU_PT = 12700;
    const CAJA_X = 457200, CAJA_W = 11277600, CAJA_Y = 228600, CAJA_H = 6400800, MARGEN_X = 91440, MARGEN_Y = 45720;
    const TAMANO_DEFECTO = 48, TAMANOS = [36, 40, 44, 48, 54, 60], INTERLINEA = 1.2, COLOR = "FFFFFF", FUENTE = "Calibri", TITULO_PT = 66;
    const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
      'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
    const REL_SLIDE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide";
    const REL_LAYOUT = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout";
    const CT_SLIDE = "application/vnd.openxmlformats-officedocument.presentationml.slide+xml";
    const ANCHOS = { " ": 0.23, ",": 0.25, ".": 0.25, ";": 0.27, ":": 0.27, "'": 0.22, "´": 0.3, "!": 0.29, "¡": 0.29,
      "?": 0.46, "¿": 0.46, "(": 0.3, ")": 0.3, "-": 0.31, "I": 0.25, "J": 0.32, "M": 0.86, "W": 0.89,
      "Ñ": 0.65, "O": 0.66, "Ó": 0.66, "Q": 0.66, "G": 0.63, "D": 0.62, "C": 0.53, "A": 0.58, "Á": 0.58 };
    const ancho = (t, pt) => Array.from(t).reduce((s, c) => s + (c in ANCHOS ? ANCHOS[c] : /\d/.test(c) ? 0.5 : 0.56), 0) * pt;
    function envueltas(texto, pt, anchoPt) {
      let n = 1, actual = "";
      texto.split(/\s+/).filter(Boolean).forEach((p) => {
        const prueba = (actual + " " + p).trim();
        if (ancho(prueba, pt) <= anchoPt || !actual) actual = prueba; else { n++; actual = p; }
      });
      return n;
    }
    const alto = (es, pt, a) => (es.length ? es.reduce((s, e) => s + e.lineas.reduce((t, l) => t + envueltas(l, pt, a), 0), 0) + es.length - 1 : 0);
    const capacidad = (pt) => Math.floor(((CAJA_H - 2 * MARGEN_Y) / EMU_PT) / (pt * INTERLINEA));
    const anchoUtil = () => (CAJA_W - 2 * MARGEN_X) / EMU_PT;
    function trocear(estrofas, pt) {
      const cap = capacidad(pt), a = anchoUtil(), out = [];
      estrofas.forEach((e) => {
        const total = alto([e], pt, a);
        if (total <= cap) { out.push(e); return; }
        const objetivo = Math.ceil(total / Math.ceil(total / cap));
        let trozo = [];
        e.lineas.forEach((l) => {
          if (trozo.length && alto([{ lineas: trozo.concat([l]) }], pt, a) > objetivo) { out.push({ estribillo: e.estribillo, lineas: trozo }); trozo = []; }
          trozo.push(l);
        });
        if (trozo.length) out.push({ estribillo: e.estribillo, lineas: trozo });
      });
      return out;
    }
    function paginar(estrofas, pt) {
      const cap = capacidad(pt), a = anchoUtil(), diapos = [];
      let actual = [];
      trocear(estrofas, pt).forEach((e) => {
        if (actual.length && alto(actual.concat([e]), pt, a) > cap) { diapos.push(actual); actual = []; }
        actual.push(e);
      });
      if (actual.length) diapos.push(actual);
      return diapos;
    }
    const escXML = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const rpr = (pt, b) => '<a:rPr lang="es-ES" sz="' + pt * 100 + '" b="' + (b ? 1 : 0) + '" dirty="0"><a:solidFill><a:srgbClr val="' + COLOR + '"/></a:solidFill><a:latin typeface="' + FUENTE + '"/></a:rPr>';
    const parrafo = (t, pt, b) => (t ? '<a:p><a:pPr algn="ctr"/><a:r>' + rpr(pt, b) + "<a:t>" + escXML(t) + "</a:t></a:r></a:p>"
      : '<a:p><a:pPr algn="ctr"/><a:endParaRPr lang="es-ES" sz="' + pt * 100 + '" dirty="0"/></a:p>');
    const caja = (id, nombre, x, y, w, h, ps) => '<p:sp><p:nvSpPr><p:cNvPr id="' + id + '" name="' + nombre + '"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>' +
      '<p:spPr><a:xfrm><a:off x="' + x + '" y="' + y + '"/><a:ext cx="' + w + '" cy="' + h + '"/></a:xfrm>' +
      '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>' +
      '<p:txBody><a:bodyPr wrap="square" anchor="ctr"><a:normAutofit/></a:bodyPr><a:lstStyle/>' + ps.join("") + "</p:txBody></p:sp>";
    const diapositiva = (cajas) => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<p:sld ' + NS + "><p:cSld><p:spTree>" +
      '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
      '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>' +
      cajas.join("") + "</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>";
    function columna(estrofas, pt) {
      const ps = [];
      estrofas.forEach((e, n) => { if (n) ps.push(parrafo("", pt, false)); e.lineas.forEach((l) => ps.push(parrafo(l, pt, e.estribillo))); });
      return ps;
    }
    function sinRepeticiones(estrofas) {
      const vistas = new Set();
      return estrofas.filter((e) => {
        const k = JSON.stringify(e.lineas.map((l) => l.replace(/[^\p{L}\p{N}_]+/gu, " ").trim().toUpperCase()));
        if (vistas.has(k)) return false;
        vistas.add(k); return true;
      });
    }
    function diapositivasCancion(titulo, estrofas, conTitulo, repetir, tamano) {
      if (!repetir) estrofas = sinRepeticiones(estrofas);
      estrofas = estrofas.map((e) => ({ estribillo: e.estribillo, lineas: e.lineas.map((l) => l.toUpperCase()) }));
      const out = [];
      if (conTitulo) out.push(diapositiva([caja(2, "Titulo", 914400, 1371600, 10362895, 4114800, [parrafo(titulo.toUpperCase(), TITULO_PT, true)])]));
      (estrofas.length ? paginar(estrofas, tamano) : []).forEach((g) => out.push(diapositiva([caja(2, "Letra", CAJA_X, CAJA_Y, CAJA_W, CAJA_H, columna(g, tamano))])));
      return out;
    }
    return { TAMANO_DEFECTO, TAMANOS, REL_SLIDE, REL_LAYOUT, CT_SLIDE, diapositiva, diapositivasCancion };
  })();

  /* Diapositivas (xml) de una alabanza, portada incluida si se pide. */
  function diapositivas(a) {
    const P = D.plantilla, out = [];
    if (a.opciones.portada) out.push({ xml: P.portada, rels: P.portadaRels });
    const basico = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="' + PPT.REL_LAYOUT + '" Target="' + P.layout + '"/></Relationships>';
    a.canciones.filter((e) => porId.has(e.id)).forEach((e) => {
      const c = porId.get(e.id);
      PPT.diapositivasCancion(c.titulo, c.estrofas, a.opciones.titulos, a.opciones.repetir, a.opciones.tamano)
        .forEach((xml) => out.push({ xml, rels: basico }));
    });
    if (!out.length) out.push({ xml: PPT.diapositiva([]), rels: basico });
    return out;
  }

  const utf8 = (s) => new TextEncoder().encode(s);
  function b64(s) { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }

  function pptx(a) {
    const P = D.plantilla, nuevas = diapositivas(a);
    const ids = [], overrides = [], rels = [], partes = [];
    nuevas.forEach((d, k) => {
      const i = k + 1;
      overrides.push('<Override PartName="/ppt/slides/slide' + i + '.xml" ContentType="' + PPT.CT_SLIDE + '"/>');
      rels.push('<Relationship Id="rIdS' + i + '" Type="' + PPT.REL_SLIDE + '" Target="slides/slide' + i + '.xml"/>');
      ids.push('<p:sldId id="' + (255 + i) + '" r:id="rIdS' + i + '"/>');
    });
    const app = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" ' +
      'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Microsoft Office PowerPoint</Application><Slides>' +
      nuevas.length + "</Slides></Properties>";
    partes.push(["[Content_Types].xml", utf8(P.ct.replace("</Types>", () => overrides.join("") + "</Types>"))]);
    P.partes.forEach(([nombre, datos]) => {
      if (nombre === "ppt/presentation.xml") partes.push([nombre, utf8(P.pres.replace("__DIAPOSITIVAS__", () => ids.join("")))]);
      else if (nombre === "ppt/_rels/presentation.xml.rels") partes.push([nombre, utf8(P.presRels.replace("</Relationships>", () => rels.join("") + "</Relationships>"))]);
      else if (nombre === "docProps/app.xml") partes.push([nombre, utf8(app)]);
      else partes.push([nombre, b64(datos)]);
    });
    nuevas.forEach((d, k) => {
      partes.push(["ppt/slides/slide" + (k + 1) + ".xml", utf8(d.xml)]);
      partes.push(["ppt/slides/_rels/slide" + (k + 1) + ".xml.rels", utf8(d.rels)]);
    });
    return zip(partes);
  }

  /* ZIP sin comprimir (método «store»), suficiente para un .pptx. */
  const CRC = (function () {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(u) { let c = 0xFFFFFFFF; for (let i = 0; i < u.length; i++) c = CRC[(c ^ u[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function zip(partes) {
    const d = new Date(), hora = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const dia = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    const trozos = [], central = [];
    let offset = 0;
    partes.forEach(([nombre, datos]) => {
      const n = utf8(nombre), crc = crc32(datos);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint16(10, hora, true); h.setUint16(12, dia, true); h.setUint32(14, crc, true);
      h.setUint32(18, datos.length, true); h.setUint32(22, datos.length, true); h.setUint16(26, n.length, true); h.setUint16(28, 0, true);
      trozos.push(new Uint8Array(h.buffer), n, datos);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
      c.setUint16(10, 0, true); c.setUint16(12, hora, true); c.setUint16(14, dia, true); c.setUint32(16, crc, true);
      c.setUint32(20, datos.length, true); c.setUint32(24, datos.length, true); c.setUint16(28, n.length, true);
      c.setUint16(30, 0, true); c.setUint16(32, 0, true); c.setUint16(34, 0, true); c.setUint16(36, 0, true);
      c.setUint32(38, 0, true); c.setUint32(42, offset, true);
      central.push(new Uint8Array(c.buffer), n);
      offset += 30 + n.length + datos.length;
    });
    const tamCentral = central.reduce((s, u) => s + u.length, 0);
    const f = new DataView(new ArrayBuffer(22));
    f.setUint32(0, 0x06054b50, true); f.setUint16(4, 0, true); f.setUint16(6, 0, true);
    f.setUint16(8, partes.length, true); f.setUint16(10, partes.length, true);
    f.setUint32(12, tamCentral, true); f.setUint32(16, offset, true); f.setUint16(20, 0, true);
    return new Blob(trozos.concat(central, [new Uint8Array(f.buffer)]), { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
  }

  /* ---------------------------------------------------------- descargas --- */
  function descargar(nombre, blob) {
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  document.addEventListener("click", (ev) => {
    const el = ev.target.closest("[data-alabanza-id][data-archivo]");
    if (!el) return;
    ev.preventDefault();
    const a = leerJ("alabanzas", []).find((x) => x.id === el.dataset.alabanzaId);
    if (!a) return;
    if (el.dataset.archivo === "pptx") descargar(a.archivos.pptx, pptx(a));
    else if (el.dataset.archivo === "html") descargar(a.archivos.html, new Blob([hojaHTML(a)], { type: "text/html" }));
    else {
      const url = URL.createObjectURL(new Blob([hojaHTML(a)], { type: "text/html" }));
      if (!window.open(url, "_blank")) descargar(a.archivos.html, new Blob([hojaHTML(a)], { type: "text/html" }));
    }
  });

  window.PORTATIL = { api, pptx, hojaHTML, alabanza: (id) => leerJ("alabanzas", []).find((x) => x.id === id) };
})();

;
/* Cancionero Alabanza: aplicación local. Habla con herramientas/servidor.py. */
(function () {
  "use strict";
  const A = window.Acordes;
  const $ = (id) => document.getElementById(id);
  const esc = A.esc;
  const norm = A.quitarTildes;
  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

  const guardar = (k, v) => { try { localStorage.setItem("cancionero." + k, typeof v === "string" ? v : JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } };
  const leer = (k, def) => { try { const v = localStorage.getItem("cancionero." + k); return v === null ? def : v; } catch (e) { return def; } };
  const leerJSON = (k, def) => { try { return JSON.parse(leer(k, null)) || def; } catch (e) { return def; } };

  const estado = {
    canciones: [], porId: new Map(), tipos: [], alabanzas: [],
    notacion: leer("notacion", "solfeo"),
    tam: parseInt(leer("tam", "17"), 10) || 17,
    borrador: leerJSON("borrador", null) || nuevoBorrador(),
    filtros: {
      can: { q: "", ambito: leer("ambito.can", "todas"), tipo: "" },
      crear: { q: "", ambito: leer("ambito.crear", "mias"), tipo: "" },
    },
    activo: { can: -1, crear: -1 },
    tamManual: false,      // el usuario ha tocado A−/A+: no ajustar al ancho
    actual: null,          // id de la canción abierta en Canciones
    semis: new Map(),      // cambio de tono por canción (solo en esta sesión, respecto al guardado)
    cejilla: new Map(),    // cejilla elegida por canción (solo en esta sesión)
    vista: null,           // canción en el diálogo de Crear
  };
  const cejGuardada = (c) => parseInt(c.capo, 10) || 0;
  const cejActual = (c) => (estado.cejilla.has(c.id) ? estado.cejilla.get(c.id) : cejGuardada(c));
  const opcionesCejilla = (cej, corto) => Array.from({ length: 10 }, (_, i) =>
    '<option value="' + i + '"' + (i === cej ? " selected" : "") + ">" +
    (corto ? (i ? "cej. " + i : "sin cej.") : (i ? "Cejilla " + i : "Sin cejilla")) + "</option>").join("");

  function hoy() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function nuevoBorrador() {
    return { id: null, nombre: "Alabanza", fecha: hoy(), canciones: [],
      opciones: { portada: true, titulos: leer("op.titulos", "0") === "1", repetir: false, tamano: +leer("op.tamano", "48") } };
  }
  function fechaLarga(iso) {
    const [a, m, d] = (iso || "").split("-").map(Number);
    return a ? d + " de " + MESES[m - 1] + " de " + a : "";
  }
  function guardarBorrador() { guardar("borrador", estado.borrador); pintarCuenta(); }
  const enAlabanza = (id) => estado.borrador.canciones.some((e) => e.id === id);

  // En la versión portátil (un solo HTML, sin servidor) las peticiones las atiende window.PORTATIL.
  async function api(ruta, opciones) {
    if (window.PORTATIL) return window.PORTATIL.api(ruta, opciones);
    const r = await fetch(ruta, opciones);
    let datos = null;
    try { datos = await r.json(); } catch (e) { /* respuesta vacía */ }
    if (!r.ok) throw new Error((datos && datos.error) || "Error " + r.status);
    return datos;
  }

  let temporizador = null;
  function aviso(texto) {
    const el = $("aviso");
    el.textContent = texto; el.hidden = false;
    clearTimeout(temporizador);
    temporizador = setTimeout(() => { el.hidden = true; }, 2600);
  }

  /* ---------------------------------------------------------- datos ---- */
  async function cargarDatos() {
    const d = await api("/api/datos");
    estado.canciones = d.canciones;
    estado.tipos = d.tipos;
    estado.nombresFuentes = d.fuentes || {};
    estado.porId = new Map(d.canciones.map((c) => [c.id, c]));
    for (const c of estado.canciones) {
      c._t = norm(c.titulo + " " + c.alias);
      c._letra = c.lineas.filter((l) => l.t === "letra").map((l) => ({ x: l.x.trim(), n: norm(l.x.trim()) }));
      c._todo = c._t + " " + c._letra.map((l) => l.n).join(" ");
    }
    estado.borrador.canciones = estado.borrador.canciones.filter((e) => estado.porId.has(e.id));
  }
  async function cargarAlabanzas() { estado.alabanzas = await api("/api/alabanzas"); pintarHistorial(); }

  const origenNombre = (o) => (o === "biblioteca" ? "" : (estado.nombresFuentes || {})[o] || o);
  const idTipo = (t) => "tipo-" + norm(t).replace(/[^a-z0-9]+/g, "-");

  /* ------------------------------------------------------- búsqueda ---- */
  function enAmbito(c, ambito) { return ambito === "todas" || c.origen === "biblioteca"; }

  /* Devuelve {grupos: [{tipo, canciones}]} sin búsqueda, o {resultados: [{c, frag}]} con búsqueda. */
  function buscar(f) {
    const base = estado.canciones.filter((c) => enAmbito(c, f.ambito) && (!f.tipo || c.tipo === f.tipo));
    const q = norm(f.q.trim());
    if (!q) {
      const grupos = estado.tipos.map((t) => ({ tipo: t, canciones: base.filter((c) => c.tipo === t) })).filter((g) => g.canciones.length);
      return { grupos };
    }
    const palabras = q.split(/\s+/).filter(Boolean);
    const resultados = [];
    for (const c of base) {
      if (!palabras.every((p) => c._todo.includes(p))) continue;
      let puntos = 0, frag = null;
      if (c._t.startsWith(q)) puntos = 4;
      else if (c._t.includes(q)) puntos = 3;
      else if (palabras.every((p) => c._t.includes(p))) puntos = 2;
      if (puntos < 3) {
        const linea = c._letra.find((l) => l.n.includes(q)) || c._letra.find((l) => palabras.some((p) => l.n.includes(p)));
        if (linea) { frag = linea; if (!puntos) puntos = linea.n.includes(q) ? 1.5 : 1; }
      }
      resultados.push({ c, frag, puntos });
    }
    resultados.sort((a, b) => b.puntos - a.puntos || a.c._t.localeCompare(b.c._t));
    return { resultados };
  }

  /* Resalta la búsqueda sin tener en cuenta tildes ni mayúsculas. */
  function resaltar(texto, q) {
    const palabras = norm(q.trim()).split(/\s+/).filter(Boolean);
    const n = norm(texto);
    if (!palabras.length || n.length !== texto.length) return esc(texto);
    const marcas = new Array(texto.length).fill(false);
    for (const p of [norm(q.trim()), ...palabras]) {
      let i = n.indexOf(p);
      while (i >= 0) { for (let k = i; k < i + p.length; k++) marcas[k] = true; i = n.indexOf(p, i + p.length); }
    }
    let out = "", abierto = false;
    for (let i = 0; i < texto.length; i++) {
      if (marcas[i] && !abierto) { out += "<mark>"; abierto = true; }
      if (!marcas[i] && abierto) { out += "</mark>"; abierto = false; }
      out += esc(texto[i]);
    }
    return out + (abierto ? "</mark>" : "");
  }

  function marcasCancion(c) {
    const o = origenNombre(c.origen);
    return (o ? '<span class="insignia">' + esc(o) + "</span>" : "") +
      (c.estado !== "acordes" ? '<span class="insignia aviso-insignia">sin acordes</span>' : "");
  }

  function itemHTML(c, frag, q, modo) {
    const titulo = q ? resaltar(c.titulo, q) : esc(c.titulo);
    const extra = frag ? '<span class="frag">' + resaltar(frag.x, q) + "</span>" : "";
    if (modo === "can") {
      const actual = estado.actual === c.id ? ' aria-current="true"' : "";
      return '<a class="item" href="#cancion=' + encodeURIComponent(c.id) + '" data-id="' + esc(c.id) + '"' + actual + ">" +
        '<span class="t">' + titulo + marcasCancion(c) + (enAlabanza(c.id) ? '<span class="en-alabanza" title="Está en la alabanza que estás preparando">●</span>' : "") + "</span>" + extra + "</a>";
    }
    const ya = enAlabanza(c.id);
    return '<div class="item" data-id="' + esc(c.id) + '"><button type="button" class="abrir" data-ver="' + esc(c.id) + '"><span class="t">' + titulo + marcasCancion(c) + "</span>" + extra + "</button>" +
      '<button type="button" class="secundario anadir" data-anadir="' + esc(c.id) + '"' + (ya ? " disabled" : "") + ">" + (ya ? "Añadida" : "Añadir") + "</button></div>";
  }

  function pintarLista(modo) {
    const f = estado.filtros[modo];
    const r = buscar(f);
    const lista = $(modo + "-lista");
    let html = "", n = 0;
    if (r.grupos) {
      for (const g of r.grupos) {
        n += g.canciones.length;
        html += '<section class="grupo-tipo" aria-label="' + esc(g.tipo) + '"><h3 class="cab-tipo"><span>' + esc(g.tipo) + '</span><span class="num">' + g.canciones.length + "</span></h3>" +
          g.canciones.map((c) => itemHTML(c, null, "", modo)).join("") + "</section>";
      }
    } else {
      n = r.resultados.length;
      html = r.resultados.map((x) => itemHTML(x.c, x.frag, f.q, modo)).join("");
    }
    if (!n) {
      html = '<p class="vacio">' + (f.q ? "Ninguna canción contiene «" + esc(f.q.trim()) + "»" + (f.tipo ? " en " + esc(f.tipo) : "") +
        (f.ambito === "mias" ? '. <button type="button" class="enlace" data-ver-todas="' + modo + '">Buscar en todas</button>' : ".") : "No hay canciones aquí todavía.") + "</p>";
    }
    lista.innerHTML = html;
    $(modo + "-contador").textContent = n === 1 ? "1 canción" : n + " canciones";
    estado.activo[modo] = -1;
    pintarChips(modo);
    document.querySelectorAll('.ambito[data-para="' + modo + '"] button').forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.ambito === f.ambito)));
  }

  function pintarChips(modo) {
    const f = estado.filtros[modo];
    const base = estado.canciones.filter((c) => enAmbito(c, f.ambito));
    const chips = [["", "Todas", base.length]].concat(estado.tipos.map((t) => [t, t, base.filter((c) => c.tipo === t).length]).filter((x) => x[2]));
    $(modo + "-chips").innerHTML = chips.map(([v, t, k]) =>
      '<button type="button" class="chip" data-tipo="' + esc(v) + '" aria-pressed="' + (f.tipo === v) + '">' + esc(t) + ' <span class="num">' + k + "</span></button>").join("");
  }

  function moverActivo(modo, d) {
    const items = [...$(modo + "-lista").querySelectorAll(".item")];
    if (!items.length) return;
    let i = estado.activo[modo] + d;
    i = Math.max(0, Math.min(items.length - 1, i));
    estado.activo[modo] = i;
    items.forEach((el, k) => el.classList.toggle("activo", k === i));
    items[i].scrollIntoView({ block: "nearest" });
  }
  function abrirActivo(modo) {
    const items = [...$(modo + "-lista").querySelectorAll(".item")];
    const el = items[estado.activo[modo] >= 0 ? estado.activo[modo] : 0];
    if (!el) return;
    if (modo === "can") location.hash = "#cancion=" + encodeURIComponent(el.dataset.id);
    else anadir(el.dataset.id);
  }

  function eventosBuscador(modo) {
    const input = $(modo + "-q"), f = estado.filtros[modo];
    input.addEventListener("input", () => { f.q = input.value; pintarLista(modo); });
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "ArrowDown") { ev.preventDefault(); moverActivo(modo, 1); }
      else if (ev.key === "ArrowUp") { ev.preventDefault(); moverActivo(modo, -1); }
      else if (ev.key === "Enter") { ev.preventDefault(); abrirActivo(modo); }
      else if (ev.key === "Escape" && input.value) { input.value = ""; f.q = ""; pintarLista(modo); }
    });
    $(modo + "-chips").addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-tipo]"); if (!b) return;
      f.tipo = b.dataset.tipo; pintarLista(modo); $(modo + "-lista").scrollTop = 0;
    });
    document.querySelector('.ambito[data-para="' + modo + '"]').addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-ambito]"); if (!b) return;
      f.ambito = b.dataset.ambito; guardar("ambito." + modo, f.ambito);
      if (f.tipo && !estado.canciones.some((c) => enAmbito(c, f.ambito) && c.tipo === f.tipo)) f.tipo = "";
      pintarLista(modo); if (modo === "can" && !estado.actual) pintarVisor();
    });
    $(modo + "-lista").addEventListener("click", (ev) => {
      const t = ev.target.closest("[data-ver-todas]");
      if (t) { f.ambito = "todas"; guardar("ambito." + modo, "todas"); pintarLista(modo); }
    });
  }

  /* ------------------------------------------------- visor (Canciones) --- */
  function ordenActual() {
    const f = estado.filtros.can, r = buscar(f);
    return r.grupos ? r.grupos.flatMap((g) => g.canciones) : r.resultados.map((x) => x.c);
  }

  function controlTono(c, semis, idGrupo) {
    if (!c.tono) return "";
    return '<span class="grupo tono" id="' + idGrupo + '" role="group" aria-label="Tono"><button type="button" data-d="-1" aria-label="Bajar medio tono">−</button>' +
      '<button type="button" class="tono-actual" data-d="0" title="Volver al tono guardado">Tono ' + esc(A.tono(c.tono, semis, estado.notacion)) +
      (semis ? " (" + (semis > 0 ? "+" : "") + semis + ")" : "") + '</button><button type="button" data-d="1" aria-label="Subir medio tono">+</button></span>';
  }

  /* Cejilla del visor, en qué tono suena y botón para guardar tono y cejilla en la canción. */
  function controlCejilla(c, semis, cej) {
    if (!c.tono) return "";
    const cambiado = semis !== 0 || cej !== cejGuardada(c);
    return '<select id="visor-cejilla" class="cejilla" aria-label="Cejilla">' + opcionesCejilla(cej) + "</select>" +
      (cej ? '<span class="suena">Suena en ' + esc(A.tono(c.tono, semis + cej, estado.notacion)) + "</span>" : "") +
      (c.origen === "biblioteca" && cambiado
        ? '<button type="button" class="secundario guardar-habitual" id="guardar-habitual" title="Los acordes y la cejilla quedan así en la canción y en las alabanzas nuevas">Guardar como habitual</button>'
        : "");
  }

  function metaCancion(c, sinCejilla) {
    const p = ['<a class="insignia tipo-insignia" href="#canciones" data-ir-tipo="' + esc(c.tipo) + '">' + esc(c.tipo) + "</a>"];
    if (c.capo && !sinCejilla) p.push("<span>Cejilla " + esc(c.capo) + "</span>");
    if (c.autor) p.push("<span>" + esc(c.autor) + "</span>");
    if (c.fuente) p.push("<span>" + esc(c.fuente.replace(/^(Cancionero fonsthefons|Cancionero Hakuna \(fonsthefons\)): .*/, "$1")) + "</span>");
    if (c.alias) p.push("<span>También: " + esc(c.alias) + "</span>");
    return p.join("");
  }

  function pintarVisor() {
    const v = $("visor");
    $("panel-canciones").classList.toggle("con-cancion", !!estado.actual);
    if (!estado.actual) { v.innerHTML = indiceGeneral(); return; }
    const c = estado.porId.get(estado.actual);
    if (!c) { v.innerHTML = '<p class="vacio">Esta canción ya no está en la biblioteca. <a href="#canciones">Volver al índice</a></p>'; return; }
    const semis = estado.semis.get(c.id) || 0, cej = cejActual(c);
    const orden = ordenActual(), i = orden.findIndex((x) => x.id === c.id);
    const ant = i > 0 ? orden[i - 1] : null, sig = i >= 0 && i < orden.length - 1 ? orden[i + 1] : null;
    const ya = enAlabanza(c.id);
    v.innerHTML =
      '<a class="volver" href="#canciones">Índice</a>' +
      "<h2>" + esc(c.titulo) + "</h2>" +
      '<div class="meta">' + metaCancion(c, !!c.tono) + "</div>" +
      '<div class="controles">' + controlTono(c, semis, "visor-tono") + controlCejilla(c, semis, cej) +
      '<span class="grupo" role="group" aria-label="Tamaño de letra"><button type="button" data-tam="-1" aria-label="Letra más pequeña">A−</button><button type="button" data-tam="1" aria-label="Letra más grande">A+</button></span>' +
      '<button type="button" class="' + (ya ? "secundario" : "principal") + '" data-alabanza="' + esc(c.id) + '">' + (ya ? "Quitar de la alabanza" : "Añadir a la alabanza") + "</button></div>" +
      '<div class="cancion-cuerpo">' + A.pintar(c, { semitonos: semis, notacion: estado.notacion }) + "</div>" +
      '<nav class="pasar" aria-label="Otras canciones">' +
      (ant ? '<a href="#cancion=' + encodeURIComponent(ant.id) + '" class="ant"><small>Anterior</small>' + esc(ant.titulo) + "</a>" : "<span></span>") +
      (sig ? '<a href="#cancion=' + encodeURIComponent(sig.id) + '" class="sig"><small>Siguiente</small>' + esc(sig.titulo) + "</a>" : "<span></span>") + "</nav>";
    ajustarAncho(v.querySelector(".cancion-cuerpo"), c, estado.tam);
  }

  /* Reduce la letra si la línea más larga no cabe en el ancho (nunca la agranda). */
  function ajustarAncho(cuerpo, c, tam) {
    if (!cuerpo) return;
    const cols = Math.max(20, ...c.lineas.map((l) => l.x.length + (l.t === "acordes" ? 4 : 0)));
    const cabe = Math.floor(cuerpo.clientWidth / (cols * 0.61));
    const t = estado.tamManual && cuerpo.closest("#visor") ? tam : Math.max(11, Math.min(tam, cabe));
    cuerpo.style.setProperty("--t-cancion", t + "px");
  }

  function indiceGeneral() {
    const f = estado.filtros.can;
    const base = estado.canciones.filter((c) => enAmbito(c, f.ambito));
    const grupos = estado.tipos.map((t) => ({ tipo: t, canciones: base.filter((c) => c.tipo === t) })).filter((g) => g.canciones.length);
    const saltos = grupos.map((g) => '<a href="#canciones" data-saltar="' + idTipo(g.tipo) + '">' + esc(g.tipo) + "</a>").join("");
    return '<div class="indice-general"><div class="ig-cab"><h2>Índice</h2><p>' + base.length + " canciones" +
      (window.PORTATIL ? "" : f.ambito === "mias" ? " en tu biblioteca" : ", tu biblioteca y los cancioneros " + Object.values(estado.nombresFuentes || {}).join(", ").replace(/, ([^,]*)$/, " y $1")) + '.</p><nav class="saltos" aria-label="Ir a un tipo">' + saltos + "</nav></div>" +
      grupos.map((g) => '<section class="ig-grupo" id="' + idTipo(g.tipo) + '"><h3>' + esc(g.tipo) + ' <span class="num">' + g.canciones.length + "</span></h3><ol>" +
        g.canciones.map((c) => '<li><a href="#cancion=' + encodeURIComponent(c.id) + '">' + esc(c.titulo) + "</a>" + marcasCancion(c) + "</li>").join("") + "</ol></section>").join("") +
      (window.PORTATIL ? "" : '<section class="actualizar"><h3>Añadir canciones</h3><p>Deja la canción en un .txt dentro de la carpeta <code>entrada</code> (o pídeselo a Claude) y pulsa el botón. También completa tus listas con los cancioneros de la carpeta <code>fuentes</code>.</p>' +
      '<label><input type="checkbox" id="internet"> Buscar también en internet las que falten en las listas</label>' +
      '<button type="button" class="secundario" id="actualizar">Actualizar biblioteca</button><pre class="log" id="log" hidden></pre></section>') + "</div>";
  }

  async function actualizarBiblioteca(boton) {
    boton.disabled = true; boton.textContent = "Actualizando…";
    const internet = $("internet") ? $("internet").checked : false;
    try {
      const r = await api("/api/actualizar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ internet }) });
      await cargarDatos(); pintarLista("can"); pintarLista("crear"); pintarOrden(); pintarVisor();
      $("log").hidden = false;
      $("log").textContent = r.log.length ? r.log.join("\n") : "No había nada nuevo. El detalle está en ESTADO.md.";
    } catch (e) {
      const log = $("log"); if (log) { log.hidden = false; log.textContent = "No se ha podido actualizar: " + e.message; }
    } finally {
      const b = $("actualizar"); if (b) { b.disabled = false; b.textContent = "Actualizar biblioteca"; }
    }
  }

  function eventosVisor() {
    $("visor").addEventListener("click", (ev) => {
      const t = ev.target;
      const tono = t.closest("#visor-tono button");
      if (tono) {
        const d = +tono.dataset.d, id = estado.actual;
        estado.semis.set(id, d ? (estado.semis.get(id) || 0) + d : 0); pintarVisor(); return;
      }
      const tam = t.closest("[data-tam]");
      if (tam) {
        const cuerpo = $("visor").querySelector(".cancion-cuerpo");
        const efectivo = parseFloat(cuerpo && cuerpo.style.getPropertyValue("--t-cancion")) || estado.tam;
        estado.tam = Math.max(11, Math.min(30, efectivo + +tam.dataset.tam));
        estado.tamManual = true; guardar("tam", String(estado.tam)); pintarVisor(); return;
      }
      const al = t.closest("[data-alabanza]");
      if (al) {
        const id = al.dataset.alabanza;
        if (enAlabanza(id)) { quitar(id); aviso("Quitada de la alabanza"); } else anadir(id);
        pintarVisor(); pintarLista("can"); return;
      }
      const salto = t.closest("[data-saltar]");
      if (salto) {
        ev.preventDefault();
        const s = $(salto.dataset.saltar);
        const suave = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (s) s.scrollIntoView({ behavior: suave ? "smooth" : "auto", block: "start" });
        return;
      }
      const irTipo = t.closest("[data-ir-tipo]");
      if (irTipo) { estado.filtros.can.tipo = irTipo.dataset.irTipo; estado.filtros.can.q = ""; $("can-q").value = ""; pintarLista("can"); return; }
      if (t.id === "guardar-habitual") { guardarHabitual(t); return; }
      if (t.id === "actualizar") actualizarBiblioteca(t);
    });
    $("visor").addEventListener("change", (ev) => {
      if (ev.target.id !== "visor-cejilla" || !estado.actual) return;
      estado.cejilla.set(estado.actual, +ev.target.value); pintarVisor();
    });
  }

  /* Reescribe la canción con los acordes que se ven y guarda la cejilla. */
  async function guardarHabitual(boton) {
    const c = estado.porId.get(estado.actual); if (!c) return;
    const semis = estado.semis.get(c.id) || 0, cej = cejActual(c);
    boton.disabled = true; boton.textContent = "Guardando…";
    try {
      const r = await api("/api/canciones/habitual", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: c.id, semitonos: semis, cejilla: cej }) });
      estado.semis.delete(c.id); estado.cejilla.delete(c.id);
      // lo que ya estaba en la alabanza en preparación sigue sonando igual
      if (r.semitonos) estado.borrador.canciones.forEach((e) => { if (e.id === c.id) e.semitonos -= r.semitonos; });
      guardarBorrador();
      await cargarDatos();
      if (r.alabanzas) await cargarAlabanzas();
      pintarLista("can"); pintarLista("crear"); pintarOrden(); pintarVisor();
      aviso("Guardada en " + A.tono(r.cancion.tono, 0, estado.notacion) + (cej ? ", cejilla " + cej : ", sin cejilla"));
    } catch (e) {
      aviso("No se ha podido guardar: " + e.message);
      boton.disabled = false; boton.textContent = "Guardar como habitual";
    }
  }

  /* ---------------------------------------------------- crear alabanza --- */
  function anadir(id) {
    if (enAlabanza(id)) return;
    const c = estado.porId.get(id);
    const e = { id, semitonos: estado.semis.get(id) || 0 };
    // sin cejilla expresa, la alabanza usará la guardada en la canción
    if (estado.cejilla.has(id)) e.cejilla = estado.cejilla.get(id);
    estado.borrador.canciones.push(e);
    guardarBorrador(); pintarOrden(); pintarLista("crear");
    aviso("Añadida a la alabanza: " + (c ? c.titulo : ""));
  }
  function quitar(id) {
    estado.borrador.canciones = estado.borrador.canciones.filter((e) => e.id !== id);
    guardarBorrador(); pintarOrden(); pintarLista("crear");
  }
  function pintarCuenta() {
    const n = estado.borrador.canciones.length, el = $("cuenta-crear");
    el.hidden = !n; el.textContent = n;
  }

  function pintarOrden() {
    const b = estado.borrador;
    $("nombre").value = b.nombre; $("fecha").value = b.fecha;
    $("op-portada").checked = b.opciones.portada; $("op-titulos").checked = b.opciones.titulos; $("op-repetir").checked = b.opciones.repetir;
    $("op-tamano").value = String(b.opciones.tamano || 48);
    $("orden-vacio").hidden = b.canciones.length > 0;
    $("editando").hidden = !b.id;
    if (b.id) $("editando-texto").textContent = "Editando la alabanza «" + b.nombre + "». Al guardar se sustituyen sus archivos.";
    $("crear").textContent = b.id ? "Guardar cambios" : "Crear alabanza";
    $("orden").innerHTML = b.canciones.map((e, i) => {
      const c = estado.porId.get(e.id);
      const tono = c.tono ? '<span class="tono"><button type="button" class="icono" data-semi="-1" data-i="' + i + '" aria-label="Bajar medio tono">−</button><span>' +
        esc(A.tono(c.tono, e.semitonos, estado.notacion)) + (e.semitonos ? " (" + (e.semitonos > 0 ? "+" : "") + e.semitonos + ")" : "") +
        '</span><button type="button" class="icono" data-semi="1" data-i="' + i + '" aria-label="Subir medio tono">+</button>' +
        '<select class="cej" data-cej="' + i + '" aria-label="Cejilla">' + opcionesCejilla(e.cejilla != null ? e.cejilla : cejGuardada(c), true) + "</select></span>" : "";
      const sub = c.origen !== "biblioteca" ? "Del cancionero " + origenNombre(c.origen) + ": se copiará a tu biblioteca" : c.estado !== "acordes" ? "Sin acordes" : "";
      return '<li draggable="true" data-i="' + i + '"><span class="titulo">' + esc(c.titulo) + (sub ? "<small>" + esc(sub) + "</small>" : "") + "</span>" + tono +
        '<button type="button" class="icono" data-mover="-1" data-i="' + i + '" aria-label="Subir en el orden"' + (i === 0 ? " disabled" : "") + ">↑</button>" +
        '<button type="button" class="icono" data-mover="1" data-i="' + i + '" aria-label="Bajar en el orden"' + (i === b.canciones.length - 1 ? " disabled" : "") + ">↓</button>" +
        '<button type="button" class="icono" data-quitar="' + i + '" aria-label="Quitar de la alabanza">✕</button></li>';
    }).join("");
    pintarCuenta();
  }

  function mover(i, d) {
    const arr = estado.borrador.canciones, j = i + d;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    guardarBorrador(); pintarOrden();
  }

  function eventosOrden() {
    const ol = $("orden");
    ol.addEventListener("click", (ev) => {
      const b = ev.target.closest("button");
      if (!b) return;
      const i = +b.dataset.i;
      if (b.dataset.mover) mover(i, +b.dataset.mover);
      else if (b.dataset.quitar !== undefined) {
        estado.borrador.canciones.splice(+b.dataset.quitar, 1);
        guardarBorrador(); pintarOrden(); pintarLista("crear");
      } else if (b.dataset.semi) {
        estado.borrador.canciones[i].semitonos += +b.dataset.semi;
        guardarBorrador(); pintarOrden();
      }
    });
    ol.addEventListener("change", (ev) => {
      const s = ev.target.closest("select[data-cej]"); if (!s) return;
      estado.borrador.canciones[+s.dataset.cej].cejilla = +s.value;
      guardarBorrador(); pintarOrden();
    });
    let origen = null;
    ol.addEventListener("dragstart", (ev) => {
      const li = ev.target.closest("li"); if (!li) return;
      origen = +li.dataset.i; li.classList.add("arrastrando");
      ev.dataTransfer.effectAllowed = "move";
      try { ev.dataTransfer.setData("text/plain", String(origen)); } catch (e) { /* algunos navegadores */ }
    });
    ol.addEventListener("dragend", () => { origen = null; ol.querySelectorAll("li").forEach((li) => li.classList.remove("arrastrando", "encima")); });
    ol.addEventListener("dragover", (ev) => {
      const li = ev.target.closest("li"); if (!li || origen === null) return;
      ev.preventDefault();
      ol.querySelectorAll("li").forEach((x) => x.classList.toggle("encima", x === li));
    });
    ol.addEventListener("drop", (ev) => {
      const li = ev.target.closest("li"); if (!li || origen === null) return;
      ev.preventDefault();
      const destino = +li.dataset.i, arr = estado.borrador.canciones;
      const [x] = arr.splice(origen, 1);
      arr.splice(destino, 0, x);
      origen = null; guardarBorrador(); pintarOrden();
    });
  }

  async function crear() {
    const b = estado.borrador;
    b.nombre = $("nombre").value.trim() || "Alabanza";
    b.fecha = $("fecha").value || hoy();
    if (!b.canciones.length) { aviso("Añade al menos una canción."); return; }
    const boton = $("crear");
    boton.disabled = true; boton.textContent = "Creando…";
    const res = $("resultado");
    try {
      const a = await api("/api/alabanzas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
      const copiadas = b.canciones.some((e) => !e.id.startsWith("canciones/"));
      b.id = a.id;
      b.canciones = a.canciones.map((c) => ({ id: c.id, semitonos: c.semitonos, cejilla: c.cejilla }));
      guardarBorrador();
      if (copiadas) { await cargarDatos(); pintarLista("can"); }
      await cargarAlabanzas();
      res.hidden = false;
      res.innerHTML = "<div>«" + esc(a.nombre) + "» guardada, con " + a.canciones.length + " canciones y " + a.diapositivas + " diapositivas.</div>" + botonesArchivos(a);
      pintarOrden(); pintarLista("crear");
    } catch (e) {
      res.hidden = false;
      res.innerHTML = '<span class="error">No se ha podido crear: ' + esc(e.message) + "</span>";
    } finally {
      boton.disabled = false; boton.textContent = b.id ? "Guardar cambios" : "Crear alabanza";
    }
  }

  function botonesArchivos(a) {
    if (window.PORTATIL) {
      const d = ' href="#" data-alabanza-id="' + esc(a.id) + '" data-archivo=';
      return '<div class="botones">' +
        '<a class="fuerte"' + d + '"pptx">Descargar PowerPoint</a>' +
        "<a" + d + '"abrir">Abrir cancionero</a>' +
        "<a" + d + '"html">Descargar cancionero (HTML)</a></div>';
    }
    const base = "/alabanzas/" + encodeURIComponent(a.id) + "/";
    return '<div class="botones">' +
      '<a class="fuerte" href="' + base + encodeURIComponent(a.archivos.pptx) + '?descargar=1" download>Descargar PowerPoint</a>' +
      '<a href="' + base + encodeURIComponent(a.archivos.html) + '" target="_blank" rel="noopener">Abrir cancionero</a>' +
      '<a href="' + base + encodeURIComponent(a.archivos.html) + '?descargar=1" download>Descargar cancionero (HTML)</a></div>';
  }

  /* diálogo de vista previa (en Crear) */
  function abrirVista(id) {
    const c = estado.porId.get(id); if (!c) return;
    estado.vista = { c, semis: 0 };
    pintarVista();
    const d = $("vista");
    if (typeof d.showModal === "function") d.showModal(); else d.setAttribute("open", "");
  }
  function pintarVista() {
    const { c, semis } = estado.vista;
    $("vista-titulo").textContent = c.titulo;
    $("vista-meta").innerHTML = metaCancion(c) + controlTono(c, semis, "vista-tono");
    $("vista-cuerpo").innerHTML = A.pintar(c, { semitonos: semis, notacion: estado.notacion });
    requestAnimationFrame(() => ajustarAncho($("vista-cuerpo"), c, 16));
    const ya = enAlabanza(c.id);
    $("vista-anadir").disabled = ya;
    $("vista-anadir").textContent = ya ? "Ya está en la alabanza" : "Añadir a la alabanza";
  }

  /* -------------------------------------------------------- anteriores --- */
  function pintarHistorial() {
    const q = norm($("ant-buscar").value.trim());
    const lista = estado.alabanzas.filter((a) => !q || norm(a.nombre + " " + a.canciones.map((c) => c.titulo).join(" ")).includes(q));
    if (!estado.alabanzas.length) {
      $("historial").innerHTML = '<li class="sin-borde"><p class="vacio">Aún no hay alabanzas guardadas. Crea la primera en <a href="#crear">Crear alabanza</a>.</p></li>';
      return;
    }
    if (!lista.length) { $("historial").innerHTML = '<li class="sin-borde"><p class="vacio">Ninguna alabanza coincide con la búsqueda.</p></li>'; return; }
    $("historial").innerHTML = lista.map((a) => {
      const [y, m, d] = a.fecha.split("-").map(Number);
      return '<li><div class="dia" aria-hidden="true"><b>' + d + "</b><span>" + MESES_CORTOS[m - 1] + " " + y + "</span></div><div>" +
        "<h3>" + esc(a.nombre) + '</h3><p class="canciones-lista">' + esc(fechaLarga(a.fecha)) + ", " + a.canciones.length + " canciones: " +
        esc(a.canciones.map((c) => c.titulo).join(", ")) + "</p>" + botonesArchivos(a).replace("</div>",
          '<button type="button" class="secundario" data-editar="' + esc(a.id) + '">Editar</button>' +
          '<button type="button" class="secundario" data-base="' + esc(a.id) + '">Usar como base</button>' +
          '<button type="button" class="secundario borrar" data-borrar="' + esc(a.id) + '">Eliminar</button></div>') +
        "</div></li>";
    }).join("");
  }

  function cargarEnBorrador(a, comoNueva) {
    const faltan = a.canciones.filter((c) => !estado.porId.has(c.id));
    estado.borrador = {
      id: comoNueva ? null : a.id,
      nombre: a.nombre, fecha: comoNueva ? hoy() : a.fecha,
      canciones: a.canciones.filter((c) => estado.porId.has(c.id)).map((c) => ({ id: c.id, semitonos: c.semitonos || 0, cejilla: c.cejilla })),
      opciones: Object.assign({ portada: true, titulos: false, repetir: false, tamano: 48 }, a.opciones || {}),
    };
    guardarBorrador(); pintarOrden(); pintarLista("crear");
    $("resultado").hidden = true;
    location.hash = "#crear";
    if (faltan.length) aviso("No están en la biblioteca: " + faltan.map((c) => c.titulo).join(", "));
  }

  async function eventosHistorial(ev) {
    const b = ev.target.closest("button"); if (!b) return;
    const a = estado.alabanzas.find((x) => x.id === (b.dataset.editar || b.dataset.base || b.dataset.borrar));
    if (!a) return;
    if (b.dataset.editar) cargarEnBorrador(a, false);
    else if (b.dataset.base) cargarEnBorrador(a, true);
    else if (b.dataset.borrar) {
      if (!confirm("¿Eliminar «" + a.nombre + "» del " + fechaLarga(a.fecha) + (window.PORTATIL ? "? Se borra de este navegador." : "? Se mueve a la carpeta alabanzas/_eliminadas."))) return;
      try {
        await api("/api/alabanzas/" + encodeURIComponent(a.id), { method: "DELETE" });
        if (estado.borrador.id === a.id) { estado.borrador.id = null; guardarBorrador(); pintarOrden(); }
        await cargarAlabanzas(); aviso("Alabanza eliminada");
      } catch (e) { aviso("No se ha podido eliminar: " + e.message); }
    }
  }

  /* ------------------------------------------------------------ rutas --- */
  function aplicarRuta() {
    const h = decodeURIComponent(location.hash.slice(1));
    let panel = "canciones";
    if (h === "crear") panel = "crear";
    else if (h === "anteriores") panel = "anteriores";
    const nuevo = h.startsWith("cancion=") ? h.slice(8) : null;
    ["canciones", "crear", "anteriores"].forEach((n) => {
      $("panel-" + n).hidden = n !== panel;
      if (n === panel) $("tab-" + n).setAttribute("aria-current", "page"); else $("tab-" + n).removeAttribute("aria-current");
    });
    if (panel === "canciones") {
      const cambia = nuevo !== estado.actual;
      estado.actual = nuevo;
      pintarVisor(); pintarLista("can");
      if (cambia) {
        if (nuevo) {
          window.scrollTo(0, 0);
          const el = $("can-lista").querySelector('[aria-current="true"]');
          if (el) el.scrollIntoView({ block: "nearest" });
        }
        document.title = nuevo && estado.porId.get(nuevo) ? estado.porId.get(nuevo).titulo + " · Alabanza El Carmen" : "Alabanza El Carmen";
      }
    } else document.title = (panel === "crear" ? "Crear alabanza" : "Alabanzas anteriores") + " · Alabanza El Carmen";
  }

  function pintarNotacion() {
    document.querySelectorAll("[data-notacion]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.notacion === estado.notacion)));
  }

  /* ------------------------------------------------------------ inicio --- */
  async function iniciar() {
    pintarNotacion();
    document.querySelectorAll("[data-notacion]").forEach((b) => b.addEventListener("click", () => {
      estado.notacion = b.dataset.notacion; guardar("notacion", estado.notacion); pintarNotacion();
      pintarOrden(); pintarVisor(); if (estado.vista && $("vista").open) pintarVista();
    }));
    document.addEventListener("keydown", (ev) => {
      const escribiendo = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
      if (ev.key === "/" && !escribiendo && !$("panel-canciones").hidden) { ev.preventDefault(); $("can-q").focus(); $("can-q").select(); }
    });

    eventosBuscador("can");
    eventosBuscador("crear");
    eventosVisor();

    // crear
    $("crear-lista").addEventListener("click", (ev) => {
      const b = ev.target.closest("button"); if (!b) return;
      if (b.dataset.anadir) anadir(b.dataset.anadir); else if (b.dataset.ver) abrirVista(b.dataset.ver);
    });
    $("nombre").addEventListener("input", () => { estado.borrador.nombre = $("nombre").value; guardarBorrador(); });
    $("fecha").addEventListener("change", () => { estado.borrador.fecha = $("fecha").value; guardarBorrador(); });
    [["op-portada", "portada"], ["op-titulos", "titulos"], ["op-repetir", "repetir"]].forEach(([id, k]) => $(id).addEventListener("change", () => {
      estado.borrador.opciones[k] = $(id).checked; guardarBorrador();
      if (k === "titulos") guardar("op.titulos", $(id).checked ? "1" : "0");
    }));
    $("op-tamano").addEventListener("change", () => {
      estado.borrador.opciones.tamano = +$("op-tamano").value; guardarBorrador(); guardar("op.tamano", $("op-tamano").value);
    });
    $("crear").addEventListener("click", crear);
    $("vaciar").addEventListener("click", () => {
      if (estado.borrador.canciones.length && !confirm("¿Empezar una alabanza nueva? Se quitan las canciones elegidas.")) return;
      estado.borrador = nuevoBorrador(); guardarBorrador(); pintarOrden(); pintarLista("crear"); $("resultado").hidden = true;
    });
    $("como-nueva").addEventListener("click", () => { estado.borrador.id = null; guardarBorrador(); pintarOrden(); aviso("Se guardará como una alabanza nueva."); });
    eventosOrden();

    // diálogo
    $("vista-cerrar").addEventListener("click", () => $("vista").close());
    $("vista").addEventListener("click", (ev) => {
      if (ev.target === $("vista")) { $("vista").close(); return; }
      const b = ev.target.closest("#vista-tono button");
      if (b) { const d = +b.dataset.d; estado.vista.semis = d ? estado.vista.semis + d : 0; pintarVista(); }
      if (ev.target.closest("[data-ir-tipo]")) $("vista").close();
    });
    $("vista-anadir").addEventListener("click", () => { estado.semis.set(estado.vista.c.id, estado.vista.semis); anadir(estado.vista.c.id); pintarVista(); });

    // anteriores
    $("historial").addEventListener("click", eventosHistorial);
    $("ant-buscar").addEventListener("input", pintarHistorial);

    try {
      await cargarDatos();
      await cargarAlabanzas();
    } catch (e) {
      document.querySelector("main").innerHTML = '<p class="vacio">' + (window.PORTATIL ? "No se ha podido cargar el cancionero. (" : "No se puede conectar con el cancionero. Abre «Abrir cancionero.bat» y deja su ventana abierta. (") + esc(e.message) + ")</p>";
      return;
    }
    pintarOrden(); pintarLista("crear");
    window.addEventListener("hashchange", aplicarRuta);
    let tRes = null;
    window.addEventListener("resize", () => { clearTimeout(tRes); tRes = setTimeout(() => { if (estado.actual) pintarVisor(); }, 150); });
    aplicarRuta();
  }

  iniciar();
})();

;
/* Versión web del cancionero: lo que solo hace falta al abrirlo desde un enlace, en el navegador.
   - Sin conexión después de la primera visita (service worker «sw.js»). No se instala como app.
   - En el móvil: «Abrir cancionero» se ve dentro de la app; botones para compartir el PowerPoint y el
     cancionero; aviso cuando se abre desde el navegador interno de WhatsApp (u otra app), que no deja
     descargar archivos.
   La app es la misma que la portátil (app.js + portatil.js); esto solo añade. */
(function () {
  "use strict";
  const P = window.PORTATIL;
  const ua = navigator.userAgent || "";
  const ios = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const android = /Android/i.test(ua);
  const instalada = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  // navegadores dentro de otras apps (WhatsApp, Instagram, Facebook, Telegram…): no descargan archivos
  const interno = !instalada && (/WhatsApp|FBAN|FBAV|FB_IAB|Instagram|Line\/|Telegram|Snapchat|; wv\)/i.test(ua) ||
    (ios && !/Safari\//.test(ua)));
  const tactil = window.matchMedia("(pointer: coarse)").matches;
  const PREF = "cancionero-web.";
  const leer = (k) => { try { return localStorage.getItem(PREF + k); } catch (e) { return null; } };
  const guardar = (k, v) => { try { localStorage.setItem(PREF + k, v); } catch (e) { /* sin almacenamiento */ } };
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const TIPOS = { pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation", html: "text/html" };
  if (interno) document.documentElement.classList.add("interno");

  /* ------------------------------------------------------- sin conexión --- */
  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener("load", () => { navigator.serviceWorker.register("sw.js").catch(() => {}); });
  }

  function aviso(texto) {
    const el = document.getElementById("aviso"); if (!el) return;
    el.textContent = texto; el.hidden = false;
    clearTimeout(aviso.t); aviso.t = setTimeout(() => { el.hidden = true; }, 3500);
  }

  /* ---------------------------------------------- archivos de una alabanza --- */
  const alabanza = (id) => P.alabanza(id);  // síncrono: compartir y descargar necesitan el toque del usuario
  function archivo(a, tipo) {
    const blob = tipo === "pptx" ? P.pptx(a) : new Blob([P.hojaHTML(a)], { type: TIPOS.html });
    return new File([blob], a.archivos[tipo], { type: TIPOS[tipo] });
  }
  function puedeCompartir(tipo) {
    try {
      return !!(navigator.canShare && navigator.share &&
        navigator.canShare({ files: [new File(["x"], "prueba." + tipo, { type: TIPOS[tipo] })] }));
    } catch (e) { return false; }
  }
  async function compartir(a, tipo) {
    const f = archivo(a, tipo);
    try {
      await navigator.share({ files: [f], title: a.nombre });
    } catch (e) {
      if (e && e.name === "AbortError") return;  // el usuario cerró el menú
      aviso("No se ha podido compartir: " + (e && e.message ? e.message : e));
    }
  }
  function descargar(f) {
    const url = URL.createObjectURL(f), el = document.createElement("a");
    el.href = url; el.download = f.name; document.body.appendChild(el); el.click(); el.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  /* «Abrir cancionero»: dentro de la app, en una capa a pantalla completa (va también sin conexión,
     instalada y en móviles que no abren pestañas nuevas). */
  /* Líneas que no caben en pantalla estrecha (aun con la letra al mínimo): se parten en dos, acordes y
     letra por la misma columna y entre palabras, para no tener que desplazarse de lado. */
  function partirLineas(cuerpo) {
    if (!cuerpo || cuerpo.scrollWidth <= cuerpo.clientWidth + 1) return;
    const prueba = document.createElement("div");
    prueba.className = "l"; prueba.style.cssText = "position:absolute;visibility:hidden;white-space:pre";
    prueba.textContent = "0".repeat(20); cuerpo.appendChild(prueba);
    const ch = prueba.getBoundingClientRect().width / 20; prueba.remove();
    if (!ch) return;
    const max = Math.max(12, Math.floor((cuerpo.clientWidth - 2) / ch));
    const lleno = (c) => c !== undefined && c !== " ";
    const sangria = (t) => (t.trim() ? t.length - t.trimStart().length : Infinity);
    function cortar(ac, le) {
      const out = [];
      while (Math.max(ac.trimEnd().length, le.trimEnd().length) > max) {
        let k = -1;
        for (let i = max; i >= Math.floor(max * 0.4); i--) {
          if (lleno(le[i - 1]) && lleno(le[i])) continue;      // no partir una palabra
          if (lleno(ac[i - 1]) && lleno(ac[i])) continue;      // ni un acorde
          if (!le.slice(0, i).trim() && !ac.slice(0, i).trim()) continue;
          k = i; break;
        }
        if (k < 0) { k = max; while (k > 1 && lleno(ac[k - 1]) && lleno(ac[k])) k--; }
        out.push([ac.slice(0, k).trimEnd(), le.slice(0, k).trimEnd()]);
        ac = ac.slice(k); le = le.slice(k);
        const n = Math.min(sangria(ac), sangria(le));
        if (n !== Infinity) { ac = ac.slice(Math.min(n, ac.length)); le = le.slice(Math.min(n, le.length)); }
      }
      out.push([ac, le]);
      return out;
    }
    const texto = (el) => (el && el.childNodes.length <= 1 ? el.textContent : null);
    const lineas = [...cuerpo.querySelectorAll(".l")];
    for (let i = 0; i < lineas.length; i++) {
      const el = lineas[i], t = texto(el);
      if (t === null) continue;
      const esAc = el.classList.contains("ac"), sig = lineas[i + 1];
      const par = esAc && sig && sig.classList.contains("le") && el.nextElementSibling === sig && texto(sig) !== null;
      if (Math.max(t.trimEnd().length, par ? texto(sig).trimEnd().length : 0) <= max) { if (par) i++; continue; }
      const trozos = par ? cortar(t, texto(sig)) : esAc ? cortar(t, "") : cortar("", t);
      const antes = par ? sig.nextSibling : el.nextSibling, padre = el.parentNode;
      const nuevos = [];
      trozos.forEach(([a, l]) => {
        if (par || esAc) { const x = el.cloneNode(false); x.textContent = a; nuevos.push(x); }
        if (par || !esAc) { const y = (par ? sig : el).cloneNode(false); y.textContent = l; nuevos.push(y); }
      });
      el.remove(); if (par) { sig.remove(); i++; }
      nuevos.forEach((n) => padre.insertBefore(n, antes));
    }
  }
  const vigilar = (raiz) => {
    if (!raiz) return;
    let pendiente = false;
    new MutationObserver(() => {
      if (pendiente) return; pendiente = true;
      requestAnimationFrame(() => { pendiente = false; raiz.querySelectorAll(".cancion-cuerpo").forEach(partirLineas); });
    }).observe(raiz, { childList: true, subtree: true });
  };
  vigilar(document.getElementById("visor")); vigilar(document.getElementById("vista"));

  let capa = null;
  // En el cancionero: cada canción se encoge (hasta 11 px) para caber y, si aun así no cabe, se parten las líneas.
  const AJUSTE = "<script>(function(){var partir=" + partirLineas.toString().replace(/<\//g, "<\\/") +
    ";function f(){var r=parseFloat(getComputedStyle(document.documentElement)" +
    ".getPropertyValue('--t-cancion'))||16;document.querySelectorAll('.cancion-cuerpo').forEach(function(c){" +
    "c.style.removeProperty('--t-cancion');if(c.scrollWidth>c.clientWidth+1){c.style.setProperty('--t-cancion'," +
    "Math.max(11,Math.floor(r*c.clientWidth/c.scrollWidth*10)/10)+'px');}partir(c);});}f();window.addEventListener('load',f);" +
    "window.addEventListener('resize',f);document.addEventListener('click',function(){setTimeout(f,0);});})();<\/script>";
  function conAjuste(html) {
    const i = html.lastIndexOf("</body>");
    return i < 0 ? html : html.slice(0, i) + AJUSTE + html.slice(i);
  }
  function abrirCancionero(a) {
    cerrarCancionero(true);
    capa = document.createElement("div");
    capa.className = "capa-cancionero";
    capa.setAttribute("role", "dialog");
    capa.setAttribute("aria-label", "Cancionero de " + a.nombre);
    capa.innerHTML = '<div class="capa-barra"><button type="button" class="capa-volver">‹ Volver</button>' +
      '<span class="capa-titulo">' + esc(a.nombre) + "</span>" +
      (puedeCompartir("html") && tactil ? '<button type="button" class="capa-compartir">Compartir</button>' : "") +
      '<button type="button" class="capa-descargar">Descargar</button></div>';
    const marco = document.createElement("iframe");
    marco.title = "Cancionero"; marco.srcdoc = conAjuste(P.hojaHTML(a));
    capa.appendChild(marco);
    capa.querySelector(".capa-volver").addEventListener("click", () => history.back());
    capa.querySelector(".capa-descargar").addEventListener("click", () => intentarDescarga(a, "html"));
    const c = capa.querySelector(".capa-compartir"); if (c) c.addEventListener("click", () => compartir(a, "html"));
    document.body.appendChild(capa);
    document.documentElement.classList.add("con-capa");
    history.pushState({ capa: true }, "");
  }
  function cerrarCancionero(sinHistoria) {
    if (!capa) return;
    capa.remove(); capa = null;
    document.documentElement.classList.remove("con-capa");
    if (!sinHistoria && history.state && history.state.capa) history.back();
  }
  window.addEventListener("popstate", () => { if (capa) cerrarCancionero(true); });
  document.addEventListener("keydown", (ev) => { if (ev.key === "Escape" && capa) history.back(); });

  /* ------------------------------------- navegador interno: aviso y ayuda --- */
  const enlace = location.href.split("#")[0];
  function abrirFueraHTML() {
    if (android) {
      const intent = "intent://" + enlace.replace(/^https?:\/\//, "") + "#Intent;scheme=" + location.protocol.slice(0, -1) +
        ";package=com.android.chrome;S.browser_fallback_url=" + encodeURIComponent(enlace) + ";end";
      return '<a class="principal" href="' + esc(intent) + '">Abrir en Chrome</a>';
    }
    return "";
  }
  const comoAbrir = ios
    ? "Toca el botón de compartir (o los tres puntos) y elige «Abrir en Safari»."
    : "Toca los tres puntos ⋮ y elige «Abrir en Chrome» (o en el navegador).";
  function ayudaDescarga(a, tipo) {
    const dlg = document.createElement("dialog");
    dlg.className = "ayuda-descarga";
    const compartible = puedeCompartir(tipo);
    dlg.innerHTML = '<div class="ayuda-in"><h2>Abre el cancionero en ' + (ios ? "Safari" : "Chrome") + "</h2>" +
      "<p>El navegador de WhatsApp (o de la app desde la que lo has abierto) no deja descargar archivos. " + comoAbrir + "</p>" +
      '<div class="ayuda-botones">' + abrirFueraHTML() +
      (compartible ? '<button type="button" class="secundario" data-a="compartir">Compartir el archivo</button>' : "") +
      '<button type="button" class="secundario" data-a="copiar">Copiar el enlace</button>' +
      '<button type="button" class="secundario" data-a="intentar">Intentar descargar</button>' +
      '<button type="button" class="enlace" data-a="cerrar">Cerrar</button></div></div>';
    document.body.appendChild(dlg);
    dlg.addEventListener("click", async (ev) => {
      const b = ev.target.closest("[data-a]");
      if (!b) { if (ev.target === dlg) dlg.close(); return; }
      if (b.dataset.a === "compartir") await compartir(a, tipo);
      else if (b.dataset.a === "copiar") await copiarEnlace();
      else if (b.dataset.a === "intentar") descargar(archivo(a, tipo));
      if (b.dataset.a !== "copiar") dlg.close();
    });
    dlg.addEventListener("close", () => dlg.remove());
    dlg.showModal();
  }
  async function copiarEnlace() {
    try { await navigator.clipboard.writeText(enlace); aviso("Enlace copiado"); }
    catch (e) { window.prompt("Copia el enlace:", enlace); }
  }
  function intentarDescarga(a, tipo) {
    if (interno) ayudaDescarga(a, tipo); else descargar(archivo(a, tipo));
  }

  /* Los botones de cada alabanza (los pinta app.js): se atienden aquí antes que en portatil.js. */
  window.addEventListener("click", (ev) => {
    const el = ev.target.closest && ev.target.closest("[data-alabanza-id][data-archivo], [data-alabanza-id][data-compartir]");
    if (!el) return;
    ev.preventDefault(); ev.stopPropagation();
    const a = alabanza(el.dataset.alabanzaId);
    if (!a) { aviso("No encuentro esa alabanza"); return; }
    if (el.dataset.compartir) compartir(a, el.dataset.compartir);
    else if (el.dataset.archivo === "abrir") abrirCancionero(a);
    else intentarDescarga(a, el.dataset.archivo);
  }, true);

  // En móviles que lo permiten, botones para compartir (WhatsApp, Drive, PowerPoint…) junto a las descargas.
  const compartirPptx = tactil && puedeCompartir("pptx"), compartirHtml = tactil && puedeCompartir("html");
  function anadirCompartir(raiz) {
    if (!compartirPptx && !compartirHtml) return;
    raiz.querySelectorAll(".botones").forEach((b) => {
      if (b.querySelector("[data-compartir]")) return;
      const ref = b.querySelector("[data-alabanza-id]"); if (!ref) return;
      const id = esc(ref.dataset.alabanzaId);
      if (compartirPptx) b.insertAdjacentHTML("beforeend", '<a href="#" class="compartir" data-alabanza-id="' + id + '" data-compartir="pptx">Compartir PowerPoint</a>');
      if (compartirHtml) b.insertAdjacentHTML("beforeend", '<a href="#" class="compartir" data-alabanza-id="' + id + '" data-compartir="html">Compartir cancionero</a>');
    });
  }
  new MutationObserver(() => anadirCompartir(document)).observe(document.body, { childList: true, subtree: true });

  /* ------------------------------------------------------- barra de avisos --- */
  function barra(clave, html) {
    if (leer("cerrado." + clave)) return;
    const div = document.createElement("div");
    div.className = "barra-web"; div.dataset.clave = clave;
    div.innerHTML = '<div class="barra-in">' + html + '<button type="button" class="barra-cerrar" aria-label="Cerrar">✕</button></div>';
    div.querySelector(".barra-cerrar").addEventListener("click", () => { guardar("cerrado." + clave, "1"); div.remove(); });
    const cab = document.querySelector(".cabecera");
    cab.parentNode.insertBefore(div, cab.nextSibling);
    return div;
  }
  if (interno) {
    const b = barra("interno", "<span>Estás en el navegador de otra app: aquí no se puede descargar el PowerPoint. " +
      (android ? "Ábrelo en Chrome." : esc(comoAbrir)) + "</span>" + abrirFueraHTML());
    if (b) b.classList.add("fuerte");
  }

  /* Crear alabanza en el móvil: la alabanza queda debajo de la lista; un botón lleva hasta ella. */
  const ir = document.createElement("button");
  ir.type = "button"; ir.className = "ir-alabanza"; ir.hidden = true;
  document.body.appendChild(ir);
  const panel = document.querySelector(".alabanza"), orden = document.getElementById("orden");
  let panelVisible = false;
  function pintarIr() {
    const n = orden ? orden.children.length : 0;
    const enCrear = !document.getElementById("panel-crear").hidden;
    ir.hidden = !(enCrear && n > 0 && !panelVisible) || !!capa;
    ir.textContent = "Ver la alabanza (" + n + ") ↓";
  }
  if (panel && orden && "IntersectionObserver" in window) {
    new IntersectionObserver((es) => { panelVisible = es[0].isIntersecting; pintarIr(); }, { threshold: 0.05 }).observe(panel);
    new MutationObserver(pintarIr).observe(orden, { childList: true });
    window.addEventListener("hashchange", () => setTimeout(pintarIr, 0));
    ir.addEventListener("click", () => panel.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  window.WEB = { interno, ios, android, instalada, puedeCompartir, abrirCancionero };
})();
