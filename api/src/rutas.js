import { Router } from "express";
import { APPS, Consulta, Cotizacion, Lugar, Registro, Ruta, Usuario, sequelize } from "./modelos.js";

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
