# Voz, dictado y sugerencias de parada

Uso visual comienza en silencio. Preferencias antiguas que tenían voz activada sin
una elección explícita también se silencian. Elegir el modo Voz activa narración
salvo que se use lector; elegir uso visual la detiene. Escuchar bien no activa voz.
`Activar voz` / `Silenciar Grieta` está en Inicio y en el encabezado de las pantallas.
El interruptor de Ajustes y estos accesos guardan la elección explícita.

Durante preparación y escucha del micrófono se cancelan voz/colas y se bloquean
narración y anuncios de estado de toques. El dictado no llama a `vibrar` ni genera
un oscilador de audio: no añade pitido ni tono al sonido que pueda dar el sistema.
En reposo solicita reconocimiento en el mismo evento, sin la espera fija de 650 ms.
Solo deja hasta 120 ms de resguardo cuando acaba de cancelar voz que estaba sonando.

Un resultado final limpia el estado visual y solicita `abort()` inmediatamente,
sin esperar `onend`. El texto y la consulta se procesan en ese momento; la respuesta
hablada espera a que termine el audio o a un resguardo máximo de 250 ms tras abortar.
Ese resguardo no retrasa el campo, la búsqueda ni la selección de destino. Al detectar
fin de habla, solicita `stop()` para recuperar el resultado final. Los intermedios
no eligen destinos. Un segundo toque en el dictado activo cancela la captura.

Elegir un resultado, escribir o cambiar pantalla/ocultar la app invalida dictados
anteriores. Elegir un lugar corta la captura antes de esperar la ruta por red.
Una actualización automática del origen por GPS no cancela un dictado en curso.
Tras dictar, la consulta omite el debounce de 350 ms de escritura y la espera por
sondeo de 400 ms; los lugares conocidos aparecen antes de esperar al servidor.
La lectura de resultados se dispara con la respuesta de búsqueda y descarta consultas
anteriores, sin temporizador de sondeo. El servicio de reconocimiento y la red
pueden seguir tardando; no hay promesa de tiempo mínimo del sistema ni de hardware.

Las pruebas con reconocimiento simulado comprueban cierre nativo retrasado 1.5 s,
selección con una ruta que no responde, ausencia de oscilador, consulta inmediata,
voz sin eco, resultados intermedios/viejos y cancelación. La función del navegador
conserva su servicio habitual; esto no convierte el dictado en procesamiento local.

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

Pruebas: `dictado-respuesta.cjs`, `voz-dictado.cjs`, `paradas-interfaz.cjs`, `paradas.test.cjs` y
`paradas-navegador.cjs`, además de regresiones de cámara/toques/tutorial/precios.
No verificado: audio real de iPhone, voz del lector del sistema entrando al micrófono,
la caminata real ni las otras paradas de la captura. Un bloqueo transitorio de cámara
no quedó reproducido; cierre/reentrada y descarga/caché se probaron en Chromium.
