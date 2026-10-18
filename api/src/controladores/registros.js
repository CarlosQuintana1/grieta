import { APPS, Cotizacion, Lugar, Registro, Ruta, Usuario, sequelize } from "../modelos.js";
import { crud, noExiste } from "./base.js";

// Con una sola app no hay nada que comparar.
const MINIMO_APPS = 2;
const CON_COTIZACIONES = [{ model: Cotizacion, as: "cotizaciones" }];
const base = crud(Registro, { incluir: CON_COTIZACIONES, orden: [["fecha_hora", "DESC"]], campos: ["temperatura_c", "lluvia_mm", "sospechoso", "nota"] });

export const registros = {
  ...base,
  ver: async (req, res) => {
    const registro = await Registro.findByPk(req.params.id, {
      include: [...CON_COTIZACIONES, { model: Ruta, as: "ruta", include: [{ model: Lugar, as: "origen" }, { model: Lugar, as: "destino" }] }],
    });
    return registro ? res.json(registro) : noExiste(res);
  },
  crear: async (req, res) => {
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
  },
  borrar: async (req, res) => {
    const registro = await Registro.findByPk(req.params.id);
    if (!registro) return noExiste(res);
    await sequelize.transaction(async (transaction) => {
      await Cotizacion.destroy({ where: { registro_id: registro.id }, transaction });
      await registro.destroy({ transaction });
    });
    res.status(204).end();
  },
  cotizaciones: async (req, res) => {
    const registro = await Registro.findByPk(req.params.id);
    if (!registro) return noExiste(res);
    res.json(await Cotizacion.findAll({ where: { registro_id: registro.id }, order: [["precio", "ASC"]] }));
  },
};
