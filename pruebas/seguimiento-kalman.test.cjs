const test = require('node:test');
const assert = require('node:assert/strict');
require('../demo/vision/movimiento.js');
require('../demo/vision/seguimiento.js');
const { Seguimiento, hungaro } = GrietaSeguimiento;
const coche = (area, cx = .5, clase = 'car') => { const w = Math.sqrt(area * 1.3), h = Math.sqrt(area / 1.3); return { clase, confianza: .9, caja: { x: cx - w / 2, y: .7 - h, w, h } }; };
const correr = (s, cuadros) => cuadros.reduce((aviso, [t, objetos]) => s.actualizar(objetos, t) ?? aviso, null);
test('sigue avisando aunque el detector se salte cuadros', () => {
  const cuadros = [[0, [coche(.03)]], [250, [coche(.036)]], [500, []], [750, [coche(.052)]], [1000, []], [1250, [coche(.075)]]];
  assert.equal(correr(new Seguimiento(), cuadros)?.clase, 'car');
});
test('tolera temblor de la caja mientras el auto se acerca', () => {
  const areas = [.03, .036, .034, .046, .044, .06, .058, .075];
  assert.equal(correr(new Seguimiento(), areas.map((a, i) => [i * 250, [coche(a)]]))?.clase, 'car');
});
test('un auto quieto con caja temblorosa no avisa', () => {
  const areas = [.08, .09, .075, .088, .07, .092, .078, .086, .072, .09];
  assert.equal(correr(new Seguimiento(), areas.map((a, i) => [i * 250, [coche(a)]])), null);
});
test('dos autos cercanos no se intercambian la pista', () => {
  const s = new Seguimiento();
  const cuadros = [0, 250, 500, 750, 1000].map((t, i) => [t, [coche(.012, .44 + i * .004), coche(.03 * 1.32 ** i, .5)]]);
  assert.equal(correr(s, cuadros)?.caja.w > .2, true);
  assert.equal(s.pistas.length, 2);
});
test('la asignación húngara encuentra el costo mínimo donde la voraz falla', () => {
  assert.deepEqual(hungaro([[.1, .2], [.15, .9]]), [1, 0]);
  assert.deepEqual(hungaro([[.5, .1, .9]]), [1]);
});
