# Tocar para escuchar

En **modo Voz**, con **Quiero que Grieta me hable** y la opción **Tocar para escuchar** activa:

- Un toque sobre un botón u opción lee su nombre, estado y ayuda disponible; no lo activa.
- Dos toques seguidos sobre el mismo control lo activan. La ventana entre toques es de 650 ms.
- Cambiar de control vuelve a describir; dos controles distintos no forman un doble toque.
- Si escucho la descripción completa antes de actuar, después doy dos toques rápidos en ese control.

Se puede desactivar en **Ajustes → Voz → Tocar para escuchar**. La preferencia queda en el teléfono.
El Inicio explica el gesto y se anuncia al activar Voz. La selección muestra un contorno visible.
Si la voz está apagada, se respeta esa preferencia; se conserva la selección y el aviso accesible.

## Lector del teléfono

Con **Uso lector de pantalla**, el filtro propio se desactiva: VoiceOver/TalkBack manejan la
exploración y activación. La selección de lector en bienvenida/perfil queda fuera del filtro para
poder configurarlo sin pedir otro doble toque. Grieta tampoco reactiva su voz encima del lector al
volver a seleccionar modo Voz desde Ajustes.

Esto no es un lector de pantalla del sistema. El modo propio funciona dentro de Grieta y requiere
repetir el toque en el mismo control; VoiceOver/TalkBack pueden activar el elemento enfocado con sus
gestos nativos, incluso al tocar en otra parte. Para otras aplicaciones se usa el lector del teléfono.

## Comportamiento técnico

El primer clic de puntero se cancela en captura. El segundo se deja pasar como evento original del
navegador, conservando activación de usuario para cámara, archivos y enlaces a otras apps. No se
reemplaza por un `.click()` artificial. Las etiquetas de controles nativos tienen un único pase para
su clic derivado, evitando activar dos veces o pedir cuatro toques.

Los campos de edición no reciben foco ni abren teclado en el primer toque. Los controles
inhabilitados se describen y no se activan. Arrastrar para desplazar cancela la secuencia; se conserva
el desplazamiento y el zoom con dos dedos. Navegación, cambios de perfil y teclado limpian selección.

Enter/Espacio, navegación por teclado, activaciones accesibles con `detail: 0`, clics de la propia app
y gestos del sistema no reciben otro filtro. Se conservan los clics modificados y botones secundarios.
Las descripciones propias usan los textos españoles originales y no reemplazan el último aviso que
lee Repetir. Al activar una opción se confirma su nuevo estado. La narración normal de cámara
espera mientras se describe un control, sin pausar el reconocimiento ni las alertas de vehículos.
El contenido escrito en campos no se utiliza como nombre de control.

## Comprobaciones

`pruebas/toques.cjs`, con Playwright y `GRIETA_URL`/`CHROMIUM_EXECUTABLE`, usa entrada táctil del navegador:
lectura sin navegación, activación única, intervalo, interruptores y etiquetas, edición, archivo,
ventana externa con evento confiable, teclado, scroll desde un botón, controles deshabilitados,
etiquetas traducidas, configuración de lector y persistencia al desactivar. Comprueba también que
el primer toque no solicite cámara y el doble sí, con permiso rechazado y motores simulados.

Se revisan 390 px y 320 px, letra grande y tema claro, sin errores JS ni desbordamiento. Los catálogos
de idioma y la caché se revisan con las pruebas existentes. La instalación de una versión renueva
las descargas de la app para no conservar código anterior del caché HTTP. La prueba de actualización
espera al controlador activo y al contenido nuevo antes de probar los gestos sin red. No se envían reportes ni datos a producción.
No verificado: VoiceOver/TalkBack reales, teclado virtual físico y selector de archivos/cámara en
Safari de iPhone o Chrome de Android. La simulación táctil de Chromium no sustituye esas pruebas.

## Referencias

- [Gestos de VoiceOver](https://support.apple.com/guide/iphone/iph3e2e2281/ios)
- [Gestos de TalkBack](https://support.google.com/accessibility/android/answer/6151827?hl=es)
- [Cancelación del puntero](https://www.w3.org/WAI/WCAG22/Understanding/pointer-cancellation.html)
