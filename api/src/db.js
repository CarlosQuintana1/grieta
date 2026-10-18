import { Sequelize } from "sequelize";

const opciones = { logging: false, define: { underscored: true } };

// En local es un archivo SQLite; en la nube basta con definir DATABASE_URL (Azure Database for PostgreSQL, RDS).
// Las bases administradas exigen conexion cifrada.
export const sequelize = process.env.DATABASE_URL
  ? new Sequelize(process.env.DATABASE_URL, { ...opciones, dialectOptions: { ssl: { require: true, rejectUnauthorized: false } } })
  : new Sequelize({ ...opciones, dialect: "sqlite", storage: process.env.SQLITE ?? "database.sqlite" });
