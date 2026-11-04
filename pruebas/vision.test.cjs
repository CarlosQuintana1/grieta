const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../demo/vision/observaciones.js');
const { objetos, textoLegible, paradaPosible } = globalThis.GrietaVision;
const deteccion = (clase, score, x) => ({ categories: [{ categoryName: clase, score }], boundingBox: { originX: x, width: 60 } });
test('omite clases desconocidas, baja confianza y duplicados', () => {
  assert.deepEqual(objetos([deteccion('person', .9, 0), deteccion('person', .8, 10), deteccion('pothole', .99, 200), deteccion('car', .59, 200)], 640), [{ clave: 'person:a la izquierda', texto: 'una persona a la izquierda' }]);
});
test('describe la posición en la imagen sin afirmar distancia', () => {
  assert.match(objetos([deteccion('bus', .8, 500)], 640)[0].texto, /camión a la derecha$/);
});
test('el OCR descarta confianza baja y limita el texto', () => {
  assert.equal(textoLegible({ text: 'ALTO', confidence: 64 }), '');
  assert.equal(textoLegible({ text: 'QROBUS\nPLATÓN', confidence: 90 }), 'QROBUS PLATÓN');
  assert.equal(textoLegible({ text: 'a'.repeat(1000), confidence: 90 }).length, 220);
});
test('la parada requiere coincidencia única de dos palabras distintivas', () => {
  assert.equal(paradaPosible('AVENIDA PLATON CANTORES', ['Av. Platón/Cantores']), 'Av. Platón/Cantores');
  assert.equal(paradaPosible('AVENIDA PLATON', ['Av. Platón/Cantores']), null);
  assert.equal(paradaPosible('PLATON CANTORES MECANICOS', ['Av. Platón/Cantores', 'Av. Platón/Mecánicos']), null);
  assert.equal(paradaPosible('AVENIDA CENTRAL', ['Avenida Central']), null);
});
