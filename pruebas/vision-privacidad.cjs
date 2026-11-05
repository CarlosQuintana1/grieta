const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const navegador = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE, headless: true });
  const contexto = await navegador.newContext({ serviceWorkers: 'block' });
  await contexto.addInitScript(() => {
    localStorage.setItem('grieta-bienvenida', 'true');
    localStorage.setItem('grieta-acc', JSON.stringify({ voz: true, vozElegida: true, lector: 'no' }));
    window.__voces = [{ name: 'remota', lang: 'es-MX', localService: false }, { name: 'local', lang: 'es-ES', localService: true }];
    window.__dichos = [];
    window.SpeechSynthesisUtterance = function (texto) { this.text = texto; };
    Object.defineProperty(window, 'speechSynthesis', { value: {
      getVoices: () => window.__voces,
      cancel: () => {},
      speak: (mensaje) => { window.__dichos.push({ texto: mensaje.text, local: mensaje.voice?.localService }); setTimeout(() => mensaje.onend?.(), 0); },
    } });
  });
  const pagina = await contexto.newPage();
  await pagina.goto(process.env.GRIETA_URL ?? 'http://127.0.0.1:8791');
  await pagina.evaluate(() => hablarCamara('Texto privado de cámara'));
  assert.deepEqual(await pagina.evaluate(() => window.__dichos.filter((m) => m.texto === 'Texto privado de cámara').map((m) => m.local)), [true]);
  await pagina.evaluate(() => { window.__voces = window.__voces.filter((v) => !v.localService); hablarCamara('No enviar a voz remota'); });
  assert.equal(await pagina.evaluate(() => window.__dichos.some((m) => m.texto === 'No enviar a voz remota')), false);
  assert.match(await pagina.locator('#camaraAudio').textContent(), /instala una voz/);
  await pagina.evaluate(() => { acc.lector = 'si'; hablarCamara('No duplicar lector'); });
  assert.equal(await pagina.evaluate(() => window.__dichos.some((m) => m.texto === 'No duplicar lector')), false);
  console.log('Narración: solo voz local; sin voz remota como respaldo ni duplicación de lector');
  await contexto.setOffline(true);
  await pagina.locator('#abrirCamara').click();
  await pagina.locator('#camaraIniciar').click();
  await pagina.waitForFunction(() => document.querySelector('#camaraEstado').textContent.startsWith('No pude preparar'), null, { timeout: 10000 });
  assert.equal(await pagina.locator('#camaraIniciar').isVisible(), true);
  assert.equal(await pagina.evaluate(() => document.querySelector('#camaraVideo').srcObject), null);
  console.log('Primera descarga sin red: error recuperable, cámara apagada');
  await navegador.close();
})().catch((error) => { console.error(error); process.exit(1); });
