const GrietaEscalones = (() => {
  const $ = id => document.getElementById(id);
  const avisador = new GrietaDesniveles.Avisador();
  const lienzo = document.createElement('canvas'), contexto = lienzo.getContext('2d', { willReadFrequently: true });
  let opciones = {}, worker, video, calidad, sesion = 0, reloj, vigilancia, caduca, muestra, ultimaFrase = '', clave = '', ultimoAviso = -Infinity, ultimoFotograma = -Infinity, vista = 0;
  const habilitado = () => $('camaraEscalones').checked;
  function retirar() {
    clearTimeout(caduca); $('camaraSueloAlerta').textContent = '';
    if (ultimaFrase) opciones.alRetirar?.(ultimaFrase);
    ultimaFrase = clave = '';
  }
  function preferencia() {
    if (!worker) $('camaraSueloEstado').textContent = habilitado() ? 'Escaleras y escalones: se preparan al iniciar.' : 'Escaleras y escalones: desactivado.';
  }
  function cerrar() {
    sesion++; clearTimeout(reloj); clearTimeout(vigilancia); retirar();
    worker?.terminate(); worker = video = muestra = null;
    lienzo.width = lienzo.height = 0; avisador.reiniciar(); ultimoAviso = ultimoFotograma = -Infinity; vista = 0;
    preferencia();
  }
  function fallo() {
    cerrar();
    const texto = 'Se detuvieron los avisos de escaleras y escalones. Los otros objetos siguen funcionando. Detén y vuelve a iniciar la cámara para reintentarlo.';
    $('camaraSueloEstado').textContent = texto; ultimoAviso = Date.now();
    $('camaraSueloAlerta').textContent = 'Escaleras y escalones: avisos detenidos.'; opciones.hablar?.(texto, true);
  }
  async function preparar(signal, pedir) {
    cerrar(); if (!habilitado()) return;
    const turno = sesion;
    $('camaraSueloEstado').textContent = 'Preparando los avisos experimentales de escaleras y escalones.';
    worker = new Worker('vision/escalones-worker.js?v=74');
    try { await pedir(worker, { tipo: 'iniciar' }, 'listo', signal); }
    catch (e) { if (turno !== sesion) throw e; throw Error('modelo-escalones'); }
  }
  async function analizar(turno) {
    if (turno !== sesion || !worker || !video || muestra) return;
    if (!video.videoWidth || video.readyState < 2) { reloj = setTimeout(() => analizar(turno), 100); return; }
    const w = Math.min(768, video.videoWidth), h = Math.round(video.videoHeight / video.videoWidth * w);
    if (lienzo.width !== w || lienzo.height !== h) { lienzo.width = w; lienzo.height = h; }
    contexto.drawImage(video, 0, 0, w, h);
    muestra = { capturada: performance.now(), fotograma: video.currentTime, malaImagen: ['oscura', 'expuesta'].includes(calidad?.()) };
    const actual = worker;
    let imagen;
    try {
      if (typeof createImageBitmap === 'function') { try { imagen = await createImageBitmap(lienzo); } catch {} }
      if (turno !== sesion || actual !== worker) { imagen?.close(); return; }
      vigilancia = setTimeout(() => { if (turno === sesion && actual === worker) fallo(); }, 10000);
      if (imagen) worker.postMessage({ tipo: 'detectar', vista: vista++ % 2 ? 'suelo' : 'completa', imagen, ancho: w, alto: h }, [imagen]);
      else {
        const datos = contexto.getImageData(0, 0, w, h);
        worker.postMessage({ tipo: 'detectar', vista: vista++ % 2 ? 'suelo' : 'completa', pixeles: datos.data.buffer, ancho: w, alto: h }, [datos.data.buffer]);
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
      $('camaraSueloEstado').textContent = captura.malaImagen ? 'Escaleras y escalones: la imagen es poco legible y puede omitirlos.' : captura.fotograma <= ultimoFotograma ? 'Escaleras y escalones: espero una imagen nueva de la cámara.' : 'El análisis de escaleras y escalones está tardando. Los avisos pueden llegar tarde.';
    } else {
      $('camaraSueloEstado').textContent = 'Escaleras y escalones: reconocimiento experimental activo.';
      const aviso = avisador.actualizar(data.regiones, { ahora, ...captura });
      if (aviso) {
        retirar(); ultimaFrase = aviso.texto; clave = `${aviso.tipo}:${aviso.lado}`;
        $('camaraSueloAlerta').textContent = aviso.texto; ultimoAviso = Date.now();
        opciones.alAviso?.(aviso.texto); opciones.hablar?.(aviso.texto, true);
        if (typeof navigator.vibrate === 'function' && !opciones.vibrar?.([180, 100, 180])) $('camaraVibracion').textContent = 'El teléfono no vibró. El aviso sigue por voz o lector.';
      }
      if (clave && data.regiones.some(r => `${r?.tipo}:${r?.lado}` === clave)) {
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
    $('camaraSueloEstado').textContent = 'Escaleras y escalones: reconocimiento experimental activo.';
    analizar(turno);
  }
  function iniciarInterfaz(config) { opciones = config; preferencia(); }
  return { preparar, encender, cerrar, iniciarInterfaz, preferencia, habilitado, get frase() { return ultimaFrase; }, get activo() { return Boolean(worker && video); }, get reciente() { return Date.now() - ultimoAviso < 6000; } };
})();
