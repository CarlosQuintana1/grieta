import { Router } from "express";
import { precios } from "../controladores/precios.js";

export const preciosRouter = Router()
  .get("/", precios.listar)
  .get("/:id", precios.ver)
  .post("/", precios.crear)
  .put("/:id", precios.modificar)
  .delete("/:id", precios.borrar);
