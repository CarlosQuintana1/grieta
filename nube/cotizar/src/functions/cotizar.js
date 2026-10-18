import { readFileSync } from "node:fs";
import { app } from "@azure/functions";
import { latLngToCell } from "h3-js";

// Parametros del modelo que exporta modelo/exportar_demo.py.
const modelo = JSON.parse(readFileSync(new URL("../../modelo.json", import.meta.url), "utf8"));
const CORTES = [0, 6, 9, 12, 15, 18, 21, 24];
const RODEO = 1.3;
const VEL_APP = 28;
const NOMBRES = { uber: "Uber", didi: "DiDi", indrive: "inDrive" };

function metros(lat1, lon1, lat2, lon2) {
  const r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 +
    Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(a));
}

// Dia de la semana (lunes = 0) y hora en Queretaro, para cuando no se mandan.
function ahoraEnQueretaro() {
  const partes = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Mexico_City", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date()).map((p) => [p.type, p.value]));
  const dias = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return { dia: dias.indexOf(partes.weekday), hora: Number(partes.hour) + Number(partes.minute) / 60 };
}

export function cotizar({ latO, lonO, latD, lonD, dia, hora, km }) {
  const distancia = km ?? (metros(latO, lonO, latD, lonD) / 1000) * RODEO;
  const minutos = (distancia / VEL_APP) * 60;
  const franja = modelo.franjas[CORTES.findIndex((c, i) => hora >= c && hora < CORTES[i + 1])];
  const celdaO = latLngToCell(latO, lonO, modelo.h3_res);
  const celdaD = latLngToCell(latD, lonD, modelo.h3_res);
  const apps = Object.entries(modelo.apps).map(([id, a]) => {
    const base = a.formula[0] + a.formula[1] * distancia + a.formula[2] * minutos;
    const log = a.intercepto + a.franjas[franja] + a.finde * (dia >= 5 ? 1 : 0) + (a.origen[celdaO] ?? 0) + (a.destino[celdaD] ?? 0);
    return {
      app: NOMBRES[id],
      precio: Math.round(base * Math.exp(log)),
      normal_entre: [Math.round(base * Math.exp(log + a.rango[0])), Math.round(base * Math.exp(log + a.rango[1]))],
    };
  }).sort((x, y) => x.precio - y.precio);
  return { km: Math.round(distancia * 10) / 10, franja, fin_de_semana: dia >= 5, apps, mas_barata: apps[0].app };
}

app.http("cotizar", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: async (request) => {
    const q = (n) => request.query.get(n);
    const [latO, lonO, latD, lonD] = ["lat_o", "lon_o", "lat_d", "lon_d"].map((n) => Number(q(n)));
    const cors = { "Access-Control-Allow-Origin": "*" };
    if (![latO, lonO, latD, lonD].every(Number.isFinite)) {
      return { status: 400, headers: cors, jsonBody: { error: "Faltan lat_o, lon_o, lat_d y lon_d" } };
    }
    const ahora = ahoraEnQueretaro();
    const [h, m] = (q("hora") ?? "").split(":").map(Number);
    const hora = Number.isFinite(h) ? h + (m || 0) / 60 : ahora.hora;
    const dia = q("dia") !== null && Number.isFinite(Number(q("dia"))) ? Number(q("dia")) : ahora.dia;
    const km = q("km") ? Number(q("km")) : undefined;
    return { headers: cors, jsonBody: cotizar({ latO, lonO, latD, lonD, dia, hora, km }) };
  },
});
