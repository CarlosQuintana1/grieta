import { Consulta, Cotizacion, Lugar, Registro, Ruta } from "../modelos.js";
import { crud } from "./base.js";

const CON_LUGARES = [{ model: Lugar, as: "origen" }, { model: Lugar, as: "destino" }];
const base = crud(Consulta, { incluir: CON_LUGARES, orden: [["id", "DESC"]], campos: ["precio_visto", "recomendacion"] });

export const consultas = {
  ...base,
  // Recomienda la app mas barata del ultimo registro de esa ruta.
  crear: async (req, res) => {
    const { origen_id, destino_id, hora_salida = new Date(), precio_visto = null, usuario_id = null } = req.body;
    const ruta = await Ruta.findOne({ where: { origen_id, destino_id } });
    const ultimo = ruta && await Registro.findOne({
      where: { ruta_id: ruta.id }, include: [{ model: Cotizacion, as: "cotizaciones" }], order: [["fecha_hora", "DESC"]],
    });
    const masBarata = ultimo?.cotizaciones.reduce((a, b) => (Number(a.precio) <= Number(b.precio) ? a : b));
    const consulta = await Consulta.create({
      origen_id, destino_id, hora_salida, precio_visto, usuario_id, recomendacion: masBarata?.app ?? null,
    });
    res.status(201).json({ consulta, ultimo_registro: ultimo ?? null });
  },
};
