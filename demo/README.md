# Grieta: demo

Página para probar el modelo desde el navegador. Se toca el mapa para poner origen y destino, y
muestra el precio esperado de cada app, las opciones combinando Qrobus con una app y, si se pone
el precio que marca la app, si conviene pedir ya, esperar o irse en camión.

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
