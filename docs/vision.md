# Cámara que habla

Desde Inicio o Voz abro **Describir con la cámara**. Elijo **Más detalle** (predeterminado) o **Más
ligero** antes de iniciar. El modo detallado descarga unos 40 MB en el primer uso. En una instalación
que ya usó la versión 68, solo añade el modelo de 7.5 MB. Las preferencias quedan en el teléfono.

## Reconocimiento

Más detalle usa EfficientDet-Lite2 int8 con entrada de 448 × 448; Más ligero conserva Lite0 int8 de
320 × 320. Ambos son modelos preentrenados de Google/TensorFlow sobre COCO, con MediaPipe 0.10.21.
No entrené desde cero ni añadí clases que estos modelos no tengan.

Se aprovechan las 80 etiquetas, con prioridad para vehículos, personas y señales. Se agrupan objetos
distintos y se eliminan cajas duplicadas. Se requiere confianza mínima 0.55 y dos fotogramas
consecutivos para describir. El ciclo intenta analizar cada 600 ms; un teléfono lento tardará más.
La imagen fuente llega hasta 960 px en detalle y 640 px en ligero. La voz tiene pausas de 5 segundos.

Se avisa de oscuridad, exceso de luz, falta de detalle o movimiento global sostenido. Estas reglas
pueden fallar y no sustituyen una evaluación de la lente o enfoque. El OCR español sigue con
Tesseract.js/core 7.0.0 y `4.0.0_fast/spa`, confianza mínima 65. La coincidencia de paradas requiere
nombre único de dos palabras distintivas dentro de 600 m del GPS disponible; no confirma la parada.

## Avisos de vehículos

Están apagados al inicio. **Avisos experimentales de vehículos** activa un aviso de voz/lector y pide
una vibración cuando una caja de auto, moto, bicicleta, camión o autobús crece de manera sostenida al
centro de la imagen. Solo observa crecimiento aparente; no determina velocidad, distancia, trayectoria
real ni tiempo hasta una colisión. Mover el teléfono o acercarse a un vehículo estacionado puede causar
avisos falsos. Una ausencia de avisos nunca significa que sea seguro avanzar.

La asociación usa clase y solapamiento entre cajas. Requiere puntuación 0.65, tres observaciones en al
menos 600 ms, área final mínima de 6 % e incremento de al menos 50 %, posición central y crecimiento
consistente. Descarta pérdida de seguimiento, movimiento global, mala calidad y resultados tardíos.
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
