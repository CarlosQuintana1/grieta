function crearCamaraSuelo(config) {
  const $ = id => document.getElementById(id);
  const avisador = new config.politica.Avisador();
  const lienzo = document.createElement('canvas'), contexto = lienzo.getContext('2d', { willReadFrequently: true });
  const mini = document.createElement('canvas'); mini.width = 32; mini.height = 24;
  const lectura = mini.getContext('2d', { willReadFrequently: true });
  let opciones = {}, worker, video, calidad, cancelarInicio, sesion = 0, reloj, vigilancia, caduca, muestra, ultimaFrase = '', clave = '', ultimoAviso = -Infinity, ultimoFotograma = -Infinity, vista = 0;
  const escribir = (id, texto) => { if ($(id)) $(id).textContent = texto; };
  const habilitado = () => $(config.casilla)?.checked === true;
  function informar(texto) {
    const estado = $(config.estado);
    if (!estado) return;
    estado.hidden = texto === config.textos.desactivado || texto === config.textos.activo;
    estado.textContent = texto;
  }
  function retirar() {
    clearTimeout(caduca); escribir(config.alerta, '');
    const frase = ultimaFrase; ultimaFrase = clave = '';
    if (frase) opciones.alRetirar?.(frase);
  }
  function preferencia() {
    if (!worker) informar(habilitado() ? config.textos.espera : config.textos.desactivado);
  }
  function cerrar() {
    sesion++; cancelarInicio?.abort(); cancelarInicio = null;
    clearTimeout(reloj); clearTimeout(vigilancia); retirar();
    worker?.terminate(); worker = video = muestra = null;
    lienzo.width = lienzo.height = 0; avisador.reiniciar(); ultimoAviso = ultimoFotograma = -Infinity; vista = 0;
    preferencia();
  }
  function fallo() {
    cerrar(); informar(config.textos.fallo); ultimoAviso = Date.now();
    escribir(config.alerta, config.textos.detenido); opciones.hablar?.(config.textos.fallo, true);
  }
  async function preparar(signal, pedir) {
    cerrar(); if (!habilitado() || signal.aborted) return;
    const turno = sesion, actual = new Worker(config.worker), cancelacion = new AbortController();
    worker = actual; cancelarInicio = cancelacion;
    const cancelar = () => { if (turno === sesion) cerrar(); };
    signal.addEventListener('abort', cancelar, { once: true });
    informar(config.textos.preparando);
    try { await pedir(actual, { tipo: 'iniciar' }, 'listo', cancelacion.signal); }
    catch (e) { if (turno !== sesion) throw e; cerrar(); throw Error(config.error); }
    finally { signal.removeEventListener('abort', cancelar); if (cancelarInicio === cancelacion) cancelarInicio = null; }
  }
  async function analizar(turno) {
    if (turno !== sesion || !worker || !video || muestra) return;
    if (!video.videoWidth || !video.videoHeight || video.readyState < 2) { reloj = setTimeout(() => analizar(turno), 100); return; }
    const escala = Math.min(1, 768 / Math.max(video.videoWidth, video.videoHeight));
    const w = Math.max(1, Math.round(video.videoWidth * escala)), h = Math.max(1, Math.round(video.videoHeight * escala));
    if (lienzo.width !== w || lienzo.height !== h) { lienzo.width = w; lienzo.height = h; }
    const actual = worker;
    let imagen;
    try {
      contexto.drawImage(video, 0, 0, w, h); lectura.drawImage(lienzo, 0, 0, 32, 24);
      const problema = GrietaSeguimiento.calidad(lectura.getImageData(0, 0, 32, 24).data, 32, 24).problema;
      muestra = { capturada: performance.now(), fotograma: video.currentTime, malaImagen: [problema, calidad?.()].some(p => ['oscura', 'expuesta'].includes(p)) };
      if (typeof createImageBitmap === 'function') { try { imagen = await createImageBitmap(lienzo); } catch {} }
      if (turno !== sesion || actual !== worker) { imagen?.close(); return; }
      vigilancia = setTimeout(() => { if (turno === sesion && actual === worker) fallo(); }, 10000);
      const mensaje = { tipo: 'detectar', vista: config.alternar && vista++ % 2 ? 'suelo' : 'completa', ancho: w, alto: h };
      if (imagen) actual.postMessage({ ...mensaje, imagen }, [imagen]);
      else {
        const datos = contexto.getImageData(0, 0, w, h);
        actual.postMessage({ ...mensaje, pixeles: datos.data.buffer }, [datos.data.buffer]);
      }
    } catch { imagen?.close(); if (turno === sesion && actual === worker) fallo(); }
  }
  function recibir(turno, data) {
    if (turno !== sesion || !worker) return;
    clearTimeout(vigilancia);
    const captura = muestra; muestra = null;
    if (!captura || data?.tipo !== 'suelo' || !Array.isArray(data.regiones) || !Number.isFinite(data.ms) || data.ms < 0) return fallo();
    const ahora = performance.now();
    if (ahora - captura.capturada > 2000 || captura.malaImagen || captura.fotograma <= ultimoFotograma) {
      avisador.reiniciar(); retirar();
      informar(captura.malaImagen ? config.textos.ilegible : captura.fotograma <= ultimoFotograma ? config.textos.congelado : config.textos.tarde);
    } else {
      informar(config.textos.activo);
      const aviso = avisador.actualizar(data.regiones, { ahora, ...captura });
      if (aviso) {
        retirar(); ultimaFrase = aviso.texto; clave = `${aviso.tipo}:${aviso.lado}`;
        escribir(config.alerta, aviso.texto); ultimoAviso = Date.now();
        opciones.alAviso?.(aviso.texto); opciones.hablar?.(aviso.texto, true);
        if (typeof navigator.vibrate === 'function' && !opciones.vibrar?.([180, 100, 180])) escribir('camaraVibracion', 'El teléfono no vibró. El aviso sigue por voz o lector.');
      }
      if (clave && data.regiones.some(r => `${r?.tipo}:${r?.lado}` === clave && (!config.validar || config.validar(r)))) {
        clearTimeout(caduca); caduca = setTimeout(retirar, 1800);
      }
    }
    ultimoFotograma = Math.max(ultimoFotograma, captura.fotograma);
    reloj = setTimeout(() => analizar(turno), Math.max(100, 700 - data.ms));
  }
  function encender(fuente, estadoCalidad) {
    if (!worker) return;
    video = fuente; calidad = estadoCalidad;
    const turno = sesion;
    worker.onmessage = ({ data }) => recibir(turno, data);
    worker.onerror = () => { if (turno === sesion) fallo(); };
    informar(config.textos.activo); analizar(turno);
  }
  function iniciarInterfaz(configuracion) { opciones = configuracion; preferencia(); }
  return { preparar, encender, cerrar, iniciarInterfaz, preferencia, habilitado, get frase() { return ultimaFrase; }, get instante() { return ultimoAviso; }, get activo() { return Boolean(worker && video); }, get reciente() { return Date.now() - ultimoAviso < 6000; } };
}
const GrietaEscalones = crearCamaraSuelo({
  politica: GrietaDesniveles, casilla: 'camaraEscalones', estado: 'camaraSueloEstado', alerta: 'camaraSueloAlerta',
  worker: 'vision/escalones-worker.js?v=74', error: 'modelo-escalones', alternar: true,
  textos: {
    espera: 'Escaleras y escalones: se preparan al iniciar.', desactivado: 'Escaleras y escalones: desactivado.',
    preparando: 'Preparando los avisos experimentales de escaleras y escalones.', activo: 'Escaleras y escalones: reconocimiento experimental activo.',
    fallo: 'Se detuvieron los avisos de escaleras y escalones. Los otros objetos siguen funcionando. Detén y vuelve a iniciar la cámara para reintentarlo.',
    detenido: 'Escaleras y escalones: avisos detenidos.', ilegible: 'Escaleras y escalones: la imagen es poco legible y puede omitirlos.',
    congelado: 'Escaleras y escalones: espero una imagen nueva de la cámara.', tarde: 'El análisis de escaleras y escalones está tardando. Los avisos pueden llegar tarde.'
  }
});
const GrietaHoyos = crearCamaraSuelo({
  politica: typeof GrietaHoyosPolitica === 'undefined' ? { Avisador: class { reiniciar() {} } } : GrietaHoyosPolitica,
  casilla: 'camaraHoyos', estado: 'camaraHoyosEstado', alerta: 'camaraHoyosAlerta',
  worker: 'vision/hoyos-worker.js?v=76', error: 'modelo-hoyos', validar: r => Number.isFinite(r.confianza) && r.confianza >= .65,
  textos: {
    espera: 'Hoyos: se preparan al iniciar.', desactivado: 'Hoyos: desactivado.',
    preparando: 'Preparando los avisos experimentales de hoyos.', activo: 'Hoyos: reconocimiento experimental activo.',
    fallo: 'Se detuvieron los avisos de hoyos. Los otros objetos siguen funcionando. Detén y vuelve a iniciar la cámara para reintentarlo.',
    detenido: 'Hoyos: avisos detenidos.', ilegible: 'Hoyos: la imagen es poco legible y puede omitirlos.',
    congelado: 'Hoyos: espero una imagen nueva de la cámara.', tarde: 'El análisis de hoyos está tardando. Los avisos pueden llegar tarde.'
  }
});
