import webpush from "web-push";
import { metros } from "./reportes.js";

// "Ya pasó" y "viene lleno": lo que dice la gente en la parada sirve media hora,
// así que vive en memoria y caduca solo. No hace falta guardarlo en la base.
const VIGENCIA_MS = 30 * 60 * 1000;
const TIPOS = ["paso", "lleno"];
let avisos = [];

const enQueretaro = (lat, lon) => lat >= 20.3 && lat <= 21 && lon >= -100.8 && lon <= -100;

export const camiones = {
  listar: (req, res) => {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return res.status(400).json({ error: "Falta la ubicación (lat y lon)" });
    const ahora = Date.now();
    avisos = avisos.filter((a) => ahora - a.t < VIGENCIA_MS);
    const radio = Math.min(Number(req.query.radio) || 150, 1000);
    res.json(avisos
      .filter((a) => metros(lat, lon, a.lat, a.lon) <= radio)
      .map(({ tipo, linea, t }) => ({ tipo, linea, minutos: Math.floor((ahora - t) / 60000) })));
  },
  crear: (req, res) => {
    const { tipo, linea, lat, lon } = req.body ?? {};
    if (!TIPOS.includes(tipo) || typeof linea !== "string" || !/^[A-Za-z0-9]{1,6}$/.test(linea) || !enQueretaro(lat, lon)) {
      return res.status(400).json({ error: "Falta el tipo, la línea o la ubicación" });
    }
    avisos.unshift({ tipo, linea: linea.toUpperCase(), lat, lon, t: Date.now() });
    avisos = avisos.slice(0, 2000);
    res.status(201).json({ tipo, linea: linea.toUpperCase() });
  },
};

// Avisos con la pantalla bloqueada: la app pide uno para cierta hora y el servidor lo manda por push.
// Las llaves VAPID viven solo en el servidor; sin ellas la ruta responde 503 y la app sigue sin push.
const PLAZO_MAXIMO_MS = 3 * 60 * 60 * 1000;
const programados = new Map();

function configurado() {
  const { VAPID_PUBLICO, VAPID_PRIVADO } = process.env;
  if (!VAPID_PUBLICO || !VAPID_PRIVADO) return false;
  webpush.setVapidDetails(process.env.VAPID_SUJETO ?? "https://grieta-web-qro.azurewebsites.net", VAPID_PUBLICO, VAPID_PRIVADO);
  return true;
}

function cancelarDe(endpoint) {
  for (const t of programados.get(endpoint) ?? []) clearTimeout(t);
  programados.delete(endpoint);
}

const valido = (a, ahora) => {
  const cuando = Date.parse(a?.cuando);
  return Number.isFinite(cuando) && cuando > ahora - 60000 && cuando - ahora < PLAZO_MAXIMO_MS &&
    typeof a.titulo === "string" && a.titulo.length > 0 && a.titulo.length <= 80 && String(a.texto ?? "").length <= 200;
};

export const notificaciones = {
  clave: (_req, res) => (configurado()
    ? res.json({ clave: process.env.VAPID_PUBLICO })
    : res.status(503).json({ error: "Los avisos no están configurados" })),
  programar: (req, res) => {
    if (!configurado()) return res.status(503).json({ error: "Los avisos no están configurados" });
    const { suscripcion, avisos: lista } = req.body ?? {};
    const ahora = Date.now();
    if (!String(suscripcion?.endpoint ?? "").startsWith("https://") || !suscripcion.keys?.p256dh || !suscripcion.keys?.auth ||
      !Array.isArray(lista) || !lista.length || lista.length > 6 || !lista.every((a) => valido(a, ahora))) {
      return res.status(400).json({ error: "Avisos incompletos" });
    }
    // Un viaje nuevo reemplaza los avisos del anterior en el mismo telefono.
    cancelarDe(suscripcion.endpoint);
    const tiempos = lista.map((a) => {
      const t = setTimeout(() => {
        webpush.sendNotification(suscripcion, JSON.stringify({ titulo: a.titulo, texto: a.texto ?? "" })).catch(() => {});
      }, Math.max(0, Date.parse(a.cuando) - ahora));
      t.unref();
      return t;
    });
    programados.set(suscripcion.endpoint, tiempos);
    if (programados.size > 5000) cancelarDe(programados.keys().next().value);
    res.status(201).json({ programados: tiempos.length });
  },
  cancelar: (req, res) => {
    cancelarDe(req.body?.endpoint);
    res.status(204).end();
  },
};
