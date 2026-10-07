"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { RUTAS, LUGARES_SIN_VERIFICAR } from "@/lib/rutas";
import { momentosEquipo } from "@/lib/equipo";
import { EVENTO_RECHAZO, leerCodigo } from "@/lib/acceso";
import { descargarTabla } from "@/lib/csv";
import { esFinDeSemana, franjaDe, FRANJAS } from "@/lib/tiempo";
import { sincronizar } from "@/lib/sync";
import { MESES, PorDia } from "./por-dia";
import { NOMBRE_PLATAFORMA, PLATAFORMAS, type Momento } from "@/lib/tipos";

export default function Cobertura() {
  const [momentos, setMomentos] = useState<Momento[] | null>(null);
  const [soloLocal, setSoloLocal] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [sinTabla, setSinTabla] = useState(false);

  const recargar = async () => {
    const r = await momentosEquipo();
    setMomentos(r.momentos);
    setSoloLocal(r.soloLocal);
  };

  useEffect(() => {
    // Sin codigo valido esta pantalla no tiene nada que mostrar: se vuelve a la entrada.
    if (!leerCodigo()) {
      window.location.replace("/");
      return;
    }
    void recargar();
    const alRechazar = () => window.location.replace("/");
    window.addEventListener(EVENTO_RECHAZO, alRechazar);
    return () => window.removeEventListener(EVENTO_RECHAZO, alRechazar);
  }, []);

  const resumen = useMemo(() => {
    if (!momentos) return null;
    const pendientes = momentos.filter((m) => !m.sincronizado).length;

    const porApp = PLATAFORMAS.map((p) => ({
      id: p,
      nombre: NOMBRE_PLATAFORMA[p],
      n: momentos.filter((m) => m.precios[p] !== null).length,
    }));

    const porFranja = FRANJAS.map((f) => ({
      ...f,
      n: momentos.filter((m) => franjaDe(new Date(m.timestamp)) === f.id).length,
    }));
    const maxFranja = Math.max(1, ...porFranja.map((f) => f.n));

    const finde = momentos.filter((m) => esFinDeSemana(new Date(m.timestamp))).length;

    const porRuta = RUTAS.map((r) => ({
      ...r,
      n: momentos.filter((m) => m.ruta_id === r.ruta_id).length,
    })).sort((a, b) => a.n - b.n);

    const porPersona = Object.entries(
      momentos.reduce<Record<string, number>>((acc, m) => {
        acc[m.capturado_por] = (acc[m.capturado_por] ?? 0) + 1;
        return acc;
      }, {}),
    ).sort((a, b) => b[1] - a[1]);

    const primero = momentos.reduce<Date | null>((p, m) => {
      const d = new Date(m.timestamp);
      return !p || d < p ? d : p;
    }, null);

    return { pendientes, porApp, porFranja, maxFranja, finde, porRuta, porPersona, primero, vacias: porRuta.filter((r) => r.n === 0).length };
  }, [momentos]);

  if (!momentos || !resumen) return null;

  return (
    <main className="mx-auto w-full max-w-sm flex-1 px-6 pb-14 pt-8">
      <header className="mb-10">
        <div className="flex items-center justify-between text-[0.8rem] font-medium text-tenue">
          <span>Cobertura</span>
          <Link href="/" className="border border-ambar px-3.5 py-2 text-ambar transition-opacity active:opacity-70">
            Capturar
          </Link>
        </div>
        <p className="mt-4 text-4xl font-light tabular-nums tracking-tight">
          {momentos.length}
        </p>
        <p className="text-[0.78rem] text-tenue">
          registros del equipo
          {resumen.primero && ` desde el ${resumen.primero.getDate()} ${MESES[resumen.primero.getMonth()]}`}
        </p>
        {resumen.porPersona.length > 0 && (
          <dl className="mt-3 grid w-fit grid-cols-[auto_auto] gap-x-8 gap-y-1 text-[0.8rem]">
            {resumen.porPersona.map(([nombre, n]) => (
              <Fragment key={nombre}>
                <dt className="text-ambar">{nombre}</dt>
                <dd className="text-right tabular-nums text-tinta">{n}</dd>
              </Fragment>
            ))}
          </dl>
        )}
        {soloLocal && (
          <p className="mt-3 text-[0.78rem] text-ambar">
            Sin conexión: solo se ven los registros de este teléfono.
          </p>
        )}
      </header>

      <PorDia momentos={momentos} />

      <section className="mb-7">
        <h2 className="mb-4 text-[0.8rem] font-medium text-tinta">
          Por app
        </h2>
        <div className="flex flex-col gap-2.5">
          {resumen.porApp.map((a) => (
            <Barra key={a.id} etiqueta={a.nombre} n={a.n} max={Math.max(1, momentos.length)} alerta={a.n === 0} />
          ))}
        </div>
      </section>

      <section className="mb-7">
        <h2 className="mb-4 text-[0.8rem] font-medium text-tinta">
          Por franja
        </h2>
        <div className="flex flex-col gap-2.5">
          {resumen.porFranja.map((f) => (
            <Barra key={f.id} etiqueta={f.nombre} n={f.n} max={resumen.maxFranja} />
          ))}
        </div>
        {momentos.length >= 30 && resumen.porFranja.find((f) => f.id === "madrugada")!.n < 20 && (
          <p className="mt-4 text-xs leading-relaxed text-ambar">
            Falta madrugada. Sin ella el modelo no sabe nada de esa hora.
          </p>
        )}
      </section>

      <section className="mb-9 grid grid-cols-2 gap-6">
        <Dato titulo="Fin de semana" valor={`${resumen.finde}`} pie={`${momentos.length - resumen.finde} entre semana`} />
        <Dato titulo="Rutas sin tocar" valor={`${resumen.vacias}`} pie={`de ${RUTAS.length}`} />
      </section>

      <section className="mb-7">
        <h2 className="mb-4 text-[0.8rem] font-medium text-tinta">
          Rutas menos registradas
        </h2>
        <ul className="flex flex-col gap-2">
          {resumen.porRuta.slice(0, 8).map((r) => (
            <li key={r.ruta_id} className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate text-tenue">{r.etiqueta}</span>
              <span className={`text-xs tabular-nums ${r.n === 0 ? "text-alerta" : "text-tinta"}`}>{r.n}</span>
            </li>
          ))}
        </ul>
      </section>

      {LUGARES_SIN_VERIFICAR.length > 0 && (
        <p className="mb-5 text-xs leading-relaxed text-tenue">
          Sin coordenada verificada: {LUGARES_SIN_VERIFICAR.map((l) => l.nombre).join(", ")}. Los km
          de sus rutas se recalculan al corregirlas, también para los registros ya capturados.
        </p>
      )}

      <section className="flex flex-col gap-3">
        <button
          onClick={async () => setSinTabla(!(await descargarTabla()))}
          disabled={momentos.length === 0 || soloLocal}
          className="w-full border border-linea py-4 text-[0.85rem] text-tinta transition-opacity active:opacity-60 disabled:opacity-25"
        >
          Exportar CSV
        </button>
        {sinTabla && (
          <p className="text-[0.78rem] text-ambar">
            No se pudo bajar la tabla: se descarga de la base de datos y no hubo conexión.
          </p>
        )}
        <button
          onClick={async () => {
            setSincronizando(true);
            await sincronizar();
            await recargar();
            setSincronizando(false);
          }}
          disabled={resumen.pendientes === 0 || sincronizando}
          className="w-full border border-linea py-4 text-[0.85rem] text-tinta transition-opacity active:opacity-60 disabled:opacity-25"
        >
          {sincronizando ? "Subiendo…" : `Sincronizar ${resumen.pendientes} pendientes`}
        </button>
      </section>
    </main>
  );
}

function Barra({ etiqueta, n, max, alerta = false }: { etiqueta: string; n: number; max: number; alerta?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 shrink-0 text-xs text-tenue">{etiqueta}</span>
      <div className="h-px flex-1 bg-linea">
        <div className="h-px bg-ambar" style={{ width: `${(n / max) * 100}%` }} />
      </div>
      <span className={`w-6 shrink-0 text-right text-xs tabular-nums ${alerta ? "text-alerta" : ""}`}>{n}</span>
    </div>
  );
}

function Dato({ titulo, valor, pie }: { titulo: string; valor: string; pie: string }) {
  return (
    <div>
      <p className="text-[0.75rem] text-tenue">{titulo}</p>
      <p className="mt-1 text-2xl font-light tabular-nums">{valor}</p>
      <p className="text-xs text-tenue">{pie}</p>
    </div>
  );
}
