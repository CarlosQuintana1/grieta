import { conCodigo, revisarRechazo } from "./acceso";

// Columnas de la tabla momentos, sin la ubicacion del telefono.
const COLUMNAS = [
  "id", "timestamp", "ruta_id", "precio_uber", "precio_didi", "precio_indrive",
  "capturado_por", "sospechosa", "nota", "segundos_captura", "recibido_en",
] as const;

function escapar(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Baja la tabla de D1 como CSV. Sin conexion devuelve false: no hay tabla que bajar. */
export async function descargarTabla(): Promise<boolean> {
  let filas: Record<string, unknown>[];
  try {
    const res = await fetch("/api/momentos", { cache: "no-store", headers: conCodigo() });
    if (revisarRechazo(res) || !res.ok) return false;
    filas = ((await res.json()) as { momentos: Record<string, unknown>[] }).momentos;
  } catch {
    return false;
  }

  const lineas = [
    COLUMNAS.join(","),
    ...filas.map((f) => COLUMNAS.map((c) => escapar(f[c])).join(",")),
  ];
  // El BOM hace que Excel en Windows lea bien los acentos.
  const blob = new Blob(["﻿" + lineas.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `momentos-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  return true;
}
