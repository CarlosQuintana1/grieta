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
