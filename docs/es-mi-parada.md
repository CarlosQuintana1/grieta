# ¿Es mi parada?

Para quien no ve el letrero o no está segura de qué lado de la calle está. Funciona dentro de la guía, al ir a la
parada o esperando el camión. Nada sale del teléfono.

## Por qué hace falta

Con los horarios oficiales de Qrobus (`datos/qrobus.json`), de 7,749 combinaciones de parada y sentido, 4,100 (53 %)
tienen enfrente, a menos de 120 m, otra parada de la misma línea que va en sentido contrario. La separación mediana
es de 45 m y el 10 % está a 17 m o menos. El GPS de un teléfono suele fallar 10 m o más, y antes la guía decía
"llegaste a la parada" a menos de 40 m sin revisar el lado. En 1,466 de esas parejas (36 %) las dos paradas se llaman
igual, así que el letrero tampoco distingue el lado.

## Cómo decide

1. **GPS contra la parada de enfrente** (`Grieta.revisarParada`). Solo afirma "sí" o "estás enfrente" si la diferencia
   de distancias supera el error que reporta el GPS (mínimo 8 m) y ese error es menor que la separación entre las
   paradas. Si no, dice que no está seguro y por qué.
2. **Al llegar**, la guía revisa el lado antes de decir "llegaste"; si parece la de enfrente, avisa y no cuenta llegada.
3. **Letrero con la cámara**: si lee el nombre de la parada propia o de la de enfrente y los nombres son distintos,
   dice cuál es; si se llaman igual, lo aclara y sugiere la brújula.
4. **Brújula** (experimental): de frente a la calle, compara hacia dónde mira el teléfono con hacia dónde queda la
   calle desde la parada propia. Ese rumbo sale de la geometría real: el sentido del camión al salir y el lado donde
   está la parada de enfrente. Cuando no se distingue, usa la circulación por la derecha. En los datos, la parada de
   enfrente queda a la izquierda del sentido del camión en 82 % de las parejas, al revés en 7 % y alineada en 11 %.

## Límites

No verificado en la calle ni en iPhone o Android. La brújula se desvía cerca de metal y coches. Las coordenadas de
paradas vienen del horario oficial y pueden estar corridas. Si no está segura, la app lo dice en vez de adivinar.

Pruebas: `pruebas/es-mi-parada.test.cjs` (lógica) y `pruebas/es-mi-parada-navegador.cjs` (C21 en Orquídeas/Av. Sta
María del Pueblito: llegada, GPS bueno y malo, y brújula).
