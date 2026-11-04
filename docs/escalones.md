# Escaleras y escalones: prueba local

En Cámara, activar **Escaleras y escalones (prueba)** antes de iniciar. Está apagado
por defecto y funciona tanto en Mi viaje como en Todo el entorno. Descarga 9.2 MB
adicionales una vez; después reutiliza la caché de visión. No guarda ni envía imágenes.

Un modelo distinto al detector COCO segmenta escaleras y escalones. Emite
«Posibles escaleras» o «Posible escalón» con lado de la imagen, voz local según ajustes,
aviso para lector y solicitud de vibración si el navegador la admite. No estima
distancia, altura, subida/bajada, huecos ni caídas de personas. No indica que sea seguro
avanzar y no sustituye el bastón ni el acompañamiento.

## Modelo y límites medidos

DeepLabV3+ MobileNetV2 ADE20K de TensorFlow, 2018-12-03, licencia Apache 2.0.
Los pesos no se reentrenaron. La conversión conserva softmax de las 151 etiquetas y
agrupa 54/60 como escaleras, 122 como escalón y el resto como otro. Entrada RGB
513 × 513 normalizada con media y desviación 127.5; salida 129 × 129 × 3.
Se alterna imagen completa y recorte central inferior, conservando proporción con
relleno gris. Se descartan píxeles con probabilidad menor a 0.55 y regiones minúsculas.

Se eligieron antes de inferir 18 fotos públicas: primeras 6 de escaleras, 6 de escalón
y 6 sin esas etiquetas en 500 filas de validación de ADE20K. Se compararon varios
reescalados sobre esas mismas fotos: **es una muestra de desarrollo, no un test
independiente**. El informe por foto está en `escalones-evaluacion.json`.

Con las dos vistas finales, hubo regiones en 4/6 fotos de escaleras, 1/6 de escalón y
1/6 sin etiquetas de desnivel. Las anotaciones pueden omitir desniveles. Estos conteos
no miden la eficacia de la alerta temporal ni representan precisión en la calle.
Mediana de inferencia completa: 406 ms en Chromium CPU de macOS; no es latencia en celular.

**Todavía omite muchos escalones. Prevención de caídas, escaleras descendentes,
uso caminando, baja luz y rendimiento en teléfonos: no verificados.** Requiere un
conjunto independiente de videos etiquetados y evaluación con acompañamiento antes
de ampliar su uso. Por eso la función es opcional y experimental.

## Flujo

- Worker dedicado, una imagen en vuelo; alterna vistas sin esperar inmovilidad.
- Dos observaciones compatibles en 2.5 s; una región muy grande con confianza alta
  puede producir un aviso tentativo inmediato. Repetición por tipo/lado cada 8 s.
- Descarta resultados de más de 2 s, imagen oscura/sobreexpuesta o video congelado.
  Retira el aviso antiguo sin anunciar que el camino esté libre.
- Si falla el modelo, lo informa y conserva los otros motores. Al salir u ocultar la
  app se terminan workers, pistas, imágenes y temporizadores.
- Voz ordinaria y OCR automático ceden unos segundos al aviso. Lectura pedida por
  la persona y avisos de vehículos siguen disponibles.

## Reproducir conversión

Fuente y sumas SHA-256:

- [Modelo original](https://storage.googleapis.com/download.tensorflow.org/models/deeplabv3_mnv2_ade20k_train_2018_12_03.tar.gz):
  `9565ccd0f43dc5fa92e4b99537049890c27e420527a76f28265e861c6f55776c`.
- `frozen_inference_graph.pb` extraído:
  `bb2df8fb714070c0cc2a8afe8b57ab53c75fbed39cbc4e24811e9165f8f3162f`.
- Modelo incluido `demo/vision/modelos/escalones-v1.tflite`:
  `46f38877585629fd6cd37e4765d60def43deb367920bfccfa94486ae8f983756`.

En un entorno temporal Python 3.11 con `tensorflow==2.16.2`, NumPy y flatbuffers:
descargar el wheel oficial `tflite-support==0.4.4` (manylinux cp311) sin instalar sus
binarios. Extraer `tensorflow_lite_support/metadata/schema_py_generated.py` y
`tensorflow_lite_support/metadata/metadata_schema_py_generated.py` a una carpeta.
Poner esa carpeta en `PYTHONPATH` y ejecutar:

```sh
python scripts/preparar-escalones.py --grafo /tmp/frozen_inference_graph.pb --salida /tmp/escalones-v1.tflite
```

La versión incluida conserva las probabilidades de los logits originales, añade los
metadatos de normalización y fija la fecha ZIP de las etiquetas. No requiere estas
dependencias Python en la app; reutiliza MediaPipe/WASM ya incluido. Atribución y
licencia completas en `demo/vision/modelos/LICENSE-escalones`.

## Verificación

`node --test pruebas/desniveles.test.cjs` cubre segmentación, umbrales, filtrado
temporal, caducidad y repeticiones. `escalones-estado.cjs` usa workers controlados
para fallos, demora, cámara congelada y cierre; no evalúa reconocimiento.

`escalones-camara.cjs` usa el modelo real sobre tres fotos públicas elegidas después
de la evaluación. Comprueba integración en ambos modos, voz/vibración solicitada,
retirada del aviso, privacidad y cierre. No demuestra generalización. Guardar estas
fotos fuera del repo y apuntar `ESCALONES_MUESTRA` a esa carpeta:

- `ADE_val_00000218.jpg`, `ADE_val_00000620.jpg`, `ADE_val_00000074.jpg`.
- Base de descarga: `https://huggingface.co/datasets/pictograph/ade-20k/resolve/7689e0b7a96474a96a8044bd4650a3e054296087/valid/0000/`.

Para pruebas de navegador: servir `demo/` y definir `GRIETA_URL`, `NODE_PATH` a una
instalación temporal de Playwright y `CHROMIUM_EXECUTABLE`. La suite
`vision-actualizacion.cjs` verifica la actualización desde SW 68 y los modelos sin red.
No se incluyen fotos ni anotaciones de ADE20K en el producto o en el repo.
