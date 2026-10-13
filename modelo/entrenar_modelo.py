"""Entrena el modelo (ruta, franja horaria y fin de semana) y lo mide dejando fuera dias completos.

    python entrenar_modelo.py                    # lee datos/dataset.csv
    python entrenar_modelo.py --entrada otro.csv
"""

import argparse
import pathlib

import numpy as np
import pandas as pd
from sklearn.linear_model import Ridge

MODELO = pathlib.Path(__file__).resolve().parent
PLATAFORMAS = ["uber", "didi", "indrive"]
CORTES = [0, 6, 9, 12, 15, 18, 21, 24]
VENTANA_INDICE = pd.Timedelta(minutes=45)
FRANJAS = ["0-6", "6-9", "9-12", "12-15", "15-18", "18-21", "21-24"]


def cargar(ruta: pathlib.Path) -> pd.DataFrame:
    df = pd.read_csv(ruta)
    df = df[~df["sospechosa"].astype(str).str.lower().eq("true")].copy()
    hora = pd.to_datetime(df["timestamp"], utc=True, format="ISO8601").dt.tz_convert("America/Mexico_City")
    df["dia"] = hora.dt.date
    df["t"] = hora
    df["franja"] = pd.cut(df["hora_decimal"], CORTES, right=False, labels=FRANJAS)
    df["finde"] = df["es_findesemana"].astype(str).str.lower().eq("true").astype(float)
    return df


def variables(df: pd.DataFrame) -> pd.DataFrame:
    return pd.concat([pd.get_dummies(df[["ruta_id", "franja"]].astype(str)).astype(float), df[["finde"]]], axis=1)


def predecir(df: pd.DataFrame) -> pd.Series:
    # Cada dia se predice con un modelo entrenado sin ese dia; si no, el error sale optimista.
    X = variables(df)
    pred = pd.Series(np.nan, index=df.index)
    for dia in df["dia"].unique():
        fuera = df["dia"] == dia
        for p in PLATAFORMAS:
            es_p = df["plataforma"] == p
            entrena, prueba = es_p & ~fuera, es_p & fuera
            if entrena.sum() < 5 or not prueba.any():
                continue
            # En logaritmo: la tarifa dinamica multiplica el precio, no le suma.
            modelo = Ridge(alpha=1.0).fit(X[entrena], np.log(df.loc[entrena, "precio_mxn"]))
            pred[prueba] = np.exp(modelo.predict(X[prueba]))
    return pred


def con_indice(df: pd.DataFrame, pred: pd.Series) -> pd.Series:
    # Mediana de la ruta en otros dias, ajustada por como salio la misma app en otras rutas en los ultimos 45 min.
    salida = pred.copy()
    for dia in df["dia"].unique():
        otros = df[df["dia"] != dia]
        mediana = otros.groupby(["ruta_id", "plataforma"])["precio_mxn"].median()
        hoy = df[df["dia"] == dia]
        relativo = hoy["precio_mxn"] / pd.Series(
            [mediana.get((r, p), np.nan) for r, p in zip(hoy["ruta_id"], hoy["plataforma"])], index=hoy.index)
        for i, fila in hoy.iterrows():
            base = mediana.get((fila["ruta_id"], fila["plataforma"]))
            recientes = relativo[(hoy["plataforma"] == fila["plataforma"]) & (hoy["ruta_id"] != fila["ruta_id"])
                                 & (hoy["t"] < fila["t"]) & (hoy["t"] >= fila["t"] - VENTANA_INDICE)].dropna()
            if base is not None and len(recientes):
                salida[i] = base * recientes.median()
    return salida


def cual_conviene(df: pd.DataFrame) -> tuple[int, int, int]:
    aciertos = siempre_didi = total = 0
    for _, m in df.dropna(subset=["pred"]).groupby("momento_id"):
        if len(m) < 2 or "didi" not in set(m["plataforma"]):
            continue
        real = m.loc[m["precio_mxn"].idxmin(), "plataforma"]
        aciertos += real == m.loc[m["pred"].idxmin(), "plataforma"]
        siempre_didi += real == "didi"
        total += 1
    return aciertos, siempre_didi, total


def regla_didi_caro(df: pd.DataFrame) -> dict[str, list[str]]:
    # "Caro" contra la mediana de DiDi en la misma ruta en OTROS dias, para no compararse consigo.
    didi = df[df["plataforma"] == "didi"]
    grupos: dict[str, list[str]] = {}
    for _, m in df.groupby("momento_id"):
        fila = m[m["plataforma"] == "didi"]
        if fila.empty or len(m) < 2:
            continue
        f = fila.iloc[0]
        otros = didi[(didi["ruta_id"] == f["ruta_id"]) & (didi["dia"] != f["dia"])]["precio_mxn"]
        if len(otros) < 2:
            continue
        r = f["precio_mxn"] / otros.median()
        grupo = "caro" if r > 1.15 else "barato" if r < 0.85 else "normal"
        grupos.setdefault(grupo, []).append(m.loc[m["precio_mxn"].idxmin(), "plataforma"])
    return grupos


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--entrada", default=str(MODELO / "datos" / "dataset.csv"))
    args = ap.parse_args()

    df = cargar(pathlib.Path(args.entrada))
    if df["dia"].nunique() < 2:
        print("Hace falta mas de un dia de capturas: el modelo se mide dejando fuera dias completos.")
        return
    df["pred_modelo"] = predecir(df)
    df["pred"] = con_indice(df, df["pred_modelo"])
    print(f"{df['momento_id'].nunique()} momentos en {df['dia'].nunique()} dias")

    print("\nError promedio del precio, dejando fuera cada dia (solo modelo / con indice de la ciudad):")
    for p in PLATAFORMAS:
        de_p = df[(df["plataforma"] == p) & df["pred"].notna()]
        if not de_p.empty:
            solo = (de_p["pred_modelo"] - de_p["precio_mxn"]).abs().mean()
            con = (de_p["pred"] - de_p["precio_mxn"]).abs().mean()
            print(f"  {p:8s} ${solo:.1f} / ${con:.1f}  ({len(de_p)} filas)")

    aciertos, siempre_didi, total = cual_conviene(df)
    if total:
        print(f"\nCual sale mas barata: el modelo acierta {aciertos} de {total} ({aciertos / total:.0%});"
              f" 'siempre DiDi' acierta {siempre_didi} ({siempre_didi / total:.0%})")

    print("\nSi DiDi sale caro (+15%), normal o barato (-15%) contra su mediana en esa ruta, gana:")
    for grupo, ganadoras in sorted(regla_didi_caro(df).items()):
        n = len(ganadoras)
        reparto = ", ".join(f"{p} {ganadoras.count(p) / n:.0%}" for p in PLATAFORMAS)
        print(f"  DiDi {grupo:7s} n={n:3d}  {reparto}")

    por_franja = df.drop_duplicates("momento_id")["franja"].value_counts().reindex(FRANJAS)
    print("\nMomentos por franja:", ", ".join(f"{f} {n}" for f, n in por_franja.items()))


if __name__ == "__main__":
    main()
