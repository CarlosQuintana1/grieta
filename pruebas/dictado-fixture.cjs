const { servidor } = require('./hoyos-servidor.cjs');
async function preparar(browser, acc = {}, demoraAudio = 0) {
  const http = process.env.GRIETA_URL ? { url: process.env.GRIETA_URL, cerrar: async () => {} } : await servidor();
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  await c.addInitScript(({ acc, demoraAudio }) => {
    localStorage.setItem('grieta-bienvenida', 'true');
    if (!localStorage.getItem('grieta-acc')) localStorage.setItem('grieta-acc', JSON.stringify({ modoVoz: false, voz: false, tema: 'oscuro', ...acc }));
    window.__voz = []; window.__eco = []; window.__sesiones = []; window.__osciladores = 0; window.__busquedas = [];
    navigator.geolocation.getCurrentPosition = (_, error) => error?.({ code: 1 });
    navigator.vibrate = () => true;
    window.AudioContext = class { currentTime = 0; destination = {}; createOscillator() { window.__osciladores++; return { frequency: {}, connect() {}, start() {}, stop() {} }; } createGain() { return { gain: { setValueAtTime() {} }, connect() {} }; } };
    window.SpeechSynthesisUtterance = function (text) { this.text = text; };
    Object.defineProperty(window, 'speechSynthesis', { value: { speaking: false, pending: false, getVoices: () => [{ localService: true, lang: 'es-MX' }], cancel() { this.speaking = false; this.pending = false; }, speak(m) { window.__voz.push(m.text); if (window.__sesiones.some(r => r.escuchando)) window.__eco.push(m.text); m.onend?.(); } } });
    window.SpeechRecognition = class {
      constructor() { window.__sesiones.push(this); this.inicios = 0; this.abortos = 0; this.paradas = 0; this.escuchando = false; }
      start() { this.inicios++; this.instante = performance.now(); this.escuchando = true; this.onstart?.(); }
      cerrarAudio() { this.escuchando = false; setTimeout(() => this.onaudioend?.(), demoraAudio); setTimeout(() => this.onend?.(), 1500); }
      stop() { this.paradas++; this.cerrarAudio(); }
      abort() { this.abortos++; this.cerrarAudio(); }
    };
    window.__resultado = (rec, texto, final = true) => rec.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: texto }], { isFinal: final })] });
    const fetchOriginal = window.fetch;
    window.fetch = (...args) => { if (String(args[0]).includes('photon.komoot.io/api/') || String(args[0]).includes('/buscar?q=')) window.__busquedas.push(performance.now()); return fetchOriginal(...args); };
  }, { acc, demoraAudio });
  await c.route('**/photon.komoot.io/api/**', r => r.fulfill({ json: { features: [] } }));
  await c.route('**/api/buscar?*', r => r.fulfill({ json: [] }));
  const p = await c.newPage(), errores = [], solicitudes = [];
  p.on('pageerror', e => errores.push(e.message)); p.on('request', r => solicitudes.push(r.method()));
  await p.goto(http.url, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => Grieta.qrobus?.paradas?.length);
  return { p, c, errores, solicitudes, cerrar: async () => { await c.close(); await http.cerrar(); } };
}
module.exports = { preparar };
