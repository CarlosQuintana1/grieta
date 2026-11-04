const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const navegador = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE });
  try {
    const contexto = await navegador.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    await contexto.addInitScript(() => {
      localStorage.setItem('grieta-bienvenida', 'true');
      if (!localStorage.getItem('grieta-acc')) localStorage.setItem('grieta-acc', JSON.stringify({ modoVoz: false, voz: true, lector: 'no', tema: 'oscuro' }));
      window.__dichos = []; window.__recortes = []; window.__limpiados = []; window.__modo = 'bus';
      window.SpeechSynthesisUtterance = function (text) { this.text = text; };
      Object.defineProperty(window, 'speechSynthesis', { value: { speaking: false, getVoices: () => [{ lang: 'es-MX', localService: true }], cancel: () => {}, speak: (m) => { window.__dichos.push(m.text); m.onend?.(); } } });
      navigator.geolocation.clearWatch = (id) => window.__limpiados.push(id);
      navigator.mediaDevices.getUserMedia = async (opciones) => {
        window.__opciones = opciones;
        const c = document.createElement('canvas'); c.width = 960; c.height = 600; window.__escena = c;
        window.__pintar = (codigo = 'C55', destino = 'COL. SERGIO VILLASENOR') => {
          const x = c.getContext('2d'); x.fillStyle = 'white'; x.fillRect(0, 0, 960, 600);
          x.fillStyle = 'black'; x.font = 'bold 100px Arial'; x.fillText(codigo, 100, 200);
          x.font = 'bold 46px Arial'; x.fillText(destino, 100, 340);
        };
        window.__pintar(); const stream = c.captureStream(10); window.__pistas = stream.getTracks(); return stream;
      };
      const Original = window.Worker;
      window.Worker = class {
        constructor(url) {
          this.activo = true;
          if (!String(url).includes('detector-worker')) {
            this.real = new Original(url);
            this.real.onmessage = (e) => {
              if (e.data.tipo === 'texto' && Number.isFinite(window.__confianza)) e.data.datos.confidence = window.__confianza;
              if (e.data.tipo === 'texto' && window.__retenerOCR) { window.__liberarOCR = () => { window.__retenerOCR = false; this.onmessage?.(e); }; }
              else this.onmessage?.(e);
            };
            this.real.onerror = (e) => this.onerror?.(e);
          }
        }
        terminate() { this.activo = false; this.real?.terminate(); }
        postMessage(d, transferir) {
          if (this.real) {
            if (d.tipo === 'leer') window.__recortes.push({ ancho: d.ancho, alto: d.alto });
            return this.real.postMessage(d, transferir);
          }
          let respuesta = { tipo: 'listo' };
          if (d.tipo === 'detectar') {
            const deteccion = (clase, x = .05, w = .9) => ({ categories: [{ categoryName: clase, score: .97 }], boundingBox: { originX: x * d.ancho, originY: .1 * d.alto, width: w * d.ancho, height: .8 * d.alto } });
            const detecciones = window.__modo === 'varios' ? [deteccion('bus', .05, .35), deteccion('bus', .55, .35)] : window.__modo === 'ninguno' ? [] : [deteccion(window.__modo === 'perro' ? 'dog' : 'bus')];
            respuesta = { tipo: 'objetos', ms: 12, ancho: d.ancho, alto: d.alto, detecciones };
          }
          d.imagen?.close(); setTimeout(() => { if (this.activo) this.onmessage?.({ data: respuesta }); }, 20);
        }
      };
    });
    const activos = JSON.parse(fs.readFileSync(path.join(__dirname, '../demo/vision/activos.json'), 'utf8')).filter(a => !a.ruta.includes('mediapipe') && !a.ruta.includes('efficientdet'));
    await contexto.route('**/vision/activos.json*', r => r.fulfill({ json: activos }));
    const pagina = await contexto.newPage(), errores = [], peticiones = [];
    pagina.on('pageerror', e => errores.push(e.message)); pagina.on('request', r => peticiones.push(r.method()));
    await pagina.goto(process.env.GRIETA_URL ?? 'http://127.0.0.1:8811');
    await pagina.locator('[data-tab="ajustes"]').tap();
    const preferencias = await pagina.evaluate(() => JSON.stringify(acc));
    await pagina.locator('#practicarAjustes').tap();
    await pagina.locator('#practicaBoton').tap();
    assert.match(await pagina.locator('#practicaEstado').textContent(), /Paso 2/);
    assert.equal(await pagina.evaluate(() => localStorage.getItem('grieta-practica-toques')), null);
    await pagina.waitForTimeout(700); await pagina.locator('#practicaBoton').tap(); await pagina.locator('#practicaBoton').tap();
    assert.match(await pagina.locator('#practicaEstado').textContent(), /completada/);
    assert.equal(await pagina.evaluate(() => localStorage.getItem('grieta-practica-toques')), 'true');
    await pagina.locator('#practicaTerminar').tap(); await pagina.locator('#practicaTerminar').tap();
    assert.equal(await pagina.locator('body').getAttribute('data-pantalla'), 'ajustes');
    assert.equal(await pagina.evaluate(() => JSON.stringify(acc)), preferencias);
    await pagina.evaluate(() => { acc.lector = 'si'; acc.voz = false; aplicarAcc(); });
    await pagina.locator('#practicarAjustes').tap(); assert.match(await pagina.locator('#practicaAyuda').textContent(), /lector de pantalla/);
    assert.equal(await pagina.evaluate(() => ToquesGrieta.activo()), false);
    await pagina.locator('#practicaBoton').focus(); await pagina.keyboard.press('Enter'); assert.match(await pagina.locator('#practicaEstado').textContent(), /completada/);
    await pagina.locator('#practicaSalir').tap();
    await pagina.evaluate(() => { acc.lector = 'no'; acc.voz = true; aplicarAcc(); ir('inicio'); });
    console.log('Práctica: explorar, activar, terminar, teclado y lector configurado; preferencias intactas');

    await pagina.waitForFunction(() => Grieta.qrobus?.patrones?.length);
    await pagina.evaluate(() => { guia.activa = true; guia.camion = { linea: 'C55', hacia: 'Col. Sergio Villaseñor' }; guia.reloj = 123; ir('guia'); document.getElementById('enParada').hidden = false; });
    await pagina.locator('#guiaCamara').tap(); assert.equal(await pagina.evaluate(() => guia.activa && guia.reloj === 123), true);
    assert.match(await pagina.locator('#camaraObjetivo').textContent(), /C55 hacia Col. Sergio/);
    await pagina.locator('#camaraIniciar').tap();
    await pagina.waitForFunction(() => document.querySelector('#camaraEstado').textContent.startsWith('Cámara encendida'), null, { timeout: 90000 });
    await pagina.waitForFunction(() => document.querySelector('#camaraCamionResultado').textContent.includes('También coincide'), null, { timeout: 45000 });
    assert(await pagina.evaluate(() => window.__recortes.length >= 2 && window.__recortes.every(r => r.ancho < 960 && r.alto < 600)));
    assert.equal(await pagina.evaluate(() => window.__opciones.audio), false);
    assert(!await pagina.evaluate(() => window.__dichos.some(t => /puedes subir|puedes cruzar/i.test(t))));
    console.log('OCR real con letrero generado y caja de camión simulada: dos imágenes recortadas, número y destino coinciden');
    await pagina.screenshot({ path: path.join(require('node:os').tmpdir(), 'grieta-73-camara.png'), animations: 'disabled' });
    await pagina.evaluate(() => { window.__confianza = 0; });
    await pagina.waitForFunction(() => document.querySelector('#camaraCamionResultado').textContent.includes('poco clara'), null, {timeout:15000});
    await pagina.evaluate(() => { window.__dichos = []; });
    if (await pagina.locator('#camaraRepetir').isEnabled()) await pagina.locator('#camaraRepetir').tap();
    assert(!await pagina.evaluate(() => window.__dichos.some(t => /Coincide con la ruta/.test(t))));
    await pagina.evaluate(() => { delete window.__confianza; });
    await pagina.waitForFunction(() => document.querySelector('#camaraCamionResultado').textContent.includes('También coincide'), null, {timeout:30000});
    console.log('Una lectura incierta retira la comparación anterior de Repetir');
    await pagina.evaluate(() => window.__pintar('C55', 'RANCHO BELLAVISTA'));
    await pagina.waitForFunction(() => document.querySelector('#camaraCamionResultado').textContent.includes('otro sentido distinto'), null, { timeout: 45000 });
    console.log('Mismo número y otro letrero conocido: el OCR real distingue el sentido diferente');
    await pagina.evaluate(() => { const v=document.getElementById('camaraVideo'); const t=v.currentTime; Object.defineProperty(v,'currentTime',{configurable:true,get:()=>t}); });
    await pagina.waitForFunction(() => document.querySelector('#camaraCamionResultado').textContent.includes('Espero una imagen nueva'), null, {timeout:15000});
    await pagina.evaluate(() => { delete document.getElementById('camaraVideo').currentTime; });
    console.log('Una imagen congelada no se reutiliza como confirmación nueva');
    await pagina.locator('#camaraVolverGuia').tap();
    assert.equal(await pagina.evaluate(() => guia.activa && guia.reloj === 123), true);
    assert.deepEqual(await pagina.evaluate(() => window.__limpiados), []);
    assert.deepEqual(await pagina.evaluate(() => window.__pistas.map(t => t.readyState)), ['ended']);
    console.log('Abrir cámara y regresar conserva la guía y el GPS; cámara cerrada al volver');

    await pagina.locator('#guiaCamara').tap(); await pagina.locator('#camaraIniciar').tap();
    await pagina.waitForFunction(() => document.querySelector('#camaraCamionResultado').textContent.includes('Coincide con la ruta'), null, { timeout: 45000 });
    await pagina.evaluate(() => { window.__modo = 'varios'; });
    await pagina.waitForFunction(() => document.querySelector('#camaraCamionResultado').textContent.includes('varios camiones'));
    assert(!await pagina.locator('#camaraCamionResultado').textContent().then(t => t.includes('Coincide')));
    await pagina.evaluate(() => { window.__modo = 'ninguno'; }); await pagina.waitForTimeout(1400);
    const lecturas = await pagina.evaluate(() => window.__recortes.length); await pagina.locator('#camaraBuscarCamion').tap();
    assert.match(await pagina.locator('#camaraCamionResultado').textContent(), /Todavía no identifico/);
    assert.equal(await pagina.evaluate(() => window.__recortes.length), lecturas);
    await pagina.evaluate(() => { window.__modo = 'bus'; }); await pagina.locator('#camaraAvisos').check();
    await pagina.waitForTimeout(600); await pagina.evaluate(() => { window.__retenerOCR = true; }); await pagina.locator('#camaraBuscarCamion').tap();
    await pagina.waitForFunction(() => typeof window.__liberarOCR === 'function', null, { timeout: 30000 });
    await pagina.locator('#camaraRuta').fill('C56'); await pagina.evaluate(() => window.__liberarOCR());
    await pagina.waitForFunction(() => !document.querySelector('#camaraBuscarCamion').disabled);
    assert.equal(await pagina.locator('#camaraCamionResultado').textContent(), '');
    assert.match(await pagina.locator('#camaraObjetivo').textContent(), /C56/);
    console.log('Varios camiones y ausencia impiden comparar; cambiar ruta descarta una respuesta OCR pendiente');
    await pagina.waitForTimeout(500);
    await pagina.evaluate(() => { window.__retenerOCR=true; window.__liberarOCR=null; });
    await pagina.locator('#camaraBuscarCamion').tap();
    await pagina.waitForFunction(() => typeof window.__liberarOCR === 'function', null, {timeout:30000});
    await pagina.waitForTimeout(4200); await pagina.evaluate(() => window.__liberarOCR());
    await pagina.waitForFunction(() => !document.querySelector('#camaraBuscarCamion').disabled);
    assert.match(await pagina.locator('#camaraCamionResultado').textContent(), /lectura tardó demasiado/);
    await pagina.evaluate(() => { window.__retenerOCR=true; window.__liberarOCR=null; });
    await pagina.locator('#camaraLeer').tap();
    await pagina.waitForFunction(() => typeof window.__liberarOCR === 'function', null, {timeout:30000});
    await pagina.locator('#camaraEntorno').check(); await pagina.evaluate(() => window.__liberarOCR());
    await pagina.waitForFunction(() => !document.querySelector('#camaraLeer').disabled);
    assert(!await pagina.locator('#camaraResultado').textContent().then(t => t.includes('El texto parece decir')));
    await pagina.locator('#camaraViaje').check();
    console.log('OCR de más de cuatro segundos y lectura general de otro enfoque descartados');
    await pagina.locator('#camaraRuta').fill('INVENTADA'); assert.match(await pagina.locator('#camaraObjetivo').textContent(), /No encuentro/);
    await pagina.locator('#camaraRuta').fill('C55'); assert(await pagina.locator('#camaraSentidos').isVisible());
    await pagina.locator('#camaraSentidoOpciones input').last().check(); assert.match(await pagina.locator('#camaraObjetivo').textContent(), /hacia/);
    await pagina.evaluate(() => { window.__modo = 'perro'; window.__dichos = []; });
    await pagina.waitForFunction(() => document.querySelector('#camaraResultado').textContent.includes('Busco camiones'));
    await pagina.waitForTimeout(2500); assert(!await pagina.evaluate(() => window.__dichos.some(t => t.includes('perro'))));
    await pagina.locator('#camaraEntorno').check();
    await pagina.waitForFunction(() => document.querySelector('#camaraResultado').textContent.includes('perro'));
    assert.equal(await pagina.locator('#camaraRutaPanel').isVisible(), false);
    assert.equal(await pagina.locator('#camaraBuscarCamion').isVisible(), false);
    await pagina.locator('#camaraDetener').tap();
    await pagina.evaluate(() => { guia.activa = false; guia.camion = null; });
    await pagina.reload(); await pagina.locator('#abrirCamara').tap(); assert(await pagina.locator('#camaraEntorno').isChecked());
    console.log('Mi viaje filtra narración irrelevante; Todo el entorno conserva detector general y preferencia');
    await pagina.setViewportSize({ width: 320, height: 844 }); await pagina.evaluate(() => { acc.grande = true; acc.tema = 'claro'; aplicarAcc(); });
    assert(await pagina.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await pagina.screenshot({ path: path.join(require('node:os').tmpdir(), 'grieta-73-camara-320.png'), animations: 'disabled' });
    await pagina.locator('[data-tab="ajustes"]').tap(); await pagina.locator('#practicarAjustes').tap();
    assert(await pagina.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await pagina.screenshot({ path: path.join(require('node:os').tmpdir(), 'grieta-73-practica-320.png'), animations: 'disabled' });
    assert.deepEqual(errores, []); assert(peticiones.every(m => m === 'GET'));
    console.log('390/320 px, letra grande y claro sin desbordes; cero errores JS y solo GET');
  } finally { await navegador.close(); }
})().catch(e => { console.error(e); process.exit(1); });
