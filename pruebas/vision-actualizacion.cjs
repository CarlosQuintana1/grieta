const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn, spawnSync } = require('node:child_process');
const { once } = require('node:events');
const assert = require('node:assert/strict');
(async () => {
  const repo = process.env.GRIETA_REPO ?? path.join(__dirname, '..');
  const versionActual = /const VERSION = "([^"]+)"/.exec(fs.readFileSync(path.join(repo, 'demo/sw.js'), 'utf8'))[1];
  const temporal = fs.mkdtempSync(path.join(os.tmpdir(), 'grieta-actualizacion-'));
  const archivo = spawnSync('git', ['archive', '4b12ba3', 'demo'], { cwd: repo, maxBuffer: 80 * 1024 * 1024 });
  assert.equal(archivo.status, 0);
  const extraer = spawnSync('tar', ['-x', '-C', temporal], { input: archivo.stdout }); assert.equal(extraer.status, 0);
  const destino = path.join(temporal, 'demo'); const anterior = fs.readFileSync(path.join(destino, 'sw.js'));
  const servidor = spawn('python3', ['-m', 'http.server', '8806', '--bind', '127.0.0.1', '--directory', destino], { stdio: 'ignore' });
  const navegador = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE, headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  try {
    const contexto = await navegador.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await contexto.addInitScript(() => { localStorage.setItem('grieta-bienvenida', 'true'); localStorage.setItem('grieta-acc', JSON.stringify({ voz: false })); });
    const pagina = await contexto.newPage(); const errores = [];
    pagina.on('pageerror', (e) => errores.push(e.message));
    await pagina.goto('http://127.0.0.1:8806');
    await pagina.waitForFunction(() => navigator.serviceWorker.controller);
    fs.cpSync(path.join(repo, 'demo'), destino, { recursive: true });
    fs.writeFileSync(path.join(destino, 'sw.js'), anterior);
    const depuracion = await contexto.newCDPSession(pagina);
    await depuracion.send('Network.clearBrowserCache');
    await pagina.reload();
    assert.equal(await pagina.evaluate(() => acc.toques), true);
    assert.equal(await pagina.evaluate(() => typeof GrietaVision.deteccionesValidas), 'function');
    await pagina.locator('#abrirCamara').click(); await pagina.locator('#camaraIniciar').click();
    await pagina.waitForFunction(() => document.querySelector('#camaraEstado').textContent.match(/^(Cámara encendida|No pude)/), null, { timeout: 180000 });
    assert.match(await pagina.locator('#camaraEstado').textContent(), /^Cámara encendida/);
    assert(await pagina.evaluate(async () => (await fetch('sw.js').then((r) => r.text())).includes('grieta-68')));
    await pagina.locator('#camaraDetener').click();
    console.log('Instalación antigua: código y modelo nuevos funcionan aun con el service worker 68 activo');
    fs.copyFileSync(path.join(repo, 'demo/sw.js'), path.join(destino, 'sw.js'));
    await pagina.evaluate(async () => { window.__controladorAnterior = navigator.serviceWorker.controller; await (await navigator.serviceWorker.getRegistration()).update(); });
    const limiteActualizacion = Date.now() + 60000;
    let actualizada = false;
    while (!actualizada && Date.now() < limiteActualizacion) {
      actualizada = await pagina.evaluate(async (version) => {
        const registro = await navigator.serviceWorker.getRegistration();
        if (navigator.serviceWorker.controller === window.__controladorAnterior || registro.active?.state !== 'activated' || registro.installing || registro.waiting) return false;
        const cache = await caches.open(version), app = await cache.match('app.js');
        return Boolean(app?.ok && (await app.text()).includes('ToquesGrieta.iniciar') && (await cache.match('toques.js'))?.ok && (await cache.match('practica.js'))?.ok && (await cache.match('vision/transporte.js', {ignoreSearch:true}))?.ok && (await cache.match('index.html'))?.ok);
      }, versionActual);
      if (!actualizada) await pagina.waitForTimeout(100);
    }
    assert(actualizada, 'La actualización debe estar activa y todos sus módulos en caché antes de desconectar');
    const apagado = once(servidor, 'exit'); servidor.kill('SIGTERM'); await apagado;
    await contexto.setOffline(true); await pagina.reload({ waitUntil: 'domcontentloaded' });
    assert.equal(await pagina.evaluate(() => typeof ToquesGrieta), 'object');
    await pagina.evaluate(() => { acc.modoVoz = true; acc.voz = false; aplicarAcc(); });
    await pagina.locator('#vozCamara').tap(); assert.equal(await pagina.locator('body').getAttribute('data-pantalla'), 'inicio');
    await pagina.locator('#vozCamara').tap(); assert.equal(await pagina.locator('body').getAttribute('data-pantalla'), 'camara');
    await pagina.locator('#camaraIniciar').tap(); await pagina.locator('#camaraIniciar').tap();
    await pagina.waitForFunction(() => document.querySelector('#camaraEstado').textContent.match(/^(Cámara encendida|No pude)/), null, { timeout: 90000 });
    assert.match(await pagina.locator('#camaraEstado').textContent(), /^Cámara encendida/);
    await pagina.locator('#camaraDetener').tap(); await pagina.locator('#camaraDetener').tap(); assert.equal(errores.length, 0);
    await pagina.locator('[data-tab="ajustes"]').tap(); await pagina.locator('[data-tab="ajustes"]').tap();
    await pagina.locator('#practicarAjustes').tap(); await pagina.locator('#practicarAjustes').tap();
    await pagina.locator('#practicaBoton').tap(); await pagina.locator('#practicaBoton').tap();
    assert.match(await pagina.locator('#practicaEstado').textContent(), /completada/);
    console.log('La práctica de toques funciona sin conexión después de actualizar');
    console.log('Nuevo controlador activo: gestos y cámara funcionan sin servidor ni red, cero errores de JavaScript');
  } finally { servidor.kill('SIGTERM'); await navegador.close(); fs.rmSync(temporal, { recursive: true, force: true }); }
})().catch((error) => { console.error(error); process.exit(1); });
