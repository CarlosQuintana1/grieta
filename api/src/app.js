import express from "express";
import { CARPETA_LOCAL } from "./almacen.js";
import { api } from "./rutas/index.js";

export const app = express();

// La app web vive en otro dominio; sin esto el navegador bloquea las peticiones.
app.use((req, res, next) => {
  res.set("Access-Control-Allow-Origin", process.env.ORIGEN_PERMITIDO ?? "*");
  res.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});
app.use(express.json());
app.use("/fotos", express.static(CARPETA_LOCAL));
app.use("/api", api);
app.use((_req, res) => res.status(404).json({ error: "Ruta no encontrada" }));

// Traduce los errores de Sequelize a codigos HTTP; cualquier otro es un 500.
app.use((err, req, res, _next) => {
  if (err.name === "SequelizeValidationError") {
    return res.status(400).json({ error: err.errors.map((e) => e.message).join("; ") });
  }
  if (err.name === "SequelizeUniqueConstraintError") return res.status(409).json({ error: "Ya existe" });
  if (err.name === "SequelizeForeignKeyConstraintError") {
    return req.method === "DELETE"
      ? res.status(409).json({ error: "No se puede borrar: tiene datos relacionados" })
      : res.status(400).json({ error: "Hace referencia a un dato que no existe" });
  }
  if (err.type === "entity.too.large") return res.status(413).json({ error: "La foto pesa más de 5 MB" });
  console.error(err);
  res.status(500).json({ error: "Error interno" });
});
