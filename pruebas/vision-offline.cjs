const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const path = require('node:path');
const assert = require('node:assert/strict');
(async () => {
  const puerto = process.env.VISION_PUERTO ?? '8803';
  const servidor = spawn('python3', ['-m', 'http.server', puerto, '--bind', '127.0.0.1', '--directory', path.join(__dirname, '../demo')], { stdio: 'ignore' });
  const navegador = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE, headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  try {
    const contexto = await navegador.newContext();
    await contexto.addInitScript(() => {
      localStorage.setItem('grieta-bienvenida', 'true');
      localStorage.setItem('grieta-acc', JSON.stringify({ voz: false }));
    });
    const pagina = await contexto.newPage();
    await pagina.goto(`http://127.0.0.1:${puerto}`);
    await pagina.waitForFunction(() => navigator.serviceWorker.controller);
    await pagina.locator('#abrirCamara').click();
    await pagina.locator('#camaraIniciar').click();
    await pagina.waitForFunction(() => document.querySelector('#camaraEstado').textContent.startsWith('Cámara encendida'), null, { timeout: 180000 });
    await pagina.locator('#camaraDetener').click();
    const apagado = once(servidor, 'exit');
    servidor.kill('SIGTERM');
    await apagado;
    await contexto.setOffline(true);
    await pagina.locator('#camaraIniciar').click();
    await pagina.waitForFunction(() => document.querySelector('#camaraEstado').textContent.match(/^(Cámara encendida|No pude)/), null, { timeout: 90000 });
    assert.match(await pagina.locator('#camaraEstado').innerText(), /^Cámara encendida/);
    assert.equal(await pagina.locator('#camaraVideo').isVisible(), true);
    await pagina.locator('#camaraDetener').click();
    console.log('Detector, OCR y cámara arrancan con el servidor apagado y el navegador sin red');
  } finally { servidor.kill('SIGTERM'); await navegador.close(); }
})().catch((error) => { console.error(error); process.exit(1); });
