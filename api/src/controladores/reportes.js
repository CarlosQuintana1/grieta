import { randomUUID } from "node:crypto";
import { borrarFoto, guardarFoto, tipoValido } from "../almacen.js";
import { Op } from "sequelize";
import { Reporte, VerificacionReporte } from "../modelos.js";
import { esDelEquipo } from "../seguridad.js";

// Fuera del equipo, la foto se sube una sola vez y poco despues de crear el reporte.
const VENTANA_FOTO_MS = 15 * 60 * 1000;
import { crud, noExiste } from "./base.js";

const CAMPOS = ["tipo", "parada", "lat", "lon", "descripcion", "usuario_id"];
const base = crud(Reporte, { orden: [["id", "DESC"]], campos: CAMPOS });

export const metros = (lat1, lon1, lat2, lon2) => {
  const r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 +
    Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(a));
};

export const reportes = {
  ...base,
  // Con ?lat=&lon= trae solo los cercanos, del mas cercano al mas lejano.
  listar: async (req, res) => {
    const todos = await Reporte.findAll({ order: [["id", "DESC"]] });
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return res.json(todos);
    const radio = Math.min(Number(req.query.radio) || 300, 2000);
    const cerca = todos
      .map((r) => ({ ...r.toJSON(), metros: Math.round(metros(lat, lon, r.lat, r.lon)) }))
      .filter((r) => r.metros <= radio)
      .sort((a, b) => a.metros - b.metros);
    // Cuantos dijeron que sigue asi o que ya lo arreglaron; se oculta si al menos 2 dicen arreglado y son mas.
    const votos = await VerificacionReporte.findAll({ where: { reporte_id: { [Op.in]: cerca.map((r) => r.id) } }, attributes: ["reporte_id", "sigue"], raw: true });
    for (const r of cerca) {
      const suyos = votos.filter((v) => v.reporte_id === r.id);
      r.sigue = suyos.filter((v) => v.sigue).length;
      r.arreglado = suyos.length - r.sigue;
    }
    res.json(cerca.filter((r) => !(r.arreglado >= 2 && r.arreglado > r.sigue)));
  },
  verificar: async (req, res) => {
    const reporte = await Reporte.findByPk(req.params.id);
    if (!reporte) return noExiste(res);
    if (typeof req.body?.sigue !== "boolean") return res.status(400).json({ error: "Di si sigue así o ya lo arreglaron" });
    await VerificacionReporte.create({ reporte_id: reporte.id, sigue: req.body.sigue });
    res.status(201).json({ ok: true });
  },
  // La foto llega como el cuerpo de la peticion, con su Content-Type de imagen.
  subirFoto: async (req, res) => {
    const reporte = await Reporte.findByPk(req.params.id);
    if (!reporte) return noExiste(res);
    if (!esDelEquipo(req) && (reporte.foto_url || Date.now() - reporte.createdAt.getTime() > VENTANA_FOTO_MS)) {
      return res.status(403).json({ error: "Este reporte ya no acepta foto" });
    }
    const tipo = req.get("Content-Type");
    if (!tipoValido(tipo) || !Buffer.isBuffer(req.body) || !req.body.length) {
      return res.status(400).json({ error: "Manda una imagen JPG, PNG o WebP" });
    }
    const anterior = reporte.foto_url;
    const url = await guardarFoto(`${reporte.id}-${randomUUID()}`, req.body, tipo);
    res.json(await reporte.update({ foto_url: url }));
    // La foto que reemplaza a otra no deja la vieja guardada.
    await borrarFoto(anterior).catch(() => {});
  },
  // Al borrar el reporte tambien se borra su foto; si eso falla, el reporte ya no existe igual.
  borrar: async (req, res) => {
    const reporte = await Reporte.findByPk(req.params.id);
    if (!reporte) return noExiste(res);
    await reporte.destroy();
    await borrarFoto(reporte.foto_url).catch(() => {});
    res.status(204).end();
  },
};
