const CamaraGrieta = (() => {
  const $ = (id) => document.getElementById(id);
  const CACHE = 'grieta-vision-1';
  let sesion = 0, activa = false, flujo, detector, ocr, reloj, vigilancia, abortar;
  let hablar, callar, paradas, anterior = new Set(), ultimaFrase = '', ultimoAviso = 0, ultimoTexto = '', leyendo = false, ultimaLectura = 0, vacios = 0;
  const lienzo = document.createElement('canvas');
  const contexto = lienzo.getContext('2d', { willReadFrequently: true });
  const url = (ruta) => new URL(`vision/${ruta}`, location.href).href;
  const vigente = (turno) => turno === sesion && activa;
  function informar(texto, voz = true) {
    $('camaraEstado').textContent = texto;
    if (voz) hablar(texto);
  }
  function botones() {
    $('camaraIniciar').hidden = activa;
    $('camaraDetener').hidden = !activa;
    $('camaraLeer').disabled = !ocr || !flujo;
    $('camaraRepetir').disabled = !ultimaFrase;
    $('camaraVideo').hidden = !flujo;
  }
  function cerrar(anunciar = false) {
    const estaba = activa;
    activa = false;
    sesion++;
    clearTimeout(reloj);
    clearTimeout(vigilancia);
    abortar?.abort();
    abortar = null;
    flujo?.getTracks().forEach((pista) => pista.stop());
    flujo = null;
    $('camaraVideo').pause();
    $('camaraVideo').srcObject = null;
    detector?.terminate();
    detector = null;
    ocr?.terminate();
    ocr = null;
    lienzo.width = lienzo.height = 0;
    anterior = new Set();
    vacios = 0;
    ultimaFrase = ultimoTexto = '';
    $('camaraResultado').textContent = '';
    $('camaraAudio').textContent = '';
    leyendo = false;
    botones();
    if (estaba) { callar(); informar('Cámara apagada.', anunciar); }
  }
  function pedir(worker, mensaje, esperado, signal, transferir = []) {
    return new Promise((resolve, reject) => {
      const terminar = (error, datos) => {
        clearTimeout(limite);
        signal.removeEventListener('abort', cancelar);
        worker.onmessage = worker.onerror = null;
        error ? reject(error) : resolve(datos);
      };
      const cancelar = () => terminar(new DOMException('Cancelado', 'AbortError'));
      const limite = setTimeout(() => terminar(Error('tiempo')), 60000);
      if (signal.aborted) return cancelar();
      signal.addEventListener('abort', cancelar, { once: true });
      worker.onmessage = ({ data }) => data.tipo === esperado ? terminar(null, data) : terminar(Error('modelo'));
      worker.onerror = () => terminar(Error('modelo'));
      worker.postMessage(mensaje, transferir);
    });
  }
  async function preparar(turno, signal) {
    const r = await fetch(url('activos.json'), { signal });
    if (!r.ok) throw Error('descarga');
    const activos = await r.json();
    const cache = await caches.open(CACHE);
    let completos = 0;
    for (const archivo of activos) {
      if (!vigente(turno)) return;
      const destino = url(archivo.ruta);
      let respuesta = await cache.match(destino);
      if (!respuesta) {
        respuesta = await fetch(destino, { signal });
        if (!respuesta.ok) throw Error('descarga');
        const bytes = await respuesta.clone().arrayBuffer();
        const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((x) => x.toString(16).padStart(2, '0')).join('');
        if (hash !== archivo.sha256) throw Error('integridad');
        await cache.put(destino, respuesta);
      }
      completos++;
      if (vigente(turno)) informar(`Preparando cámara: ${Math.round(completos / activos.length * 100)} %.`, false);
    }
  }
  async function iniciar() {
    if (activa) return;
    if (!navigator.mediaDevices?.getUserMedia || !window.Worker || !window.OffscreenCanvas || !window.caches || !window.WebAssembly) {
      informar('Este navegador no admite la cámara con reconocimiento local. Prueba Safari o Chrome actualizados.');
      return;
    }
    activa = true;
    const turno = ++sesion;
    ultimaLectura = ultimoAviso = 0;
    abortar = new AbortController();
    const signal = abortar.signal;
    botones();
    $('camaraDetener').focus();
    informar('Preparando el reconocimiento en tu teléfono. Puedes detenerlo cuando quieras.');
    vigilancia = setTimeout(() => fallo(turno, 'La preparación tardó demasiado. Revisa tu conexión y vuelve a intentar.'), 180000);
    try {
      await preparar(turno, signal);
      if (!vigente(turno)) return;
      detector = new Worker('vision/detector-worker.js');
      await pedir(detector, { tipo: 'iniciar' }, 'listo', signal);
      if (!vigente(turno)) return;
      ocr = new Worker('vision/lector-worker.js');
      await pedir(ocr, { tipo: 'iniciar' }, 'listo', signal);
      if (!vigente(turno)) return;
      informar('Permite usar la cámara para describir lo que apunta el teléfono.');
      const video = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } });
      if (!vigente(turno)) { video.getTracks().forEach((p) => p.stop()); return; }
      flujo = video;
      $('camaraVideo').srcObject = video;
      botones();
      await $('camaraVideo').play();
      if (!vigente(turno)) return;
      clearTimeout(vigilancia);
      flujo.getVideoTracks()[0].addEventListener('ended', () => fallo(turno, 'La cámara se desconectó. Puedes volver a iniciarla.'));
      detector.onmessage = ({ data }) => {
        if (!vigente(turno)) return;
        clearTimeout(vigilancia);
        if (data.tipo === 'error') return fallo(turno, 'No pude analizar la imagen. Detuve la cámara. Vuelve a intentar.');
        describir(data);
        reloj = setTimeout(() => analizar(turno), 2000);
      };
      detector.onerror = () => fallo(turno, 'Falló el reconocimiento local. Detuve la cámara. Vuelve a intentar.');
      informar('Cámara encendida. Puedo omitir obstáculos; no indico cuándo cruzar. Apunta el teléfono frente a ti.');
      ultimoAviso = ultimaLectura = Date.now();
      analizar(turno);
    } catch (e) {
      const texto = e.name === 'NotAllowedError' ? 'No diste permiso para la cámara. Puedes habilitarlo en los permisos del navegador y volver a intentar.'
        : e.name === 'NotFoundError' ? 'No encontré una cámara en este dispositivo.'
        : e.name === 'QuotaExceededError' ? 'No hay espacio para guardar los modelos en este navegador. Libera espacio y vuelve a intentar.'
        : 'No pude preparar la cámara. Revisa la conexión y vuelve a intentar; las imágenes se analizan en tu teléfono.';
      fallo(turno, texto);
    }
  }
  function fallo(turno, texto) {
    if (!vigente(turno)) return;
    cerrar();
    informar(texto);
  }
  function capturar(ancho) {
    const video = $('camaraVideo');
    if (!video.videoWidth || video.readyState < 2) return false;
    lienzo.width = Math.min(video.videoWidth, ancho);
    lienzo.height = Math.round(video.videoHeight / video.videoWidth * lienzo.width);
    contexto.drawImage(video, 0, 0, lienzo.width, lienzo.height);
    return true;
  }
  function analizar(turno) {
    if (!vigente(turno)) return;
    if (!capturar(640)) { reloj = setTimeout(() => analizar(turno), 500); return; }
    const imagen = contexto.getImageData(0, 0, lienzo.width, lienzo.height);
    vigilancia = setTimeout(() => fallo(turno, 'El teléfono tardó demasiado en reconocer la imagen. Detuve la cámara.'), 30000);
    detector.postMessage({ tipo: 'detectar', pixeles: imagen.data.buffer, ancho: imagen.width, alto: imagen.height }, [imagen.data.buffer]);
    if (!leyendo && Date.now() - ultimaLectura > 15000) leerTexto(false);
  }
  function describir(data) {
    const objetos = GrietaVision.objetos(data.detecciones, data.ancho);
    const estables = objetos.filter((o) => anterior.has(o.clave));
    anterior = new Set(objetos.map((o) => o.clave));
    vacios = objetos.length ? 0 : vacios + 1;
    if (!estables.length && vacios < 3) return;
    if (leyendo || Date.now() - ultimoAviso < 8000) return;
    const frase = estables.length ? `Parece haber ${estables.map((o) => o.texto).join(', ')} en la imagen.` : 'No reconozco objetos con suficiente certeza. Eso no significa que el paso esté libre.';
    if (frase === ultimaFrase && Date.now() - ultimoAviso < 30000) return;
    ultimaFrase = frase;
    ultimoAviso = Date.now();
    $('camaraResultado').textContent = frase;
    botones();
    hablar(frase);
  }
  async function leerTexto(manual = true) {
    if (!activa || !ocr || leyendo || !capturar(1280)) return;
    const turno = sesion;
    const lector = ocr;
    leyendo = true;
    ultimaLectura = Date.now();
    $('camaraLeer').disabled = true;
    if (manual) informar('Leyendo el texto de la imagen. Mantén el teléfono quieto.');
    try {
      const imagen = contexto.getImageData(0, 0, lienzo.width, lienzo.height);
      const resultado = await pedir(lector, { tipo: 'leer', pixeles: imagen.data.buffer, ancho: imagen.width, alto: imagen.height }, 'texto', abortar.signal, [imagen.data.buffer]);
      if (!vigente(turno)) return;
      const texto = GrietaVision.textoLegible(resultado.datos);
      let frase = '';
      if (texto && (manual || texto !== ultimoTexto)) {
        const parada = GrietaVision.paradaPosible(texto, paradas());
        frase = `El texto parece decir: ${texto}.${parada ? ` Coincide con el nombre ${parada} del catálogo; confirma la parada antes de abordar.` : ''}`;
        ultimoTexto = texto;
      } else if (manual) frase = 'No pude leer texto con suficiente claridad. Acércate al letrero si puedes hacerlo con seguridad y vuelve a intentar.';
      if (frase) {
        ultimaFrase = frase;
        ultimoAviso = Date.now();
        $('camaraResultado').textContent = frase;
        hablar(frase);
      }
      informar('Cámara encendida. Puedes leer otro letrero o detenerla.', false);
    } catch { fallo(turno, 'No pude leer la imagen. Detuve la cámara. Puedes volver a intentar.'); }
    finally { if (vigente(turno)) { leyendo = false; botones(); } }
  }
  function iniciarInterfaz(opciones) {
    ({ hablar, callar, paradas } = opciones);
    $('camaraIniciar').addEventListener('click', iniciar);
    $('camaraDetener').addEventListener('click', () => { cerrar(true); $('camaraIniciar').focus(); });
    $('camaraLeer').addEventListener('click', () => leerTexto());
    $('camaraRepetir').addEventListener('click', () => hablar(ultimaFrase));
    document.addEventListener('visibilitychange', () => { if (document.hidden) cerrar(); });
    addEventListener('pagehide', () => cerrar());
    botones();
  }
  return { iniciarInterfaz, cerrar };
})();
