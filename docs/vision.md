# Cámara que habla

Desde Inicio o Voz abro **Describir con la cámara**. Elijo **Más detalle** (predeterminado) o **Más
ligero** antes de iniciar. El modo detallado descarga unos 40 MB en el primer uso. En una instalación
que ya usó la versión 68, solo añade el modelo de 7.5 MB. Las preferencias quedan en el teléfono.

Al iniciar, el video ocupa la vista y **Detener cámara** queda abajo aunque se desplace el panel
de avisos. La cámara narra automáticamente con una voz española local, incluso si la voz general
está apagada. El altavoz del encabezado solo silencia esa cámara. Si se configuró un lector de
pantalla, la cámara usa sus anuncios sin duplicar el audio.

## Reconocimiento

Más detalle usa EfficientDet-Lite2 int8 con entrada de 448 × 448; Más ligero conserva Lite0 int8 de
320 × 320. Ambos son modelos preentrenados de Google/TensorFlow sobre COCO, con MediaPipe 0.10.21.
No entrené desde cero ni añadí clases que estos modelos no tengan.

Se aprovechan las 80 etiquetas, con prioridad para vehículos, personas y señales. Se agrupan objetos
distintos y se eliminan cajas duplicadas. Se requiere puntuación mínima 0.55 y confirmación de clase en una ventana de tres imágenes, aunque
cambie de posición; una puntuación de al menos 0.85 permite descripción inmediata. El ciclo intenta
analizar cada 200–250 ms, según movimiento y tiempo de inferencia; un teléfono lento tardará más.
La imagen fuente llega hasta 960 px en detalle y 640 px en ligero. La voz evita acumular resultados y tiene pausas mínimas de dos segundos.
La vista se actualiza aparte del anuncio accesible. En movimiento se narra primero un objeto; una
descripción vieja no bloquea indefinidamente otra más reciente.

Se avisa de oscuridad, exceso de luz o falta de detalle. Mover el teléfono no detiene la descripción
ni pide que se mantenga quieto. Estas reglas
pueden fallar y no sustituyen una evaluación de la lente o enfoque. El OCR elige la toma más nítida de tres capturas en unos 120 ms, sin exigir quietud, y sigue con
Tesseract.js/core 7.0.0 y `4.0.0_fast/spa`, confianza mínima 65. La coincidencia de paradas requiere
nombre único de dos palabras distintivas dentro de 600 m del GPS disponible; no confirma la parada.

## Avisos de vehículos

Están apagados al inicio. **Avisos experimentales de vehículos** activa un aviso de voz/lector y pide
una vibración cuando una caja de auto, moto, bicicleta, camión o autobús crece de manera sostenida al
centro de la imagen. Solo observa crecimiento aparente; no determina velocidad, distancia, trayectoria
real ni tiempo hasta una colisión. Mover el teléfono o acercarse a un vehículo estacionado puede causar
avisos falsos. Una ausencia de avisos nunca significa que sea seguro avanzar.

La asociación usa clase y solapamiento entre cajas, transformando las anteriores con una estimación
afín del fondo. Se buscan puntos de textura fuera de los objetos detectados y se exige consenso y
cobertura suficientes. Se compensa parte del desplazamiento, giro y zoom en la imagen, no movimiento
3D ni todos los efectos de caminar. Si la estimación es incierta, continúa la descripción y se reinicia
solo el seguimiento usado para el aviso. La asociación Requiere puntuación 0.65, tres observaciones en al
menos 600 ms, área final mínima de 6 % e incremento de al menos 50 %, posición central y crecimiento
consistente. Descarta pérdida de seguimiento, compensación incierta, mala calidad, cajas recortadas y resultados tardíos.
Hay una pausa de ocho segundos entre avisos. Son umbrales experimentales, sin validación en tráfico.

Con avisos activos, el OCR automático se pausa para dedicar el procesamiento a detectar; el botón
**Leer letrero ahora** sigue disponible. Las lecturas no pisan un aviso recién emitido. Con análisis
lento se explica que los avisos pueden omitirse y se propone usar Más ligero.

**Probar vibración** permite comprobarla: una respuesta positiva de la API no prueba que el motor
físico haya vibrado. Safari/iPhone no soporta vibración web; se explica la alternativa de voz/lector.
La pantalla se mantiene encendida mediante Wake Lock cuando el navegador lo permite. Salir, ocultar
la app, detener o un fallo liberan cámara, workers, vibración y bloqueo de pantalla.

## Límites y privacidad

No identifica pasos peatonales, banqueta, baches, escalones o el momento de cruzar. No interpreta el
color de un semáforo. Es una ayuda experimental para describir y no un sistema anticolisión ni un
sustituto del bastón o acompañamiento. Falta validación de campo con personas usuarias y teléfonos.

El procesamiento continúa dentro del dispositivo: imágenes en memoria, ningún envío ni guardado.
Solo se descargan recursos estáticos del mismo origen. Modelos y runtimes tienen hashes SHA-256 y
licencias en `demo/vision/`; la caché de activos persiste al actualizar. La voz de cámara solo utiliza
voces españolas locales. Con lector no duplica el audio. El texto de cámara se muestra en español.

## Evaluación reproducible

Se compararon ambos modelos sobre 34 imágenes oficiales de COCO val2017 y 344 anotaciones de diez
clases de calle, incluidas personas, vehículos, señales y mobiliario. Se seleccionaron antes de inferir:
las primeras 16 con al menos cinco instancias, más dos imágenes nuevas por cada una de nueve clases
que tuvieran alguna instancia de al menos 1024 px². Se evaluaron todas las instancias no crowd de esas
clases, incluidas pequeñas, con confianza 0.55 y coincidencia única de clase e IoU ≥ 0.5.

| Modelo | Coincidencias / anotaciones | Predicciones evaluadas | Mediana de inferencia |
|---|---:|---:|---:|
| Lite0 | 65 / 344 | 67 | 52 ms |
| Lite2 | 90 / 344 | 92 | 161 ms |

Resultado de Chromium en CPU de macOS; no representa tiempo en teléfonos. Los dos modelos dejaron
muchos objetos sin detectar. Estos conteos no son mAP ni un porcentaje de precisión para Querétaro y
no miden el seguimiento de vehículos. Los resultados por imagen están en `vision-comparacion.json`.

Para repetir: `python3 scripts/preparar-evaluacion-vision.py --destino /tmp/grieta-coco`, servir `demo/`
y ejecutar `COCO_MUESTRA=/tmp/grieta-coco node pruebas/vision-comparar.cjs` con Playwright instalado.
Los scripts aceptan `CHROMIUM_EXECUTABLE` y `GRIETA_URL`. Los datos de evaluación no se suben al repo.

`node --test pruebas/vision.test.cjs` revisa filtros, conteo, cajas, seguimiento y calidad. Las pruebas
`vision-navegador.cjs`, `vision-privacidad.cjs`, `vision-offline.cjs` y `vision-avisos.cjs` cubren motores
reales, OCR, voz local, caché con servidor apagado, permisos, cancelación y avisos simulados. La prueba
de navegador recibe `VISION_IMAGEN` con la imagen oficial de perros; la de avisos simula detecciones,
vibración y Wake Lock. Ninguna verifica vibración física ni detecta colisiones reales.

No verificado: iPhone y Android físicos, VoiceOver/TalkBack, batería, temperatura y tráfico real.

## Fuentes

- [Modelos oficiales y alcance](https://developers.google.com/edge/mediapipe/solutions/vision/object_detector/index)
- [COCO](https://cocodataset.org/#download)
- [Vibración y compatibilidad](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/vibrate)
- [Bloqueo de pantalla](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API)
- [OCR](https://github.com/naptha/tesseract.js)
- [Imagen oficial de prueba](https://developers.google.com/static/edge/mediapipe/images/solutions/object-detection-output.png)


La versión 70 separa la caché inmutable de modelos/runtimes del código de la app. Los scripts y la
lista de activos llevan una revisión para evitar mezclas al actualizar desde 68/69. La prueba
`vision-actualizacion.cjs` mantiene el service worker 68 activo mientras carga código nuevo, inicia el
modelo, actualiza a 70 y repite sin servidor ni red; requiere el historial Git del proyecto.


## Respuesta con la cámara en movimiento — versión 71

La captura transfiere ImageBitmap al worker cuando es posible, con alternativa RGBA y liberación de
recursos. Hay como máximo una imagen enviada al detector; se toma otra reciente al terminar y se
ignoran resultados con más de 1.2 s. Los motores se preparan en paralelo. No se cambiaron los pesos
Lite0/Lite2 ni se entrenó un modelo nuevo: esta mejora corrige captura, seguimiento, cadencia y voz.

Se comparó versión 70 con 71 usando el detector Lite2 real, una foto oficial COCO val2017
`000000322864.jpg` animada durante 12 s por caso y voz local simulada. En el caso amplio: desplazamiento
horizontal de hasta 140 px en una imagen de 960 px, vertical de 60 px, giro de ±0.18 rad y zoom de
1.00–1.24, dibujados cada 80 ms. No es un video real de una persona caminando ni prueba de tráfico.

| Medida en el caso amplio | Versión 70 | Versión 71 |
|---|---:|---:|
| Intervalo mediano entre análisis | 605 ms | 204 ms |
| Imágenes analizadas en 12 s | 20 | 58 |
| Primera descripción visual | 1395 ms | 422 ms |
| Primer envío a voz simulada | 7443 ms | 1037 ms |
| Máximo de imágenes pendientes | 1 | 1 |

El reloj comienza con la primera imagen enviada al detector. Medición de Chromium en CPU de macOS.
No representa latencia del iPhone, tiempo total desde abrir la
cámara ni audio físico de VoiceOver. El caso moderado y los datos están en `vision-respuesta.json`.
Se reproduce con `VISION_IMAGEN`, `GRIETA_ANTES_URL`, `GRIETA_URL` y opcionalmente
`VISION_MOVIMIENTO=amplio` en `pruebas/vision-latencia.cjs`. Las imágenes siguen en memoria local.

Los tests de movimiento verifican giros, traslación, zoom, fondos ambiguos, seguimiento independiente
del coche y ausencia de aviso por zoom sobre un coche estático. Movimiento extremo, desenfoque,
poca luz, parallax y oclusiones pueden impedir reconocer o compensar; no se garantiza detección en
cualquier movimiento. Falta validar con teléfono en mano, caminata real y lector de pantalla.

Referencias técnicas: [transferencia de imagen](https://developer.mozilla.org/en-US/docs/Web/API/Window/createImageBitmap)
y [estimación afín robusta](https://docs.opencv.org/4.x/d9/d0c/group__calib3d.html).
