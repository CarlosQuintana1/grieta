import express from "express";
import { api } from "./rutas.js";

export const app = express();
app.use(express.json());
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
  console.error(err);
  res.status(500).json({ error: "Error interno" });
});
