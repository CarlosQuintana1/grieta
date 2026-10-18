import { Router } from "express";
import { registros } from "../controladores/registros.js";

export const registrosRouter = Router()
  .get("/", registros.listar)
  .get("/:id", registros.ver)
  .get("/:id/cotizaciones", registros.cotizaciones)
  .post("/", registros.crear)
  .put("/:id", registros.modificar)
  .delete("/:id", registros.borrar);
