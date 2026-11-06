import { ViajeCamion } from "../modelos.js";

// Lo que emitiria un auto nuevo en el mismo recorrido: meta de 135.7 g/km de la NOM-163-SEMARNAT-ENER-SCFI-2013.
const CO2_AUTO_G_KM = 135.7;

export const impacto = {
  registrar: async (req, res) => {
    const km = Number(req.body?.km);
    if (!Number.isFinite(km)) return res.status(400).json({ error: "Falta la distancia del viaje" });
    await ViajeCamion.create({ km: Math.round(km * 10) / 10, co2_g: Math.round(km * CO2_AUTO_G_KM) });
    res.status(201).json({ ok: true });
  },
  total: async (_req, res) => {
    const [viajes, km, co2] = await Promise.all([ViajeCamion.count(), ViajeCamion.sum("km"), ViajeCamion.sum("co2_g")]);
    res.json({ viajes, km: Math.round((km ?? 0) * 10) / 10, co2_kg: Math.round((co2 ?? 0) / 100) / 10 });
  },
};
