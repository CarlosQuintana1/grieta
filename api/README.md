# Grieta: API

Backend de Grieta con Express 5 y Sequelize 6. Guarda los lugares y las rutas de Querétaro, los
precios que capturamos para cada ruta y las consultas que la gente hace en la app.

## Correrla

```
npm install
npm start
```

Al arrancar, Sequelize sincroniza el esquema (crea las tablas que falten) y, si la base está
vacía, carga el catálogo de 16 lugares y 32 rutas de `datos/`. La API queda en
`http://localhost:3000/api`, con 43 rutas: el CRUD completo de las 8 tablas más algunas de consulta.

En local usa SQLite (`database.sqlite`). Para la nube basta con definir `DATABASE_URL` con la
cadena de conexión de la base.

## Pruebas

```
npm test
```

Son 48 pruebas de las rutas sobre una base en memoria, así que no tocan `database.sqlite`. En
`postman/` está la colección con todas las rutas, en el orden en que las probamos.

## Estructura

`src/modelos.js` define las tablas con Sequelize. Cada tabla tiene su controlador en
`src/controladores/` y sus rutas en `src/rutas/`; `src/rutas/index.js` las monta bajo `/api`.

## En la nube

En Azure corre en App Service, con la base en Azure Database for PostgreSQL y las fotos en Azure
Blob Storage. La función serverless que cotiza un viaje está en `../nube/cotizar` (Azure
Functions). Variables: `DATABASE_URL`, `AZURE_STORAGE_CONNECTION_STRING`, `AZURE_CONTAINER` y
`AZURE_MAPS_KEY`, `CLAVE_ADMIN`, `VAPID_PUBLICO` y `VAPID_PRIVADO`.

Permisos: la app pública solo lee, busca (`/api/buscar`), reporta problemas (`POST /api/reportes` y su
foto), manda precios (`POST /api/precios-reportados`) y cuenta viajes en camión (`POST /api/viajes`). Crear, cambiar o borrar cualquier otra cosa, y
leer usuarios, precios reportados y consultas, pide el encabezado `X-Clave-Admin` con `CLAVE_ADMIN`;
sin esa variable nadie puede. La foto de un reporte se sube una vez, en los 15 minutos después de
crearlo, y cada persona puede mandar 30 envíos por hora. En Postman la clave va en la variable
`claveAdmin` de la colección.

`GET /api/buscar?q=...` busca lugares en Azure Maps, que conoce negocios y oficinas que no están en
OpenStreetMap (como los módulos del INE). La llave solo vive en el servidor. Las respuestas se guardan
un día y la ruta se frena en 4,500 búsquedas al mes, antes de las 5,000 gratis del plan Gen2. Sin
`AZURE_MAPS_KEY` responde 503 y la app busca solo con Photon.

`POST /api/camiones/avisos` guarda lo que alguien ve en la parada ("ya pasó" o "viene lleno" de una
línea) y `GET /api/camiones/avisos?lat=&lon=` trae los de esa parada. Valen media hora y viven en memoria,
sin tabla.

`POST /api/viajes` cuenta un viaje en camión que alguien empezó con la guía. Solo recibe los km; el CO₂
se calcula aquí con 135.7 g/km (meta de la NOM-163-SEMARNAT-ENER-SCFI-2013 para autos nuevos). No guarda
lugares, hora, usuario ni IP. `GET /api/impacto` devuelve la suma (viajes, km y kg de CO₂) que muestra el inicio.
Con la clave del equipo, `POST /api/viajes/demo` mete un viaje marcado como demostración (para que el
contador no arranque vacío en una presentación) y `DELETE /api/viajes/demo` los borra todos.

`GET /api/camiones/ocupacion?lineas=L55,C69` dice qué líneas suelen ir llenas a esta hora: cada "viene lleno" se
guarda solo con la línea, la fecha y la hora (sin ubicación ni persona), y una línea cuenta si lo avisaron en al menos
3 días distintos de las últimas 8 semanas, a la misma hora y en el mismo tipo de día (entre semana o fin).

`GET /api/auto?olat=&olon=&dlat=&dlon=` da cuánto tarda el viaje en auto con el tráfico de ahorita (Azure Maps, con
`AZURE_MAPS_KEY`). Cada respuesta se guarda 10 minutos y se frena en `TOPE_RUTAS_MES` consultas al mes (1,000 por
omisión); sin llave responde 503.

`POST /api/notificaciones` programa avisos push para el viaje (que pasa el camión, que ya casi llegas) y
los manda a su hora aunque el teléfono esté bloqueado; `POST /api/notificaciones/cancelar` los quita al
terminar el viaje. Sin las llaves VAPID responden 503 y la app sigue con voz y vibración. Las llaves se
generan con `npx web-push generate-vapid-keys`.

## Tablas

`usuarios`, `lugares`, `rutas`, `registros`, `cotizaciones` (un precio por app en cada registro),
`consultas`, `reportes` (problemas de accesibilidad y referencias de las paradas, con foto) y
`precios_reportados` (lo que le salió a alguien al pedir en una app). Un lugar, una ruta o un usuario que ya tienen datos ligados no se pueden borrar;
las cotizaciones sí se borran junto con su registro.

## Fotos

`POST /api/reportes/:id/foto` recibe la imagen como cuerpo de la petición (JPG, PNG o WebP, hasta
5 MB). Con `S3_BUCKET` definido se sube a S3 con el SDK de AWS; sin él se guarda en `uploads/` y se
sirve en `/fotos`, para probar en local.
