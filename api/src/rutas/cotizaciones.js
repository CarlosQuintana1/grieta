import { Router } from "express";
import { cotizaciones } from "../controladores/cotizaciones.js";

export const cotizacionesRouter = Router()
  .get("/", cotizaciones.listar)
  .get("/:id", cotizaciones.ver)
  .post("/", cotizaciones.crear)
  .put("/:id", cotizaciones.modificar)
  .delete("/:id", cotizaciones.borrar);
