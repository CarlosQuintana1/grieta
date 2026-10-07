import lugaresJson from "@/data/lugares.json";
import rutasJson from "@/data/rutas.json";
import type { Lugar, Ruta } from "./tipos";

const LUGARES = new Map<string, Lugar>(
  (lugaresJson.lugares as Lugar[]).map((l) => [l.id, l]),
);

/** Cada par genera dos rutas, una por sentido: el precio cambia segun la direccion. */
export const RUTAS: Ruta[] = rutasJson.pares.flatMap((par) => {
  const a = LUGARES.get(par.a);
  const b = LUGARES.get(par.b);
  if (!a || !b) throw new Error(`Par ${par.id} apunta a un lugar inexistente`);
  return [
    {
      ruta_id: par.id * 2 - 1,
      par_id: par.id,
      origen: a,
      destino: b,
      etiqueta: `${a.nombre} → ${b.nombre}`,
    },
    {
      ruta_id: par.id * 2,
      par_id: par.id,
      origen: b,
      destino: a,
      etiqueta: `${b.nombre} → ${a.nombre}`,
    },
  ];
});

/** Lugares cuya coordenada sigue siendo una estimacion a ojo. Los km de sus rutas estan mal. */
export const LUGARES_SIN_VERIFICAR = (lugaresJson.lugares as Lugar[]).filter((l) => !l.verificado);
