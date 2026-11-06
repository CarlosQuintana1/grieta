// Cuanto tarda el mismo viaje en auto con el trafico de ahorita, con Azure Maps.
// La llave vive solo en el servidor (AZURE_MAPS_KEY); sin ella la ruta responde 503 y la app no muestra el dato.

const DIEZ_MIN_MS = 10 * 60 * 1000;
// Tope bajo para no salir del uso gratuito; cada respuesta se guarda 10 minutos.
const TOPE_MES = Number(process.env.TOPE_RUTAS_MES ?? 1000);
const ZONA = { oeste: -100.65, sur: 20.4, este: -100.15, norte: 20.9 };
const enZona = (lat, lon) => lat >= ZONA.sur && lat <= ZONA.norte && lon >= ZONA.oeste && lon <= ZONA.este;

const cache = new Map();
const uso = { mes: "", n: 0 };

export async function auto(req, res) {
  const [olat, olon, dlat, dlon] = ["olat", "olon", "dlat", "dlon"].map((k) => Math.round(Number(req.query[k]) * 1000) / 1000);
  if (![olat, olon, dlat, dlon].every(Number.isFinite) || !enZona(olat, olon) || !enZona(dlat, dlon)) {
    return res.status(400).json({ error: "Faltan el origen o el destino en Querétaro" });
  }
  const llave = process.env.AZURE_MAPS_KEY;
  if (!llave) return res.status(503).json({ error: "Tráfico no configurado" });
  const clave = `${olat},${olon}|${dlat},${dlon}`;
  const guardado = cache.get(clave);
  if (guardado && Date.now() - guardado.t < DIEZ_MIN_MS) return res.json(guardado.ruta);

  const mes = new Date().toISOString().slice(0, 7);
  if (uso.mes !== mes) Object.assign(uso, { mes, n: 0 });
  if (uso.n >= TOPE_MES) return res.status(429).json({ error: "Se acabaron las consultas de tráfico del mes" });
  uso.n++;

  const url = new URL("https://atlas.microsoft.com/route/directions/json");
  url.search = new URLSearchParams({
    "api-version": "1.0", query: `${olat},${olon}:${dlat},${dlon}`, "subscription-key": llave,
    travelMode: "car", routeType: "fastest", traffic: "true",
  });
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return res.status(502).json({ error: "El servicio de tráfico no respondió" });
    const s = (await r.json()).routes?.[0]?.summary;
    if (!s) return res.status(502).json({ error: "No hubo ruta en auto" });
    const ruta = { minutos: Math.round(s.travelTimeInSeconds / 60), retraso: Math.round((s.trafficDelayInSeconds ?? 0) / 60), km: Math.round(s.lengthInMeters / 100) / 10 };
    if (cache.size > 1000) cache.delete(cache.keys().next().value);
    cache.set(clave, { t: Date.now(), ruta });
    res.json(ruta);
  } catch {
    res.status(502).json({ error: "El servicio de tráfico no respondió" });
  }
}
