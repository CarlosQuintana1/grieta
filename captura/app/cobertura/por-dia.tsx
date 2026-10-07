"use client";

import { useMemo, useState } from "react";
import type { Momento } from "@/lib/tipos";

const DIAS = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
export const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MESES_LARGOS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

// Dias en la hora del telefono, igual que las franjas: un registro de las 11 pm cuenta ese dia.
const diaDe = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const clave = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const sumarDias = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const diaSemana = (d: Date) => DIAS[(d.getDay() + 6) % 7];
const rotulo = (d: Date) => `${diaSemana(d)} ${d.getDate()} ${MESES[d.getMonth()]}`;

/** Tope limpio del eje: 12 registros se leen contra 20, no contra 12. */
function tope(n: number): number {
  const base = 10 ** Math.floor(Math.log10(n));
  return [1, 2, 5, 10].map((f) => f * base).find((v) => v >= n)!;
}

export function PorDia({ momentos }: { momentos: Momento[] }) {
  const [vista, setVista] = useState<"semana" | "mes">("semana");
  const [corrimiento, setCorrimiento] = useState(0);
  const [elegido, setElegido] = useState<string | null>(null);

  const { porDia, primero } = useMemo(() => {
    const porDia = new Map<string, Map<string, number>>();
    let primero: Date | null = null;
    for (const m of momentos) {
      const d = diaDe(new Date(m.timestamp));
      const personas = porDia.get(clave(d)) ?? new Map<string, number>();
      personas.set(m.capturado_por, (personas.get(m.capturado_por) ?? 0) + 1);
      porDia.set(clave(d), personas);
      if (!primero || d < primero) primero = d;
    }
    return { porDia, primero };
  }, [momentos]);

  if (!primero) return null;

  const hoy = diaDe(new Date());
  // La semana son los ultimos 7 dias, no lunes a domingo: un lunes no amanece con la grafica vacia.
  const inicio =
    vista === "semana"
      ? sumarDias(hoy, 7 * corrimiento - 6)
      : new Date(hoy.getFullYear(), hoy.getMonth() + corrimiento, 1);
  const dias = vista === "semana" ? 7 : new Date(inicio.getFullYear(), inicio.getMonth() + 1, 0).getDate();
  const fin = sumarDias(inicio, dias - 1);

  const columnas = Array.from({ length: dias }, (_, i) => {
    const d = sumarDias(inicio, i);
    const personas = porDia.get(clave(d));
    const n = personas ? [...personas.values()].reduce((a, b) => a + b, 0) : 0;
    return { d, k: clave(d), n, personas, futuro: d > hoy, antes: d < primero, esHoy: +d === +hoy };
  });
  const max = Math.max(...columnas.map((c) => c.n));
  const escala = tope(Math.max(1, max));
  const transcurridos = columnas.filter((c) => !c.futuro && !c.antes);
  const total = columnas.reduce((a, c) => a + c.n, 0);
  const conCaptura = transcurridos.filter((c) => c.n > 0).length;
  const sel = columnas.find((c) => c.k === elegido) ?? null;
  // Un solo numero a la vista: el del dia elegido o, si no hay, el del dia con mas registros.
  const conValor = sel ?? columnas.find((c) => c.n === max && max > 0) ?? null;

  const etiqueta =
    vista === "mes"
      ? `${MESES_LARGOS[inicio.getMonth()]} ${inicio.getFullYear()}`
      : inicio.getMonth() === fin.getMonth()
        ? `${inicio.getDate()} – ${fin.getDate()} ${MESES[fin.getMonth()]}`
        : `${inicio.getDate()} ${MESES[inicio.getMonth()]} – ${fin.getDate()} ${MESES[fin.getMonth()]}`;

  const mover = (paso: number) => {
    setCorrimiento(corrimiento + paso);
    setElegido(null);
  };

  return (
    <section className="mb-9">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[0.8rem] font-medium text-tinta">Por día</h2>
        <div role="group" aria-label="Ver por" className="flex text-[0.72rem]">
          {(["semana", "mes"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={vista === v}
              onClick={() => {
                setVista(v);
                setCorrimiento(0);
                setElegido(null);
              }}
              className={`border px-2.5 py-1.5 transition-colors ${v === "mes" ? "-ml-px" : ""} ${
                vista === v ? "relative border-ambar text-ambar" : "border-linea text-tenue"
              }`}
            >
              {v === "semana" ? "Semana" : "Mes"}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => mover(-1)}
          disabled={inicio <= primero}
          aria-label="Periodo anterior"
          className="px-2 py-1 text-lg leading-none text-tenue disabled:opacity-25"
        >
          ‹
        </button>
        <span className="text-[0.8rem] text-tinta">{etiqueta}</span>
        <button
          type="button"
          onClick={() => mover(1)}
          disabled={corrimiento >= 0}
          aria-label="Periodo siguiente"
          className="px-2 py-1 text-lg leading-none text-tenue disabled:opacity-25"
        >
          ›
        </button>
      </div>

      <div className="relative flex h-32 items-end border-b border-linea">
        <div className="absolute inset-x-0 top-0 border-t border-linea" aria-hidden />
        <span className="absolute right-0 top-0 -translate-y-full pb-0.5 text-[0.65rem] tabular-nums text-tenue" aria-hidden>
          {escala}
        </span>
        {columnas.map((c) => {
          const alto = (c.n / escala) * 100;
          return (
            <button
              key={c.k}
              type="button"
              disabled={c.futuro || c.antes}
              onClick={() => setElegido(c.k)}
              onPointerEnter={(e) => e.pointerType === "mouse" && !c.futuro && !c.antes && setElegido(c.k)}
              aria-label={`${rotulo(c.d)}: ${c.n} ${c.n === 1 ? "registro" : "registros"}`}
              aria-pressed={elegido === c.k}
              className="relative flex h-full flex-1 items-end justify-center px-px outline-none focus-visible:bg-linea/40 disabled:cursor-default"
            >
              {c.n > 0 && (
                <span
                  className={`block w-full max-w-6 rounded-t-[4px] bg-ambar transition-opacity ${
                    sel && sel.k !== c.k ? "opacity-35" : ""
                  }`}
                  style={{ height: `${alto}%` }}
                />
              )}
              {conValor?.k === c.k && c.n > 0 && (
                <span
                  className="absolute text-[0.65rem] font-medium tabular-nums text-tinta"
                  style={{ bottom: `calc(${alto}% + 3px)` }}
                >
                  {c.n}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-1.5 flex" aria-hidden>
        {columnas.map((c) => {
          const visible = vista === "semana" || c.esHoy || [1, 8, 15, 22, 29].includes(c.d.getDate());
          return (
            <span
              key={c.k}
              className={`flex-1 text-center text-[0.62rem] leading-tight tabular-nums ${
                c.esHoy ? "font-semibold text-tinta" : c.futuro || c.antes ? "text-linea" : "text-tenue"
              }`}
            >
              {visible &&
                (vista === "semana" ? (
                  <>
                    {diaSemana(c.d)}
                    <br />
                    {c.d.getDate()}
                  </>
                ) : (
                  c.d.getDate()
                ))}
            </span>
          );
        })}
      </div>

      <p className="mt-4 text-xs leading-relaxed text-tenue">
        {total} {total === 1 ? "registro" : "registros"} · {conCaptura} de {transcurridos.length}{" "}
        {transcurridos.length === 1 ? "día" : "días"} con captura
        {transcurridos.length > 0 &&
          ` · ${(total / transcurridos.length).toLocaleString("es-MX", { maximumFractionDigits: 1 })} al día`}
      </p>
      <p className="mt-1 min-h-[1.2rem] text-xs text-tinta" aria-live="polite">
        {sel && (
          <>
            {rotulo(sel.d)}: {sel.n} {sel.n === 1 ? "registro" : "registros"}
            {[...(sel.personas ?? [])].map(([p, n]) => (
              <span key={p}>
                {" · "}
                <span className="text-ambar">{p}</span> {n}
              </span>
            ))}
          </>
        )}
      </p>

      <table className="sr-only">
        <caption>Registros por día, {etiqueta}</caption>
        <tbody>
          {transcurridos.map((c) => (
            <tr key={c.k}>
              <th scope="row">{rotulo(c.d)}</th>
              <td>{c.n}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
