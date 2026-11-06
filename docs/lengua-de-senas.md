# Guía en Lengua de Señas Mexicana (LSM)

La guía puede mostrar, junto a cada aviso, un video corto en LSM. Los videos los graba una persona intérprete
certificada; no se generan ni se sacan de internet. Hasta tenerlos, `demo/datos/lsm.json` va vacío y la guía no
muestra nada.

Cada video va en `demo/datos/lsm/<id>.mp4` (vertical, sin audio, de 3 a 6 segundos, en bucle) y se registra en
`demo/datos/lsm.json`:

```json
{ "llegaste_parada": "datos/lsm/llegaste_parada.mp4" }
```

Primeras 10 frases a grabar, las que más se repiten en un viaje:

| id | Frase |
|---|---|
| camina_parada | Camina a la parada |
| llegaste_parada | Llegaste a la parada |
| aviso_pasar | Te aviso cuando esté por pasar |
| ya_casi | Ya casi |
| espera_siguiente | Si puedes, espera la siguiente |
| faltan_paradas | Faltan paradas |
| preparate_bajar | Prepárate para bajar |
| bajate | Bájate aquí |
| transbordo | Bájate aquí y cambia de camión |
| llegaste | Llegaste |

Las partes con datos del viaje (número de línea, hora, nombre de la parada) siguen en texto: el video muestra la
instrucción y la pantalla los datos.
