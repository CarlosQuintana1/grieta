"""Baja los registros capturados y arma el CSV con el que se entrena el modelo.

    python construir_dataset.py                     # baja de D1 con wrangler
    python construir_dataset.py --sin-clima         # sin llamar a Open-Meteo
    CODIGO_EQUIPO=... python construir_dataset.py   # por la API, sin cuenta de Cloudflare
"""

import argparse
import json
import os
import pathlib
import subprocess
import sys
import urllib.parse
import urllib.request
from datetime import datetime
from zoneinfo import ZoneInfo

import h3
import pandas as pd

MODELO = pathlib.Path(__file__).resolve().parent
CAPTURA = MODELO.parent / "captura"
DATOS = MODELO / "datos"
BASE_D1 = "tarifas-qro"
API = os.environ.get("TARIFAS_API", "https://tarifas-qro.carlosquintanara.workers.dev")
# Zona fija: las franjas se calculan en hora de Queretaro aunque corra en otro servidor.
ZONA = ZoneInfo("America/Mexico_City")
H3_RES = 7

# Lo capturado antes de esta hora usaba otros puntos de referencia: sale marcado como piloto.
INICIO_REFERENCIAS = "2026-09-24T02:03:03Z"
PLATAFORMAS = ["uber", "didi", "indrive"]
TIPO_VEHICULO = {"uber": "UberX", "didi": "DiDi Express", "indrive": "inDrive economico"}

# Dias inhabiles oficiales en Mexico. El precio se comporta como fin de semana en estos.
FESTIVOS_MX = {
    "2026-09-16", "2026-11-02", "2026-11-16", "2026-12-25",
    "2027-01-01", "2027-02-01", "2027-03-15",
}


def bajar_de_d1() -> list[dict]:
    salida = subprocess.run(
        ["npx", "wrangler", "d1", "execute", BASE_D1, "--remote", "--json",
         "--command", "SELECT * FROM momentos ORDER BY timestamp"],
        cwd=CAPTURA, capture_output=True, text=True, check=True,
    ).stdout
    inicio = salida.find("[")
    if inicio == -1:
        raise RuntimeError(f"wrangler no devolvio JSON:\n{salida}")
    return json.loads(salida[inicio:])[0]["results"]


def bajar_de_api(codigo: str) -> list[dict]:
    pedido = urllib.request.Request(f"{API}/api/momentos", headers={
        "X-Codigo-Equipo": codigo, "User-Agent": "construir-dataset"})
    with urllib.request.urlopen(pedido, timeout=60) as r:
        momentos = json.load(r)["momentos"]
    return sorted(momentos, key=lambda m: m["timestamp"])


def catalogo():
    lugares = {l["id"]: l for l in json.loads((CAPTURA / "data" / "lugares.json").read_text())["lugares"]}
    medidas = {r["ruta_id"]: r for r in json.loads((DATOS / "rutas_medidas.json").read_text())["rutas"]}
    return lugares, medidas


def clima(lugares: dict, pedidos: set[tuple[str, str]]) -> dict:
    """Temperatura y lluvia por (lugar, hora), en una sola llamada a Open-Meteo para todos."""
    if not pedidos:
        return {}
    ids = sorted({i for i, _ in pedidos})
    fechas = sorted({h[:10] for _, h in pedidos})
    url = "https://archive-api.open-meteo.com/v1/archive?" + urllib.parse.urlencode({
        "latitude": ",".join(str(lugares[i]["lat"]) for i in ids),
        "longitude": ",".join(str(lugares[i]["lon"]) for i in ids),
        "start_date": fechas[0], "end_date": fechas[-1],
        "hourly": "temperature_2m,precipitation", "timezone": "America/Mexico_City",
    })
    with urllib.request.urlopen(url, timeout=90) as r:
        respuesta = json.loads(r.read())
    # Con una sola coordenada Open-Meteo devuelve un objeto, no una lista.
    if isinstance(respuesta, dict):
        respuesta = [respuesta]
    tabla = {}
    for i, d in zip(ids, respuesta):
        h = d["hourly"]
        for t, temp, lluvia in zip(h["time"], h["temperature_2m"], h["precipitation"]):
            tabla[(i, t[:13])] = (temp, lluvia)
    return tabla


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sin-clima", action="store_true", help="no llamar a Open-Meteo")
    ap.add_argument("--salida", default=str(DATOS / "dataset.csv"))
    args = ap.parse_args()

    # Con CODIGO_EQUIPO baja por la API; sin el, de D1 con la cuenta de Cloudflare.
    codigo = os.environ.get("CODIGO_EQUIPO", "").strip()
    fuente = "la API" if codigo else "D1"
    momentos = bajar_de_api(codigo) if codigo else bajar_de_d1()
    if not momentos:
        print(f"{fuente} no tiene ningun momento capturado todavia.", file=sys.stderr)
        return
    print(f"{len(momentos)} momentos en {fuente}")

    # La misma ruta repetida por la misma persona en menos de 15 minutos dice lo mismo: cuenta una vez.
    ultima, unicos = {}, []
    for m in sorted(momentos, key=lambda m: m["timestamp"]):
        if m["sospechosa"]:
            unicos.append(m)
            continue
        t = datetime.fromisoformat(m["timestamp"].replace("Z", "+00:00"))
        clave = (m["capturado_por"], m["ruta_id"])
        if clave in ultima and (t - ultima[clave]).total_seconds() < 15 * 60:
            continue
        ultima[clave] = t
        unicos.append(m)
    if len(unicos) < len(momentos):
        print(f"  {len(momentos) - len(unicos)} repetidos de la misma ruta en menos de 15 min, se cuentan una vez")
    momentos = unicos

    lugares, medidas = catalogo()
    filas = []
    for m in momentos:
        ruta = medidas.get(m["ruta_id"])
        if ruta is None:
            print(f"  momento {m['id'][:8]}: ruta {m['ruta_id']} no esta en el catalogo, se salta",
                  file=sys.stderr)
            continue
        o, d = lugares[ruta["origen"]], lugares[ruta["destino"]]
        # El timestamp se guarda en UTC; las franjas horarias del proyecto son hora local.
        t = datetime.fromisoformat(m["timestamp"].replace("Z", "+00:00")).astimezone(ZONA)

        comun = {
            "momento_id": m["id"],
            "timestamp": t.isoformat(),
            "ruta_id": m["ruta_id"],
            "lat_o": o["lat"], "lon_o": o["lon"],
            "lat_d": d["lat"], "lon_d": d["lon"],
            "h3_o": h3.latlng_to_cell(o["lat"], o["lon"], H3_RES),
            "h3_d": h3.latlng_to_cell(d["lat"], d["lon"], H3_RES),
            "distancia_km": ruta["distancia_km"],
            "duracion_libre_min": ruta["duracion_libre_min"],
            "dia_semana": t.weekday(),
            "hora_decimal": round(t.hour + t.minute / 60, 3),
            "es_findesemana": t.weekday() >= 5,
            "es_festivo": t.strftime("%Y-%m-%d") in FESTIVOS_MX,
            "sospechosa": bool(m["sospechosa"]),
            "nota": m["nota"] or "",
            "fuente": "piloto" if m["timestamp"] < INICIO_REFERENCIAS else "app",
            "capturado_por": m["capturado_por"],
            "_hora_clave": t.strftime("%Y-%m-%dT%H"),
            "_origen": ruta["origen"],
        }
        for p in PLATAFORMAS:
            precio = m[f"precio_{p}"]
            if precio is None:
                continue  # vacio: nadie reviso esa app o no tenia servicio; no se inventa la fila
            filas.append({**comun, "id": f"{m['id']}-{p}", "plataforma": p,
                          "tipo_vehiculo": TIPO_VEHICULO[p], "precio_mxn": float(precio)})

    df = pd.DataFrame(filas)
    if df.empty:
        print("Ningun momento se pudo expandir a filas.", file=sys.stderr)
        return

    if args.sin_clima:
        df["temp_c"], df["lluvia_mm"] = pd.NA, pd.NA
    else:
        # Clima del lugar de origen, no uno para toda la ciudad.
        claves = list(zip(df["_origen"], df["_hora_clave"]))
        tabla = clima(lugares, set(claves))
        df["temp_c"] = [tabla.get(k, (None, None))[0] for k in claves]
        df["lluvia_mm"] = [tabla.get(k, (None, None))[1] for k in claves]
    df = df.drop(columns=["_hora_clave", "_origen"])

    # El factor se calcula despues, al calibrar la tarifa base de cada ruta y plataforma.
    df["factor"] = pd.NA

    orden = ["id", "momento_id", "timestamp", "plataforma", "tipo_vehiculo", "ruta_id",
             "lat_o", "lon_o", "lat_d", "lon_d", "h3_o", "h3_d",
             "distancia_km", "duracion_libre_min", "dia_semana", "hora_decimal",
             "es_findesemana", "es_festivo", "temp_c", "lluvia_mm",
             "precio_mxn", "factor", "sospechosa", "nota", "fuente", "capturado_por"]
    df = df[orden]

    salida = pathlib.Path(args.salida)
    df.to_csv(salida, index=False)
    print(f"{len(df)} filas -> {os.path.relpath(salida, MODELO)}")
    print(f"  celdas H3 distintas: {len(set(df['h3_o']) | set(df['h3_d']))}")
    print(f"  rutas con datos: {df['ruta_id'].nunique()} de {len(medidas)}")
    print(f"  filas de madrugada: {len(df[df['hora_decimal'] < 6])}")
    por_ruta = df.groupby(["ruta_id", "plataforma"]).size()
    print(f"  rutas-plataforma con 10+ capturas: {(por_ruta >= 10).sum()}  <- calibran la tarifa base")


if __name__ == "__main__":
    main()
