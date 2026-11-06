import { SentirViaje, VALORES_SENTIR } from "../modelos.js";
import { ahoraEnQueretaro } from "./avisos.js";

// Una respuesta por linea del viaje; la hora y el dia salen del servidor, no del telefono.
export const sentir = {
  crear: async (req, res) => {
    const { linea, valor } = req.body ?? {};
    if (typeof linea !== "string" || !/^[A-Za-z0-9]{1,6}$/.test(linea) || !VALORES_SENTIR.includes(valor)) {
      return res.status(400).json({ error: "Falta la línea o cómo te fue" });
    }
    await SentirViaje.create({ linea: linea.toUpperCase(), valor, ...ahoraEnQueretaro() });
    res.status(201).json({ ok: true });
  },
};
