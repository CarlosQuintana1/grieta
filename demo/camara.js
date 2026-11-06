const CamaraGrieta = (() => {
  const $ = (id) => document.getElementById(id);
  const original = id => (typeof Interfaz !== 'undefined' ? Interfaz.original?.($(id)) : null) ?? $(id).textContent;
  const CACHE = 'grieta-vision-1';
  const suelos = [GrietaEscalones, GrietaHoyos];
  const sueloReciente = () => suelos.some(s => s.reciente);
  const fraseSuelo = () => [...suelos].sort((a, b) => b.instante - a.instante).find(s => s.frase)?.frase ?? '';
  let sesion = 0, activa = false, flujo, detector, ocr, reloj, vigilancia, abortar;
  let bloqueo, previa, calidadActual, problemaAnterior = '', repeticiones = 0, ultimoRiesgo = -Infinity, lento = 0;
  const seguimiento = new GrietaSeguimiento.Seguimiento();
  const modeloActual = () => $('camaraDetalle').checked ? 'detalle' : 'ligero';
  let hablar, callar, prepararVoz, paradas, vozOcupada = () => false, explorando = () => false, anterior = [], ultimaFrase = '', ultimoAviso = 0, ultimoTexto = '', ultimoNarrado = '', leyendo = false, ultimaLectura = 0, vacios = 0;
  const lienzo = document.createElement('canvas');
  const contexto = lienzo.getContext('2d', { willReadFrequently: true });
  const lienzoTexto = document.createElement('canvas');
  const contextoTexto = lienzoTexto.getContext('2d', { willReadFrequently: true });
  const muestra = document.createElement('canvas');
  muestra.width = 64; muestra.height = 48;
  const muestras = muestra.getContext('2d', { willReadFrequently: true });
  let mascaras = [], capturando = false;
  let viaje = () => null, rutas = () => [], revisionRuta = '', cambioRuta = 0, referencia = 0, camionVisible = null, ultimoCamion = 0, ultimaComparacion = 0, ultimoCamionNarrado = '', caducaCamion, ultimoFotograma = -Infinity, ultimaFraseCamion = '', recortes = [];
  const confirmarCamion = new GrietaTransporte.Confirmador();
  const enViaje = () => $('camaraViaje').checked;
  const codigo = (s) => String(s ?? '').toUpperCase().replace(/[\s-]/g, '');
  const catalogo = () => [...new Set(rutas().map((r) => codigo(r.linea)))];
  function objetivo() {
    const escrita = codigo($('camaraRuta').value);
    if (!escrita) return viaje();
    if (!catalogo().includes(escrita)) return null;
    const elegida = $('camaraSentidoOpciones').querySelector('input:checked');
    return { linea: escrita, hacia: elegida?.value ?? '' };
  }
  function olvidarComparacion() {
    if (ultimaFraseCamion && ultimaFrase === ultimaFraseCamion) ultimaFrase = '';
    if (ultimaFraseCamion && original('camaraLectura') === ultimaFraseCamion) $('camaraLectura').textContent = '';
    ultimaFraseCamion = ''; ultimoCamionNarrado = ''; ultimaComparacion = 0;
    $('camaraRepetir').disabled = !ultimaFrase;
  }
  function descartarCamion() {
    clearTimeout(caducaCamion); olvidarComparacion(); recortes = [];
    confirmarCamion.reiniciar(); camionVisible = null; ultimoCamionNarrado = ''; referencia++;
    $('camaraCamionResultado').textContent = '';
    $('camaraRepetir').disabled = !ultimaFrase;
  }
  function actualizarRuta() {
    const manual = codigo($('camaraRuta').value), actual = objetivo();
    const clave = JSON.stringify([enViaje(), manual, actual, catalogo().length]);
    if (clave === revisionRuta) return;
    revisionRuta = clave; cambioRuta++; descartarCamion(); anterior = [];
    ultimaFrase = fraseSuelo(); $('camaraResultado').textContent = ''; $('camaraLectura').textContent = ''; $('camaraRepetir').disabled = !ultimaFrase;
    $('camaraRutaPanel').hidden = !enViaje();
    $('camaraObjetivo').hidden = !enViaje();
    $('camaraAyuda').textContent = enViaje() ? 'Apunta al letrero de un camión o de una parada.' : 'Apunta el teléfono frente a ti. Describo algunos objetos y leo letreros en español.';
    $('camaraCamionResultado').hidden = !enViaje();
    $('camaraBuscarCamion').hidden = !enViaje();
    $('camaraVolverGuia').hidden = !viaje();
    $('camaraObjetivo').textContent = actual ? `Buscas ${actual.linea}${actual.hacia ? ` hacia ${actual.hacia}` : '. Todavía no elegiste el sentido'}.${manual ? ' Ruta escrita por ti.' : ' Ruta de tu viaje.'}` : manual ? 'No encuentro esa ruta en los datos guardados. Revisa el número antes de compararlo.' : 'Puedo leer el número. Para compararlo, sigue un viaje o escribe la ruta que buscas.';
  }
  function sentidos() {
    const seleccion = $('camaraSentidoOpciones').querySelector('input:checked')?.value;
    const manual = codigo($('camaraRuta').value), caja = $('camaraSentidoOpciones');
    caja.replaceChildren();
    const opciones = [...new Set(rutas().filter((r) => codigo(r.linea) === manual).map((r) => r.hacia).filter(Boolean))];
    $('camaraSentidos').hidden = !manual || !opciones.length;
    for (const destino of ['', ...opciones]) {
      const label = document.createElement('label'), radio = document.createElement('input');
      radio.type = 'radio'; radio.name = 'camaraSentido'; radio.value = destino; radio.checked = destino === (opciones.includes(seleccion) ? seleccion : '');
      label.append(radio, document.createTextNode(destino || 'No sé el sentido')); caja.append(label);
    }
    actualizarRuta();
  }
  function guardarCamara() {
    try { localStorage.setItem('grieta-camara', JSON.stringify({ modelo: modeloActual(), avisos: $('camaraAvisos').checked, enfoque: enViaje() ? 'viaje' : 'entorno', escalones: $('camaraEscalones').checked, hoyos: $('camaraHoyos')?.checked === true })); } catch {}
  }
  function abrir() {
    if (viaje()) { $('camaraViaje').checked = true; $('camaraRuta').value = ''; }
    revisionRuta = ''; sentidos(); actualizarRuta();
  }
  function revisarCamion(detectados) {
    actualizarRuta();
    const camiones = detectados.filter((d) => d.clase === 'bus' && d.confianza >= .65);
    const ahora = performance.now();
    if (!enViaje() || camiones.length !== 1 || calidadActual?.problema) {
      if (camiones.length > 1 || calidadActual?.problema || (camionVisible && ahora - camionVisible.instante > 1200)) {
        descartarCamion();
        if (enViaje() && camiones.length > 1) $('camaraCamionResultado').textContent = 'Veo varios camiones. Apunta a uno solo para leer su letrero.';
      }
      return;
    }
    const caja = camiones[0].caja;
    if (!camionVisible || ahora - camionVisible.instante > 1200 || GrietaSeguimiento.iou(caja, camionVisible.caja) < .25) descartarCamion();
    camionVisible = { caja, instante: ahora, referencia };
    if (capturar(1600, lienzoTexto, contextoTexto, caja, lienzo)) {
      const imagen = contextoTexto.getImageData(0, 0, lienzoTexto.width, lienzoTexto.height);
      const calidad = GrietaSeguimiento.calidad(imagen.data, imagen.width, imagen.height);
      if (!calidad.problema) recortes.push({ imagen, nitidez: calidad.nitidez, instante: calidadActual.capturada, fotograma: calidadActual.fotograma, referencia, revision: cambioRuta });
    }
    recortes = recortes.filter(r => ahora - r.instante < 800).slice(-3);
  }
  const url = (ruta) => new URL(`vision/${ruta}`, location.href).href;
  const vigente = (turno) => turno === sesion && activa;
  function vibrar(patron) {
    try { return typeof navigator.vibrate === 'function' && navigator.vibrate(patron) === true; } catch { return false; }
  }
  function informar(texto, voz = true) {
    const estado = $('camaraEstado');
    estado.textContent = texto;
    estado.classList.toggle('oculto', texto === 'Cámara encendida.');
    if (voz) hablar(texto);
  }
  function botones() {
    document.body.classList.toggle('camara-en-uso', activa);
    $('camaraIniciar').hidden = activa;
    $('camaraDetener').hidden = !activa;
    $('camaraLeer').disabled = !ocr || !flujo || leyendo;
    $('camaraBuscarCamion').disabled = !ocr || !flujo || leyendo;
    $('camaraRepetir').disabled = !ultimaFrase;
    $('camaraVideo').hidden = !flujo;
    $('camaraDetalle').disabled = activa;
    $('camaraLigero').disabled = activa;
    $('camaraEscalones').disabled = activa;
    if ($('camaraHoyos')) $('camaraHoyos').disabled = activa;
  }
  function cerrar(anunciar = false) {
    const estaba = activa;
    activa = false;
    suelos.forEach(s => s.cerrar());
    ultimoFotograma = -Infinity;
    descartarCamion(); cambioRuta++;
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
    const r = await fetch(url('activos.json') + '?v=5', { signal });
    if (!r.ok) throw Error('descarga');
    const lista = await r.json();
    const elegido = modeloActual() === 'detalle' ? 'efficientdet_lite2' : 'efficientdet_lite0';
    const activos = lista.filter((a) => a.grupo === 'hoyos' ? GrietaHoyos.habilitado() : a.grupo === 'escalones' ? GrietaEscalones.habilitado() : !a.ruta.endsWith('.tflite') || a.ruta.endsWith(`${elegido}.tflite`));
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
    prepararVoz?.();
    activa = true;
    const turno = ++sesion;
    ultimaLectura = ultimoAviso = 0;
    abortar = new AbortController();
    const signal = abortar.signal;
    botones();
    $('camara').querySelector('.camara-panel').scrollTop = 0;
    $('camaraDetener').focus();
    informar('Preparando el reconocimiento en tu teléfono. Puedes detenerlo cuando quieras.', false);
    vigilancia = setTimeout(() => fallo(turno, 'La preparación tardó demasiado. Revisa tu conexión y vuelve a intentar.'), 180000);
    try {
      await preparar(turno, signal);
      if (!vigente(turno)) return;
      detector = new Worker('vision/detector-worker.js?v=3');
      ocr = new Worker('vision/lector-worker.js?v=3');
      await Promise.all([pedir(detector, { tipo: 'iniciar', modelo: modeloActual() }, 'listo', signal), pedir(ocr, { tipo: 'iniciar' }, 'listo', signal), ...suelos.map(s => s.preparar(signal, pedir))]);
      if (!vigente(turno)) return;
      informar('Permite usar la cámara para describir lo que apunta el teléfono.', false);
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
          descartarCamion();
          $('camaraResultado').textContent = 'Actualizando la descripción con una imagen reciente.';
          $('camaraLectura').textContent = '';
          ultimaFrase = fraseSuelo(); anterior = []; seguimiento.reiniciar();
          if (!explorando() && !sueloReciente()) callar(); botones();
        }
        lento = data.ms > 800 ? lento + 1 : 0;
        const avisoLento = 'Análisis lento: los avisos de vehículos pueden omitirse. Detén la cámara y elige Más ligero.';
        if (lento >= 3 && original('camaraRendimiento') !== avisoLento) $('camaraRendimiento').textContent = avisoLento;
        if (!lento && original('camaraRendimiento') === avisoLento) $('camaraRendimiento').textContent = '';
        if (!leyendo && !explorando() && !$('camaraAvisos').checked && !calidadActual?.problema) {
          if (enViaje() && camionVisible && performance.now() - camionVisible.instante < 800 && Date.now() - ultimoCamion > 2200) leerCamion(false);
          else if (Date.now() - ultimaLectura > 15000) leerTexto(false);
        }
        reloj = setTimeout(() => analizar(turno), GrietaMovimiento.espera(data.ms, calidadActual?.movimiento));
      };
      detector.onerror = () => fallo(turno, 'Falló el reconocimiento local. Detuve la cámara. Vuelve a intentar.');
      suelos.forEach(s => s.encender($('camaraVideo'), () => calidadActual?.problema));
      informar('Cámara encendida.', false);
      ultimaLectura = Date.now();
      mantenerPantalla(turno);
      analizar(turno);
    } catch (e) {
      const texto = e.message === 'modelo-hoyos' ? 'No pude preparar los avisos de hoyos. Revisa la conexión o desactívalos antes de iniciar para usar los otros objetos.' : e.message === 'modelo-escalones' ? 'No pude preparar los avisos de escaleras y escalones. Revisa la conexión o desactívalos antes de iniciar para usar los otros objetos.' : e.name === 'NotAllowedError' ? 'No diste permiso para la cámara. Puedes habilitarlo en los permisos del navegador y volver a intentar.'
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
    } catch {}
  }
  function revisarEntorno(data) {
    const estado = calidadActual;
    if (!estado) return;
    const problema = estado.problema ?? '';
    repeticiones = problema === problemaAnterior ? repeticiones + 1 : 1;
    problemaAnterior = problema;
    const textos = { oscura: 'La imagen está muy oscura. Busca mejor luz si puedes hacerlo con seguridad.', expuesta: 'La imagen está demasiado iluminada. Evita apuntar directamente a la luz.', 'sin-detalle': 'No hay suficiente detalle en la imagen. Revisa que la lente esté descubierta y limpia.' };
    if (repeticiones >= 3 && original('camaraCalidad') !== (textos[problema] ?? '')) {
      $('camaraCalidad').textContent = textos[problema] ?? '';
      if (textos[problema] && !explorando() && !sueloReciente() && Date.now() - ultimoRiesgo > 6000) { hablar(textos[problema]); ultimoAviso = Date.now(); }
    }
    if (Date.now() - ultimoRiesgo > 6000) $('camaraAlerta').textContent = '';
    const detectados = GrietaVision.deteccionesValidas(data.detecciones, data.ancho, data.alto);
    revisarCamion(detectados);
    mascaras = detectados.map((o) => o.caja);
    const aviso = seguimiento.actualizar(detectados, estado.capturada, { ...estado.camara, invalido: Boolean(problema) || data.ms > 800 || performance.now() - estado.capturada > 1200 });
    if (!aviso || !$('camaraAvisos').checked) return;
    ultimoRiesgo = Date.now();
    const frase = `Atención: ${GrietaVision.nombres[aviso.clase]} ocupa más espacio al centro de la imagen. Puede haber movimiento; verifica tu entorno.`;
    $('camaraAlerta').textContent = frase;
    if (typeof navigator.vibrate === 'function' && !vibrar([160, 100, 160])) $('camaraVibracion').textContent = 'La vibración no está disponible ahora. El aviso sigue por voz o lector de pantalla.';
    hablar(frase, true);
  }
  function fallo(turno, texto) {
    if (!vigente(turno)) return;
    cerrar();
    informar(texto);
    $('camaraIniciar').focus();
  }
  function capturar(ancho, salida = lienzo, pincel = contexto, caja = null, fuente = $('camaraVideo')) {
    const video = $('camaraVideo');
    if (!video.videoWidth || video.readyState < 2) return false;
    const totalAncho = fuente === video ? video.videoWidth : fuente.width, totalAlto = fuente === video ? video.videoHeight : fuente.height;
    const x = caja ? Math.floor(caja.x * totalAncho) : 0, y = caja ? Math.floor(caja.y * totalAlto) : 0;
    const anchoFuente = caja ? Math.floor(caja.w * totalAncho) : totalAncho, altoFuente = caja ? Math.floor(caja.h * totalAlto) : totalAlto;
    if (anchoFuente < 16 || altoFuente < 16) return false;
    const w = Math.min(anchoFuente, ancho), h = Math.round(altoFuente / anchoFuente * w);
    if (salida.width !== w || salida.height !== h) { salida.width = w; salida.height = h; }
    pincel.drawImage(fuente, x, y, anchoFuente, altoFuente, 0, 0, salida.width, salida.height);
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
    calidadActual.fotograma = $('camaraVideo').currentTime;
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
    } catch { imagen?.close(); fallo(turno, 'No pude analizar la imagen. Puedes volver a iniciar la cámara.'); }
    finally { if (vigente(turno)) capturando = false; }
  }
  function narrar(texto, repetir = false, alEmpezar) {
    if (repetir) {
      const turno = sesion;
      $('camaraLectura').textContent = '';
      requestAnimationFrame(() => { if (vigente(turno)) $('camaraLectura').textContent = texto; });
    } else if (original('camaraLectura') !== texto) $('camaraLectura').textContent = texto;
    hablar(texto, false, alEmpezar);
  }
  function describir(data) {
    revisarEntorno(data);
    if (calidadActual?.problema) { $('camaraResultado').textContent = ''; return; }
    if (Date.now() - ultimoRiesgo < 6000 || sueloReciente()) return;
    if (enViaje() && $('camaraCamionResultado').textContent && Date.now() - ultimaComparacion < 8000) { $('camaraResultado').textContent = ''; return; }
    const relevantes = enViaje() ? data.detecciones.filter((d) => ['bus', 'traffic light', 'stop sign'].includes(d.categories?.[0]?.categoryName)) : data.detecciones;
    const objetos = GrietaVision.objetos(relevantes, data.ancho, data.alto);
    const estables = objetos.filter((o) => o.confianza >= .85 || anterior.some((a) => a.has(o.clase)));
    anterior = [new Set(objetos.map((o) => o.clase)), ...anterior].slice(0, 2);
    vacios = objetos.length ? 0 : vacios + 1;
    if (!estables.length && vacios < 3) return;
    const frase = estables.length ? `Parece haber ${estables.map((o) => o.texto).join(', ')} en la imagen.` : enViaje() ? 'Busco camiones y letreros para tu viaje.' : 'No reconozco objetos con suficiente certeza. Eso no significa que el paso esté libre.';
    ultimaFrase = frase;
    if (original('camaraResultado') !== frase) $('camaraResultado').textContent = frase;
    botones();
    const voz = calidadActual.movimiento > .06 && estables.length ? `Parece haber ${estables[0].texto}.` : frase;
    const transcurrido = Date.now() - ultimoAviso;
    if (leyendo || explorando() || Date.now() - ultimaComparacion < 8000 || transcurrido < 2000 || (vozOcupada() && (transcurrido < 3500 || voz === ultimoNarrado)) || (voz === ultimoNarrado && transcurrido < 30000)) return;
    ultimoAviso = Date.now();
    const turno = sesion;
    narrar(voz, false, () => {
      if (vigente(turno)) ultimoNarrado = voz;
    });
  }
  async function leerTexto(manual = true) {
    if (!activa || !ocr || leyendo || (!manual && (explorando() || sueloReciente())) || !$('camaraVideo').videoWidth) return;
    const turno = sesion, revision = cambioRuta;
    const vigenteTexto = () => vigente(turno) && revision === cambioRuta;
    const lector = ocr;
    leyendo = true;
    ultimaLectura = Date.now();
    $('camaraLeer').disabled = true;
    if (manual) informar('Buscando una imagen legible del letrero.');
    try {
      let mejor;
      for (let toma = 0; toma < 3; toma++) {
        if (!vigenteTexto()) return;
        if (capturar(1280, lienzoTexto, contextoTexto)) {
          const imagen = contextoTexto.getImageData(0, 0, lienzoTexto.width, lienzoTexto.height);
          const calidad = GrietaSeguimiento.calidad(imagen.data, imagen.width, imagen.height);
          if (!calidad.problema && (!mejor || calidad.nitidez > mejor.nitidez)) mejor = { imagen, nitidez: calidad.nitidez };
        }
        if (toma < 2) await new Promise((resolve) => setTimeout(resolve, 60));
      }
      if (!vigenteTexto()) return;
      if (!mejor) { informar('No pude leer la imagen. Sigue apuntando al letrero para intentar otra lectura.', manual); return; }
      const imagen = mejor.imagen;
      const resultado = await pedir(lector, { tipo: 'leer', pixeles: imagen.data.buffer, ancho: imagen.width, alto: imagen.height }, 'texto', abortar.signal, [imagen.data.buffer]);
      if (!vigenteTexto() || (!manual && sueloReciente())) return;
      const texto = GrietaVision.textoLegible(resultado.datos);
      let frase = '';
      if (texto && (manual || texto !== ultimoTexto)) {
        const parada = GrietaVision.paradaPosible(texto, paradas());
        frase = !manual && enViaje() ? (parada ? `El letrero parece coincidir con la parada ${parada} del catálogo.` : '') : `El texto parece decir: ${texto}.${parada ? ` Coincide con el nombre ${parada} del catálogo; confirma la parada antes de abordar.` : ''}`;
        ultimoTexto = texto;
      } else if (manual) frase = 'No pude leer texto con suficiente claridad. Acércate al letrero si puedes hacerlo con seguridad y vuelve a intentar.';
      if (frase && Date.now() - ultimoRiesgo > 6000) {
        ultimaFrase = frase;
        ultimoAviso = Date.now();
        $('camaraResultado').textContent = frase;
        if (manual || !explorando()) narrar(frase);
      }
      informar('Cámara encendida.', false);
    } catch { fallo(turno, 'No pude leer la imagen. Detuve la cámara. Puedes volver a intentar.'); }
    finally { if (vigente(turno)) { leyendo = false; botones(); } }
  }
  async function leerCamion(manual = true) {
    if (!activa || !ocr || leyendo || !enViaje() || (!manual && (explorando() || sueloReciente()))) return;
    actualizarRuta();
    const turno = sesion, revision = cambioRuta;
    if (!camionVisible || performance.now() - camionVisible.instante > 800 || calidadActual?.problema) {
      descartarCamion();
      const texto = 'Todavía no identifico un solo camión para leer su número. Apunta a su letrero; también puedes usar Leer letrero ahora.';
      if (manual) { $('camaraCamionResultado').textContent = texto; narrar(texto); }
      return;
    }
    const identidad = camionVisible.referencia;
    const vigenteLectura = () => vigente(turno) && revision === cambioRuta && enViaje() && camionVisible?.referencia === identidad && performance.now() - camionVisible.instante < 800;
    leyendo = true; ultimoCamion = Date.now(); botones();
    try {
      if (manual) informar('Leyendo el letrero en varias imágenes.', false);
      for (let toma = 0; toma < (manual ? 2 : 1); toma++) {
        if (!vigenteLectura() || explorando()) return;
        if (toma) { await new Promise((resolve) => setTimeout(resolve, 650)); if (!vigenteLectura()) return; }
        const candidatas = recortes.filter(r => r.referencia === identidad && r.revision === revision && performance.now() - r.instante < 800 && r.fotograma > ultimoFotograma);
        const mejor = candidatas.sort((a,b) => b.nitidez - a.nitidez || b.instante - a.instante)[0];
        if (!mejor || !vigenteLectura()) {
          descartarCamion();
          const texto = 'Espero una imagen nueva para volver a comparar el camión.';
          $('camaraCamionResultado').textContent = texto;
          if (manual) narrar(texto);
          return;
        }
        recortes = recortes.filter(r => r !== mejor);
        ultimoFotograma = mejor.fotograma;
        const { imagen, instante } = mejor, ref = camionVisible.referencia;
        const datos = await pedir(ocr, { tipo: 'leer', pixeles: imagen.data.buffer, ancho: imagen.width, alto: imagen.height }, 'texto', abortar.signal, [imagen.data.buffer]);
        if (!vigenteLectura() || ref !== camionVisible.referencia || (!manual && sueloReciente())) return;
        if (performance.now() - instante > 4000) {
          confirmarCamion.reiniciar(); olvidarComparacion();
          $('camaraCamionResultado').textContent = 'La lectura tardó demasiado. Vuelve a apuntar al letrero.';
          return;
        }
        const resultado = confirmarCamion.registrar({ texto: datos.datos?.text, confianza: datos.datos?.confidence, instante, objetivo: objetivo(), catalogo: catalogo(), destinos: rutas().filter(r => codigo(r.linea) === codigo(objetivo()?.linea)).map(r => r.hacia), referencia: identidad });
        if (!resultado.confirmada) olvidarComparacion();
        $('camaraCamionResultado').textContent = resultado.frase;
        clearTimeout(caducaCamion);
        caducaCamion = setTimeout(() => { if (vigente(turno) && identidad === camionVisible?.referencia) { descartarCamion(); $('camaraCamionResultado').textContent = 'La lectura del camión ya no es reciente. Vuelve a apuntar a su letrero.'; } }, 10000);
        if (!resultado.confirmada) {
          if (manual && toma === 1 && !explorando()) narrar(resultado.frase);
          continue;
        }
        ultimaFrase = ultimaFraseCamion = resultado.frase;
        const clave = `${identidad}:${resultado.frase}`;
        if (!explorando() && Date.now() - ultimoRiesgo > 6000 && (manual || !sueloReciente()) && (clave !== ultimoCamionNarrado || manual)) {
          narrar(resultado.frase); ultimoCamionNarrado = clave; ultimaComparacion = Date.now();
        }
        break;
      }
    } catch { fallo(turno, 'No pude leer el letrero del camión. Detuve la cámara. Puedes volver a intentar.'); }
    finally { if (vigente(turno)) { leyendo = false; botones(); informar('Cámara encendida.', false); } }
  }
  function repetir() { if (activa && ultimaFrase) narrar(ultimaFrase, true); }
  function iniciarInterfaz(opciones) {
    ({ hablar, callar, prepararVoz, paradas } = opciones);
    vozOcupada = opciones.vozOcupada ?? (() => false);
    explorando = opciones.explorando ?? (() => false);
    viaje = opciones.viaje ?? (() => null); rutas = opciones.rutas ?? (() => []);
    let guardado = {};
    try { guardado = JSON.parse(localStorage.getItem('grieta-camara')) ?? {}; } catch {}
    $('camaraDetalle').checked = guardado.modelo !== 'ligero';
    $('camaraLigero').checked = guardado.modelo === 'ligero';
    $('camaraAvisos').checked = guardado.avisos === true;
    $('camaraEscalones').checked = true;
    if ($('camaraHoyos')) $('camaraHoyos').checked = true;
    suelos.forEach(s => s.iniciarInterfaz({ hablar, vibrar, alAviso: texto => { ultimaFrase = texto; botones(); }, alRetirar: texto => { if (ultimaFrase === texto) ultimaFrase = fraseSuelo(); botones(); } }));
    $('camaraHoyos')?.addEventListener('change', () => { guardarCamara(); GrietaHoyos.preferencia(); });
    $('camaraEscalones').addEventListener('change', () => { guardarCamara(); GrietaEscalones.preferencia(); });
    $('camaraViaje').checked = guardado.enfoque === 'viaje';
    $('camaraEntorno').checked = !$('camaraViaje').checked;
    for (const id of ['camaraViaje', 'camaraEntorno']) $(id).addEventListener('change', () => {
      callar(); $('camaraResultado').textContent = ''; $('camaraLectura').textContent = ''; ultimaFrase = fraseSuelo(); actualizarRuta(); guardarCamara(); botones();
    });
    $('camaraRuta').addEventListener('input', sentidos);
    $('camaraSentidoOpciones').addEventListener('change', actualizarRuta);
    for (const id of ['camaraDetalle', 'camaraLigero', 'camaraAvisos']) $(id).addEventListener('change', () => {
      seguimiento.reiniciar();
      vibrar(0);
      $('camaraAlerta').textContent = '';
      guardarCamara();
    });
    $('camaraVibracion').textContent = '';
    $('camaraProbar').hidden = typeof navigator.vibrate !== 'function';
    $('camaraProbar').addEventListener('click', () => {
      const aceptado = vibrar([160, 100, 160]);
      $('camaraVibracion').textContent = aceptado ? 'Se pidió una vibración de prueba. Confirma si la sentiste antes de usar los avisos.' : 'El teléfono rechazó la vibración. Los avisos siguen por voz o lector de pantalla.';
    });
    $('camaraIniciar').addEventListener('click', iniciar);
    $('camaraDetener').addEventListener('click', () => { cerrar(true); $('camaraIniciar').focus(); });
    $('camaraLeer').addEventListener('click', () => leerTexto());
    $('camaraBuscarCamion').addEventListener('click', () => leerCamion());
    $('camaraRepetir').addEventListener('click', repetir);
    document.addEventListener('visibilitychange', () => { if (document.hidden) cerrar(); });
    addEventListener('pagehide', () => cerrar());
    botones();
  }
  return { iniciarInterfaz, cerrar, abrir, repetir };
})();
