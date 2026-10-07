import { app } from "./app.js";
import { sequelize } from "./modelos.js";
import { sembrar } from "./semilla.js";

const PUERTO = process.env.PORT ?? 3000;

// El ORM crea en la base las tablas que falten, a partir de los modelos.
await sequelize.sync();
const tablas = Object.values(sequelize.models).map((m) => m.tableName);
console.log(`Esquema sincronizado con la base de datos: ${tablas.length} tablas (${tablas.join(", ")})`);

const sembrados = await sembrar();
if (sembrados) console.log(`Catalogo cargado: ${sembrados} lugares y sus rutas`);

app.listen(PUERTO, () => console.log(`API de Grieta en http://localhost:${PUERTO}/api`));
