import { Router } from "express";
import { rutas } from "../controladores/rutas.js";

export const rutasRouter = Router()
  .get("/", rutas.listar)
  .get("/:id", rutas.ver)
  .post("/", rutas.crear)
  .put("/:id", rutas.modificar)
  .delete("/:id", rutas.borrar);
