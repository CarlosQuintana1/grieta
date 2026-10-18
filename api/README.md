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

Son 30 pruebas de las rutas sobre una base en memoria, así que no tocan `database.sqlite`. En
`postman/` está la colección con todas las rutas, en el orden en que las probamos.

## Estructura

`src/modelos.js` define las tablas con Sequelize. Cada tabla tiene su controlador en
`src/controladores/` y sus rutas en `src/rutas/`; `src/rutas/index.js` las monta bajo `/api`.

## En la nube

En Azure corre en App Service, con la base en Azure Database for PostgreSQL y las fotos en Azure
Blob Storage. La función serverless que cotiza un viaje está en `../nube/cotizar` (Azure
Functions). Variables: `DATABASE_URL`, `AZURE_STORAGE_CONNECTION_STRING` y `AZURE_CONTAINER`.

## Tablas

`usuarios`, `lugares`, `rutas`, `registros`, `cotizaciones` (un precio por app en cada registro),
`consultas`, `reportes` (problemas de accesibilidad y referencias de las paradas, con foto) y
`precios_reportados` (lo que le salió a alguien al pedir en una app). Un lugar, una ruta o un usuario que ya tienen datos ligados no se pueden borrar;
las cotizaciones sí se borran junto con su registro.

## Fotos

`POST /api/reportes/:id/foto` recibe la imagen como cuerpo de la petición (JPG, PNG o WebP, hasta
5 MB). Con `S3_BUCKET` definido se sube a S3 con el SDK de AWS; sin él se guarda en `uploads/` y se
sirve en `/fotos`, para probar en local.
