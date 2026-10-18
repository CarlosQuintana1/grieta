import { Router } from "express";
import { consultas } from "../controladores/consultas.js";

export const consultasRouter = Router()
  .get("/", consultas.listar)
  .get("/:id", consultas.ver)
  .post("/", consultas.crear)
  .put("/:id", consultas.modificar)
  .delete("/:id", consultas.borrar);
