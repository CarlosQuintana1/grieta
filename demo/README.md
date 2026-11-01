# Grieta: demo

Página para probar el modelo como una app de viajes, con aspecto de app móvil: mapa arriba, hoja abajo y
tres pestañas (Inicio, Reportar, Ayuda y ajustes). Los colores siguen el modo claro u oscuro del teléfono, o se
eligen en Ajustes. Lo primero que pregunta es cómo ves la pantalla: veo bien, veo poco
(letra grande y alto contraste) o no veo (modo para personas ciegas). Si no ves, pregunta si tu teléfono ya
te lee la pantalla para no hablar encima de VoiceOver o TalkBack, después pide la ubicación y al final
las tres preguntas del perfil (cómo te mueves, si escuchas bien, Tarifa Unidos), que se pueden saltar. Se puede volver
a elegir desde Ajustes. El inicio muestra tus últimos viajes para repetirlos con un toque.

"Tu perfil", arriba a la derecha en el inicio y en Ayuda y ajustes, pregunta por necesidades y no por
diagnósticos: cómo ves la pantalla, cómo te mueves, si escuchas bien los avisos y si pagas Tarifa Unidos.
Cada respuesta prende los mismos ajustes (letra grande, modo para personas ciegas, caminar poco, voz,
tarifa), y con silla de ruedas o andadera el detalle de la ruta avisa si reportaron que la parada de
subida o de bajada no tiene rampa o tiene obstáculos. Se guarda solo en el teléfono.

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

Con Casa guardada, el inicio la pone primero entre tus lugares para ir con un toque. Si el camión de la mejor
opción es de los últimos del día, avisa a qué hora pasa el último y cuánto costaría la app si se pierde.
Si lo que te marca una app está muy arriba de lo normal, avisa que está en alta demanda y cuánto
debería costar otra. Durante el viaje, "Avisar al chofer" pone a dónde vas en letra enorme para
enseñárselo. En Ajustes hay colores para daltonismo (azul y naranja), y cada recomendación lleva
su símbolo para no depender solo del color.

Las direcciones se buscan con Photon y con Azure Maps (desde la API, para negocios y oficinas que
OpenStreetMap no tiene). La ruta en auto sale de OSRM y los tramos a pie del ruteador peatonal de
OpenStreetMap (routing.openstreetmap.de); si no responde, se dibujan en línea recta.

`index.html` trae una política de contenido (CSP) con la lista de servidores a los que la página puede
conectarse, y las librerías de los CDN van con su huella de integridad (SRI). Si cambia la dirección de
la API en `datos/config.json` o se agrega un servicio nuevo, hay que sumarlo a `connect-src`.

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
