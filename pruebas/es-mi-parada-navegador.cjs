const { chromium } = require('playwright');
const assert = require('node:assert/strict');
// C21 en Orquídeas/Av. Sta María del Pueblito: dos paradas con el mismo nombre a 24 m, una por sentido.
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE });
  const mia = { latitude: 20.552588, longitude: -100.450312, accuracy: 6 }, enfrente = { latitude: 20.55254, longitude: -100.450086, accuracy: 6 };
  const c = await b.newContext({ geolocation: mia, permissions: ['geolocation', 'accelerometer', 'gyroscope', 'magnetometer'] });
  const p = await c.newPage(), errores = [];
  p.on('pageerror', (e) => errores.push(e.message));
  await p.addInitScript(() => { localStorage.setItem('grieta-tutorial', JSON.stringify({ version: 1, completado: true })); localStorage.setItem('grieta-bienvenida', 'true'); });
  await p.goto(process.env.GRIETA_URL ?? 'http://127.0.0.1:8829/');
  await p.waitForFunction(() => Grieta.qrobus);
  const r = await p.evaluate(() => {
    const i = Grieta.qrobus.paradas.findIndex((x) => Math.abs(x[0] - 20.552588) < 1e-6 && Math.abs(x[1] + 100.450312) < 1e-6);
    const [lat, lon, nombre] = Grieta.qrobus.paradas[i];
    const camion = { linea: 'C21', hacia: Grieta.sentidosDeParada(i).find((x) => x.linea === 'C21').hacia, sale: 600, recorrido: [{ nombre, lat, lon }, { nombre: 'X', lat: lat + .003, lon }] };
    Object.assign(guia, { activa: true, fase: 'parada', enApp: false, k: 0, tramos: [camion], camion, dichos: new Set(), precision: 6, pasosPie: null });
    ir('guia');
    avanzarCamion(20.55254, -100.450086, 0);
    const llegarEnfrente = [guia.fase, $('guiaTitulo').textContent];
    avanzarCamion(lat, lon, 0);
    pintarGuia();
    return { llegarEnfrente, llegarMia: guia.fase, vistaCalle: Grieta.revisarParada({ lat, lon, precision: 5, objetivo: { lat, lon, nombre, linea: 'C21', hacia: camion.hacia } }).vistaCalle };
  });
  assert.deepEqual(r.llegarEnfrente, ['parada', 'Parece la parada de enfrente']);
  assert.equal(r.llegarMia, 'esperando');
  const revisar = async (geo) => { await c.setGeolocation(geo); await p.click('#esMiParada'); await p.waitForFunction(() => !$('paradaRevision').textContent.startsWith('Revisando')); return p.locator('#paradaRevision').textContent(); };
  assert.match(await revisar(mia), /^Sí, es tu parada/);
  assert.match(await revisar(enfrente), /^Parece que estás en la parada de enfrente/);
  assert.match(await revisar({ ...mia, accuracy: 45 }), /No estoy seguro.*mismo nombre/);
  for (const [vista, esperado] of [[r.vistaCalle, /lado correcto/], [(r.vistaCalle + 180) % 360, /lado contrario/]]) {
    await p.evaluate((v) => { clearInterval(window.__giro); window.__giro = setInterval(() => { const e = new Event('deviceorientation'); Object.defineProperty(e, 'webkitCompassHeading', { value: v }); window.dispatchEvent(e); }, 100); }, vista);
    await p.click('#brujulaParada');
    await p.waitForFunction(() => /Párate/.test($('paradaRevision').textContent));
    await p.waitForFunction(() => /brújula/.test($('paradaRevision').textContent) && !/Párate/.test($('paradaRevision').textContent), null, { timeout: 10000 });
    assert.match(await p.locator('#paradaRevision').textContent(), esperado);
  }
  assert.deepEqual(errores, []);
  console.log('¿Es mi parada?: llegada, GPS y brújula ok');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
