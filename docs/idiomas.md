# Idiomas de la interfaz

La interfaz usa catálogos estáticos del teléfono. No manda ubicaciones, reportes, precios,
fotos ni texto de cámara a un traductor. La voz de Grieta continúa en español y recupera
los textos originales con `Interfaz.original`.

- `demo/idiomas/es.json`: textos fuente, contexto, variables y selectores.
- `demo/idiomas/otq.json`: 685 traducciones automáticas anteriores, sin revisión lingüística.
  Es parcial frente al catálogo actualizado; los mensajes faltantes siguen en español.
- `demo/idiomas/nhe.json`: borrador vacío de náhuatl de la Huasteca oriental, desactivado.
  El dueño pidió dejar pendiente el catálogo. No contiene traducciones fingidas.

El perfil muestra Español, Hñöñho (Otomí) y Náhuatl. Náhuatl permanece desactivado con
“Náhuatl pendiente de traducción”. No cambia la pantalla a español simulando una traducción.
El motor puede cargar su catálogo cuando esté completo y tenga revisión o procedencia
automática explícita. Los botones de lengua conservan sus nombres para poder regresar.

## Completar náhuatl

1. Traducir cada campo `nhe`, conservando la clave y el texto `es` correspondiente.
2. Conservar exactamente `{variables}`, nombres de marcas, cantidades, claves de ruta y horas.
   Los nombres de calles y lo escrito por la persona son variables que no se traducen.
3. Documentar la variante y el proveedor real en `fuente`; para automático: `tipo: automatica`,
   `nombre` y una `url` HTTPS comprobable. `provisional: true`, `revision: null`.
   Una revisión de hablante se registra en `revision` solo cuando exista.
4. Marcar `completa: true`, `parcial: false`, ejecutar `node scripts/revisar-idiomas.cjs --exigir nhe`
   y las pruebas de idioma y navegador. Conservar el aviso provisional.
5. Subir la versión del service worker y verificar actualización y caché sin red antes de publicar.

La disponibilidad de náhuatl en Google Translate está documentada en
https://support.google.com/translate/answer/15139004.
No se comprobó acceso a una API de Google Cloud para esa lengua. La consulta gratuita fue
rechazada. Se descartó NiuTrans: la muestra produjo campos vacíos y contenido ajeno al original;
no se incluyeron esas respuestas en la app. Esto no bloquea preparar el catálogo con otra fuente
que funcione o una traducción proporcionada por hablantes.

## Verificación

`node scripts/revisar-idiomas.cjs` informa cobertura y rechaza catálogos declarados activos
que no pasan la integridad. `--exigir nhe` falla mientras siga pendiente.
`node --test pruebas/idioma.test.cjs` comprueba procedencia, variables, números, marcas,
rechazo de textos vacíos y almacenamiento sin red. La suite de navegador comprueba selección,
persistencia, regreso a español, un catálogo sintético identificado como prueba y los nuevos
flujos de cámara/tutorial. Ese catálogo no es una traducción ni se publica.

No verificado: corrección lingüística, iPhone, VoiceOver/TalkBack reales y voz en náhuatl.
