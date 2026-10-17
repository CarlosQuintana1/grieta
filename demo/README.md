# Grieta: demo

Página para probar el modelo como una app de viajes: toma tu ubicación (o la escribes), buscas a
dónde vas y muestra el precio esperado en cada app, las opciones combinando Qrobus con una app y,
si pones lo que te marca la app, si conviene pedir ya, esperar o irse en camión.

Pensada también para quien no ve bien o no ve: dice qué camiones pasan por la parada más cercana y
a qué hora, lee los pasos de cada opción en voz alta y, durante el viaje, avisa con voz y vibración
cuántas paradas faltan, dos paradas antes de bajar, en la siguiente y al llegar. La pantalla tiene que
quedarse encendida: el navegador no sigue la ubicación con el teléfono bloqueado.

En el botón Aa están los ajustes: letra grande, alto contraste, voz más lenta, apagar la voz (para quien
ya usa VoiceOver o TalkBack) y caminar poco, que solo propone paradas a menos de 300 m. También se puede
dictar el destino, preguntar dónde estoy (calle y parada más cercana) y compartir el viaje. Mientras
esperas en la parada avisa cinco minutos y un minuto antes de que pase el camión según el horario, y cada
aviso suena además de vibrar, porque en iPhone el navegador no vibra.

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
