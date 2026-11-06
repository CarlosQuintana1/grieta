import { ViajeCamion } from "../modelos.js";

// Lo que emitiria un auto nuevo en el mismo recorrido: meta de 135.7 g/km de la NOM-163-SEMARNAT-ENER-SCFI-2013.
const CO2_AUTO_G_KM = 135.7;
const viaje = (km, demo = false) => ViajeCamion.create({ km: Math.round(km * 10) / 10, co2_g: Math.round(km * CO2_AUTO_G_KM), demo });

export const impacto = {
  registrar: async (req, res) => {
    const km = Number(req.body?.km);
    if (!Number.isFinite(km)) return res.status(400).json({ error: "Falta la distancia del viaje" });
    await viaje(km);
    res.status(201).json({ ok: true });
  },
  total: async (_req, res) => {
    const [viajes, km, co2, demo] = await Promise.all([ViajeCamion.count(), ViajeCamion.sum("km"), ViajeCamion.sum("co2_g"), ViajeCamion.count({ where: { demo: true } })]);
    res.json({ viajes, km: Math.round((km ?? 0) * 10) / 10, co2_kg: Math.round((co2 ?? 0) / 100) / 10, demo });
  },
  // Solo el equipo: un viaje de demostracion para que el contador no arranque vacio, y quitarlos despues.
  demo: async (req, res) => {
    const km = Number(req.body?.km);
    if (!Number.isFinite(km)) return res.status(400).json({ error: "Falta la distancia del viaje" });
    await viaje(km, true);
    res.status(201).json({ ok: true });
  },
  quitarDemo: async (_req, res) => {
    res.json({ borrados: await ViajeCamion.destroy({ where: { demo: true } }) });
  },
};
