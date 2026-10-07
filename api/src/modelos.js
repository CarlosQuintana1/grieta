import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";

export { sequelize };

export const APPS = ["uber", "didi", "indrive"];

export const Usuario = sequelize.define("Usuario", {
  nombre: { type: DataTypes.STRING(60), allowNull: false },
  correo: { type: DataTypes.STRING(120), allowNull: false, unique: true, validate: { isEmail: true } },
  rol: { type: DataTypes.ENUM("capturista", "usuario"), allowNull: false, defaultValue: "usuario" },
}, { tableName: "usuarios" });

export const Lugar = sequelize.define("Lugar", {
  clave: { type: DataTypes.STRING(40), allowNull: false, unique: true },
  nombre: { type: DataTypes.STRING(120), allowNull: false },
  lat: { type: DataTypes.DOUBLE, allowNull: false, validate: { min: -90, max: 90 } },
  lon: { type: DataTypes.DOUBLE, allowNull: false, validate: { min: -180, max: 180 } },
}, { tableName: "lugares" });

export const Ruta = sequelize.define("Ruta", {
  distancia_km: { type: DataTypes.FLOAT, allowNull: false },
  minutos_sin_trafico: { type: DataTypes.FLOAT, allowNull: false },
}, { tableName: "rutas" });

export const Registro = sequelize.define("Registro", {
  fecha_hora: { type: DataTypes.DATE, allowNull: false },
  temperatura_c: DataTypes.FLOAT,
  lluvia_mm: DataTypes.FLOAT,
  sospechoso: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  nota: DataTypes.STRING(280),
}, { tableName: "registros" });

export const Cotizacion = sequelize.define("Cotizacion", {
  app: { type: DataTypes.ENUM(...APPS), allowNull: false },
  precio: { type: DataTypes.DECIMAL(8, 2), allowNull: false, validate: { min: 0 } },
}, { tableName: "cotizaciones", indexes: [{ unique: true, fields: ["registro_id", "app"] }] });

export const Consulta = sequelize.define("Consulta", {
  hora_salida: { type: DataTypes.DATE, allowNull: false },
  precio_visto: DataTypes.DECIMAL(8, 2),
  recomendacion: DataTypes.STRING(40),
}, { tableName: "consultas" });

// RESTRICT: un lugar, una ruta o un usuario con datos ligados no se puede borrar.
const llave = (name, onDelete = "RESTRICT") => ({ foreignKey: { name, allowNull: false }, onDelete });

Lugar.hasMany(Ruta, { as: "salidas", ...llave("origen_id") });
Lugar.hasMany(Ruta, { as: "llegadas", ...llave("destino_id") });
Ruta.belongsTo(Lugar, { as: "origen", ...llave("origen_id") });
Ruta.belongsTo(Lugar, { as: "destino", ...llave("destino_id") });

Ruta.hasMany(Registro, llave("ruta_id"));
Registro.belongsTo(Ruta, { as: "ruta", ...llave("ruta_id") });
Usuario.hasMany(Registro, llave("usuario_id"));
Registro.belongsTo(Usuario, { as: "usuario", ...llave("usuario_id") });

// Las cotizaciones son parte del registro y se borran con el.
Registro.hasMany(Cotizacion, { as: "cotizaciones", ...llave("registro_id", "CASCADE") });
Cotizacion.belongsTo(Registro, llave("registro_id", "CASCADE"));

// usuario_id puede ir vacio: cualquiera puede preguntarle al agente sin cuenta.
Usuario.hasMany(Consulta, { foreignKey: "usuario_id", onDelete: "SET NULL" });
Consulta.belongsTo(Usuario, { foreignKey: "usuario_id", onDelete: "SET NULL" });
Consulta.belongsTo(Lugar, { as: "origen", ...llave("origen_id") });
Consulta.belongsTo(Lugar, { as: "destino", ...llave("destino_id") });
