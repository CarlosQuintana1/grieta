"""Opciones para llegar combinando Qrobus con una app: solo app, solo camion, app hasta la parada
o camion y app al final. Usa los horarios oficiales (GTFS) y el modelo de tarifa.

    python camion.py 20.7043 -100.4439 20.5931 -100.3926
    python camion.py 20.7043 -100.4439 20.5931 -100.3926 --hora 07:30 --dia sabado
"""

import argparse
import pathlib
from datetime import datetime

import h3
import numpy as np
import pandas as pd

from entrenar_modelo import MODELO, cargar
from tarifa import H3_RES, ZONA, Tarifa, franja_de

GTFS = MODELO / "datos" / "gtfs_qrobus"
CACHE = MODELO / "cache" / "qrobus.pkl"
PASAJE = 11.0
CAMINAR_MAX_M = 700
APP_MAX_KM = 5.0
VEL_CAMINAR = 4.5
VEL_APP = 28.0
RODEO = 1.3
ESPERA_APP = 5
VENTANA_MIN = 60
DIAS = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"]
COLUMNAS_DIA = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]


def a_minutos(t: pd.Series) -> pd.Series:
    # GTFS permite horas mayores a 24 para viajes que cruzan la medianoche.
    partes = t.str.split(":", expand=True).astype(int)
    return partes[0] * 60 + partes[1] + partes[2] / 60


def cargar_gtfs() -> dict:
    if CACHE.exists():
        return pd.read_pickle(CACHE)
    paradas = pd.read_csv(GTFS / "stops.txt", dtype={"stop_id": str})
    viajes = pd.read_csv(GTFS / "trips.txt", dtype={"trip_id": str, "route_id": str})
    rutas = pd.read_csv(GTFS / "routes.txt", dtype={"route_id": str, "route_short_name": str})
    horarios = pd.read_csv(GTFS / "stop_times.txt", dtype={"trip_id": str, "stop_id": str},
                           usecols=["trip_id", "arrival_time", "departure_time", "stop_id", "stop_sequence"])
    horarios["llega"] = a_minutos(horarios.pop("arrival_time")).astype("float32")
    horarios["sale"] = a_minutos(horarios.pop("departure_time")).astype("float32")
    calendario = pd.read_csv(GTFS / "calendar.txt")
    datos = {"paradas": paradas, "viajes": viajes, "rutas": rutas, "horarios": horarios, "calendario": calendario}
    CACHE.parent.mkdir(exist_ok=True)
    pd.to_pickle(datos, CACHE)
    return datos


def metros(lat, lon, lats, lons) -> np.ndarray:
    lat1, lon1, lat2, lon2 = map(np.radians, (lat, lon, lats, lons))
    a = np.sin((lat2 - lat1) / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin((lon2 - lon1) / 2) ** 2
    return 6371000 * 2 * np.arcsin(np.sqrt(a))


class Viaje:
    def __init__(self, modelo: Tarifa, gtfs: dict, cuando: datetime, dia: int):
        self.modelo, self.g, self.dia = modelo, gtfs, dia
        self.minuto = cuando.hour * 60 + cuando.minute
        self.franja, self.finde = franja_de(cuando.hour + cuando.minute / 60), float(dia >= 5)
        cal = gtfs["calendario"]
        servicios = set(cal.loc[cal[COLUMNAS_DIA[dia]] == 1, "service_id"])
        self.viajes_hoy = set(gtfs["viajes"].loc[gtfs["viajes"]["service_id"].isin(servicios), "trip_id"])

    def app(self, lat_o, lon_o, lat_d, lon_d) -> pd.DataFrame:
        """Precio de la app mas barata segun el modelo y minutos de viaje, para uno o varios tramos."""
        lat_o, lon_o, lat_d, lon_d = (np.atleast_1d(np.asarray(v, dtype=float)) for v in (lat_o, lon_o, lat_d, lon_d))
        lat_o, lon_o, lat_d, lon_d = np.broadcast_arrays(lat_o, lon_o, lat_d, lon_d)
        km = metros(lat_o, lon_o, lat_d, lon_d) / 1000 * RODEO
        tramos = pd.DataFrame({
            "tramo": np.arange(len(km)), "distancia_km": km, "duracion_libre_min": km / VEL_APP * 60,
            "h3_o": [h3.latlng_to_cell(a, b, H3_RES) for a, b in zip(lat_o, lon_o)],
            "h3_d": [h3.latlng_to_cell(a, b, H3_RES) for a, b in zip(lat_d, lon_d)],
            "franja": self.franja, "finde": self.finde,
        })
        d = pd.concat([tramos.assign(plataforma=p) for p in self.modelo.apps], ignore_index=True)
        d["precio"] = self.modelo.predecir(d)["precio"].values
        mejor = d.loc[d.groupby("tramo")["precio"].idxmin()].set_index("tramo")
        mejor["minutos"] = ESPERA_APP + mejor["duracion_libre_min"]
        return mejor[["precio", "minutos", "plataforma"]]

    def _tramo(self, lat, lon, hacia: bool) -> pd.DataFrame:
        """Paradas alcanzables desde un punto (o hacia el): caminando si estan cerca, en app si no tanto."""
        p = self.g["paradas"]
        m = metros(lat, lon, p["stop_lat"].values, p["stop_lon"].values)
        cerca = p[m <= APP_MAX_KM * 1000].assign(m=m[m <= APP_MAX_KM * 1000]).reset_index(drop=True)
        cerca["modo"] = np.where(cerca["m"] <= CAMINAR_MAX_M, "caminando", "app")
        cerca["costo"] = 0.0
        cerca["min"] = cerca["m"] * RODEO / 1000 / VEL_CAMINAR * 60
        en_app = cerca["modo"] == "app"
        if en_app.any():
            s = cerca[en_app]
            ida = (lat, lon, s["stop_lat"].values, s["stop_lon"].values)
            vuelta = (s["stop_lat"].values, s["stop_lon"].values, lat, lon)
            precios = self.app(*(ida if hacia else vuelta))
            cerca.loc[en_app, "costo"] = precios["precio"].values
            cerca.loc[en_app, "min"] = precios["minutos"].values
        return cerca

    def opciones(self, lat_o, lon_o, lat_d, lon_d) -> pd.DataFrame:
        directo = self.app(lat_o, lon_o, lat_d, lon_d).iloc[0]
        filas = [{"opcion": f"Solo app ({directo['plataforma']})", "costo": directo["precio"],
                  "minutos": directo["minutos"], "detalle": ""}]

        sube, baja = self._tramo(lat_o, lon_o, hacia=True), self._tramo(lat_d, lon_d, hacia=False)
        h = self.g["horarios"]
        h = h[h["trip_id"].isin(self.viajes_hoy)]
        salidas = h[h["stop_id"].isin(sube["stop_id"])].merge(sube[["stop_id", "modo", "costo", "min", "stop_name"]], on="stop_id")
        salidas = salidas[(salidas["sale"] >= self.minuto + salidas["min"]) & (salidas["sale"] <= self.minuto + VENTANA_MIN + salidas["min"])]
        llegadas = h[h["stop_id"].isin(baja["stop_id"])].merge(baja[["stop_id", "modo", "costo", "min", "stop_name"]], on="stop_id")
        tramos = salidas.merge(llegadas, on="trip_id", suffixes=("_s", "_b"))
        tramos = tramos[tramos["stop_sequence_b"] > tramos["stop_sequence_s"]]
        if not tramos.empty:
            tramos["costo"] = tramos["costo_s"] + PASAJE + tramos["costo_b"]
            tramos["minutos"] = tramos["llega_b"] + tramos["min_b"] - self.minuto
            tramos["tipo"] = tramos["modo_s"] + "+" + tramos["modo_b"]
            ruta = self.g["viajes"].set_index("trip_id")["route_id"]
            nombre = self.g["rutas"].set_index("route_id")["route_short_name"]
            tramos["linea"] = tramos["trip_id"].map(ruta).map(nombre)
            nombres = {"caminando+caminando": "Solo camion", "app+caminando": "App hasta la parada + camion",
                       "caminando+app": "Camion + app al final", "app+app": "App + camion + app"}
            # De cada combinacion se queda la que llega primero y la mas barata.
            for tipo, grupo in tramos.groupby("tipo"):
                for _, t in pd.concat([grupo.nsmallest(1, "minutos"), grupo.nsmallest(1, "costo")]).drop_duplicates("trip_id").iterrows():
                    filas.append({
                        "opcion": nombres[tipo], "costo": t["costo"], "minutos": t["minutos"],
                        "detalle": f"linea {t['linea']}: {t['stop_name_s']} ({hhmm(t['sale_s'])}) a {t['stop_name_b']}",
                    })
        res = pd.DataFrame(filas).drop_duplicates(["opcion", "detalle"])
        res["costo"], res["minutos"] = res["costo"].round(), res["minutos"].round()
        # Fuera las opciones que cuestan mas y tardan mas que alguna otra.
        dominada = [((res["costo"] <= r.costo) & (res["minutos"] <= r.minutos) &
                     ((res["costo"] < r.costo) | (res["minutos"] < r.minutos))).any() for r in res.itertuples()]
        return res[~np.array(dominada)].sort_values(["minutos", "costo"]).reset_index(drop=True)


def avisar_vigencia(gtfs: dict, cuando: datetime):
    fin = str(gtfs["calendario"]["end_date"].max())
    if cuando.strftime("%Y%m%d") > fin:
        print(f"Aviso: los horarios de Qrobus vencieron el {fin[:4]}-{fin[4:6]}-{fin[6:]}; hay que bajar los nuevos.\n")


def hhmm(minutos: float) -> str:
    m = int(round(minutos)) % (24 * 60)
    return f"{m // 60:02d}:{m % 60:02d}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("coords", nargs=4, type=float, help="lat_o lon_o lat_d lon_d")
    ap.add_argument("--hora", help="HH:MM; por defecto, ahorita")
    ap.add_argument("--dia", choices=DIAS, help="por defecto, hoy")
    args = ap.parse_args()

    ahora = datetime.now(ZONA)
    cuando = ahora.replace(hour=int(args.hora[:2]), minute=int(args.hora[3:])) if args.hora else ahora
    dia = DIAS.index(args.dia) if args.dia else ahora.weekday()
    modelo = Tarifa(cargar(MODELO / "datos" / "dataset.csv"))
    avisar_vigencia(cargar_gtfs(), cuando)
    print(Viaje(modelo, cargar_gtfs(), cuando, dia).opciones(*args.coords).to_string(index=False))


if __name__ == "__main__":
    main()
