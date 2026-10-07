"""Revisa las rutas medidas y senala coordenadas sospechosas.

Marca ida y vuelta muy distintas, velocidades imposibles, rutas demasiado cortas y rodeos
que ningun conductor daria.

    python verificar_rutas.py
"""

import json
import math
import pathlib

CATALOGO = pathlib.Path(__file__).resolve().parent.parent / "captura" / "data"
DATOS = pathlib.Path(__file__).resolve().parent / "datos"
ASIMETRIA_MAX = 0.25
VEL_MIN, VEL_MAX = 20, 90
RODEO_MAX = 2.5
RUTA_MIN_KM = 1.5


def linea_recta_km(a, b):
    r = 6371
    dlat = math.radians(b["lat"] - a["lat"])
    dlon = math.radians(b["lon"] - a["lon"])
    h = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(a["lat"])) * math.cos(math.radians(b["lat"])) * math.sin(dlon / 2) ** 2)
    return 2 * r * math.asin(math.sqrt(h))


def main():
    medidas = DATOS / "rutas_medidas.json"
    if not medidas.exists():
        raise SystemExit("Falta datos/rutas_medidas.json. Corre antes rutas_osrm.py")

    rutas = json.loads(medidas.read_text())["rutas"]
    lugares = {l["id"]: l for l in json.loads((CATALOGO / "lugares.json").read_text())["lugares"]}

    por_par = {}
    for r in rutas:
        por_par.setdefault(r["par_id"], []).append(r)

    sospechosos = set()

    print("Pares asimetricos")
    hallazgos = 0
    for par_id, lado in sorted(por_par.items()):
        if len(lado) != 2:
            continue
        ida, vuelta = lado
        mayor, menor = max(ida["distancia_km"], vuelta["distancia_km"]), min(ida["distancia_km"], vuelta["distancia_km"])
        if menor == 0:
            continue
        dif = (mayor - menor) / mayor
        if dif > ASIMETRIA_MAX:
            hallazgos += 1
            sospechosos.update([ida["origen"], ida["destino"]])
            print(f"  par {par_id:>2}  {ida['origen']} <-> {ida['destino']}: "
                  f"{ida['distancia_km']:.2f} km de ida, {vuelta['distancia_km']:.2f} de vuelta "
                  f"({dif:.0%} de diferencia)")
    if hallazgos == 0:
        print("  ninguno")

    print("\nVelocidades implicitas raras")
    hallazgos = 0
    for r in rutas:
        if r["duracion_libre_min"] == 0:
            continue
        vel = r["distancia_km"] / (r["duracion_libre_min"] / 60)
        if not (VEL_MIN <= vel <= VEL_MAX):
            hallazgos += 1
            sospechosos.update([r["origen"], r["destino"]])
            print(f"  ruta {r['ruta_id']:>2}  {r['origen']} -> {r['destino']}: {vel:.0f} km/h")
    if hallazgos == 0:
        print("  ninguna")

    print("\nRutas demasiado cortas")
    hallazgos = 0
    for r in sorted(rutas, key=lambda x: x["distancia_km"]):
        if r["distancia_km"] < RUTA_MIN_KM:
            hallazgos += 1
            sospechosos.update([r["origen"], r["destino"]])
            print(f"  ruta {r['ruta_id']:>2}  {r['origen']} -> {r['destino']}: "
                  f"{r['distancia_km']:.2f} km, siempre va a salir tarifa minima")
    if hallazgos == 0:
        print("  ninguna")

    print("\nRodeos desproporcionados")
    hallazgos = 0
    for r in rutas:
        recta = linea_recta_km(lugares[r["origen"]], lugares[r["destino"]])
        if recta < 0.5:
            continue
        rodeo = r["distancia_km"] / recta
        if rodeo > RODEO_MAX:
            hallazgos += 1
            sospechosos.update([r["origen"], r["destino"]])
            print(f"  ruta {r['ruta_id']:>2}  {r['origen']} -> {r['destino']}: "
                  f"{r['distancia_km']:.2f} km por carretera contra {recta:.2f} en linea recta "
                  f"(rodeo de {rodeo:.1f}x)")
    if hallazgos == 0:
        print("  ninguno")

    print(f"\nAbre estos puntos en el mapa y corrige lat/lon en captura/data/lugares.json.")
    print("Pon el pin donde de verdad te subirias al coche, no en el centro del poligono.\n")
    for lid, l in lugares.items():
        marca = "  <-- revisar" if lid in sospechosos else ""
        print(f"  {l['nombre']}{marca}")
        print(f"    https://www.google.com/maps/search/?api=1&query={l['lat']},{l['lon']}")

    print(f"\n{len(sospechosos)} de {len(lugares)} lugares salieron senalados.")
    print("Al corregir, vuelve a correr rutas_osrm.py y luego este script.")


if __name__ == "__main__":
    main()
