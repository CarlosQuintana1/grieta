import { readFile } from "node:fs/promises";
import { Lugar, Ruta } from "./modelos.js";

const leer = async (archivo) => JSON.parse(await readFile(new URL(`../datos/${archivo}`, import.meta.url)));

// Carga el catalogo de lugares y rutas solo si la base esta vacia.
export async function sembrar() {
  if (await Lugar.count()) return 0;
  const lugares = await Lugar.bulkCreate(await leer("lugares.json"));
  const idPorClave = Object.fromEntries(lugares.map((l) => [l.clave, l.id]));
  const rutas = await leer("rutas.json");
  await Ruta.bulkCreate(rutas.map(({ origen, destino, ...medidas }) => ({
    origen_id: idPorClave[origen],
    destino_id: idPorClave[destino],
    ...medidas,
  })));
  return lugares.length;
}
