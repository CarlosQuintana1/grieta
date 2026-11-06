# Avisos de la ciudad

`demo/datos/avisos-ciudad.json` guarda cierres, desvíos y eventos que afectan un viaje. La app muestra un aviso
solo si está vigente y el viaje (origen, destino o el recorrido del camión) pasa dentro de su radio.

Cada aviso lleva fuente oficial (AMEQ, ameq.live, @obrastrenqro, municipio) y fechas. Si no hay fuente con
fecha y lugar claros, no se agrega: un aviso inventado es peor que ninguno.

```json
[
  {
    "titulo": "Cierre de carriles en Bernardo Quintana por obras del tren",
    "detalle": "Las rutas C57, C63, T02 y T13 siguen su recorrido; puede haber retraso.",
    "lat": 20.6, "lon": -100.37, "radio_m": 800,
    "desde": "2026-11-10", "hasta": "2026-11-30",
    "fuente": "AMEQ, ameq.live"
  }
]
```

El 2026-11-05 no encontré avisos oficiales vigentes para noviembre; el archivo quedó vacío.
