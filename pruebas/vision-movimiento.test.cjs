const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../demo/vision/movimiento.js'); require('../demo/vision/seguimiento.js');
const { identidad, transformarCaja, espera } = GrietaMovimiento;
const { calidad, Seguimiento } = GrietaSeguimiento;
const textura = () => Float32Array.from({ length: 64 * 48 }, (_, k) => { const x = k % 64, y = Math.floor(k / 64); return 128 + 35 * Math.sin(x * .7 + y * .31) + 30 * Math.cos(x * .21 - y * .8) + 22 * Math.sin(x * 1.4) * Math.cos(y * 1.1); });
const rgba = (g) => { const p = new Uint8ClampedArray(g.length * 4); g.forEach((v, i) => p.set([v, v, v, 255], i * 4)); return p; };
function deformar(g, t) {
  const det = t.a * t.e - t.b * t.d;
  return Float32Array.from(g, (_, k) => {
    const x = (k % 64) / 64 - t.c, y = Math.floor(k / 64) / 48 - t.f;
    const px = (t.e * x - t.b * y) / det * 64, py = (-t.d * x + t.a * y) / det * 48;
    if (px < 0 || py < 0 || px >= 63 || py >= 47) return 128;
    const ix = Math.floor(px), iy = Math.floor(py), dx = px - ix, dy = py - iy;
    return g[iy * 64 + ix] * (1 - dx) * (1 - dy) + g[iy * 64 + ix + 1] * dx * (1 - dy) + g[(iy + 1) * 64 + ix] * (1 - dx) * dy + g[(iy + 1) * 64 + ix + 1] * dx * dy;
  });
}
test('estima desplazamiento, giro y zoom del fondo sin pedir quietud', () => {
  const g = textura(), anterior = calidad(rgba(g), 64, 48);
  const angulo = .08, cos = Math.cos(angulo), sin = Math.sin(angulo);
  for (const t of [{ ...identidad(), c: 5 / 64, f: -3 / 48 }, { a: cos, b: -sin, c: .5 - .5 * cos + .5 * sin, d: sin, e: cos, f: .5 - .5 * sin - .5 * cos }, { ...identidad(), a: 1.12, e: 1.12, c: -.06, f: -.06 }]) {
    const actual = calidad(rgba(deformar(g, t)), 64, 48, anterior);
    assert.equal(actual.camara.fiable, true, JSON.stringify(actual.camara));
    assert(Math.abs(actual.camara.c - t.c) < .04); assert(Math.abs(actual.camara.f - t.f) < .04);
    assert.equal(actual.problema, null);
  }
});
test('un cambio de escena ambiguo no inventa una compensación fiable', () => {
  const g = textura(), anterior = calidad(rgba(g), 64, 48);
  const otro = Float32Array.from(g, (_, k) => 35 + ((k * 73 + (k % 13) * 97) % 180));
  assert.equal(calidad(rgba(otro), 64, 48, anterior).camara.fiable, false);
});
const coche = (caja) => ({ clase: 'car', confianza: .9, caja });
test('el zoom del teléfono sobre un coche estático no dispara acercamiento', () => {
  const s = new Seguimiento(), t = { ...identidad(), a: 1.15, e: 1.15, c: -.075, f: -.075 };
  let caja = { x: .4, y: .35, w: .2, h: .26 };
  assert.equal(s.actualizar([coche(caja)], 0), null);
  for (let i = 1; i <= 4; i++) { caja = transformarCaja(caja, t); assert.equal(s.actualizar([coche(caja)], i * 250, t), null); }
});
test('conserva seguimiento al desplazarse la cámara y crecer el coche por separado', () => {
  const s = new Seguimiento(), t = { ...identidad(), c: .03, f: -.01 };
  let caja = { x: .4, y: .35, w: .15, h: .2 }, aviso;
  s.actualizar([coche(caja)], 0);
  for (let i = 1; i <= 4; i++) {
    const anterior = transformarCaja(caja, t), w = anterior.w * 1.13, h = anterior.h * 1.13;
    caja = { x: anterior.x - (w - anterior.w) / 2, y: anterior.y - (h - anterior.h) / 2, w, h };
    aviso = s.actualizar([coche(caja)], i * 250, t) ?? aviso;
  }
  assert.equal(aviso?.clase, 'car');
});
test('no usa compensaciones dudosas para alertas y reduce la espera fija', () => {
  const s = new Seguimiento();
  assert.equal(s.actualizar([coche({ x: .3, y: .3, w: .4, h: .4 })], 1000, { ...identidad(), fiable: false }), null);
  assert.equal(espera(150, 0), 100); assert.equal(espera(150, .1), 50); assert.equal(espera(500, .1), 16);
});
