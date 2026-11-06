import webpush from "web-push";
import { Op } from "sequelize";
import { LlenoCamion } from "../modelos.js";
import { metros } from "./reportes.js";

// "Ya pasó" y "viene lleno": lo que dice la gente en la parada sirve media hora y vive en memoria.
// Los "viene lleno" tambien se guardan sin ubicacion para saber que lineas suelen ir llenas a cada hora.
const VIGENCIA_MS = 30 * 60 * 1000;
const TIPOS = ["paso", "lleno"];
let avisos = [];

const enQueretaro = (lat, lon) => lat >= 20.3 && lat <= 21 && lon >= -100.8 && lon <= -100;

// Fecha, hora y si es fin de semana en Queretaro, para guardar y comparar los "viene lleno".
function ahoraEnQueretaro(fecha = new Date()) {
  const partes = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23", weekday: "short" })
    .formatToParts(fecha).map((p) => [p.type, p.value]));
  return { fecha: `${partes.year}-${partes.month}-${partes.day}`, hora: Number(partes.hour), finde: ["Sat", "Sun"].includes(partes.weekday) };
}
// Una linea "suele ir llena" a esta hora si la gente lo avisó en al menos 3 dias distintos de las ultimas 8 semanas.
const DIAS_MINIMOS = 3;
const VENTANA_DIAS = 56;

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
  crear: async (req, res) => {
    const { tipo, linea, lat, lon } = req.body ?? {};
    if (!TIPOS.includes(tipo) || typeof linea !== "string" || !/^[A-Za-z0-9]{1,6}$/.test(linea) || !enQueretaro(lat, lon)) {
      return res.status(400).json({ error: "Falta el tipo, la línea o la ubicación" });
    }
    avisos.unshift({ tipo, linea: linea.toUpperCase(), lat, lon, t: Date.now() });
    avisos = avisos.slice(0, 2000);
    if (tipo === "lleno") await LlenoCamion.create({ linea: linea.toUpperCase(), ...ahoraEnQueretaro() }).catch(() => {});
    res.status(201).json({ tipo, linea: linea.toUpperCase() });
  },
  ocupacion: async (req, res) => {
    const lineas = String(req.query.lineas ?? "").toUpperCase().split(",").filter((l) => /^[A-Z0-9]{1,6}$/.test(l)).slice(0, 20);
    if (!lineas.length) return res.status(400).json({ error: "Faltan las líneas" });
    const { hora, finde } = ahoraEnQueretaro();
    const desde = ahoraEnQueretaro(new Date(Date.now() - VENTANA_DIAS * 86400000)).fecha;
    const filas = await LlenoCamion.findAll({ where: { linea: { [Op.in]: lineas }, hora, finde, fecha: { [Op.gte]: desde } }, attributes: ["linea", "fecha"], raw: true });
    const dias = new Map();
    for (const f of filas) dias.set(f.linea, (dias.get(f.linea) ?? new Set()).add(f.fecha));
    res.json({ llenas: lineas.filter((l) => (dias.get(l)?.size ?? 0) >= DIAS_MINIMOS) });
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
