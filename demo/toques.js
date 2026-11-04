const ToquesGrieta = (() => {
  const INSTRUCCION = 'Toca una vez para escuchar. Toca dos veces seguidas el mismo control para activarlo.';
  const AYUDAS = {
    vozDestino: 'Escucha tu destino para buscar cómo llegar.', vozCamara: 'Abre la cámara para describir objetos y leer letreros.',
    vozCamion: 'Busca paradas y rutas cercanas.', vozDonde: 'Dice la ubicación detectada.', vozRepetir: 'Vuelve a leer el último aviso.',
    camaraIniciar: 'Pide permiso y enciende la cámara.', camaraDetener: 'Apaga la cámara y el reconocimiento.',
    camaraLeer: 'Busca texto en la imagen y lo lee.', enviarReporte: 'Envía el reporte que preparaste.', empezar: 'Inicia la guía del viaje.',
  };
  let habilitado = () => false, decir = () => {}, cancelar = () => {}, original = (e, a) => a ? e.getAttribute(a) : e.textContent;
  let proteccion = 0, serie = 0, nativo, elegido, ultimo = -Infinity, punto, arrastre = false, permitido, previo;
  const activo = () => Boolean(habilitado());
  const normalizar = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
  const deshabilitado = (e) => e.matches(':disabled') || e.getAttribute('aria-disabled') === 'true';
  const campo = (e) => e.matches('textarea,select,[contenteditable="true"],input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=reset])');
  function control(nodo) {
    if (!(nodo instanceof Element) || nodo.closest('#perfilLectorOpciones')) return null;
    const directo = nodo.closest('button,a[href],input:not([type=hidden]),textarea,select,[role=button],[role=radio],[role=switch],[contenteditable="true"]');
    const e = directo ?? nodo.closest('label')?.control;
    return e && !e.closest('[hidden],[inert]') ? e : null;
  }
  const marca = (e) => e?.matches('input[type=file]') ? e.closest('label') ?? e : e;
  function reiniciar() {
    nativo = null; proteccion = 0;
    marca(elegido)?.classList.remove('toque-elegido'); elegido = null; ultimo = -Infinity; permitido = null; previo = null;
    const anuncio = document.getElementById('descripcionToque'); if (anuncio) anuncio.textContent = '';
  }
  function nombre(e) {
    const ids = e.getAttribute('aria-labelledby')?.split(/\s+/).map((id) => document.getElementById(id)).filter(Boolean);
    const etiqueta = original(e, 'aria-label') || (ids?.length ? ids.map((n) => original(n)).join(' ') : '') || [...(e.labels ?? [])].map((n) => original(n)).join(' ') || original(e) || original(e, 'title') || original(e, 'placeholder');
    return normalizar(etiqueta).slice(0, 220) || 'Control';
  }
  function descripcion(e, guia = true) {
    let estado = '';
    if (e.matches('input[type=checkbox],input[type=radio]')) {
      const marcado = previo?.elemento === e ? previo.marcado : e.checked;
      estado = e.type === 'radio' ? (marcado ? 'Seleccionado.' : 'No seleccionado.') : (marcado ? 'Activado.' : 'Desactivado.');
    } else if (e.hasAttribute('aria-checked')) estado = e.getAttribute('aria-checked') === 'true' ? 'Seleccionado.' : 'No seleccionado.';
    else if (e.hasAttribute('aria-pressed')) estado = e.getAttribute('aria-pressed') === 'true' ? 'Activado.' : 'Desactivado.';
    const tipo = campo(e) ? (e.matches('select') ? 'Selector.' : e.matches('input[type=file]') ? 'Adjuntar archivo.' : 'Campo de texto.') : e.matches('a[href]') ? 'Enlace.' : e.matches('button,[role=button]') ? 'Botón.' : 'Opción.';
    return [nombre(e) + '.', tipo, estado, guia ? AYUDAS[e.id] ?? '' : '', deshabilitado(e) ? 'Por ahora no está disponible.' : guia ? 'Dos toques rápidos para activar.' : ''].filter(Boolean).join(' ');
  }
  function explorar(e) {
    marca(elegido)?.classList.remove('toque-elegido'); elegido = e; marca(e).classList.add('toque-elegido');
    if (!campo(e) && !deshabilitado(e)) e.focus({ preventScroll: true });
    anunciar(descripcion(e));
  }
  function anunciar(texto) {
    proteccion = performance.now();
    const anuncio = document.getElementById('descripcionToque');
    if (anuncio) anuncio.textContent = texto;
    decir(texto);
  }
  function detener(e) { e.preventDefault(); e.stopImmediatePropagation(); }
  addEventListener('pointerdown', (e) => {
    punto = null; arrastre = false; permitido = null; previo = null; nativo = null; serie++;
    if (!activo() || e.button !== 0 || e.isPrimary === false) return;
    const c = control(e.target); if (!c) return;
    punto = { x: e.clientX, y: e.clientY, id: e.pointerId, control: c };
    if (c.matches('input[type=checkbox],input[type=radio]')) previo = { elemento: c, marcado: c.checked };
    if (c === elegido && performance.now() - ultimo <= 650 && !deshabilitado(c)) permitido = c;
    if (campo(c) && !permitido) e.preventDefault();
  }, { capture: true, passive: false });
  addEventListener('pointermove', (e) => {
    if (activo() && punto?.id === e.pointerId && Math.hypot(e.clientX - punto.x, e.clientY - punto.y) > 12) { arrastre = true; reiniciar(); }
  }, { capture: true, passive: true });
  addEventListener('pointercancel', () => { punto = null; arrastre = true; reiniciar(); }, true);
  addEventListener('pointerup', (e) => {
    const c = control(e.target);
    if (activo() && c && !arrastre && deshabilitado(c)) { explorar(c); ultimo = -Infinity; }
  }, true);
  addEventListener('click', (e) => {
    if (!activo()) { reiniciar(); return; }
    if (!e.isTrusted || e.detail === 0 || e.button !== 0 || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    const c = control(e.target); if (!c) { reiniciar(); return; }
    if (nativo === c && e.target === c) { nativo = null; return; }
    if (arrastre) { detener(e); return; }
    if (!deshabilitado(c) && (permitido === c || (c === elegido && performance.now() - ultimo <= 650))) {
      const etiqueta = e.target instanceof Element && e.target.closest('label')?.control === c && e.target !== c;
      reiniciar(); cancelar();
      const turno = serie;
      if (c.matches('input[type=checkbox],input[type=radio],[aria-checked],[aria-pressed]')) setTimeout(() => {
        if (turno === serie && activo() && c.isConnected && !c.closest('[hidden]')) anunciar(descripcion(c, false));
      }, 30);
      if (etiqueta) { nativo = c; setTimeout(() => { if (nativo === c) nativo = null; }, 150); }
      return;
    }
    detener(e); explorar(c); ultimo = deshabilitado(c) ? -Infinity : performance.now();
  }, true);
  addEventListener('dblclick', (e) => { if (activo() && control(e.target)) e.preventDefault(); }, true);
  addEventListener('keydown', (e) => { if (!['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) reiniciar(); }, true);
  addEventListener('wheel', reiniciar, { capture: true, passive: true });
  function iniciar(opciones) { habilitado = opciones.activo; decir = opciones.decir; cancelar = opciones.cancelar ?? (() => {}); original = opciones.original ?? original; reiniciar(); }
  return { iniciar, reiniciar, activo, instrucciones: INSTRUCCION, get describiendo() {
    if (!proteccion) return false;
    if (performance.now() - proteccion < 400) return true;
    if (!window.speechSynthesis?.speaking) { proteccion = 0; return false; }
    return true;
  } };
})();
