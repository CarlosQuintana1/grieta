// Guarda la app y los horarios para que funcione sin internet. Cambiar la version renueva todo.
const VERSION = "grieta-10";
const BASE = [
  "./", "index.html", "estilos.css", "app.js", "grieta.js", "logo.png", "icono-192.png", "manifest.webmanifest",
  "datos/modelo.json", "datos/qrobus.json", "datos/lugares.json", "datos/config.json",
  "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css",
  "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js",
  "https://cdn.jsdelivr.net/npm/h3-js@4.1.0/dist/h3-js.umd.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(BASE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((claves) => Promise.all(claves.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Lo propio y las librerias: primero internet para tener siempre lo ultimo; sin conexion, lo guardado.
// Buscador, rutas, mapa y API: siempre de internet.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  const propio = url.origin === location.origin || url.hostname === "cdnjs.cloudflare.com" || url.hostname === "cdn.jsdelivr.net";
  if (e.request.method !== "GET" || !propio) return;
  e.respondWith(fetch(e.request)
    .then((r) => {
      if (r.ok) {
        const copia = r.clone();
        caches.open(VERSION).then((c) => c.put(e.request, copia));
      }
      return r;
    })
    .catch(() => caches.match(e.request, { ignoreSearch: true })));
});
