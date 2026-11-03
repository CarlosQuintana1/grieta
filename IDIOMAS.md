# Idioma escrito de Grieta

La interfaz y el audio usan preferencias separadas: `acc.idioma` para la pantalla y `acc.lengua` para
los avisos. El selector del perfil guarda el idioma escrito. Si la preferencia anterior era otomí, se
conserva como preferencia de interfaz; no se activa ni se cambia el audio por elegir un idioma escrito.

El cambio a hñöñho todavía no está disponible. `demo/idiomas/otq.json` contiene mensajes pendientes,
con `otq: null`, `completa: false` y `revision: null`. No contiene traducciones ni debe presentarse como
una interfaz traducida. La tarea continúa pendiente hasta contar con los textos y comprobarlos.

## Catálogos

`demo/idiomas/es.json` registra los textos fuente, las claves, el contexto y las variables. En
`demo/idiomas/otq.json` se completa `otq` para cada clave. La traducción puede cambiar el orden de las
variables, pero debe conservar cada nombre y cada aparición. Por ejemplo, `{hora}` y `{lugar}` llevan
los datos del viaje; no son palabras que haya que traducir. Los contextos distinguen una instrucción,
un encabezado, una etiqueta o un nombre para lector de pantalla.

Las variables con `traducir: true` contienen otros mensajes de la interfaz. Las demás contienen datos
que se conservan. Los formatos de precio, número y hora ayudan a reconocer los límites entre variables.
Los nombres de lugares, calles, paradas, líneas y apps se mantienen. El contenido de reportes y los
nombres guardados tienen `translate="no"`; el mapa, sus créditos y la tarjeta para el chofer conservan
su contenido. Los datos internos y los enlaces no se traducen.

Antes de activar un catálogo hay que revisar las frases completas con hablantes de la variante que
se va a usar. Un diccionario no sustituye la revisión de las instrucciones de viaje. Después de esa
revisión se registra su referencia en `revision` y se cambia `completa` a `true`. El cargador exige todas
las claves fuente y rechaza textos vacíos, claves cambiadas y variables que falten o se repitan.
Si falta el archivo, falla su lectura o el catálogo está incompleto, la interfaz permanece en español
y el perfil lo explica. No se modifica `datos/config.json` ni se habilitan audios para este cambio.

El registro de IANA identifica `otq` como Querétaro Otomi:
https://www.iana.org/assignments/language-subtag-registry/language-subtag-registry
La variante y la escritura deben confirmarse al revisar los textos con hablantes; INALI documenta las
variantes y sus localidades:
https://www.inali.gob.mx/sitios/clin-inali/html/v_otomi.html

## Comprobación

`node --test pruebas/idioma.test.cjs` comprueba integridad de los catálogos, variables de viaje,
rechazo de traducciones pendientes y recuperación de los archivos de idioma desde la caché sin red.
La app carga el catálogo de texto por separado de las grabaciones. El worker guarda los dos catálogos
y `idioma.js` con los demás archivos de la app.

Para probar la sustitución de textos se usó un catálogo sintético en una copia temporal, fuera del
repositorio. Ese contenido no es otomí y no se publica. Se comparó la voz de un viaje completo contra
la versión anterior; la interfaz de prueba cambió y las frases enviadas a la voz siguieron en español.
La revisión visual final tiene que repetirse con la traducción real, también con letra grande y lector
de pantalla: las longitudes y la pronunciación de los textos reales todavía no se han comprobado.
