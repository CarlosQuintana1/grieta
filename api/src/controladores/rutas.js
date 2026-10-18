import { Lugar, Ruta } from "../modelos.js";
import { crud } from "./base.js";

export const rutas = crud(Ruta, { incluir: [{ model: Lugar, as: "origen" }, { model: Lugar, as: "destino" }] });
