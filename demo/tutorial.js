const TutorialGrieta = (() => {
  const $ = id => document.getElementById(id);
  const pasos = [
    { titulo: 'Busca a dónde vas', icono: 'lugar', tono: 'maiz',
      texto: 'En Inicio, toca Busca un lugar o Dictar y elige tu destino.',
      detalle: 'Compara Qrobus, Uber, DiDi e inDrive. Si eliges camión, toca Empezar viaje con avisos para recibir la guía.' },
    { titulo: 'Encuentra camiones cerca', icono: 'qrobus', tono: 'anil',
      texto: 'El botón del centro, Camiones cerca, busca paradas desde tu ubicación.',
      detalle: 'Elige una parada para consultar rutas y horarios o Reportar algo en esta parada. Los horarios son estimados; no vemos los camiones en tiempo real.' },
    { titulo: 'Usa la cámara y la voz', icono: 'decir', tono: 'ciruela',
      texto: 'En Inicio o Ajustes, abre Describir con la cámara. En Ajustes puedes elegir el modo Voz.',
      detalle: 'La cámara puede describir algunos objetos y leer letreros. Analiza las imágenes en tu teléfono y puede omitir obstáculos; usa tu bastón o acompañamiento.' },
  ];
  let opciones, paso = 0, regreso = 'inicio';
  function leer() {
    const actual = pasos[paso];
    opciones.decir(`Paso ${paso + 1} de ${pasos.length}. ${actual.titulo}. ${actual.texto} ${actual.detalle}`);
  }
  function entrar() {
    opciones.reiniciar();
    const actual = pasos[paso];
    $('tutorialProgreso').textContent = `Paso ${paso + 1} de ${pasos.length}`;
    $('tutorialTitulo').textContent = actual.titulo;
    $('tutorialTexto').textContent = actual.texto;
    $('tutorialDetalle').textContent = actual.detalle;
    $('tutorialFicha').className = `tutorial-hero tono-${actual.tono}`;
    [...$('tutorialPuntos').children].forEach((punto, i) => punto.classList.toggle('hecho', i <= paso));
    $('tutorialIcono').setAttribute('href', `#p-${actual.icono}`);
    $('tutorialContinuar').textContent = paso === pasos.length - 1 ? 'Empezar a usar Grieta' : 'Continuar';
    $('tutorialAnterior').hidden = paso === 0;
    $('tutorialPracticar').hidden = paso !== pasos.length - 1 || !opciones.modoVoz();
    $('tutorialRepetir').hidden = !opciones.modoVoz() || opciones.lector();
    $('hoja').scrollTop = 0;
    $('tutorialTitulo').focus({ preventScroll: true });
    leer();
  }
  function abrir(desde = 'inicio', reemplazar = false) {
    paso = 0; regreso = desde === 'ajustes' ? 'ajustes' : 'inicio';
    opciones.ir('tutorial', reemplazar);
  }
  function terminar(completado) {
    opciones.guardar({ version: 1, completado });
    opciones.ir(regreso, true);
  }
  function iniciar(config) {
    opciones = config;
    $('abrirTutorial').addEventListener('click', () => abrir('ajustes'));
    $('tutorialContinuar').addEventListener('click', () => {
      if (paso === pasos.length - 1) return terminar(true);
      paso++; entrar();
    });
    $('tutorialAnterior').addEventListener('click', () => { paso = Math.max(0, paso - 1); entrar(); });
    $('tutorialOmitir').addEventListener('click', () => terminar(false));
    $('tutorialRepetir').addEventListener('click', leer);
    $('tutorialPracticar').addEventListener('click', () => opciones.practicar('tutorial'));
  }
  return { iniciar, abrir, entrar };
})();
