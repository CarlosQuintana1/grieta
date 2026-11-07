const { chromium } = require('playwright');
const assert = require('node:assert/strict');

(async () => {
  const navegador = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE });
  try {
    const contexto = await navegador.newContext({
      viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block',
    });
    await contexto.addInitScript(() => {
      localStorage.setItem('grieta-bienvenida', 'true');
      if (!localStorage.getItem('grieta-acc')) {
        localStorage.setItem('grieta-acc', JSON.stringify({ tema: 'oscuro', toques: false }));
      }
      if (!localStorage.getItem('grieta-lugares')) {
        localStorage.setItem('grieta-lugares', JSON.stringify([
          { nombre: 'Casa', lat: 20.619, lon: -100.4 },
          { nombre: 'Trabajo', lat: 20.61, lon: -100.43 },
        ]));
      }
      navigator.geolocation.getCurrentPosition = () => {};
    });
    const p = await contexto.newPage(), errores = [];
    p.on('pageerror', error => errores.push(error.message));
    await p.goto(process.env.GRIETA_URL ?? 'http://127.0.0.1:8829/');
    await p.waitForFunction(() => lugares.length > 0);
    const cdp = await contexto.newCDPSession(p);
    const dialogo = p.locator('#dialogoLugar');
    const nombre = p.locator('#nombreLugarGuardado');
    const pantalla = () => p.locator('body').getAttribute('data-pantalla');
    const guardados = () => p.evaluate(() => JSON.parse(localStorage.getItem('grieta-lugares')));
    const ficha = texto => p.locator('#guardados button[data-i]').filter({ hasText: texto });
    const tocar = (tipo, punto) => cdp.send('Input.dispatchTouchEvent', { type: tipo, touchPoints: punto ? [punto] : [] });

    async function centro(control) {
      await control.scrollIntoViewIfNeeded();
      const { x, y, width, height } = await control.boundingBox();
      return { x: Math.round(x + width / 2), y: Math.round(y + height / 2) };
    }
    async function sostener(control) {
      await tocar('touchStart', await centro(control));
      await dialogo.waitFor({ state: 'visible', timeout: 3000 });
      await tocar('touchEnd');
      assert(await dialogo.isVisible());
      assert.equal(await pantalla(), 'inicio');
    }
    async function editar(control) {
      await sostener(control);
      await p.locator('#editarNombreLugar').tap();
    }

    assert.equal(await p.locator('#vozRapida').count(), 0);
    assert.equal(await p.locator('#activarVoz').count(), 0);
    const punto = await centro(ficha('Trabajo'));
    await tocar('touchStart', punto);
    await tocar('touchMove', { ...punto, y: punto.y - 75 });
    await p.waitForTimeout(580);
    await tocar('touchEnd');
    assert(await dialogo.isHidden());
    assert.equal(await pantalla(), 'inicio');

    await sostener(ficha('Trabajo'));
    assert.equal(await p.locator('#tituloAccionesLugar').textContent(), 'Trabajo');
    assert.equal(await dialogo.evaluate(e => getComputedStyle(e).animationName), 'mostrar-lugar');
    await p.screenshot({ path: '/private/tmp/grieta-82-lugares-390.png', animations: 'disabled' });
    await p.keyboard.press('Escape');
    assert(await dialogo.isHidden());

    await editar(ficha('Trabajo'));
    await nombre.fill('Casa');
    await p.locator('#formularioLugar button[type=submit]').tap();
    assert(await p.locator('#otroNombreLugar').isVisible());
    await nombre.fill('Oficina');
    await p.locator('#formularioLugar button[type=submit]').tap();
    assert.deepEqual((await guardados())[1], { nombre: 'Oficina', lat: 20.61, lon: -100.43 });

    await editar(ficha('Oficina'));
    await nombre.fill('Otro sitio');
    await p.locator('#cambiarUbicacionLugar').tap();
    await p.locator('#atras').tap();
    await ficha('Oficina').waitFor();
    assert.equal((await guardados())[1].nombre, 'Oficina');

    await editar(ficha('Oficina'));
    await p.locator('#cambiarUbicacionLugar').tap();
    await p.locator('#resultados button[data-i]').first().tap();
    await ficha('Oficina').waitFor();
    assert.notEqual((await guardados())[1].lat, 20.61);
    assert.equal(await pantalla(), 'inicio');
    assert.equal(await p.evaluate(() => estado.destino), null);

    await p.route('**/reverse?**', ruta => ruta.fulfill({ json: { features: [] } }));
    await editar(ficha('Oficina'));
    await p.locator('#cambiarUbicacionLugar').tap();
    await p.locator('#resultados [data-mapa]').tap();
    await p.evaluate(() => mapa.fire('click', { latlng: { lat: 20.62, lng: -100.42 } }));
    await p.waitForFunction(() => estado.puntoMapa?.lat === 20.62);
    await p.locator('#usarPunto').tap();
    await ficha('Oficina').waitFor();
    assert.deepEqual((await guardados())[1], { nombre: 'Oficina', lat: 20.62, lon: -100.42 });
    assert.equal(await p.evaluate(() => estado.destino), null);

    await sostener(ficha('Oficina'));
    await p.locator('#quitarLugarInicio').tap();
    assert.equal(await ficha('Oficina').count(), 0);
    await p.locator('#deshacerInicio [data-deshacer]').tap();
    assert.equal(await ficha('Oficina').count(), 1);
    await p.reload();
    assert.equal(await ficha('Oficina').count(), 1);

    await p.setViewportSize({ width: 320, height: 844 });
    await p.emulateMedia({ reducedMotion: 'reduce' });
    await ficha('Oficina').focus();
    await p.keyboard.press('Shift+F10');
    assert(await dialogo.isVisible());
    assert.equal(await dialogo.evaluate(e => getComputedStyle(e).animationName), 'none');
    assert(await dialogo.evaluate(e => e.scrollWidth <= e.clientWidth));
    await p.screenshot({ path: '/private/tmp/grieta-82-lugares-320.png' });
    await p.locator('#cerrarDialogoLugar').tap();

    await ficha('Oficina').tap();
    await p.locator('#campoBuscar').waitFor();
    assert.equal(await p.evaluate(() => estado.destino.nombre), 'Oficina');
    await p.locator('#atras').tap();

    await p.evaluate(() => { Object.assign(acc, { modoVoz: true, grande: true, voz: false }); guardarAcc(); aplicarAcc(); });
    await sostener(p.locator('#vozCasa'));
    await p.locator('#quitarLugarInicio').tap();
    await p.locator('#deshacerInicio [data-deshacer]').tap();
    assert(await p.locator('#vozCasa').isVisible());
    assert.deepEqual(errores, []);
    console.log('Pulsación táctil, desplazamiento, toque normal, edición, cancelar, quitar y deshacer. Teclado, modo Voz y movimiento reducido comprobados.');
  } finally {
    await navegador.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
