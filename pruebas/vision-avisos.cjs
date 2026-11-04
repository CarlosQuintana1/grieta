const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const navegador = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE, headless: true });
  const contexto = await navegador.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await contexto.addInitScript(() => {
    localStorage.setItem('grieta-bienvenida', 'true');
    localStorage.setItem('grieta-acc', JSON.stringify({ voz: false, tema: 'oscuro' }));
    window.__vibraciones = []; window.__liberaciones = 0;
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: (patron) => { window.__vibraciones.push(patron); return true; } });
    Object.defineProperty(navigator, 'wakeLock', { value: { request: async () => ({ release: async () => { window.__liberaciones++; } }) } });
    navigator.mediaDevices.getUserMedia = async () => {
      const c = document.createElement('canvas'); c.width = 640; c.height = 480; window.__escena = c;
      const x = c.getContext('2d'); for (let j = 0; j < 32; j++) for (let i = 0; i < 48; i++) { x.fillStyle = (i + j) % 2 ? '#444' : '#ccc'; x.fillRect(i * 640 / 48, j * 480 / 32, 640 / 48 + 1, 480 / 32 + 1); }
      const flujo = c.captureStream(10); window.__pistas = flujo.getTracks(); return flujo;
    };
    window.Worker = class {
      constructor() { this.numero = 0; this.activo = true; }
      terminate() { this.activo = false; }
      postMessage(d) {
        let respuesta = { tipo: 'listo' };
        if (d.tipo === 'detectar') {
          const w = [.15, .2, .25][Math.min(this.numero++, 2)];
          respuesta = { tipo: 'objetos', ms: 10, ancho: d.ancho, alto: d.alto, detecciones: [{ categories: [{ categoryName: 'car', score: .9 }], boundingBox: { originX: (.5 - w / 2) * d.ancho, originY: .35 * d.alto, width: w * d.ancho, height: (w + .05) * d.alto } }] };
        }
        setTimeout(() => { if (this.activo) this.onmessage?.({ data: respuesta }); }, 10);
      }
    };
  });
  await contexto.route('**/vision/activos.json', (r) => r.fulfill({ json: [] }));
  const pagina = await contexto.newPage(); const errores = [];
  pagina.on('pageerror', (e) => errores.push(e.message));
  await pagina.goto(process.env.GRIETA_URL ?? 'http://127.0.0.1:8791');
  await pagina.locator('#abrirCamara').click();
  assert.equal(await pagina.locator('#camaraAvisos').isChecked(), false);
  assert.notEqual(await pagina.locator('#camaraDetalle').evaluate((e) => getComputedStyle(e).appearance), 'none');
  await pagina.locator('#camaraAvisos').check();
  await pagina.locator('#camaraIniciar').click();
  await pagina.waitForFunction(() => document.querySelector('#camaraAlerta').textContent.includes('ocupa más espacio'), null, { timeout: 10000 });
  assert(await pagina.evaluate(() => window.__vibraciones.some(Array.isArray)));
  assert.equal(await pagina.locator('#camaraDetalle').isDisabled(), true);
  console.log('Secuencia simulada: aviso experimental central, vibración solicitada y controles coherentes');
  const avisos = await pagina.evaluate(() => window.__vibraciones.filter(Array.isArray).length);
  await pagina.evaluate(() => { const c = window.__escena; c.getContext('2d').fillStyle = 'black'; c.getContext('2d').fillRect(0, 0, c.width, c.height); });
  await pagina.waitForFunction(() => document.querySelector('#camaraCalidad').textContent.includes('oscura'), null, { timeout: 10000 });
  assert.equal(await pagina.locator('#camaraResultado').textContent(), '');
  assert.equal(await pagina.evaluate(() => window.__vibraciones.filter(Array.isArray).length), avisos);
  await pagina.locator('#camaraAvisos').uncheck();
  assert.equal(await pagina.locator('#camaraAlerta').textContent(), '');
  await pagina.evaluate(() => Object.defineProperty(navigator, 'vibrate', { configurable: true, value: () => { throw Error('rechazada'); } }));
  await pagina.locator('#camaraDetener').click();
  assert.equal(await pagina.evaluate(() => window.__liberaciones), 1);
  assert.deepEqual(await pagina.evaluate(() => window.__pistas.map((p) => p.readyState)), ['ended']);
  await pagina.locator('#camaraLigero').check();
  await pagina.reload(); await pagina.locator('#abrirCamara').click();
  assert(await pagina.locator('#camaraLigero').isChecked());
  assert.equal(await pagina.locator('#camaraAvisos').isChecked(), false);
  await pagina.evaluate(() => { Object.defineProperty(navigator, 'vibrate', { configurable: true, value: undefined }); CamaraGrieta.iniciarInterfaz({ hablar: () => {}, callar: () => {}, paradas: () => [] }); });
  assert.match(await pagina.locator('#camaraVibracion').textContent(), /no permite vibrar/);
  assert.equal(await pagina.locator('#camaraProbar').isVisible(), false);
  assert.equal(errores.length, 0);
  console.log('Oscuridad sin nuevos avisos; pistas y bloqueo liberados; preferencias persistentes; ausencia de vibración informada; cero errores JS');
  await pagina.screenshot({ animations: 'disabled', path: require('node:path').join(require('node:os').tmpdir(), 'grieta-69-camara.png') });
  await navegador.close();
})().catch((error) => { console.error(error); process.exit(1); });
