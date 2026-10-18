import { Cotizacion } from "../modelos.js";
import { crud } from "./base.js";

// La app y el registro de una cotizacion no cambian; solo se corrige el precio.
const base = crud(Cotizacion);
export const cotizaciones = {
  ...base,
  modificar: crud(Cotizacion, { campos: ["precio"] }).modificar,
};
