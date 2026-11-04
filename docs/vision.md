# Cámara que habla

Desde Inicio o Voz, abro **Describir con la cámara** y toco **Iniciar cámara**. La primera vez descarga
aproximadamente 37 MB; después funciona sin conexión si el navegador conserva la caché.

Reconoce objetos comunes cada dos segundos y lee texto español aproximadamente cada 15 segundos.
**Leer letrero ahora** pide otra lectura. **Detener cámara**, salir, ocultar la app o bloquearla detienen
la sesión. Siempre requiere permiso y usa la cámara trasera cuando está disponible; no pide micrófono.

## Modelo y alcance

- EfficientDet-Lite0 int8, versión 1, entrenado por Google/TensorFlow con COCO. No lo entrené desde cero.
- MediaPipe Tasks Vision 0.10.21: inferencia CPU en un worker con imágenes de hasta 640 px.
- Tesseract.js y tesseract.js-core 7.0.0, datos españoles `4.0.0_fast/spa`: OCR en workers separados.
- Los archivos están en `demo/vision/`, con hashes SHA-256 en `activos.json` y licencias junto a ellos.
- Se anuncian las clases de `observaciones.js` con puntuación mínima 0.60 y presencia en dos fotogramas
  consecutivos. La posición corresponde a la imagen; no se calcula distancia física.
- Se descarta OCR con confianza media inferior a 65. Una coincidencia de nombre de parada exige dos
  palabras distintivas y un único resultado del catálogo a menos de 600 m del GPS disponible. Se indica
  que es una coincidencia de texto; no prueba que el objeto enfocado sea una parada.

No detecta todos los obstáculos. COCO no aporta clases específicas para baches, escalones, postes ni
rampas. No estima profundidad, no interpreta el color del semáforo y no indica cuándo cruzar.
La cámara es experimental y no sustituye bastón, acompañamiento ni las técnicas de orientación.
No hay mediciones de precisión sobre calles de Querétaro. Entrenar un detector propio requiere un
conjunto de fotos locales etiquetadas y una evaluación independiente; no se generan métricas ficticias.

## Privacidad y caché

Los píxeles pasan en memoria del video al canvas y a los workers, sin peticiones de red ni guardado.
No hay endpoint de cámara en la API. Solo se descargan recursos estáticos desde el mismo origen.
La caché `grieta-vision-1` contiene código y modelos; el service worker la conserva al actualizar la app.
El borrado de datos del sitio libera esa descarga. Si no hay espacio o red inicial, la sesión muestra
un error recuperable. Los activos nuevos se comprueban con SHA-256 antes de guardarlos.

Las descripciones de la cámara usan únicamente una voz española con `localService: true`; si no hay
una instalada, la app lo explica. Con lector de pantalla se usan anuncios accesibles, sin voz duplicada.
El texto reconocido se muestra en español incluso si la interfaz está en hñöñho.

## Comprobaciones

`node --test pruebas/vision.test.cjs` comprueba confianza, clases, posiciones, límites del texto y nombres
ambiguos de paradas. `node --check` revisa los scripts. En navegador se verificaron el modelo real con
la imagen oficial de perros, OCR real sobre un letrero de prueba, arranque sin red después de descargar,
permiso denegado, cierre de pistas, navegación desde Voz y ausencia de envíos de imágenes.

Pendiente de comprobar en dispositivos físicos: Safari de iPhone y Chrome de Android, VoiceOver y
TalkBack, rendimiento térmico/batería y reconocimiento en calle. No confundir las pruebas del navegador
con una validación para desplazarse sin ver.

## Fuentes

- [Detector y modelos oficiales](https://developers.google.com/edge/mediapipe/solutions/vision/object_detector/index)
- [API web y workers](https://developers.google.com/edge/mediapipe/solutions/vision/object_detector/web_js)
- [Tesseract.js](https://github.com/naptha/tesseract.js)
- [Datos de español](https://github.com/naptha/tessdata/tree/gh-pages/4.0.0_fast)

Para repetir las pruebas de navegador, instalo Playwright fuera de `demo/`, sirvo la app en `:8791` y
uso `NODE_PATH` si no está instalado en el repo. `vision-navegador.cjs` recibe `VISION_IMAGEN` con la
[imagen oficial de ejemplo](https://developers.google.com/static/edge/mediapipe/images/solutions/object-detection-output.png).
`GRIETA_URL` cambia el servidor y `CHROMIUM_EXECUTABLE` permite usar un Chromium ya instalado.
`node pruebas/vision-privacidad.cjs` comprueba la elección de voz local y el primer uso sin conexión.

`node pruebas/vision-offline.cjs` levanta un servidor temporal, descarga los activos y lo apaga antes
de recrear los dos motores desde caché. Usa cámara simulada; no abre la cámara real.
