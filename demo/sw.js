// Guarda la app y los horarios para que funcione sin internet. Cambiar la version renueva todo.
const VERSION = "grieta-64";
const BASE = [
  "./", "index.html", "estilos.css", "app.js", "grieta.js", "idioma.js", "logo.png", "icono-192.png", "manifest.webmanifest",
  "idiomas/es.json", "idiomas/otq.json",
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

// Los audios son opcionales: un archivo que todavia no existe no impide guardar la app.
self.addEventListener("message", (e) => {
  if (e.data?.tipo !== "guardar-audios" || !Array.isArray(e.data.ids)) return;
  e.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    const ids = e.data.ids.filter((id) => typeof id === "string" && /^[a-z_]+$/.test(id)).slice(0, 100);
    const disponibles = await Promise.all(ids.map(async (id) => {
      const url = new URL(`audio/oto/${id}.mp3`, self.registration.scope).href;
      try {
        const respuesta = await fetch(url);
        if (respuesta.ok) { await cache.put(url, respuesta); return id; }
      } catch {}
      return (await cache.match(url)) ? id : null;
    }));
    e.ports[0]?.postMessage(disponibles.filter(Boolean));
  })());
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

// Avisos del viaje que la API manda a su hora, aunque la pantalla este bloqueada.
self.addEventListener("push", (e) => {
  let aviso = {};
  try { aviso = e.data?.json() ?? {}; } catch {}
  e.waitUntil(self.registration.showNotification(aviso.titulo ?? "Grieta", {
    body: aviso.texto ?? "", icon: "icono-192.png", badge: "icono-192.png", vibrate: [300, 120, 300], tag: "grieta-viaje", renotify: true,
  }));
});

// Tocar el aviso regresa a la app abierta o la abre.
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window" }).then((ventanas) => ventanas[0]?.focus() ?? self.clients.openWindow("./")));
});
