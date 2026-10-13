"""Precio de cualquier viaje de la ciudad: la tarifa de cada app por km y minuto, por un multiplicador
que depende de la zona de salida, la de llegada, la hora y el dia.

    python tarifa.py                                       # lo mide con rutas y lugares que no vio
    python tarifa.py 20.7043 -100.4439 20.5931 -100.3926   # cotiza un viaje ahorita
    python tarifa.py 20.7043 -100.4439 20.5931 -100.3926 --hora 18:30 --finde
"""

import argparse
import json
import pathlib
from datetime import datetime
from zoneinfo import ZoneInfo

import h3
import numpy as np
import pandas as pd
from scipy.optimize import linprog
from sklearn.linear_model import Ridge

from entrenar_modelo import CORTES, FRANJAS, MODELO, PLATAFORMAS, cargar

H3_RES = 7
ANILLOS = 3
PESO_ANILLO = 0.5
PREVIO = 10.0
CUANTIL = 0.2
ZONA = ZoneInfo("America/Mexico_City")


class Formula:
    """Base + km + minuto ajustada a un cuantil bajo, sin costos negativos."""

    def __init__(self, X: pd.DataFrame, y: pd.Series):
        A = np.column_stack([np.ones(len(X)), X.values])
        n, k = A.shape
        # Regresion por cuantil como programa lineal: errores por arriba y por abajo con distinto peso.
        costo = np.concatenate([np.zeros(k), np.full(n, CUANTIL), np.full(n, 1 - CUANTIL)])
        r = linprog(costo, A_eq=np.hstack([A, np.eye(n), -np.eye(n)]), b_eq=y.values,
                    bounds=[(0, None)] * (k + 2 * n), method="highs")
        self.coef = r.x[:k]

    def predict(self, X: pd.DataFrame) -> np.ndarray:
        return self.coef[0] + X.values @ self.coef[1:]


def franja_de(hora: float) -> str:
    return FRANJAS[np.searchsorted(CORTES[1:], hora, side="right")]


class Zonas:
    """Efecto de cada hexagono; uno con pocos datos lo toma de sus vecinos y, si no hay, del promedio."""

    def __init__(self, celdas: pd.Series, residuo: pd.Series):
        grupos = residuo.groupby(celdas.values)
        self.suma, self.n = grupos.sum().to_dict(), grupos.size().to_dict()
        self.cache = {}

    def __call__(self, celda: str) -> float:
        if celda not in self.cache:
            self.cache[celda] = self._efecto(celda)
        return self.cache[celda]

    def _efecto(self, celda: str) -> float:
        num = den = 0.0
        for vecina in h3.grid_disk(celda, ANILLOS):
            if vecina in self.n:
                w = PESO_ANILLO ** h3.grid_distance(celda, vecina)
                num += w * self.suma[vecina]
                den += w * self.n[vecina]
        return num / (PREVIO + den)


class Tarifa:
    def __init__(self, df: pd.DataFrame):
        self.apps = {}
        for p in PLATAFORMAS:
            d = df[df["plataforma"] == p]
            if len(d) < 30:
                continue
            # La tarifa sin dinamica sale de los precios bajos: base + km + minuto.
            formula = Formula(d[["distancia_km", "duracion_libre_min"]], d["precio_mxn"])
            y = np.log(d["precio_mxn"] / formula.predict(d[["distancia_km", "duracion_libre_min"]]))
            hora, origen, destino = self._hora(d), pd.Series(0.0, index=d.index), pd.Series(0.0, index=d.index)
            # Ajuste por turnos: hora y dia, luego la zona de salida y luego la de llegada.
            for _ in range(4):
                tiempo = Ridge(alpha=1.0).fit(hora, y - origen - destino)
                resto = y - tiempo.predict(hora)
                zo = Zonas(d["h3_o"], resto - destino)
                origen = d["h3_o"].map(zo)
                zd = Zonas(d["h3_d"], resto - origen)
                destino = d["h3_d"].map(zd)
            residuo = y - tiempo.predict(hora) - origen - destino
            self.apps[p] = (formula, tiempo, zo, zd, residuo.quantile([0.05, 0.95]).values)

    @staticmethod
    def _hora(d: pd.DataFrame) -> pd.DataFrame:
        X = pd.DataFrame({f"f_{f}": (d["franja"].astype(str) == f).astype(float) for f in FRANJAS}, index=d.index)
        X["finde"] = d["finde"]
        return X

    def predecir(self, d: pd.DataFrame) -> pd.DataFrame:
        """Precio esperado y rango del 90% por fila; d necesita km, minutos, celdas, franja, finde y plataforma."""
        salida = pd.DataFrame(np.nan, index=d.index, columns=["precio", "bajo", "alto"])
        for p, (formula, tiempo, zo, zd, (bajo, alto)) in self.apps.items():
            q = d[d["plataforma"] == p]
            if q.empty:
                continue
            base = formula.predict(q[["distancia_km", "duracion_libre_min"]])
            log_f = tiempo.predict(self._hora(q)) + q["h3_o"].map(zo).values + q["h3_d"].map(zd).values
            salida.loc[q.index, "precio"] = base * np.exp(log_f)
            salida.loc[q.index, "bajo"] = base * np.exp(log_f + bajo)
            salida.loc[q.index, "alto"] = base * np.exp(log_f + alto)
        return salida

    def formula(self, p: str) -> tuple[float, float, float]:
        return tuple(self.apps[p][0].coef)


def con_catalogo(df: pd.DataFrame) -> pd.DataFrame:
    rutas = {r["ruta_id"]: r for r in json.loads((MODELO / "datos" / "rutas_medidas.json").read_text())["rutas"]}
    return df.assign(par=df["ruta_id"].map(lambda r: rutas[r]["par_id"]),
                     origen=df["ruta_id"].map(lambda r: rutas[r]["origen"]),
                     destino=df["ruta_id"].map(lambda r: rutas[r]["destino"]))


def medir(df: pd.DataFrame):
    df = con_catalogo(df)
    pruebas = {
        "dia que no vio": [(df["dia"] != g, df["dia"] == g) for g in df["dia"].unique()],
        "ruta que no vio": [(df["par"] != g, df["par"] == g) for g in df["par"].unique()],
        "lugar que no vio": [(~((df["origen"] == g) | (df["destino"] == g)), (df["origen"] == g) | (df["destino"] == g))
                             for g in sorted(set(df["origen"]))],
    }
    print("Error promedio por app (con rango del 90%: que tanto cae el precio real dentro):")
    for nombre, cortes in pruebas.items():
        pred = pd.DataFrame(np.nan, index=df.index, columns=["precio", "bajo", "alto"])
        for entrena, prueba in cortes:
            pred.loc[prueba] = Tarifa(df[entrena]).predecir(df[prueba]).values
        partes = []
        for p in PLATAFORMAS:
            q = (df["plataforma"] == p) & pred["precio"].notna()
            err = (pred.loc[q, "precio"] - df.loc[q, "precio_mxn"]).abs()
            dentro = df.loc[q, "precio_mxn"].between(pred.loc[q, "bajo"], pred.loc[q, "alto"]).mean()
            partes.append(f"{p} ${err.mean():5.1f} ({100 * (err / df.loc[q, 'precio_mxn']).mean():2.0f}%, rango {dentro:.0%})")
        print(f"  {nombre:17s} " + "   ".join(partes))


def cotizar(modelo: Tarifa, lat_o, lon_o, lat_d, lon_d, cuando: datetime, finde: bool) -> pd.DataFrame:
    from rutas_osrm import medir as medir_osrm

    km, minutos = medir_osrm({"lat": lat_o, "lon": lon_o}, {"lat": lat_d, "lon": lon_d})
    hora = cuando.hour + cuando.minute / 60
    d = pd.DataFrame([{
        "plataforma": p, "distancia_km": km, "duracion_libre_min": minutos,
        "h3_o": h3.latlng_to_cell(lat_o, lon_o, H3_RES), "h3_d": h3.latlng_to_cell(lat_d, lon_d, H3_RES),
        "franja": franja_de(hora), "finde": float(finde),
    } for p in modelo.apps])
    return pd.concat([d[["plataforma", "distancia_km", "duracion_libre_min"]], modelo.predecir(d).round()], axis=1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("coords", nargs="*", type=float, help="lat_o lon_o lat_d lon_d")
    ap.add_argument("--entrada", default=str(MODELO / "datos" / "dataset.csv"))
    ap.add_argument("--hora", help="HH:MM; por defecto, ahorita")
    ap.add_argument("--finde", action="store_true")
    args = ap.parse_args()

    df = cargar(pathlib.Path(args.entrada))
    if not args.coords:
        modelo = Tarifa(df)
        for p in modelo.apps:
            base, km, minuto = modelo.formula(p)
            print(f"Tarifa sin dinamica de {p}: ${base:.1f} + ${km:.2f} por km + ${minuto:.2f} por minuto")
        print()
        medir(df)
        return

    ahora = datetime.now(ZONA)
    cuando = ahora.replace(hour=int(args.hora[:2]), minute=int(args.hora[3:])) if args.hora else ahora
    finde = args.finde or (not args.hora and ahora.weekday() >= 5)
    print(cotizar(Tarifa(df), *args.coords, cuando, finde).to_string(index=False))


if __name__ == "__main__":
    main()
