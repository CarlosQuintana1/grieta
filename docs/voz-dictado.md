# Voz, dictado y sugerencias de parada

Uso visual comienza en silencio. Preferencias antiguas que tenían voz activada sin
una elección explícita también se silencian. Elegir el modo Voz activa narración
salvo que se use lector; elegir uso visual la detiene. Escuchar bien no activa voz.
`Activar voz` / `Silenciar Grieta` está en Inicio y en el encabezado de las pantallas.
El interruptor de Ajustes y estos accesos guardan la elección explícita.

Durante preparación y escucha del micrófono se cancelan voz/colas y se bloquean
narración y anuncios de estado de toques. El micrófono espera 650 ms; el tono ocurre
en `onstart`. El resultado se procesa después de `onend`, con el micrófono cerrado.
Cambiar de pantalla cancela captura y arranque pendiente; otra captura invalida
consultas anteriores. Un resultado viejo no elige un destino después de salir.

La prueba con reconocimiento simulado reproduce la narración tardía que contaminaba
el dictado. Comprueba que solo «Jardín Zenea» llega al campo, que no se habla durante
captura y que cancelar no abre después el micrófono. No utiliza micrófono ni voces
remotas reales. La función de dictado del navegador conserva su servicio habitual;
esto no convierte el reconocimiento de voz en procesamiento local.

Camiones cerca actualiza GPS con `maximumAge: 0`, indica precisión aproximada y ofrece
Actualizar ubicación. Si falla, usa un punto manual identificado o pide elegir uno;
no reutiliza silenciosamente un GPS antiguo. Consulta hasta ocho paradas físicas
del catálogo en 1 km y compara caminos a pie, incluyendo paradas sin próximos
horarios. La pantalla dice Parada sugerida y muestra límites del catálogo. Respuestas
antiguas de ubicación/caminatas no cambian la nueva consulta. Los horarios de paradas
cercanas se consultan por índice para no mezclar dos paradas con coordenadas iguales.

La ficha oficial https://qrobus.gob.mx/gtfs sigue publicando versión 25, 13/04/2026.
El catálogo no permite confirmar todos los marcadores actuales mostrados por la app
Qrobus en Paseos de Zákia. La parada pública 5154, Cto. Universidades / Lycée Français
International Jules Verne, sí está en el archivo. No se dedujeron coordenadas de
capturas, no se inventaron horarios y no se añadió ubicación de ninguna persona.

Pruebas: `voz-dictado.cjs`, `paradas-interfaz.cjs`, `paradas.test.cjs` y
`paradas-navegador.cjs`, además de regresiones de cámara/toques/tutorial/precios.
No verificado: audio real de iPhone, voz del lector del sistema entrando al micrófono,
la caminata real ni las otras paradas de la captura. Un bloqueo transitorio de cámara
no quedó reproducido; cierre/reentrada y descarga/caché se probaron en Chromium.
