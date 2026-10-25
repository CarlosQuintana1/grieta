import { appsConPrecio, MINIMO_APPS, type Momento } from "../lib/tipos";
import { ESPERA_MISMA_RUTA, finDeCaptura } from "../lib/tiempo";

type Env = { DB: D1Database; ASSETS: Fetcher; CODIGO_EQUIPO: string; EQUIPO: string };

const NO_AUTORIZADO = () =>
  Response.json({ error: "no autorizado" }, { status: 401, headers: { "Cache-Control": "no-store" } });

// Compara hashes con timingSafeEqual; sin secreto configurado rechaza todo.
async function codigoValido(req: Request, env: Env): Promise<boolean> {
  const dado = (req.headers.get("X-Codigo-Equipo") ?? "").trim().toLowerCase();
  const real = (env.CODIGO_EQUIPO ?? "").trim().toLowerCase();
  if (!dado || !real) return false;
  const cifrar = (t: string) => crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  const [a, b] = await Promise.all([cifrar(dado), cifrar(real)]);
  return crypto.subtle.timingSafeEqual(a, b);
}

const CREAR = `
  CREATE TABLE IF NOT EXISTS momentos (
    id               TEXT PRIMARY KEY,
    timestamp        TEXT    NOT NULL,
    ruta_id          INTEGER NOT NULL,
    precio_uber      REAL,
    precio_didi      REAL,
    precio_indrive   REAL,
    capturado_por    TEXT    NOT NULL,
    sospechosa       INTEGER NOT NULL DEFAULT 0,
    nota             TEXT,
    lat_disp         REAL,
    lon_disp         REAL,
    segundos_captura INTEGER,
    recibido_en      TEXT    NOT NULL DEFAULT (datetime('now'))
  )`;

async function sincronizar(req: Request, env: Env): Promise<Response> {
  const { momentos } = (await req.json()) as { momentos: Momento[] };
  if (!Array.isArray(momentos) || momentos.length === 0) {
    return Response.json({ guardados: [] });
  }

  await env.DB.prepare(CREAR).run();

  // El id lo genera el dispositivo, asi que reenviar el mismo momento no lo duplica.
  const insertar = env.DB.prepare(
    `INSERT INTO momentos (id, timestamp, ruta_id, precio_uber, precio_didi, precio_indrive,
       capturado_por, sospechosa, nota, lat_disp, lon_disp, segundos_captura)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)
     ON CONFLICT (id) DO NOTHING`,
  );

  // Las reglas de las tres apps y de la espera entre la misma ruta tambien se aplican en el servidor.
  const anterior = env.DB.prepare(
    `SELECT timestamp, segundos_captura FROM momentos
     WHERE capturado_por = ?1 AND ruta_id = ?2 AND id <> ?3 AND timestamp <= ?4
     ORDER BY timestamp DESC LIMIT 1`,
  );
  const validos: Momento[] = [];
  const descartados: string[] = [];
  for (const m of [...momentos].sort((a, b) => a.timestamp.localeCompare(b.timestamp))) {
    const previo =
      [...validos].reverse().find((v) => v.capturado_por === m.capturado_por && v.ruta_id === m.ruta_id) ??
      (await anterior.bind(m.capturado_por, m.ruta_id, m.id, m.timestamp).first<{ timestamp: string; segundos_captura: number }>());
    const muyPronto = previo && new Date(m.timestamp).getTime() - finDeCaptura(previo) < ESPERA_MISMA_RUTA * 1000;
    if (appsConPrecio(m) < MINIMO_APPS || muyPronto) descartados.push(m.id);
    else validos.push(m);
  }

  if (validos.length > 0) {
    await env.DB.batch(
      validos.map((m) =>
        insertar.bind(
          m.id, m.timestamp, m.ruta_id,
          m.precios.uber, m.precios.didi, m.precios.indrive,
          m.capturado_por, m.sospechosa ? 1 : 0, m.nota,
          m.lat_disp, m.lon_disp, m.segundos_captura,
        ),
      ),
    );
  }

  return Response.json({ guardados: validos.map((m) => m.id), descartados });
}

// Registros de todo el equipo, sin la ubicacion del telefono.
async function listar(env: Env): Promise<Response> {
  await env.DB.prepare(CREAR).run();
  const { results } = await env.DB.prepare(
    `SELECT id, timestamp, ruta_id, precio_uber, precio_didi, precio_indrive, capturado_por,
            sospechosa, nota, segundos_captura, recibido_en
     FROM momentos ORDER BY timestamp DESC`,
  ).all();
  return Response.json({ momentos: results }, { headers: { "Cache-Control": "no-store" } });
}

const worker = {
  async fetch(req: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(req.url);

    if (pathname.startsWith("/api/") && !(await codigoValido(req, env))) return NO_AUTORIZADO();

    // Con un codigo valido devuelve la lista de nombres del equipo.
    if (pathname === "/api/verificar") {
      const equipo = (env.EQUIPO ?? "").split(",").map((n) => n.trim()).filter(Boolean);
      return Response.json({ equipo }, { headers: { "Cache-Control": "no-store" } });
    }

    if (pathname === "/api/sync") {
      if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
      return sincronizar(req, env);
    }
    if (pathname === "/api/momentos") {
      if (req.method !== "GET") return new Response("Method Not Allowed", { status: 405 });
      return listar(env);
    }
    return env.ASSETS.fetch(req);
  },
};

export default worker;
