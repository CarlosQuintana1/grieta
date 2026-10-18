import { Router } from "express";
import { consultasRouter } from "./consultas.js";
import { cotizacionesRouter } from "./cotizaciones.js";
import { lugaresRouter } from "./lugares.js";
import { preciosRouter } from "./precios.js";
import { registrosRouter } from "./registros.js";
import { reportesRouter } from "./reportes.js";
import { rutasRouter } from "./rutas.js";
import { usuariosRouter } from "./usuarios.js";

// Una ruta base por tabla; cada una tiene su controlador en ../controladores.
export const api = Router()
  .get("/salud", (_req, res) => res.json({ ok: true }))
  .use("/lugares", lugaresRouter)
  .use("/usuarios", usuariosRouter)
  .use("/rutas", rutasRouter)
  .use("/registros", registrosRouter)
  .use("/cotizaciones", cotizacionesRouter)
  .use("/consultas", consultasRouter)
  .use("/reportes", reportesRouter)
  .use("/precios-reportados", preciosRouter);
