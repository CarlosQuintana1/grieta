import { Router } from "express";
import { quejas } from "../controladores/quejas.js";

export const quejasRouter = Router()
  .get("/resumen", quejas.resumen)
  .get("/", quejas.listar)
  .get("/:id", quejas.ver)
  .post("/", quejas.crear)
  .delete("/:id", quejas.borrar);
