<p align="center">
  <img src="docs/logo.png" alt="Grieta" width="520">
</p>

Uber, DiDi e inDrive cobran distinto por el mismo viaje. Grieta estima cuánto debería costar el
tuyo en cada app, a esa hora y en esa zona, para que sepas cuál conviene y si un precio está
inflado.

Los precios se capturan a mano en 32 rutas de Querétaro y un modelo propio aprende de ellos.
Grieta no está afiliada a Uber, DiDi ni inDrive.

## Qué hace

- **¿Lo pido ya o espero?** Grieta estima cuánto va a costar tu viaje en cada app ahora y más
  tarde, según cómo suele cambiar el precio a lo largo del día en esa ruta. Si esperar sale más
  barato, te dice cuánto ahorras; si no, que lo pidas ya.
- **Camión o app.** Junto al viaje en app pone la opción de ir en Qrobus o de combinar los dos,
  con cuánto ahorras y cuánto tiempo más te toma.

Por ahora están listas la captura de precios, el modelo y la API; la app para el usuario sigue en
construcción.

## Partes

| Carpeta | Qué es | Con qué |
|---|---|---|
| [`captura/`](captura) | App web con la que el equipo registra los precios de las tres apps | Next.js, Cloudflare Workers y D1 |
| [`modelo/`](modelo) | Dataset, entrenamiento y evaluación del modelo de precios | Python, pandas y scikit-learn |
| [`api/`](api) | Backend con lugares, rutas, registros, cotizaciones y consultas | Express, Sequelize y SQLite |

Cada carpeta tiene su README con lo necesario para correrla.
