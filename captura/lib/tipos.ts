export type Plataforma = "uber" | "didi" | "indrive";

export const PLATAFORMAS: Plataforma[] = ["uber", "didi", "indrive"];

/** Como se escribe cada marca, que no es lo mismo que su id. */
export const NOMBRE_PLATAFORMA: Record<Plataforma, string> = {
  uber: "Uber",
  didi: "DiDi",
  indrive: "inDrive",
};

export const TIPO_VEHICULO: Record<Plataforma, string> = {
  uber: "UberX",
  didi: "DiDi Express",
  indrive: "inDrive económico",
};

export type Lugar = {
  id: string;
  nombre: string;
  lat: number;
  lon: number;
  verificado: boolean;
};

export type Ruta = {
  ruta_id: number;
  par_id: number;
  origen: Lugar;
  destino: Lugar;
  etiqueta: string;
};

/** Un momento = 2 o 3 plataformas cotizadas en la misma ruta en el mismo minuto = 2 o 3 filas. */
export type Momento = {
  id: string;
  timestamp: string;
  ruta_id: number;
  precios: Record<Plataforma, number | null>;
  capturado_por: string;
  sospechosa: boolean;
  nota: string;
  lat_disp: number | null;
  lon_disp: number | null;
  segundos_captura: number;
  sincronizado: boolean;
};

/** Con una sola app no hay nada que comparar: un registro necesita al menos estas. */
export const MINIMO_APPS = 2;

export function appsConPrecio(m: Pick<Momento, "precios">): number {
  return PLATAFORMAS.filter((p) => typeof m.precios?.[p] === "number").length;
}

export type Franja =
  | "madrugada"
  | "pico-am"
  | "medio-dia"
  | "tarde"
  | "pico-pm"
  | "noche";

// Motivos cerrados para reportar un problema al capturar.
export const MOTIVOS = [
  { id: "lugar_distinto", texto: "El lugar no coincidía" },
  { id: "app_inestable", texto: "La app falló o el precio cambió" },
  { id: "otro", texto: "Otro" },
] as const;

export type Motivo = (typeof MOTIVOS)[number]["id"];
