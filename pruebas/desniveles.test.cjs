'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const modulo = require('../demo/vision/desniveles.js');
const { regiones, Avisador } = modulo;

// Estas máscaras sintéticas prueban la lógica, no la precisión de un modelo real.
function mascara(ancho = 30, alto = 20) {
  return { ancho, alto, clases: new Uint8Array(ancho * alto), confianzas: new Float32Array(ancho * alto) };
}

function rectangulo(m, x, y, w, h, clase = 1, confianza = 0.8) {
  for (let fila = y; fila < y + h; fila++) {
    for (let col = x; col < x + w; col++) {
      const i = fila * m.ancho + col;
      m.clases[i] = clase;
      m.confianzas[i] = confianza;
    }
  }
  return m;
}

function region(cambios = {}) {
  return { tipo: 'escaleras', lado: 'centro', confianza: 0.8, area: 0.05,
    caja: { x: 10, y: 2, w: 5, h: 6 }, ...cambios };
}

function cuadro(avisador, detecciones, tiempo, fotograma = tiempo, cambios = {}) {
  return avisador.actualizar(detecciones, { ahora: tiempo, capturada: tiempo, fotograma, ...cambios });
}

function cerca(valor, esperado) {
  assert.ok(Math.abs(valor - esperado) < 1e-6, `${valor} != ${esperado}`);
}

test('exporta la misma API global y CommonJS, y funciona sin require en navegador', () => {
  assert.equal(globalThis.GrietaDesniveles, modulo);
  assert.deepEqual(Object.keys(modulo).sort(), ['Avisador', 'regiones']);
  const contexto = vm.createContext({ Uint8Array, Float32Array });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../demo/vision/desniveles.js'), 'utf8'), contexto);
  assert.equal(typeof contexto.GrietaDesniveles.Avisador, 'function');
  assert.equal(contexto.GrietaDesniveles.regiones(mascara()).length, 0);
  assert.equal(new contexto.GrietaDesniveles.Avisador().actualizar([], {}), null);
});

test('extrae tipo, media, área, caja inclusiva y lado sin modificar las máscaras', () => {
  const m = rectangulo(mascara(), 1, 2, 3, 2, 2, 0.6);
  m.confianzas[2 * m.ancho + 1] = 0.9;
  const clases = m.clases.slice();
  const confianzas = m.confianzas.slice();
  const resultado = regiones(m);
  assert.equal(resultado.length, 1);
  assert.equal(resultado[0].tipo, 'escalon');
  assert.equal(resultado[0].lado, 'izquierda');
  assert.deepEqual(resultado[0].caja, { x: 1, y: 2, w: 3, h: 2 });
  cerca(resultado[0].confianza, (0.9 + 5 * 0.6) / 6);
  cerca(resultado[0].area, 6 / 600);
  assert.deepEqual(m.clases, clases);
  assert.deepEqual(m.confianzas, confianzas);
});

test('el fondo y las clases ajenas no producen regiones', () => {
  const m = mascara();
  m.confianzas.fill(1);
  assert.deepEqual(regiones(m), []);
  m.clases.fill(3);
  assert.deepEqual(regiones(m), []);
});

test('el mínimo absoluto incluye seis píxeles y descarta cinco', () => {
  const m = rectangulo(mascara(), 1, 1, 5, 1);
  rectangulo(m, 21, 1, 6, 1);
  assert.equal(regiones(m).length, 1);
  assert.deepEqual(regiones(m)[0].caja, { x: 21, y: 1, w: 6, h: 1 });
});

test('el mínimo proporcional usa el área total y redondea hacia arriba', () => {
  const m = rectangulo(mascara(101, 100), 0, 0, 20, 1);
  rectangulo(m, 0, 3, 21, 1);
  const resultado = regiones(m);
  assert.equal(resultado.length, 1);
  assert.deepEqual(resultado[0].caja, { x: 0, y: 3, w: 21, h: 1 });
  cerca(resultado[0].area, 21 / 10100);
  assert.equal(regiones(rectangulo(mascara(100, 100), 0, 0, 20, 1)).length, 1);
});

test('un componente irregular mide sus píxeles, no el área de la caja', () => {
  const m = rectangulo(mascara(), 1, 1, 4, 1, 2);
  rectangulo(m, 1, 2, 1, 3, 2);
  const resultado = regiones(m);
  assert.equal(resultado.length, 1);
  assert.deepEqual(resultado[0].caja, { x: 1, y: 1, w: 4, h: 4 });
  cerca(resultado[0].area, 7 / 600);
});

test('acepta confianza 0.55 y corta puentes por baja confianza o valores inválidos', () => {
  const m = rectangulo(mascara(), 1, 1, 6, 1, 1, 0.55);
  rectangulo(m, 8, 1, 6, 1, 1, 0.9);
  rectangulo(m, 7, 1, 1, 1, 1, 0.549);
  rectangulo(m, 1, 4, 6, 1, 1, NaN);
  rectangulo(m, 1, 6, 6, 1, 1, Infinity);
  rectangulo(m, 1, 8, 6, 1, 1, 1.1);
  rectangulo(m, 1, 10, 6, 1, 1, -0.1);
  const resultado = regiones(m);
  assert.equal(resultado.length, 2);
  assert.deepEqual(resultado.map(r => r.caja.w), [6, 6]);
  cerca(resultado.find(r => r.caja.x === 1).confianza, 0.55);
});

test('la conectividad usa cuatro vecinos y no une contactos diagonales', () => {
  const m = rectangulo(mascara(), 0, 0, 3, 2);
  rectangulo(m, 3, 2, 3, 2);
  assert.equal(regiones(m).length, 2);
  assert.ok(regiones(m).every(r => r.area === 6 / 600));
});

test('clases 1 y 2 adyacentes conservan componentes y tipos separados', () => {
  const m = rectangulo(mascara(), 10, 1, 3, 2, 1);
  rectangulo(m, 13, 1, 3, 2, 2);
  assert.deepEqual(new Set(regiones(m).map(r => r.tipo)), new Set(['escaleras', 'escalon']));
  assert.equal(regiones(m).length, 2);
});

test('no conecta el final de una fila con el inicio de la siguiente', () => {
  const m = rectangulo(mascara(12, 4), 9, 0, 3, 2);
  rectangulo(m, 0, 2, 3, 2);
  const resultado = regiones(m);
  assert.equal(resultado.length, 2);
  assert.deepEqual(resultado.map(r => r.caja), [
    { x: 0, y: 2, w: 3, h: 2 }, { x: 9, y: 0, w: 3, h: 2 }
  ]);
});

test('admite bordes, una fila y una columna sin perder píxeles', () => {
  for (const [ancho, alto] of [[6, 1], [1, 6], [6, 6]]) {
    const m = rectangulo(mascara(ancho, alto), 0, 0, ancho, alto, 2, 1);
    assert.deepEqual(regiones(m), [{ tipo: 'escalon', confianza: 1, area: 1,
      caja: { x: 0, y: 0, w: ancho, h: alto }, lado: 'centro' }]);
  }
});

test('clasifica por el centro de la caja, incluidos los límites de los tercios', () => {
  const m = rectangulo(mascara(12, 10), 0, 0, 2, 3);
  rectangulo(m, 3, 0, 2, 3, 2);
  rectangulo(m, 7, 0, 2, 3);
  rectangulo(m, 10, 0, 2, 3, 2);
  assert.deepEqual(regiones(m).map(r => r.lado), ['centro', 'centro', 'izquierda']);
  const derecha = rectangulo(mascara(12, 10), 10, 0, 2, 3);
  assert.equal(regiones(derecha)[0].lado, 'derecha');
});

test('prioriza centro, después tamaño y entrega máximo tres regiones', () => {
  const m = rectangulo(mascara(60, 30), 25, 0, 3, 2);
  rectangulo(m, 33, 10, 4, 2, 2);
  rectangulo(m, 0, 0, 10, 3);
  rectangulo(m, 50, 10, 6, 3, 2);
  const resultado = regiones(m);
  assert.equal(resultado.length, 3);
  assert.deepEqual(resultado.map(r => [r.lado, r.caja.w * r.caja.h]), [
    ['centro', 8], ['centro', 6], ['izquierda', 30]
  ]);
});

test('descarta máscaras malformadas sin lanzar errores', () => {
  const m = mascara();
  for (const entrada of [undefined, null, [], {},
    { ...m, ancho: 0 }, { ...m, alto: -1 }, { ...m, ancho: 2.5 },
    { ...m, alto: NaN }, { ...m, ancho: Infinity },
    { ...m, ancho: 30n }, { ...m, alto: Symbol('alto') },
    { ...m, ancho: '30' }, { ...m, alto: {} },
    { ...m, ancho: Number.MAX_SAFE_INTEGER },
    { ...m, clases: Array.from(m.clases) }, { ...m, clases: new Uint16Array(600) },
    { ...m, confianzas: new Float64Array(600) },
    { ...m, clases: new Uint8Array(599) }, { ...m, confianzas: new Float32Array(601) }
  ]) assert.deepEqual(regiones(entrada), []);
});

test('confirma dos observaciones separadas exactamente 150 ms y usa texto prudente', () => {
  const a = new Avisador();
  assert.equal(cuadro(a, [region()], 0), null);
  assert.deepEqual(cuadro(a, [region()], 150), {
    texto: 'Posibles escaleras al centro de la imagen.', tipo: 'escaleras', lado: 'centro'
  });
  const b = new Avisador();
  const escalon = region({ tipo: 'escalon', lado: 'izquierda' });
  assert.equal(cuadro(b, [escalon], 0), null);
  assert.deepEqual(cuadro(b, [escalon], 150), {
    texto: 'Posible escalón a la izquierda de la imagen.', tipo: 'escalon', lado: 'izquierda'
  });
});

test('149 ms no bastan y las observaciones se separan por captura, no por procesamiento', () => {
  const a = new Avisador();
  assert.equal(cuadro(a, [region()], 0), null);
  assert.equal(cuadro(a, [region()], 149), null);
  assert.ok(cuadro(a, [region()], 150));
  const b = new Avisador();
  assert.equal(cuadro(b, [region()], 1000, 1, { capturada: 900 }), null);
  assert.equal(cuadro(b, [region()], 2000, 2, { capturada: 1000 }), null);
  assert.ok(cuadro(b, [region()], 2050, 3, { capturada: 1050 }));
});

test('la ventana incluye 2500 ms y excluye 2501 ms', () => {
  const a = new Avisador();
  cuadro(a, [region()], 0);
  assert.ok(cuadro(a, [region()], 2500));
  const b = new Avisador();
  cuadro(b, [region()], 0);
  assert.equal(cuadro(b, [region()], 2501), null);
  assert.ok(cuadro(b, [region()], 2651));
});

test('confirma dos de tres y descarta evidencia anterior a los últimos tres cuadros', () => {
  const a = new Avisador();
  cuadro(a, [region()], 0);
  cuadro(a, [], 100);
  assert.ok(cuadro(a, [region()], 200));
  const b = new Avisador();
  cuadro(b, [region()], 0);
  cuadro(b, [], 100);
  cuadro(b, [], 200);
  assert.equal(cuadro(b, [region()], 300), null);
  assert.ok(cuadro(b, [region()], 450));
  assert.ok(b.historial.length <= 3);
});

test('varias cajas de un tipo/lado en un mismo cuadro no aportan votos extra', () => {
  const a = new Avisador();
  assert.equal(cuadro(a, [region(), region({ caja: { x: 15, y: 0, w: 2, h: 3 } })], 0), null);
  assert.equal(cuadro(a, [region(), region()], 100), null);
  assert.ok(cuadro(a, [region()], 200));
});

test('una región grande y de confianza alta permite un aviso tentativo inmediato', () => {
  const a = new Avisador();
  assert.ok(cuadro(a, [region({ area: 0.12001, confianza: 0.9 })], 0));
  for (const cambios of [{ area: 0.12, confianza: 0.9 }, { area: 0.13, confianza: 0.8999 }]) {
    assert.equal(cuadro(new Avisador(), [region(cambios)], 0), null);
  }
});

test('el umbral tentativo respeta el redondeo Float32 de la máscara a 0.9', () => {
  const a = new Avisador();
  const detecciones = regiones(rectangulo(mascara(), 10, 0, 8, 10, 1, 0.9));
  assert.ok(detecciones[0].confianza < 0.9);
  assert.ok(cuadro(a, detecciones, 0));
  const debajo = regiones(rectangulo(mascara(), 10, 0, 8, 10, 1, 0.8999));
  assert.equal(cuadro(new Avisador(), debajo, 0), null);
});

test('descarta duplicados, video congelado y fotogramas que retroceden', () => {
  const a = new Avisador();
  cuadro(a, [region()], 0, 10);
  assert.equal(cuadro(a, [region()], 150, 10), null);
  assert.equal(cuadro(a, [region()], 1000, 10), null);
  assert.equal(cuadro(a, [region()], 2000, 9), null);
  assert.ok(cuadro(a, [region()], 2200, 11));
  const b = new Avisador();
  cuadro(b, [region()], 0, 0.1);
  assert.ok(cuadro(b, [region()], 150, 0.2));
  assert.equal(cuadro(b, [region({ tipo: 'escalon', area: 0.2, confianza: 1 })], 300, 0.2), null);
});

test('duplicados no llenan ni renuevan el historial de un video congelado', () => {
  const a = new Avisador();
  cuadro(a, [region()], 0, 1);
  for (let t = 500; t <= 3000; t += 500) assert.equal(cuadro(a, [region()], t, 1), null);
  assert.equal(a.historial.length, 1);
  assert.equal(cuadro(a, [region()], 3100, 2), null);
  assert.ok(cuadro(a, [region()], 3250, 3));
});

test('descarta resultados de más de 2000 ms, pero acepta exactamente 2000 ms', () => {
  const a = new Avisador();
  assert.equal(cuadro(a, [region()], 2001, 1, { capturada: 0 }), null);
  assert.equal(cuadro(a, [region()], 2100, 2), null);
  assert.ok(cuadro(a, [region()], 2250, 3));
  const b = new Avisador();
  assert.ok(cuadro(b, [region({ area: 0.2, confianza: 1 })], 2000, 1, { capturada: 0 }));
});

test('mala imagen no emite ni aporta evidencia, y consume el identificador del cuadro', () => {
  const a = new Avisador();
  assert.equal(cuadro(a, [region({ area: 0.5, confianza: 1 })], 0, 1, { malaImagen: true }), null);
  assert.equal(cuadro(a, [region()], 150, 1), null);
  assert.equal(cuadro(a, [region()], 300, 2), null);
  assert.equal(cuadro(a, [region()], 450, 3, { malaImagen: true }), null);
  assert.ok(cuadro(a, [region()], 600, 4));
});

test('tipo y lado deben coincidir; el movimiento dentro del mismo lado sí es compatible', () => {
  const a = new Avisador();
  const izquierda = region({ lado: 'izquierda' });
  const derecha = region({ lado: 'derecha' });
  cuadro(a, [izquierda], 0);
  assert.equal(cuadro(a, [derecha], 150), null);
  assert.equal(cuadro(a, [region({ tipo: 'escalon', lado: 'derecha' })], 300), null);
  assert.ok(cuadro(a, [derecha], 450));
  const b = new Avisador();
  cuadro(b, [izquierda], 0);
  assert.ok(cuadro(b, [region({ lado: 'izquierda', caja: { x: 0, y: 50, w: 20, h: 10 } })], 150));
});

test('el cooldown por tipo/lado dura ocho segundos y no se renueva al suprimir avisos', () => {
  const a = new Avisador();
  const fuerte = region({ area: 0.2, confianza: 0.95 });
  assert.ok(cuadro(a, [fuerte], 0));
  assert.equal(cuadro(a, [fuerte], 100), null);
  assert.equal(cuadro(a, [fuerte], 7999), null);
  assert.ok(cuadro(a, [fuerte], 8000));
});

test('otro tipo/lado puede avisar durante el cooldown y cada clave conserva su plazo', () => {
  const a = new Avisador();
  const fuerte = region({ area: 0.2, confianza: 1 });
  assert.ok(cuadro(a, [fuerte], 0));
  assert.ok(cuadro(a, [region({ ...fuerte, lado: 'derecha' })], 150));
  assert.ok(cuadro(a, [region({ ...fuerte, tipo: 'escalon' })], 300));
  assert.equal(cuadro(a, [fuerte], 450), null);
  assert.equal(cuadro(a, [region({ ...fuerte, lado: 'derecha' })], 8000), null);
  assert.ok(cuadro(a, [region({ ...fuerte, lado: 'derecha' })], 8150));
});

test('considera regiones secundarias sin que una clave en cooldown las bloquee', () => {
  const a = new Avisador();
  const centro = region({ area: 0.2, confianza: 1 });
  const derecha = region({ tipo: 'escalon', lado: 'derecha' });
  assert.ok(cuadro(a, [derecha, centro], 0));
  const aviso = cuadro(a, [centro, derecha], 150);
  assert.equal(aviso.tipo, 'escalon');
  assert.equal(aviso.lado, 'derecha');
});

test('las regiones vacías no avisan usando únicamente evidencia del pasado', () => {
  const a = new Avisador();
  cuadro(a, [region()], 0);
  assert.equal(cuadro(a, [], 150), null);
  assert.equal(cuadro(a, [], 300), null);
  assert.equal(cuadro(a, [region()], 450), null);
});

test('descarta metadatos malformados y relojes o capturas que retroceden', () => {
  const fuerte = region({ area: 0.3, confianza: 1 });
  for (const opciones of [undefined, null, {},
    { ahora: '0', capturada: 0, fotograma: 0 },
    { ahora: 0, capturada: 0, fotograma: '0' },
    { ahora: 0, capturada: 0, fotograma: NaN },
    { ahora: Infinity, capturada: 0, fotograma: 0 },
    { ahora: 0, capturada: -1, fotograma: 0 },
    { ahora: 0, capturada: 1, fotograma: 0 },
    { ahora: 0, capturada: 0, fotograma: -1 },
    { ahora: 0, capturada: 0, fotograma: 0, malaImagen: 'false' }
  ]) assert.equal(new Avisador().actualizar([fuerte], opciones), null);
  const a = new Avisador();
  cuadro(a, [region()], 500, 1);
  assert.equal(cuadro(a, [fuerte], 499, 2), null);
  assert.equal(cuadro(a, [fuerte], 700, 3, { capturada: 499 }), null);
  assert.ok(cuadro(a, [region()], 750, 4));
});

test('descarta regiones malformadas y conserva regiones válidas en un arreglo mixto', () => {
  const invalidas = [null, undefined, {}, region({ tipo: 'bajada' }), region({ lado: 'cerca' }),
    region({ confianza: NaN }), region({ confianza: 1.1 }), region({ confianza: 0.54 }),
    region({ area: 0 }), region({ area: Infinity }), region({ area: 1.1 }),
    region({ caja: null }), region({ caja: { x: -1, y: 0, w: 5, h: 6 } }),
    region({ caja: { x: 1, y: 0, w: 0, h: 6 } }),
    region({ caja: { x: 1, y: 0, w: 5, h: NaN } })];
  const a = new Avisador();
  assert.equal(cuadro(a, invalidas, 0), null);
  assert.equal(cuadro(a, invalidas, 150), null);
  assert.equal(cuadro(a, [...invalidas, region()], 300), null);
  assert.ok(cuadro(a, [...invalidas, region()], 450));
  for (const entrada of [null, undefined, {}, 'escaleras']) {
    assert.equal(cuadro(new Avisador(), entrada, 0), null);
  }
});

test('reiniciar elimina historial, cooldown y los límites de tiempo/fotograma', () => {
  const a = new Avisador();
  const fuerte = region({ area: 0.2, confianza: 1 });
  assert.ok(cuadro(a, [fuerte], 10000, 100));
  a.reiniciar();
  assert.equal(a.historial.length, 0);
  assert.equal(a.avisos.size, 0);
  assert.equal(cuadro(a, [region()], 0, 0), null);
  assert.ok(cuadro(a, [region()], 150, 1));
  a.reiniciar();
  assert.ok(cuadro(a, [fuerte], 0, 0));
});

test('los datos del llamador no se mutan ni pueden cambiar votos ya almacenados', () => {
  const a = new Avisador();
  const r = region();
  const detecciones = [r];
  cuadro(a, detecciones, 0);
  assert.equal(detecciones[0], r);
  r.lado = 'derecha';
  assert.equal(cuadro(a, [r], 150), null);
  assert.ok(cuadro(a, [region()], 300));
});

test('el flujo máscara → regiones → aviso solo describe tipo y lado de imagen', () => {
  for (const tipo of [1, 2]) {
    for (const [x, lado] of [[0, 'izquierda'], [12, 'centro'], [25, 'derecha']]) {
      const detecciones = regiones(rectangulo(mascara(), x, 0, 3, 2, tipo));
      const a = new Avisador();
      assert.equal(cuadro(a, detecciones, 0), null);
      const aviso = cuadro(a, detecciones, 150);
      assert.equal(aviso.lado, lado);
      assert.deepEqual(Object.keys(aviso).sort(), ['lado', 'texto', 'tipo']);
      const nombre = tipo === 1 ? 'Posibles escaleras' : 'Posible escalón';
      const ubicacion = lado === 'centro' ? 'al centro' : `a la ${lado}`;
      assert.equal(aviso.texto, `${nombre} ${ubicacion} de la imagen.`);
      assert.doesNotMatch(aviso.texto, /avanz|paso libre|camino libre|subida|bajada|profund|altura|cerca|lejos/i);
    }
  }
});
