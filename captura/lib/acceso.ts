const CLAVE = "codigo_equipo";
export const EVENTO_RECHAZO = "codigo-rechazado";

export function leerCodigo(): string | null {
  return localStorage.getItem(CLAVE);
}

export function guardarCodigo(codigo: string): void {
  localStorage.setItem(CLAVE, codigo.trim().toLowerCase());
}

/** Cabeceras para cualquier llamada a la base. */
export function conCodigo(extra: Record<string, string> = {}): Record<string, string> {
  const codigo = leerCodigo();
  return codigo ? { ...extra, "X-Codigo-Equipo": codigo } : extra;
}

// Si la base rechaza el codigo se borra y se vuelve a pedir; lo capturado sigue en el telefono.
export function revisarRechazo(res: Response): boolean {
  if (res.status !== 401) return false;
  localStorage.removeItem(CLAVE);
  window.dispatchEvent(new Event(EVENTO_RECHAZO));
  return true;
}

/** Prueba un codigo contra la base y, si sirve, trae quienes capturan. */
export async function probarCodigo(
  codigo: string,
): Promise<{ estado: "ok"; equipo: string[] } | { estado: "incorrecto" | "sin_red" }> {
  try {
    const res = await fetch("/api/verificar", {
      cache: "no-store",
      headers: { "X-Codigo-Equipo": codigo.trim().toLowerCase() },
    });
    if (res.status === 401) return { estado: "incorrecto" };
    if (!res.ok) return { estado: "sin_red" };
    const { equipo } = (await res.json()) as { equipo: string[] };
    return { estado: "ok", equipo };
  } catch {
    return { estado: "sin_red" };
  }
}
