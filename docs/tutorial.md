# Tutorial de primer uso

Al terminar la bienvenida, aparecen tres pasos: buscar/comparar e iniciar una guía,
consultar camiones cercanos y usar cámara/modo Voz. Se puede continuar, regresar o
saltar. `Saltar bienvenida` respeta la salida directa. La preferencia queda solo en
`grieta-tutorial` del teléfono; se puede volver a abrir desde Ajustes → Ver tutorial.

El tutorial no pide cámara/GPS, inicia viajes ni envía reportes. En modo Voz usa
la voz configurada; con lector no habla encima. El último paso ofrece la práctica
existente de toques y regresa al mismo paso. Conserva fichas, tipografía y colores
existentes. Figma no tiene esta pantalla; se reutiliza el sistema de bienvenida.

Verificado en Chromium a 390×844 y 320×844, claro, oscuro, letra grande y modo Voz:
primer acceso completo, salida, persistencia, reapertura, foco en títulos, regreso,
práctica y gestos. Un toque describe; dos activan. Sin lector real, se comprobó
configuración de lector sin narración duplicada. Sin errores JS ni escrituras API.
Actualización 75→76 y tutorial sin internet comprobados con service worker real.

Pruebas: `pruebas/tutorial-idiomas.cjs`, `pruebas/tutorial-actualizacion.cjs`.
No verificado: iPhone físico ni VoiceOver/TalkBack reales.
