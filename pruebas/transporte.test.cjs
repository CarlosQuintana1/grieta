'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { rutasEnTexto, coincideDestino, Confirmador } = require('../demo/vision/transporte.js');

const CATALOGO = ['C55', 'C550', 'C55B', 'T80', 'X17', '55'];
const OBJETIVO = { linea: 'C55', hacia: 'Bosque Ámbar' };

function frame(instante, cambios = {}) {
  return {
    texto: 'C55', confianza: 90, instante, objetivo: { ...OBJETIVO },
    catalogo: [...CATALOGO], referencia: 'escena-a', ...cambios
  };
}

test('exporta la misma API por CommonJS y un global de navegador sin dependencias', () => {
  assert.equal(globalThis.GrietaTransporte.Confirmador, Confirmador);
  const navegador = {};
  vm.runInNewContext(fs.readFileSync(require.resolve('../demo/vision/transporte.js'), 'utf8'), navegador);
  assert.deepEqual(Object.keys(navegador.GrietaTransporte).sort(),
    ['Confirmador', 'coincideDestino', 'rutasEnTexto']);
  assert.equal(new navegador.GrietaTransporte.Confirmador().registrar(frame(0)).confirmada, false);
});

test('encuentra códigos exactos, deduplica y conserva valores y orden del catálogo', () => {
  assert.deepEqual(rutasEnTexto('t 8 0 / C-55 / c 55 / X17', CATALOGO), ['C55', 'T80', 'X17']);
  assert.deepEqual(rutasEnTexto('C55 / T80', ['T80', 'C55', 'C55']), ['T80', 'C55']);
  assert.deepEqual(rutasEnTexto('c-55', ['c55']), ['c55']);
  assert.deepEqual(rutasEnTexto('(C55), T80.', CATALOGO), ['C55', 'T80']);
  assert.deepEqual(rutasEnTexto('C55 y T80', CATALOGO), ['C55', 'T80']);
  assert.deepEqual(rutasEnTexto('C55 - T80', CATALOGO), ['C55', 'T80']);
});

test('no autocorrige OCR ni permite códigos parciales o sufijos', () => {
  for (const texto of ['C5S', 'C550', 'C55B', 'C-550', 'C 55B', 'C55-B', 'C 55 0', 'C55 B',
    'AC55', '1C55', 'C55_1', '_C55', 'éC55', 'C55ñ', 'C5', '55', '550']) {
    assert.deepEqual(rutasEnTexto(texto, ['C55']), [], texto);
  }
  assert.deepEqual(rutasEnTexto('C550', CATALOGO), ['C550']);
  assert.deepEqual(rutasEnTexto('C55B', CATALOGO), ['C55B']);
  assert.deepEqual(rutasEnTexto('C55', ['55']), []);
  assert.deepEqual(rutasEnTexto('C 55', ['55']), []);
  assert.deepEqual(rutasEnTexto('C\n55', ['55']), []);
  assert.deepEqual(rutasEnTexto('155', ['55']), []);
  assert.deepEqual(rutasEnTexto('Ruta 55', CATALOGO), ['55']);
});

test('un catálogo incompleto no convierte un prefijo en ruta', () => {
  assert.deepEqual(rutasEnTexto('C550 / C55B / C5S', ['C55']), []);
  assert.deepEqual(rutasEnTexto('C55', ['C550', 'C55B']), []);
  assert.deepEqual(rutasEnTexto('C55', []), []);
  assert.deepEqual(rutasEnTexto('C55', ['C.*', null, {}, '']), []);
  assert.deepEqual(rutasEnTexto(null, CATALOGO), []);
});

test('el destino requiere dos palabras distintivas completas y diferentes', () => {
  assert.equal(coincideDestino('HACIA BOSQUE AMBAR', 'Bosque Ámbar'), true);
  assert.equal(coincideDestino('Ámbar, Bosque.', 'Bosque Ámbar'), true);
  for (const [texto, destino] of [
    ['Centro', 'Centro'], ['Centro Histórico', 'Centro Histórico'],
    ['Terminal Centro Norte', 'Terminal Centro Norte'],
    ['Bosque', 'Bosque Ámbar'], ['Bosque Bosque', 'Bosque Ámbar'],
    ['Ámbar Ámbar', 'Ámbar Ámbar'], ['Robles', 'Robles'],
    ['Bosques Ambarino', 'Bosque Ámbar'], ['Los Del Sur', 'Los Del Sur'],
    ['Parque Ámbar', 'Parque Ámbar'], ['C55', 'C55'], ['', 'Bosque Ámbar']
  ]) assert.equal(coincideDestino(texto, destino), false, `${texto} / ${destino}`);
  assert.equal(coincideDestino(null, null), false);
});

test('exige dos lecturas separadas por 500 ms y usa la frase prudente', () => {
  const c = new Confirmador();
  assert.deepEqual(c.registrar(frame(0)), {
    estado: 'leyendo', linea: 'C55', destino: false, confirmada: false,
    frase: 'Parece decir C55. Necesito otra lectura independiente.'
  });
  assert.equal(c.registrar(frame(499)).confirmada, false);
  assert.deepEqual(c.registrar(frame(500)), {
    estado: 'coincide', linea: 'C55', destino: false, confirmada: true,
    frase: 'Parece decir C55. Coincide con la ruta que buscas; no pude confirmar el sentido.'
  });
});

test('repetir un frame no agrega votos, aunque cambie el texto o la confianza', () => {
  const c = new Confirmador();
  for (let i = 0; i < 6; i++) {
    assert.equal(c.registrar(frame(100, { texto: i % 2 ? 'C-55' : 'C55', confianza: 65 + i })).confirmada, false);
  }
  assert.equal(c.registrar(frame(599)).confirmada, false);
  assert.equal(c.registrar(frame(600)).confirmada, true);
});

test('un segundo voto exactamente a 10 s sirve; uno más viejo caduca', () => {
  const limite = new Confirmador();
  limite.registrar(frame(0));
  assert.equal(limite.registrar(frame(10000)).confirmada, true);
  const vencido = new Confirmador();
  vencido.registrar(frame(0));
  assert.equal(vencido.registrar(frame(10001)).confirmada, false);
  assert.equal(vencido.registrar(frame(10501)).confirmada, true);
  assert.equal(vencido.registrar(frame(20502)).confirmada, false);
});

test('confianza menor de 65, no numérica o no finita nunca suma votos', () => {
  for (const confianza of [64.99, 0, -1, undefined, null, '90', NaN, Infinity]) {
    const c = new Confirmador();
    assert.equal(c.registrar(frame(0, { confianza })).confirmada, false);
    assert.equal(c.registrar(frame(500, { confianza })).linea, null);
    assert.equal(c.registrar(frame(1000)).confirmada, false);
    assert.equal(c.registrar(frame(1500, { confianza: 65 })).confirmada, true);
  }
});

test('un frame poco confiable tampoco hereda una confirmación anterior', () => {
  const c = new Confirmador();
  c.registrar(frame(0));
  assert.equal(c.registrar(frame(500)).confirmada, true);
  const lectura = c.registrar(frame(1000, { confianza: 64 }));
  assert.equal(lectura.estado, 'leyendo');
  assert.equal(lectura.confirmada, false);
  assert.equal(lectura.destino, false);
});

test('varios códigos invalidan evidencia y nunca se elige por el objetivo', () => {
  for (const objetivo of [OBJETIVO, { linea: 'T80', hacia: 'Mirador Castaños' }, null]) {
    const c = new Confirmador();
    c.registrar(frame(0, { objetivo }));
    const varias = c.registrar(frame(500, { texto: 'C55 / T80', objetivo }));
    assert.deepEqual(varias, {
      estado: 'varias', linea: null, destino: false, confirmada: false,
      frase: 'Aparecen varios códigos. Necesito una lectura de un solo letrero.'
    });
    assert.equal(c.registrar(frame(1000, { objetivo })).confirmada, false);
  }
  const c = new Confirmador();
  c.registrar(frame(0));
  c.registrar(frame(500, { texto: 'C55 / T80', confianza: 1 }));
  assert.equal(c.registrar(frame(1000)).confirmada, false);
});

test('rutas contradictorias reinician el conteo, aun con confianza insuficiente', () => {
  for (const confianza of [90, 20]) {
    const c = new Confirmador();
    c.registrar(frame(0));
    c.registrar(frame(500, { texto: 'T80', confianza }));
    assert.equal(c.registrar(frame(1000)).confirmada, false);
    assert.equal(c.registrar(frame(1500)).estado, 'coincide');
  }
});

test('dos votos de otra ruta producen otra, sin sesgo hacia la buscada', () => {
  const c = new Confirmador();
  c.registrar(frame(0, { texto: 'T80' }));
  const otra = c.registrar(frame(500, { texto: 'T-80' }));
  assert.equal(otra.estado, 'otra');
  assert.equal(otra.linea, 'T80');
  assert.equal(otra.confirmada, true);
  assert.equal(otra.destino, false);
  assert.equal(otra.frase, 'Parece decir T80. No coincide con la ruta que buscas; no pude confirmar el sentido.');
});

test('ni un sufijo ni un número parcial votan por el objetivo', () => {
  for (const texto of ['C550', 'C55B', 'C5S', '55', 'C5']) {
    const c = new Confirmador();
    c.registrar(frame(0, { texto, catalogo: ['C55'] }));
    assert.equal(c.registrar(frame(500, { texto, catalogo: ['C55'] })).confirmada, false);
    assert.equal(c.registrar(frame(1000, { catalogo: ['C55'] })).confirmada, false);
  }
});

test('un código incompleto o fuera del catálogo interrumpe evidencia previa', () => {
  for (const texto of ['C550', 'C55B', 'C5S', '55', 'C5']) {
    const c = new Confirmador();
    c.registrar(frame(0, { catalogo: ['C55'] }));
    c.registrar(frame(500, { texto, catalogo: ['C55'] }));
    assert.equal(c.registrar(frame(1000, { catalogo: ['C55'] })).confirmada, false, texto);
    assert.equal(c.registrar(frame(1500, { catalogo: ['C55'] })).confirmada, true);
  }
});

test('cambiar referencia invalida incluso una ruta ya confirmada', () => {
  const c = new Confirmador();
  c.registrar(frame(0));
  assert.equal(c.registrar(frame(500)).confirmada, true);
  assert.equal(c.registrar(frame(1000, { referencia: 'escena-b' })).confirmada, false);
  assert.equal(c.registrar(frame(1500, { referencia: 'escena-b' })).confirmada, true);
  assert.equal(c.registrar(frame(2000)).confirmada, false);
});

test('las referencias opacas se comparan por identidad', () => {
  const c = new Confirmador();
  const referencia = {};
  c.registrar(frame(0, { referencia }));
  assert.equal(c.registrar(frame(500, { referencia })).confirmada, true);
  assert.equal(c.registrar(frame(1000, { referencia: {} })).confirmada, false);
});

test('cambiar línea o destino del objetivo invalida los votos', () => {
  for (const objetivo of [
    { linea: 'T80', hacia: OBJETIVO.hacia },
    { linea: 'C55', hacia: 'Mirador Castaños' }
  ]) {
    const c = new Confirmador();
    c.registrar(frame(0));
    assert.equal(c.registrar(frame(500, { objetivo })).confirmada, false);
    assert.equal(c.registrar(frame(1000, { objetivo })).confirmada, true);
  }
});

test('recrear un objetivo con los mismos valores no impide confirmar', () => {
  const c = new Confirmador();
  c.registrar(frame(0));
  assert.equal(c.registrar(frame(500)).confirmada, true);
});

test('retroceder el reloj invalida todo voto anterior', () => {
  const c = new Confirmador();
  c.registrar(frame(1000));
  c.registrar(frame(1500));
  assert.equal(c.registrar(frame(900)).confirmada, false);
  assert.equal(c.registrar(frame(1399)).confirmada, false);
  assert.equal(c.registrar(frame(1400)).confirmada, true);
});

test('tiempos inválidos no votan y borran evidencia previa', () => {
  for (const instante of [undefined, null, NaN, Infinity, '500']) {
    const c = new Confirmador();
    c.registrar(frame(0));
    assert.equal(c.registrar(frame(instante)).confirmada, false);
    assert.equal(c.registrar(frame(1000)).confirmada, false);
  }
});

test('solo menciona destino después de dos lecturas válidas con coincidencia', () => {
  const c = new Confirmador();
  c.registrar(frame(0, { texto: 'C55 BOSQUE ÁMBAR' }));
  const confirmado = c.registrar(frame(500, { texto: 'C-55 Ambar Bosque' }));
  assert.equal(confirmado.destino, true);
  assert.equal(confirmado.frase,
    'Parece decir C55. Coincide con la ruta que buscas. También coincide el letrero de destino.');
  const incompleto = c.registrar(frame(1000));
  assert.equal(incompleto.confirmada, true);
  assert.equal(incompleto.destino, false);
  assert.match(incompleto.frase, /no pude confirmar el sentido/);
  assert.equal(c.registrar(frame(1500, { texto: 'C55 Bosque Ámbar' })).destino, false);
  assert.equal(c.registrar(frame(2000, { texto: 'C55 Bosque Ámbar' })).destino, true);
});

test('duplicados y frames muy próximos no agregan confirmación de destino', () => {
  const c = new Confirmador();
  c.registrar(frame(0, { texto: 'C55 Bosque Ámbar' }));
  assert.equal(c.registrar(frame(0, { texto: 'C55 Bosque Ámbar' })).destino, false);
  assert.equal(c.registrar(frame(499, { texto: 'C55 Bosque Ámbar' })).destino, false);
  assert.equal(c.registrar(frame(500)).destino, false);
  assert.equal(c.registrar(frame(500, { texto: 'C55 Bosque Ámbar' })).destino, false);
  assert.equal(c.registrar(frame(1000, { texto: 'C55 Bosque Ámbar' })).destino, false);
  assert.equal(c.registrar(frame(1500, { texto: 'C55 Bosque Ámbar' })).destino, true);
});

test('destinos ambiguos o de una palabra nunca confirman el sentido', () => {
  for (const hacia of ['Centro', 'Centro Histórico', 'Bosque', 'Terminal Norte']) {
    const c = new Confirmador();
    const cambios = { texto: `C55 ${hacia}`, objetivo: { linea: 'C55', hacia } };
    c.registrar(frame(0, cambios));
    const r = c.registrar(frame(500, cambios));
    assert.equal(r.estado, 'coincide');
    assert.equal(r.destino, false);
    assert.match(r.frase, /no pude confirmar el sentido/);
  }
});

test('sin objetivo solo muestra un posible código y nunca acumula votos', () => {
  const c = new Confirmador();
  for (const instante of [0, 500, 1000]) {
    assert.deepEqual(c.registrar(frame(instante, { objetivo: null, texto: 'C55 Bosque Ámbar' })), {
      estado: 'sin-objetivo', linea: 'C55', destino: false, confirmada: false, frase: 'Parece decir C55.'
    });
  }
  assert.equal(c.registrar(frame(1500)).confirmada, false);
  assert.equal(c.registrar(frame(2000)).confirmada, true);
});

test('las lecturas vacías o sin código no reutilizan el resultado anterior', () => {
  const c = new Confirmador();
  c.registrar(frame(0));
  c.registrar(frame(500));
  const vacio = c.registrar(frame(1000, { texto: '  ' }));
  assert.equal(vacio.estado, 'sin-lectura');
  assert.equal(vacio.linea, null);
  assert.equal(vacio.confirmada, false);
  const desconocido = c.registrar(frame(1100, { texto: 'C5S' }));
  assert.equal(desconocido.estado, 'leyendo');
  assert.equal(desconocido.confirmada, false);
  assert.equal(new Confirmador().registrar().estado, 'sin-lectura');
});

test('reiniciar es repetible y elimina toda evidencia de ruta y destino', () => {
  const c = new Confirmador();
  c.registrar(frame(0, { texto: 'C55 Bosque Ámbar' }));
  c.registrar(frame(500, { texto: 'C55 Bosque Ámbar' }));
  c.reiniciar();
  c.reiniciar();
  const nuevo = c.registrar(frame(0));
  assert.equal(nuevo.confirmada, false);
  assert.equal(nuevo.destino, false);
  assert.equal(c.registrar(frame(500)).confirmada, true);
});

test('un cambio del catálogo invalida la unicidad evaluada anteriormente', () => {
  const c = new Confirmador();
  c.registrar(frame(0));
  assert.equal(c.registrar(frame(500, { catalogo: [...CATALOGO, 'Z19'] })).confirmada, false);
  assert.equal(c.registrar(frame(1000, { catalogo: ['Z19', ...CATALOGO].reverse() })).confirmada, true);
});

test('los resultados tienen el contrato completo y no afirman abordaje ni seguridad', () => {
  const c = new Confirmador();
  const resultados = [
    c.registrar(frame(0)), c.registrar(frame(500)), c.registrar(frame(1000, { texto: '' })),
    c.registrar(frame(1500, { texto: 'C55 / T80' })),
    c.registrar(frame(2000, { objetivo: null })),
    c.registrar(frame(2500, { texto: 'T80' })), c.registrar(frame(3000, { texto: 'T80' }))
  ];
  for (const r of resultados) {
    assert.deepEqual(Object.keys(r).sort(), ['confirmada', 'destino', 'estado', 'frase', 'linea']);
    assert.equal(typeof r.confirmada, 'boolean');
    assert.equal(typeof r.destino, 'boolean');
    assert.doesNotMatch(r.frase, /puedes (subir|abordar)|es seguro|garantiz|certeza absoluta/i);
  }
});


test('dos lecturas de otro destino conocido advierten el sentido distinto', () => {
  const c = new Confirmador(), destinos = ['Bosque Ámbar', 'Rancho Bellavista'];
  c.registrar(frame(0, {texto:'C55 RANCHO BELLAVISTA', destinos}));
  const otro = c.registrar(frame(600, {texto:'C55 RANCHO BELLAVISTA', destinos}));
  assert.equal(otro.estado, 'otro-sentido'); assert.equal(otro.destino, false);
  assert.match(otro.frase, /otro sentido distinto/);
  c.reiniciar(); c.registrar(frame(0, {texto:'C55 BOSQUE AMBAR', destinos}));
  assert.notEqual(c.registrar(frame(600, {texto:'C55 RANCHO BELLAVISTA', destinos})).estado, 'otro-sentido');
});

test('destinos parcialmente leídos o indistinguibles no confirman el sentido', () => {
  assert.equal(coincideDestino('Bosque Ambar', 'Bosque Ámbar Juriquilla'), false);
  const c = new Confirmador(), destinos = ['Bosque Ámbar', 'Bosque Ámbar Norte'];
  c.registrar(frame(0, {texto:'C55 BOSQUE AMBAR', destinos}));
  const ambiguo = c.registrar(frame(600, {texto:'C55 BOSQUE AMBAR', destinos}));
  assert.equal(ambiguo.destino, false); assert.notEqual(ambiguo.estado, 'otro-sentido');
  c.reiniciar();
  const otros = ['Bosque Ámbar', 'Rancho Bellavista'];
  c.registrar(frame(0, {texto:'C55 RANCHO BELLAVISTA', destinos:otros}));
  c.registrar(frame(100, {texto:'C55', destinos:otros}));
  assert.notEqual(c.registrar(frame(600, {texto:'C55 RANCHO BELLAVISTA', destinos:otros})).estado, 'otro-sentido');
});
