# Grieta: captura

App web con la que el equipo registra cuánto cobran Uber, DiDi e inDrive por la misma ruta al
mismo tiempo, en Querétaro. De aquí salen los datos del modelo.

## Correrla

```
npm install
npx wrangler dev
```

Levanta la app y el Worker juntos en :8787. `npm run dev` sirve solo para la interfaz: sin el
Worker no hay `/api/sync`. Para entrar hace falta el código del equipo, que en local va en
`.dev.vars` como `CODIGO_EQUIPO`.

Se instala en el celular desde el navegador con "Agregar a pantalla de inicio" y funciona sin
internet: guarda en IndexedDB y sube cuando vuelve la señal.

## Cómo se captura

Se elige una ruta, se pulsa Empezar, se abren las apps y se anotan los precios antes de que se
acaben los 3 minutos. Cada registro necesita las tres apps, y la misma ruta no se puede repetir antes de 2 minutos. Las reglas completas están en
[PROTOCOLO.md](PROTOCOLO.md).

## Lugares

Las 32 rutas salen de 16 pares entre estos lugares, repartidos por la ciudad:

| Zona | Lugares |
|---|---|
| Norte | Facultad de Informática UAQ, Los Olivos Santa Fé, Antea Lifestyle Center, Jurica, Uptown Juriquilla |
| Centro | Jardín Zenea, Terminal de Autobuses de Querétaro, Tecnológico de Monterrey Campus Querétaro |
| Sur | Plaza Centro Sur, Fresko Milenio III, Walmart El Pueblito, Mercado Lomas de Casa Blanca |
| Oriente | Plaza Ubika El Refugio, Cafelé Zibatá, Aeropuerto Intercontinental de Querétaro |
| Poniente | Bodega Aurrera Tintero |

## Publicarla

```
npm run deploy
```
