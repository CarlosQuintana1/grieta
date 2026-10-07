import { Sequelize } from "sequelize";

const opciones = { logging: false, define: { underscored: true } };

// En local es un archivo SQLite; en la nube basta con definir DATABASE_URL (RDS, Azure Database).
export const sequelize = process.env.DATABASE_URL
  ? new Sequelize(process.env.DATABASE_URL, opciones)
  : new Sequelize({ ...opciones, dialect: "sqlite", storage: process.env.SQLITE ?? "database.sqlite" });
