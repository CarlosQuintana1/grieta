# Práctica y cámara de viaje

Versión 73. El Inicio en modo Voz y Ajustes → Voz ofrecen **Practicar los toques**.
La práctica describe un botón seguro y permite activarlo, repetir o salir. No pide permisos,
no inicia un viaje y conserva los ajustes. Fuera del lector configurado aplica el gesto propio
solo durante la práctica, incluso si estaba desactivado; al salir se restaura el comportamiento
normal. Con lector configurado usa sus gestos y no añade otra capa. Enter también permite practicar.
La finalización se registra únicamente en el teléfono. La voz respeta el ajuste de la persona.

## Mi viaje

Es el enfoque inicial de la cámara. Prioriza camiones, semáforos y señales de alto; la lectura
automática de texto solo anuncia paradas cercanas reconocidas del catálogo. No interpreta luces
ni decide cuándo cruzar. **Todo el entorno** conserva las 80 clases y lectura general anteriores.
La preferencia queda en el teléfono. **Leer letrero ahora** permite pedir una lectura general
explícita también desde Mi viaje.

Desde **¿Es el camión que busco?** en la guía, la cámara toma la línea y destino del tramo actual.
Abrirla y volver conserva el seguimiento GPS y la guía; salir a otra sección termina el viaje como
antes. La comparación no marca que la persona abordó ni modifica el itinerario. La narración normal
de cámara espera si está hablando la guía; los avisos experimentales de vehículos conservan prioridad.

También puedo escribir una ruta del catálogo local y elegir su sentido entre las opciones visibles.
Dejar el campo vacío recupera la ruta del viaje. Un código desconocido no se reemplaza por otra ruta.
Sin ruta elegida se puede leer un código tentativo, pero no compararlo ni afirmar coincidencia.

## Lectura del camión

Se reutilizan EfficientDet-Lite0/Lite2 y Tesseract locales. No se entrenó otro modelo neuronal ni
se cambiaron los pesos. La mejora combina localización del camión, recorte y comparación temporal:

- Requiere un solo camión detectado con confianza ≥0.65 y caja reciente (menos de 800 ms).
- Recorta la caja del mismo fotograma analizado por el detector. Elige la toma más nítida de los
  tres fotogramas analizados más recientes, con menos de 800 ms; no usa otra imagen del video.
- El OCR debe tener confianza ≥65 y un código completo y único del catálogo. No convierte C5S a C55.
- Compara al menos dos lecturas separadas 500 ms, en una ventana de 10 s y con el mismo contexto.
- El sentido necesita todas las palabras distintivas del destino (al menos dos), presentes en dos
  lecturas. Destinos indistinguibles no se consideran confirmados. Si dos lecturas coinciden con
  otro destino conocido de esa línea, se anuncia el sentido distinto.
- Varios camiones, cajas discontinuas, cambios de ruta/modo, mala imagen o resultados tardíos
  descartan evidencia. El OCR de más de cuatro segundos y tiempos de video repetidos se descartan.
  El resultado visible caduca y no queda disponible como comparación antigua.

Mi viaje intenta leer automáticamente cada 2.2 s cuando puede hacerlo, sin poner imágenes en cola.
**Leer número del camión** pide dos lecturas independientes. Con los avisos experimentales de
vehículos activos, la lectura de texto se pide manualmente para no competir de forma continua.
Si no detecta un solo camión, ofrece apuntar al letrero y usar la lectura general existente.
La voz usa «Parece decir» y separa coincidencia de número de sentido no confirmado.

Las imágenes y el OCR permanecen en el dispositivo. No se guardan ni se envían. La cámara y workers
se cierran al salir/ocultar la app. Después de descargar app y modelos, las funciones trabajan sin red.
No se añaden dependencias, servicios de visión ni dominios.

## Verificación

- `node --test pruebas/idioma.test.cjs pruebas/vision.test.cjs pruebas/vision-movimiento.test.cjs pruebas/transporte.test.cjs`.
- `pruebas/viaje-camara.cjs`: práctica táctil/teclado/lector configurado, guía conservada, OCR real
  sobre letreros generados con caja de detector simulada, número/sentido, varios camiones,
  cancelación de OCR al cambiar ruta/enfoque, resultados tardíos, Repetir sin comparación vieja,
  video congelado, filtros y preferencias, 390/320 px, claro y letra grande.
- `pruebas/vision-navegador.cjs`: detector y OCR reales en Todo el entorno; permisos, cancelaciones,
  cierre y arranque sin red. `vision-avisos.cjs` y `vision-privacidad.cjs` conservan avisos y voz local.
- `pruebas/vision-actualizacion.cjs`: controlador antiguo hasta versión actual, módulos en caché y
  práctica/cámara sin servidor ni red después de actualizar.

La caja simulada no valida al detector sobre autobuses reales; el letrero generado tampoco mide
exactitud sobre Qrobus en movimiento. No verificado: iPhone/Android físicos, lectores reales,
letreros LED, oclusión, varios vehículos superpuestos, consumo o recorridos de calle.
Las pruebas físicas siguen pendientes en TAREAS.md; no se declara precisión de identificación real.
