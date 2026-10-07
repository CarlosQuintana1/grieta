import { conCodigo, revisarRechazo } from "./acceso";
import { marcarSincronizados, pendientesDeSync } from "./db";

/** Sube lo pendiente y devuelve cuantos momentos quedaron sincronizados. */
export async function sincronizar(): Promise<number> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return 0;
  const pendientes = await pendientesDeSync();
  if (pendientes.length === 0) return 0;

  try {
    const res = await fetch("/api/sync", {
      method: "POST",
      headers: conCodigo({ "Content-Type": "application/json" }),
      body: JSON.stringify({ momentos: pendientes }),
    });
    if (revisarRechazo(res) || !res.ok) return 0;
    const { guardados, descartados = [] } = (await res.json()) as {
      guardados: string[];
      descartados?: string[];
    };
    // Los rechazados tambien se marcan para no reintentarlos en cada sincronizacion.
    await marcarSincronizados([...guardados, ...descartados]);
    return guardados.length;
  } catch {
    // Sin red la captura sigue viviendo en IndexedDB. Se reintenta al guardar el siguiente.
    return 0;
  }
}
