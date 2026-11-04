const CamaraGrieta = (() => {
  const $ = (id) => document.getElementById(id);
  const CACHE = 'grieta-vision-1';
  let sesion = 0, activa = false, flujo, detector, ocr, reloj, vigilancia, abortar;
  let bloqueo, previa, calidadActual, problemaAnterior = '', repeticiones = 0, ultimoRiesgo = -Infinity, lento = 0;
  const seguimiento = new GrietaSeguimiento.Seguimiento();
  const modeloActual = () => $('camaraDetalle').checked ? 'detalle' : 'ligero';
  let hablar, callar, paradas, vozOcupada = () => false, anterior = [], ultimaFrase = '', ultimoAviso = 0, ultimoTexto = '', ultimoNarrado = '', leyendo = false, ultimaLectura = 0, vacios = 0;
  const lienzo = document.createElement('canvas');
  const contexto = lienzo.getContext('2d', { willReadFrequently: true });
  const lienzoTexto = document.createElement('canvas');
  const contextoTexto = lienzoTexto.getContext('2d', { willReadFrequently: true });
  const muestra = document.createElement('canvas');
  muestra.width = 64; muestra.height = 48;
  const muestras = muestra.getContext('2d', { willReadFrequently: true });
  let mascaras = [], capturando = false;
  const url = (ruta) => new URL(`vision/${ruta}`, location.href).href;
  const vigente = (turno) => turno === sesion && activa;
  function vibrar(patron) {
    try { return typeof navigator.vibrate === 'function' && navigator.vibrate(patron) === true; } catch { return false; }
  }
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
    $('camaraDetalle').disabled = activa;
    $('camaraLigero').disabled = activa;
  }
  function cerrar(anunciar = false) {
    const estaba = activa;
    activa = false;
    sesion++;
    clearTimeout(reloj);
    clearTimeout(vigilancia);
    bloqueo?.release().catch(() => {});
    bloqueo = null;
    vibrar(0);
    previa = calidadActual = null;
    muestras.clearRect(0, 0, 64, 48);
    seguimiento.reiniciar();
    problemaAnterior = ''; repeticiones = lento = 0; ultimoRiesgo = -Infinity;
    $('camaraCalidad').textContent = $('camaraAlerta').textContent = $('camaraRendimiento').textContent = '';
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
    lienzo.width = lienzo.height = lienzoTexto.width = lienzoTexto.height = 0;
    anterior = [];
    mascaras = []; capturando = false;
    vacios = 0;
    ultimaFrase = ultimoTexto = ultimoNarrado = '';
    $('camaraResultado').textContent = '';
    $('camaraAudio').textContent = '';
    $('camaraLectura').textContent = '';
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
    const r = await fetch(url('activos.json') + '?v=3', { signal });
    if (!r.ok) throw Error('descarga');
    const lista = await r.json();
    const elegido = modeloActual() === 'detalle' ? 'efficientdet_lite2' : 'efficientdet_lite0';
    const activos = lista.filter((a) => !a.ruta.endsWith('.tflite') || a.ruta.endsWith(`${elegido}.tflite`));
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
      detector = new Worker('vision/detector-worker.js?v=3');
      ocr = new Worker('vision/lector-worker.js?v=3');
      await Promise.all([pedir(detector, { tipo: 'iniciar', modelo: modeloActual() }, 'listo', signal), pedir(ocr, { tipo: 'iniciar' }, 'listo', signal)]);
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
        if (!Number.isFinite(data.ms)) data.ms = 0;
        if (calidadActual && performance.now() - calidadActual.capturada < 1200) describir(data);
        else {
          $('camaraResultado').textContent = 'Actualizando la descripción con una imagen reciente.';
          $('camaraLectura').textContent = '';
          ultimaFrase = ''; anterior = []; seguimiento.reiniciar();
          callar(); botones();
        }
        lento = data.ms > 800 ? lento + 1 : 0;
        const avisoLento = 'Análisis lento: los avisos de vehículos pueden omitirse. Detén la cámara y elige Más ligero.';
        if (lento >= 3 && $('camaraRendimiento').textContent !== avisoLento) $('camaraRendimiento').textContent = avisoLento;
        if (!lento && $('camaraRendimiento').textContent === avisoLento) $('camaraRendimiento').textContent = '';
        reloj = setTimeout(() => analizar(turno), GrietaMovimiento.espera(data.ms, calidadActual?.movimiento));
      };
      detector.onerror = () => fallo(turno, 'Falló el reconocimiento local. Detuve la cámara. Vuelve a intentar.');
      informar('Cámara encendida.');
      ultimoAviso = Date.now() - 1000; ultimaLectura = Date.now();
      mantenerPantalla(turno);
      analizar(turno);
    } catch (e) {
      const texto = e.name === 'NotAllowedError' ? 'No diste permiso para la cámara. Puedes habilitarlo en los permisos del navegador y volver a intentar.'
        : e.name === 'NotFoundError' ? 'No encontré una cámara en este dispositivo.'
        : e.name === 'QuotaExceededError' ? 'No hay espacio para guardar los modelos en este navegador. Libera espacio y vuelve a intentar.'
        : 'No pude preparar la cámara. Revisa la conexión y vuelve a intentar; las imágenes se analizan en tu teléfono.';
      fallo(turno, texto);
    }
  }
  async function mantenerPantalla(turno) {
    if (!navigator.wakeLock) return;
    try {
      const permiso = await navigator.wakeLock.request('screen');
      if (!vigente(turno)) { await permiso.release(); return; }
      bloqueo = permiso;
    } catch { if (vigente(turno)) $('camaraRendimiento').textContent = 'Mantén esta pantalla abierta; el teléfono puede apagarla.'; }
  }
  function revisarEntorno(data) {
    const estado = calidadActual;
    if (!estado) return;
    const problema = estado.problema ?? '';
    repeticiones = problema === problemaAnterior ? repeticiones + 1 : 1;
    problemaAnterior = problema;
    const textos = { oscura: 'La imagen está muy oscura. Busca mejor luz si puedes hacerlo con seguridad.', expuesta: 'La imagen está demasiado iluminada. Evita apuntar directamente a la luz.', 'sin-detalle': 'No hay suficiente detalle en la imagen. Revisa que la lente esté descubierta y limpia.' };
    if (repeticiones >= 3 && $('camaraCalidad').textContent !== (textos[problema] ?? '')) {
      $('camaraCalidad').textContent = textos[problema] ?? '';
      if (textos[problema] && Date.now() - ultimoRiesgo > 6000) { hablar(textos[problema]); ultimoAviso = Date.now(); }
    }
    if (Date.now() - ultimoRiesgo > 6000) $('camaraAlerta').textContent = '';
    const detectados = GrietaVision.deteccionesValidas(data.detecciones, data.ancho, data.alto);
    mascaras = detectados.map((o) => o.caja);
    const aviso = seguimiento.actualizar(detectados, estado.capturada, { ...estado.camara, invalido: Boolean(problema) || data.ms > 800 || performance.now() - estado.capturada > 1200 });
    if (!aviso || !$('camaraAvisos').checked) return;
    ultimoRiesgo = Date.now();
    const frase = `Atención: ${GrietaVision.nombres[aviso.clase]} ocupa más espacio al centro de la imagen. Puede haber movimiento; verifica tu entorno.`;
    $('camaraAlerta').textContent = frase;
    if (typeof navigator.vibrate === 'function' && !vibrar([160, 100, 160])) $('camaraVibracion').textContent = 'La vibración no está disponible ahora. El aviso sigue por voz o lector de pantalla.';
    hablar(frase);
  }
  function fallo(turno, texto) {
    if (!vigente(turno)) return;
    cerrar();
    informar(texto);
  }
  function capturar(ancho, salida = lienzo, pincel = contexto) {
    const video = $('camaraVideo');
    if (!video.videoWidth || video.readyState < 2) return false;
    const w = Math.min(video.videoWidth, ancho), h = Math.round(video.videoHeight / video.videoWidth * w);
    if (salida.width !== w || salida.height !== h) { salida.width = w; salida.height = h; }
    pincel.drawImage(video, 0, 0, salida.width, salida.height);
    return true;
  }
  async function analizar(turno) {
    if (!vigente(turno) || capturando) return;
    if (!capturar(modeloActual() === 'detalle' ? 960 : 640)) { reloj = setTimeout(() => analizar(turno), 100); return; }
    capturando = true;
    const ancho = lienzo.width, alto = lienzo.height;
    const capturada = performance.now();
    muestras.drawImage(lienzo, 0, 0, 64, 48);
    calidadActual = GrietaSeguimiento.calidad(muestras.getImageData(0, 0, 64, 48).data, 64, 48, previa, mascaras);
    previa = calidadActual;
    calidadActual.capturada = capturada;
    let imagen;
    try {
      if (typeof createImageBitmap === 'function') {
        try { imagen = await createImageBitmap(lienzo); } catch {}
      }
      if (!vigente(turno)) { imagen?.close(); return; }
      vigilancia = setTimeout(() => fallo(turno, 'El teléfono tardó demasiado en reconocer la imagen. Detuve la cámara.'), 30000);
      if (imagen) detector.postMessage({ tipo: 'detectar', imagen, ancho, alto }, [imagen]);
      else {
        const datos = contexto.getImageData(0, 0, ancho, alto);
        detector.postMessage({ tipo: 'detectar', pixeles: datos.data.buffer, ancho, alto }, [datos.data.buffer]);
      }
      if (!leyendo && !$('camaraAvisos').checked && !calidadActual.problema && Date.now() - ultimaLectura > 15000) leerTexto(false);
    } catch { imagen?.close(); fallo(turno, 'No pude analizar la imagen. Puedes volver a iniciar la cámara.'); }
    finally { if (vigente(turno)) capturando = false; }
  }
  function narrar(texto, repetir = false) {
    if (repetir) {
      const turno = sesion;
      $('camaraLectura').textContent = '';
      requestAnimationFrame(() => { if (vigente(turno)) $('camaraLectura').textContent = texto; });
    } else if ($('camaraLectura').textContent !== texto) $('camaraLectura').textContent = texto;
    hablar(texto);
  }
  function describir(data) {
    revisarEntorno(data);
    if (calidadActual?.problema) { $('camaraResultado').textContent = ''; return; }
    if (Date.now() - ultimoRiesgo < 6000) return;
    const objetos = GrietaVision.objetos(data.detecciones, data.ancho, data.alto);
    const estables = objetos.filter((o) => o.confianza >= .85 || anterior.some((a) => a.has(o.clase)));
    anterior = [new Set(objetos.map((o) => o.clase)), ...anterior].slice(0, 2);
    vacios = objetos.length ? 0 : vacios + 1;
    if (!estables.length && vacios < 3) return;
    const frase = estables.length ? `Parece haber ${estables.map((o) => o.texto).join(', ')} en la imagen.` : 'No reconozco objetos con suficiente certeza. Eso no significa que el paso esté libre.';
    ultimaFrase = frase;
    if ($('camaraResultado').textContent !== frase) $('camaraResultado').textContent = frase;
    botones();
    const voz = calidadActual.movimiento > .06 && estables.length ? `Parece haber ${estables[0].texto}.` : frase;
    const transcurrido = Date.now() - ultimoAviso;
    if (leyendo || transcurrido < 2000 || (vozOcupada() && (transcurrido < 3500 || voz === ultimoNarrado)) || (voz === ultimoNarrado && transcurrido < 30000)) return;
    ultimoNarrado = voz;
    ultimoAviso = Date.now();
    narrar(voz);
  }
  async function leerTexto(manual = true) {
    if (!activa || !ocr || leyendo || !$('camaraVideo').videoWidth) return;
    const turno = sesion;
    const lector = ocr;
    leyendo = true;
    ultimaLectura = Date.now();
    $('camaraLeer').disabled = true;
    if (manual) informar('Buscando una imagen legible del letrero.');
    try {
      let mejor;
      for (let toma = 0; toma < 3; toma++) {
        if (!vigente(turno)) return;
        if (capturar(1280, lienzoTexto, contextoTexto)) {
          const imagen = contextoTexto.getImageData(0, 0, lienzoTexto.width, lienzoTexto.height);
          const calidad = GrietaSeguimiento.calidad(imagen.data, imagen.width, imagen.height);
          if (!calidad.problema && (!mejor || calidad.nitidez > mejor.nitidez)) mejor = { imagen, nitidez: calidad.nitidez };
        }
        if (toma < 2) await new Promise((resolve) => setTimeout(resolve, 60));
      }
      if (!vigente(turno)) return;
      if (!mejor) { informar('No pude leer la imagen. Sigue apuntando al letrero para intentar otra lectura.', manual); return; }
      const imagen = mejor.imagen;
      const resultado = await pedir(lector, { tipo: 'leer', pixeles: imagen.data.buffer, ancho: imagen.width, alto: imagen.height }, 'texto', abortar.signal, [imagen.data.buffer]);
      if (!vigente(turno)) return;
      const texto = GrietaVision.textoLegible(resultado.datos);
      let frase = '';
      if (texto && (manual || texto !== ultimoTexto)) {
        const parada = GrietaVision.paradaPosible(texto, paradas());
        frase = `El texto parece decir: ${texto}.${parada ? ` Coincide con el nombre ${parada} del catálogo; confirma la parada antes de abordar.` : ''}`;
        ultimoTexto = texto;
      } else if (manual) frase = 'No pude leer texto con suficiente claridad. Acércate al letrero si puedes hacerlo con seguridad y vuelve a intentar.';
      if (frase && Date.now() - ultimoRiesgo > 6000) {
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
    vozOcupada = opciones.vozOcupada ?? (() => false);
    let guardado = {};
    try { guardado = JSON.parse(localStorage.getItem('grieta-camara')) ?? {}; } catch {}
    $('camaraDetalle').checked = guardado.modelo !== 'ligero';
    $('camaraLigero').checked = guardado.modelo === 'ligero';
    $('camaraAvisos').checked = guardado.avisos === true;
    for (const id of ['camaraDetalle', 'camaraLigero', 'camaraAvisos']) $(id).addEventListener('change', () => {
      seguimiento.reiniciar();
      vibrar(0);
      $('camaraAlerta').textContent = '';
      try { localStorage.setItem('grieta-camara', JSON.stringify({ modelo: modeloActual(), avisos: $('camaraAvisos').checked })); } catch {}
    });
    $('camaraVibracion').textContent = typeof navigator.vibrate === 'function' ? 'La vibración depende del teléfono y sus ajustes. Puedes probarla aquí.' : 'Este navegador no permite vibrar. Los avisos se muestran y usan tu voz local o lector de pantalla.';
    $('camaraProbar').hidden = typeof navigator.vibrate !== 'function';
    $('camaraProbar').addEventListener('click', () => {
      const aceptado = vibrar([160, 100, 160]);
      $('camaraVibracion').textContent = aceptado ? 'Se pidió una vibración de prueba. Confirma si la sentiste antes de usar los avisos.' : 'El teléfono rechazó la vibración. Los avisos siguen por voz o lector de pantalla.';
    });
    $('camaraIniciar').addEventListener('click', iniciar);
    $('camaraDetener').addEventListener('click', () => { cerrar(true); $('camaraIniciar').focus(); });
    $('camaraLeer').addEventListener('click', () => leerTexto());
    $('camaraRepetir').addEventListener('click', () => narrar(ultimaFrase, true));
    document.addEventListener('visibilitychange', () => { if (document.hidden) cerrar(); });
    addEventListener('pagehide', () => cerrar());
    botones();
  }
  return { iniciarInterfaz, cerrar };
})();
