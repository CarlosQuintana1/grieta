import { Router } from "express";
import { lugares } from "../controladores/lugares.js";

export const lugaresRouter = Router()
  .get("/", lugares.listar)
  .get("/:id", lugares.ver)
  .post("/", lugares.crear)
  .put("/:id", lugares.modificar)
  .delete("/:id", lugares.borrar);
