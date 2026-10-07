"""Calcula km y minutos sin trafico de cada ruta del catalogo con OSRM.

Escribe datos/rutas_medidas.json. El tiempo va sin trafico a proposito: el trafico es lo que
el modelo aprende de la hora y la zona.

    python rutas_osrm.py
"""

import json
import pathlib
import sys
import time
import urllib.error
import urllib.request

BASE = "https://router.project-osrm.org"
CATALOGO = pathlib.Path(__file__).resolve().parent.parent / "captura" / "data"
DATOS = pathlib.Path(__file__).resolve().parent / "datos"


def cargar():
    lugares = {l["id"]: l for l in json.loads((CATALOGO / "lugares.json").read_text())["lugares"]}
    pares = json.loads((CATALOGO / "rutas.json").read_text())["pares"]
    rutas = []
    for par in pares:
        a, b = lugares[par["a"]], lugares[par["b"]]
        rutas.append((par["id"] * 2 - 1, par["id"], a, b, par["escala"]))
        rutas.append((par["id"] * 2, par["id"], b, a, par["escala"]))
    return rutas


def medir(o, d):
    url = f"{BASE}/route/v1/driving/{o['lon']},{o['lat']};{d['lon']},{d['lat']}?overview=false"
    with urllib.request.urlopen(url, timeout=30) as r:
        datos = json.loads(r.read())
    if datos.get("code") != "Ok" or not datos.get("routes"):
        raise RuntimeError(datos.get("code", "sin respuesta"))
    ruta = datos["routes"][0]
    return round(ruta["distance"] / 1000, 3), round(ruta["duration"] / 60, 2)


def main():
    salida = []
    for ruta_id, par_id, o, d, escala in cargar():
        try:
            km, minutos = medir(o, d)
        except (urllib.error.URLError, RuntimeError) as e:
            print(f"  ruta {ruta_id}: fallo ({e})", file=sys.stderr)
            continue
        salida.append({
            "ruta_id": ruta_id,
            "par_id": par_id,
            "origen": o["id"],
            "destino": d["id"],
            "escala": escala,
            "distancia_km": km,
            "duracion_libre_min": minutos,
        })
        print(f"  {ruta_id:>2}  {o['id']:>11} -> {d['id']:<11} {km:>6.2f} km  {minutos:>5.1f} min")
        time.sleep(1)

    destino = DATOS / "rutas_medidas.json"
    destino.write_text(json.dumps({"rutas": salida}, indent=2, ensure_ascii=False) + "\n")
    print(f"\n{len(salida)} rutas medidas -> {destino.name}")


if __name__ == "__main__":
    main()
