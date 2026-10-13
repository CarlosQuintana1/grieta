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
| `exportar_excel.py` | Saca un Excel con los registros y lo predicho contra lo real, con 80/20 por tiempo |
| `rutas_osrm.py` | Calcula km y minutos sin tráfico de cada ruta con OSRM (`datos/rutas_medidas.json`) |
| `verificar_rutas.py` | Señala coordenadas sospechosas en el catálogo |
| `geocodificar.py` | Propone coordenadas para los lugares con Nominatim |

Para bajar los registros hace falta el código del equipo (`CODIGO_EQUIPO=... .venv/bin/python
construir_dataset.py`) o la cuenta de Cloudflare con wrangler. El catálogo de lugares y rutas
vive en `../captura/data/`.
