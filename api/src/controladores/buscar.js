// Busca negocios y oficinas en Azure Maps: OpenStreetMap no conoce muchos de Querétaro.
// La llave vive solo en el servidor (AZURE_MAPS_KEY); sin ella la ruta responde 503 y la app sigue con Photon.

const QUERETARO = { lat: 20.6, lon: -100.4 };
const RADIO_M = 40000;
const DIA_MS = 24 * 60 * 60 * 1000;
// El plan gratuito trae 5,000 busquedas al mes: se corta antes para que nunca haya cobro.
const TOPE_MES = Number(process.env.TOPE_BUSQUEDAS_MES ?? 4500);

const cache = new Map();
const uso = { mes: "", n: 0 };

// La misma zona que usa la app con Photon: la ciudad y los municipios conurbados.
const ZONA = { oeste: -100.65, sur: 20.4, este: -100.15, norte: 20.9 };
const enZona = ({ lat, lon }) => lat >= ZONA.sur && lat <= ZONA.norte && lon >= ZONA.oeste && lon <= ZONA.este;
const redondear = (x) => Math.round(Number(x) * 100) / 100;

function aLugar(r) {
  const a = r.address ?? {};
  const nombre = r.poi?.name ?? a.streetName ?? a.freeformAddress;
  const detalle = [r.poi ? a.streetName : null, a.municipalitySubdivision ?? a.municipality].filter(Boolean).join(", ");
  return { nombre, detalle, lat: r.position.lat, lon: r.position.lon };
}

export async function buscar(req, res) {
  const llave = process.env.AZURE_MAPS_KEY;
  const q = String(req.query.q ?? "").trim();
  if (q.length < 3 || q.length > 80) return res.status(400).json({ error: "La búsqueda debe tener de 3 a 80 letras" });
  if (!llave) return res.status(503).json({ error: "Buscador no configurado" });

  const lat = Number.isFinite(Number(req.query.lat)) ? redondear(req.query.lat) : QUERETARO.lat;
  const lon = Number.isFinite(Number(req.query.lon)) ? redondear(req.query.lon) : QUERETARO.lon;
  const clave = `${q.toLowerCase()}|${lat}|${lon}`;
  const guardado = cache.get(clave);
  if (guardado && Date.now() - guardado.t < DIA_MS) return res.json(guardado.lugares);

  const mes = new Date().toISOString().slice(0, 7);
  if (uso.mes !== mes) Object.assign(uso, { mes, n: 0 });
  if (uso.n >= TOPE_MES) return res.status(429).json({ error: "Se acabaron las búsquedas del mes" });
  uso.n++;

  const url = new URL("https://atlas.microsoft.com/search/fuzzy/json");
  url.search = new URLSearchParams({
    "api-version": "1.0", query: q, "subscription-key": llave, countrySet: "MX",
    lat, lon, radius: RADIO_M, limit: 5, language: "es-419",
  });
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return res.status(502).json({ error: "El buscador no respondió" });
    const lugares = (await r.json()).results.map(aLugar).filter((l) => l.nombre && enZona(l));
    if (cache.size > 1000) cache.delete(cache.keys().next().value);
    cache.set(clave, { t: Date.now(), lugares });
    res.json(lugares);
  } catch {
    res.status(502).json({ error: "El buscador no respondió" });
  }
}
