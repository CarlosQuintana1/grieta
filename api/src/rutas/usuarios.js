import { Router } from "express";
import { usuarios } from "../controladores/usuarios.js";

export const usuariosRouter = Router()
  .get("/", usuarios.listar)
  .get("/:id", usuarios.ver)
  .post("/", usuarios.crear)
  .put("/:id", usuarios.modificar)
  .delete("/:id", usuarios.borrar);
