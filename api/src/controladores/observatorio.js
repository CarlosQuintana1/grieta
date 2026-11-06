import { Op } from "sequelize";
import { LlenoCamion, PrecioReportado, Queja, Reporte, VerificacionReporte, ViajeCamion } from "../modelos.js";

// Datos abiertos y agregados para la ciudad: solo conteos, nunca texto libre, personas ni recorridos.
const DIA = 86400000;
let cache = { en: 0, datos: null };
const contar = (filas, campo) => Object.entries(filas.reduce((m, f) => ({ ...m, [f[campo]]: (m[f[campo]] ?? 0) + 1 }), {}))
  .map(([clave, total]) => ({ clave, total })).sort((a, b) => b.total - a.total);

async function calcular() {
  const hace30 = new Date(Date.now() - 30 * DIA), hace56 = new Date(Date.now() - 56 * DIA);
  const [viajes, km, co2, quejas, reportes, votos, llenos, precios] = await Promise.all([
    ViajeCamion.count({ where: { demo: false } }), ViajeCamion.sum("km", { where: { demo: false } }), ViajeCamion.sum("co2_g", { where: { demo: false } }),
    Queja.findAll({ where: { createdAt: { [Op.gte]: hace30 } }, attributes: ["tipo", "ruta"], raw: true }),
    Reporte.findAll({ attributes: ["id", "tipo", "parada"], raw: true }),
    VerificacionReporte.findAll({ attributes: ["reporte_id", "sigue"], raw: true }),
    LlenoCamion.findAll({ where: { fecha: { [Op.gte]: hace56.toISOString().slice(0, 10) } }, attributes: ["linea", "hora"], raw: true }),
    PrecioReportado.findAll({ attributes: ["app"], raw: true }),
  ]);
  // Igual que en la app: un reporte se da por arreglado si al menos 2 lo dicen y son mayoria.
  const vigentes = reportes.filter((r) => {
    const suyos = votos.filter((v) => v.reporte_id === r.id), arreglado = suyos.filter((v) => !v.sigue).length;
    return !(arreglado >= 2 && arreglado > suyos.length - arreglado);
  });
  const porHora = Array.from({ length: 24 }, (_, h) => llenos.filter((l) => l.hora === h).length);
  return {
    actualizado: new Date().toISOString(),
    impacto: { viajes, km: Math.round((km ?? 0) * 10) / 10, co2_kg: Math.round((co2 ?? 0) / 100) / 10 },
    quejas: { dias: 30, total: quejas.length, porTipo: contar(quejas, "tipo"), porRuta: contar(quejas, "ruta").slice(0, 10) },
    accesibilidad: { vigentes: vigentes.length, porTipo: contar(vigentes, "tipo"), porParada: contar(vigentes.filter((r) => r.parada), "parada").slice(0, 8) },
    lleno: { dias: 56, total: llenos.length, porLinea: contar(llenos, "linea").slice(0, 10), porHora },
    precios: { total: precios.length, porApp: contar(precios, "app") },
  };
}

export const observatorio = async (_req, res) => {
  if (!cache.datos || Date.now() - cache.en > 5 * 60 * 1000) cache = { en: Date.now(), datos: await calcular() };
  res.json(cache.datos);
};
