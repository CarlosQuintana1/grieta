// Pasa las capturas de D1 a la API: un usuario por capturista y un registro con sus precios por captura.
// Uso: node importar-capturas.mjs [url de la api]. Se puede correr de nuevo: salta lo que ya existe.
import { execFileSync } from "node:child_process";

const API = process.argv[2] ?? "https://grieta-api-qro.azurewebsites.net/api";
const EN_PARALELO = 6;

const pedir = async (ruta, opciones = {}) => {
  const r = await fetch(`${API}${ruta}`, { headers: { "Content-Type": "application/json" }, ...opciones });
  const cuerpo = r.status === 204 ? null : await r.json();
  if (!r.ok) throw new Error(`${opciones.method ?? "GET"} ${ruta}: ${r.status} ${JSON.stringify(cuerpo)}`);
  return cuerpo;
};

const salida = execFileSync("npx", ["wrangler", "d1", "execute", "tarifas-qro", "--remote", "--json",
  "--command", "SELECT * FROM momentos ORDER BY timestamp"], { cwd: new URL("../captura", import.meta.url), encoding: "utf8" });
const momentos = JSON.parse(salida.slice(salida.indexOf("[")))[0].results;
console.log(`${momentos.length} capturas en D1`);

const usuarios = await pedir("/usuarios");
const idPorNombre = Object.fromEntries(usuarios.map((u) => [u.nombre, u.id]));
for (const nombre of new Set(momentos.map((m) => m.capturado_por))) {
  if (idPorNombre[nombre]) continue;
  const correo = `${nombre.toLowerCase().normalize("NFD").replace(/[^a-z]/g, "")}@grieta.example.org`;
  idPorNombre[nombre] = (await pedir("/usuarios", { method: "POST", body: JSON.stringify({ nombre, correo, rol: "capturista" }) })).id;
}

// Una captura ya importada tiene la misma ruta y la misma hora.
const yaEstan = new Set((await pedir("/registros")).map((r) => `${r.ruta_id}|${new Date(r.fecha_hora).getTime()}`));
const pendientes = momentos.filter((m) => !yaEstan.has(`${m.ruta_id}|${new Date(m.timestamp).getTime()}`));
console.log(`${momentos.length - pendientes.length} ya estaban, ${pendientes.length} por subir`);

let subidos = 0;
const fallas = [];
const subir = async (m) => {
  const cotizaciones = ["uber", "didi", "indrive"]
    .filter((app) => m[`precio_${app}`] > 0)
    .map((app) => ({ app, precio: m[`precio_${app}`] }));
  try {
    await pedir("/registros", { method: "POST", body: JSON.stringify({
      ruta_id: m.ruta_id, usuario_id: idPorNombre[m.capturado_por], fecha_hora: m.timestamp,
      sospechoso: Boolean(m.sospechosa), nota: m.nota || null, cotizaciones,
    }) });
    subidos++;
  } catch (e) {
    fallas.push(`${m.id}: ${e.message}`);
  }
};
for (let i = 0; i < pendientes.length; i += EN_PARALELO) {
  await Promise.all(pendientes.slice(i, i + EN_PARALELO).map(subir));
}
console.log(`${subidos} registros subidos, ${fallas.length} con error`);
fallas.slice(0, 10).forEach((f) => console.log(" ", f));
