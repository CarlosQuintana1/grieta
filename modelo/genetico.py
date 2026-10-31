"""Ajusta con un algoritmo genetico los conjuntos y las reglas del sistema difuso de decision.py,
y lo compara contra el sistema hecho a mano con casos reales: lo que marcaba una app y lo que marco
la misma ruta unos minutos despues.

    python genetico.py                      # mide con dias que no vio y guarda el ajuste final
    python genetico.py --minuto 0.5 --tarde 3
"""

import argparse
import json
import pickle

import numpy as np
import pandas as pd

from camion import DIAS, Viaje, cargar_gtfs, metros
from decision import AHORRO_MINIMO, INF, REGLAS, decidir, esperado_para
from entrenar_modelo import MODELO, PLATAFORMAS, cargar
from tarifa import Tarifa

CASOS = MODELO / "cache" / "casos_genetico.pkl"
SALIDA = MODELO / "datos" / "decision_genetica.json"
ESPERA = (10, 90)
MARGENES = [5, 20, 45]
ACCIONES = ["pedir ya", "esperar", "camion"]
POBLACION, GENERACIONES, ELITE = 60, 120, 2
SEMILLA = 7

# Puntos de cada conjunto en el mismo orden que decision.py; los infinitos de las orillas no se mueven.
FORMAS = {
    "precio": [("barato", 2), ("normal", 3), ("caro", 3), ("muy caro", 2)],
    "margen": [("poco", 2), ("algo", 3), ("mucho", 2)],
    "camion": [("poco", 2), ("algo", 3), ("mucho", 2)],
}
RANGO = {"precio": (0.5, 2.0), "margen": (0.0, 90.0), "camion": (0.0, 90.0)}
A_MANO = {
    "precio": [0.85, 0.95, 0.85, 1.0, 1.15, 1.05, 1.25, 1.45, 1.3, 1.5],
    "margen": [5, 15, 5, 20, 40, 25, 45],
    "camion": [10, 20, 10, 25, 40, 30, 45],
}
ACCION_A_MANO = [ACCIONES.index(a) + 1 for _, a in REGLAS]
# Cuanto puede moverse cada punto desde el valor a mano, para que "caro" siga queriendo decir caro.
LIMITE = {"precio": 0.2, "margen": 15.0, "camion": 15.0}
libre = False


def construir_casos() -> pd.DataFrame:
    """Un caso por captura, app: precio ahora, precio en la siguiente captura de la ruta y opcion en camion."""
    df = cargar(MODELO / "datos" / "dataset.csv")
    gtfs = cargar_gtfs()
    m = df.groupby("momento_id").agg(ruta=("ruta_id", "first"), t=("t", "first"), dia=("dia", "first"),
                                     lat_o=("lat_o", "first"), lon_o=("lon_o", "first"),
                                     lat_d=("lat_d", "first"), lon_d=("lon_d", "first")).sort_values("t")
    precios = df.pivot_table(index="momento_id", columns="plataforma", values="precio_mxn", aggfunc="first")
    filas = []
    for dia, del_dia in m.groupby("dia"):
        # El precio esperado sale de un modelo que no vio ese dia.
        modelo = Tarifa(df[df["dia"] != dia])
        for _, g in del_dia.groupby("ruta"):
            g = g.sort_values("t")
            for i in range(len(g) - 1):
                a = g.iloc[i]
                despues = g.iloc[i + 1:]
                espera = (despues["t"] - a["t"]).dt.total_seconds() / 60
                ok = espera.between(*ESPERA)
                if not ok.any():
                    continue
                b_id, minutos_espera = espera[ok].index[0], float(espera[ok].iloc[0])
                viaje = Viaje(modelo, gtfs, a["t"].to_pydatetime(), a["t"].weekday())
                opciones = viaje.opciones(a["lat_o"], a["lon_o"], a["lat_d"], a["lon_d"])
                solo_app = opciones[opciones["opcion"].str.startswith("Solo app")]
                minutos_app = float(solo_app["minutos"].iloc[0]) if not solo_app.empty else \
                    float(viaje.app(a["lat_o"], a["lon_o"], a["lat_d"], a["lon_d"])["minutos"].iloc[0])
                con_camion = opciones[~opciones["opcion"].str.startswith("Solo app")]
                for app in PLATAFORMAS:
                    ahora, luego = precios.at[a.name, app], precios.at[b_id, app]
                    if pd.isna(ahora) or pd.isna(luego):
                        continue
                    esperado = esperado_para(viaje, app, a["lat_o"], a["lon_o"], a["lat_d"], a["lon_d"])["precio"]
                    # Igual que decision.py: solo cuenta un camion que ahorra al menos 30%.
                    sirve = con_camion[con_camion["costo"] <= ahora * (1 - AHORRO_MINIMO)]
                    mejor = sirve.nsmallest(1, "minutos")
                    filas.append({
                        "dia": dia, "app": app, "ahora": ahora, "luego": luego, "espera": minutos_espera,
                        "relacion": ahora / esperado,
                        "extra": float(mejor["minutos"].iloc[0] - minutos_app) if len(mejor) else INF,
                        "costo_camion": float(mejor["costo"].iloc[0]) if len(mejor) else np.nan,
                    })
        print(f"  {dia}: {len(filas)} casos", flush=True)
    return pd.DataFrame(filas)


def casos() -> pd.DataFrame:
    if CASOS.exists():
        return pd.read_pickle(CASOS)
    c = construir_casos()
    CASOS.parent.mkdir(exist_ok=True)
    c.to_pickle(CASOS)
    return c


def con_margenes(c: pd.DataFrame) -> pd.DataFrame:
    """Cada caso se repite con las tres prisas de la app: tengo prisa, normal y sin prisa."""
    return pd.concat([c.assign(margen=float(m)) for m in MARGENES], ignore_index=True)


def costos(c: pd.DataFrame, minuto: float, tarde: float) -> np.ndarray:
    """Lo que de verdad le habria costado a la persona cada consejo, en pesos: columnas pedir, esperar, camion."""
    pedir = c["ahora"].values
    esperar = c["luego"].values + tarde * np.maximum(0, c["espera"].values - c["margen"].values)
    extra = np.where(c["extra"].values >= INF, 0, c["extra"].values)
    camion = c["costo_camion"].values + minuto * np.maximum(0, extra) + tarde * np.maximum(0, extra - c["margen"].values)
    # Si no hay camion que sirva, el consejo de irse en camion termina en pedir la app.
    camion = np.where(np.isnan(camion), pedir, camion)
    return np.column_stack([pedir, esperar, camion])


# Sistema difuso vectorizado: el mismo calculo que decision.decidir, para miles de casos a la vez.
def trapecio(x, a, b, c, d):
    subida = np.where(b > a, (x - a) / np.where(b > a, b - a, 1), 1.0)
    bajada = np.where(d > c, (d - x) / np.where(d > c, d - c, 1), 1.0)
    return np.clip(np.minimum(subida, bajada), 0, 1)


def grados(genes: dict, x: dict) -> dict:
    g = {}
    for var, formas in FORMAS.items():
        p, i, v = genes[var], 0, x[var]
        for k, (nombre, n) in enumerate(formas):
            q = p[i:i + n]
            i += n
            if k == 0:
                g[(var, nombre)] = trapecio(v, -INF, -INF, q[0], q[1])
            elif k == len(formas) - 1:
                g[(var, nombre)] = trapecio(v, q[0], q[1], INF, INF)
            else:
                g[(var, nombre)] = trapecio(v, q[0], q[1], q[1], q[2])
    return g


def decidir_todos(genes: dict, acciones, x: dict) -> np.ndarray:
    g = grados(genes, x)
    fuerza = np.zeros((len(x["precio"]), 3))
    for (condiciones, _), accion in zip(REGLAS, acciones):
        if accion == 0:
            continue
        w = np.min([np.max([g[(v, c)] for c in cs], axis=0) for v, cs in condiciones.items()], axis=0)
        fuerza[:, accion - 1] = np.maximum(fuerza[:, accion - 1], w)
    # Empate o ninguna regla: gana la primera, pedir ya, igual que max() en decision.py.
    return np.argmax(fuerza, axis=1)


def entradas(c: pd.DataFrame) -> dict:
    return {"precio": c["relacion"].values, "margen": c["margen"].values, "camion": c["extra"].values}


# Individuo: los puntos de los conjuntos (reales) y la accion de cada regla (0 apagada, 1 a 3 una accion).
def reparar(genes: dict) -> dict:
    for var, formas in FORMAS.items():
        p, i = np.clip(genes[var], *RANGO[var]), 0
        if not libre:
            mano = np.array(A_MANO[var], dtype=float)
            p = np.clip(p, mano - LIMITE[var], mano + LIMITE[var])
        for _, n in formas:
            p[i:i + n] = np.sort(p[i:i + n])
            i += n
        genes[var] = p
    return genes


def al_azar(rng) -> tuple[dict, np.ndarray]:
    genes = {v: rng.uniform(*RANGO[v], size=len(A_MANO[v])) for v in FORMAS}
    return reparar(genes), rng.integers(0, 4, size=len(REGLAS))


def mutar(ind, rng, prob=0.15, prob_regla=0.05):
    genes, acciones = {v: p.copy() for v, p in ind[0].items()}, ind[1].copy()
    for v in genes:
        ancho = RANGO[v][1] - RANGO[v][0]
        cambia = rng.random(len(genes[v])) < prob
        genes[v][cambia] += rng.normal(0, 0.08 * ancho, cambia.sum())
    cambia = rng.random(len(acciones)) < prob_regla
    acciones[cambia] = rng.integers(0, 4, cambia.sum())
    return reparar(genes), acciones


def cruzar(a, b, rng, alfa=0.3):
    # Mezcla BLX: cada punto del hijo cae entre los de sus padres, con un poco de holgura.
    genes = {}
    for v in a[0]:
        lo, hi = np.minimum(a[0][v], b[0][v]), np.maximum(a[0][v], b[0][v])
        holgura = alfa * (hi - lo)
        genes[v] = rng.uniform(lo - holgura, hi + holgura)
    acciones = np.where(rng.random(len(a[1])) < 0.5, a[1], b[1])
    return reparar(genes), acciones


def evolucionar(c: pd.DataFrame, cst: np.ndarray, rng, verbose=False):
    x = entradas(c)
    filas = np.arange(len(c))
    aptitud = lambda ind: cst[filas, decidir_todos(ind[0], ind[1], x)].mean()
    mano = ({v: np.array(p, dtype=float) for v, p in A_MANO.items()}, np.array(ACCION_A_MANO))
    # La poblacion inicial lleva el sistema a mano y variaciones suyas, mas individuos al azar.
    poblacion = [mano] + [mutar(mano, rng, 0.4, 0.2) for _ in range(19)] + [al_azar(rng) for _ in range(POBLACION - 20)]
    notas = np.array([aptitud(i) for i in poblacion])
    for gen in range(GENERACIONES):
        orden = np.argsort(notas)
        nueva = [poblacion[i] for i in orden[:ELITE]]
        while len(nueva) < POBLACION:
            # Torneo de tres: de tres al azar, se queda el que cuesta menos.
            padres = [poblacion[min(rng.choice(POBLACION, 3, replace=False), key=lambda i: notas[i])] for _ in range(2)]
            nueva.append(mutar(cruzar(*padres, rng), rng))
        poblacion = nueva
        notas = np.array([aptitud(i) for i in poblacion])
        if verbose and gen % 20 == 0:
            print(f"    generacion {gen:3d}: ${notas.min():.2f} por caso")
    return poblacion[int(np.argmin(notas))]


def comprobar(c: pd.DataFrame):
    """El sistema vectorizado con los valores a mano tiene que decidir igual que decision.py."""
    mano = ({v: np.array(p, dtype=float) for v, p in A_MANO.items()}, np.array(ACCION_A_MANO))
    rapido = decidir_todos(mano[0], mano[1], entradas(c))
    lento = [ACCIONES.index(decidir(r.relacion, r.margen, r.extra)[0]) for r in c.itertuples()]
    distintas = int((rapido != np.array(lento)).sum())
    assert distintas == 0, f"{distintas} decisiones distintas a decision.py"


def describir(ind) -> dict:
    genes, acciones = ind
    conjuntos = {}
    for var, formas in FORMAS.items():
        i = 0
        for nombre, n in formas:
            conjuntos[f"{var}/{nombre}"] = [round(float(v), 3) for v in genes[var][i:i + n]]
            i += n
    reglas = [{"si": cond, "entonces": ACCIONES[a - 1] if a else "apagada"} for (cond, _), a in zip(REGLAS, acciones)]
    return {"conjuntos": conjuntos, "reglas": reglas}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--minuto", type=float, default=1.0, help="pesos que vale cada minuto de mas en el viaje")
    ap.add_argument("--tarde", type=float, default=5.0, help="pesos por cada minuto que se te hace tarde")
    ap.add_argument("--grupos", type=int, default=4, help="grupos de dias para medir con dias que no vio")
    ap.add_argument("--espera-max", type=float, default=30, help="minutos maximos hasta la siguiente captura")
    ap.add_argument("--sin-guardar", action="store_true")
    ap.add_argument("--libre", action="store_true", help="deja mover los conjuntos sin limite (pierden su significado)")
    args = ap.parse_args()
    global libre
    libre = args.libre

    base = casos()
    # Esperar en la app es revisar en unos minutos: los casos con la siguiente captura muy lejos no lo representan.
    base = base[base["espera"] <= args.espera_max].reset_index(drop=True)
    c = con_margenes(base)
    comprobar(c)
    cst = costos(c, args.minuto, args.tarde)
    print(f"{len(base)} casos reales ({base['dia'].nunique()} dias) x {len(MARGENES)} prisas = {len(c)}")
    print(f"Minuto de mas: ${args.minuto}; minuto tarde: ${args.tarde}; espera hasta {args.espera_max:.0f} min\n")

    rng = np.random.default_rng(SEMILLA)
    dias = np.array(sorted(c["dia"].unique()))
    rng.shuffle(dias)
    grupos = np.array_split(dias, args.grupos)
    mano = ({v: np.array(p, dtype=float) for v, p in A_MANO.items()}, np.array(ACCION_A_MANO))
    elegido = {"siempre pedir ya": np.zeros(len(c), int),
               "camion si hay": np.where(c["extra"].values < INF, 2, 0),
               "a mano": decidir_todos(*mano, entradas(c)),
               "genetico": np.full(len(c), -1)}
    for k, prueba in enumerate(grupos):
        en_prueba = c["dia"].isin(prueba).values
        print(f"  grupo {k + 1}: aprende con {(~en_prueba).sum()} casos, se califica con {en_prueba.sum()}")
        mejor = evolucionar(c[~en_prueba].reset_index(drop=True), cst[~en_prueba], rng)
        elegido["genetico"][en_prueba] = decidir_todos(*mejor, entradas(c[en_prueba]))

    filas = np.arange(len(c))
    oraculo = cst.min(axis=1)
    print("\nCosto promedio por viaje, calificado solo con dias que el genetico no vio:")
    for nombre, d in elegido.items():
        pagado = cst[filas, d]
        print(f"  {nombre:17s} ${pagado.mean():6.2f}   acierta la mejor accion {np.mean(pagado <= oraculo + 0.5):5.1%}   "
              f"pedir {np.mean(d == 0):4.0%} esperar {np.mean(d == 1):4.0%} camion {np.mean(d == 2):4.0%}")
    print(f"  {'lo mejor posible':17s} ${oraculo.mean():6.2f}")
    ahorro = cst[filas, elegido["a mano"]] - cst[filas, elegido["genetico"]]
    # Intervalo por remuestreo de dias completos, porque los casos de un mismo dia se parecen entre si.
    por_dia = pd.Series(ahorro).groupby(c["dia"].values).agg(["sum", "size"])
    sumas = []
    for _ in range(2000):
        m = por_dia.sample(len(por_dia), replace=True, random_state=int(rng.integers(10**9)))
        sumas.append(m["sum"].sum() / m["size"].sum())
    lo, hi = np.percentile(sumas, [2.5, 97.5])
    print(f"\nGenetico contra a mano: ahorra ${ahorro.mean():.2f} por viaje (95% entre ${lo:.2f} y ${hi:.2f})")

    if args.sin_guardar:
        return
    final = evolucionar(c, cst, rng)
    SALIDA.write_text(json.dumps({"minuto": args.minuto, "tarde": args.tarde, "espera_max": args.espera_max,
                                  "libre": libre, **describir(final)}, ensure_ascii=False, indent=1))
    print(f"Ajuste con todos los dias guardado en {SALIDA.relative_to(MODELO)}")


if __name__ == "__main__":
    main()
