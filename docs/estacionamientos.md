# Estaciona y sigue en Qrobus

Para viajes al Centro Histórico desde más de 4 km, Grieta propone dejar el carro en un estacionamiento junto a una
parada y entrar en camión. Los estacionamientos salen de OpenStreetMap:

```
curl -A "grieta-demo/1.0" -X POST https://overpass-api.de/api/interpreter \
  --data-urlencode 'data=[out:json][timeout:90];(nwr["amenity"="parking"](20.4,-100.65,20.9,-100.15););out center tags;' -o parkings.json
python3 scripts/estacionamientos.py parkings.json
```

El script deja en `demo/datos/estacionamientos.json` los que no son privados ni "solo clientes", no están sobre la calle,
quedan a 150 m o menos de una parada con recorridos y a más de 2.5 km del Centro. El 2026-11-05 salieron 124 de 517.
Casi ninguno tiene nombre, así que la app los nombra por su parada. OpenStreetMap no dice horario ni costo: la app
pide confirmarlos.

En la app solo se cuentan los que quedan en el camino (rodeo de 20 % o menos), a 2 km o más del destino y a 800 m o más
del origen. Se prueban los 6 con menos rodeo y se queda el que llega antes, manejando a 28 km/h más 3 minutos para
estacionarse y siguiendo en un camión directo.
