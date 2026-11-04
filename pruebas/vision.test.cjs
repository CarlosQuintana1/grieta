const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../demo/vision/movimiento.js');
require('../demo/vision/seguimiento.js');
require('../demo/vision/observaciones.js');
const { objetos, textoLegible, paradaPosible } = globalThis.GrietaVision;
const deteccion = (clase, score, x) => ({ categories: [{ categoryName: clase, score }], boundingBox: { originX: x, originY: 0, width: 60, height: 80 } });
test('omite clases desconocidas, baja confianza y duplicados', () => {
  assert.deepEqual(objetos([deteccion('person', .9, 0), deteccion('person', .8, 10), deteccion('pothole', .99, 200), deteccion('car', .54, 200)], 640).map(({ clave, texto }) => ({ clave, texto })), [{ clave: 'person:a la izquierda', texto: 'una persona a la izquierda' }]);
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

test('incluye las 80 clases y agrupa personas distintas sin contar una caja repetida', () => {
  assert.equal(Object.keys(GrietaVision.nombres).length, 80);
  const personas = [deteccion('person', .9, 0), deteccion('person', .85, 5), deteccion('person', .8, 140)];
  assert.match(objetos(personas, 640, 480)[0].texto, /^2 personas a la izquierda$/);
  assert.match(objetos([deteccion('parking meter', .8, 100)], 640, 480)[0].texto, /parquímetro/);
});
const { Seguimiento, calidad } = GrietaSeguimiento;
const vehiculo = (w, h, x = .5 - w / 2, clase = 'car') => ({ clase, confianza: .9, caja: { x, y: .35, w, h } });
const crecer = (s, desplazamiento = 0, inestable = false) => [s.actualizar([vehiculo(.15, .2)], desplazamiento), s.actualizar([vehiculo(.2, .26)], desplazamiento + 600), s.actualizar([vehiculo(.25, .3)], desplazamiento + 1200, inestable)];
test('señala crecimiento central sostenido y respeta la pausa entre avisos', () => {
  const s = new Seguimiento();
  assert.equal(crecer(s)[2].clase, 'car');
  assert.equal(s.actualizar([vehiculo(.3, .35)], 1800), null);
});
test('descarta tamaño constante, reducción, baja confianza y cambios de objeto', () => {
  for (const ejemplos of [
    [vehiculo(.2, .3), vehiculo(.2, .3), vehiculo(.2, .3)],
    [vehiculo(.3, .4), vehiculo(.25, .35), vehiculo(.2, .3)],
    [vehiculo(.15, .2), vehiculo(.2, .26, .7), vehiculo(.25, .3)],
    [vehiculo(.15, .2), vehiculo(.2, .26, .4, 'bus'), vehiculo(.25, .3)],
    [vehiculo(.15, .2), vehiculo(.2, .26), { ...vehiculo(.25, .3), confianza: .6 }],
  ]) {
    const s = new Seguimiento();
    ejemplos.forEach((o, i) => assert.equal(s.actualizar([o], i * 600), null));
  }
});
test('descarta vehículos laterales, imagen inestable y detecciones demasiado separadas', () => {
  const lateral = new Seguimiento();
  [.15, .2, .25].forEach((w, i) => assert.equal(lateral.actualizar([vehiculo(w, w + .05, 0)], i * 600), null));
  assert.equal(crecer(new Seguimiento(), 0, true)[2], null);
  const lento = new Seguimiento();
  [.15, .2, .25].forEach((w, i) => assert.equal(lento.actualizar([vehiculo(w, w + .05)], i * 2000), null));
});
test('distingue oscuridad, exceso de luz, poco detalle y movimiento global', () => {
  const imagen = (fn) => { const p = new Uint8ClampedArray(48 * 32 * 4); for (let i = 0; i < 48 * 32; i++) p.set([fn(i), fn(i), fn(i), 255], i * 4); return p; };
  assert.equal(calidad(imagen(() => 0), 48, 32).problema, 'oscura');
  assert.equal(calidad(imagen(() => 255), 48, 32).problema, 'expuesta');
  assert.equal(calidad(imagen(() => 128), 48, 32).problema, 'sin-detalle');
  const anterior = calidad(imagen((i) => i % 2 ? 50 : 180), 48, 32);
  assert.equal(anterior.problema, null);
  assert.equal(calidad(imagen((i) => i % 2 ? 50 : 180), 48, 32, anterior).movimiento, 0);
  assert(calidad(imagen((i) => i % 2 ? 180 : 50), 48, 32, anterior).movimiento > .1);
});

test('recorta cajas fuera de la imagen antes de medir su crecimiento', () => {
  const d = deteccion('car', .9, -40); d.boundingBox.width = 50;
  const caja = GrietaVision.deteccionesValidas([d], 100, 100)[0].caja;
  assert.equal(caja.x, 0); assert.equal(caja.w, .1);
  d.boundingBox.originX = 150;
  assert.equal(GrietaVision.deteccionesValidas([d], 100, 100).length, 0);
});
