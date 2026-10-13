"""Decide entre pedir ya, esperar o irse en camion con logica difusa.

Entradas: que tan caro esta el precio que ve el usuario contra lo esperado, cuantos minutos le sobran
y cuantos minutos de mas tarda la mejor opcion con camion.

    python decision.py 20.7043 -100.4439 20.5931 -100.3926 --app didi --precio 180 --margen 30
    python decision.py 20.7043 -100.4439 20.5931 -100.3926 --app uber --precio 95 --margen 5 --hora 18:30
"""

import argparse
from datetime import datetime

import h3
import pandas as pd

from camion import DIAS, RODEO, VEL_APP, Viaje, avisar_vigencia, cargar_gtfs, metros
from entrenar_modelo import CORTES, MODELO, cargar
from tarifa import H3_RES, ZONA, Tarifa

INF = 1e9
AHORRO_MINIMO = 0.3


def trapecio(x: float, a: float, b: float, c: float, d: float) -> float:
    if x <= a or x >= d:
        return float(b <= x <= c)
    if x < b:
        return (x - a) / (b - a)
    if x <= c:
        return 1.0
    return (d - x) / (d - c)


def triangulo(x: float, a: float, b: float, c: float) -> float:
    return trapecio(x, a, b, b, c)


CONJUNTOS = {
    "precio": {
        "barato": lambda x: trapecio(x, -INF, -INF, 0.85, 0.95),
        "normal": lambda x: triangulo(x, 0.85, 1.0, 1.15),
        "caro": lambda x: triangulo(x, 1.05, 1.25, 1.45),
        "muy caro": lambda x: trapecio(x, 1.3, 1.5, INF, INF),
    },
    "margen": {
        "poco": lambda x: trapecio(x, -INF, -INF, 5, 15),
        "algo": lambda x: triangulo(x, 5, 20, 40),
        "mucho": lambda x: trapecio(x, 25, 45, INF, INF),
    },
    "camion": {
        "poco": lambda x: trapecio(x, -INF, -INF, 10, 20),
        "algo": lambda x: triangulo(x, 10, 25, 40),
        "mucho": lambda x: trapecio(x, 30, 45, INF, INF),
    },
}

# Cada regla: condiciones (variable, conjuntos que valen) unidas con Y, y la accion que sugiere.
REGLAS = [
    ({"precio": ["barato"]}, "pedir ya"),
    ({"precio": ["normal"], "margen": ["poco"]}, "pedir ya"),
    ({"precio": ["normal"], "camion": ["algo", "mucho"]}, "pedir ya"),
    ({"precio": ["caro", "muy caro"], "margen": ["poco"], "camion": ["algo", "mucho"]}, "pedir ya"),
    ({"precio": ["caro"], "margen": ["algo", "mucho"]}, "esperar"),
    ({"precio": ["muy caro"], "margen": ["algo", "mucho"], "camion": ["algo", "mucho"]}, "esperar"),
    ({"precio": ["caro", "muy caro"], "camion": ["poco"]}, "camion"),
    ({"precio": ["muy caro"], "margen": ["algo", "mucho"], "camion": ["algo"]}, "camion"),
    ({"precio": ["normal"], "margen": ["mucho"], "camion": ["poco"]}, "camion"),
]


def decidir(precio: float, margen: float, camion: float) -> tuple[str, dict, list]:
    entradas = {"precio": precio, "margen": margen, "camion": camion}
    grados = {v: {c: f(entradas[v]) for c, f in cs.items()} for v, cs in CONJUNTOS.items()}
    fuerza = {"pedir ya": 0.0, "esperar": 0.0, "camion": 0.0}
    activas = []
    for condiciones, accion in REGLAS:
        # Y = minimo; varios conjuntos en una misma variable = O = maximo.
        w = min(max(grados[v][c] for c in cs) for v, cs in condiciones.items())
        if w > 0:
            activas.append((w, condiciones, accion))
        fuerza[accion] = max(fuerza[accion], w)
    return max(fuerza, key=fuerza.get), fuerza, sorted(activas, key=lambda r: -r[0])


def describir(condiciones: dict) -> str:
    frases = {"precio": "el precio esta {}", "margen": "te sobra {} tiempo", "camion": "el camion tarda {} mas"}
    return " y ".join(frases[v].format(" o ".join(cs)) for v, cs in condiciones.items())


def esperado_para(viaje: Viaje, app: str, lat_o, lon_o, lat_d, lon_d) -> pd.Series:
    km = float(metros(lat_o, lon_o, lat_d, lon_d)) / 1000 * RODEO
    d = pd.DataFrame([{"plataforma": app, "distancia_km": km, "duracion_libre_min": km / VEL_APP * 60,
                       "h3_o": h3.latlng_to_cell(lat_o, lon_o, H3_RES), "h3_d": h3.latlng_to_cell(lat_d, lon_d, H3_RES),
                       "franja": viaje.franja, "finde": viaje.finde}])
    return viaje.modelo.predecir(d).iloc[0]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("coords", nargs=4, type=float, help="lat_o lon_o lat_d lon_d")
    ap.add_argument("--app", required=True, choices=["uber", "didi", "indrive"])
    ap.add_argument("--precio", required=True, type=float, help="lo que marca la app ahorita")
    ap.add_argument("--margen", required=True, type=float, help="minutos que te sobran antes de tener que salir")
    ap.add_argument("--hora", help="HH:MM; por defecto, ahorita")
    ap.add_argument("--dia", choices=DIAS, help="por defecto, hoy")
    args = ap.parse_args()

    ahora = datetime.now(ZONA)
    cuando = ahora.replace(hour=int(args.hora[:2]), minute=int(args.hora[3:])) if args.hora else ahora
    dia = DIAS.index(args.dia) if args.dia else ahora.weekday()
    modelo, gtfs = Tarifa(cargar(MODELO / "datos" / "dataset.csv")), cargar_gtfs()
    avisar_vigencia(gtfs, cuando)
    viaje = Viaje(modelo, gtfs, cuando, dia)
    lat_o, lon_o, lat_d, lon_d = args.coords

    esperado = esperado_para(viaje, args.app, lat_o, lon_o, lat_d, lon_d)
    # El modelo cambia por franja: solo vale la pena mirar la siguiente si empieza pronto.
    hora = cuando.hour + cuando.minute / 60
    inicio = next((c for c in CORTES if c > hora), 24)
    despues = None
    if inicio < 24 and (inicio - hora) * 60 <= 90:
        siguiente = cuando.replace(hour=inicio, minute=0)
        despues = (siguiente, esperado_para(Viaje(modelo, gtfs, siguiente, dia), args.app, lat_o, lon_o, lat_d, lon_d))

    opciones = viaje.opciones(lat_o, lon_o, lat_d, lon_d)
    solo_app = opciones[opciones["opcion"].str.startswith("Solo app")]
    minutos_app = float(solo_app["minutos"].iloc[0]) if not solo_app.empty else float(viaje.app(lat_o, lon_o, lat_d, lon_d)["minutos"].iloc[0])
    con_camion = opciones[~opciones["opcion"].str.startswith("Solo app") & (opciones["costo"] <= args.precio * (1 - AHORRO_MINIMO))]
    extra = float(con_camion["minutos"].min() - minutos_app) if not con_camion.empty else INF

    relacion = args.precio / esperado["precio"]
    accion, fuerza, activas = decidir(relacion, args.margen, extra)

    print(f"{args.app}: marca ${args.precio:.0f}; lo esperado a esta hora es ${esperado['precio']:.0f} "
          f"(normal entre ${esperado['bajo']:.0f} y ${esperado['alto']:.0f}), {relacion:.2f} veces lo esperado")
    if despues:
        print(f"Desde las {despues[0]:%H:%M} se espera ${despues[1]['precio']:.0f}")
    if not con_camion.empty:
        mejor = con_camion.nsmallest(1, "minutos").iloc[0]
        print(f"Mejor opcion con camion: {mejor['opcion']}, ${mejor['costo']:.0f} y {mejor['minutos']:.0f} min "
              f"({extra:+.0f} min contra la app). {mejor['detalle']}")
    else:
        print("No hay opcion con camion que ahorre al menos 30%")
    print(f"\nDecision: {accion.upper()}  (" + ", ".join(f"{k} {v:.2f}" for k, v in fuerza.items()) + ")")
    for w, condiciones, a in activas[:3]:
        print(f"  {w:.2f}  si {describir(condiciones)} -> {a}")


if __name__ == "__main__":
    main()
