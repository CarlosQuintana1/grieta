import { randomUUID } from "node:crypto";
import { borrarFoto, guardarFoto, tipoValido } from "../almacen.js";
import { Reporte } from "../modelos.js";
import { crud, noExiste } from "./base.js";

const CAMPOS = ["tipo", "parada", "lat", "lon", "descripcion", "usuario_id"];
const base = crud(Reporte, { orden: [["id", "DESC"]], campos: CAMPOS });

const metros = (lat1, lon1, lat2, lon2) => {
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
    res.json(todos
      .map((r) => ({ ...r.toJSON(), metros: Math.round(metros(lat, lon, r.lat, r.lon)) }))
      .filter((r) => r.metros <= radio)
      .sort((a, b) => a.metros - b.metros));
  },
  // La foto llega como el cuerpo de la peticion, con su Content-Type de imagen.
  subirFoto: async (req, res) => {
    const reporte = await Reporte.findByPk(req.params.id);
    if (!reporte) return noExiste(res);
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
