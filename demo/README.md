# Grieta: demo

Página para probar el modelo como una app de viajes, con aspecto de app móvil: mapa arriba, hoja abajo y
cuatro pestañas (Inicio, Mis viajes, Reportar, Ajustes). La primera vez muestra una bienvenida de tres pasos;
se puede volver a ver desde Ajustes. Mis viajes guarda en el teléfono los últimos viajes iniciados para repetirlos.

La lógica no cambió: va por pantallas, una pregunta a la vez:
¿a dónde vas?, los caminos posibles (recomendado, más rápido, más barato) con la hora de llegada, el
detalle paso a paso de uno y la guía durante el viaje. Si el camino es en app, el detalle muestra el
precio en cada una y, si escribes lo que te marca, dice si conviene pedirlo, esperar o irte en camión.

Pensada también para quien no ve bien o no ve: dice qué camiones pasan por la parada más cercana y
a qué hora, lee los pasos de cada opción en voz alta y, durante el viaje, avisa con voz y vibración
cuántas paradas faltan, dos paradas antes de bajar, en la siguiente y al llegar. La pantalla tiene que
quedarse encendida: el navegador no sigue la ubicación con el teléfono bloqueado.

En Accesibilidad están los ajustes: letra grande, alto contraste, voz más lenta, apagar la voz (para quien
ya usa VoiceOver o TalkBack) y caminar poco, que solo propone paradas a menos de 300 m. También se puede
dictar el destino, preguntar dónde estoy (calle y parada más cercana) y compartir el viaje. Mientras
esperas en la parada avisa cinco minutos y un minuto antes de que pase el camión según el horario, y cada
aviso suena además de vibrar, porque en iPhone el navegador no vibra.

Con Casa guardada, el inicio muestra "Llévame a casa" para ir con un toque. Si el camión de la mejor
opción es de los últimos del día, avisa a qué hora pasa el último y cuánto costaría la app si se pierde.
Si lo que te marca una app está muy arriba de lo normal, avisa que está en alta demanda y cuánto
debería costar otra. Durante el viaje, "Avisar al chofer" pone a dónde vas en letra enorme para
enseñárselo. En Ajustes hay colores para daltonismo (azul y naranja), y cada recomendación lleva
su símbolo para no depender solo del color.

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
