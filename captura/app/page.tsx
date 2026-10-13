"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { RUTAS } from "@/lib/rutas";
import { guardar } from "@/lib/db";
import { momentosEquipo } from "@/lib/equipo";
import { EVENTO_RECHAZO, guardarCodigo, leerCodigo, probarCodigo } from "@/lib/acceso";
import { esFinDeSemana, franjaDe, FRANJAS, LIMITE_SEGUNDOS, precioFueraDeRango } from "@/lib/tiempo";
import {
  appsConPrecio,
  MINIMO_APPS,
  MOTIVOS,
  NOMBRE_PLATAFORMA,
  PLATAFORMAS,
  TIPO_VEHICULO,
  type Momento,
  type Motivo,
  type Plataforma,
} from "@/lib/tipos";
import { sincronizar } from "@/lib/sync";

type Borrador = {
  inicio: string;
  ruta_id: number;
  precios: Record<Plataforma, string>;
  sospechosa: boolean;
  motivo?: Motivo | null;
  nota: string;
  lat: number | null;
  lon: number | null;
};

// En orden alfabetico para encontrar la ruta rapido; el id sigue siendo el del catalogo.
const RUTAS_ORDENADAS = [...RUTAS].sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, "es"));

const CLAVE_CAPTURADOR = "capturador";
const RUTAS_SUGERIDAS = 4;

// Desempata distinto para cada capturador, asi dos personas no reciben la misma ruta.
function desempate(nombre: string, ruta: number): number {
  let h = ruta;
  for (const c of nombre) h = (h * 31 + c.charCodeAt(0)) % 9973;
  return h;
}
const CLAVE_BORRADOR = "borrador";

export default function Captura() {
  const [capturador, setCapturador] = useState<string | null>(null);
  const [codigo, setCodigo] = useState<string | null>(null);
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [rutaSel, setRutaSel] = useState<number | null>(null);
  const [momentos, setMomentos] = useState<Momento[]>([]);
  const [ahora, setAhora] = useState(() => Date.now());
  const [listo, setListo] = useState(false);

  useEffect(() => {
    setCapturador(localStorage.getItem(CLAVE_CAPTURADOR));
    const c = leerCodigo();
    setCodigo(c);
    const b = localStorage.getItem(CLAVE_BORRADOR);
    if (b) {
      const parsed = JSON.parse(b) as Borrador;
      setBorrador(parsed);
      setRutaSel(parsed.ruta_id);
    }
    if (c) momentosEquipo().then((r) => setMomentos(r.momentos));
    setListo(true);

    const alRechazar = () => setCodigo(null);
    window.addEventListener(EVENTO_RECHAZO, alRechazar);
    return () => window.removeEventListener(EVENTO_RECHAZO, alRechazar);
  }, []);

  // Se calcula con Date.now() porque el intervalo se congela con la pagina en segundo plano.
  useEffect(() => {
    if (!borrador) return;
    const t = setInterval(() => setAhora(Date.now()), 500);
    const alVolver = () => setAhora(Date.now());
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [borrador]);

  const actualizar = useCallback((b: Borrador | null) => {
    setBorrador(b);
    if (b) localStorage.setItem(CLAVE_BORRADOR, JSON.stringify(b));
    else localStorage.removeItem(CLAVE_BORRADOR);
  }, []);

  const conteoPorRuta = useMemo(() => {
    const m = new Map<number, number>();
    for (const x of momentos) m.set(x.ruta_id, (m.get(x.ruta_id) ?? 0) + 1);
    return m;
  }, [momentos]);

  const franjaActual = franjaDe(new Date());
  const findeActual = esFinDeSemana(new Date());

  // Registros de cada ruta en esta franja y en el mismo tipo de dia (entre semana o fin de semana).
  const conteoAhora = useMemo(() => {
    const m = new Map<number, number>();
    for (const x of momentos) {
      const d = new Date(x.timestamp);
      if (franjaDe(d) !== franjaActual || esFinDeSemana(d) !== findeActual) continue;
      m.set(x.ruta_id, (m.get(x.ruta_id) ?? 0) + 1);
    }
    return m;
  }, [momentos, franjaActual, findeActual]);

  const sugeridas = useMemo(
    () =>
      [...RUTAS]
        .sort(
          (a, b) =>
            (conteoAhora.get(a.ruta_id) ?? 0) - (conteoAhora.get(b.ruta_id) ?? 0) ||
            (conteoPorRuta.get(a.ruta_id) ?? 0) - (conteoPorRuta.get(b.ruta_id) ?? 0) ||
            desempate(capturador ?? "", a.ruta_id) - desempate(capturador ?? "", b.ruta_id),
        )
        .slice(0, RUTAS_SUGERIDAS),
    [conteoAhora, conteoPorRuta, capturador],
  );
  const rutaElegida = rutaSel ?? sugeridas[0].ruta_id;

  function empezar() {
    const b: Borrador = {
      inicio: new Date().toISOString(),
      ruta_id: rutaElegida,
      precios: { uber: "", didi: "", indrive: "" },
      sospechosa: false,
      motivo: null,
      nota: "",
      lat: null,
      lon: null,
    };
    actualizar(b);
    setAhora(Date.now());
    navigator.geolocation?.getCurrentPosition(
      (p) =>
        actualizar({ ...b, lat: +p.coords.latitude.toFixed(6), lon: +p.coords.longitude.toFixed(6) }),
      () => {},
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
    );
  }

  async function guardarMomento() {
    if (!borrador || !capturador) return;
    const segundos = Math.round((Date.now() - new Date(borrador.inicio).getTime()) / 1000);
    const precios = Object.fromEntries(
      PLATAFORMAS.map((p) => [p, borrador.precios[p] === "" ? null : Number(borrador.precios[p])]),
    ) as Record<Plataforma, number | null>;
    if (appsConPrecio({ precios }) < MINIMO_APPS) return;

    const m: Momento = {
      id: crypto.randomUUID(),
      timestamp: borrador.inicio,
      ruta_id: borrador.ruta_id,
      precios,
      capturado_por: capturador,
      sospechosa: Boolean(borrador.motivo),
      // En la base se guarda el id del motivo, no el texto.
      nota: !borrador.motivo
        ? ""
        : borrador.motivo === "otro"
          ? `otro: ${borrador.nota.trim()}`
          : borrador.motivo,
      lat_disp: borrador.lat,
      lon_disp: borrador.lon,
      segundos_captura: segundos,
      sincronizado: false,
    };
    await guardar(m);
    actualizar(null);
    setRutaSel(null);
    setMomentos((await momentosEquipo()).momentos);
    void sincronizar().then(async (n) => {
      if (n > 0) setMomentos((await momentosEquipo()).momentos);
    });
  }

  if (!listo) return null;

  if (!capturador || !codigo) {
    return (
      <Entrar
        nombreInicial={capturador ?? ""}
        onEntrar={(n, c) => {
          localStorage.setItem(CLAVE_CAPTURADOR, n);
          guardarCodigo(c);
          setCapturador(n);
          setCodigo(leerCodigo());
          // Lo que se capturo mientras el codigo no servia sigue en el telefono: se sube ya.
          void sincronizar().then(async () => setMomentos((await momentosEquipo()).momentos));
        }}
      />
    );
  }

  const segundos = borrador ? Math.floor((ahora - new Date(borrador.inicio).getTime()) / 1000) : 0;
  const vencido = segundos > LIMITE_SEGUNDOS;
  const rutaActiva = borrador ? RUTAS.find((r) => r.ruta_id === borrador.ruta_id) : null;
  const capturados = PLATAFORMAS.filter((p) => borrador?.precios[p]).length;
  const faltaApp = capturados > 0 && capturados < MINIMO_APPS;
  const fueraDeRango = PLATAFORMAS.filter((p) => borrador && precioFueraDeRango(borrador.precios[p]));
  // Un precio absurdo se guarda, pero solo marcado: perder la fila es peor que revisarla.
  const exigeMarcar = fueraDeRango.length > 0 && !borrador?.motivo;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-10">
      <header className="mb-10 flex items-center justify-between text-[0.8rem] font-medium text-tenue">
        <span>{capturador}</span>
        <Link href="/cobertura" className="border border-ambar px-3.5 py-2 text-ambar transition-opacity active:opacity-70">
          {momentos.length} registros
        </Link>
      </header>

      {!borrador ? (
        <section className="flex flex-col gap-7">
          <div className="flex flex-col gap-3">
            <p className="text-[0.78rem] text-tenue">
              Faltan en {FRANJAS.find((f) => f.id === franjaActual)!.nombre.toLowerCase()}
              {findeActual ? " de fin de semana" : ""}
            </p>
            {sugeridas.map((r) => (
              <button
                key={r.ruta_id}
                onClick={() => setRutaSel(r.ruta_id)}
                aria-pressed={rutaElegida === r.ruta_id}
                className={`flex items-baseline justify-between gap-3 border px-3.5 py-3 text-left text-[0.85rem] leading-snug transition-colors ${
                  rutaElegida === r.ruta_id ? "border-ambar bg-ambar text-noche" : "border-ambar text-ambar"
                }`}
              >
                <span>{r.etiqueta}</span>
                <span className="tabular-nums">{conteoAhora.get(r.ruta_id) ?? 0}</span>
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-3">
            <select
              aria-label="Ruta"
              value={rutaElegida}
              onChange={(e) => setRutaSel(Number(e.target.value))}
              className="w-full border-b border-linea bg-transparent pb-3 pr-8 text-[0.95rem] leading-snug text-tinta"
            >
              {RUTAS_ORDENADAS.map((r) => (
                <option key={r.ruta_id} value={r.ruta_id} className="bg-noche">
                  {r.etiqueta} · {conteoAhora.get(r.ruta_id) ?? 0}
                </option>
              ))}
            </select>

          </div>

          <button
            onClick={empezar}
            className="w-full bg-ambar py-4 text-[0.95rem] font-semibold text-noche transition-opacity active:opacity-75"
          >
            Empezar
          </button>

          <p className="text-center text-xs leading-relaxed text-tenue">
            Precio básico sin promociones.
          </p>
        </section>
      ) : (
        <section className="flex flex-col gap-8">
          <div>
            <div className="flex items-baseline justify-between">
              <span
                className={`text-5xl font-light tabular-nums tracking-tight ${
                  vencido ? "text-alerta" : "text-tinta"
                }`}
              >
                {String(Math.floor(segundos / 60)).padStart(2, "0")}:
                {String(segundos % 60).padStart(2, "0")}
              </span>
              <span
                className={`text-[0.78rem] ${vencido ? "text-alerta" : "text-tenue"}`}
              >
                {vencido ? "vencido" : `${capturados} de 3`}
              </span>
            </div>
            <p className="mt-2 text-xs leading-snug text-tenue">{rutaActiva?.etiqueta}</p>
          </div>

          <p className="text-[0.8rem] leading-relaxed text-ambar">
            Precio sin descuentos ni cupones.
          </p>

          <div className="flex flex-col gap-6">
            {PLATAFORMAS.map((p) => (
              <div key={p}>
                <label
                  htmlFor={p}
                  className="flex items-baseline justify-between text-[0.78rem] text-tenue"
                >
                  <span className="font-medium text-tinta">{NOMBRE_PLATAFORMA[p]}</span>
                  <span>{TIPO_VEHICULO[p]}</span>
                </label>
                <div className="mt-1 flex items-baseline gap-2 border-b border-linea pb-2">
                  <span className="text-lg text-tenue">$</span>
                  <input
                    id={p}
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    placeholder="—"
                    value={borrador.precios[p]}
                    onChange={(e) =>
                      actualizar({
                        ...borrador,
                        precios: { ...borrador.precios, [p]: e.target.value },
                      })
                    }
                    className="w-full bg-transparent text-2xl font-light tabular-nums text-tinta outline-none placeholder:text-linea"
                  />
                </div>
              </div>
            ))}
            {faltaApp && (
              <p className="text-justify text-xs leading-relaxed text-alerta">
                Falta el precio de otra app: se necesitan al menos dos para guardar.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <button
              onClick={() =>
                actualizar({
                  ...borrador,
                  sospechosa: !borrador.sospechosa,
                  // Cerrar el panel descarta el motivo: si no se ve, no puede quedar guardado.
                  motivo: borrador.sospechosa ? null : borrador.motivo,
                })
              }
              aria-pressed={borrador.sospechosa}
              className={`self-start text-[0.78rem] transition-colors ${
                borrador.sospechosa ? "text-ambar" : "text-tenue"
              }`}
            >
              Hubo un problema
            </button>

            {borrador.sospechosa && (
              <div className="flex flex-wrap gap-2">
                {MOTIVOS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() =>
                      actualizar({ ...borrador, motivo: borrador.motivo === m.id ? null : m.id })
                    }
                    aria-pressed={borrador.motivo === m.id}
                    className={`border px-3 py-2 text-[0.78rem] transition-colors ${
                      borrador.motivo === m.id
                        ? "border-ambar text-ambar"
                        : "border-linea text-tenue"
                    }`}
                  >
                    {m.texto}
                  </button>
                ))}
              </div>
            )}

            {borrador.motivo === "otro" && (
              <input
                value={borrador.nota}
                onChange={(e) => actualizar({ ...borrador, nota: e.target.value })}
                placeholder="¿Qué pasó?"
                className="w-full border-b border-linea bg-transparent pb-2 text-sm text-tinta outline-none placeholder:text-tenue/60"
              />
            )}

            {fueraDeRango.length > 0 && (
              <p className="text-justify text-xs leading-relaxed text-ambar">
                Precio fuera de lo normal en {fueraDeRango.map((p) => NOMBRE_PLATAFORMA[p]).join(", ")}. Si fue dedazo, corrígelo;
                si de verdad marcaba eso, reporta el problema como «Otro».
              </p>
            )}
            {vencido && (
              <p className="text-justify text-xs leading-relaxed text-alerta">
                Pasaron los 3 minutos: las cotizaciones ya no son simultáneas. Descarta y vuelve a
                empezar.
              </p>
            )}
          </div>

          <div className="flex items-stretch gap-3">
            <button
              onClick={() => actualizar(null)}
              className="flex-1 border border-linea py-4 text-[0.85rem] text-tenue transition-opacity active:opacity-60"
            >
              Descartar
            </button>
            <button
              onClick={guardarMomento}
              disabled={capturados < MINIMO_APPS || vencido || exigeMarcar}
              className="flex-[2] bg-ambar py-4 text-[0.9rem] font-semibold text-noche transition-opacity active:opacity-75 disabled:opacity-25"
            >
              Guardar
            </button>
          </div>
        </section>
      )}
    </main>
  );
}

function Entrar({
  nombreInicial,
  onEntrar,
}: {
  nombreInicial: string;
  onEntrar: (nombre: string, codigo: string) => void;
}) {
  const [codigo, setCodigo] = useState("");
  const [equipo, setEquipo] = useState<string[] | null>(null);
  const [nombre, setNombre] = useState("");
  const [estado, setEstado] = useState<"" | "probando" | "incorrecto" | "sin_red">("");

  // Verifica el codigo al dejar de escribir; la lista de nombres solo llega con un codigo valido.
  useEffect(() => {
    setEquipo(null);
    setNombre("");
    if (!codigo.trim()) return;
    const t = setTimeout(async () => {
      const r = await probarCodigo(codigo);
      if (r.estado !== "ok") return;
      setEquipo(r.equipo);
      if (r.equipo.includes(nombreInicial)) setNombre(nombreInicial);
      setEstado("");
    }, 450);
    return () => clearTimeout(t);
  }, [codigo, nombreInicial]);

  async function entrar() {
    if (equipo && nombre) return onEntrar(nombre, codigo);
    if (!codigo.trim()) return;
    setEstado("probando");
    const r = await probarCodigo(codigo);
    if (r.estado === "ok") {
      setEquipo(r.equipo);
      if (r.equipo.includes(nombreInicial)) setNombre(nombreInicial);
      setEstado("");
    } else {
      setEstado(r.estado);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-7 px-6">
      <div>
        <p className="text-[0.8rem] font-medium text-tinta">¿Quién captura?</p>
        <p className="mt-2 text-sm leading-relaxed text-tenue">Tu nombre va en cada registro.</p>
      </div>
      <select
        aria-label="Tu nombre"
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        disabled={!equipo}
        className={`w-full border-b border-linea bg-transparent pb-3 pr-8 text-lg ${
          nombre ? "text-tinta" : "text-tenue/50"
        }`}
      >
        <option value="" disabled className="bg-noche">
          Tu nombre
        </option>
        {(equipo ?? []).map((n) => (
          <option key={n} value={n} className="bg-noche text-tinta">
            {n}
          </option>
        ))}
      </select>
      <div className="flex flex-col gap-2">
        <input
          value={codigo}
          onChange={(e) => {
            setCodigo(e.target.value);
            setEstado("");
          }}
          onKeyDown={(e) => e.key === "Enter" && void entrar()}
          placeholder="Código"
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          className="w-full border-b border-linea bg-transparent pb-3 text-lg text-tinta outline-none placeholder:text-ambar"
        />
        {!equipo && !estado && (
          <p className="text-[0.8rem] leading-relaxed text-tenue">
            Primero pon el <span className="text-ambar">código</span> para poder elegir tu nombre.
          </p>
        )}
        {estado === "incorrecto" && (
          <p className="text-[0.8rem] text-alerta">Ese código no es. Revísalo con tu equipo.</p>
        )}
        {estado === "sin_red" && (
          <p className="text-[0.8rem] text-alerta">Sin conexión. La primera vez hace falta internet.</p>
        )}
      </div>
      <button
        onClick={() => void entrar()}
        disabled={!codigo.trim() || estado === "probando" || (Boolean(equipo) && !nombre)}
        className="w-full bg-ambar py-4 text-[0.9rem] font-semibold text-noche disabled:opacity-25"
      >
        {estado === "probando" ? "Verificando…" : "Entrar"}
      </button>
    </main>
  );
}
