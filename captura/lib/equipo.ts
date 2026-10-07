import { conCodigo, revisarRechazo } from "./acceso";
import { todos } from "./db";
import type { Momento } from "./tipos";

type Fila = {
  id: string;
  timestamp: string;
  ruta_id: number;
  precio_uber: number | null;
  precio_didi: number | null;
  precio_indrive: number | null;
  capturado_por: string;
  sospechosa: number;
  nota: string | null;
  segundos_captura: number | null;
};

// Registros de todo el equipo mas los de este telefono que aun no se suben.
export async function momentosEquipo(): Promise<{ momentos: Momento[]; soloLocal: boolean }> {
  const locales = await todos();
  try {
    const res = await fetch("/api/momentos", { cache: "no-store", headers: conCodigo() });
    if (revisarRechazo(res) || !res.ok) throw new Error(String(res.status));
    const { momentos } = (await res.json()) as { momentos: Fila[] };

    const delServidor: Momento[] = momentos.map((f) => ({
      id: f.id,
      timestamp: f.timestamp,
      ruta_id: f.ruta_id,
      precios: { uber: f.precio_uber, didi: f.precio_didi, indrive: f.precio_indrive },
      capturado_por: f.capturado_por,
      sospechosa: Boolean(f.sospechosa),
      nota: f.nota ?? "",
      lat_disp: null,
      lon_disp: null,
      segundos_captura: f.segundos_captura ?? 0,
      sincronizado: true,
    }));

    // Solo se suman los locales que no se han subido, para no contar nada dos veces.
    const enServidor = new Set(delServidor.map((m) => m.id));
    const pendientes = locales.filter((m) => !m.sincronizado && !enServidor.has(m.id));

    return {
      momentos: [...pendientes, ...delServidor].sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
      soloLocal: false,
    };
  } catch {
    return { momentos: locales, soloLocal: true };
  }
}
