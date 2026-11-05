const PracticaGrieta = (() => {
  const $ = (id) => document.getElementById(id);
  let opciones, regreso = 'inicio', terminada = false;
  function instrucciones() {
    return opciones.lector() ? 'Usa tu lector de pantalla para explorar el botón de práctica y después activarlo con su gesto habitual. Grieta no añade otro doble toque.' : 'Toca una vez el botón de práctica para escuchar qué hace. Después da dos toques rápidos sobre el mismo botón para activarlo. Puedes escuchar primero y luego dar los dos toques.';
  }
  function entrar() {
    terminada = false;
    $('practicaAyuda').textContent = instrucciones();
    $('practicaEstado').textContent = 'Paso 1 de 2. Explora el botón de práctica.';
    $('practicaTerminar').hidden = true;
    opciones.decir(instrucciones());
  }
  function abrir(desde) { regreso = desde === 'tutorial' ? 'tutorial' : document.body.dataset.pantalla === 'ajustes' ? 'ajustes' : 'inicio'; opciones.ir('practica'); }
  function descrito(elemento) {
    if (elemento.id === 'practicaBoton' && !terminada) $('practicaEstado').textContent = 'Paso 2 de 2. Ya escuchaste el botón. Actívalo con dos toques rápidos en el mismo lugar.';
  }
  function iniciar(config) {
    opciones = config;
    for (const id of ['practicarInicio', 'practicarAjustes']) $(id).addEventListener('click', abrir);
    $('practicaBoton').addEventListener('click', () => {
      terminada = true;
      const mensaje = 'Práctica completada. Activaste el botón sin hacer ninguna acción fuera de esta práctica.';
      $('practicaEstado').textContent = mensaje;
      $('practicaTerminar').hidden = false;
      opciones.guardar();
      opciones.decir(mensaje);
    });
    $('practicaRepetir').addEventListener('click', entrar);
    for (const id of ['practicaSalir', 'practicaTerminar']) $(id).addEventListener('click', () => opciones.ir(regreso));
  }
  return { iniciar, entrar, abrir, descrito };
})();
