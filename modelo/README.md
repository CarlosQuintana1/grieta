# Grieta: modelo

Scripts en Python que convierten lo capturado en un dataset, entrenan el modelo de precios y lo
evalúan.

```
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

| Script | Qué hace |
|---|---|
| `construir_dataset.py` | Baja los registros y escribe `datos/dataset.csv`: una fila por app, con km, minutos, zona, hora y clima |
| `entrenar_modelo.py` | Entrena el modelo (ruta, franja horaria y fin de semana), le suma el índice de la ciudad y lo mide dejando fuera días completos |
| `tarifa.py` | Precio de cualquier viaje de la ciudad: tarifa de cada app por km, por un multiplicador según zona, hora y día. Las zonas con pocos datos toman el valor de sus vecinas |
| `camion.py` | Opciones para llegar con Qrobus, con app o combinando los dos, con los horarios oficiales |
| `decision.py` | Decide con lógica difusa entre pedir ya, esperar o irse en camión |
| `genetico.py` | Ajusta con un algoritmo genético los conjuntos y las reglas de `decision.py` y lo compara contra el sistema a mano |
| `exportar_excel.py` | Saca un Excel con los registros y lo predicho contra lo real, con 80/20 por tiempo |
| `rutas_osrm.py` | Calcula km y minutos sin tráfico de cada ruta con OSRM (`datos/rutas_medidas.json`) |
| `revisar_capturas.py` | Señala por capturista lo raro: precios fuera de lo normal en esa ruta, la misma ruta repetida en minutos, precios copiados de otra ruta. Correrlo antes de reentrenar |
| `verificar_rutas.py` | Señala coordenadas sospechosas en el catálogo |
| `geocodificar.py` | Propone coordenadas para los lugares con Nominatim |

Para bajar los registros hace falta el código del equipo (`CODIGO_EQUIPO=... .venv/bin/python
construir_dataset.py`) o la cuenta de Cloudflare con wrangler. El catálogo de lugares y rutas
vive en `../captura/data/`.

Los horarios de Qrobus son el GTFS oficial que publica la Agencia de Movilidad, en
[hdtp.codeandomexico.org](https://hdtp.codeandomexico.org/datos/mex-qro-queretaro-qrobus). Se
descomprimen en `datos/gtfs_qrobus/`.

## Algoritmo genético para la decisión

`genetico.py` toma cada captura y la siguiente de la misma ruta ese mismo día (hasta 30 minutos
después): así se sabe qué habría pasado si alguien pedía ya, esperaba o se iba en camión. Cada
consejo se cobra en pesos: el precio que pagó, más $1 por minuto de más en el viaje y $5 por minuto
que se le hizo tarde, con las tres prisas de la app (5, 20 y 45 minutos libres). El precio esperado
sale de un modelo que no vio ese día, y el genético aprende con unos días y se califica con otros.

Cada individuo son los puntos de los conjuntos difusos, que solo pueden moverse un poco desde los
valores a mano (±0.2 en precio, ±15 min en tiempos) para que "caro" siga queriendo decir caro, y la
acción de cada regla, que puede apagarse. Población de 60, 120 generaciones, torneo de tres, cruce
BLX y élite de dos.

Con 262 casos de 21 días, calificado con días que no vio:

| Sistema | Costo por viaje | Elige lo mejor |
|---|---|---|
| Siempre pedir ya | $100.28 | 40% |
| Camión si hay | $96.22 | 73% |
| Difuso a mano | $96.72 | 49% |
| Difuso genético | $81.88 | 89% |
| Lo mejor posible | $79.50 | 100% |

El genético ahorra $14.83 por viaje contra el sistema a mano (95% entre $12.03 y $16.77,
remuestreando días). Lo que más cambia son las reglas: apaga las de esperar y manda al camión
cuando el precio está caro y el camión tarda poco más. Esperar sí baja el precio cuando está muy
caro ($14.60 en promedio), pero en esos casos el camión casi siempre sale mejor.

El resultado depende de cuánto vale un minuto: con $0.65 ahorra $17.23, con $2 ahorra $7.41 y con
$3 ahorra $2.56. Siempre le gana al sistema a mano, pero con poco tiempo libre conviene pedir la app
casi siempre. El ajuste final queda en `datos/decision_genetica.json`.

```
.venv/bin/python genetico.py                    # mide y guarda el ajuste
.venv/bin/python genetico.py --minuto 2 --sin-guardar
```
