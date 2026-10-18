import { PrecioReportado } from "../modelos.js";
import { crud } from "./base.js";

const CAMPOS = ["app", "precio", "lat_origen", "lon_origen", "lat_destino", "lon_destino", "usuario_id"];
const base = crud(PrecioReportado, { orden: [["fecha_hora", "DESC"]], campos: CAMPOS });

export const precios = {
  ...base,
  crear: async (req, res) => {
    const datos = Object.fromEntries(CAMPOS.filter((c) => c in req.body).map((c) => [c, req.body[c]]));
    res.status(201).json(await PrecioReportado.create({ ...datos, fecha_hora: new Date() }));
  },
};
