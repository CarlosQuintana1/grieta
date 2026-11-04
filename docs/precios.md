# Rangos habituales de precios

Desde la versión 75 muestro **Rango habitual** para Uber, DiDi e inDrive: la banda
central entre los percentiles 25 y 75 de sus residuos históricos en logaritmo.
Antes se mostraban los percentiles 5 y 95. El aviso aclara que el precio puede salir
del rango y debe confirmarse en la app del proveedor. No es una tarifa en tiempo real.

Usé las 3,122 capturas válidas de 1,082 momentos y 28 días, hasta 2026-10-26,
filtradas por `entrenar_modelo.cargar`. La nueva exportación conserva exactamente
todos los valores anteriores del modelo: coeficientes, precio central y banda amplia.
Solo agrega `rango_habitual` por proveedor y `cuantiles_habitual: [0.25, 0.75]`.
`Tarifa.rangos_habituales` y `exportar_demo.modelo()` los reproducen desde el dataset.
No se publican filas, capturistas ni datos personales.

El motor entrega la banda nueva separada como `habitual`. La interfaz la usa en
comparación, detalle, voz y pasos en app. Para combinaciones, suma las bandas de
cada tramo sin redondear hasta el total; esa suma no tiene una cobertura conjunta
calibrada. Ranking, ahorros y decisiones siguen usando el mismo precio central.
La tarifa fija de Qrobus no cambia. Con datos antiguos o una banda nueva inválida,
usa la banda amplia y mantiene la etiqueta «Precio estimado».

Ejemplo de regresión: Juriquilla–Centro, 19 km, miércoles a las 17:00. No es una
cotización actual de los proveedores:

| App | Antes | Rango habitual |
|---|---|---|
| inDrive | $88–138 | $98–119 |
| DiDi | $93–216 | $109–147 |
| Uber | $129–219 | $153–189 |

## Validación temporal

Se entrenó un modelo con los primeros 22 días y se comprobaron las 638 capturas de
los últimos 6 días (21–26 de octubre). El informe está en `precios-validacion.json`.
La banda habitual incluyó 47.7% de precios de Uber, 45.3% de DiDi y 36.2% de inDrive;
la banda amplia incluyó 86.0%, 82.2% y 81.4%, respectivamente. La anchura media se
redujo de $63.62 a $24.88, de $95.06 a $29.23 y de $39.59 a $15.75.

Es una banda descriptiva más corta, no una mejora de precisión ni una garantía de
cobertura futura. No equivale a un mínimo/máximo del proveedor. Los precios fuera
del rango son esperables. La etiqueta y el aviso siguen en español si el catálogo
provisional de otomí no tiene esas frases; los importes conservan su traducción.


## Comprobación de la interfaz

94 pruebas unitarias aprobadas. Navegador: comparación y detalle de tres apps,
comparador, pasos combinados, voz/etiquetas y Tarifa Unidos; 390/320 px, oscuro/claro,
letra grande, fácil y modo voz, sin desbordes ni errores JS. Se conservan los importes
al cambiar español/otomí y la banda amplia al cargar un modelo antiguo.
Actualización 74 → 75 comprobada con modelo y motor nuevos disponibles sin conexión.
Comparada con Opciones para llegar en Figma: se conservan los componentes actuales,
monogramas y mapa real; solo cambian la banda, su etiqueta y el aviso.
