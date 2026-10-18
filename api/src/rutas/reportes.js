import express, { Router } from "express";
import { TAMANO_MAXIMO } from "../almacen.js";
import { reportes } from "../controladores/reportes.js";

export const reportesRouter = Router()
  .get("/", reportes.listar)
  .get("/:id", reportes.ver)
  .post("/", reportes.crear)
  .post("/:id/foto", express.raw({ type: "image/*", limit: TAMANO_MAXIMO }), reportes.subirFoto)
  .put("/:id", reportes.modificar)
  .delete("/:id", reportes.borrar);
