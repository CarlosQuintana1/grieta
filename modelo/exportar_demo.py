"""Exporta el modelo de tarifa y los horarios de Qrobus a JSON para la demo web (../demo/datos/).

    python exportar_demo.py
"""

import json

import h3

from camion import PASAJE, cargar_gtfs
from entrenar_modelo import FRANJAS, MODELO, cargar
from tarifa import ANILLOS, H3_RES, Tarifa

SALIDA = MODELO.parent / "demo" / "datos"
# Colonias del catalogo: no se muestran como sugerencias.
SIN_SUGERIR = {"juriquilla", "jurica"}


def zonas(tabla) -> dict:
    # Se guarda el efecto ya suavizado de cada hexagono al que le llegan datos; los demas valen 0.
    celdas = set()
    for c in tabla.n:
        celdas.update(h3.grid_disk(c, ANILLOS))
    return {c: round(tabla(c), 4) for c in sorted(celdas) if abs(tabla(c)) > 1e-4}


def modelo() -> dict:
    df = cargar(MODELO / "datos" / "dataset.csv")
    t = Tarifa(df)
    apps = {}
    for p, (formula, tiempo, zo, zd, (bajo, alto)) in t.apps.items():
        coef = dict(zip([f"f_{f}" for f in FRANJAS] + ["finde"], tiempo.coef_))
        apps[p] = {
            "formula": [round(float(c), 4) for c in formula.coef],
            "intercepto": round(float(tiempo.intercept_), 4),
            "franjas": {f: round(float(coef[f"f_{f}"]), 4) for f in FRANJAS},
            "finde": round(float(coef["finde"]), 4),
            "origen": zonas(zo),
            "destino": zonas(zd),
            "rango": [round(float(bajo), 4), round(float(alto), 4)],
        }
    return {"h3_res": H3_RES, "franjas": FRANJAS, "apps": apps,
            "momentos": int(df["momento_id"].nunique()), "hasta": str(df["dia"].max())}


def qrobus() -> dict:
    g = cargar_gtfs()
    h = g["horarios"].sort_values(["trip_id", "stop_sequence"])
    paradas = g["paradas"].set_index("stop_id")
    viajes = g["viajes"].set_index("trip_id")
    nombre = g["rutas"].set_index("route_id")["route_short_name"]

    secuencia = h.groupby("trip_id")["stop_id"].agg(tuple)
    primera = h.groupby("trip_id")["sale"].first()
    h["desde_inicio"] = h["sale"] - h["trip_id"].map(primera)
    h["pos"] = h.groupby("trip_id").cumcount()

    usadas = sorted(set(h["stop_id"]))
    indice = {s: i for i, s in enumerate(usadas)}
    patrones = []
    for i, (paso, trips) in enumerate(secuencia.groupby(secuencia).groups.items()):
        trips = list(trips)
        # Un solo tiempo entre paradas por recorrido: la mediana de todos sus viajes.
        offs = h[h["trip_id"].isin(trips)].groupby("pos")["desde_inicio"].median().round(1)
        salidas = {}
        for tr in trips:
            salidas.setdefault(str(viajes.loc[tr, "service_id"]), []).append(round(float(primera[tr]), 1))
        patrones.append({
            "linea": str(nombre[viajes.loc[trips[0], "route_id"]]),
            "hacia": str(viajes.loc[trips, "trip_headsign"].mode().iloc[0]),
            "paradas": [indice[s] for s in paso],
            "minutos": [float(x) for x in offs.values],
            "salidas": {k: sorted(v) for k, v in salidas.items()},
        })
    cal = g["calendario"]
    dias = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
    return {
        "pasaje": PASAJE,
        "vigencia": str(cal["end_date"].max()),
        "servicio_por_dia": [str(cal.loc[cal[d] == 1, "service_id"].iloc[0]) for d in dias],
        "paradas": [[round(float(paradas.loc[s, "stop_lat"]), 6), round(float(paradas.loc[s, "stop_lon"]), 6),
                     str(paradas.loc[s, "stop_name"])] for s in usadas],
        "patrones": patrones,
    }


def lugares() -> list:
    catalogo = json.loads((MODELO.parent / "captura" / "data" / "lugares.json").read_text())["lugares"]
    return [{"nombre": l["nombre"], "lat": l["lat"], "lon": l["lon"]} for l in catalogo if l["id"] not in SIN_SUGERIR]


def main():
    SALIDA.mkdir(parents=True, exist_ok=True)
    for nombre, datos in (("modelo.json", modelo()), ("qrobus.json", qrobus()), ("lugares.json", lugares())):
        ruta = SALIDA / nombre
        ruta.write_text(json.dumps(datos, ensure_ascii=False, separators=(",", ":")))
        print(f"{ruta.relative_to(MODELO.parent)}: {ruta.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
