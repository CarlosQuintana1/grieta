import { Op } from "sequelize";
import { Queja, TIPOS_QUEJA } from "../modelos.js";
import { crud } from "./base.js";
import { metros } from "./reportes.js";

const CAMPOS = ["tipo", "ruta", "unidad", "parada", "lat", "lon", "descripcion"];
const base = crud(Queja, { orden: [["id", "DESC"]], campos: CAMPOS });
const DIAS = 30;

export const quejas = {
  ...base,
  crear: async (req, res) => {
    const datos = Object.fromEntries(CAMPOS.filter((c) => c in (req.body ?? {})).map((c) => [c, req.body[c]]));
    if (typeof datos.ruta === "string") datos.ruta = datos.ruta.trim().toUpperCase();
    if (typeof datos.unidad === "string") datos.unidad = datos.unidad.trim().toUpperCase() || null;
    res.status(201).json(await Queja.create(datos));
  },
  // Solo conteos de los ultimos 30 dias, por ruta o cerca de un punto; nunca el texto.
  resumen: async (req, res) => {
    const ruta = typeof req.query.ruta === "string" ? req.query.ruta.trim().toUpperCase() : null;
    const lat = Number(req.query.lat), lon = Number(req.query.lon);
    const cerca = Number.isFinite(lat) && Number.isFinite(lon);
    if (!ruta && !cerca) return res.status(400).json({ error: "Indica una ruta o un punto" });
    const desde = new Date(Date.now() - DIAS * 86400000);
    const filas = await Queja.findAll({ where: { createdAt: { [Op.gte]: desde }, ...(ruta ? { ruta } : {}) }, attributes: ["tipo", "ruta", "lat", "lon"], raw: true });
    const radio = Math.min(Number(req.query.radio) || 300, 2000);
    const elegidas = cerca ? filas.filter((q) => metros(lat, lon, q.lat, q.lon) <= radio) : filas;
    const porTipo = Object.fromEntries(TIPOS_QUEJA.map((t) => [t, elegidas.filter((q) => q.tipo === t).length]));
    res.json({ dias: DIAS, ruta, total: elegidas.length, porTipo });
  },
};
