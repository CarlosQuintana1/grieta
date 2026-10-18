import express, { Router } from "express";
import { randomUUID } from "node:crypto";
import { TAMANO_MAXIMO, guardarFoto, tipoValido } from "./almacen.js";
import { APPS, Consulta, Cotizacion, Lugar, PrecioReportado, Registro, Reporte, Ruta, Usuario, sequelize } from "./modelos.js";

// Con una sola app no hay nada que comparar.
const MINIMO_APPS = 2;
const CON_LUGARES = [{ model: Lugar, as: "origen" }, { model: Lugar, as: "destino" }];
const CON_COTIZACIONES = [{ model: Cotizacion, as: "cotizaciones" }];

export const api = Router();

const noExiste = (res) => res.status(404).json({ error: "No existe" });

api.get("/salud", (_req, res) => res.json({ ok: true }));

function crud(ruta, Modelo) {
  api.get(ruta, async (_req, res) => res.json(await Modelo.findAll({ order: [["id", "ASC"]] })));
  api.get(`${ruta}/:id`, async (req, res) => {
    const fila = await Modelo.findByPk(req.params.id);
    return fila ? res.json(fila) : noExiste(res);
  });
  api.post(ruta, async (req, res) => res.status(201).json(await Modelo.create(req.body)));
  api.put(`${ruta}/:id`, async (req, res) => {
    const fila = await Modelo.findByPk(req.params.id);
    return fila ? res.json(await fila.update(req.body)) : noExiste(res);
  });
  api.delete(`${ruta}/:id`, async (req, res) => {
    const borradas = await Modelo.destroy({ where: { id: req.params.id } });
    return borradas ? res.status(204).end() : noExiste(res);
  });
}

crud("/lugares", Lugar);
crud("/usuarios", Usuario);

api.get("/rutas", async (_req, res) =>
  res.json(await Ruta.findAll({ include: CON_LUGARES, order: [["id", "ASC"]] })));

api.get("/rutas/:id", async (req, res) => {
  const ruta = await Ruta.findByPk(req.params.id, { include: CON_LUGARES });
  return ruta ? res.json(ruta) : noExiste(res);
});

api.get("/registros", async (_req, res) =>
  res.json(await Registro.findAll({ include: CON_COTIZACIONES, order: [["fecha_hora", "DESC"]] })));

api.get("/registros/:id", async (req, res) => {
  const registro = await Registro.findByPk(req.params.id, {
    include: [...CON_COTIZACIONES, { model: Ruta, as: "ruta", include: CON_LUGARES }],
  });
  return registro ? res.json(registro) : noExiste(res);
});

api.get("/registros/:id/cotizaciones", async (req, res) => {
  const registro = await Registro.findByPk(req.params.id);
  if (!registro) return noExiste(res);
  res.json(await Cotizacion.findAll({ where: { registro_id: registro.id }, order: [["precio", "ASC"]] }));
});

api.post("/registros", async (req, res) => {
  const { cotizaciones = [], ...datos } = req.body;
  const validas = cotizaciones.filter((c) => APPS.includes(c.app) && Number(c.precio) > 0);
  if (validas.length < MINIMO_APPS) {
    return res.status(400).json({ error: `Faltan precios: se necesitan al menos ${MINIMO_APPS} apps` });
  }
  if (!(await Ruta.findByPk(datos.ruta_id))) return res.status(400).json({ error: "La ruta no existe" });
  if (!(await Usuario.findByPk(datos.usuario_id))) return res.status(400).json({ error: "El usuario no existe" });
  // El registro y sus precios entran juntos o no entra nada.
  const registro = await sequelize.transaction(async (transaction) => {
    const nuevo = await Registro.create({ fecha_hora: new Date(), ...datos }, { transaction });
    await Cotizacion.bulkCreate(validas.map((c) => ({ ...c, registro_id: nuevo.id })), { transaction });
    return nuevo;
  });
  res.status(201).json(await Registro.findByPk(registro.id, { include: CON_COTIZACIONES }));
});

api.delete("/registros/:id", async (req, res) => {
  const registro = await Registro.findByPk(req.params.id);
  if (!registro) return noExiste(res);
  await sequelize.transaction(async (transaction) => {
    await Cotizacion.destroy({ where: { registro_id: registro.id }, transaction });
    await registro.destroy({ transaction });
  });
  res.status(204).end();
});

api.get("/consultas", async (_req, res) =>
  res.json(await Consulta.findAll({ include: CON_LUGARES, order: [["id", "DESC"]] })));

// Por ahora recomienda la app mas barata del ultimo registro de esa ruta; despues lo decide el modelo.
api.post("/consultas", async (req, res) => {
  const { origen_id, destino_id, hora_salida = new Date(), precio_visto = null, usuario_id = null } = req.body;
  const ruta = await Ruta.findOne({ where: { origen_id, destino_id } });
  const ultimo = ruta && await Registro.findOne({
    where: { ruta_id: ruta.id }, include: CON_COTIZACIONES, order: [["fecha_hora", "DESC"]],
  });
  const masBarata = ultimo?.cotizaciones.reduce((a, b) => (Number(a.precio) <= Number(b.precio) ? a : b));
  const consulta = await Consulta.create({
    origen_id, destino_id, hora_salida, precio_visto, usuario_id, recomendacion: masBarata?.app ?? null,
  });
  res.status(201).json({ consulta, ultimo_registro: ultimo ?? null });
});

const metros = (lat1, lon1, lat2, lon2) => {
  const r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 +
    Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(a));
};

// Con ?lat=&lon= trae solo los reportes cercanos, del mas cercano al mas lejano.
api.get("/reportes", async (req, res) => {
  const reportes = await Reporte.findAll({ order: [["id", "DESC"]] });
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return res.json(reportes);
  const radio = Math.min(Number(req.query.radio) || 300, 2000);
  res.json(reportes
    .map((r) => ({ ...r.toJSON(), metros: Math.round(metros(lat, lon, r.lat, r.lon)) }))
    .filter((r) => r.metros <= radio)
    .sort((a, b) => a.metros - b.metros));
});

api.get("/reportes/:id", async (req, res) => {
  const reporte = await Reporte.findByPk(req.params.id);
  return reporte ? res.json(reporte) : noExiste(res);
});

api.post("/reportes", async (req, res) => {
  const { tipo, parada, lat, lon, descripcion, usuario_id = null } = req.body;
  res.status(201).json(await Reporte.create({ tipo, parada, lat, lon, descripcion, usuario_id }));
});

api.delete("/reportes/:id", async (req, res) => {
  const borradas = await Reporte.destroy({ where: { id: req.params.id } });
  return borradas ? res.status(204).end() : noExiste(res);
});

// La foto llega como el cuerpo de la peticion, con su Content-Type de imagen.
api.post("/reportes/:id/foto", express.raw({ type: "image/*", limit: TAMANO_MAXIMO }), async (req, res) => {
  const reporte = await Reporte.findByPk(req.params.id);
  if (!reporte) return noExiste(res);
  const tipo = req.get("Content-Type");
  if (!tipoValido(tipo) || !Buffer.isBuffer(req.body) || !req.body.length) {
    return res.status(400).json({ error: "Manda una imagen JPG, PNG o WebP" });
  }
  const url = await guardarFoto(`${reporte.id}-${randomUUID()}`, req.body, tipo);
  res.json(await reporte.update({ foto_url: url }));
});

api.get("/precios-reportados", async (_req, res) =>
  res.json(await PrecioReportado.findAll({ order: [["fecha_hora", "DESC"]] })));

api.post("/precios-reportados", async (req, res) => {
  const { app, precio, lat_origen, lon_origen, lat_destino, lon_destino, usuario_id = null } = req.body;
  res.status(201).json(await PrecioReportado.create({
    app, precio, lat_origen, lon_origen, lat_destino, lon_destino, usuario_id, fecha_hora: new Date(),
  }));
});
