"""Estacionamientos publicos de OpenStreetMap junto a una parada de Qrobus, para "estaciona y sigue en camion".

Uso: python3 scripts/estacionamientos.py parkings.json
parkings.json sale de Overpass: amenity=parking en la zona metropolitana (ver docs/estacionamientos.md).
"""
import json
import math
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
CERCA_PARADA_M = 150
FUERA_CENTRO_M = 2500
CENTRO = (20.5928, -100.3911)


def metros(a, b):
    r = 6371000
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    dp, dl = p2 - p1, math.radians(b[1] - a[1])
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def main(archivo):
    qrobus = json.loads((RAIZ / "demo/datos/qrobus.json").read_text())
    con_camion = {i for p in qrobus["patrones"] for i in p["paradas"]}
    paradas = [(i, (la, lo), nombre) for i, (la, lo, nombre) in enumerate(qrobus["paradas"]) if i in con_camion]
    salida = []
    for e in json.loads(Path(archivo).read_text())["elements"]:
        t = e.get("tags", {})
        if t.get("access") not in (None, "yes", "public") or t.get("parking") == "street_side":
            continue
        punto = (e["lat"], e["lon"]) if "lat" in e else (e["center"]["lat"], e["center"]["lon"])
        if metros(punto, CENTRO) < FUERA_CENTRO_M:
            continue
        cerca = min(paradas, key=lambda p: metros(punto, p[1]))
        if metros(punto, cerca[1]) > CERCA_PARADA_M:
            continue
        salida.append({"nombre": t.get("name"), "lat": round(punto[0], 6), "lon": round(punto[1], 6), "parada": cerca[0], "osm": f"{e['type']}/{e['id']}"})
    destino = RAIZ / "demo/datos/estacionamientos.json"
    destino.write_text(json.dumps(salida, ensure_ascii=False, separators=(",", ":")))
    print(f"{len(salida)} estacionamientos junto a una parada, fuera del Centro -> {destino.relative_to(RAIZ)}")


if __name__ == "__main__":
    main(sys.argv[1])
