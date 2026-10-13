# Grieta: demo

Página para probar el modelo como una app de viajes: toma tu ubicación (o la escribes), buscas a
dónde vas y muestra el precio esperado en cada app, las opciones combinando Qrobus con una app y,
si pones lo que te marca la app, si conviene pedir ya, esperar o irse en camión.

Las direcciones se buscan con Photon y la ruta por calle sale de OSRM, los dos sobre OpenStreetMap.

Hace los mismos cálculos que `modelo/tarifa.py`, `camion.py` y `decision.py`, con los datos que
genera `modelo/exportar_demo.py` en `datos/`. Para actualizarla con registros nuevos:

```
cd ../modelo
.venv/bin/python construir_dataset.py
.venv/bin/python exportar_demo.py
```

Para verla en local:

```
python3 -m http.server 8791 --directory .
```

Para publicarla en Cloudflare Pages:

```
npx wrangler pages deploy . --project-name grieta-demo --branch main
```
