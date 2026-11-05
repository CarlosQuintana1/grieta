# Hoyos: detector experimental de baches visibles

**Busca baches visibles. Puede omitir hoyos y alcantarillas abiertas.**
Apagado por defecto; descarga opcional de 17,937,184 bytes (unos 18 MB).
Funciona en Mi viaje y Todo el entorno. No estima profundidad, distancia ni seguridad
para avanzar. No guarda ni envía imágenes de cámara y no incorpora librerías cliente.

**PENDIENTE: componente para alcantarillas abiertas.** El modelo omitió las tres
alcantarillas abiertas de la muestra. No se declara resuelto ese alcance ni se añade
otro modelo en esta entrega.

## Implementación

- `demo/vision/hoyos-worker.js`: worker independiente con MediaPipe ya incluido,
  `ImageEmbedder`, CPU, `l2Normalize:false`, `quantize:false`. Se comprobó inferencia
  real de los 50,400 valores y su decodificación en Chromium.
- Entrada RGB float32 `[1,640,640,3]`, valores 0..255. Inversión RGB/BGR dentro del
  modelo. Letterbox 114 arriba/izquierda anclado; relleno abajo/derecha.
- Salida `[1,50400]`: YOLOX crudo, 8400 filas por 6 campos, strides 8/16/32.
  Confianza = objeto × clase, mínimo .65; NMS IoU .45, máximo tres cajas;
  mínimo 8 px por lado original y área .001. No aplicar otra sigmoide ni L2.
- `demo/vision/hoyos.js`: decodificador y política. Dos observaciones compatibles
  entre los últimos tres cuadros, separadas al menos 150 ms y como máximo 2500 ms
  **entre capturas**. Repetición por lado cada 8 s. No hay aviso de un solo cuadro.
- La política también rechaza regiones con confianza menor a .65 recibidas del
  worker, no solo las salidas del decodificador. Ambos arreglos tienen regresiones.
- `camara-suelo.js`: fábrica compartida por escaleras/hoyos, con instancias aisladas.
  Un cuadro en vuelo por worker; Bitmap o RGBA; lado mayor limitado a 768 px incluso
  en vertical. Descarta resultados >2 s, video congelado e imagen oscura/expuesta.
  Retira avisos caducos sin declarar paso libre; cancela init, timers y worker al salir.
- `camara.js`: preferencia persistente `hoyos`, activos opcionales del grupo `hoyos`
  en manifiesto v5, prioridad temporal sobre narración genérica/OCR automático.
  Lectura manual y avisos de vehículos se conservan. Comparaciones de estados usan
  `Interfaz.original(elemento) ?? elemento.textContent` para traducción visual.
- Texto hablado tentativo: «Posible hoyo en el centro de la imagen» o el lado.
  Speech recibe español; la traducción visual se aplica en la interfaz.

## Resultados medidos

Selección: primeros 20 IDs numéricos de jaygala24, fijados antes de inferir, más
11 contrastes públicos de Commons. Se creó y revisó visualmente la hoja de contacto
antes de la primera inferencia de esta sesión. Umbral .65, correspondencia uno a uno
con GT YOLO a IoU >= .5, sin quitar GT pequeños y conservando el máximo de 3 regiones.

| Conjunto | Resultado |
| :-- | :-- |
| Baches, 20 imágenes / 38 cajas GT | 28 TP, 1 FP, 10 FN; 19 escenas con detección, 1 omitida |
| Alcantarillas abiertas, 3 escenas | 0 detectadas, 3 FN por escena; sin cajas GT |
| Tapas cerradas/rejillas, 3 escenas | 0 escenas con falso aviso |
| Sombras, 3 escenas | 0 escenas con falso aviso |
| Charcos, 2 escenas ambiguas | 2 con detección; excluidos de FP/TN |

`img-12` fue la escena de bache omitida; `img-18` contiene el FP medido contra GT.
No son datos de prueba independientes: el modelo declara entrenamiento con este
mismo dataset y puede existir solapamiento. La secuencia numérica puede contener
escenas parecidas. No son métricas de generalización, caminata o seguridad.

Chromium 156.0.8078.4 de escritorio: mediana 455.9 ms, máximo 549.2 ms en estas 31 inferencias
Bitmap. No extrapolar a teléfono. RGBA y Bitmap conservaron número y localización
con tolerancia de rasterización (IoU >.95 y diferencia de confianza <.03).
Dos repeticiones de la misma foto verifican política/integración, no video de campo.
Detalle por foto, GT, cajas, tiempos y hashes: `hoyos-evaluacion.json`.

## Procedencia y reproducción

Modelo: [AMD-PAVS-AI/pothole-detection](https://huggingface.co/AMD-PAVS-AI/pothole-detection/tree/cd5dd7a24988ac3cb8e58825a9ad477323787ed9),
revisión `cd5dd7a24988ac3cb8e58825a9ad477323787ed9`, licencia Apache-2.0 declarada
por el editor; arquitectura YOLOX/Megvii. La ficha atribuye el entrenamiento al
[dataset jaygala24](https://github.com/jaygala24/pothole-detection/tree/463a4a522e0630984cadec813f15d8172899948b)
con licencia MIT en su repositorio. Ese autor dice recopilar fotos de la web;
no se acredita autoría individual para ellas. Las fotos/GT no se distribuyen.
No se reentrenó ningún peso.

`demo/vision/modelos/LICENSE-hoyos` conserva atribución y textos Apache/MIT.
`hoyos-fuentes.json` fija fuentes públicas, revisiones, autores/licencias Commons y
SHA-256 de descargas/fichas/licencias. No incluye fotos.

ONNX original HF, 35,774,753 bytes, SHA-256 LFS comprobado mediante API y descarga nueva:
`9d55b8cc134f034b1885bd97aded14dcb17d887b8d5b7fbb3940e820d24c7660`.

La copia analítica preexistente pesa 35,798,287 bytes, SHA-256
`24cf24922748a695bb5cec567ce1a7d56034db6ddb633ff7e6975f2f06b57e03`.
No es el archivo descargado. Contiene 323 registros value_info, distinto orden de
nodos/inicializadores y campos protobuf vacíos explícitos. Se comprobaron iguales
los pesos por nombre y todas las operaciones, entradas, salidas y atributos por
nombre. Dio error máximo 0 frente al HF original en img-1/4/17.
El comando exacto que produjo esa copia no se conservó; no se inventa su historial.
El script actual exige el hash HF original y conserva ese archivo intacto; genera
Focus fusionado y simplificado en la carpeta de trabajo, registrando sus hashes.
TFLite incluido y reproducción independiente, ambos 17,937,184 bytes y SHA-256:
`8c9532ec55e76dd3426e3808bc0cace45cd6ee54d11111fb35c5c9b21ad8123b`.

Conversión: fusión analítica Focus/primera Conv de `[32,12,3,3]` a `[32,3,6,6]`,
offsets (0,0),(1,0),(0,1),(1,1), stride 2/pad 2; onnxsim produce 270 nodos.
Se agrega RGB/BGR, reshape y metadatos; se almacenan pesos float16 con IO float32.
Usar Python 3.11 y el entorno de conversión existente (TF 2.16.2, tf_keras 2.16.0,
onnx2tf 1.22.3, ONNX 1.17.0, onnxsim .4.36, NumPy 1.26.4, flatbuffers 25.12.19).
Los esquemas Python puros de tflite-support .4.4 y los datos auxiliares de prueba
onnx2tf se suministran fuera del repo. No son dependencias del cliente.

Definir rutas locales; las carpetas de datos/trabajo deben estar fuera del producto:

```sh
export GRIETA_ROOT=/ruta/al/repositorio
export HOYOS_DATOS=/ruta/externa/hoyos
export HOYOS_TRABAJO=/ruta/externa/conversion-hoyos
export CONVERSION_PYTHON=/ruta/al/venv/bin/python
export TFLITE_ESQUEMAS=/ruta/a/esquemas-tflite
cd "$GRIETA_ROOT"
"$CONVERSION_PYTHON" scripts/convertir-hoyos.py \
  --onnx "$HOYOS_DATOS/pothole_yolox_s-hf.onnx" \
  --salida "$HOYOS_TRABAJO/hoyos.tflite" --trabajo "$HOYOS_TRABAJO" \
  --esquemas "$TFLITE_ESQUEMAS" \
  --calibracion "$HOYOS_DATOS/calibration_image_sample_data_20x128x128x3_float32.npy"
"$CONVERSION_PYTHON" scripts/comparar-hoyos.py \
  --datos "$HOYOS_DATOS" --original "$HOYOS_DATOS/pothole_yolox_s-hf.onnx" \
  --fusionado "$HOYOS_TRABAJO/pothole-simple.onnx" \
  --tflite "$GRIETA_ROOT/demo/vision/modelos/hoyos-v1.tflite" \
  --reporte "$HOYOS_TRABAJO/equivalencia.json"
```

Se verificaron `img-1/4/17`: error máximo original/simplificado <=1.67e-5.
TFLite float16 frente al ONNX: máximo bruto .040016, medias .000690–.000861,
p99 <=.006644. Esos errores incluyen campos logarítmicos, no solo probabilidades.
Resultados completos: `hoyos-equivalencia.json`. No se afirma equivalencia exacta
numérica float16; la reproducción binaria del archivo sí resultó idéntica.

## Pruebas e integración

Las pruebas sirven los archivos reales de `demo/`, sin modificar HTML, worker ni catálogos en memoria. Pruebas de estado cubren demora, congelamiento, cancelación,
respuestas posteriores al cierre y fallo de hoyos con escaleras todavía activas.

```sh
export NODE_PATH=/ruta/a/node_modules
export CHROMIUM_EXECUTABLE=/ruta/al/chromium
node --test pruebas/hoyos.test.cjs pruebas/hoyos-worker.test.cjs pruebas/desniveles.test.cjs pruebas/vision.test.cjs pruebas/vision-movimiento.test.cjs pruebas/transporte.test.cjs
node pruebas/hoyos-estado.cjs
node pruebas/hoyos-camara.cjs
GRIETA_URL=http://127.0.0.1:8816 HOYOS_SIN_SW=1 node pruebas/hoyos-camara.cjs
GRIETA_URL=http://127.0.0.1:8816 node pruebas/escalones-estado.cjs
GRIETA_URL=http://127.0.0.1:8816 node pruebas/escalones-camara.cjs
node scripts/evaluar-hoyos.cjs
```

Las corridas de detector se registran en `hoyos-verificacion.json`; son evidencias
acotadas, no una declaración del estado completo de la aplicación. La suite unitaria
seleccionada comprende los seis archivos del comando anterior. Las corridas de
navegador cubren el modelo real, estados, privacidad, cierre y funcionamiento offline.
`HOYOS_SIN_SW=1` verifica la cámara sin probar la instalación del service worker.

Las 31 fotos, GT, contacto y capturas de navegador deben mantenerse en
`HOYOS_DATOS`, fuera del repo/producto; usar otra carpeta externa para ADE20K.
`scripts/preparar-muestra-hoyos.py` reproduce selección y contacto fuera del repo
y exige revisión visual antes de evaluar. Ninguna foto se incluye con el detector.
