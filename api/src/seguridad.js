// Quién puede hacer qué. La app pública solo lee, busca, reporta problemas, manda precios y cuenta viajes;
// cambiar o borrar datos, y ver datos personales, pide la clave del equipo (CLAVE_ADMIN).

// Lo que cualquiera puede mandar desde la app.
const ESCRITURAS_PUBLICAS = [
  ["POST", /^\/api\/reportes\/?$/],
  ["POST", /^\/api\/reportes\/\d+\/foto\/?$/],
  ["POST", /^\/api\/precios-reportados\/?$/],
  ["POST", /^\/api\/camiones\/avisos\/?$/],
  ["POST", /^\/api\/notificaciones(\/cancelar)?\/?$/],
  ["POST", /^\/api\/viajes\/?$/],
];
// Lecturas con datos de personas: quién captura, por dónde se mueve y qué consulta.
const LECTURAS_PRIVADAS = [/^\/api\/usuarios/, /^\/api\/precios-reportados/, /^\/api\/consultas/];

export const esDelEquipo = (req) => Boolean(process.env.CLAVE_ADMIN) && req.get("X-Clave-Admin") === process.env.CLAVE_ADMIN;

export function permisos(req, res, next) {
  if (req.method === "OPTIONS" || esDelEquipo(req)) return next();
  const lectura = req.method === "GET" && !LECTURAS_PRIVADAS.some((r) => r.test(req.path));
  const publica = ESCRITURAS_PUBLICAS.some(([metodo, r]) => metodo === req.method && r.test(req.path));
  if (lectura || publica) return next();
  res.status(401).json({ error: "Esto solo lo puede hacer el equipo de Grieta" });
}

// Tope de envíos públicos por persona, para que nadie llene la base de reportes o precios falsos.
const VENTANA_MS = 60 * 60 * 1000;
const TOPE = Number(process.env.TOPE_ENVIOS_HORA ?? 30);
const envios = new Map();

export function limiteEnvios(req, res, next) {
  if (req.method !== "POST" || esDelEquipo(req)) return next();
  const quien = req.ip;
  const ahora = Date.now();
  const lista = (envios.get(quien) ?? []).filter((t) => ahora - t < VENTANA_MS);
  if (lista.length >= TOPE) return res.status(429).json({ error: "Mandaste muchos envíos seguidos. Intenta en un rato" });
  lista.push(ahora);
  envios.set(quien, lista);
  if (envios.size > 5000) envios.delete(envios.keys().next().value);
  next();
}

// Encabezados básicos: el navegador no adivina tipos de archivo y no se anuncia con qué está hecho el servidor.
export function encabezados(_req, res, next) {
  res.set("X-Content-Type-Options", "nosniff");
  res.set("Referrer-Policy", "no-referrer");
  res.set("X-Frame-Options", "DENY");
  next();
}
