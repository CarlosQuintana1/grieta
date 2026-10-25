"""Señala capturas raras por capturista antes de reentrenar.

    python revisar_capturas.py            # todas
    python revisar_capturas.py David 3    # solo de David, de los últimos 3 días
"""
import collections
import statistics
import sys
from datetime import datetime, timedelta, timezone

from construir_dataset import PLATAFORMAS, ZONA, bajar_de_d1

APPS = {"uber": "Uber", "didi": "DiDi", "indrive": "inDrive"}
# DiDi sube mucho con alta demanda; en las otras apps un precio al doble ya es raro.
TOPE = {"uber": 1.8, "didi": 3.0, "indrive": 1.8}


def main():
    quien = sys.argv[1] if len(sys.argv) > 1 else None
    dias = int(sys.argv[2]) if len(sys.argv) > 2 else None
    momentos = bajar_de_d1()
    for m in momentos:
        m["t"] = datetime.fromisoformat(m["timestamp"].replace("Z", "+00:00"))

    # Lo normal de cada ruta sale de lo que capturaron los demás, para no compararse consigo mismo.
    def normal(app, ruta, sin):
        v = [m[f"precio_{app}"] for m in momentos if m["ruta_id"] == ruta and m["capturado_por"] != sin
             and not m["sospechosa"] and m[f"precio_{app}"]]
        return statistics.median(v) if len(v) >= 5 else None

    desde = datetime.now(timezone.utc) - timedelta(days=dias) if dias else None
    por_persona = collections.defaultdict(list)
    for m in momentos:
        por_persona[m["capturado_por"]].append(m)

    for persona, propios in sorted(por_persona.items()):
        if quien and persona != quien:
            continue
        avisos = []
        for i, m in enumerate(propios):
            if m["sospechosa"] or (desde and m["t"] < desde):
                continue
            motivos = []
            if i and (m["t"] - propios[i - 1]["t"]).total_seconds() < 30:
                motivos.append("menos de 30 s después de la anterior")
            veces = {a: m[f"precio_{a}"] / n for a in PLATAFORMAS
                     if m[f"precio_{a}"] and (n := normal(a, m["ruta_id"], persona))}
            motivos += [f"{APPS[a]} x{v:.1f}" for a, v in veces.items() if v > TOPE[a] or v < 0.5]
            if len(veces) == 3 and min(veces.values()) > 1.45:
                motivos.append("las tres apps altas: ¿ruta equivocada?")
            for otro in propios:
                cerca = abs((otro["t"] - m["t"]).total_seconds()) < 900
                mismos = all(otro[f"precio_{a}"] == m[f"precio_{a}"] for a in PLATAFORMAS)
                if otro is not m and not otro["sospechosa"] and otro["ruta_id"] != m["ruta_id"] and cerca and mismos:
                    motivos.append(f"mismos precios que la ruta {otro['ruta_id']}")
                    break
            if motivos:
                avisos.append((m, motivos))

        repetidas = sum(1 for i, m in enumerate(propios) if i and m["ruta_id"] == propios[i - 1]["ruta_id"]
                        and (m["t"] - propios[i - 1]["t"]).total_seconds() < 300)
        print(f"\n{persona}: {len(propios)} capturas, {repetidas} repiten la ruta anterior en menos de 5 min, "
              f"{len(avisos)} para revisar")
        for m, motivos in avisos:
            precios = " ".join(f"{APPS[a]} {m[f'precio_{a}']}" for a in PLATAFORMAS if m[f"precio_{a}"])
            print(f"  {m['t'].astimezone(ZONA):%a %d %H:%M}  ruta {m['ruta_id']}  {precios}  <- {'; '.join(motivos)}")


if __name__ == "__main__":
    main()
