const { chromium } = require('playwright');
const fs = require('node:fs');
(async () => {
  const amplio = process.env.VISION_MOVIMIENTO === 'amplio';
  const imagen = 'data:image/jpeg;base64,' + fs.readFileSync(process.env.VISION_IMAGEN).toString('base64');
  const navegador = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE, headless: true });
  const resultados = [];
  try {
    for (const url of [process.env.GRIETA_ANTES_URL, process.env.GRIETA_URL].filter(Boolean)) {
      const contexto = await navegador.newContext({ viewport: { width: 390, height: 844 } });
      await contexto.addInitScript(({ imagen, amplio }) => {
        localStorage.setItem('grieta-bienvenida', 'true'); localStorage.setItem('grieta-acc', JSON.stringify({ voz: true, vozElegida: true, tema: 'oscuro' }));
        window.__medidas = { envios: [], recibidos: [], pendientes: 0, maximos: 0, visual: null, voz: null, comienzo: null };
        window.SpeechSynthesisUtterance = function (text) { this.text = text; };
        let fin;
        Object.defineProperty(window, 'speechSynthesis', { value: {
          speaking: false, getVoices: () => [{ lang: 'es-MX', localService: true }],
          cancel() { clearTimeout(fin); this.speaking = false; },
          speak(m) { this.speaking = true; if (m.text.startsWith('Parece haber') && window.__medidas.comienzo && window.__medidas.voz === null) window.__medidas.voz = performance.now() - window.__medidas.comienzo; fin = setTimeout(() => { this.speaking = false; m.onend?.(); }, 400); },
        } });
        const Nativo = window.Worker;
        window.Worker = class extends Nativo {
          constructor(url, opciones) { super(url, opciones); this.detector = String(url).includes('detector-worker'); if (this.detector) this.addEventListener('message', ({ data }) => { if (data.tipo === 'objetos') { const r = window.__medidas; r.pendientes--; r.recibidos.push({ tiempo: performance.now(), ms: data.ms }); } }); }
          postMessage(m, transferir) { if (this.detector && m.tipo === 'detectar') { const r = window.__medidas; r.comienzo ??= performance.now(); r.envios.push(performance.now()); r.pendientes++; r.maximos = Math.max(r.maximos, r.pendientes); } super.postMessage(m, transferir); }
        };
        navigator.mediaDevices.getUserMedia = async () => {
          const img = new Image(); img.src = imagen; await img.decode();
          const c = document.createElement('canvas'); c.width = 960; c.height = 600; const x = c.getContext('2d'); let n = 0;
          const dibujar = () => { const t = n++ * .23; x.resetTransform(); x.fillStyle = '#777'; x.fillRect(0, 0, c.width, c.height); x.translate(c.width / 2 + Math.sin(t) * (amplio ? 140 : 65), c.height / 2 + Math.cos(t * 1.4) * (amplio ? 60 : 28)); x.rotate(Math.sin(t * .8) * (amplio ? .18 : .07)); const s = (amplio ? 1.12 : 1.08) + Math.cos(t * .7) * (amplio ? .12 : .05); x.scale(s, s); x.drawImage(img, -c.width / 2, -c.height / 2, c.width, c.height); };
          dibujar(); window.__animacion = setInterval(dibujar, 80);
          return c.captureStream(12);
        };
        new MutationObserver(() => { const r = window.__medidas; if (r.comienzo && r.visual === null && document.querySelector('#camaraResultado')?.textContent.includes('Parece haber')) r.visual = performance.now() - r.comienzo; }).observe(document, { childList: true, subtree: true });
      }, { imagen, amplio });
      const pagina = await contexto.newPage(), errores = [];
      pagina.on('pageerror', (e) => errores.push(e.message));
      await pagina.goto(url); await pagina.locator('#abrirCamara').click(); await pagina.locator('#camaraIniciar').click();
      await pagina.waitForFunction(() => document.querySelector('#camaraEstado').textContent.match(/^(Cámara encendida|No pude)/), null, { timeout: 180000 });
      if (!(await pagina.locator('#camaraEstado').innerText()).startsWith('Cámara encendida')) throw Error(await pagina.locator('#camaraEstado').innerText());
      await pagina.waitForTimeout(12000);
      const medidas = await pagina.evaluate(() => {
        const r = window.__medidas, intervalos = r.envios.slice(1).map((t, i) => t - r.envios[i]).sort((a, b) => a - b);
        return { imagenes: r.recibidos.length, intervalo_mediano_ms: Math.round(intervalos[Math.floor(intervalos.length / 2)]), primera_descripcion_ms: r.visual === null ? null : Math.round(r.visual), primer_envio_voz_simulada_ms: r.voz === null ? null : Math.round(r.voz), maximos_pendientes: r.maximos };
      });
      resultados.push({ version: new URL(url).pathname, movimiento: amplio ? 'amplio' : 'moderado', ...medidas, errores }); console.log(JSON.stringify(resultados.at(-1)));
      await pagina.locator('#camaraDetener').click(); await pagina.evaluate(() => clearInterval(window.__animacion)); await contexto.close();
    }
    if (process.env.VISION_RESULTADO) fs.writeFileSync(process.env.VISION_RESULTADO, JSON.stringify(resultados, null, 2) + '\n');
  } finally { await navegador.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
