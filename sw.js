/* Service worker del cancionero web: guarda la app y las canciones para usarla sin conexión.
   La página se pide primero a internet (para tener siempre la última versión) y, si no hay conexión
   o tarda, sale de lo guardado. El resto de archivos llevan su versión en el nombre (?v=…). */
const VERSION = "c701d33475";
const CACHE = "cancionero-" + VERSION;
const ARCHIVOS = ["./", "datos.js?v=acceead6a8", "estilos.css?v=96e9a24675", "iconos/apple-touch-icon.png?v=43138338ba", "iconos/favicon-32.png?v=a298928eb0", "iconos/icono-192.png?v=3bc1518b1d", "iconos/icono-512.png?v=ec2d584d59", "iconos/icono-maskable-512.png?v=3715363036", "manifest.webmanifest?v=a080e8a83c", "plantilla.js?v=bc2590ca72", "programa.js?v=9c0b9bf5ca"];

self.addEventListener("install", (ev) => {
  ev.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (ev) => {
  ev.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k.startsWith("cancionero-") && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

function conLimite(promesa, ms) {
  return new Promise((ok, mal) => {
    const t = setTimeout(() => mal(new Error("tiempo")), ms);
    promesa.then((r) => { clearTimeout(t); ok(r); }, (e) => { clearTimeout(t); mal(e); });
  });
}

self.addEventListener("fetch", (ev) => {
  const r = ev.request;
  if (r.method !== "GET" || new URL(r.url).origin !== self.location.origin) return;
  if (r.mode === "navigate") {
    // «no-cache»: preguntar siempre al servidor si hay versión nueva (GitHub Pages guarda 10 min en caché)
    ev.respondWith(conLimite(fetch(r.url, { cache: "no-cache", credentials: "same-origin" }), 5000)
      .then((resp) => {
        if (resp.ok) { const copia = resp.clone(); caches.open(CACHE).then((c) => c.put("./", copia)); }
        return resp;
      })
      .catch(() => caches.match("./").then((m) => m || caches.match(r, { ignoreSearch: true })))
      .then((resp) => resp || new Response("Sin conexión", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } })));
    return;
  }
  ev.respondWith(caches.match(r).then((m) => m || fetch(r).then((resp) => {
    if (resp.ok) { const copia = resp.clone(); caches.open(CACHE).then((c) => c.put(r, copia)); }
    return resp;
  })));
});
