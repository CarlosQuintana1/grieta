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
`http://localhost:3000/api`, con 20 rutas.

En local usa SQLite (`database.sqlite`). Para la nube basta con definir `DATABASE_URL` con la
cadena de conexión de la base.

## Pruebas

```
npm test
```

Son 18 pruebas de las rutas sobre una base en memoria, así que no tocan `database.sqlite`. En
`postman/` está la colección con todas las rutas, en el orden en que las probamos.

## Tablas

`usuarios`, `lugares`, `rutas`, `registros`, `cotizaciones` (un precio por app en cada registro)
y `consultas`. Un lugar, una ruta o un usuario que ya tienen datos ligados no se pueden borrar;
las cotizaciones sí se borran junto con su registro.
