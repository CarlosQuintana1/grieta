"""Propone coordenadas para cada lugar con Nominatim, el geocodificador de OSM.

Solo imprime candidatos y a que distancia caen del punto actual; no escribe lugares.json.

    python geocodificar.py
"""

import json
import math
import pathlib
import sys
import time
import urllib.parse
import urllib.request

DATOS = pathlib.Path(__file__).resolve().parent.parent / "captura" / "data"
AGENTE = "grieta/1.0 (proyecto escolar)"
# Zona metropolitana de Queretaro: izquierda,arriba,derecha,abajo
VIEWBOX = "-100.60,20.82,-100.15,20.45"

CONSULTAS = {
    "fi-uaq": ["Universidad Autonoma de Queretaro Campus Juriquilla",
               "Facultad de Informatica UAQ Juriquilla"],
    "juriquilla": ["Juriquilla, Queretaro"],
    "antea": ["Antea Lifestyle Center", "Antea, Queretaro"],
    "jurica": ["Jurica, Santiago de Queretaro"],
    "centro": ["Jardin Zenea, Santiago de Queretaro"],
    "taq": ["Terminal de Autobuses de Queretaro"],
    "centro-sur": ["Centro Sur, Santiago de Queretaro"],
    "milenio": ["Milenio III, Santiago de Queretaro"],
    "pueblito": ["El Pueblito, Corregidora"],
    "casablanca": ["Lomas de Casa Blanca, Santiago de Queretaro"],
    "refugio": ["El Refugio, Santiago de Queretaro"],
    "zibata": ["Zibata, El Marques"],
    "aiq": ["Aeropuerto Intercontinental de Queretaro"],
    "carrillo": ["Carrillo, Santiago de Queretaro"],
    "tec": ["Tecnologico de Monterrey Campus Queretaro"],
}


def km_entre(lat1, lon1, lat2, lon2):
    r = 6371
    dlat, dlon = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    h = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2)
    return 2 * r * math.asin(math.sqrt(h))


def buscar(consulta):
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(
        {"q": consulta, "format": "json", "limit": 3, "countrycodes": "mx",
         "viewbox": VIEWBOX, "bounded": 1}
    )
    req = urllib.request.Request(url, headers={"User-Agent": AGENTE})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def main():
    lugares = json.loads((DATOS / "lugares.json").read_text())["lugares"]
    for lugar in lugares:
        print(f"\n{lugar['id']}  ({lugar['nombre']})")
        print(f"  actual   {lugar['lat']},{lugar['lon']}")
        visto = set()
        for consulta in CONSULTAS.get(lugar["id"], []):
            try:
                hits = buscar(consulta)
            except Exception as e:
                print(f"  fallo la consulta '{consulta}': {e}", file=sys.stderr)
                continue
            for h in hits:
                lat, lon = round(float(h["lat"]), 6), round(float(h["lon"]), 6)
                if (lat, lon) in visto:
                    continue
                visto.add((lat, lon))
                d = km_entre(lugar["lat"], lugar["lon"], lat, lon)
                print(f"  candidato {lat},{lon}  a {d:>5.2f} km  [{h.get('type','?')}]")
                print(f"            {h['display_name'][:100]}")
            time.sleep(1.1)
        if not visto:
            print("  sin candidatos")


if __name__ == "__main__":
    main()
