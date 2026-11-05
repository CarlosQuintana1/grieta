'use strict';

const prueba = require('node:test');
const afirmar = require('node:assert/strict');
const { readFileSync: leerArchivo } = require('node:fs');
const { join: unirRuta } = require('node:path');
const { runInNewContext: ejecutarContexto } = require('node:vm');
const { decodificar, Avisador } = require('../demo/vision/hoyos.js');

const imagen = { ancho: 640, alto: 640 };
const vacio = () => new Float64Array(8400 * 6);

function cerca(actual, esperado, tolerancia = 1e-10) {
  afirmar.ok(Math.abs(actual - esperado) <= tolerancia, `${actual} != ${esperado}`);
}

function poner(vector, caja, opciones = {}) {
  const { paso = 8, celda = 0, objeto = 0.9, clase = 0.9 } = opciones;
  const columnas = 640 / paso;
  const inicio = paso === 8 ? 0 : paso === 16 ? 6400 : 8000;
  const indice = (inicio + celda) * 6;
  vector.set([
    caja.x / paso - celda % columnas,
    caja.y / paso - Math.floor(celda / columnas),
    Math.log(caja.w / paso), Math.log(caja.h / paso), objeto, clase
  ], indice);
  return indice;
}

function region(x = 0.1, y = 0.4, w = 0.1, h = 0.1, confianza = 0.9) {
  const centro = x + w / 2;
  return {
    tipo: 'hoyo', confianza, area: w * h, caja: { x, y, w, h },
    lado: centro < 1 / 3 ? 'izquierda' : centro < 2 / 3 ? 'centro' : 'derecha'
  };
}

function observar(avisador, regiones, ahora, extras = {}) {
  return avisador.actualizar(regiones, { ahora, capturada: ahora, fotograma: ahora, ...extras });
}

prueba('exporta CommonJS y global, y carga sin require en navegador', () => {
  afirmar.equal(globalThis.GrietaHoyosPolitica.Avisador, Avisador);
  const contexto = {};
  ejecutarContexto(leerArchivo(unirRuta(__dirname, '../demo/vision/hoyos.js'), 'utf8'), contexto);
  afirmar.equal(typeof contexto.GrietaHoyosPolitica.decodificar, 'function');
  afirmar.equal(typeof contexto.GrietaHoyosPolitica.Avisador, 'function');
});

for (const [paso, celda] of [[8, 817], [16, 209], [32, 63]]) {
  prueba(`decodifica offsets, rejilla, exponenciales y producto en stride ${paso}`, () => {
    const vector = vacio();
    poner(vector, { x: 180, y: 220, w: 80, h: 120 }, { paso, celda, objeto: 0.8, clase: 0.9 });
    const copia = vector.slice();
    const [salida] = decodificar(vector, imagen);
    afirmar.ok(salida);
    cerca(salida.confianza, 0.72);
    cerca(salida.caja.x, 140 / 640);
    cerca(salida.caja.y, 160 / 640);
    cerca(salida.caja.w, 80 / 640);
    cerca(salida.caja.h, 120 / 640);
    cerca(salida.area, 80 * 120 / 640 ** 2);
    afirmar.equal(salida.tipo, 'hoyo');
    afirmar.equal(salida.lado, 'izquierda');
    afirmar.deepEqual(vector, copia);
  });
}

prueba('acepta el tensor anidado 1 x 8400 x 6 y Float32Array plano', () => {
  const vector = vacio();
  poner(vector, { x: 320, y: 320, w: 100, h: 100 });
  const filas = Array.from({ length: 8400 }, (_, fila) => Array.from(vector.slice(fila * 6, fila * 6 + 6)));
  afirmar.deepEqual(decodificar([filas], imagen), decodificar(vector, imagen));
  afirmar.equal(decodificar(new Float32Array(vector), imagen).length, 1);
  filas[400] = [0, 0];
  afirmar.deepEqual(decodificar([filas], imagen), []);
});

prueba('usa sigmoides existentes y respeta el umbral inclusivo', () => {
  const vector = vacio();
  poner(vector, { x: 320, y: 320, w: 100, h: 100 }, { objeto: 0.5, clase: 0.8 });
  afirmar.deepEqual(decodificar(vector, imagen), []);
  cerca(decodificar(vector, { ...imagen, confianzaMinima: 0.4 })[0].confianza, 0.4);
  afirmar.deepEqual(decodificar(vector, { ...imagen, confianzaMinima: 0.40001 }), []);
});

prueba('quita letterbox inferior, recorta al contenido y normaliza contra la imagen original', () => {
  const vector = vacio();
  poner(vector, { x: 100, y: 100, w: 100, h: 100 });
  poner(vector, { x: 320, y: 320, w: 200, h: 200 }, { celda: 1, objeto: 1, clase: 1 });
  poner(vector, { x: 500, y: 400, w: 100, h: 400 }, { celda: 2 });
  poner(vector, { x: 620, y: 300, w: 100, h: 100 }, { celda: 3 });
  const salidas = decodificar(vector, { ancho: 1280, alto: 640 });
  afirmar.equal(salidas.length, 2);
  const izquierda = salidas.find(salida => salida.lado === 'izquierda');
  cerca(izquierda.caja.x, 50 / 640);
  cerca(izquierda.caja.y, 50 / 320);
  cerca(izquierda.caja.w, 100 / 640);
  cerca(izquierda.caja.h, 100 / 320);
  const derecha = salidas.find(salida => salida.lado === 'derecha');
  cerca(derecha.caja.x, 570 / 640);
  cerca(derecha.caja.w, 70 / 640);
  cerca(derecha.caja.y, 250 / 320);
  cerca(derecha.caja.h, 70 / 320);
  cerca(derecha.area, derecha.caja.w * derecha.caja.h);
});

prueba('quita letterbox derecho en imagen vertical y centros negativos', () => {
  const vector = vacio();
  poner(vector, { x: 100, y: 500, w: 100, h: 100 });
  poner(vector, { x: 320, y: 400, w: 400, h: 100 }, { celda: 1 });
  poner(vector, { x: -1, y: 200, w: 400, h: 100 }, { celda: 2 });
  poner(vector, { x: 100, y: -1, w: 100, h: 400 }, { celda: 3 });
  const [salida, ...resto] = decodificar(vector, { ancho: 640, alto: 1280 });
  afirmar.equal(resto.length, 0);
  cerca(salida.caja.x, 50 / 320);
  cerca(salida.caja.y, 450 / 640);
});

prueba('recorta los cuatro bordes y permite una caja que cubre todo el contenido', () => {
  const vector = vacio();
  poner(vector, { x: 320, y: 160, w: 2000, h: 2000 });
  const [salida] = decodificar(vector, { ancho: 1280, alto: 640 });
  afirmar.deepEqual(salida.caja, { x: 0, y: 0, w: 1, h: 1 });
  afirmar.equal(salida.area, 1);
});

prueba('NMS elimina IoU superior a .45 y devuelve las tres mayores supervivientes', () => {
  const vector = vacio();
  const cajas = [
    { x: 100, y: 100, w: 100, h: 100 },
    { x: 105, y: 105, w: 100, h: 100 },
    { x: 300, y: 100, w: 80, h: 80 },
    { x: 500, y: 100, w: 80, h: 80 },
    { x: 300, y: 400, w: 80, h: 80 }
  ];
  cajas.forEach((caja, celda) => poner(vector, caja, { celda, objeto: 1, clase: 0.99 - celda * 0.03 }));
  const salidas = decodificar(vector, imagen);
  afirmar.equal(salidas.length, 3);
  salidas.forEach((salida, indice) => cerca(salida.confianza, [0.99, 0.93, 0.9][indice]));
  afirmar.deepEqual(salidas.map(salida => salida.lado), ['izquierda', 'centro', 'derecha']);
});

prueba('NMS conserva cajas que se solapan debajo del umbral', () => {
  const vector = vacio();
  poner(vector, { x: 100, y: 100, w: 100, h: 100 });
  poner(vector, { x: 150, y: 100, w: 100, h: 100 }, { celda: 1 });
  afirmar.equal(decodificar(vector, imagen).length, 2);
});

prueba('exige ambos lados >= 8 px originales y area normalizada >= .001 tras recortar', () => {
  for (const caja of [
    { x: 100, y: 100, w: 7, h: 200 },
    { x: 100, y: 100, w: 200, h: 7 },
    { x: 100, y: 100, w: 10, h: 10 },
    { x: 1, y: 100, w: 10, h: 200 }
  ]) {
    const vector = vacio();
    poner(vector, caja);
    afirmar.deepEqual(decodificar(vector, imagen), []);
  }
  const vector = vacio();
  poner(vector, { x: 100, y: 100, w: 8, h: 100 });
  afirmar.equal(decodificar(vector, imagen).length, 1);
  afirmar.equal(decodificar(vector, { ancho: 320, alto: 320 }).length, 0);
  poner(vector, { x: 100, y: 100, w: 4, h: 128 });
  afirmar.equal(decodificar(vector, { ancho: 1280, alto: 1280 }).length, 1);
});

prueba('rechaza probabilidades fuera de [0,1], incluso si su producto parece valido', () => {
  for (const [objeto, clase] of [[1.2, 0.8], [0.8, 1.2], [-1, -1], [NaN, 1], [1, Infinity]]) {
    const vector = vacio();
    poner(vector, { x: 100, y: 100, w: 100, h: 100 }, { objeto, clase });
    poner(vector, { x: 500, y: 400, w: 100, h: 100 }, { celda: 1 });
    const salidas = decodificar(vector, imagen);
    afirmar.equal(salidas.length, 1);
    afirmar.equal(salidas[0].lado, 'derecha');
  }
});

prueba('rechaza NaN e Infinity en los seis campos y exponenciales desbordados o nulos', () => {
  for (let campo = 0; campo < 6; campo++) {
    for (const valor of [NaN, Infinity, -Infinity]) {
      const vector = vacio();
      poner(vector, { x: 100, y: 100, w: 100, h: 100 });
      vector[campo] = valor;
      afirmar.deepEqual(decodificar(vector, imagen), []);
    }
  }
  for (const campo of [2, 3]) {
    for (const valor of [1000, -1000]) {
      const vector = vacio();
      poner(vector, { x: 100, y: 100, w: 100, h: 100 });
      vector[campo] = valor;
      afirmar.deepEqual(decodificar(vector, imagen), []);
    }
  }
});

prueba('rechaza formas, dimensiones, entrada y umbrales invalidos sin lanzar', () => {
  for (const vector of [null, {}, [], new Float32Array(50399), new Float32Array(50401), new DataView(new ArrayBuffer(50400))]) {
    afirmar.deepEqual(decodificar(vector, imagen), []);
  }
  for (const opciones of [null, {}, { ancho: 0, alto: 640 }, { ancho: -1, alto: 640 },
    { ancho: 1.5, alto: 640 }, { ancho: 640, alto: Infinity }, { ...imagen, entrada: 320 },
    { ...imagen, confianzaMinima: NaN }, { ...imagen, confianzaMinima: -0.1 },
    { ...imagen, confianzaMinima: 1.1 }, { ancho: '640', alto: 640 }]) {
    afirmar.deepEqual(decodificar(vacio(), opciones), []);
  }
});

prueba('sin deteccion no produce aviso; confirma exactamente a los 150 ms', () => {
  const avisador = new Avisador();
  afirmar.equal(observar(avisador, [], 0), null);
  afirmar.equal(observar(avisador, [region()], 150), null);
  afirmar.equal(observar(avisador, [region()], 299), null);
  afirmar.deepEqual(observar(avisador, [region()], 300), {
    texto: 'Posible hoyo a la izquierda de la imagen.', tipo: 'hoyo', lado: 'izquierda'
  });
  afirmar.equal(observar(avisador, [], 450), null);
});

prueba('el avisador rechaza dos regiones de baja confianza y no conserva su evidencia', () => {
  for (const confianza of [0.1, 0.649999]) {
    const avisador = new Avisador();
    const baja = { ...region(), confianza };
    const minima = { ...region(), confianza: 0.65 };
    afirmar.equal(observar(avisador, [baja], 0), null);
    afirmar.equal(observar(avisador, [baja], 150), null);
    afirmar.equal(observar(avisador, [minima], 300), null);
    afirmar.equal(observar(avisador, [minima], 450).tipo, 'hoyo');
  }
});

prueba('una region de baja confianza borra tambien la evidencia valida previa', () => {
  const baja = { ...region(), confianza: 0.1 };
  for (const regiones of [[baja], [region(), baja]]) {
    const avisador = new Avisador();
    afirmar.equal(observar(avisador, [region()], 0), null);
    afirmar.equal(observar(avisador, regiones, 150), null);
    afirmar.equal(observar(avisador, [region()], 300), null);
    afirmar.equal(observar(avisador, [region()], 450).tipo, 'hoyo');
  }
});

prueba('el video a 30 fps confirma sin esperar inmovilidad ni frenar al usuario', () => {
  const avisador = new Avisador();
  for (let indice = 0; indice < 5; indice++) {
    afirmar.equal(observar(avisador, [region(0.1 + indice * 0.01)], indice * 33), null);
  }
  afirmar.equal(observar(avisador, [region(0.15)], 165).lado, 'izquierda');
});

prueba('confirma dos de las ultimas tres observaciones con una ausencia intermedia', () => {
  const avisador = new Avisador();
  afirmar.equal(observar(avisador, [region()], 0), null);
  afirmar.equal(observar(avisador, [], 150), null);
  afirmar.equal(observar(avisador, [region()], 300).lado, 'izquierda');
});

prueba('tres observaciones nuevas desplazan evidencia antigua aunque siga dentro de la ventana', () => {
  const avisador = new Avisador();
  observar(avisador, [region()], 0);
  observar(avisador, [], 150);
  observar(avisador, [], 300);
  afirmar.equal(observar(avisador, [region()], 450), null);
  afirmar.equal(observar(avisador, [region()], 600).tipo, 'hoyo');
});

prueba('la ventana entre capturas incluye 2500 ms y excluye 2501 ms, con o sin latencia', () => {
  for (const latencia of [0, 1700]) {
    for (const demora of [2500, 2501]) {
      const avisador = new Avisador();
      observar(avisador, [region()], latencia, { capturada: 0, fotograma: 1 });
      const aviso = observar(avisador, [region()], demora + latencia, { capturada: demora, fotograma: 2 });
      afirmar.equal(Boolean(aviso), demora === 2500, `latencia ${latencia}, separacion ${demora}`);
    }
  }
});

prueba('confirma capturas compatibles separadas 1.9 s con latencia de 1.7 s cada una', () => {
  const avisador = new Avisador();
  afirmar.equal(observar(avisador, [region()], 2700, { capturada: 1000, fotograma: 1 }), null);
  afirmar.deepEqual(observar(avisador, [region()], 4600, { capturada: 2900, fotograma: 2 }), {
    texto: 'Posible hoyo a la izquierda de la imagen.', tipo: 'hoyo', lado: 'izquierda'
  });
});

prueba('la separacion se mide con capturas, no con la demora al procesarlas', () => {
  const avisador = new Avisador();
  observar(avisador, [region()], 1000, { capturada: 900, fotograma: 1 });
  afirmar.equal(observar(avisador, [region()], 1200, { capturada: 1000, fotograma: 2 }), null);
  afirmar.equal(observar(avisador, [region()], 1250, { capturada: 1050, fotograma: 3 }).tipo, 'hoyo');
});

prueba('descarta capturas de mas de 2000 ms o futuras y borra la evidencia', () => {
  for (const capturada of [199, 2201]) {
    const avisador = new Avisador();
    observar(avisador, [region()], 1000, { fotograma: 1 });
    afirmar.equal(observar(avisador, [region()], 2200, { capturada, fotograma: 2 }), null);
    afirmar.equal(observar(avisador, [region()], 2400, { fotograma: 3 }), null);
    afirmar.equal(observar(avisador, [region()], 2550, { fotograma: 4 }).tipo, 'hoyo');
  }
  const avisador = new Avisador();
  afirmar.equal(observar(avisador, [region()], 2000, { capturada: 0, fotograma: 1 }), null);
  afirmar.equal(observar(avisador, [region()], 2150, { capturada: 150, fotograma: 2 }).tipo, 'hoyo');
});

for (const fotograma of [1, 0]) {
  prueba(`fotograma congelado o atrasado (${fotograma}) invalida evidencia`, () => {
    const avisador = new Avisador();
    observar(avisador, [region()], 0, { fotograma: 1 });
    afirmar.equal(observar(avisador, [region()], 150, { fotograma }), null);
    afirmar.equal(observar(avisador, [region()], 300, { fotograma: 2 }), null);
    afirmar.equal(observar(avisador, [region()], 450, { fotograma: 3 }).tipo, 'hoyo');
  });
}

prueba('imagen mala borra evidencia y requiere dos observaciones nuevas', () => {
  const avisador = new Avisador();
  observar(avisador, [region()], 0);
  afirmar.equal(observar(avisador, [region()], 150, { malaImagen: true }), null);
  afirmar.equal(observar(avisador, [region()], 300), null);
  afirmar.equal(observar(avisador, [region()], 450).tipo, 'hoyo');
});

prueba('rechaza metadatos invalidos, captura repetida y reloj atrasado', () => {
  for (const extras of [{ ahora: NaN }, { capturada: Infinity }, { fotograma: -1 },
    { fotograma: undefined }, { malaImagen: 'false' }, { capturada: 0 }, { ahora: -1 }]) {
    const avisador = new Avisador();
    observar(avisador, [region()], 0);
    afirmar.equal(observar(avisador, [region()], 150, extras), null);
    afirmar.equal(observar(avisador, [region()], 300), null);
  }
  const avisador = new Avisador();
  observar(avisador, [region()], 1000, { fotograma: 1 });
  afirmar.equal(observar(avisador, [region()], 900, { fotograma: 2 }), null);
  afirmar.equal(observar(avisador, [region()], 1200, { fotograma: 3 }), null);
});

prueba('compatibilidad IoU admite movimiento amplio aun fuera de la distancia de centros', () => {
  const avisador = new Avisador();
  observar(avisador, [region(0.05, 0.3, 0.4, 0.3)], 0);
  afirmar.equal(observar(avisador, [region(0.3, 0.3, 0.4, 0.3)], 150).lado, 'centro');
});

prueba('centros cercanos confirman sin solapamiento y rechazan desplazamientos lejanos', () => {
  for (const desplazamiento of [0.1, 0.13]) {
    const avisador = new Avisador();
    observar(avisador, [region(0.1, 0.4, 0.04, 0.04)], 0);
    const aviso = observar(avisador, [region(0.1 + desplazamiento, 0.4, 0.04, 0.04)], 150);
    afirmar.equal(Boolean(aviso), desplazamiento === 0.1);
  }
});

prueba('centros cercanos requieren razon de area entre .4 y 2.5', () => {
  for (const factor of [0.4, 0.39, 2.5, 2.51]) {
    const avisador = new Avisador();
    observar(avisador, [region(0.1, 0.4, 0.04, 0.08)], 0);
    const ancho = 0.04 * factor;
    const aviso = observar(avisador, [region(0.22 - ancho / 2, 0.4, ancho, 0.08)], 150);
    afirmar.equal(Boolean(aviso), factor === 0.4 || factor === 2.5, `factor ${factor}`);
  }
});

prueba('cooldown de 8 segundos por lado, sin reactivarlo con imagen mala', () => {
  const avisador = new Avisador();
  observar(avisador, [region()], 0);
  afirmar.ok(observar(avisador, [region()], 150));
  afirmar.equal(observar(avisador, [region()], 300, { malaImagen: true }), null);
  afirmar.equal(observar(avisador, [region()], 450), null);
  afirmar.equal(observar(avisador, [region()], 600), null);
  afirmar.equal(observar(avisador, [region()], 8000), null);
  afirmar.equal(observar(avisador, [region()], 8150).lado, 'izquierda');
  observar(avisador, [region(0.75)], 8300);
  afirmar.equal(observar(avisador, [region(0.75)], 8450).lado, 'derecha');
});

prueba('el cooldown sigue activo un milisegundo antes del limite', () => {
  const avisador = new Avisador();
  observar(avisador, [region()], 0);
  observar(avisador, [region()], 150);
  observar(avisador, [region()], 7800);
  afirmar.equal(observar(avisador, [region()], 8149), null);
  afirmar.equal(observar(avisador, [region()], 8299).tipo, 'hoyo');
});

prueba('textos de los tres lados solo expresan posibilidad y ubicacion en la imagen', () => {
  for (const [x, lado, ubicacion] of [[0.1, 'izquierda', 'a la izquierda'],
    [0.45, 'centro', 'en el centro'], [0.8, 'derecha', 'a la derecha']]) {
    const avisador = new Avisador();
    observar(avisador, [region(x)], 0);
    afirmar.deepEqual(observar(avisador, [region(x)], 150), {
      texto: `Posible hoyo ${ubicacion} de la imagen.`, tipo: 'hoyo', lado
    });
  }
});

prueba('regiones o campos invalidos borran evidencia, sin avisar', () => {
  const base = region();
  for (const regiones of [null, {}, [null], new Array(1), [{ ...base, confianza: 1.1 }],
    [{ ...base, confianza: NaN }], [{ ...base, tipo: 'persona' }],
    [{ ...base, caja: { ...base.caja, x: Infinity } }],
    [{ ...base, caja: { ...base.caja, w: -1 } }],
    [{ ...base, caja: { ...base.caja, x: 0.99 } }],
    [{ ...base, area: 0.5 }], [{ ...base, area: NaN }], [{ ...base, lado: 'derecha' }]]) {
    const avisador = new Avisador();
    observar(avisador, [region()], 0);
    afirmar.equal(observar(avisador, regiones, 150), null);
    afirmar.equal(observar(avisador, [region()], 300), null);
  }
});

prueba('el avisador copia evidencia y no modifica las regiones del llamador', () => {
  const avisador = new Avisador();
  const primera = region();
  observar(avisador, [primera], 0);
  primera.caja.x = 0.8;
  const siguientes = Object.freeze([Object.freeze({ ...region(), caja: Object.freeze(region().caja) })]);
  afirmar.equal(observar(avisador, siguientes, 150).lado, 'izquierda');
});

prueba('cierre y reiniciar eliminan evidencia, identificadores y cooldown; instancias aisladas', () => {
  const avisador = new Avisador();
  observar(avisador, [region()], 0);
  avisador.reiniciar();
  afirmar.equal(observar(avisador, [region()], 0), null);
  afirmar.ok(observar(avisador, [region()], 150));
  avisador.reiniciar();
  afirmar.equal(observar(avisador, [region()], 0), null);
  afirmar.ok(observar(avisador, [region()], 150));
  const otro = new Avisador();
  afirmar.equal(observar(otro, [region()], 0), null);
  afirmar.ok(observar(otro, [region()], 150));
});

prueba('flujo completo: YOLOX con letterbox, movimiento, confirmacion y silencio sin deteccion', () => {
  const avisador = new Avisador();
  const opciones = { ancho: 1280, alto: 720 };
  const primera = vacio();
  poner(primera, { x: 300, y: 280, w: 90, h: 80 }, { paso: 16, celda: 710 });
  afirmar.equal(observar(avisador, decodificar(primera, opciones), 1000), null);
  const segunda = vacio();
  poner(segunda, { x: 340, y: 290, w: 100, h: 85 }, { paso: 32, celda: 170 });
  afirmar.deepEqual(observar(avisador, decodificar(segunda, opciones), 1150), {
    texto: 'Posible hoyo en el centro de la imagen.', tipo: 'hoyo', lado: 'centro'
  });
  afirmar.equal(observar(avisador, decodificar(vacio(), opciones), 1300), null);
});

prueba('metadatos ausentes o nulos invalidan tambien al cerrar la fuente', () => {
  for (const opciones of [undefined, null]) {
    const avisador = new Avisador();
    observar(avisador, [region()], 0);
    afirmar.equal(avisador.actualizar([], opciones), null);
    afirmar.equal(observar(avisador, [region()], 150), null);
    afirmar.equal(observar(avisador, [region()], 300).tipo, 'hoyo');
  }
});

prueba('rechaza confianza menor a .65 al recibir regiones del worker', () => {
  for (const confianza of [0, .64, .649999]) {
    const a = new Avisador();
    afirmar.equal(observar(a, [region(.4, .4, .1, .1, confianza)], 0), null);
    afirmar.equal(observar(a, [region(.4, .4, .1, .1, confianza)], 700), null);
    afirmar.equal(observar(a, [region(.4, .4, .1, .1)], 1400), null);
  }
  const a = new Avisador();
  observar(a, [region(.4, .4, .1, .1, .65)], 0);
  afirmar.ok(observar(a, [region(.4, .4, .1, .1, .65)], 700));
});
prueba('ventana de 2500 ms entre capturas, independiente de latencia de inferencia', () => {
  const a = new Avisador();
  observar(a, [region()], 1000, { capturada: 0 });
  afirmar.ok(observar(a, [region()], 4400, { capturada: 2500 }));
  const b = new Avisador();
  observar(b, [region()], 1000, { capturada: 0 });
  afirmar.equal(observar(b, [region()], 4401, { capturada: 2501 }), null);
});
