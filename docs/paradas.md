# Paradas: candidatas por radio y horarios sin confundir identidad

`pasanAqui` consultaba paradas con próximas salidas, ordenadas por distancia en línea
recta, y devolvía solo tres. La app podía reducir el resultado ampliado de 1 km a una
sola candidata antes de comparar caminatas. Eso no demuestra cuál parada queda más
cerca caminando. El motor no conoce barreras ni rutas peatonales.

## Contrato del motor

```js
Grieta.pasanAqui(lat, lon, dia, minuto, radio = 350, limite = 3);
// Integración sugerida: pedir hasta ocho candidatas con salidas registradas.
const candidatas = Grieta.pasanAqui(lat, lon, dia, minuto, 1000, 8);
```

El límite se aplica después del filtro de salidas. Es un entero de 0 a 12; valores
mayores se acotan a 12 e inválidos conservan el valor 3. El radio sigue siendo en
metros de línea recta y no se amplía automáticamente. Los campos existentes se
conservan: `{ i, nombre, lat, lon, m, lineas }`.

```js
const fisicas = Grieta.paradasCercanas(lat, lon, 1000, 8);
const lineas = Grieta.horariosParadaPorIndice(fisicas[0].i, dia, minuto);
```

`paradasCercanas` devuelve candidatas físicas del catálogo con el mismo límite,
ordenadas por distancia lineal y sin filtrar horarios. Solo devuelve
`{ i, nombre, lat, lon, m }`: no afirma operación, accesibilidad ni caminata real.
Una consulta vacía de horarios significa **sin próximas salidas registradas en ese
horario**, no que la parada no exista ni que se haya confirmado ausencia de servicio.
Una parada física también puede estar fuera de este catálogo parcial.

`horariosParadaPorIndice` usa exclusivamente el índice del catálogo cargado;
no persistir ese índice como ID entre versiones. Distingue paradas con coordenadas
idénticas. Devuelve horas absolutas en el mismo eje que `minuto`: una llegada
`1430 + 20 = 1450` y una salida del día siguiente a las 00:20 producen `1460`, con
espera `1460 - 1450 = 10`. Conserva madrugada, viajes GTFS mayores a 24:00,
cambio de semana y desplazamientos de varios días.
`horariosParada(lat, lon, dia, minuto)` ahora elige primero la parada física más
próxima a esas coordenadas dentro de 1 m y consulta únicamente sus horarios.
Antes podía saltársela por no tener salidas y tomar los de una vecina. Con
coordenadas exactamente compartidas se prefiere la API por índice. La API antigua
por coordenadas conserva horas relativas al día consultado (`20` en el ejemplo);
para comparar contra una llegada absoluta se debe usar `horariosParadaPorIndice`.
`pasanAqui` devuelve horas absolutas si se le entrega `minuto > 1440`.

## Evidencia y cobertura

Auditoría local de `demo/datos/qrobus.json` y el GTFS ya disponible. Sin descargas,
sin coordenadas de personas y sin modificar el catálogo. Totales y hashes en
`paradas-cobertura.json`:

| Fuente | Paradas | Rutas |
| :-- | --: | --: |
| GTFS físico (`stops.txt` / `routes.txt`) | 2694 | 217 |
| Con horarios/viajes en ese GTFS | 2610 | 117 |
| Exportación de la demo | 2610 | 117 |
| Sin horarios/viajes y fuera de la exportación | 84 | 100 |

Las 2610 paradas exportadas coinciden exactamente con las referenciadas en
`stop_times.txt` (nombre y coordenadas redondeadas a seis decimales).
El exportador selecciona `sorted(set(h["stop_id"]))` y genera patrones de los viajes
con horarios. No hay evidencia de que esas 84 paradas o 100 rutas estén operando hoy;
no se agregan ni se inventan horarios. Hay 53 paradas exportadas usadas solo como
terminales, sin subida a un siguiente tramo.

Vigencia del calendario y JSON: `20261017`. `feed_info.txt` declara `20260324`;
son fechas distintas y ambas anteriores a la auditoría del 2026-11-04. El motor
consulta el horario semanal almacenado, no garantiza servicio actual ni posición de
camiones en vivo. El JSON carece de IDs GTFS originales, versión de feed y declaración
de cobertura física completa; expone únicamente `vigencia`, servicio por día y datos.

No es posible confirmar una parada real más cercana con estos conteos o con una
captura de pantalla. La auditoría no reconstruye ubicaciones personales.

## Integración y siguiente paso

La UI puede comparar las ocho candidatas y describir el resultado como «menor
caminata entre las consultadas». Si existe alguna parada dentro de 350 m, limitarse
a ese radio todavía puede excluir otra a 450 m lineales con menor caminata real.
Un `slice(0, 1)` antes de resolver caminos impide cualquier comparación posterior.
Esta corrección no modifica la selección ni los textos de la UI.

**PENDIENTE: actualizar y documentar la cobertura/vigencia del catálogo.** Una futura
API propia podría separar `GET /paradas` (geometría e IDs físicos) de
`GET /paradas/:id/horarios` (fecha, zona horaria, vigencia y estado de datos).
Son contratos propuestos, no endpoints existentes ni fuentes verificadas en vivo.
La respuesta debe incluir fuente, versión, fecha de actualización, cobertura conocida
y distinguir «sin datos» de «sin salidas registradas» y de servicio confirmado.

## Verificación

Fixture genérico de diez casos: valor por defecto, ocho candidatas, máximo doce,
radio, límites inválidos, identidad de parada, cambios de día y filtro por salidas.
Antes del cambio se reprodujeron `3 !== 8` y la consulta que tomaba horarios vecinos.
Con el cambio pasan las 10 pruebas de paradas, incluidas las regresiones de
medianoche. La suite completa y tarifas se vuelven a verificar al cerrar el cambio.

```sh
node --check demo/grieta.js
node --test pruebas/paradas.test.cjs pruebas/precios.test.cjs
node --test pruebas/*.test.cjs
GRIETA_URL=http://127.0.0.1:8816 node pruebas/paradas-navegador.cjs
```

La prueba de navegador usa Playwright/Chromium con `NODE_PATH` y
`CHROMIUM_EXECUTABLE` configurados. Carga el motor real y un fixture genérico servido
en memoria; no carga la UI ni pide geolocalización. Comprueba límites, consulta exacta,
solicitudes GET locales y ausencia de errores JS. No verifica una caminata real.
