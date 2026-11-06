const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Dos paradas frente a frente (30 m) en una avenida norte-sur. Con circulacion por la derecha, la que va al norte
// queda del lado oriente y la que va al sur del poniente.
const d = 30 / 111320;
const datos = {
  servicio_por_dia: Array(7).fill('laboral'),
  paradas: [[20.59, -100.39 + d, 'Norte/Uno'], [20.59, -100.39, 'Norte/Uno'], [20.592, -100.39 + d, 'Siguiente Norte'], [20.588, -100.39, 'Siguiente Sur'], [20.59, -100.39 + 3 * d, 'Distinta']],
  patrones: [
    { linea: 'A', hacia: 'Centro', paradas: [0, 2], minutos: [0, 2], salidas: { laboral: [600] } },
    { linea: 'A', hacia: 'Sur', paradas: [1, 3], minutos: [0, 2], salidas: { laboral: [600] } },
  ],
};
async function motor() {
  const c = vm.createContext({ fetch: async () => ({ json: async () => datos }) });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../demo/grieta.js'), 'utf8') + ';this.motor=Grieta;', c);
  await c.motor.cargar(); return c.motor;
}
const objetivo = { lat: 20.59, lon: -100.39 + d, nombre: 'Norte/Uno', linea: 'A', hacia: 'Centro' };

test('distingue mi parada de la de enfrente cuando el GPS es bueno', async () => {
  const G = await motor();
  assert.equal(G.revisarParada({ lat: 20.59, lon: -100.39 + d, precision: 8, objetivo }).estado, 'si');
  const enfrente = G.revisarParada({ lat: 20.59, lon: -100.39, precision: 8, objetivo });
  assert.equal(enfrente.estado, 'enfrente');
  assert.equal(enfrente.opuesta.hacia, 'Sur');
  assert.equal(enfrente.mismoNombre, true);
});
test('no afirma cuando el error del GPS es mayor que la separación o está a la mitad', async () => {
  const G = await motor();
  assert.equal(G.revisarParada({ lat: 20.59, lon: -100.39 + d, precision: 40, objetivo }).estado, 'dudosa');
  assert.equal(G.revisarParada({ lat: 20.59, lon: -100.39 + d / 2, precision: 8, objetivo }).estado, 'dudosa');
  assert.equal(G.revisarParada({ lat: 20.6, lon: -100.39, precision: 8, objetivo }).estado, 'lejos');
});
test('la brújula sabe hacia dónde queda la calle desde mi parada', async () => {
  const G = await motor();
  const { rumbo, vistaCalle } = G.revisarParada({ lat: 20.59, lon: -100.39 + d, precision: 8, objetivo });
  assert.ok(Math.abs(rumbo - 0) < 2 || Math.abs(rumbo - 360) < 2, `rumbo ${rumbo}`);
  // Parada al oriente de la avenida, rumbo al norte: de frente a la calle se mira al poniente (270°).
  assert.ok(Math.abs(vistaCalle - 270) < 2, `vista ${vistaCalle}`);
  assert.equal(G.ladoPorBrujula(265, vistaCalle), 'si');
  assert.equal(G.ladoPorBrujula(90, vistaCalle), 'enfrente');
  assert.equal(G.ladoPorBrujula(0, vistaCalle), 'dudosa');
  assert.equal(G.ladoPorBrujula(null, vistaCalle), null);
});
