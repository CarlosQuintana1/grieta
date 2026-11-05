# Idiomas de la interfaz

La interfaz usa catálogos estáticos del teléfono. No manda ubicaciones, reportes, precios,
fotos ni texto de cámara a un traductor. La voz continúa en español y recupera los textos
originales con `Interfaz.original`.

- `demo/idiomas/es.json`: 1,101 textos fuente, contexto, variables y selectores.
- `demo/idiomas/otq.json`: 685 traducciones automáticas anteriores de otomí, sin revisión
  lingüística. Es parcial; los mensajes faltantes siguen en español.
- `demo/idiomas/nhe.json`: 1,101 textos de náhuatl de la Huasteca oriental, obtenidos en
  Google Traductor el 4 de noviembre de 2026. Traducción automática provisional,
  sin revisión de hablantes. Algunas palabras conservan la salida española del proveedor.

El perfil permite cambiar entre Español, Hñöñho (Otomí) y Náhuatl. La elección persiste y
los botones de lengua conservan sus nombres para poder regresar. El aviso provisional
permanece visible; seleccionar náhuatl no activa voz en esa lengua.

## Procedencia y actualización

Se usó la interfaz web de https://translate.google.com/?sl=es&tl=nhe&op=translate,
en diez bloques de textos públicos de la app. Se protegieron variables, números y marcas
antes de traducir y se restauraron exactamente después. No se usaron datos de personas.
Los nombres de calles, rutas, horas y campos escritos siguen siendo variables protegidas.

Google documenta la variante en https://support.google.com/translate/answer/15139004.
No se comprobó acceso de Google Cloud Translation para esta lengua. Las pruebas anteriores
con la consulta gratuita y NiuTrans no forman parte del catálogo publicado.

Al añadir textos, actualizar la fuente y el catálogo de cada lengua. Para automático:
`fuente.tipo: automatica`, nombre y URL reales, `provisional: true`, `revision: null`.
Registrar revisión de hablantes solo cuando exista. No declarar completo un catálogo parcial.
Subir la versión del service worker para renovar la copia guardada en los teléfonos.

## Verificación

`node scripts/revisar-idiomas.cjs --exigir nhe` exige cobertura completa y valida variables,
números, marcas y procedencia. `node --test pruebas/idioma.test.cjs` también comprueba
rechazo de textos vacíos y almacenamiento de los catálogos sin red.
La revisión de navegador cubre cambio/regreso, persistencia, cámara, tutorial y 390/320 px.

No verificado: corrección lingüística, iPhone, VoiceOver/TalkBack físicos y voz en náhuatl.
