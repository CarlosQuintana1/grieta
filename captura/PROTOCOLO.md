# Protocolo de captura

Se acuerda antes de la primera fila y no se cambia a media captura. Con varias personas
capturando, la inconsistencia entre ellas arruina el dataset sin que nadie lo note hasta el
corte, cuando ya no hay cómo recapturar.

## Reglas

1. **Tipo de vehículo: siempre el más básico.** UberX, DiDi Express, inDrive económico.
   Un solo tipo. Comparar gamas distintas es comparar peras con manzanas.

2. **Origen y destino tienen que ser el mismo punto en Uber y en DiDi.** El proyecto compara
   plataformas para el MISMO viaje: si Uber te lleva a la entrada principal del Tec y DiDi a la
   prepa de enfrente, la diferencia de precio sale en parte del destino y no de la plataforma.
   Buscar por nombre NO garantiza esto: cada app tiene su propia lista de lugares y "Tec de
   Monterrey" da varias opciones distintas en cada una.
   **El nombre de cada lugar en la app es EXACTAMENTE lo que se escribe** en Uber y en DiDi.
   Se definieron como puntos de referencia concretos ("Walmart El Pueblito", no "El Pueblito")
   porque una zona tiene decenas de entradas y un negocio tiene una. Si una app da varias
   opciones, la app de captura dice cuál elegir al seleccionar la ruta. Si aun así el punto no
   coincide, reporta "El lugar no coincidía". No elijas uno al azar y lo registres como si nada.

3. **Precio: el que muestra la app antes de solicitar, sin descuento.** Cuando hay promoción,
   Uber pone el precio con descuento como el número grande y el real tachado y chico
   (por ejemplo $145.49 grande y ~~$149.96~~). **Se anota el tachado.** El descuento es de tu
   cuenta, no de la tarifa: el de tu compañero no lo tiene, y el modelo aprendería un precio
   que nadie más paga. Si no se ve el precio sin descuento, **ese campo se deja vacío**: una
   plataforma sin dato es mejor que una con el precio de la cuenta de alguien.
   Esa pantalla nunca trae propina (la propina se agrega después del viaje), así que no hay
   nada que declarar al respecto.

4. **Presiona Empezar ANTES de abrir la primera app.** El reloj mide desde Empezar hasta
   Guardar. Si cotizas primero y luego abres la captura, el reloj marca 10 segundos aunque
   entre Uber y DiDi hayan pasado 15 minutos, y no protege nada. Las tres apps van casi al
   mismo tiempo; pasados 3 minutos se descarta el momento completo y la app bloquea el guardado.

5. **Siempre las tres apps con precio.** Si una plataforma no da servicio o no está el tipo
   básico, no se guarda: se descarta y se elige otra ruta. Sin los tres precios no hay
   comparación completa.

   La misma ruta no se puede volver a capturar antes de 2 minutos. En dos minutos el precio casi
   no cambia: rinde más pasar a otra ruta y regresar después.

6. **Nada de texto libre.** Todo sale de la app: rutas del catálogo, precio numérico, banderas.

7. **Si hubo un problema, se reporta, no se borra.** Una fila reportada se revisa después; una
   fila borrada no existe. Solo tres cosas cuentan como problema:

   | Motivo | Cuándo |
   |---|---|
   | El lugar no coincidía | La app dio varias opciones, o puso el punto en otro lado |
   | La app falló o el precio cambió | Error, se trabó, o el precio saltó mientras cotizabas |
   | Otro | Algo distinto a los dos de arriba: se escribe qué pasó |

   **Y esto NO es problema, se captura normal:**
   - **Tarifa dinámica o "alta demanda".** Es exactamente lo que el modelo tiene que aprender.
     Reportarla haría que alguien la filtre después y el dataset perdería justo la señal que
     importa.
   - Precio caro en hora pico, con lluvia o de noche. También es señal.
   - Una plataforma sin servicio: eso va vacío, ver la regla 5.

## Muestreo

No se captura solo cuando es cómodo. Si todo cae entre semana a las 8 pm, el modelo solo sabe de
esa franja.

| Franja | Horario |
|---|---|
| Madrugada | 00-06 |
| Pico AM | 06-10 |
| Medio día | 10-14 |
| Tarde | 14-17 |
| Pico PM | 17-21 |
| Noche | 21-24 |

**La madrugada es la más incómoda, y por eso se asigna** a alguien, rotando. Sin capturas a esa
hora el modelo no sabe nada de ella, y eso no se recupera después. Se cotiza desde donde sea:
no hace falta estar en el origen.

Hay que cubrir tanto entre semana como fin de semana.

Ritmo: 4 o 5 momentos por persona al día. Un momento son 2 o 3 apps, es decir, 2 o 3 filas.

## Rutas

El catálogo son 16 pares que dan 32 rutas dirigidas: `A → B` y `B → A` son rutas distintas, no
la misma. El precio cambia según la dirección, y capturar un solo sentido pierde la mitad de la
información.

La pantalla de captura muestra cuántos registros lleva cada ruta. Elegir las que tienen menos es
lo que mantiene la cobertura pareja.

## Revisión

Una vez por semana, 15 minutos: abrir la vista de cobertura y revisar que ninguna franja se esté
quedando atrás y que no haya rutas en cero.
