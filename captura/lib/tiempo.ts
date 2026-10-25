import type { Franja } from "./tipos";

export const FRANJAS: { id: Franja; nombre: string; desde: number; hasta: number }[] = [
  { id: "madrugada", nombre: "Madrugada", desde: 0, hasta: 6 },
  { id: "pico-am", nombre: "Pico AM", desde: 6, hasta: 10 },
  { id: "medio-dia", nombre: "Medio día", desde: 10, hasta: 14 },
  { id: "tarde", nombre: "Tarde", desde: 14, hasta: 17 },
  { id: "pico-pm", nombre: "Pico PM", desde: 17, hasta: 21 },
  { id: "noche", nombre: "Noche", desde: 21, hasta: 24 },
];

export function franjaDe(d: Date): Franja {
  const h = d.getHours();
  return FRANJAS.find((f) => h >= f.desde && h < f.hasta)!.id;
}

export function esFinDeSemana(d: Date): boolean {
  const dia = d.getDay();
  return dia === 0 || dia === 6;
}

/** Las apps se cotizan casi al mismo tiempo: pasados 3 minutos el registro se descarta. */
export const LIMITE_SEGUNDOS = 180;

/** La misma ruta no se puede volver a capturar hasta que pase este tiempo desde la anterior. */
export const ESPERA_MISMA_RUTA = 120;

export function finDeCaptura(m: { timestamp: string; segundos_captura: number }): number {
  return new Date(m.timestamp).getTime() + (m.segundos_captura ?? 0) * 1000;
}

// Rango normal de una cotizacion; fuera de el se pide marcar el registro, no se bloquea.
const PRECIO_MIN = 25;
const PRECIO_MAX = 1500;

export function precioFueraDeRango(v: string): boolean {
  if (v === "") return false;
  const n = Number(v);
  return !Number.isFinite(n) || n < PRECIO_MIN || n > PRECIO_MAX;
}
