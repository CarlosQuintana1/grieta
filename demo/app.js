const $ = (id) => document.getElementById(id);
const pesos = (x) => `$${Math.round(x)}`;
const QUERETARO = [20.6, -100.4];
const RADIO_KM = 40;
const ESPERAS = [0, 15, 30, 60];
const DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const ACCIONES = { "pedir ya": "Pídelo ya", esperar: "Espera un poco", camion: "Vete en camión" };
// Cada veredicto lleva su forma, para no depender solo del color.
const SIMBOLOS = { "pedir ya": "palomita", esperar: "reloj", camion: "camion" };

const escapar = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const picto = (nombre, clase = "") => `<svg class="picto ${clase}" aria-hidden="true"><use href="#p-${nombre}"/></svg>`;
// Ficha chica de color con su pictograma: la que llevan todas las filas y listas
// Cada app con su ficha propia: una letra y su color, sin usar logotipos de las empresas
const fichaApp = (app) => `<span class="mini-ficha ficha-app app-${app}" aria-hidden="true">${{ uber: "U", didi: "D", indrive: "iD" }[app]}</span>`;
const miniFicha = (tono, contenido) => `<span class="mini-ficha ${tono}" aria-hidden="true">${contenido}</span>`;
const ico = (nombre, clase = "") => `<svg class="icono ${clase}" aria-hidden="true"><use href="#i-${nombre}"/></svg>`;
const leer = (clave, defecto) => { try { return JSON.parse(localStorage.getItem(clave)) ?? defecto; } catch { return defecto; } };
const escribir = (clave, valor) => { try { localStorage.setItem(clave, JSON.stringify(valor)); } catch {} };
const sinAcentos = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
// Los colores del mapa siguen al tema: con alto contraste o colores para daltonismo cambian igual que la pantalla.
const tono = (nombre) => getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();
// Los cruces vienen como "Calle/Otra calle": con espacios, la letra grande parte el renglon en la diagonal.
const cruce = (t) => String(t ?? "").replace(/\s*\/\s*/g, " / ");

// Hora de 12 h para la pantalla: 6:41 pm.
function hora(min) {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  return `${h % 12 || 12}:${String(m % 60).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}
const ahoraMin = () => { const a = new Date(); return a.getHours() * 60 + a.getMinutes(); };
const hoyDia = () => (new Date().getDay() + 6) % 7;

const mapa = L.map("mapa", { zoomControl: false, attributionControl: false, keyboard: false }).setView(QUERETARO, 12);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(mapa);
L.control.attribution({ position: "bottomright", prefix: false })
  .addAttribution('&copy; <a href="https://www.openstreetmap.org/copyright" tabindex="-1">OpenStreetMap</a>').addTo(mapa);
// El mapa cambia de alto con lo que hay en la hoja y al girar el telefono: Leaflet tiene que volver a medirlo.
// Despues de medir se vuelve a encuadrar lo de la pantalla, porque el tamano final llega cuando ya se dibujo.
let reencuadre;
new ResizeObserver(() => {
  mapa.invalidateSize();
  clearTimeout(reencuadre);
  reencuadre = setTimeout(() => { if (document.body.classList.contains("con-mapa")) reencuadrar(document.body.dataset.pantalla); }, 150);
}).observe($("mapa"));
const icono = (clase) => L.divIcon({ className: "", html: `<span class="marca ${clase}"></span>`, iconSize: [18, 18] });

const estado = { origen: null, destino: null, editando: "hacia", kmCalle: null, momento: 0, otra: null, prisa: 20, app: null, gps: null, elegida: null };
const capas = {};
let lugares = [];

const FRASES = {
  a_donde_vas: "¿A dónde vas?",
  vamos_lugar: "Vamos a {lugar}.",
  vamos_casa: "Vamos a casa.",
  buscando_ubicacion: "Buscando dónde estás.",
  sin_ubicacion: "No pude ver tu ubicación.",
  no_escuche: "No te escuché. Toca el botón otra vez y habla después del tono.",
  camina_parada: "Camina a {parada}",
  llegaste_parada: "Llegaste a la parada",
  espera_linea: "Espera la línea {linea} hacia {hacia}",
  horario_pasa: "según el horario pasa a las {hora}",
  aviso_pasar: "Te aviso cuando esté por pasar.",
  ya_casi: "Ya casi",
  ya_paso: "Ya pasó",
  viene_lleno: "Viene lleno",
  espera_siguiente: "Si puedes, espera la siguiente.",
  siguiente: "Según el horario, la siguiente pasa a las {hora}.",
  ya_me_subi: "Ya me subí",
  subi_linea: "Ya me subí a la {linea}",
  faltan_paradas: "Faltan {n} paradas",
  dos_paradas: "Bajas en dos paradas",
  preparate_bajar: "Prepárate para bajar.",
  siguiente_parada: "Bájate en la siguiente parada",
  bajate: "Bájate aquí",
  transbordo: "Bájate aquí y cambia de camión",
  despues_transbordo: "Después cambias de camión; te aviso.",
  ya_casi_llegas: "Ya casi llegas",
  llegaste: "Llegaste",
  acceso: "Cuidado con la accesibilidad. {problemas}.",
  referencia_parada: "Referencia: {referencia}.",
  aviso_parada: "Cuidado: {avisos}.",
  confirmar_fin: "¿Terminar el viaje? Ya no te voy a avisar cuándo bajarte. Toca otra vez para confirmar.",
  empezar: "Empezar viaje con avisos",
  repetir: "Repetir",
  terminar: "Terminar viaje",
};
const NOMBRE_OTOMI = "Hñöñho (Otomí)";
const NOMBRE_NAHUATL = "Náhuatl (Huasteca oriental)";
const frase = (id, valores = {}) => ({ id, valores });
const textoFrase = (mensaje) => Array.isArray(mensaje) ? mensaje.map(textoFrase).join("")
  : mensaje?.id ? FRASES[mensaje.id].replace(/\{(\w+)\}/g, (_, clave) => String(mensaje.valores[clave] ?? "")) : String(mensaje ?? "");
let lenguasDisponibles = [];
let audiosOto = new Set();
let vozGrieta = null;
let microfonoActivo = false;
let dictadoActual = null;
let inicioDictado;
let revisionDictado = 0, dictadoIniciado = false, ultimaVozDetenida = -Infinity;
const cierresDictado = new Set();
let respuestaDictado = null;
let audio;
let ultimoMensaje = null;
let grabacion = null;
let finalizarLectura = null;
let turnoVoz = 0;
let colaVoz = Promise.resolve();

// Ajustes guardados en este telefono.
const acc = { toques: true, modoVoz: false, facil: false, grande: false, contraste: false, daltonico: false, voz: false, vozElegida: false, lenta: false, camino: false, unidos: false, tema: "auto", movilidad: "normal", oido: "bien", lector: "no", lengua: "es", ...leer("grieta-acc", {}) };
let camaraConVoz = true;
acc.idioma ??= acc.lengua === "oto" ? "oto" : "es";
if (!["es", "oto", "nah"].includes(acc.idioma)) acc.idioma = "es";
if (!acc.modoVoz && !acc.vozElegida) acc.voz = false;
// Con "Como el telefono", los colores siguen el modo claro u oscuro del sistema.
const sistemaClaro = matchMedia("(prefers-color-scheme: light)");
const OPCIONES = { grande: "optGrande", contraste: "optContraste", daltonico: "optDaltonico", voz: "optVoz", lenta: "optLenta", camino: "optCamino", unidos: "optUnidos" };
let marcarDensidad = () => {};
const densidadActual = () => acc.modoVoz ? "voz" : acc.facil ? "facil" : "completa";
function aplicarAcc() {
  document.documentElement.classList.toggle("claro", acc.tema === "claro" || (acc.tema === "auto" && sistemaClaro.matches));
  for (const b of $("optTema").children) b.setAttribute("aria-pressed", String(b.dataset.v === acc.tema));
  marcarDensidad(densidadActual());
  document.documentElement.classList.toggle("grande", acc.grande);
  // Modo facil: solo lo esencial y botones grandes, para quien quiere la app lo mas sencilla
  document.documentElement.classList.toggle("facil", acc.facil);
  document.documentElement.classList.toggle("contraste", acc.contraste);
  document.documentElement.classList.toggle("daltonico", acc.daltonico);
  // Modo voz: el inicio cambia a botones grandes y el mapa se quita.
  document.documentElement.classList.toggle("modo-voz", acc.modoVoz);
  $("inicioVoz").hidden = !acc.modoVoz;
  $("inicioNormal").hidden = acc.modoVoz;
  $(acc.modoVoz ? "vozLugares" : "guardados").after($("deshacerInicio"));
  for (const [k, id] of Object.entries(OPCIONES)) $(id).checked = acc[k];
  $("optUnidos2").checked = acc.unidos;
  actualizarVozEncabezado();
  recolorear();
  document.querySelector('meta[name="theme-color"]').content = tono("--fondo");
  pintarResumenPerfil();
  $('optToques').checked = acc.toques;
  $('optToques').disabled = !acc.modoVoz || acc.lector === 'si';
  $('ayudaToques').hidden = !acc.modoVoz || acc.lector === 'si' || !acc.toques;
  ToquesGrieta.reiniciar();
  if (!acc.voz) detenerVoz();
}
sistemaClaro.addEventListener("change", () => { if (acc.tema === "auto") aplicarAcc(); });
$("optTema").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  acc.tema = b.dataset.v;
  guardarAcc();
  aplicarAcc();
});
const guardarAcc = () => escribir("grieta-acc", acc);
marcarDensidad = radios("optDensidad", (v) => {
  acc.modoVoz = v === "voz";
  acc.facil = v === "facil";
  if (acc.modoVoz) Object.assign(acc, { voz: acc.lector !== "si", grande: true });
  else acc.voz = false;
  guardarAcc();
  aplicarAcc();
});
// Salida a la vista con mapa y letra normal, por si el modo voz se eligio sin querer.
$("salirVoz").addEventListener("click", () => {
  Object.assign(acc, { modoVoz: false, grande: false, contraste: false, voz: false });
  guardarAcc();
  aplicarAcc();
  $("tituloInicio").focus();
});
$('optToques').addEventListener('change', () => { acc.toques = $('optToques').checked; guardarAcc(); aplicarAcc(); });
for (const [k, id] of Object.entries(OPCIONES)) {
  $(id).addEventListener("change", (e) => {
    acc[k] = e.target.checked;
    if (k === "voz") acc.vozElegida = true;
    if (k === "camino") acc.movilidad = acc.camino ? (acc.movilidad === "silla" ? "silla" : "poco") : "normal";
    guardarAcc();
    aplicarAcc();
    if (k === "camino" || k === "unidos") calcular();
  });
}
$("optUnidos2").addEventListener("change", (e) => {
  acc.unidos = e.target.checked;
  guardarAcc();
  aplicarAcc();
  calcular();
});
aplicarAcc();

// Pantallas: cada una dice si lleva mapa, encabezado y a que pestana pertenece.
const PANTALLAS = {
  bienvenida: {},
  tutorial: {},
  inicio: { tab: "inicio" },
  buscar: { tab: "inicio", encabezado: true },
  elegirMapa: { tab: "inicio", mapa: true, encabezado: true },
  opciones: { tab: "inicio", mapa: true, encabezado: true },
  detalle: { tab: "inicio", mapa: true, encabezado: true },
  camiones: { tab: "camiones", mapa: true, encabezado: true },
  ubicacion: { tab: "inicio", mapa: true, encabezado: true },
  camara: { tab: "inicio", encabezado: true },
  practica: { tab: "inicio", encabezado: true },
  guia: {},
  reporte: { tab: "reporte" },
  ajustes: { tab: "ajustes" },
  perfil: { tab: "ajustes", encabezado: true },
};
const titulos = { buscar: "Buscar", camiones: "Camiones cerca", ubicacion: "Dónde estoy", elegirMapa: "Elige en el mapa", perfil: "Tu perfil de viaje", camara: "Cámara que habla", practica: "Practicar los toques" };

function actualizarVozEncabezado() {
  const boton = $("vozEncabezado"), enCamara = document.body.dataset.pantalla === "camara";
  const etiqueta = enCamara ? "Avisos con voz" : acc.voz ? "Silenciar Grieta" : "Activar voz";
  boton.setAttribute("aria-label", etiqueta);
  boton.title = etiqueta;
  boton.disabled = enCamara && acc.lector === "si";
  if (enCamara) boton.setAttribute("aria-pressed", String(camaraConVoz && !boton.disabled));
  else boton.removeAttribute("aria-pressed");
}
function mostrar(nombre) {
  if (dictadoActual) cancelarDictado();
  ToquesGrieta.reiniciar();
  const conf = PANTALLAS[nombre];
  if (nombre !== "camara") CamaraGrieta.cerrar();
  if (!$("chofer").hidden) tarjetaChofer(false);
  if (guia.activa && !["guia", "camara"].includes(nombre)) terminarGuia(true);
  if (nombre === "inicio") {
    estado.guardarComo = null;
    limpiarRuta();
    pintarViajes();
    pintarRutina();
    pintarAhorro();
    pintarImpacto();
    $("invitaPerfil").hidden = acc.modoVoz || leer("grieta-perfil", false) || leer("grieta-invita-cerrada", false);
  }
  if (nombre === "opciones") quitarTrazo();
  if (nombre !== "elegirMapa") capas.punto?.remove();
  if (nombre !== "camiones") { capas.paradas?.remove(); capas.paradas = null; }
  if (nombre !== "ubicacion") { capas.yo?.remove(); capas.yo = null; }
  if (nombre !== "camiones" && nombre !== "ubicacion") { capas.vista?.remove(); capas.vista = null; }
  if ($("dialogoLugar").open) $("dialogoLugar").close();
  if (nombre !== "buscar" && nombre !== "elegirMapa") cambioUbicacionGuardada = null;
  if (quitado && nombre !== quitado.pantalla) { quitado = null; pintarGuardados(); }
  for (const s of document.querySelectorAll(".pantalla")) s.hidden = s.id !== nombre;
  if (nombre === "camara" && document.body.dataset.pantalla !== "camara") camaraConVoz = true;
  document.body.dataset.pantalla = nombre;
  actualizarVozEncabezado();
  document.body.classList.toggle("con-mapa", Boolean(conf.mapa));
  document.body.classList.remove("alerta");
  $("encabezado").hidden = !conf.encabezado;
  if (conf.encabezado) $("tituloPantalla").textContent = titulos[nombre] ?? "";
  $("pestanas").hidden = !conf.tab;
  for (const b of $("pestanas").children) {
    if (b.dataset.tab === conf.tab) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  }
  if (nombre === "ajustes") requestAnimationFrame(medirPantalla);
  if (nombre === "camara") CamaraGrieta.abrir();
  if (nombre === "practica") PracticaGrieta.entrar();
  if (nombre === "tutorial") TutorialGrieta.entrar();
  $("hoja").scrollTop = 0;
  // El foco va al titulo para que el lector de pantalla anuncie el cambio.
  const titulo = conf.encabezado ? $("tituloPantalla") : [...$(nombre).querySelectorAll("h1")].find((h) => !h.closest("[hidden]"));
  titulo?.focus({ preventScroll: true });
  setTimeout(() => { mapa.invalidateSize(); if (conf.mapa) reencuadrar(nombre); }, 60);
}
// Un mapa que estuvo oculto pierde el encuadre; se rehace con lo que toca en cada pantalla.
function reencuadrar(nombre) {
  // Con el mapa oculto (modo para personas ciegas) no hay a donde moverlo: Leaflet calcularia posiciones invalidas.
  if (!$("mapa").offsetHeight) return;
  if (nombre === "camiones" && estado.listaCamiones?.[0] && estado.puntoCamiones) {
    const [p, a] = [estado.puntoCamiones, estado.listaCamiones[0]];
    return encuadrar(L.latLngBounds([[p.lat, p.lon], [a.lat, a.lon]]));
  }
  if (nombre === "ubicacion" && capas.yo) return mapa.setView(capas.yo.getLatLng(), 17);
  const capa = nombre === "detalle" ? capas.camion ?? capas.linea : nombre === "opciones" ? capas.linea : null;
  if (capa) return encuadrar(capa.getBounds());
  const c = estado.gps ?? estado.origen;
  if (nombre === "inicio" && c) suave() ? mapa.flyTo([c.lat, c.lon], 15, { duration: 0.6 }) : mapa.setView([c.lat, c.lon], 15);
}
function ir(nombre, reemplazar) {
  if (history.state?.p !== nombre) history[reemplazar ? "replaceState" : "pushState"]({ p: nombre }, "");
  mostrar(nombre);
}
addEventListener("popstate", (e) => {
  const pantalla = e.state?.p ?? "inicio";
  mostrar(pantalla);
  if (pantalla === "camiones" && (estado.gps ?? estado.origen)) cargarCamiones(estado.gps ?? estado.origen);
  if (pantalla === "ubicacion" && estado.gps) ponerYo();
});
$("atras").addEventListener("click", () => (history.state && history.length > 1 ? history.back() : ir("inicio", true)));
// En la app instalada de iPhone no hay gesto para regresar: deslizar desde la orilla izquierda hace lo mismo que la flecha,
// que queda lejos del pulgar. No aplica sobre el mapa ni en la guia, que no tiene encabezado.
let deslizar = null;
addEventListener("touchstart", (e) => {
  const t = e.touches[0];
  deslizar = !$("encabezado").hidden && t.clientX < 24 && !e.target.closest(".leaflet-container") ? { x: t.clientX, y: t.clientY } : null;
}, { passive: true });
addEventListener("touchend", (e) => {
  const t = e.changedTouches[0];
  if (deslizar && t.clientX - deslizar.x > 80 && Math.abs(t.clientY - deslizar.y) < 60) $("atras").click();
  deslizar = null;
}, { passive: true });
$("pestanas").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  const tab = b.dataset.tab;
  if (tab === "camiones") return abrirCamiones();
  if (tab === "reporte") return abrirReporte();
  ir(tab);
});

for (const [id, clave] of Object.entries({ tituloInicio: "a_donde_vas", empezar: "empezar", repetir: "repetir", vozRepetir: "repetir", terminar: "terminar", yaPaso: "ya_paso", vieneLleno: "viene_lleno" })) {
  const boton = $(id);
  boton.lastChild.textContent = textoFrase(frase(clave));
}
$("nombreOtomi").textContent = NOMBRE_OTOMI;
$("vozEncabezado").addEventListener("click", () => {
  if (document.body.dataset.pantalla === "camara") {
    camaraConVoz = !camaraConVoz;
    actualizarVozEncabezado();
    if (camaraConVoz) CamaraGrieta.repetir();
    else detenerVoz();
    return;
  }
  acc.voz = !acc.voz; acc.vozElegida = true;
  guardarAcc(); aplicarAcc();
});

// Voz y vibracion, con un tono por pulso para que en iPhone tambien haya senal.
// Los nombres de las paradas son cruces escritos con abreviaturas: se leen como se dicen.
const DECIR = [[/\s*\/\s*/g, " y "], [/\bBlvd\./g, "bulevar"], [/\bAv\./g, "avenida"], [/\bFracc\./g, "fraccionamiento"], [/\bCol\./g, "colonia"], [/\bUaq\b/g, "UAQ"]];
// Lo urgente interrumpe lo que se esta diciendo; lo secundario espera su turno.
// Con la voz de Grieta apagada, lo que no se ve en pantalla se le pasa al lector de pantalla del telefono.
function detenerVoz() {
  if (grabacion || window.speechSynthesis?.speaking || window.speechSynthesis?.pending) ultimaVozDetenida = performance.now();
  turnoVoz++;
  grabacion?.pause();
  grabacion = null;
  finalizarLectura?.();
  finalizarLectura = null;
  colaVoz = Promise.resolve();
  if ("speechSynthesis" in window) speechSynthesis.cancel();
}
function vozEspanol(texto, alTerminar) {
  if (microfonoActivo || !acc.voz || !("speechSynthesis" in window)) return alTerminar?.();
  const u = new SpeechSynthesisUtterance(DECIR.reduce((t, [a, b]) => t.replace(a, b), texto));
  vozGrieta ??= speechSynthesis.getVoices().find((v) => v.lang === "es-MX") ?? speechSynthesis.getVoices().find((v) => v.lang.startsWith("es"));
  if (vozGrieta) u.voice = vozGrieta;
  u.lang = "es-MX";
  u.rate = acc.lenta ? 0.8 : 1;
  u.onend = u.onerror = alTerminar;
  speechSynthesis.speak(u);
}
function esperarVoz(texto) {
  if (!/[\p{L}\p{N}]/u.test(texto)) return Promise.resolve();
  return new Promise((resolve) => {
    const fin = () => { if (finalizarLectura === fin) finalizarLectura = null; resolve(); };
    finalizarLectura = fin;
    vozEspanol(texto, fin);
  });
}
function reproducirAudio(id) {
  return new Promise((resolve) => {
    const clip = new Audio(`audio/oto/${id}.mp3`);
    clip.playbackRate = acc.lenta ? 0.8 : 1;
    grabacion = clip;
    const fin = (reproducido = false) => {
      clip.onended = clip.onerror = null;
      if (grabacion === clip) grabacion = null;
      if (finalizarLectura === cancelar) finalizarLectura = null;
      resolve(reproducido);
    };
    const cancelar = () => fin(false);
    finalizarLectura = cancelar;
    clip.onended = () => fin(true);
    clip.onerror = cancelar;
    clip.play().catch(cancelar);
  });
}
async function leerGrabaciones(mensaje, turno) {
  let pendiente = "";
  const partes = [mensaje].flat(Infinity);
  for (const parte of partes) {
    if (turno !== turnoVoz) return;
    if (parte?.id && audiosOto.has(parte.id)) {
      await esperarVoz(pendiente);
      pendiente = "";
      if (turno !== turnoVoz) return;
      const reproducido = await reproducirAudio(parte.id);
      if (turno !== turnoVoz) return;
      // Los nombres, numeros y horas siempre se dicen en espanol despues de la grabacion.
      pendiente = reproducido ? [...FRASES[parte.id].matchAll(/\{(\w+)\}/g)].map((m) => parte.valores[m[1]] ?? "").join(", ") : textoFrase(parte);
    } else pendiente += textoFrase(parte);
  }
  if (turno === turnoVoz) await esperarVoz(pendiente);
}
function hablar(mensaje, enCola = false, enPantalla = false, soloEspanol = false) {
  if (microfonoActivo) return;
  const texto = textoFrase(mensaje);
  ultimoMensaje = mensaje;
  if (!acc.voz && acc.modoVoz && !enPantalla) {
    $("anuncio").textContent = "";
    const turno = turnoVoz;
    setTimeout(() => { if (!microfonoActivo && turno === turnoVoz) $("anuncio").textContent = texto; }, 60);
  }
  if (!acc.voz) return;
  if (!enCola) detenerVoz();
  if (!soloEspanol && acc.lengua === "oto" && lenguasDisponibles.includes("oto") && audiosOto.size) {
    const turno = turnoVoz;
    colaVoz = colaVoz.then(() => { if (turno === turnoVoz) return leerGrabaciones(mensaje, turno); }).catch(() => {});
  } else vozEspanol(texto);
}
async function prepararLenguas(config) {
  lenguasDisponibles = Array.isArray(config.lenguas) ? config.lenguas.filter((l) => l === "oto") : [];
  if (!lenguasDisponibles.length) return;
  if ("serviceWorker" in navigator) {
    try {
      const registro = await navigator.serviceWorker.ready;
      audiosOto = await new Promise((resolve) => {
        const canal = new MessageChannel();
        const fin = (ids) => { clearTimeout(limite); canal.port1.close(); resolve(new Set(ids)); };
        const limite = setTimeout(() => fin([]), 8000);
        canal.port1.onmessage = (e) => fin(Array.isArray(e.data) ? e.data : []);
        registro.active.postMessage({ tipo: "guardar-audios", ids: Object.keys(FRASES) }, [canal.port2]);
      });
    } catch {}
  } else {
    const disponibles = await Promise.all(Object.keys(FRASES).map(async (id) => {
      try {
        const respuesta = await fetch(`audio/oto/${id}.mp3`);
        return respuesta.ok ? id : null;
      } catch { return null; }
    }));
    audiosOto = new Set(disponibles.filter(Boolean));
  }
  actualizarFilasPerfil();
}
function vibrar(patron) {
  navigator.vibrate?.(patron);
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    let t = audio.currentTime;
    patron.forEach((ms, i) => {
      if (i % 2 === 0) {
        const o = audio.createOscillator();
        const g = audio.createGain();
        o.frequency.value = 880;
        g.gain.setValueAtTime(0.2, t);
        o.connect(g).connect(audio.destination);
        o.start(t);
        o.stop(t + Math.min(ms, 400) / 1000);
      }
      t += ms / 1000;
    });
  } catch {}
}
const avisar = (texto) => { $("estado").textContent = texto; };

// Ubicacion y lugares
const dentroDeQueretaro = (lat, lon) => Grieta.metros(lat, lon, QUERETARO[0], QUERETARO[1]) / 1000 <= RADIO_KM;
const esGps = (l) => l?.nombre === "Tu ubicación";

function poner(cual, lugar, sinNavegar = false) {
  if (cual === "destino") {
    cancelarDictado();
    if (cambioUbicacionGuardada) {
      guardarEdicionLugar(cambioUbicacionGuardada, lugar);
      cambioUbicacionGuardada = null;
      history.go(document.body.dataset.pantalla === "elegirMapa" ? -2 : -1);
      return;
    }
  }
  estado[cual] = lugar;
  if (cual === "destino" && estado.guardarComo) {
    const nombre = estado.guardarComo;
    estado.guardarComo = null;
    if (nombre === true) estado.pedirNombre = true;
    else guardarComo(nombre);
  }
  capas[cual]?.remove();
  capas[cual] = L.marker([lugar.lat, lugar.lon], { icon: icono(cual), keyboard: false }).addTo(mapa);
  if (cual === "origen") {
    $("desdeTexto").textContent = `Desde ${esGps(lugar) ? "tu ubicación" : lugar.nombre}`;
    $("cambiarDesde").textContent = "Cambiar";
  }
  if (sinNavegar) return;
  estado.editando = "hacia";
  if (estado.origen && estado.destino) return trazar();
  const enBuscar = document.body.dataset.pantalla === "buscar";
  if (cual === "destino") {
    // Sin origen todavia: el mismo buscador pregunta desde donde sale.
    mapa.setView([lugar.lat, lugar.lon], 14);
    if (!enBuscar) ir("buscar");
    prepararBuscar("desde");
    $("campoBuscar").focus();
    avisar(`Vas a ${lugar.nombre}. ¿Desde dónde sales?`);
    if (acc.modoVoz) hablar(`Vas a ${lugar.nombre}. No sé dónde estás. ${Reconocer ? "Toca el micrófono, arriba a la derecha, y di desde dónde sales después del tono." : "Escribe desde dónde sales."}`);
  } else if (enBuscar) {
    history.back();
  }
}

let revisionUbicacion = 0;
function ubicar(alTerminar, fresca = false) {
  const revision = ++revisionUbicacion;
  if (!navigator.geolocation) return sinUbicacion("Tu navegador no comparte la ubicación.", alTerminar);
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      if (revision !== revisionUbicacion) return;
      if (!dentroDeQueretaro(coords.latitude, coords.longitude)) return sinUbicacion("Estás fuera de Querétaro.", alTerminar);
      estado.gps = { nombre: "Tu ubicación", lat: coords.latitude, lon: coords.longitude, precision: coords.accuracy, instante: Date.now() };
      if (!estado.origen) {
        poner("origen", estado.gps, document.body.dataset.pantalla === "buscar");
        mapa.setView([coords.latitude, coords.longitude], 15);
      }
      alTerminar?.(true);
    },
    () => { if (revision === revisionUbicacion) sinUbicacion("No pude ver tu ubicación.", alTerminar); },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: fresca ? 0 : 60000 },
  );
}
function sinUbicacion(texto, alTerminar) {
  if (!estado.origen) $("desdeTexto").textContent = "Sin ubicación: elige desde dónde sales";
  $("cambiarDesde").textContent = estado.origen ? "Cambiar" : "Elegir";
  alTerminar?.(false);
}
$("cambiarDesde").addEventListener("click", () => abrirBuscar("desde"));

// Buscador
let recientes = leer("grieta-recientes", []);
function guardarReciente(l) {
  if (esGps(l)) return;
  recientes = [{ nombre: l.nombre, detalle: l.detalle ?? "", lat: l.lat, lon: l.lon, tipo: l.tipo }]
    .concat(recientes.filter((r) => r.nombre !== l.nombre || Grieta.metros(r.lat, r.lon, l.lat, l.lon) > 30)).slice(0, 5);
  escribir("grieta-recientes", recientes);
}

function prepararBuscar(modo) {
  estado.editando = modo;
  titulos.buscar = modo === "desde" ? "¿Desde dónde sales?" : "Buscar";
  $("tituloPantalla").textContent = titulos.buscar;
  $("campoBuscar").value = "";
  $("campoBuscar").placeholder = modo === "desde" ? "Desde dónde sales" : "Lugar o calle";
  // Al buscar a donde vas, arriba se ve desde donde sales y se puede cambiar
  $("filaDesde").hidden = modo === "desde";
  sugerir("");
}
function abrirBuscar(modo) {
  ir("buscar");
  prepararBuscar(modo);
  // En el mismo toque, para que el telefono abra el teclado.
  $("campoBuscar").focus();
}
$("abrirBuscar").addEventListener("click", () => abrirBuscar("hacia"));

const fichaLugar = (l, i, icon) => icon === "reloj" ? miniFicha("tono-obsidiana", ico("reloj"))
  : icon === "localizar" ? miniFicha("tono-maiz", picto("donde")) : miniFicha(tonoLugar(l.nombre, i, l.tipo), picto(iconoLugar(l.nombre, l.tipo)));
const filaLugar = (l, i, icon = "pin") => `<li><button type="button" data-i="${i}">
  ${fichaLugar(l, i, icon)}
  <span class="fila-texto"><strong translate="no">${escapar(l.nombre)}</strong>${l.detalle ? `<small translate="no">${escapar(l.detalle)}</small>` : ""}</span>
  ${ico("chevron", "chevron")}</button></li>`;

const cerca = () => estado.gps ?? estado.origen;
function conDistancia(l) {
  const c = cerca();
  if (!c || l.detalle) return l;
  const km = Grieta.metros(c.lat, c.lon, l.lat, l.lon) / 1000;
  return { ...l, detalle: km < 1 ? `A ${Math.round(km * 1000)} m` : `A ${km.toFixed(1)} km` };
}

let espera;
function sugerir(texto, alCompletar = null) {
  clearTimeout(espera);
  const lista = $("resultados");
  const vacio = texto.trim().length < 3;
  $("bloqueRecientes").hidden = !vacio || !recientes.length;
  $("tituloResultados").textContent = vacio ? "Lugares conocidos" : "Resultados";
  $("recientes").innerHTML = recientes.map((l, i) => filaLugar(l, i, "reloj")).join("");
  if (vacio) {
    const c = cerca();
    const base = lugares.map(conDistancia);
    if (c) base.sort((a, b) => Grieta.metros(c.lat, c.lon, a.lat, a.lon) - Grieta.metros(c.lat, c.lon, b.lat, b.lon));
    const fijos = (estado.editando === "desde" && estado.gps ? [{ ...estado.gps, detalle: "Donde estás ahora" }] : []).concat(base.slice(0, 6));
    estado.resultados = fijos;
    lista.innerHTML = fijos.map((l, i) => filaLugar(l, i, esGps(l) ? "localizar" : "pin")).join("") + filaMapa(false);
    return;
  }
  // Primero los lugares guardados y los de la app que coinciden; el buscador de mapas no siempre los conoce por su nombre completo.
  const buscado = sinAcentos(texto);
  const propios = [...guardados, ...lugares].filter((l) => sinAcentos(l.nombre).includes(buscado)).map(conDistancia);
  const pintarResultados = (res, vacio) => {
    estado.resultados = propios.concat(res).slice(0, 8);
    estado.buscado = true;
    lista.innerHTML = (estado.resultados.length ? estado.resultados.map((l, i) => filaLugar(l, i)).join("") : `<li class="vacio">${vacio}</li>`) + filaMapa();
    alCompletar?.(estado.resultados);
  };
  if (alCompletar && propios.length) {
    estado.resultados = propios.slice(0, 8);
    lista.innerHTML = estado.resultados.map((l, i) => filaLugar(l, i)).join("") + filaMapa();
  }
  espera = setTimeout(async () => {
    const c = cerca() ?? { lat: QUERETARO[0], lon: QUERETARO[1] };
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(texto)}&lat=${c.lat}&lon=${c.lon}&limit=6&bbox=-100.65,20.4,-100.15,20.9`;
    // Photon (OpenStreetMap) y la API de Grieta (Azure Maps, que conoce mas negocios y oficinas) a la vez.
    const [osm, azure] = await Promise.allSettled([
      fetch(url).then((r) => r.json()).then(({ features }) => features.map(({ properties: p, geometry: g }) => ({
        nombre: p.name ?? p.street ?? "Sin nombre",
        detalle: [p.street && p.name ? p.street : null, p.district ?? p.city].filter(Boolean).join(", "),
        lat: g.coordinates[1], lon: g.coordinates[0], tipo: p.osm_value,
      }))),
      texto.trim().length >= 4 ? llamar(`/buscar?q=${encodeURIComponent(texto.trim())}&lat=${c.lat}&lon=${c.lon}`) : Promise.resolve([]),
    ]);
    if (texto !== $("campoBuscar").value) return;
    const listas = [azure.status === "fulfilled" ? azure.value : [], osm.status === "fulfilled" ? osm.value : []];
    // Se alternan los dos y se quita un lugar si ya hay otro a menos de 80 m.
    const res = [];
    for (let i = 0; i < 6; i++) {
      for (const l of listas.map((x) => x[i]).filter(Boolean)) {
        if (![...propios, ...res].some((x) => Grieta.metros(x.lat, x.lon, l.lat, l.lon) < 80)) res.push(l);
      }
    }
    if (osm.status === "rejected" && azure.status === "rejected") {
      return pintarResultados([], "No hay conexión con el buscador. Elige un lugar guardado o elígelo en el mapa.");
    }
    pintarResultados(res, `No encontré "${escapar(texto)}". Prueba con la calle y la colonia, o elígelo en el mapa.`);
  }, alCompletar ? 0 : 350);
}
// El buscador de mapas no conoce todos los negocios y oficinas: siempre queda la opcion de elegir el punto.
function filaMapa(buscando = true) {
  return `<li class="fila-mapa"><button type="button" data-mapa>
  <span class="circulo tenue">${ico("pin")}</span>
  <span class="fila-texto"><strong>${buscando ? "¿No aparece? Elígelo en el mapa" : "Elegir en el mapa"}</strong><small>Tocas el punto y yo busco la calle</small></span>
  ${ico("chevron", "chevron")}</button></li>`;
}

function elegirEnMapa() {
  estado.eligiendo = estado.editando === "desde" ? "origen" : "destino";
  estado.puntoMapa = null;
  capas.punto?.remove();
  $("usarPunto").hidden = true;
  $("elegirTexto").textContent = `Mueve el mapa y toca dónde está ${estado.eligiendo === "origen" ? "el lugar de donde sales" : "el lugar a donde vas"}.`;
  ir("elegirMapa");
  const c = cambioUbicacionGuardada?.lugar ?? cerca() ?? estado.destino ?? { lat: QUERETARO[0], lon: QUERETARO[1] };
  setTimeout(() => mapa.setView([c.lat, c.lon], 15), 80);
}
$("usarPunto").addEventListener("click", () => {
  const lugar = estado.puntoMapa;
  if (!lugar) return;
  cancelarDictado();
  capas.punto?.remove();
  const cual = estado.eligiendo;
  estado.eligiendo = null;
  if (!cambioUbicacionGuardada) guardarReciente(lugar);
  poner(cual, lugar);
  // Si con este punto todavia falta el otro extremo del viaje, poner() ya llevo al buscador; si no, regresa al inicio.
  if (document.body.dataset.pantalla === "elegirMapa" && !(estado.origen && estado.destino)) ir("inicio", true);
});

function elegir(lugar) {
  if (!lugar) return;
  cancelarDictado();
  if (!cambioUbicacionGuardada) guardarReciente(lugar);
  poner(estado.editando === "desde" ? "origen" : "destino", lugar);
}
$("resultados").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (b?.hasAttribute("data-mapa")) return elegirEnMapa();
  if (b) elegir(estado.resultados?.[b.dataset.i]);
});
$("recientes").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (b) elegir(recientes[b.dataset.i]);
});
$("campoBuscar").addEventListener("input", (e) => { cancelarDictado(); sugerir(e.target.value); });
$("campoBuscar").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && estado.resultados?.length && e.target.value.trim().length >= 3) elegir(estado.resultados[0]);
});

mapa.on("click", async ({ latlng }) => {
  // Solo en "Elige en el mapa": en el inicio un toque sin querer cambiaba desde donde sales.
  if (document.body.dataset.pantalla !== "elegirMapa" || !dentroDeQueretaro(latlng.lat, latlng.lng)) return;
  const lugar = { nombre: "Punto en el mapa", lat: latlng.lat, lon: latlng.lng };
  capas.punto?.remove();
  capas.punto = L.marker([latlng.lat, latlng.lng], { icon: icono(estado.eligiendo), keyboard: false }).addTo(mapa);
  $("usarPunto").hidden = false;
  $("usarPunto").textContent = "Buscando la calle...";
  // Primero el nombre de la calle, para que el boton no diga "punto en el mapa".
  try {
    const r = await (await fetch(`https://photon.komoot.io/reverse?lat=${latlng.lat}&lon=${latlng.lng}&limit=1`)).json();
    const p = r.features[0]?.properties;
    lugar.nombre = p?.name ?? ([p?.street, p?.housenumber].filter(Boolean).join(" ") || lugar.nombre);
  } catch {}
  estado.puntoMapa = lugar;
  $("usarPunto").textContent = `Usar este punto: ${lugar.nombre}`;
});


// Ruta y opciones
async function trazar() {
  const { origen: o, destino: d } = estado;
  limpiarRuta(true);
  estado.momento = 0;
  estado.otra = null;
  estado.caminatas = { sube: new Map(), baja: new Map(), pedidas: new Set() };
  titulos.opciones = `A ${d.nombre}`;
  // Se pasa de una vez a Como llegar, con la forma de las tarjetas, mientras se pide la ruta por calles.
  ir("opciones", ["buscar", "elegirMapa"].includes(document.body.dataset.pantalla));
  esqueletoOpciones();
  let linea;
  let km = null;
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${o.lon},${o.lat};${d.lon},${d.lat}?overview=full&geometries=geojson`;
    const r = await (await fetch(url, { signal: AbortSignal.timeout(6000) })).json();
    km = r.routes[0].distance / 1000;
    linea = L.geoJSON(r.routes[0].geometry, { style: { color: tono("--ambar"), weight: 5, opacity: 0.95 } });
  } catch {
    linea = L.polyline([[o.lat, o.lon], [d.lat, d.lon]], { color: tono("--ambar"), weight: 4, dashArray: "4 8" });
  }
  // Si mientras tanto la persona se fue o eligio otro destino, esta ruta ya no se dibuja.
  if (estado.destino !== d) return;
  estado.kmCalle = km;
  capas.linea = linea.addTo(mapa);
  $("opciones").removeAttribute("aria-busy");
  calcular();
  animarTrazo(capas.linea);
  setTimeout(() => encuadrar(capas.linea.getBounds()), 120);
  if (acc.modoVoz) hablar(resumenOpciones(), true);
}

function esqueletoOpciones() {
  $("opciones").setAttribute("aria-busy", "true");
  $("appsRapido").innerHTML = '<span class="esqueleto corto"></span>'.repeat(3);
  $("tarjetas").innerHTML = '<span class="esqueleto"></span>'.repeat(2);
  $("llegadaApp").textContent = "Calculando...";
  $("respuestaEspera").textContent = "";
  $("ultimoCamion").hidden = true;
}

// La ruta se dibuja de inicio a fin; las lineas punteadas (caminar) y los puntos de parada se quedan como estan.
function animarTrazo(capa) {
  if (!capa || !suave()) return;
  for (const l of capa.getLayers ? capa.getLayers() : [capa]) {
    const el = l.getElement?.();
    if (!el || l instanceof L.CircleMarker || l.options.dashArray) continue;
    el.setAttribute("pathLength", "1");
    el.classList.add("ruta-dibujandose");
    el.addEventListener("animationend", () => { el.classList.remove("ruta-dibujandose"); el.removeAttribute("pathLength"); }, { once: true });
  }
}

// Lo que se dice al llegar a Como llegar en modo voz: el camino recomendado y la app mas barata.
function resumenOpciones() {
  const r = estado.r;
  const rec = estado.tarjetas?.[0]?.o;
  const app = [...r.directo.porApp].sort((a, b) => a.precio - b.precio)[0];
  const enApp = r.opciones.find((o) => o.tipo === "app");
  const criterios = criteriosViaje(r);
  const primero = `Para ir a ${estado.destino.nombre}, en app el menor precio estimado es ${Grieta.nombreApp(app.app)}, ${app.habitual ? "rango habitual " : ""}${rangoVoz(limitesPrecio(app))}` +
    (enApp ? `; llegas a las ${hora(llegada(enApp))}. ` : ". ");
  const comparacion = criterios.economica === criterios.rapida
    ? `${tituloOpcion(criterios.economica)} es la opción más económica y la más rápida, unos ${Math.round(criterios.rapida.minutos)} minutos. `
    : `La opción más económica es ${tituloOpcion(criterios.economica)}. La más rápida es ${tituloOpcion(criterios.rapida)}, unos ${Math.round(criterios.rapida.minutos)} minutos. `;
  if (!rec) return `${primero}${comparacion}Ahorita ningún camión te lleva.`;
  return `${primero}${comparacion}` +
    `En camión, ${tituloOpcion(rec)}, ${precioOpcionVoz(rec)} y llegas a las ${hora(llegada(rec))}. ` +
    "Toca una opción para escuchar los pasos.";
}

function limpiarRuta(soloMapa) {
  capas.linea?.remove();
  capas.linea = null;
  quitarTrazo();
  if (!soloMapa) {
    capas.destino?.remove();
    estado.destino = null;
  }
}

// Camino a pie por las calles con el ruteador peatonal de OpenStreetMap; si no responde, se queda la linea recta.
const caminos = new Map();
async function caminoAPie(a, b) {
  const clave = [a, b].map((x) => x.map((n) => n.toFixed(5)).join(",")).join(";");
  if (!caminos.has(clave)) {
    caminos.set(clave, fetch(`https://routing.openstreetmap.de/routed-foot/route/v1/driving/${a[1]},${a[0]};${b[1]},${b[0]}?overview=full&geometries=geojson`,
      { signal: AbortSignal.timeout(6000) })
      .then((r) => r.json())
      .then(({ routes: [r] }) => ({ puntos: r.geometry.coordinates.map(([lon, lat]) => [lat, lon]), metros: r.distance, minutos: r.duration / 60 }))
      .catch(() => { caminos.delete(clave); return null; }));
  }
  return caminos.get(clave);
}
async function seguirCalles(linea) {
  const pts = linea.getLatLngs().map((p) => [p.lat, p.lng]);
  const c = await caminoAPie(pts[0], pts.at(-1));
  if (c && linea._map) linea.setLatLngs(c.puntos);
  return c;
}

// El mapa se desliza hacia lo que toca ver, salvo para quien pidio menos movimiento en su telefono.
function suave() {
  return !matchMedia("(prefers-reduced-motion: reduce)").matches;
}
const encuadrar = (limites) => (!$("mapa").offsetHeight ? null : suave()
  ? mapa.flyToBounds(limites, { padding: [28, 28], duration: 0.6 })
  : mapa.fitBounds(limites, { padding: [28, 28] }));

function momentos() {
  const dia = hoyDia();
  const minuto = ahoraMin();
  const lista = ESPERAS.map((m) => ({ dia, minuto: minuto + m, etiqueta: m ? (m < 60 ? `En ${m} min` : "En 1 h") : "Ahora", corta: m ? (m < 60 ? `+${m} min` : "+1 h") : "Ahora" }));
  const diaOtra = estado.otra && estado.otra.dia !== hoyDia() ? `${DIAS[estado.otra.dia][0].toUpperCase()}${DIAS[estado.otra.dia].slice(1, 3)} ` : "";
  lista.push(estado.otra ? { ...estado.otra, etiqueta: `${diaOtra}${hora(estado.otra.minuto)}` } : { dia, minuto: minuto + 120, etiqueta: "Otra hora", vacia: true });
  return lista;
}
const normalizar = ({ dia, minuto }) => ({ dia: (dia + Math.floor(minuto / 1440)) % 7, minuto: minuto % 1440 });

function calcular() {
  if (!estado.origen || !estado.destino) return;
  const base = { origen: [estado.origen.lat, estado.origen.lon], destino: [estado.destino.lat, estado.destino.lon], kmCalle: estado.kmCalle };
  const lista = momentos();
  const precios = lista.map((m) => Grieta.cotizar({ ...base, ...m }));
  const r = Grieta.evaluar({
    ...base, ...normalizar(lista[estado.momento]),
    app: estado.app, precioVisto: Number($("precio").value), margen: estado.prisa, caminarMax: acc.camino ? 300 : undefined,
    tarifa: acc.unidos ? { pasaje: 2, transbordo: 0 } : undefined, caminatas: estado.caminatas,
  });
  estado.r = r;
  pintarOpciones(r);
  mostrarAPie();
  pintarEspera(lista, precios, base);
  if (estado.elegida && document.body.dataset.pantalla === "detalle") {
    // Al cambiar la hora o el precio, el detalle se rehace con el mismo tipo de camino.
    const igual = r.opciones.find((o) => tituloOpcion(o) === tituloOpcion(estado.elegida)) ?? (estado.elegida.tipo === "app" ? r.opciones.find((o) => o.tipo === "app") : null);
    if (igual) { estado.elegida = igual; pintarDetalle(true); }
  }
  pintarVeredicto(r);
  refinarCaminatas();
}

// Si el destino queda cerca, caminar tambien es una opcion y se dice antes que las apps y el camion.
function mostrarAPie() {
  const { origen: o, destino: d } = estado;
  const clave = `${o.lat},${o.lon};${d.lat},${d.lon}`;
  if (estado.aPie === clave) return;
  estado.aPie = clave;
  estado.minAPie = null;
  $("aPie").hidden = true;
  if (Grieta.metros(o.lat, o.lon, d.lat, d.lon) > 2000) return;
  caminoAPie([o.lat, o.lon], [d.lat, d.lon]).then((c) => {
    if (!c || estado.aPie !== clave || minutosCaminando(c.metros) > 25) return;
    // A quien le cuesta caminar no se le promete un tiempo: solo la distancia
    const camina = (acc.movilidad ?? "normal") === "normal";
    $("aPieTexto").textContent = camina ? `Caminando llegas en ${minutosCaminando(c.metros)} min` : `Queda a ${distanciaTexto(c.metros)} por calles`;
    $("aPieDetalle").textContent = camina ? `${distanciaTexto(c.metros, true)} por calles, sin costo` : "Si te sientes bien para ir a pie, no cuesta nada";
    $("aPie").hidden = false;
    // Con el tiempo a pie ya medido, se quitan los camiones que no llegan antes que caminando.
    if (camina) {
      estado.minAPie = minutosCaminando(c.metros);
      if (estado.r && estado.tarjetas?.some(({ o }) => o.minutos >= estado.minAPie)) pintarOpciones(estado.r);
    }
  });
}

// Los tramos a pie de las opciones se rehacen con la distancia real por calles; con eso se vuelve a calcular
// y, si caminando ya no alcanzas un camion, se toma el siguiente. Solo se piden las paradas que se usan.
async function refinarCaminatas() {
  const cam = estado.caminatas;
  if (!cam || !estado.r) return;
  const { origen: o, destino: d } = estado;
  const nuevas = [];
  for (const op of estado.r.opciones) {
    if (!op.paradas) continue;
    // Tambien las paradas a menos de 1 km a las que se llega en app: caminando quiza se alcanzan
    const cerca = (i, p) => Grieta.metros(p.lat, p.lon, ...Grieta.qrobus.paradas[i].slice(0, 2)) <= 1000;
    if (op.pasos[0].tipo === "caminar" || cerca(op.paradas.sube, o)) nuevas.push(["sube", op.paradas.sube, [o.lat, o.lon]]);
    if (op.pasos.at(-1).tipo === "caminar" || cerca(op.paradas.baja, d)) nuevas.push(["baja", op.paradas.baja, [d.lat, d.lon]]);
  }
  const faltan = nuevas.filter(([lado, i]) => !cam.pedidas.has(`${lado}:${i}`));
  if (!faltan.length) return;
  faltan.forEach(([lado, i]) => cam.pedidas.add(`${lado}:${i}`));
  const hechas = await Promise.all(faltan.map(([lado, i, punto]) => {
    const parada = Grieta.qrobus.paradas[i].slice(0, 2);
    return caminoAPie(...(lado === "sube" ? [punto, parada] : [parada, punto])).then((c) => c && cam[lado].set(i, c.metros));
  }));
  if (cam === estado.caminatas && hechas.some(Boolean)) calcular();
}

function tituloOpcion(o) {
  if (o.tipo === "app") return o.opcion.replace("Solo app (", "").replace(")", "");
  const lineas = o.pasos.filter((p) => p.tipo === "camion").map((p) => p.linea);
  const apps = o.pasos.filter((p) => p.tipo === "app").map((p) => Grieta.nombreApp(p.app));
  const camion = apps.length ? lineas.join(" + ") : `Qrobus ${lineas.join(" + ")}`;
  return o.pasos[0].tipo === "app" ? [apps[0], camion, ...apps.slice(1)].join(" + ") : [camion, ...apps].join(" + ");
}
const caminata = (o) => Math.round((o.pasos ?? []).filter((p) => p.tipo === "caminar").reduce((s, p) => s + p.min, 0));
// Solo camion lleva el camion en anil y la app el auto en verde
// Si combina, la ficha se alarga con un tramo por medio en el orden del viaje: auto + camion, camion + auto...
const fichaOpcion = (o) => {
  if (o.tipo === "app") return miniFicha("tono-hospital", picto("app"));
  const tramos = o.pasos.filter((p) => p.tipo !== "caminar").map((p) => (p.tipo === "app" ? "app" : "qrobus")).filter((t, i, a) => t !== a[i - 1]);
  if (tramos.length === 1) return miniFicha("tono-anil", picto("qrobus"));
  return `<span class="mini-ficha ficha-combinada" aria-hidden="true">${tramos.map((t) => `<span class="${t === "app" ? "tono-hospital" : "tono-anil"}">${picto(t)}</span>`).join("")}</span>`;
};

// Maximo tres caminos con camion: el mas barato, el mas rapido y uno equilibrado si es distinto.
// El viaje solo en app no lleva tarjeta: ya tiene su seccion con el precio de cada app.
// Las etiquetas se comparan contra todas las opciones, para no decir "mas rapido" si la app llega antes.
const valorOpcion = (o) => o.costo + 1.5 * o.minutos;
const menor = (ops, f) => ops.reduce((a, b) => (f(b) < f(a) ? b : a));
function elegirTarjetas(r) {
  // Un camion que no llega antes que caminando no se ofrece: caminar es gratis.
  const ops = r.opciones.filter((o) => o.tipo !== "app" && !(estado.minAPie && o.minutos >= estado.minAPie));
  if (!ops.length) return [];
  const lista = [];
  const agregar = (o, etiqueta) => {
    const ya = lista.find((x) => x.o === o);
    if (ya) ya.etiquetas.push(etiqueta);
    else lista.push({ o, etiquetas: [etiqueta] });
  };
  const criterios = criteriosViaje(r);
  const economica = [...ops].sort((a, b) => a.costo - b.costo || a.minutos - b.minutos)[0];
  agregar(economica, economica === criterios.economica ? "Más económica" : "Menor precio en Qrobus");
  if (criterios.rapida.tipo !== "app") agregar(criterios.rapida, "Más rápida");
  const equilibrada = menor(ops, valorOpcion);
  if (!lista.some((x) => x.o === equilibrada)) agregar(equilibrada, menor(r.opciones, valorOpcion).tipo === "app" ? "Otra opción" : "Recomendado");
  // Si quedan menos de tres, la siguiente mejor como alternativa.
  // Nunca una alternativa que otra opcion le gana en precio y en tiempo a la vez.
  const perdedora = (o) => r.opciones.some((x) => x !== o && x.costo <= o.costo && x.minutos <= o.minutos);
  // Ni una que cuesta mas que otra ya listada para llegar apenas unos minutos antes.
  const casiIgual = (o) => lista.some(({ o: x }) => x.costo < o.costo && x.minutos - o.minutos < 5);
  const resto = ops.filter((o) => !lista.some((x) => x.o === o) && !perdedora(o) && !casiIgual(o)).sort((a, b) => valorOpcion(a) - valorOpcion(b));
  if (lista.length < 3 && resto.length) agregar(resto[0], "Otra opción");
  // De noche no se deja caminar mucho al final: se ofrece bajar del camion y pedir app para la ultima parte.
  const hora = r.ctx.minuto % 1440;
  const caminaAlFinal = (o) => (o.pasos?.at(-1)?.tipo === "caminar" ? o.pasos.at(-1).min : 0);
  if ((hora >= 21 * 60 || hora < 6 * 60) && lista.some(({ o }) => caminaAlFinal(o) > 7)) {
    const noche = "De noche, sin caminar al final";
    const ya = lista.find(({ o }) => o.pasos?.at(-1)?.tipo === "app");
    const conAppAlFinal = ops.filter((o) => o.pasos?.at(-1)?.tipo === "app");
    if (ya) ya.etiquetas = [...ya.etiquetas.filter((e) => e !== "Otra opción"), noche];
    else if (conAppAlFinal.length) agregar(menor(conAppAlFinal, valorOpcion), noche);
  }
  // Siempre que exista, una tarjeta de solo camion aunque tarde mucho.
  const soloCamion = ops.filter((o) => o.tipo === "caminando+caminando");
  if (soloCamion.length && !lista.some((x) => x.o.tipo === "caminando+caminando")) agregar(menor(soloCamion, valorOpcion), "Otra opción");
  return lista;
}

const llegada = (o) => estado.r.ctx.minuto + o.minutos;

const rangoDePrecio = (x) => x.habitual ?? x;
const limitesPrecio = (x) => {
  const rango = rangoDePrecio(x);
  return { bajo: Math.floor(rango.bajo ?? x.precio), alto: Math.ceil(rango.alto ?? x.precio) };
};
const rangoTexto = (x) => `${pesos(x.bajo)}–${Math.round(x.alto)}`;
const rangoVoz = (x) => `entre ${Math.round(x.bajo)} y ${Math.round(x.alto)} pesos`;
const partesRango = (x) => `<span>${pesos(x.bajo)}</span><wbr><span>–${Math.round(x.alto)}</span>`;
function rangoTramo(o, p) {
  const tramo = p.hacia ? o.trazo.acceso : o.trazo.salida;
  return Grieta.cotizar({ origen: tramo.puntos[0], destino: tramo.puntos[1], dia: estado.r.ctx.dia, minuto: estado.r.ctx.minuto }).porApp.find((x) => x.app === p.app);
}
function rangoOpcion(o) {
  if (o.tipo === "app") return limitesPrecio(estado.r.directo.mejor);
  const apps = (o.pasos ?? []).filter((p) => p.tipo === "app");
  if (!apps.length) return null;
  // El total del motor ya viene redondeado; la tarifa del camion se suma antes de redondear el rango.
  const pasaje = acc.unidos ? 2 : Grieta.qrobus.pasaje;
  const fijo = pasaje + (acc.unidos ? 0 : pasaje / 2) * (o.transbordos ?? 0);
  const rangos = apps.map((p) => rangoDePrecio(rangoTramo(o, p)));
  return limitesPrecio({ bajo: fijo + rangos.reduce((s, x) => s + x.bajo, 0), alto: fijo + rangos.reduce((s, x) => s + x.alto, 0) });
}
function criteriosViaje(r) {
  return {
    economica: [...r.opciones].sort((a, b) => a.costo - b.costo || a.minutos - b.minutos)[0],
    rapida: [...r.opciones].sort((a, b) => a.minutos - b.minutos || a.costo - b.costo)[0],
  };
}
const precioOpcionTexto = (o) => { const rango = rangoOpcion(o); return rango ? `aprox. ${rangoTexto(rango)}` : pesos(o.costo); };
const precioOpcionVoz = (o) => { const rango = rangoOpcion(o); return rango ? `precio estimado ${rangoVoz(rango)}` : `${Math.round(o.costo)} pesos`; };

// CO₂ que emitiría un auto en el mismo viaje. 135.7 g/km es la meta para autos nuevos de pasajeros (año 2016)
// de la NOM-163-SEMARNAT-ENER-SCFI-2013: los autos que circulan emiten más, así que la cifra se queda corta.
const CO2_AUTO_G_KM = 135.7;
const sinAuto = (o) => o.tipo !== "app" && !o.pasos?.some((p) => p.tipo === "app");
const co2Auto = (km) => km * CO2_AUTO_G_KM;
const kgTexto = (g) => `${(g / 1000).toFixed(g < 9950 ? 1 : 0)} kg`;
// Lo que gastaria en su propio carro. Gasolina regular: mediana de 290 gasolineras de la zona metropolitana en los
// datos abiertos de la CRE (2026-11-05). Rendimiento: 17.3 km/L, meta de la NOM-163 para autos nuevos (135.7 g/km).
const GASOLINA_LITRO = 23.99;
const AUTO_KM_LITRO = 17.3;
const CENTRO_HISTORICO = [20.5928, -100.3911];
function pintarCarro(r) {
  const km = r.directo.km;
  const centro = Grieta.metros(estado.destino.lat, estado.destino.lon, ...CENTRO_HISTORICO) < 1200;
  $("enCarro").hidden = !(km > 0);
  $("enCarro").innerHTML = `${miniFicha("tono-obsidiana", picto("app"))}<span class="fila-texto">
    <strong>En tu carro: al menos ${pesos((km / AUTO_KM_LITRO) * GASOLINA_LITRO)} de gasolina${centro ? " más estacionamiento" : ""}</strong>
    <small id="carroDetalle">Gasolina regular a $23.99 el litro en Querétaro, según la CRE.</small></span>`;
  // Saliendo ahorita, cuanto tarda en auto con el trafico real (Azure Maps, desde la API)
  if (estado.momento !== 0) return;
  const { origen: o, destino: d } = estado;
  llamar(`/auto?olat=${o.lat}&olon=${o.lon}&dlat=${d.lat}&dlon=${d.lon}`).then(({ minutos, retraso }) => {
    if (estado.r !== r || !$("carroDetalle")) return;
    $("carroDetalle").textContent = `Con el tráfico de ahorita, ${minutos} min en auto${retraso >= 2 ? ` (${retraso} por tráfico)` : ""}. Gasolina regular a $23.99 el litro en Querétaro, según la CRE.`;
  }).catch(() => {});
}
// Pronostico por hora de Open-Meteo para el lugar de salida; si va a llover durante el viaje se avisa, y tambien si
// alguien reporto que la parada donde se sube no tiene techo.
const pronosticos = new Map();
async function avisarLluvia(r) {
  const aviso = $("avisoLluvia");
  aviso.hidden = true;
  const o = estado.tarjetas?.[0]?.o;
  const c = o?.pasos?.find((p) => p.tipo === "camion");
  if (!c || r.ctx.dia !== hoyDia() || r.ctx.minuto >= 1440) return;
  const { lat, lon } = estado.origen;
  const clave = `${lat.toFixed(2)},${lon.toFixed(2)},${new Date().toDateString()}`;
  if (!pronosticos.has(clave)) {
    pronosticos.set(clave, fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&hourly=precipitation_probability&timezone=America%2FMexico_City&forecast_days=1`)
      .then((x) => x.json()).then((x) => x.hourly.precipitation_probability).catch(() => { pronosticos.delete(clave); return null; }));
  }
  const probabilidad = await pronosticos.get(clave);
  if (!probabilidad || estado.r !== r) return;
  const desde = Math.floor(r.ctx.minuto / 60), hasta = Math.min(23, Math.floor((r.ctx.minuto + o.minutos) / 60));
  const horas = probabilidad.slice(desde, hasta + 1);
  const maxima = Math.max(...horas);
  if (!(maxima >= 50)) return;
  const cuando = desde + horas.indexOf(maxima);
  const reportes = await reportesCerca(c.recorrido[0].lat, c.recorrido[0].lon, 40);
  if (estado.r !== r) return;
  const sinTecho = reportes.some((x) => x.tipo === "sin_techo");
  aviso.innerHTML = `${ico("lluvia")}<span class="fila-texto"><strong>Puede llover a las ${hora(cuando * 60)} (${maxima} %).</strong>
    <small>${sinTecho ? `<span>Reportaron que la parada ${escapar(cruce(c.recorrido[0].nombre))} no tiene techo.</span> ` : ""}<span>Lleva paraguas.</span></small></span>`;
  aviso.hidden = false;
}
// Estaciona y sigue en Qrobus: para ir al Centro, dejar el carro en un estacionamiento junto a una parada y entrar en
// camion. Los estacionamientos salen de OpenStreetMap (scripts/estacionamientos.py); su horario y costo no se conocen.
let estacionamientos;
async function estacionaYSigue(r) {
  const caja = $("estacionaSigue");
  caja.hidden = true;
  const { origen: o, destino: d } = estado;
  const directo = Grieta.metros(o.lat, o.lon, d.lat, d.lon);
  if (Grieta.metros(d.lat, d.lon, ...CENTRO_HISTORICO) > 1200 || Grieta.metros(o.lat, o.lon, ...CENTRO_HISTORICO) < 4000) return;
  estacionamientos ??= fetch("datos/estacionamientos.json").then((x) => x.json()).catch(() => []);
  const lista = await estacionamientos;
  if (estado.r !== r) return;
  // En el camino: sin rodeo grande, lejos del destino para no entrar al Centro en carro y no pegado al origen.
  const candidatos = lista.map((e) => ({ ...e, ida: Grieta.metros(o.lat, o.lon, e.lat, e.lon), resta: Grieta.metros(e.lat, e.lon, d.lat, d.lon) }))
    .filter((e) => e.ida + e.resta <= directo * 1.2 && e.resta >= 2000 && e.ida >= 800)
    .sort((a, b) => a.ida + a.resta - (b.ida + b.resta)).slice(0, 6);
  let mejor = null;
  for (const e of candidatos) {
    const manejo = Math.round((e.ida * 1.3) / 1000 / 28 * 60) + 3;
    const ops = Grieta.evaluar({ origen: [e.lat, e.lon], destino: [d.lat, d.lon], dia: r.ctx.dia, minuto: r.ctx.minuto + manejo, caminarMax: acc.camino ? 300 : undefined, tarifa: acc.unidos ? { pasaje: 2, transbordo: 0 } : undefined }).opciones
      .filter((x) => x.tipo === "caminando+caminando");
    const bus = ops.length && menor(ops, (x) => x.minutos);
    if (bus && (!mejor || manejo + bus.minutos < mejor.total)) mejor = { e, bus, manejo, total: manejo + bus.minutos };
  }
  if (!mejor || estado.r !== r) return;
  const c = mejor.bus.pasos.find((p) => p.tipo === "camion");
  const gasolina = ((mejor.e.ida * 1.3) / 1000 / AUTO_KM_LITRO) * GASOLINA_LITRO;
  caja.innerHTML = `<span class="mini-ficha ficha-combinada" aria-hidden="true"><span class="tono-obsidiana">${picto("app")}</span><span class="tono-anil">${picto("qrobus")}</span></span>
    <span class="fila-texto"><strong>Estaciona y sigue en Qrobus: llegas ${hora(r.ctx.minuto + mejor.total)}</strong>
    <small><span>Deja el carro junto a la parada ${escapar(cruce(c.recorrido[0].nombre))} y toma la ${escapar(c.linea)}.</span> <span>Gasolina ${pesos(gasolina)} más ${pesos(mejor.bus.costo)} de camión, sin entrar al Centro.</span>
    <span>Estacionamiento según OpenStreetMap: confirma su horario y costo.</span></small></span>`;
  caja.hidden = false;
}
function pintarOpciones(r) {
  titulos.opciones = `A ${estado.destino.nombre}`;
  if (document.body.dataset.pantalla === "opciones") $("tituloPantalla").textContent = titulos.opciones;
  const ya = guardados.find((g) => Grieta.metros(g.lat, g.lon, estado.destino.lat, estado.destino.lon) < 30);
  $("guardarLugar").textContent = ya ? `Guardado como ${ya.nombre}` : "Guardar este lugar";
  $("guardarLugar").disabled = Boolean(ya);
  // Venía de "Agregar lugar": se abren los nombres para que elija cómo guardarlo
  if (estado.pedirNombre && !ya) {
    estado.pedirNombre = false;
    setTimeout(() => { $("guardarLugar").click(); $("nombresLugar").scrollIntoView({ block: "center", behavior: "smooth" }); }, 400);
  }
  // Solo cuando se eligio otra hora de salida: ahi importa saber que los precios no son de ahorita.
  const cuando = estado.momento === 0 ? "" : estado.momento < ESPERAS.length ? momentos()[estado.momento].etiqueta.toLowerCase() : `${r.ctx.dia === hoyDia() ? "hoy" : `el ${DIAS[r.ctx.dia]}`} a las ${hora(r.ctx.minuto)}`;
  $("resumenRuta").textContent = cuando ? `Saliendo ${cuando}` : "";
  $("resumenRuta").hidden = !cuando;
  // Los precios de las apps, a la vista sin tener que entrar a una opcion.
  const apps = [...r.directo.porApp].sort((a, b) => a.precio - b.precio);
  $("appsRapido").innerHTML = apps.map((x, i) => `<button type="button" class="app-rapida${i ? "" : " barata"}" data-app="${x.app}"
      aria-label="Abrir ${Grieta.nombreApp(x.app)}, precio estimado ${rangoVoz(limitesPrecio(x))}${i ? "" : ", la app más económica"}">
      <span class="app-cabeza">${fichaApp(x.app)}<span>${Grieta.nombreApp(x.app)}</span></span><strong class="precio-rango">${partesRango(limitesPrecio(x))}</strong><small${i ? ' class="vacio"' : ""}>Menor precio</small></button>`).join("");
  $("avisoRapido").textContent = "El costo es aproximado, confírmalo en la app.";
  const enApp = r.opciones.find((o) => o.tipo === "app");
  $("compararPrecio").hidden = !enApp;
  estado.tarjetas = elegirTarjetas(r);
  const criterios = criteriosViaje(r);
  const etiquetasApp = [criterios.economica === enApp && "Más económica", criterios.rapida === enApp && "Más rápida"].filter(Boolean);
  // La hora de llegada es lo primero que se lee; la duración y si es la más rápida van abajo, más chicas.
  $("llegadaApp").innerHTML = enApp ? `<strong>Llegas ${hora(llegada(enApp))}</strong>
    <span>${Math.round(enApp.minutos)} min de viaje</span>${etiquetasApp.map((t) => `<span class="marca-app">${t}</span>`).join("")}` : "";
  pintarCarro(r);
  estacionaYSigue(r);
  avisarLluvia(r);
  // Contra la app mas barata: cuanto ahorras y cuanto mas tardas yendo en camion.
  const appBarata = [...r.directo.porApp].sort((a, b) => a.precio - b.precio)[0];
  $("tarjetas").innerHTML = estado.tarjetas.map(({ o, etiquetas }, i) => {
    const pie = [`Llegas ${hora(llegada(o))}`, `${Math.round(o.minutos)} min`];
    if (caminata(o)) pie.push(`caminas ${caminata(o)} min`);
    const ahorro = appBarata.precio - o.costo;
    const mas = enApp ? Math.round(o.minutos - enApp.minutos) : 0;
    const ahorroTexto = ahorro >= 5 ? `Ahorras aprox. ${pesos(ahorro)}${mas > 0 ? ` · ${mas} min más que en app` : ""}` : "";
    const co2 = sinAuto(o) ? `En auto emitiría ${kgTexto(co2Auto(r.directo.km))} de CO₂` : "";
    // Tres datos grandes con su nombre arriba: se leen de un vistazo sin armar una oración.
    const datos = [["Llegas", hora(llegada(o)), ""], ahorro >= 5 && ["Ahorras", pesos(ahorro), " dato-ahorro"], caminata(o) && ["Caminas", `${caminata(o)} min`, ""]].filter(Boolean);
    const duracion = [`${Math.round(o.minutos)} min de viaje`, mas > 0 && `${mas} min más que en app`].filter(Boolean).join(" · ");
    const rango = rangoOpcion(o);
    return `<button type="button" class="tarjeta tarjeta-camion${etiquetas.includes("Recomendado") ? " principal" : ""}" data-i="${i}"
      aria-label="${escapar(`${etiquetas.join(" y ")}. ${tituloOpcion(o)}. ${pie.join(". ")}. ${precioOpcionVoz(o)}. ${co2 ? `${co2}. ` : ""}${ahorroTexto}`)}">
      <span class="tarjeta-cabeza">${fichaOpcion(o)}
        <span class="fila-texto">${etiquetas.length ? `<span class="etiqueta">${etiquetas.join(" · ")}</span>` : ""}<strong>${escapar(tituloOpcion(o))}</strong></span>
        <span class="precio${rango ? " precio-rango" : ""}">${rango ? `<small class="precio-nota">Aprox.</small>${partesRango(rango)}` : pesos(o.costo)}</span>${ico("chevron", "chevron")}</span>
      <span class="datos-viaje" aria-hidden="true">${datos.map(([nombre, valor, clase]) => `<span class="dato${clase}"><small>${nombre}</small><b>${valor}</b></span>`).join("")}</span>
      <span class="duracion" aria-hidden="true">${duracion}</span>
      ${co2 ? `<span class="co2" aria-hidden="true">${ico("planta")}<span>${co2}</span></span>` : ""}
    </button>`;
  }).join("");
  const hayCamion = r.opciones.some((o) => o.tipo !== "app");
  $("filaUnidos").hidden = !hayCamion;
  $("tituloCamion").hidden = !hayCamion && !r.pasaCerca;
  // Si el camion de la mejor opcion es de los ultimos del dia, se avisa a que hora pasa el ultimo.
  const conCamion = estado.tarjetas.map(({ o }) => o).find((o) => o.tipo !== "app");
  const c = conCamion?.pasos.find((p) => p.tipo === "camion");
  const quedan = c ? c.ultima - r.ctx.minuto : Infinity;
  $("ultimoCamion").hidden = !(quedan <= 120);
  if (quedan <= 120) {
    const app = [...r.directo.porApp].sort((x, y) => x.precio - y.precio)[0];
    $("ultimoCamion").innerHTML = `${ico("alerta")}<span class="fila-texto"><strong>Último ${escapar(c.linea)}: ${hora(c.ultima)} según el horario</strong>
      <small>En la parada ${escapar(cruce(c.recorrido[0].nombre))}, hacia ${escapar(c.hacia)}. Si lo pierdes, ${Grieta.nombreApp(app.app)} se estima en ${rangoTexto(limitesPrecio(app))}.</small></span>`;
  }
  if (hayCamion && !estado.tarjetas.length) $("tarjetas").innerHTML = `<p class="nota">Caminando llegas antes que en cualquier Qrobus.</p>`;
  // El camion va primero: Grieta busca que se use menos el auto.
  const camionPrimero = estado.tarjetas.length > 0;
  const bloqueCamion = ["tituloCamion", "ultimoCamion", "avisoLluvia", "tarjetas"].map($);
  if (camionPrimero) $("enApp").before(...bloqueCamion);
  else $("enApp").after(...bloqueCamion);
  $("opciones").classList.toggle("camion-primero", camionPrimero);
  if (!hayCamion) {
    $("tarjetas").innerHTML += `<p class="nota">${r.pasaCerca ? "Ningún Qrobus te lleva directo en la próxima hora." : "En la próxima hora no pasa ningún Qrobus cerca."}</p>`;
  }
}
$("tarjetas").addEventListener("click", (e) => {
  const t = e.target.closest(".tarjeta");
  if (t) abrirOpcion(t.dataset.i);
});
function abrirOpcion(i) {
  const { o, etiquetas } = estado.tarjetas[i];
  estado.elegida = o;
  estado.etiquetaElegida = etiquetas.join(" · ");
  titulos.detalle = tituloOpcion(o);
  ir("detalle");
  pintarDetalle();
  if (acc.modoVoz) leerDetalle();
}

function leerDetalle() {
  const o = estado.elegida;
  if (o.tipo !== "app") return hablar(`${pasosEnVoz(o)} Abajo está el botón Empezar viaje con avisos: tócalo y te guío hasta que te bajes.`);
  const apps = [...estado.r.directo.porApp].sort((a, b) => a.precio - b.precio);
  hablar(`${apps.every((x) => x.habitual) ? "Rangos habituales en app" : "Precios estimados en app"}: ${apps.map((x) => `${Grieta.nombreApp(x.app)}, ${rangoVoz(limitesPrecio(x))}`).join("; ")}. Toca el botón de la app para pedirla.`);
}

// Comparar lo que marca la app: lleva directo al detalle del viaje en app, con el campo del precio listo.
$("compararPrecio").addEventListener("click", () => {
  const o = estado.r.opciones.find((x) => x.tipo === "app");
  if (!o) return;
  estado.elegida = o;
  estado.etiquetaElegida = "En app";
  titulos.detalle = tituloOpcion(o);
  ir("detalle");
  pintarDetalle();
  if (!estado.app) {
    estado.app = [...estado.r.directo.porApp].sort((a, b) => a.precio - b.precio)[0].app;
    for (const x of $("appVista").children) x.setAttribute("aria-pressed", String(x.dataset.v === estado.app));
  }
  pintarEstimado();
  setTimeout(() => { $("hoja").scrollTop = 0; $("precio").focus({ preventScroll: true }); }, 150);
});

// Inicio de la franja de 3 horas que contiene ese minuto.
const inicioFranja = (minuto) => Math.max(...Grieta.CORTES.filter((c) => c * 60 <= minuto % 1440)) * 60;

function pintarEspera(lista, precios, base) {
  if (!$("horaLlegada").value) $("horaLlegada").value = Grieta.hhmm(Math.ceil((ahoraMin() + 60) / 5) * 5);
  if (!estado.otra) {
    const m = normalizar(lista.at(-1));
    $("dia").value = String(m.dia);
    $("hora").value = Grieta.hhmm(m.minuto);
  }
  const cercanos = precios.slice(0, ESPERAS.length).map((p) => p.mejor.precio);
  // Solo se resalta la hora mas barata si de verdad lo es: si todas cuestan lo mismo, ninguna.
  const minimo = Math.round(Math.min(...cercanos)) < Math.round(Math.max(...cercanos)) ? Math.min(...cercanos) : -1;
  $("horas").innerHTML = lista.map((m, i) => `
    <button type="button" data-i="${i}" aria-pressed="${i === estado.momento}" class="${i < ESPERAS.length && cercanos[i] === minimo ? "barata" : ""}"
      aria-label="${m.etiqueta}${m.vacia ? ", elegir día y hora" : `, precio aproximado ${Math.round(precios[i].mejor.precio)} pesos`}">
      <span>${m.corta ?? m.etiqueta}</span><strong>${m.vacia ? "+" : pesos(precios[i].mejor.precio)}</strong>${m.vacia ? "" : '<small class="precio-nota">Aprox.</small>'}
    </button>`).join("");
  // Lo que cambia es la franja de 3 horas del modelo, no el trafico de este momento.
  const ahora = cercanos[0];
  const mejor = cercanos.slice(1).reduce((a, p, i) => (p < a.p ? { p, i: i + 1 } : a), { p: Infinity, i: 0 });
  const peor = cercanos.slice(1).reduce((a, p, i) => (p > a.p ? { p, i: i + 1 } : a), { p: -Infinity, i: 0 });
  $("respuestaEspera").textContent = ahora - mejor.p >= 5
    ? `Sí: desde las ${hora(inicioFranja(lista[mejor.i].minuto))} lo normal baja ${pesos(ahora - mejor.p)}`
    : peor.p - ahora >= 5 ? `No: desde las ${hora(inicioFranja(lista[peor.i].minuto))} lo normal sube ${pesos(peor.p - ahora)}`
      : "Da igual: en la próxima hora lo normal casi no cambia";

  const hoy = lista[0];
  const tramos = [];
  for (let i = 0; i < Grieta.CORTES.length - 1; i++) {
    const [a, b] = [Grieta.CORTES[i] * 60, Grieta.CORTES[i + 1] * 60];
    if (b <= hoy.minuto) continue;
    tramos.push({ a, b, p: Grieta.cotizar({ ...base, dia: hoy.dia, minuto: Math.max(a, hoy.minuto) }).mejor.precio });
  }
  const barata = tramos.reduce((x, y) => (y.p < x.p ? y : x), tramos[0]);
  $("mejorHora").textContent = (!barata ? "" : barata.a <= hoy.minuto
    ? "Ahorita es la hora más barata de hoy. "
    : `Lo más barato hoy es de ${hora(barata.a)} a ${hora(barata.b)}: unos ${pesos(barata.p)}. `) +
    "Son precios normales según nuestros registros, no lo que marca la app en este momento.";
}
// "A que hora salgo": se prueba salir cada 5 minutos desde ahora (hasta 4 horas antes) y se queda la salida
// mas tarde que todavia llega a tiempo, en camion y en app.
function calcularSalida() {
  const [h, m] = ($("horaLlegada").value || "").split(":").map(Number);
  if (!Number.isFinite(h)) return void ($("salida").innerHTML = `<p class="nota">Elige a qué hora tienes que llegar.</p>`);
  const ahora = ahoraMin();
  const meta = h * 60 + m;
  if (meta <= ahora + 5) return void ($("salida").innerHTML = `<p class="nota">Esa hora ya pasó o no da tiempo de llegar. Elige una más tarde.</p>`);
  const base = {
    origen: [estado.origen.lat, estado.origen.lon], destino: [estado.destino.lat, estado.destino.lon], kmCalle: estado.kmCalle,
    dia: hoyDia(), caminarMax: acc.camino ? 300 : undefined, tarifa: acc.unidos ? { pasaje: 2, transbordo: 0 } : undefined,
    caminatas: estado.caminatas,
  };
  const aTiempo = [];
  const probar = (t) => {
    for (const o of Grieta.evaluar({ ...base, minuto: t }).opciones) {
      if (t + o.minutos <= meta) aTiempo.push({ t, o, conApp: o.tipo !== "app" && o.pasos.some((p) => p.tipo === "app") });
    }
  };
  // Primero cada 10 minutos; luego se prueba 5 minutos despues de la ultima salida que funciono, en camion y en app.
  for (let t = Math.max(ahora, meta - 240); t <= meta; t += 10) probar(t);
  const ultima = (enApp) => Math.max(-1, ...aTiempo.filter((x) => (x.o.tipo === "app") === enApp).map((x) => x.t));
  for (const t of new Set([ultima(false), ultima(true)])) if (t >= 0 && t + 5 <= meta) probar(t + 5);
  // En camion: primero los que no usan app; entre esos, el que deja salir mas tarde y luego el mas barato.
  const camion = aTiempo.filter((x) => x.o.tipo !== "app").sort((a, b) => a.conApp - b.conApp || b.t - a.t || a.o.costo - b.o.costo)[0];
  const app = aTiempo.filter((x) => x.o.tipo === "app").sort((a, b) => b.t - a.t)[0];
  if (!camion && !app) return void ($("salida").innerHTML = `<p class="nota">No encontré cómo llegar a esa hora desde ahora. Prueba una hora más tarde.</p>`);
  const bloque = (titulo, x, detalle) => `<div class="salida-opcion"><div class="salida-cabeza">${fichaOpcion(x.o)}
    <div><p class="etiqueta">${titulo}</p><p class="hora-salida">Sal a las ${hora(x.t)}</p></div></div><p>${detalle}</p>
    <button type="button" class="boton oscuro" data-salir="${x.t}">Ver esta ruta</button></div>`;
  $("salida").innerHTML =
    (camion ? bloque("En Qrobus", camion, `${escapar(tituloOpcion(camion.o))}, ${camion.conApp ? "aprox. " : ""}${pesos(camion.o.costo)}. Llegas a las ${hora(camion.t + camion.o.minutos)}.`) : "") +
    (app ? bloque("En app", app, `Pide ${escapar(tituloOpcion(app.o))}, unos ${pesos(app.o.costo)}. Llegas a las ${hora(app.t + app.o.minutos)}.`) : "");
  hablar([camion && `En camión, sal a las ${hora(camion.t)} y toma ${tituloOpcion(camion.o)}.`, app && `En app, pídela a las ${hora(app.t)}.`].filter(Boolean).join(" "), false, true);
}
$("calcularSalida").addEventListener("click", () => {
  $("salida").innerHTML = `<p class="nota">Calculando...</p>`;
  setTimeout(calcularSalida, 30);
});
// "Ver esta ruta" pone las opciones a esa hora de salida, igual que elegir otra hora en Conviene esperar.
$("salida").addEventListener("click", (e) => {
  const b = e.target.closest("[data-salir]");
  if (!b) return;
  const t = Number(b.dataset.salir);
  $("dia").value = String(hoyDia());
  $("hora").value = Grieta.hhmm(t);
  estado.otra = { dia: hoyDia(), minuto: t };
  estado.momento = ESPERAS.length;
  calcular();
  $("hoja").scrollTop = 0;
});

$("horas").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  estado.momento = Number(b.dataset.i);
  if (estado.momento === ESPERAS.length && !estado.otra) {
    const m = momentos().at(-1);
    $("dia").value = String((m.dia + Math.floor(m.minuto / 1440)) % 7);
    $("hora").value = Grieta.hhmm(m.minuto);
    leerOtra();
  }
  calcular();
  $("horas").querySelector(`[data-i="${estado.momento}"]`)?.focus();
});
function leerOtra() {
  const [h, m] = ($("hora").value || "12:00").split(":").map(Number);
  estado.otra = { dia: Number($("dia").value), minuto: h * 60 + m };
}
for (const id of ["dia", "hora"]) $(id).addEventListener("input", () => {
  leerOtra();
  estado.momento = ESPERAS.length;
  calcular();
});

// Detalle de un camino, con la hora de cada paso sacada de los mismos pasos.
function pasosDe(o) {
  if (o.tipo === "app") {
    const app = tituloOpcion(o);
    return [
      { ficha: ["tono-hospital", "app"], titulo: `Pide ${app}`, nota: `Precio estimado ${rangoVoz(rangoOpcion(o))}.`, hora: estado.r.ctx.minuto },
      { ficha: ["tono-casa", "lugar"], titulo: `Llegas a ${estado.destino.nombre}`, nota: `Unos ${Math.round(o.minutos)} minutos, contando la espera.`, hora: llegada(o) },
    ];
  }
  let t = estado.r.ctx.minuto;
  return o.pasos.map((p) => {
    const min = Math.max(1, Math.round(p.min));
    const inicio = p.tipo === "camion" ? p.sale : t;
    t = p.tipo === "camion" ? p.llega : t + p.min;
    const camina = ["tono-maiz", "caminar"];
    const enApp = ["tono-hospital", "app"];
    if (p.tipo === "caminar" && p.transbordo) return { ficha: camina, titulo: `Camina ${min} min y cambia de camión`, nota: p.parada, hora: inicio };
    if (p.tipo === "caminar") return p.hacia
      ? { ficha: camina, titulo: `Camina ${min} min a la parada`, nota: p.parada, hora: inicio }
      : { ficha: camina, titulo: `Camina ${min} min a tu destino`, nota: `${estado.destino.nombre}. Llegas a las ${hora(llegada(o))}.`, hora: inicio };
    if (p.tipo === "app") return p.hacia
      ? { ficha: enApp, titulo: `Pide ${Grieta.nombreApp(p.app)} hasta la parada`, nota: `${p.parada}. Precio estimado ${rangoVoz(limitesPrecio(rangoTramo(o, p)))}.`, hora: inicio }
      : { ficha: enApp, titulo: `Pide ${Grieta.nombreApp(p.app)} a tu destino`, nota: `Precio estimado ${rangoVoz(limitesPrecio(rangoTramo(o, p)))}. Llegas a las ${hora(llegada(o))}.`, hora: inicio };
    return { ficha: ["tono-anil", "qrobus"], camion: true, titulo: `Toma la línea ${p.linea} a las ${hora(p.sale)}`, nota: `Hacia ${p.hacia}. Bájate en ${p.baja}, ${p.paradas} paradas después, a las ${hora(p.llega)}. Te aviso antes.`, hora: inicio };
  });
}

function pintarDetalle(sinMapa) {
  const o = estado.elegida;
  const esApp = o.tipo === "app";
  $("tituloPantalla").textContent = titulos.detalle = esApp ? "Comparar precio" : tituloOpcion(o);
  $("bloqueCamion").hidden = esApp;
  $("bloqueApp").hidden = !esApp;
  if (esApp) {
    pintarApps(o);
    if (!sinMapa) { quitarTrazo(); if (capas.linea) setTimeout(() => encuadrar(capas.linea.getBounds()), 120); }
    return;
  }
  const etiqueta = estado.etiquetaElegida ?? "Recomendado";
  $("detalleEtiqueta").textContent = etiqueta === "Recomendado" ? "Ruta recomendada" : etiqueta;
  $("detalleCifra").textContent = `${Math.round(o.minutos)} min · ${precioOpcionTexto(o)}`;
  $("detalleLlegada").innerHTML = `Llegas <strong>${hora(llegada(o))}</strong>`;
  $("detalleCo2").hidden = !sinAuto(o);
  if (sinAuto(o)) $("co2Auto").textContent = kgTexto(co2Auto(estado.r.directo.km));
  $("pasos").innerHTML = pasosDe(o).map((p, i) => `<li class="${p.camion ? "camion" : ""}">
    ${miniFicha(p.ficha[0], picto(p.ficha[1]))}
    <span class="fila-texto"><strong>${escapar(p.titulo)}</strong><small>${escapar(cruce(p.nota))}</small></span>
    <span class="hora">${hora(p.hora)}</span></li>`).join("");
  if (!sinMapa) dibujar(o);
  avisarAcceso(o);
}

// Con silla de ruedas o andadera, avisa si alguien reporto que la parada de subida o bajada no tiene rampa,
// tiene la banqueta rota o un obstaculo.
const DIFICIL = ["sin_rampa", "banqueta", "obstaculo"];
async function avisarAcceso(o) {
  $("avisoAcceso").hidden = true;
  if (acc.movilidad !== "silla" || !o.paradas) return;
  const paradas = [o.paradas.sube, o.paradas.baja].map((i) => Grieta.qrobus.paradas[i]);
  const avisos = await Promise.all(paradas.map(([lat, lon]) => reportesCerca(lat, lon, 60)));
  if (estado.elegida !== o) return;
  const problemas = paradas.map(([, , nombre], k) => {
    const tipos = [...new Set(avisos[k].filter((a) => DIFICIL.includes(a.tipo)).map((a) => NOMBRES_REPORTE[a.tipo].toLowerCase()))];
    return tipos.length ? `${cruce(nombre)}: ${tipos.join(", ")}` : null;
  }).filter(Boolean);
  if (!problemas.length) return;
  $("avisoAcceso").innerHTML = `${ico("alerta")}<span class="fila-texto"><strong>Cuidado con la accesibilidad</strong><small>${problemas.map(escapar).join(". ")}.</small></span>`;
  $("avisoAcceso").hidden = false;
  hablar(frase("acceso", { problemas: problemas.join(". ") }), true, true);
}

function pintarApps(o) {
  const r = estado.r;
  const orden = [...r.directo.porApp].sort((a, b) => a.precio - b.precio);
  pintarEstimado();
  // Una fila por app que tambien la abre, la mas barata primero.
  $("abrirApps").innerHTML = orden.map((x, i) => `<button type="button" class="app-fila${i ? "" : " barata"}" data-app="${x.app}"
      aria-label="Abrir ${Grieta.nombreApp(x.app)}, precio estimado ${rangoVoz(limitesPrecio(x))}${i ? "" : ", la app más económica"}">
      ${fichaApp(x.app)}<span class="fila-texto"><strong>Abrir ${Grieta.nombreApp(x.app)}</strong><small>${i ? "Precio estimado" : "Menor precio en app"}</small></span>
      <span class="precio precio-rango">${partesRango(limitesPrecio(x))}</span>${ico("chevron", "chevron")}</button>`).join("");
  $("appAviso").textContent = "";
}

$("empezar").addEventListener("click", () => iniciarGuia(estado.elegida));
// Cada paso dicho como dos oraciones, con su punto, para que la voz haga la pausa.
const conPunto = (t) => (/[.!?]$/.test(t) ? t : `${t}.`);
const pasosEnVoz = (o) => pasosDe(o).map((p) => `${conPunto(p.titulo)} ${conPunto(p.nota)}`).join(" ");
$("escuchar").addEventListener("click", () => hablar(pasosEnVoz(estado.elegida)));

// Botones de una sola eleccion: la app que te dio precio y que tanta prisa tienes.
function segmentado(id, alElegir) {
  $(id).addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    for (const x of $(id).children) x.setAttribute("aria-pressed", String(x === b));
    alElegir(b.dataset.v);
    calcular();
  });
}
// Lo que Grieta estima para la app elegida, junto al campo, para comparar sin buscarlo.
function pintarEstimado() {
  const x = estado.r?.directo.porApp.find((a) => a.app === estado.app);
  $("estimadoApp").textContent = x ? `Grieta estima ${Grieta.nombreApp(x.app)} en ${rangoTexto(limitesPrecio(x))}.` : "";
}
segmentado("appVista", (v) => { estado.app = v; pintarEstimado(); if (!$("precio").value) $("precio").focus(); });
segmentado("prisa", (v) => { estado.prisa = Number(v); verVeredicto(); });
$("precio").addEventListener("input", calcular);
// La recomendacion sale abajo del campo y con el teclado abierto queda tapada: al terminar de escribir se trae a la vista
function verVeredicto() {
  if (Number($("precio").value) > 0 && estado.app) setTimeout(() => $("veredicto").scrollIntoView({ block: "nearest", behavior: "smooth" }), 80);
}
$("precio").addEventListener("change", verVeredicto);
$("precio").addEventListener("keydown", (e) => { if (e.key === "Enter") e.target.blur(); });

function pintarVeredicto(r) {
  const d = r.decision;
  $("compartirPrecio").hidden = !d || !API;
  $("gracias").textContent = "";
  if (!d) {
    $("veredicto").innerHTML = estado.app || Number($("precio").value) > 0 ? `<p class="nota">Elige la app y escribe el precio para darte una recomendación.</p>` : "";
    return;
  }
  const visto = d.esperado.precio * d.relacion;
  const sigFranja = Grieta.CORTES.find((c) => c * 60 > r.ctx.minuto);
  const porque = d.accion === "esperar"
    ? ` Está arriba de lo normal y te sobra tiempo: vuelve a revisar en unos minutos${sigFranja < 24 ? `; lo normal cambia de franja a las ${hora(sigFranja * 60)}` : ""}.`
    : "";
  // Se compara contra el modelo; no se conoce la demanda real de cada app.
  const otra = r.directo.porApp.filter((x) => x.app !== d.esperado.app).sort((x, y) => x.precio - y.precio)[0];
  const alta = d.relacion >= 1.4
    ? ` <strong>Revisa otra app antes de pedir.</strong>${otra && otra.precio < visto * 0.85 ? ` ${Grieta.nombreApp(otra.app)} se estima en ${rangoTexto(limitesPrecio(otra))}.` : ""}`
    : "";
  const candidatas = (estado.tarjetas ?? []).map(({ o }, i) => ({ o, i })).filter(({ o }) => o.costo <= visto * 0.7);
  const camion = d.accion === "camion" ? candidatas.sort((a, b) => a.o.minutos - b.o.minutos || a.o.costo - b.o.costo)[0] : null;
  const extra = camion ? camion.o.minutos - (r.opciones.find((o) => o.tipo === "app")?.minutos ?? r.directo.minutos) : d.extra;
  $("veredicto").innerHTML = `
    <div class="recomendacion">
      <p class="etiqueta">Recomendación</p>
      <p class="veredicto">${ico(SIMBOLOS[d.accion], "simbolo")}${ACCIONES[d.accion]}</p>
      <p>${Grieta.nombreApp(d.esperado.app)} te marca ${pesos(visto)}. Nuestro rango estimado es ${rangoTexto(limitesPrecio(d.esperado))}.${alta}${porque}
        ${d.accion === "camion" && extra < 1e8 ? `El camión tarda ${Math.round(extra)} min más, pero te ahorras la diferencia.` : ""}</p>
      ${camion ? `<button type="button" class="boton ver-camion" data-i="${camion.i}">${ico("camion")}Ver cómo ir en ${escapar(tituloOpcion(camion.o))}</button>` : ""}
      <p class="reglas">${d.activas.some((a) => a.accion === d.accion)
        ? `Porque ${escapar(d.activas.find((a) => a.accion === d.accion).texto)}.`
        : "El precio no está tan arriba o el camión tarda demasiado."}</p>
    </div>`;
}
$("veredicto").addEventListener("click", (e) => {
  const b = e.target.closest(".ver-camion");
  if (b) abrirOpcion(b.dataset.i);
});

const enlaceUber = () => {
  const { origen: o, destino: d } = estado;
  const q = new URLSearchParams({
    action: "setPickup",
    "pickup[latitude]": o.lat, "pickup[longitude]": o.lon, "pickup[nickname]": o.nombre,
    "dropoff[latitude]": d.lat, "dropoff[longitude]": d.lon, "dropoff[nickname]": d.nombre,
  });
  return `https://m.uber.com/ul/?${q}`;
};

// Uber abre con el viaje ya puesto. DiDi e inDrive no publican un enlace asi: se copia el destino y se abre su app.
const TIENDAS = {
  didi: { ios: "https://apps.apple.com/app/id1362398401", android: "com.didiglobal.passenger" },
  indrive: { ios: "https://apps.apple.com/app/id780125801", android: "sinet.startup.inDriver" },
};
async function abrirApp(e) {
  const b = e.target.closest("[data-app]");
  if (!b) return;
  const app = b.dataset.app;
  if (app === "uber") return void open(enlaceUber(), "_blank", "noopener");
  const destino = estado.destino.nombre;
  let copiado = true;
  try { await navigator.clipboard.writeText(destino); } catch { copiado = false; }
  // DiDi e inDrive se abren desde su pagina en la tienda: ahi aparece el boton Abrir si ya estan instaladas.
  const aviso = (copiado ? `Copié "${destino}". ` : "") + `Te llevo a ${Grieta.nombreApp(app)}: en la tienda toca Abrir y ` +
    (copiado ? "pega el destino." : `escribe como destino ${destino}.`);
  for (const id of ["appAviso", "avisoRapido"]) $(id).textContent = aviso;
  hablar(aviso, false, true);
  const t = TIENDAS[app];
  // En Android se abre la app si esta instalada y si no, su pagina en Play; en iPhone, su pagina en la App Store tiene el boton Abrir.
  const destinoApp = /android/i.test(navigator.userAgent)
    ? `intent://#Intent;package=${t.android};S.browser_fallback_url=${encodeURIComponent(`https://play.google.com/store/apps/details?id=${t.android}`)};end`
    : t.ios;
  setTimeout(() => { location.href = destinoApp; }, 1500);
}
$("abrirApps").addEventListener("click", abrirApp);
$("appsRapido").addEventListener("click", abrirApp);

function quitarTrazo() {
  capas.camion?.remove();
  capas.camion = null;
  capas.linea?.setStyle?.({ opacity: 0.95 });
}

// Camino con camion en el mapa: caminata punteada, app en linea delgada y el camion por sus paradas.
function dibujar(o) {
  quitarTrazo();
  const tinta = tono("--tinta");
  const ambar = tono("--ambar");
  const estilo = (modo) => (modo === "caminando" ? { color: tinta, weight: 3, dashArray: "1 7", lineCap: "round" } : { color: tinta, weight: 2, opacity: 0.7 });
  capas.linea?.setStyle?.({ opacity: 0.15 });
  const camiones = o.trazo.camiones;
  const lineas = o.pasos.filter((p) => p.tipo === "camion").map((p) => p.linea);
  const capasCamion = camiones.flatMap((c, k) => [
    L.polyline(c, { color: ambar, weight: 5, tono: "linea" }),
    ...(k > 0 ? [L.polyline([camiones[k - 1].at(-1), c[0]], estilo("caminando"))] : []),
    // Un punto chico por cada parada del camino, para ver cuantas faltan.
    ...c.slice(1, -1).map((x) => L.circleMarker(x, { radius: 2.5, color: ambar, weight: 1, fillColor: tono("--fondo"), fillOpacity: 1, tono: "linea" })),
    ...[c[0], c.at(-1)].map((x, j) => L.circleMarker(x, { radius: 6, color: tono("--fondo"), weight: 2, fillColor: ambar, fillOpacity: 1, tono: "punto" })
      .bindTooltip(j ? `Bajas aquí` : `Subes a la ${lineas[k] ?? ""}`, { permanent: true, direction: j ? "bottom" : "top", offset: [0, j ? 8 : -8], className: "etiqueta-mapa" })),
  ]);
  const acceso = L.polyline(o.trazo.acceso.puntos, estilo(o.trazo.acceso.modo));
  const salida = L.polyline(o.trazo.salida.puntos, estilo(o.trazo.salida.modo));
  capas.camion = L.featureGroup([acceso, ...capasCamion, salida]).addTo(mapa);
  // Todo tramo a pie (punteado), incluido el de un transbordo, sigue las calles.
  capas.camion.eachLayer((l) => { if (l.options.dashArray) seguirCalles(l); });
  animarTrazo(capas.camion);
  setTimeout(() => encuadrar(capas.camion.getBounds()), 120);
}

// Al cambiar de tema, lo que ya esta dibujado toma los colores nuevos.
function recolorear() {
  if (typeof mapa === "undefined") return;
  const ambar = tono("--ambar");
  capas.linea?.setStyle?.({ color: ambar });
  capas.camion?.eachLayer((c) => c.setStyle(c.options.tono === "linea" ? { color: ambar } : c.options.tono === "punto" ? { fillColor: ambar } : { color: tono("--tinta") }));
}

// Paradas en lo que se ve del mapa: se piden al mover o acercar, solo de cerca y con tope, para no cargar la ciudad entera.
const MAX_PARADAS_VISTA = 60;
function pintarParadasEnVista() {
  const pantalla = document.body.dataset.pantalla;
  if (pantalla !== "camiones" && pantalla !== "ubicacion") return;
  capas.vista?.remove();
  capas.vista = null;
  if (mapa.getZoom() < 15 || !Grieta.qrobus) return;
  const area = mapa.getBounds().pad(0.1);
  const centro = mapa.getCenter();
  const yaPintadas = new Set(pantalla === "camiones" ? (estado.listaCamiones ?? []).map((x) => x.i) : []);
  const visibles = [];
  Grieta.qrobus.paradas.forEach(([lat, lon, nombre], i) => {
    if (!yaPintadas.has(i) && area.contains([lat, lon])) visibles.push({ i, nombre, lat, lon, m: Grieta.metros(centro.lat, centro.lng, lat, lon) });
  });
  visibles.sort((a, b) => a.m - b.m);
  capas.vista = L.layerGroup(visibles.slice(0, MAX_PARADAS_VISTA).map((x) => {
    const m = L.marker([x.lat, x.lon], { icon: Grieta.tieneRecorridos(x.i) ? iconoParada(false) : iconoParadaSinHorario, keyboard: false });
    if (pantalla === "camiones" && estado.puntoCamiones) m.on("click", () => elegirParadaDelMapa(x));
    else if (estado.gps) m.on("click", () => abrirParadaDesdeAqui(x));
    return m;
  })).addTo(mapa);
}
let esperaVista;
mapa.on("moveend", () => { clearTimeout(esperaVista); esperaVista = setTimeout(pintarParadasEnVista, 250); });
// Desde Dónde estoy, tocar una parada abre sus camiones con el camino a pie ya trazado.
function abrirParadaDesdeAqui(x) {
  const punto = estado.gps;
  revisionCamiones++;
  estado.recomendacionAnunciada = null;
  encuadreParadas = null;
  ir("camiones");
  $("camionesUbicacion").textContent = "";
  const p = { ...x, m: Grieta.metros(punto.lat, punto.lon, x.lat, x.lon), lineas: Grieta.horariosParadaPorIndice(x.i, hoyDia(), ahoraMin()) };
  pintarCamiones(punto, [p], false, true);
}
// Una parada tocada en el mapa pasa a ser la elegida, con su camino a pie y sus camiones.
function elegirParadaDelMapa(x) {
  const punto = estado.puntoCamiones;
  const p = { ...x, m: Grieta.metros(punto.lat, punto.lon, x.lat, x.lon), lineas: Grieta.horariosParadaPorIndice(x.i, hoyDia(), ahoraMin()) };
  revisionCamiones++;
  pintarCamiones(punto, [p, ...(estado.listaCamiones ?? []).filter((o) => o.i !== x.i)], false, true);
  $("hoja").scrollTop = 0;
}

const iconoParadaSinHorario = L.divIcon({ className: "", iconSize: [30, 30], html: `<span class="parada-mapa sin-horario">${ico("camion")}</span>` });
// Camiones cerca
const iconoParada = (cerca) => L.divIcon({ className: "", iconSize: cerca ? [38, 38] : [30, 30],
  html: `<span class="parada-mapa${cerca ? " cerca" : ""}">${ico("camion")}</span>` });
// Las paradas en el mapa: tu ubicacion, la mas cercana resaltada con el camino a pie y las demas; tocar una baja a sus camiones.
let encuadreParadas = null;
function pintarParadas(punto, lista, seleccionada = false) {
  capas.paradas?.remove();
  const marcas = lista.map((x, i) => {
    const m = L.marker([x.lat, x.lon], { icon: iconoParada(i === 0), keyboard: false, zIndexOffset: i === 0 ? 500 : 0 });
    m.on("click", () => {
      if (i === 0) return void ($("hoja").scrollTop = 0);
      elegirParada(punto, lista, i);
    });
    if (i === 0) m.bindTooltip(seleccionada ? "Elegida" : "Más cercana", { permanent: true, direction: "top", offset: [0, -20], className: "etiqueta-mapa" });
    return m;
  });
  const aPie = L.polyline([[punto.lat, punto.lon], [lista[0].lat, lista[0].lon]], { color: tono("--tinta"), weight: 3, dashArray: "1 7", lineCap: "round" });
  capas.paradas = L.featureGroup([aPie, ...marcas]).addTo(mapa);
  // Se encuadra tu camino a la parada más cercana, y solo cuando cambia, para que el mapa no brinque.
  const clave = `${punto.lat},${punto.lon},${lista[0].lat},${lista[0].lon}`;
  if (clave !== encuadreParadas) {
    encuadreParadas = clave;
    setTimeout(() => encuadrar(L.latLngBounds([[punto.lat, punto.lon], [lista[0].lat, lista[0].lon]])), 120);
  }
  const revision = revisionCamiones;
  seguirCalles(aPie).then(c => {
    if (revision === revisionCamiones && document.body.dataset.pantalla === 'camiones' && estado.listaCamiones?.[0] === lista[0]) ponerCaminata(lista[0], c?.metros, seleccionada);
  });
}
// La distancia real a pie llega despues que la pantalla: se pone y se dice una sola vez
function ponerCaminata(p, metros, seleccionada = false) {
  if (!$("distanciaParada")) return;
  if (!metros) {
    if (p.caminado) return;
    $("caminaParada").textContent = "No pude calcular el camino a pie.";
    $("caminaDetalle").textContent = `A ${distanciaTexto(p.m, true)} en línea recta`;
    return;
  }
  p.caminado = metros;
  const [texto, detalle] = textoCaminata(metros);
  $("caminaParada").textContent = texto;
  $("caminaDetalle").textContent = detalle;
  actualizarComparacionParadas(estado.listaCamiones ?? []);
  if (!p.dicho) hablar(`Caminando son ${distanciaTexto(metros)}, unos ${minutosCaminando(metros)} minutos.`, true);
  p.dicho = true;
}
// A quien le cuesta caminar no se le promete un tiempo, igual que en las opciones de viaje
function textoCaminata(metros) {
  return (acc.movilidad ?? "normal") === "normal"
    ? [`Caminando llegas en ${minutosCaminando(metros)} min`, `${distanciaTexto(metros, true)} por calles, sin costo`]
    : [`Queda a ${distanciaTexto(metros)} por calles`, "Si te sientes bien para ir a pie, no cuesta nada"];
}
// 250 metros, 1.2 kilómetros: redondeado como lo diría una persona
const distanciaTexto = (m, corta = false) => m < 1000
  ? `${Math.max(10, Math.round(m / 10) * 10)} ${corta ? "m" : "metros"}`
  : `${(m / 1000).toFixed(1).replace(".0", "")} ${corta ? "km" : "kilómetros"}`;
const minutosCaminando = (m) => Math.max(1, Math.round(m / 1000 / 4.5 * 60));
const enCuanto = (min) => { const f = Math.round(min - ahoraMin()); return f <= 0 ? "ya debe pasar" : f < 60 ? `en ${f} min` : `en ${Math.floor(f / 60)} h ${f % 60} min`; };
let revisionCamiones = 0;
$("pasanAqui").addEventListener("click", () => abrirCamiones());
function abrirCamiones() {
  const revision = ++revisionCamiones;
  estado.recomendacionAnunciada = null;
  encuadreParadas = null;
  ir("camiones");
  const caja = $("camionesContenido");
  caja.innerHTML = `<p class="texto">Actualizando tu ubicación…</p>`;
  $("camionesUbicacion").textContent = "";
  ubicar(encontrada => {
    if (revision !== revisionCamiones || document.body.dataset.pantalla !== 'camiones') return;
    const punto = encontrada ? estado.gps : estado.origen && !esGps(estado.origen) ? estado.origen : null;
    if (punto) {
      // Solo se avisa cuando no salió de tu ubicación; si salió bien no hace falta decirlo
      $("camionesUbicacion").textContent = encontrada ? "" : `Paradas desde el punto elegido: ${punto.nombre}. No pude actualizar tu ubicación.`;
      return cargarCamiones(punto);
    }
    caja.innerHTML = `<p class="texto">No pude actualizar tu ubicación. Actívala o elige desde dónde sales.</p>
      <button id="elegirUbicacionCamiones" type="button" class="boton oscuro">Elegir desde dónde sales</button>`;
    $("elegirUbicacionCamiones").addEventListener("click", () => abrirBuscar("desde"));
    hablar("No pude actualizar tu ubicación. Puedes elegir desde dónde sales.");
  }, true);
}
// Al volver a la app con esta pestaña abierta, la ubicación se actualiza sola
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && document.body.dataset.pantalla === "camiones") abrirCamiones();
});
function cargarCamiones(punto) {
  const caja = $("camionesContenido");
  // Se sugieren solo paradas con camiones registrados; las oficiales sin horario se ven en el mapa.
  const lista = Grieta.paradasCercanas(punto.lat, punto.lon, 1000, 12).filter((p) => Grieta.tieneRecorridos(p.i)).slice(0, 3).map(p => ({ ...p, lineas: Grieta.horariosParadaPorIndice(p.i, hoyDia(), ahoraMin()) }));
  if (!lista.length) {
    caja.innerHTML = `<p class="texto">No encontré paradas en el catálogo a menos de un kilómetro. Puede haber otras paradas que todavía no aparecen aquí.</p>`;
    return hablar("No encontré paradas en el catálogo a menos de un kilómetro. Puede haber otras paradas que todavía no aparecen aquí.");
  }
  pintarCamiones(punto, lista, true);
  ordenarPorCaminata(punto, lista);
}

function elegirParada(punto, lista, indice) {
  revisionCamiones++;
  const orden = [lista[indice], ...lista.filter((_, i) => i !== indice)];
  pintarCamiones(punto, orden, false, true);
  $("hoja").scrollTop = 0;
}

function compararParadas(lista) {
  const minuto = ahoraMin();
  const faltantes = [];
  const opciones = lista.map((parada, indice) => {
    if (!Number.isFinite(parada.caminado)) {
      faltantes.push(`${cruce(parada.nombre)}: camino a pie`);
      return null;
    }
    const caminata = minutosCaminando(parada.caminado);
    const llegada = minuto + caminata;
    const lineas = Number.isSafeInteger(parada.i) ? Grieta.horariosParadaPorIndice(parada.i, hoyDia(), llegada) : Grieta.horariosParada(parada.lat, parada.lon, hoyDia(), llegada);
    const salidas = lineas.flatMap((linea) => linea.horas).filter((hora) => Number.isFinite(hora));
    if (!salidas.length) {
      faltantes.push(`${cruce(parada.nombre)}: próximo horario`);
      return null;
    }
    const salida = Math.min(...salidas);
    const espera = Math.max(0, Math.ceil(salida - llegada));
    return { parada, indice, caminata, espera, total: caminata + espera, salida };
  }).filter(Boolean).sort((a, b) => a.total - b.total || a.caminata - b.caminata || a.parada.m - b.parada.m);
  return { opciones, faltantes };
}

function actualizarComparacionParadas(lista) {
  const caja = $("comparacionParadas");
  if (!caja) return;
  const { opciones, faltantes } = compararParadas(lista);
  if (!opciones.length) {
    caja.innerHTML = `<p class="nota">Todavía no puedo comparar estas paradas:</p><ul>${faltantes.map((x) => `<li>${escapar(x)}</li>`).join("")}</ul>`;
    return;
  }
  const empate = opciones.length > 1 && opciones[0].total === opciones[1].total;
  caja.innerHTML = `<p class="nota">${empate ? "Empate en tiempo estimado; se muestra primero la de menos caminata." : `Conviene más ${escapar(cruce(opciones[0].parada.nombre))}: menos tiempo estimado hasta abordar.`}</p>
    <ul class="comparacion-lista">${opciones.map((opcion, i) => `<li><button type="button" class="comparacion-parada${i === 0 ? " recomendada" : ""}" data-comparar-parada="${opcion.indice}" aria-label="${i === 0 ? "Menor tiempo estimado. " : ""}${escapar(cruce(opcion.parada.nombre))}: caminar ${opcion.caminata} minutos, esperar ${opcion.espera} minutos, total ${opcion.total} minutos. Elegir esta parada.">
      <strong>${escapar(cruce(opcion.parada.nombre))}${i === 0 ? " · Conviene más" : ""}</strong><span>Caminar ${opcion.caminata} min · esperar ${opcion.espera} min</span><b>${opcion.total} min para abordar</b></button></li>`).join("")}</ul>
    ${faltantes.length ? `<p class="nota">Sin comparar: ${faltantes.map(escapar).join("; ")}.</p>` : ""}
    <p class="nota">Estimación con el horario oficial; no conocemos la ubicación en tiempo real de los camiones.</p>`;
  caja.querySelectorAll("[data-comparar-parada]").forEach((b) => b.addEventListener("click", () => {
    const opcion = opciones.find((x) => x.indice === Number(b.dataset.compararParada));
    if (opcion) elegirParada(estado.puntoCamiones, lista, opcion.indice);
  }));
  if (acc.modoVoz && estado.recomendacionAnunciada !== opciones[0].parada.nombre) {
    estado.recomendacionAnunciada = opciones[0].parada.nombre;
    hablar(`La parada con menos tiempo estimado es ${opciones[0].parada.nombre}: caminar ${opciones[0].caminata} minutos y esperar ${opciones[0].espera}, ${opciones[0].total} minutos en total.`, true);
  }
}

// La mas cercana en linea recta puede estar del otro lado de una avenida: se comparan caminando y se reordena.
async function ordenarPorCaminata(punto, lista) {
  if (lista.length < 2) return;
  const revision = revisionCamiones;
  const reales = await Promise.all(lista.map((x) => caminoAPie([punto.lat, punto.lon], [x.lat, x.lon])));
  if (revision !== revisionCamiones || document.body.dataset.pantalla !== "camiones") return;
  lista.forEach((x, i) => { if (reales[i]) x.caminado = reales[i].metros; });
  const distancia = (x) => x.caminado ?? x.m * 1.3;
  const orden = [...lista].sort((a, b) => distancia(a) - distancia(b));
  if (orden[0] === lista[0]) {
    ponerCaminata(lista[0], lista[0].caminado);
    document.querySelectorAll(".parada-alternativa[data-parada]").forEach((b) => {
      const parada = lista[Number(b.dataset.parada)];
      const texto = b.querySelector(".tenue");
      if (parada && texto) texto.textContent = `A ${distanciaTexto(parada.caminado ?? parada.m, true)}${parada.caminado ? " caminando" : " en línea recta"}`;
    });
    actualizarComparacionParadas(lista);
    return;
  }
  orden[0].dicho = true;
  pintarCamiones(punto, orden, false);
  hablar(`Entre las paradas consultadas, hay menos caminata a ${orden[0].nombre}, a ${distanciaTexto(distancia(orden[0]))}.`);
}

function pintarCamiones(punto, lista, primera, seleccionada = false) {
  const revision = revisionCamiones;
  const caja = $("camionesContenido");
  const filas = (p) => !p.lineas.length ? `<p class="nota">${Grieta.tieneRecorridos(p.i) ? "No hay próximos horarios guardados para esta parada." : "Parada oficial de Qrobus sin horarios publicados. No sabemos qué camiones pasan aquí."}</p>` : `<ul class="filas">${p.lineas.slice(0, 6).map((l) => `<li data-linea="${escapar(l.linea)}"><div class="fila">
      <span class="linea-caja">${escapar(l.linea)}</span>
      <span class="fila-texto"><strong>Hacia ${escapar(l.hacia)}</strong>${l.horas[1] !== undefined ? `<small>También a las ${hora(l.horas[1])}</small>` : ""}</span>
      <span class="hora-camion"><strong>${hora(l.horas[0])}</strong><small>${enCuanto(l.horas[0])}</small></span>
    </div></li>`).join("")}</ul>`;
  const p = lista[0];
  pintarParadas(punto, lista, seleccionada);
  caja.innerHTML = `
    <div class="parada-cerca">
      <p class="etiqueta" id="distanciaParada">${seleccionada ? "Parada elegida" : "Parada más cercana"}</p>
      <p class="parada-nombre" translate="no">${escapar(cruce(p.nombre))}</p>
    </div>
    <div class="a-pie" role="status">${ico("caminar")}<span class="fila-texto"><strong id="caminaParada">${p.caminado ? textoCaminata(p.caminado)[0] : "Calculando el camino a pie..."}</strong><small id="caminaDetalle">${p.caminado ? textoCaminata(p.caminado)[1] : `A ${distanciaTexto(p.m, true)} en línea recta`}</small></span></div>
    <button id="irParada" type="button" class="boton oscuro">${ico("ruta")}Ver cómo llegar a la parada</button>
    <h2>Próximos camiones</h2>
    ${filas(p)}
    <h2>Avisos de la parada</h2>
    <div id="avisosParada" class="avisos"><p class="nota">Buscando avisos...</p></div>
    <p class="nota">Los reportes son de la comunidad y pueden haber cambiado.</p>
    <button id="reportarParada" type="button" class="boton oscuro">Reportar algo en esta parada</button>
    <section class="comparacion-paradas" id="comparacionParadas" aria-labelledby="tituloComparacionParadas"><h2 id="tituloComparacionParadas">¿Qué parada me conviene?</h2><p class="nota">Calculando caminos a pie y horarios...</p></section>
    ${lista.length > 1 ? `<section class="otras" aria-labelledby="tituloOtrasParadas"><h2 id="tituloOtrasParadas">Otras paradas cerca</h2>
      ${lista.slice(1).map((x, i) => `<button type="button" class="parada-alternativa" data-parada="${i + 1}" aria-label="Ver camiones y reportar en ${escapar(cruce(x.nombre))}"><strong translate="no">${escapar(cruce(x.nombre))}</strong><span class="tenue">A ${distanciaTexto(x.caminado ?? x.m, true)}${x.caminado ? " caminando" : " en línea recta"}</span></button>${filas(x)}`).join("")}</section>` : ""}
    <p class="nota pie">Las horas salen del horario oficial de Qrobus; el camión puede adelantarse o retrasarse.</p>`;
  $("irParada").addEventListener("click", () => poner("destino", { nombre: `Parada ${p.nombre}`, lat: p.lat, lon: p.lon }));
  $("reportarParada").addEventListener("click", () => abrirReporte(p));
  caja.querySelectorAll("[data-parada]").forEach((b) => b.addEventListener("click", () => elegirParada(punto, lista, Number(b.dataset.parada))));
  estado.puntoCamiones = punto;
  estado.listaCamiones = lista;
  pintarParadasEnVista();
  actualizarComparacionParadas(lista);
  if (primera) hablar(`La parada más cercana es ${p.nombre}. ` +
    p.lineas.slice(0, 4).map((l) => `Línea ${l.linea} hacia ${l.hacia}, a las ${hora(l.horas[0])} según el horario.`).join(" "));
  // Lo que avisó la gente en esta parada en la última media hora, junto a su línea
  avisosDeLaGente(p.lat, p.lon).then((avisos) => {
    if (revision !== revisionCamiones) return;
    for (const a of avisos) {
      const li = document.querySelector(`#camionesContenido > .filas li[data-linea="${a.linea}"]`);
      if (!li || li.querySelector(".aviso-gente")) continue;
      li.insertAdjacentHTML("beforeend", `<p class="aviso-gente">${a.tipo === "paso" ? "Ya pasó" : "Viene lleno"}, avisó alguien hace ${a.minutos || "menos de 1"} min</p>`);
    }
  });
  // Las lineas que la gente avisó que suelen ir llenas a esta hora, de los "viene lleno" de otras semanas
  if (p.lineas.length) llamar(`/camiones/ocupacion?lineas=${p.lineas.slice(0, 6).map((l) => encodeURIComponent(l.linea)).join(",")}`).then(({ llenas }) => {
    if (revision !== revisionCamiones) return;
    for (const linea of llenas) {
      const li = document.querySelector(`#camionesContenido > .filas li[data-linea="${linea}"]`);
      if (li && !li.querySelector(".suele-lleno")) li.insertAdjacentHTML("beforeend", `<p class="aviso-gente suele-lleno">Suele ir lleno a esta hora</p>`);
    }
  }).catch(() => {});
  reportesCerca(p.lat, p.lon, 60).then((avisos) => {
    if (revision !== revisionCamiones) return;
    const caja = $("avisosParada");
    if (!caja) return;
    // Un aviso por tipo: varios reportes iguales se juntan y se quedan las descripciones distintas.
    const porTipo = new Map();
    for (const a of avisos) {
      const x = porTipo.get(a.tipo) ?? { tipo: a.tipo, textos: [] };
      if (a.descripcion && !x.textos.includes(a.descripcion)) x.textos.push(a.descripcion);
      porTipo.set(a.tipo, x);
    }
    avisos = [...porTipo.values()].map((x) => ({ tipo: x.tipo, descripcion: x.textos.slice(0, 2).join(" · ") }));
    caja.innerHTML = avisos.length
      ? avisos.slice(0, 4).map((a) => `<div class="aviso${a.tipo === "referencia" ? "" : " cuidado"}">
          ${ico(a.tipo === "referencia" ? "localizar" : "alerta")}
          <span class="fila-texto"><strong>${NOMBRES_REPORTE[a.tipo] ?? "Aviso"}</strong>${a.descripcion ? `<small translate="no">${escapar(a.descripcion)}</small>` : ""}</span></div>`).join("")
      : `<p class="nota">Todavía no hay avisos de esta parada.</p>`;
    if (avisos.length) leerReferencias(p);
  });
}

function dondeEstoy(destino) {
  const contar = (t) => { $(destino === "guia" ? "guiaDetalle" : destino === "voz" ? "respuestaVoz" : "respuesta").textContent = t; };
  if (!navigator.geolocation) { contar("Tu navegador no comparte la ubicación."); return hablar("Tu navegador no comparte la ubicación.", false, true); }
  contar("Buscando dónde estás...");
  hablar(frase("buscando_ubicacion"), false, true);
  navigator.geolocation.getCurrentPosition(async ({ coords }) => {
    const { latitude: lat, longitude: lon } = coords;
    let lugar = "";
    try {
      const r = await (await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lon}&limit=1`)).json();
      const p = r.features[0]?.properties ?? {};
      lugar = [p.street ? `${p.street}${p.housenumber ? " " + p.housenumber : ""}` : p.name, p.district ?? p.city].filter(Boolean).join(", ");
    } catch {}
    const cercanas = Grieta.pasanAqui(lat, lon, hoyDia(), ahoraMin(), 500).slice(0, 3);
    const pie = await Promise.all(cercanas.map((x) => caminoAPie([lat, lon], [x.lat, x.lon])));
    const conPie = cercanas.map((x, i) => ({ ...x, caminado: pie[i]?.metros })).sort((a, b) => (a.caminado ?? a.m * 1.3) - (b.caminado ?? b.m * 1.3));
    const parada = conPie[0];
    const cuanto = !parada ? "" : parada.caminado
      ? `a ${distanciaTexto(parada.caminado)} caminando, unos ${minutosCaminando(parada.caminado)} minutos`
      : `a unos ${distanciaTexto(parada.m)} en línea recta`;
    const texto = `${lugar ? `Estás en ${lugar}.` : "No encontré el nombre de la calle."} ` +
      (parada ? `Una parada del catálogo es ${cruce(parada.nombre)}, ${cuanto}.` : "No hay paradas de Qrobus a menos de 500 metros.");
    contar(texto);
    hablar(texto, false, true);
  }, () => { contar("No pude ver tu ubicación."); hablar(frase("sin_ubicacion"), false, true); }, { enableHighAccuracy: true, timeout: 10000 });
}
function ponerYo() {
  const { lat, lon } = estado.gps;
  capas.yo?.remove();
  capas.yo = L.marker([lat, lon], { icon: icono("origen"), keyboard: false, zIndexOffset: 800 }).addTo(mapa);
  mapa.setView([lat, lon], 17);
  pintarParadasEnVista();
}
// Con el mapa visible, Dónde estoy abre el mapa en tu ubicación; en modo de voz se sigue diciendo en voz alta.
function abrirUbicacion() {
  if (acc.modoVoz) return dondeEstoy("voz");
  ir("ubicacion");
  $("ubicacionCalle").textContent = "Buscando dónde estás...";
  ubicar((encontrada) => {
    if (document.body.dataset.pantalla !== "ubicacion") return;
    if (!encontrada) return void ($("ubicacionCalle").textContent = "No pude ver tu ubicación.");
    const { lat, lon } = estado.gps;
    ponerYo();
    $("ubicacionCalle").textContent = "";
    fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lon}&limit=1`).then((r) => r.json()).then((r) => {
      const p = r.features[0]?.properties ?? {};
      const calle = p.street ?? p.name;
      if (calle && document.body.dataset.pantalla === "ubicacion") $("ubicacionCalle").textContent = calle;
    }).catch(() => {});
  }, true);
}
$("dondeEstoy").addEventListener("click", abrirUbicacion);
$("dondeGuia").addEventListener("click", () => dondeEstoy("guia"));

// Dictar: llena el buscador, busca y lee las primeras opciones.
const Reconocer = window.SpeechRecognition || window.webkitSpeechRecognition;
function actualizarMicrofono() {
  microfonoActivo = Boolean(dictadoActual || cierresDictado.size);
  if (microfonoActivo || !respuestaDictado) return;
  const pendiente = respuestaDictado; respuestaDictado = null;
  if (pendiente.revision === revisionDictado) hablar(pendiente.mensaje);
}
function hablarAlCerrarDictado(mensaje) {
  if (!microfonoActivo) return hablar(mensaje);
  respuestaDictado = { mensaje, revision: revisionDictado };
}
function terminarDictado(rec, abortar = true) {
  if (dictadoActual !== rec) return;
  clearTimeout(inicioDictado);
  const iniciado = dictadoIniciado;
  dictadoActual = null; dictadoIniciado = false;
  document.querySelectorAll('.dictar.oyendo, #vozDestino.oyendo').forEach(b => { b.classList.remove('oyendo'); b.setAttribute('aria-pressed', 'false'); });
  $("respuestaVoz").textContent = '';
  $("respuestaVoz").setAttribute('aria-live', 'polite');
  rec.onstart = rec.onresult = rec.onerror = rec.onspeechend = null;
  if (iniciado && abortar) {
    cierresDictado.add(rec);
    let limite;
    const liberar = () => { clearTimeout(limite); cierresDictado.delete(rec); actualizarMicrofono(); };
    rec.onaudioend = rec.onend = liberar;
    // abort() corta la captura; la pausa breve solo protege el retorno de la voz.
    limite = setTimeout(liberar, 250);
    try { rec.abort(); } catch { liberar(); }
  } else rec.onaudioend = rec.onend = null;
  actualizarMicrofono();
}
function cancelarDictado() {
  revisionDictado++; respuestaDictado = null;
  if (dictadoActual) terminarDictado(dictadoActual);
}
function procesarDictado(texto, revision) {
  const dicho = sinAcentos(texto).replace(/^(a|al|a la|hacia|llevame a|ir a)\s+/, "");
  const guardado = guardados.find(g => sinAcentos(g.nombre) === dicho);
  if (guardado) {
    estado.editando = "hacia";
    if (cambioUbicacionGuardada) return poner("destino", guardado);
    poner("destino", guardado);
    return hablarAlCerrarDictado(frase("vamos_lugar", { lugar: guardado.nombre }));
  }
  if (document.body.dataset.pantalla !== "buscar") abrirBuscar("hacia");
  $("campoBuscar").value = texto;
  estado.resultados = null; estado.buscado = false;
  if (texto.length < 3) {
    avisar(textoFrase(frase("no_escuche")));
    return hablarAlCerrarDictado(frase("no_escuche"));
  }
  sugerir(texto, res => {
    if (revision !== revisionDictado || document.body.dataset.pantalla !== "buscar" || $("campoBuscar").value !== texto) return;
    if (acc.modoVoz && res.length && !cambioUbicacionGuardada) {
      const mensaje = [frase("vamos_lugar", { lugar: res[0].nombre }), " Si no es, regresa y vuelve a decirlo."];
      elegir(res[0]);
      return hablarAlCerrarDictado(mensaje);
    }
    hablarAlCerrarDictado(res.length
      ? `Encontré ${res.length} lugares. ` + res.slice(0, 3).map((l, i) => `${i + 1}: ${l.nombre}${l.detalle ? ", " + l.detalle : ""}.`).join(" ") + " Elige uno de la lista."
      : `No encontré ${texto}. Intenta con otro nombre.`);
  });
}
function dictar(boton) {
  const detener = dictadoActual && boton.classList.contains('oyendo');
  cancelarDictado();
  if (detener) return;
  const rec = new Reconocer(), revision = revisionDictado;
  dictadoActual = rec; actualizarMicrofono();
  rec.lang = "es-MX"; rec.continuous = false; rec.interimResults = false; rec.maxAlternatives = 1;
  boton.classList.add("oyendo"); boton.setAttribute("aria-pressed", "true");
  $("respuestaVoz").setAttribute('aria-live', 'off');
  detenerVoz();
  if (acc.modoVoz) $("respuestaVoz").textContent = "Di a dónde vas.";
  rec.onspeechend = () => {
    if (dictadoActual !== rec) return;
    boton.classList.remove("oyendo"); boton.setAttribute("aria-pressed", "false");
    try { rec.stop(); } catch {}
  };
  rec.onresult = e => {
    if (dictadoActual !== rec) return;
    const texto = Array.from(e.results).filter(r => r.isFinal).map(r => r[0]?.transcript ?? '').join(' ').trim();
    if (!texto) return;
    terminarDictado(rec);
    procesarDictado(texto, revision);
  };
  rec.onerror = e => {
    if (dictadoActual !== rec) return;
    terminarDictado(rec);
    if (e.error !== 'aborted') { avisar(textoFrase(frase("no_escuche"))); hablarAlCerrarDictado(frase("no_escuche")); }
  };
  rec.onend = () => { if (dictadoActual === rec) terminarDictado(rec, false); };
  const iniciar = () => {
    if (dictadoActual !== rec) return;
    const espera = Math.max(0, 120 - (performance.now() - ultimaVozDetenida));
    if (espera || cierresDictado.size) { inicioDictado = setTimeout(iniciar, Math.max(16, espera)); return; }
    dictadoIniciado = true;
    try { rec.start(); } catch { rec.onerror({ error: 'inicio' }); }
  };
  iniciar();
}
document.addEventListener('visibilitychange', () => { if (document.hidden) cancelarDictado(); });
addEventListener('pagehide', cancelarDictado);
if (Reconocer) {
  for (const b of document.querySelectorAll(".dictar")) {
    b.hidden = false;
    b.setAttribute("aria-pressed", "false");
    b.addEventListener("click", () => dictar(b));
  }
}

// Guia de viaje: sigue el GPS y avisa con voz, vibracion y tono antes de bajarse.
const guia = { activa: false };

function ponerTitulo(titulo) {
  titulo = textoFrase(titulo);
  const largo = cruce(titulo).length;
  $("guiaTitulo").classList.toggle("largo", largo > 26 && largo <= 44);
  $("guiaTitulo").classList.toggle("muy-largo", largo > 44);
  $("guiaTitulo").innerHTML = escapar(cruce(titulo)).replace(/^Faltan (\d+)/, 'Faltan <span class="num">$1</span>');
}
const FICHAS_GUIA = {
  "Hacia la parada": ["tono-maiz", "caminar"], "En la parada": ["tono-casa", "parada"], "En el camión": ["tono-anil", "qrobus"],
  "Próxima parada": ["tono-anil", "qrobus"], "Tu parada": ["tono-casa", "parada"], "Transbordo": ["tono-anil", "qrobus"], "Llegaste": ["tono-hospital", "lugar"],
};
function decir(titulo, detalle, etapa, alerta = false) {
  const [tono, nombre] = guia.enApp && etapa === "Hacia la parada" ? ["tono-hospital", "app"] : FICHAS_GUIA[etapa] ?? FICHAS_GUIA[guia.fase === "camion" ? "En el camión" : "Llegaste"];
  $("guiaFicha").className = `guia-ficha ${tono}`;
  $("guiaPicto").setAttribute("href", `#p-${nombre}`);
  if (etapa) $("guiaEtapa").textContent = guia.camion && etapa !== "Llegaste" ? `${etapa} · ${guia.camion.linea}` : etapa;
  ponerTitulo(titulo);
  $("guiaDetalle").textContent = cruce(textoFrase(detalle));
  document.body.classList.toggle("alerta", alerta);
  pintarGuia();
  hablar(detalle ? [titulo, ". ", detalle] : titulo, false, true);
}
// Barra con un segmento por parada del recorrido; con mas de 12 se agrupan.
function pintarGuia() {
  const c = guia.camion;
  $("enParada").hidden = !c || guia.enApp || !["parada", "esperando"].includes(guia.fase);
  pintarFamiliar();
  $("yaMeSubi").textContent = textoFrase(c ? frase("subi_linea", { linea: c.linea }) : frase("ya_me_subi"));
  $("guiaBaja").hidden = !c;
  $("barraParadas").hidden = !c;
  if (!c) return;
  const r = c.recorrido;
  $("guiaBaja").innerHTML = `Bajas en <strong translate="no">${escapar(cruce(r.at(-1).nombre))}</strong>`;
  const n = r.length - 1;
  const actual = guia.fase === "camion" || guia.fase === "fin" ? guia.actual : 0;
  const g = Math.min(n, 12);
  const partes = [];
  for (let j = 0; j < g; j++) {
    const desde = Math.floor((j * n) / g) + 1;
    const hasta = Math.floor(((j + 1) * n) / g);
    const clase = hasta <= actual ? "pasada" : desde <= actual + 1 && actual + 1 <= hasta ? "actual" : "";
    partes.push(`<span class="${clase}"></span>`);
  }
  $("barraParadas").innerHTML = partes.join("");
  $("barraParadas").setAttribute("aria-valuemax", String(n));
  $("barraParadas").setAttribute("aria-valuenow", String(actual));
  $("barraParadas").setAttribute("aria-valuetext", `${actual} de ${n} paradas recorridas en la línea ${c.linea}`);
  $("barraParadas").setAttribute("aria-label", "Paradas del recorrido");
}
async function mantenerPantalla() {
  try { guia.wake = await navigator.wakeLock?.request("screen"); } catch {}
}
document.addEventListener("visibilitychange", () => { if (guia.activa && document.visibilityState === "visible") mantenerPantalla(); });

function seguir(alMoverse) {
  if (!navigator.geolocation) return decir("Sin ubicación", "Tu navegador no comparte la ubicación.");
  guia.reloj = navigator.geolocation.watchPosition(
    ({ coords }) => {
      const aqui = [coords.latitude, coords.longitude];
      if (capas.aqui) capas.aqui.setLatLng(aqui);
      else capas.aqui = L.marker(aqui, { icon: icono("origen"), keyboard: false }).addTo(mapa);
      // Si el telefono no da la velocidad, se saca de dos posiciones separadas al menos 3 segundos.
      const ahora = Date.now();
      let v = Number.isFinite(coords.speed) ? coords.speed : null;
      if (v === null && guia.previo && ahora - guia.previo.t >= 3000) {
        v = Grieta.metros(guia.previo.lat, guia.previo.lon, coords.latitude, coords.longitude) / ((ahora - guia.previo.t) / 1000);
      }
      if (!guia.previo || ahora - guia.previo.t >= 3000) guia.previo = { lat: coords.latitude, lon: coords.longitude, t: ahora };
      if (v !== null) guia.velocidad = v;
      alMoverse(coords.latitude, coords.longitude, guia.velocidad ?? 0);
    },
    // Sin permiso no hay avisos; un GPS que tarda en responder se sigue esperando sin interrumpir lo que se dice.
    (err) => { if (err.code === err.PERMISSION_DENIED) unaVez("sin-permiso", () => decir("Sin ubicación", "Activa la ubicación para recibir los avisos.")); },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
  );
}
const unaVez = (clave, fn) => { if (!guia.dichos.has(clave)) { guia.dichos.add(clave); fn(); } };

function iniciarGuia(o) {
  terminarGuia();
  const tramos = o.pasos.filter((p) => p.tipo === "camion");
  registrarViaje(o);
  guia.km = sinAuto(o) ? estado.r.directo.km : 0;
  if (guia.km) contarViaje(guia.km);
  ir("guia");
  Object.assign(guia, { activa: true, o, tramos, k: 0, camion: tramos[0], fase: "parada", actual: 0, dichos: new Set(), previo: null, velocidad: null, vueltas: 0, push: null,
    destino: estado.destino, enApp: o.pasos[0].tipo === "app", pie: null });
  dibujar(o);
  mantenerPantalla();
  vibrar([60]);
  $("yaMeSubi").hidden = false;
  // Con el horario oficial: avisa 5 minutos y 1 minuto antes de que pase el camion.
  guia.horario = setInterval(() => {
    if (guia.fase !== "parada" && guia.fase !== "esperando") return;
    if ((guia.vueltas = (guia.vueltas ?? 0) + 1) % 4 === 1) revisarAvisosParada();
    const c = guia.camion;
    const ahora = new Date();
    const falta = c.sale - (ahora.getHours() * 60 + ahora.getMinutes() + ahora.getSeconds() / 60);
    if (falta <= 1 && falta > -3) unaVez(`pasa1-${guia.k}`, () => { vibrar([500, 150, 500]); decir(`La ${c.linea} debe estar por pasar`, `Según el horario pasa a las ${hora(c.sale)}. Pregúntale al chofer si es la ${c.linea} hacia ${c.hacia}.`, "En la parada"); });
    else if (falta <= 5 && falta > 1) unaVez(`pasa5-${guia.k}`, () => { vibrar([300]); decir(`La ${c.linea} pasa en unos ${Math.round(falta)} minutos`, `Según el horario, a las ${hora(c.sale)}.`, "En la parada"); });
  }, 15000);
  const inicio = o.pasos[0];
  const c = guia.camion;
  decir(inicio.tipo === "app" ? `Pide ${Grieta.nombreApp(inicio.app)} a ${inicio.parada}` : frase("camina_parada", { parada: inicio.parada }),
    [`Ahí tomas la línea ${c.linea} hacia ${c.hacia}, a las ${hora(c.sale)} según el horario.`, tramos.length > 1 ? [" ", frase("despues_transbordo")] : "", " Te aviso antes de bajar."], "Hacia la parada");
  if (!guia.enApp) medirCaminata(estado.gps ?? estado.origen, c.recorrido[0]);
  programarAvisos(tramos);
  seguir(avanzarCamion);
}

// Avisos con la pantalla bloqueada: la API los manda por push a su hora. Hace falta la app instalada y el permiso;
// si algo falta, la guia sigue igual con voz y vibracion mientras la pantalla este encendida.
async function programarAvisos(tramos) {
  try {
    if (!API || !("PushManager" in window) || !("Notification" in window)) return;
    const permiso = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
    if (permiso !== "granted") return;
    const { clave } = await llamar("/notificaciones/clave");
    const registro = await navigator.serviceWorker.ready;
    const suscripcion = (await registro.pushManager.getSubscription()) ?? (await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: clave }));
    const cuando = (min) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setMinutes(min); return d.toISOString(); };
    const ahora = ahoraMin();
    const avisos = tramos.filter((c) => c.sale - 5 > ahora).map((c) => ({ cuando: cuando(c.sale - 5), titulo: `La ${c.linea} pasa en 5 minutos`, texto: `Según el horario, a las ${hora(c.sale)}. Ve a la parada.` }));
    const ultimo = tramos.at(-1);
    if (ultimo.llega - 3 > ahora) avisos.push({ cuando: cuando(ultimo.llega - 3), titulo: textoFrase(frase("ya_casi_llegas")), texto: `Bajas en ${cruce(ultimo.baja)}. Prepárate y toca el timbre.` });
    if (!avisos.length || !guia.activa) return;
    await llamar("/notificaciones", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ suscripcion: suscripcion.toJSON(), avisos: avisos.slice(0, 6) }) });
    guia.push = suscripcion.endpoint;
  } catch {}
}
function cancelarAvisos() {
  if (!guia.push) return;
  llamar("/notificaciones/cancelar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: guia.push }) }).catch(() => {});
  guia.push = null;
}

// "Ya pasó" y "Viene lleno": lo que ve la gente en la parada, para quien espera ahí mismo
async function avisarParada(tipo) {
  const c = guia.camion;
  if (!c) return;
  const parada = c.recorrido[0];
  try {
    await llamar("/camiones/avisos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tipo, linea: c.linea, lat: parada.lat, lon: parada.lon }) });
  } catch {}
  const sig = siguienteDe(c.linea, parada);
  const texto = tipo === "paso"
    ? `Gracias. ${sig ? `Según el horario, la siguiente ${c.linea} pasa a las ${hora(sig)}.` : `No encontré otra ${c.linea} hoy en el horario.`}`
    : "Gracias. Se lo diré a quien espere aquí.";
  $("guiaDetalle").textContent = texto;
  hablar(texto, false, true);
}
const siguienteDe = (linea, parada) => Grieta.pasanAqui(parada.lat, parada.lon, hoyDia(), ahoraMin(), 80)
  .flatMap((x) => x.lineas).find((l) => l.linea === linea)?.horas.find((h) => h > ahoraMin() + 1);
$("yaPaso").addEventListener("click", () => avisarParada("paso"));
$("vieneLleno").addEventListener("click", () => avisarParada("lleno"));
async function avisosDeLaGente(lat, lon) {
  try { return await llamar(`/camiones/avisos?lat=${lat}&lon=${lon}&radio=150`); } catch { return []; }
}
// Mientras esperas, si alguien ya avisó de tu camion en esa parada, se te dice una vez
async function revisarAvisosParada() {
  const c = guia.camion;
  if (!c || !["parada", "esperando"].includes(guia.fase)) return;
  const de = (await avisosDeLaGente(c.recorrido[0].lat, c.recorrido[0].lon)).filter((a) => a.linea === c.linea);
  const paso = de.find((a) => a.tipo === "paso" && a.minutos <= 10);
  const lleno = de.find((a) => a.tipo === "lleno" && a.minutos <= 10);
  if (paso) unaVez(`gente-paso-${guia.k}`, () => {
    const sig = siguienteDe(c.linea, c.recorrido[0]);
    decir(`Alguien avisó que la ${c.linea} ya pasó`, [`Hace ${paso.minutos || "menos de un"} minuto${paso.minutos === 1 ? "" : "s"}.`, sig ? [" ", frase("siguiente", { hora: hora(sig) })] : ""], "En la parada");
  });
  else if (lleno) unaVez(`gente-lleno-${guia.k}`, () => decir(`Alguien avisó que la ${c.linea} viene llena`, frase("espera_siguiente"), "En la parada"));
}

// Avisar a un familiar por WhatsApp: al salir y al llegar, con un toque
let familiar = leer("grieta-familiar", null);
function pintarResumenFamiliar() {
  const resumen = $("textoFamiliar");
  if (!resumen) return;
  if (!familiar) {
    resumen.textContent = "Agrega a alguien de confianza";
    return;
  }
  const telefono = familiar.telefono.replace(/^52/, "").replace(/^(\d{3})(\d{3})(\d{4})$/, "$1 $2 $3");
  resumen.textContent = `${familiar.nombre} · ${telefono}`;
}
function pintarFamiliar() {
  const b = $("avisarFamiliar");
  b.hidden = !familiar || !guia.activa;
  if (b.hidden) return;
  b.querySelector("span").textContent = `Avisar a ${familiar.nombre} que ${guia.dichos.has("destino") ? "llegué" : "ya salí"}`;
}
$("avisarFamiliar").addEventListener("click", () => {
  const destino = guia.destino?.nombre ?? estado.destino?.nombre ?? "mi destino";
  const c = guia.camion;
  const texto = guia.dichos.has("destino")
    ? `Ya llegué a ${destino}.`
    : `Ya voy en camino a ${destino}${c ? ` en la ${c.linea}` : ""}${c ? `. Llego como a las ${hora(guia.tramos?.at(-1)?.llega ?? c.llega)}` : ""}. Te aviso cuando llegue.`;
  window.open(`https://wa.me/${familiar.telefono}?text=${encodeURIComponent(texto)}`, "_blank", "noopener");
});
function pintarFormaFamiliar() {
  $("familiarNombre").value = familiar?.nombre ?? "";
  $("familiarTel").value = familiar ? familiar.telefono.slice(2) : "";
  pintarResumenFamiliar();
}
$("guardarFamiliar").addEventListener("click", () => {
  const nombre = $("familiarNombre").value.trim().replace(/\s+/g, " ");
  const digitos = $("familiarTel").value.replace(/\D/g, "").replace(/^52/, "");
  if (!nombre && !digitos) {
    familiar = null;
    escribir("grieta-familiar", null);
    pintarResumenFamiliar();
    return void ($("familiarEstado").textContent = "Listo, ya no hay a quién avisar.");
  }
  if (!nombre) return void ($("familiarEstado").textContent = "Escribe el nombre.");
  if (digitos.length !== 10) return void ($("familiarEstado").textContent = "El teléfono debe tener 10 dígitos.");
  familiar = { nombre: nombre.charAt(0).toUpperCase() + nombre.slice(1), telefono: `52${digitos}` };
  escribir("grieta-familiar", familiar);
  pintarResumenFamiliar();
  $("familiarEstado").textContent = `Guardado. En tus viajes aparecerá "Avisar a ${familiar.nombre}".`;
});
pintarFormaFamiliar();

// La linea recta engaña cuando hay que rodear: se mide por calles al empezar a caminar
// y mientras avanzas se estima lo que falta con la misma proporcion.
function medirCaminata(desde, parada) {
  guia.pie = null;
  if (!desde) return;
  const recta = Math.max(1, Grieta.metros(desde.lat, desde.lon, parada.lat, parada.lon));
  caminoAPie([desde.lat, desde.lon], [parada.lat, parada.lon]).then((c) => {
    if (!c || !guia.activa || guia.fase !== "parada") return;
    guia.pie = { metros: c.metros, recta };
    const texto = `Son ${distanciaTexto(c.metros)} caminando, unos ${minutosCaminando(c.metros)} minutos.`;
    $("guiaDetalle").textContent = `${texto} ${Interfaz.original($("guiaDetalle"))}`;
    hablar(texto, true);
  });
}

// A partir de 3.5 m/s (12.6 km/h) se va en vehiculo: caminando por la avenida de la ruta no cuenta como subirse.
const VELOCIDAD_CAMION = 3.5;
function avanzarCamion(lat, lon, velocidad = 0) {
  const c = guia.camion;
  const r = c.recorrido;
  const final = r.at(-1);
  const ultimo = guia.k === guia.tramos.length - 1;
  const d = r.map((x) => Grieta.metros(lat, lon, x.lat, x.lon));
  if (guia.fase === "parada" || guia.fase === "esperando") {
    if (guia.fase === "parada" && d[0] < 40) {
      guia.fase = "esperando";
      vibrar([300, 120, 300]);
      decir(frase("llegaste_parada"), [`${r[0].nombre}. `, frase("espera_linea", { linea: c.linea, hacia: c.hacia }), "; ", frase("horario_pasa", { hora: hora(c.sale) }), ". ", frase("aviso_pasar")], "En la parada");
      leerReferencias(r[0]);
    }
    // Si ya va por la ruta del camion, lejos de la parada de subida, se subio.
    const masCerca = d.indexOf(Math.min(...d));
    if (masCerca >= 1 && d[masCerca] < 90 && velocidad >= VELOCIDAD_CAMION) subir(masCerca);
    else if (guia.fase === "parada" && !guia.enApp) {
      // El rodeo pesa menos conforme te acercas: junto a la parada la linea recta ya es casi el camino
      const rodeo = guia.pie ? 1 + (guia.pie.metros / guia.pie.recta - 1) * Math.min(1, d[0] / guia.pie.recta) : 1;
      const resta = guia.pie ? Math.max(d[0], d[0] * rodeo) : null;
      $("guiaDetalle").textContent = resta ? `La parada está a unos ${distanciaTexto(resta)} caminando.` : `La parada está a ${distanciaTexto(d[0])} en línea recta.`;
    }
    return;
  }
  // Ya abajo del ultimo camion se sigue hasta el destino para decir que llegaste.
  if (guia.fase === "fin") {
    const dest = guia.destino;
    if (dest && Grieta.metros(lat, lon, dest.lat, dest.lon) < 40) {
      unaVez("destino", () => { vibrar([300, 120, 300, 120, 300]); decir(frase("llegaste"), `Estás en ${dest.nombre}.${guia.km ? ` Este viaje: ${kgTexto(co2Auto(guia.km))} de CO₂ que no emitió un auto.` : ""}${familiar ? ` Puedes avisarle a ${familiar.nombre} que llegaste.` : ""} Toca Terminar viaje cuando quieras.`, "Llegaste"); });
    }
    return;
  }
  if (guia.fase !== "camion") return;
  for (let i = guia.actual + 1; i < r.length; i++) if (d[i] < 90 && d[i] <= d[guia.actual]) guia.actual = i;
  const faltan = r.length - 1 - guia.actual;
  const clave = (x) => `${x}-${guia.k}`;
  if (faltan === 0 || d.at(-1) < 60) {
    unaVez(clave("llegaste"), () => {
      vibrar([900, 200, 900]);
      if (!ultimo) {
        // Transbordo: la siguiente linea empieza como una parada nueva.
        const sig = guia.tramos[guia.k + 1];
        Object.assign(guia, { k: guia.k + 1, camion: sig, fase: "parada", actual: 0, enApp: false });
        $("yaMeSubi").hidden = false;
        decir(frase("transbordo"), `Camina a ${sig.recorrido[0].nombre} y toma la línea ${sig.linea} hacia ${sig.hacia}, a las ${hora(sig.sale)} según el horario.`, "Transbordo", true);
        medirCaminata({ lat, lon }, sig.recorrido[0]);
        return;
      }
      guia.fase = "fin";
      guia.actual = r.length - 1;
      $("yaMeSubi").hidden = true;
      const fin = guia.o.pasos.at(-1);
      decir(frase("bajate"), `${final.nombre}. ${fin.tipo === "caminar" ? `Después camina unos ${Math.max(1, Math.round(fin.min))} minutos a tu destino.` : `Después pide ${Grieta.nombreApp(fin.app)} a tu destino.`}`, "Tu parada", true);
    });
  } else if (faltan === 1) {
    unaVez(clave("una"), () => { vibrar([700, 150, 700]); decir(frase("siguiente_parada"), `Toca el timbre ahora. Bajas en ${final.nombre}.`, "Próxima parada", true); });
  } else if (faltan === 2) {
    unaVez(clave("dos"), () => { vibrar([400, 150, 400]); decir(frase("dos_paradas"), `Prepárate. Tu parada es ${final.nombre}.`, "En el camión"); });
  } else {
    // En pantalla siempre; en voz cada 5 paradas y en cada una de las ultimas 5.
    ponerTitulo(frase("faltan_paradas", { n: faltan }));
    $("guiaDetalle").textContent = `Vas por ${cruce(r[guia.actual].nombre)}.`;
    pintarGuia();
    if (faltan <= 5 || faltan % 5 === 0) unaVez(clave(`faltan${faltan}`), () => decir(frase("faltan_paradas", { n: faltan }), `Vas por ${r[guia.actual].nombre}.`, "En el camión"));
  }
}

function subir(desde = 0) {
  if (guia.fase === "camion") return;
  guia.fase = "camion";
  guia.actual = desde;
  $("yaMeSubi").hidden = true;
  const r = guia.camion.recorrido;
  const faltan = r.length - 1 - desde;
  guia.dichos.add(`faltan${faltan}-${guia.k}`);
  decir(frase("faltan_paradas", { n: faltan }), `Vas en la ${guia.camion.linea}. Te aviso dos paradas antes de bajar.`, "En el camión");
}
$("yaMeSubi").addEventListener("click", () => subir(guia.actual));

$("repetir").addEventListener("click", () => {
  if (acc.voz) return hablar(ultimoMensaje || Interfaz.original($("guiaTitulo")));
  // Sin la voz de Grieta, el aviso se vuelve a escribir para que el lector de pantalla lo lea otra vez.
  const aviso = $("guiaTitulo").innerHTML;
  $("guiaTitulo").innerHTML = "";
  setTimeout(() => { $("guiaTitulo").innerHTML = aviso; }, 100);
});
// Terminar a medio camino apaga los avisos de bajar: se confirma con un segundo toque. Al llegar, no.
function restaurarTerminar() {
  delete $("terminar").dataset.confirmar;
  $("terminar").textContent = textoFrase(frase("terminar"));
}
$("terminar").addEventListener("click", () => {
  if (guia.activa && guia.fase !== "fin" && !$("terminar").dataset.confirmar) {
    $("terminar").dataset.confirmar = "1";
    $("terminar").textContent = "Toca otra vez para terminar";
    hablar(frase("confirmar_fin"), false, true);
    clearTimeout(guia.confirmar);
    guia.confirmar = setTimeout(restaurarTerminar, 5000);
    return;
  }
  clearTimeout(guia.confirmar);
  restaurarTerminar();
  terminarGuia();
  history.back();
});
$("compartir").addEventListener("click", () => {
  const enviar = async (lat, lon) => {
    const linea = guia.camion ? ` en la línea ${guia.camion.linea} hacia ${guia.camion.hacia}` : "";
    const texto = `Voy a ${estado.destino?.nombre ?? "mi destino"}${linea}. Mi ubicación ahorita:`;
    const url = `https://www.google.com/maps?q=${lat},${lon}`;
    try {
      if (navigator.share) await navigator.share({ title: "Mi viaje", text: texto, url });
      else { await navigator.clipboard.writeText(`${texto} ${url}`); hablar("Copié tu viaje para que lo pegues en un mensaje."); }
    } catch {}
  };
  if (capas.aqui) {
    const p = capas.aqui.getLatLng();
    enviar(p.lat, p.lng);
  } else {
    navigator.geolocation?.getCurrentPosition(({ coords }) => enviar(coords.latitude, coords.longitude), () => hablar(frase("sin_ubicacion")));
  }
});

function terminarGuia() {
  clearTimeout(guia.confirmar);
  cancelarAvisos();
  restaurarTerminar();
  if (!$("chofer").hidden) tarjetaChofer(false);
  if (guia.reloj !== undefined) navigator.geolocation.clearWatch(guia.reloj);
  guia.reloj = undefined;
  clearInterval(guia.horario);
  guia.wake?.release?.();
  guia.activa = false;
  guia.camion = null;
  capas.aqui?.remove();
  capas.aqui = null;
  document.body.classList.remove("alerta");
  detenerVoz();
}

// Viajes recientes en el inicio: los ultimos destinos con avisos, para repetirlos con un toque.
let viajes = leer("grieta-viajes", []);
function registrarViaje(o) {
  const { destino: d } = estado;
  viajes = [{ destino: { nombre: d.nombre, lat: d.lat, lon: d.lon, tipo: d.tipo }, camino: tituloOpcion(o), fecha: new Date().toISOString() }]
    .concat(viajes.filter((v) => v.destino.nombre !== d.nombre)).slice(0, 20);
  escribir("grieta-viajes", viajes);
  // Historial sin juntar repetidos: de aqui salen la rutina y lo ahorrado. Solo en el telefono.
  const app = Math.min(...estado.r.directo.porApp.map((x) => x.precio));
  const ahorro = o.tipo === "app" ? 0 : Math.max(0, Math.round(app - o.costo));
  const co2 = sinAuto(o) ? Math.round(co2Auto(estado.r.directo.km)) : 0;
  historial = [{ nombre: d.nombre, lat: d.lat, lon: d.lon, fecha: new Date().toISOString(), ahorro, co2 }].concat(historial).slice(0, 80);
  escribir("grieta-historial", historial);
}
let historial = leer("grieta-historial", []);

// Rutina: si ya fuiste a un lugar al menos dos veces en dias parecidos (entre semana o fin) y a una hora
// parecida, el inicio lo ofrece con un toque. Nada sale del telefono.
function rutinaSugerida() {
  const ahora = new Date();
  const finde = (d) => d.getDay() === 0 || d.getDay() === 6;
  const minutoDe = (d) => d.getHours() * 60 + d.getMinutes();
  const cerca = (a, b) => Math.min(Math.abs(a - b), 1440 - Math.abs(a - b)) <= 60;
  const veces = new Map();
  for (const h of historial) {
    const f = new Date(h.fecha);
    if (ahora - f > 60 * 864e5 || finde(f) !== finde(ahora) || !cerca(minutoDe(f), minutoDe(ahora))) continue;
    const x = veces.get(h.nombre) ?? { ...h, n: 0 };
    x.n++;
    veces.set(h.nombre, x);
  }
  const yo = estado.gps ?? estado.origen;
  return [...veces.values()]
    .filter((x) => x.n >= 2 && (!yo || Grieta.metros(yo.lat, yo.lon, x.lat, x.lon) > 300))
    .sort((a, b) => b.n - a.n)[0] ?? null;
}
function pintarRutina() {
  const r = rutinaSugerida();
  $("rutina").hidden = !r;
  $("vozRutina").hidden = !r;
  if (!r) return;
  $("rutinaTexto").textContent = `¿Vas a ${r.nombre}?`;
  $("vozRutina").querySelector("span").textContent = `Ir a ${r.nombre}`;
  estado.rutina = { nombre: r.nombre, lat: r.lat, lon: r.lon };
}
$("rutina").addEventListener("click", () => irA({ ...estado.rutina }));
$("vozRutina").addEventListener("click", () => { hablar(frase("vamos_lugar", { lugar: estado.rutina.nombre })); irA({ ...estado.rutina }); });

// Lo ahorrado este mes por ir en camion en vez de la app mas barata.
function pintarAhorro() {
  // Mes en hora local: en UTC el ultimo dia del mes en la noche ya cuenta como el siguiente.
  const hoy = new Date();
  const delMes = historial.filter((h) => { const f = new Date(h.fecha); return f.getFullYear() === hoy.getFullYear() && f.getMonth() === hoy.getMonth(); });
  const total = delMes.reduce((s, h) => s + (h.ahorro || 0), 0);
  // Una meta de CO₂ se dice una sola vez, la primera vez que el inicio la muestra.
  const acumulado = historial.reduce((s, h) => s + (h.co2 || 0), 0);
  const meta = [100, 50, 25, 10, 5, 1].find((kg) => acumulado >= kg * 1000);
  const nuevaMeta = meta && meta > leer("grieta-meta-co2", 0) ? meta : null;
  if (nuevaMeta) { escribir("grieta-meta-co2", nuevaMeta); hablar(`Llevas ${nuevaMeta} kilos de CO₂ que no emitió un auto.`); }
  $("ahorroMes").hidden = total < 1;
  $("ahorroMes").innerHTML = `<strong>${pesos(total)} de ahorro estimado</strong> este mes.`;
}
// Lo de todos: cada viaje en camion empezado con la guia manda solo sus km; la API los suma.
const contarViaje = (km) => llamar("/viajes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ km: Math.round(km * 10) / 10 }) })
  .then(() => { estado.impactoLeido = 0; }).catch(() => {});
async function pintarImpacto() {
  if (!API || Date.now() - (estado.impactoLeido ?? 0) < 5 * 60 * 1000) return;
  estado.impactoLeido = Date.now();
  try {
    const { co2_kg } = await llamar("/impacto");
    if (!co2_kg) return;
    $("impactoTodos").innerHTML = `${ico("planta")}<span class="fila-texto"><strong>${kgTexto(co2_kg * 1000)} de CO₂ evitados</strong><span>Moverte diferente sí cuenta.</span></span>`;
    $("impactoTodos").hidden = false;
  } catch { estado.impactoLeido = 0; }
}
function fechaViaje(iso) {
  const f = new Date(iso);
  return `${DIAS[(f.getDay() + 6) % 7]} ${f.getDate()} ${MESES[f.getMonth()]}`;
}
function pintarViajes() {
  $("bloqueViajes").hidden = !viajes.length;
  $("listaViajes").innerHTML = viajes.slice(0, 3).map((v, i) => `<li><button type="button" data-i="${i}" aria-label="Ir otra vez a ${escapar(v.destino.nombre)}">
      ${miniFicha(tonoLugar(v.destino.nombre, i, v.destino.tipo), picto(iconoLugar(v.destino.nombre, v.destino.tipo)))}
      <span class="fila-texto"><strong translate="no">${escapar(v.destino.nombre)}</strong><small>${escapar(v.camino)} · ${fechaViaje(v.fecha)}</small></span>
      ${ico("chevron", "chevron")}</button></li>`).join("");
}
$("listaViajes").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-i]");
  if (b) irA({ ...viajes[b.dataset.i].destino });
});

// Lugares guardados en este telefono: Casa, Escuela, Trabajo.
let guardados = leer("grieta-lugares", []);
let editando = false;
let quitado = null;
let cambioUbicacionGuardada = null;
// El tipo sale del nombre; si no, del tipo de OpenStreetMap que trae el buscador.
const TIPOS_OSM = { hospital: "hospital", clinic: "hospital", doctors: "hospital", pharmacy: "hospital", park: "parque", garden: "parque",
  supermarket: "super", convenience: "super", mall: "plaza", department_store: "plaza", marketplace: "mercado", cafe: "cafe", restaurant: "cafe",
  fast_food: "cafe", place_of_worship: "iglesia", university: "escuela", school: "escuela", college: "escuela", kindergarten: "escuela",
  aerodrome: "avion", bus_station: "qrobus", office: "trabajo" };
function iconoLugar(nombre, tipo) {
  const n = sinAcentos(nombre);
  if (n === "casa") return "casa";
  if (/trabajo|oficina|corporativo|parque (industrial|tecnologico)/.test(n)) return "trabajo";
  if (/hospital|clinica|imss|issste|cruz roja|doctor|medic|farmacia|consultorio|sanatorio|laboratorio/.test(n)) return "hospital";
  if (/aeropuerto/.test(n)) return "avion";
  if (/terminal|central de autobuses/.test(n)) return "qrobus";
  if (/escuela|universidad|facultad|prepa|colegio|instituto|tecnologico|\buaq\b|\btec\b|kinder|primaria|secundaria|campus/.test(n)) return "escuela";
  if (/parque|jardin|alameda|bosque|plaza de armas/.test(n)) return "parque";
  if (/bodega aurrera|walmart|soriana|chedraui|la comer|fresko|city market|costco|sams|\bheb\b|\boxxo\b|super|tienda|abarrotes/.test(n)) return "super";
  if (/mercado|tianguis/.test(n)) return "mercado";
  if (/plaza|centro comercial|mall|lifestyle|uptown|outlet|galerias|antea/.test(n)) return "plaza";
  if (/cafe|restaurante|taqueria|tacos|cocina|fonda|pizza|comida|starbucks/.test(n)) return "cafe";
  if (/iglesia|templo|parroquia|catedral|capilla|basilica/.test(n)) return "iglesia";
  if (/\b(abuel\w*|mama|papa|hij[oa]s?|tia|tio|herman[oa]s?|familia|novi[oa])\b/.test(n)) return "familia";
  return TIPOS_OSM[tipo] ?? "lugar";
}
// Cada tipo de lugar con su color, como en un sistema de transporte; los demas toman uno del resto
const TONOS = { casa: "tono-casa", escuela: "tono-escuela", trabajo: "tono-trabajo", hospital: "tono-salud", parque: "tono-hospital", super: "tono-maiz",
  mercado: "tono-maiz", plaza: "tono-ciruela", cafe: "tono-obsidiana", iglesia: "tono-anil", avion: "tono-trabajo", qrobus: "tono-anil", familia: "tono-ciruela" };
const tonoLugar = (nombre, i, tipo) => TONOS[iconoLugar(nombre, tipo)] ?? ["tono-anil", "tono-ciruela", "tono-maiz"][i % 3];
function pintarGuardados() {
  // Casa siempre primero: es el viaje que mas se repite.
  guardados.sort((a, b) => (b.nombre === "Casa") - (a.nombre === "Casa"));
  const casa = guardados.findIndex((g) => g.nombre === "Casa");
  $("vozCasa").hidden = casa < 0;
  $("vozCasa").dataset.i = casa;
  // En modo voz, los demas lugares tambien a un toque, hasta tres para no llenar la pantalla
  $("vozLugares").innerHTML = guardados.filter((g) => g.nombre !== "Casa").slice(0, 3).map((g) =>
    `<button type="button" class="boton-voz" data-i="${guardados.indexOf(g)}" aria-keyshortcuts="Shift+F10">${picto(iconoLugar(g.nombre))}Ir a ${escapar(g.nombre)}</button>`).join("");
  // Tus lugares como fichas grandes; si falta la casa, su ficha invita a agregarla.
  const ficha = (attrs, clase, icono, nombre, propio = false) => `<button type="button" class="lugar ${clase}" ${attrs}>
    <span class="lugar-icono">${picto(icono, icono === "plus" ? "picto-lucide" : "")}</span><span class="lugar-nombre"${propio ? ' translate="no"' : ""}>${escapar(nombre)}</span></button>`;
  const fichas = guardados.map((g, i) => ficha(`data-i="${i}" aria-keyshortcuts="Shift+F10" aria-label="Ir a ${escapar(g.nombre)}"`, tonoLugar(g.nombre, i), iconoLugar(g.nombre), g.nombre, true));
  if (!guardados.some((g) => g.nombre === "Casa")) fichas.push(ficha('data-nuevo="Casa"', "nuevo tono-casa", "casa", "Agregar casa"));
  if (guardados.length < 6) fichas.push(ficha('data-nuevo=""', "nuevo tono-ciruela", "plus", "Agregar"));
  $("guardados").innerHTML = fichas.join("");
  $("editarGuardados").hidden = !guardados.length;
  $("editarGuardados").textContent = editando ? "Listo" : "Editar";
  $("editarGuardados").setAttribute("aria-pressed", String(editando));
  const deshacer = quitado ? `<div class="fila"><span class="fila-texto"><strong>Quitaste ${escapar(quitado.lugar.nombre)}</strong></span>
      <button type="button" class="quitar" data-deshacer>Deshacer</button></div>` : "";
  const enInicio = quitado?.pantalla === "inicio";
  $("deshacerInicio").innerHTML = enInicio ? deshacer : "";
  $("deshacerInicio").hidden = !enInicio;
  $("listaGuardados").innerHTML = (quitado?.pantalla === "ajustes" ? `<li>${deshacer}</li>` : "") + (guardados.length
    ? guardados.map((g, i) => editando
      ? `<li><div class="fila">${miniFicha(tonoLugar(g.nombre, i), picto(iconoLugar(g.nombre)))}<span class="fila-texto"><strong translate="no">${escapar(g.nombre)}</strong></span>
          <div class="acciones-guardado"><button type="button" class="quitar" data-editar="${i}">Editar</button>
          <button type="button" class="quitar" data-quitar="${i}" aria-label="Quitar ${escapar(g.nombre)}">Quitar</button></div></div></li>`
      : `<li><button type="button" data-i="${i}">${miniFicha(tonoLugar(g.nombre, i), picto(iconoLugar(g.nombre)))}
          <span class="fila-texto"><strong translate="no">${escapar(g.nombre)}</strong><small>Ir a ${escapar(g.nombre)}</small></span>${ico("chevron", "chevron")}</button></li>`).join("")
    : quitado ? "" : `<li class="vacio">Cuando elijas un destino, toca "Guardar este lugar".</li>`);
}
function guardarLugares() {
  escribir("grieta-lugares", guardados);
  pintarGuardados();
}
const irA = (lugar) => { estado.editando = "hacia"; poner("destino", lugar); };

function prepararVozCamara() {
  const sintesis = window.speechSynthesis;
  if (!sintesis || acc.lector === "si") return;
  // Safari necesita una llamada a speak durante el toque, aunque todavía esté cargando las voces.
  const inicio = new SpeechSynthesisUtterance("");
  inicio.volume = 0;
  sintesis.speak(inicio);
  sintesis.cancel();
}
function hablarCamara(texto, urgente = false, alEmpezar) {
  if (document.body.dataset.pantalla !== "camara" || !camaraConVoz || microfonoActivo || acc.lector === "si") return;
  const sintesis = window.speechSynthesis;
  if (!urgente && (sintesis?.pending || (guia.activa && sintesis?.speaking))) return;
  const voces = sintesis?.getVoices() ?? [];
  const voz = voces.find((v) => v.localService && v.lang === "es-MX") ?? voces.find((v) => v.localService && v.lang.startsWith("es"));
  $("camaraAudio").textContent = voz ? "" : "Para escuchar sin enviar texto, instala una voz en español en los ajustes de tu teléfono. También puedes usar tu lector de pantalla.";
  if (!voz) return;
  if (urgente && (sintesis.speaking || sintesis.pending)) detenerVoz();
  const mensaje = new SpeechSynthesisUtterance(texto);
  mensaje.voice = voz;
  mensaje.lang = voz.lang;
  mensaje.rate = acc.lenta ? 0.8 : 1;
  mensaje.onstart = alEmpezar;
  sintesis.speak(mensaje);
}
CamaraGrieta.iniciarInterfaz({
  hablar: hablarCamara,
  prepararVoz: prepararVozCamara,
  vozOcupada: () => Boolean(window.speechSynthesis?.speaking || window.speechSynthesis?.pending),
  explorando: () => ToquesGrieta.describiendo,
  callar: detenerVoz,
  viaje: () => guia.activa && guia.camion ? { linea: guia.camion.linea, hacia: guia.camion.hacia } : null,
  rutas: () => Grieta.qrobus?.patrones ?? [],
  paradas: () => {
    const punto = guia.activa && guia.previo ? guia.previo : estado.gps;
    return (Grieta.qrobus?.paradas ?? []).filter((p) => punto && Grieta.metros(p[0], p[1], punto.lat, punto.lon) < 600).map((p) => p[2]);
  },
});
function abrirCamara() {
  cancelarDictado();
  detenerVoz();
  ir("camara");
  hablar("Cámara que habla. Toca Iniciar cámara para comenzar. Las imágenes se analizan solo en tu teléfono.", false, false, true);
}
$("vozCamara").addEventListener("click", abrirCamara);
$("abrirCamara").addEventListener("click", abrirCamara);
$("guiaCamara").addEventListener("click", abrirCamara);
$("camaraVolverGuia").addEventListener("click", () => ir(guia.activa ? "guia" : "inicio"));

ToquesGrieta.iniciar({
  activo: () => (document.body.dataset.pantalla === 'practica' || (acc.modoVoz && acc.toques)) && acc.lector !== 'si' && !(document.body.dataset.pantalla === 'bienvenida' && pasoActual === 'lector'),
  original: (elemento, atributo) => Interfaz.original(elemento, atributo),
  cancelar: detenerVoz,
  puedeAnunciar: () => !microfonoActivo,
  alDescribir: (elemento) => PracticaGrieta.descrito(elemento),
  decir: (texto) => { const anterior = ultimoMensaje; hablar(texto, false, true, true); ultimoMensaje = anterior; },
});

PracticaGrieta.iniciar({
  ir,
  lector: () => acc.lector === 'si',
  decir: (texto) => { if (acc.lector !== 'si') { const anterior = ultimoMensaje; hablar(texto, false, true, true); ultimoMensaje = anterior; } },
  guardar: () => escribir('grieta-practica-toques', true),
});

TutorialGrieta.iniciar({
  ir,
  modoVoz: () => acc.modoVoz,
  lector: () => acc.lector === 'si',
  decir: texto => { if (acc.modoVoz && acc.lector !== 'si') hablar(texto, false, true); },
  guardar: valor => escribir('grieta-tutorial', valor),
  practicar: desde => PracticaGrieta.abrir(desde),
  reiniciar: () => ToquesGrieta.reiniciar(),
});

// Botones del modo para personas ciegas.
// Lo que se dice al entrar: cuantos botones hay y en que orden, de arriba a abajo.
function ayudaVoz() {
  const botones = [...document.querySelectorAll("#inicioVoz .boton-voz")].filter((b) => !b.hidden).map((b) => Interfaz.original(b).trim());
  return `${ToquesGrieta.activo() ? ToquesGrieta.instrucciones + ' ' : ''}Estás en el inicio. Hay ${botones.length} botones grandes, de arriba a abajo: ${botones.join(", ")}. ` +
    "Para ir a algún lado, activa el primer botón y di el lugar después del tono.";
}
$("vozCasa").addEventListener("click", () => { hablar(frase("vamos_casa")); irA(guardados.find((g) => g.nombre === "Casa")); });
$("vozCamion").addEventListener("click", () => abrirCamiones());
$("vozDonde").addEventListener("click", () => dondeEstoy("voz"));
$("vozRepetir").addEventListener("click", () => hablar(ultimoMensaje || ayudaVoz()));
$("vozDestino").addEventListener("click", () => {
  if (Reconocer) return dictar($("vozDestino"));
  abrirBuscar("hacia");
  hablar("Este navegador no deja dictar. Escribe a dónde vas.");
});
$("vozLugares").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  const lugar = guardados[b.dataset.i];
  hablar(frase("vamos_lugar", { lugar: lugar.nombre }));
  irA(lugar);
});
$("guardados").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (!b.hasAttribute("data-nuevo")) return irA(guardados[b.dataset.i]);
  // Agregar: se busca el lugar y al elegirlo se guarda con ese nombre, o se pregunta cuál ponerle
  estado.guardarComo = b.dataset.nuevo || true;
  abrirBuscar("hacia");
  $("tituloPantalla").textContent = b.dataset.nuevo === "Casa" ? "¿Dónde está tu casa?" : "Agregar un lugar";
});
$("listaGuardados").addEventListener("click", (e) => {
  if (e.target.closest("[data-deshacer]")) return deshacerLugar();
  const editar = e.target.closest("[data-editar]");
  if (editar) return abrirAccionesLugar(editar, guardados[editar.dataset.editar]);
  const q = e.target.closest("[data-quitar]");
  if (q) return quitarLugar(guardados[q.dataset.quitar]);
  const b = e.target.closest("button[data-i]");
  if (b) { ir("inicio"); irA(guardados[b.dataset.i]); }
});
$("editarGuardados").addEventListener("click", () => { editando = !editando; quitado = null; pintarGuardados(); });
$("deshacerInicio").addEventListener("click", (e) => {
  if (e.target.closest("[data-deshacer]")) deshacerLugar();
});

const dialogoLugar = $("dialogoLugar");
const campoLugarGuardado = $("nombreLugarGuardado");
const selectorLugares = "#guardados button[data-i], #vozLugares button[data-i], #vozCasa[data-i]";
let lugarElegido = null, botonLugarElegido = null;
let pulsacionLugar = null, omitirClicLugar = false;

function enfocarLugarGuardado(lugar) {
  const indice = guardados.indexOf(lugar);
  if (document.body.dataset.pantalla === "ajustes") {
    $("listaGuardados").querySelector(`[data-editar="${indice}"], [data-i="${indice}"]`)?.focus();
  } else {
    const botones = acc.modoVoz ? [$("vozCasa"), ...$("vozLugares").children] : [...$("guardados").children];
    botones.find(boton => !boton.hidden && boton.dataset.i === String(indice))?.focus();
  }
}
function quitarLugar(lugar) {
  const indice = guardados.indexOf(lugar);
  if (indice < 0) return;
  const pantalla = document.body.dataset.pantalla;
  quitado = { lugar, i: indice, pantalla };
  guardados.splice(indice, 1);
  if (!guardados.length) editando = false;
  guardarLugares();
  $(pantalla === "ajustes" ? "listaGuardados" : "deshacerInicio").querySelector("[data-deshacer]")?.focus({ focusVisible: false });
}
function deshacerLugar() {
  if (!quitado) return;
  const { lugar, i } = quitado;
  quitado = null;
  guardados.splice(i, 0, lugar);
  guardarLugares();
  enfocarLugarGuardado(lugar);
  hablar(`${lugar.nombre} regresó a tus lugares.`, false, true);
}
function abrirAccionesLugar(boton, lugar = guardados[boton.dataset.i]) {
  if (!lugar || dialogoLugar.open) return;
  lugarElegido = lugar;
  botonLugarElegido = boton;
  $("tituloAccionesLugar").textContent = lugar.nombre;
  const indice = guardados.indexOf(lugar);
  $("fichaDialogoLugar").className = `mini-ficha ${tonoLugar(lugar.nombre, indice)}`;
  $("fichaDialogoLugar").innerHTML = picto(iconoLugar(lugar.nombre));
  $("accionesLugar").hidden = false;
  $("formularioLugar").hidden = true;
  campoLugarGuardado.value = lugar.nombre;
  $("otroNombreLugar").hidden = true;
  ToquesGrieta.reiniciar();
  dialogoLugar.showModal();
  $("tituloAccionesLugar").focus();
}
$("cerrarDialogoLugar").addEventListener("click", () => dialogoLugar.close());
dialogoLugar.addEventListener("close", () => {
  if (dialogoLugar.open) return;
  if (botonLugarElegido?.isConnected && !botonLugarElegido.closest("[hidden]")) botonLugarElegido.focus({ preventScroll: true });
  lugarElegido = botonLugarElegido = null;
});
dialogoLugar.addEventListener("click", (e) => {
  if (e.target !== dialogoLugar) return;
  const { left, right, top, bottom } = dialogoLugar.getBoundingClientRect();
  if (e.clientX < left || e.clientX > right || e.clientY < top || e.clientY > bottom) dialogoLugar.close();
});
$("editarNombreLugar").addEventListener("click", () => {
  $("accionesLugar").hidden = true;
  $("formularioLugar").hidden = false;
  campoLugarGuardado.focus();
  campoLugarGuardado.select();
});
campoLugarGuardado.addEventListener("input", () => { $("otroNombreLugar").hidden = true; });
$("quitarLugarInicio").addEventListener("click", () => {
  const lugar = lugarElegido;
  dialogoLugar.close();
  quitarLugar(lugar);
});
function nombreValidoLugar() {
  const nombre = campoLugarGuardado.value.trim().replace(/\s+/g, " ");
  const repetido = guardados.some(lugar => lugar !== lugarElegido && sinAcentos(lugar.nombre) === sinAcentos(nombre));
  $("otroNombreLugar").hidden = Boolean(nombre) && !repetido;
  if (!nombre || repetido) { campoLugarGuardado.focus(); return null; }
  return nombre.charAt(0).toUpperCase() + nombre.slice(1);
}
function guardarEdicionLugar(edicion, ubicacion = edicion.lugar) {
  const indice = guardados.indexOf(edicion.lugar);
  if (indice < 0) return null;
  const lugar = { ...edicion.lugar, nombre: edicion.nombre, lat: ubicacion.lat, lon: ubicacion.lon };
  guardados[indice] = lugar;
  quitado = null;
  guardarLugares();
  return lugar;
}
$("formularioLugar").addEventListener("submit", (e) => {
  e.preventDefault();
  const nombre = nombreValidoLugar();
  if (!nombre) return;
  const edicion = { lugar: lugarElegido, nombre };
  dialogoLugar.close();
  const lugar = guardarEdicionLugar(edicion);
  if (lugar) enfocarLugarGuardado(lugar);
});
$("cambiarUbicacionLugar").addEventListener("click", () => {
  const nombre = nombreValidoLugar();
  if (!nombre) return;
  cambioUbicacionGuardada = { lugar: lugarElegido, nombre };
  dialogoLugar.close();
  abrirBuscar("hacia");
});

function cancelarPulsacionLugar() {
  clearTimeout(pulsacionLugar?.reloj);
  pulsacionLugar = null;
}
addEventListener("pointerdown", (e) => {
  cancelarPulsacionLugar();
  omitirClicLugar = false;
  const boton = e.target.closest?.(selectorLugares);
  if (!boton || e.button !== 0 || !e.isPrimary) return;
  const { pointerId, clientX, clientY } = e;
  const reloj = setTimeout(() => {
    cancelarPulsacionLugar();
    if (!boton.isConnected || boton.closest("[hidden]")) return;
    omitirClicLugar = true;
    abrirAccionesLugar(boton);
  }, 500);
  pulsacionLugar = { pointerId, clientX, clientY, reloj };
}, { capture: true, passive: true });
addEventListener("pointermove", (e) => {
  if (pulsacionLugar?.pointerId !== e.pointerId) return;
  if (Math.hypot(e.clientX - pulsacionLugar.clientX, e.clientY - pulsacionLugar.clientY) <= 12) return;
  omitirClicLugar = true;
  cancelarPulsacionLugar();
}, { passive: true });
for (const tipo of ["pointerup", "pointercancel", "blur"]) addEventListener(tipo, cancelarPulsacionLugar, true);
addEventListener("scroll", () => {
  if (!pulsacionLugar) return;
  omitirClicLugar = true;
  cancelarPulsacionLugar();
}, { capture: true, passive: true });
addEventListener("click", (e) => {
  if (!omitirClicLugar || !e.detail) return;
  omitirClicLugar = false;
  e.preventDefault();
  e.stopImmediatePropagation();
}, true);
$("inicio").addEventListener("contextmenu", (e) => {
  const boton = e.target.closest(selectorLugares);
  if (!boton) return;
  e.preventDefault();
  if (e.button === 2 && !pulsacionLugar) abrirAccionesLugar(boton);
});
$("inicio").addEventListener("keydown", (e) => {
  if (e.key !== "ContextMenu" && !(e.shiftKey && e.key === "F10")) return;
  const boton = e.target.closest(selectorLugares);
  if (!boton) return;
  e.preventDefault();
  abrirAccionesLugar(boton);
});
$("guardarLugar").addEventListener("click", () => {
  const abierto = $("nombresLugar").hidden;
  $("nombresLugar").hidden = !abierto;
  $("guardarLugar").setAttribute("aria-expanded", String(abierto));
  if (abierto) $("nombresLugar").querySelector("button").focus();
});
function guardarComo(nombre) {
  const { lat, lon } = estado.destino;
  guardados = guardados.filter((g) => sinAcentos(g.nombre) !== sinAcentos(nombre)).concat({ nombre, lat, lon });
  guardarLugares();
  $("nombresLugar").hidden = true;
  $("otroNombre").hidden = true;
  $("guardarLugar").setAttribute("aria-expanded", "false");
  $("guardarLugar").textContent = `Guardado como ${nombre}`;
  $("guardarLugar").disabled = true;
  hablar(`Guardé ${estado.destino.nombre} como ${nombre}.`);
}
$("nombresLugar").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  // Un nombre propio para el lugar: el hospital, la casa de un familiar.
  if (b.hasAttribute("data-otro")) {
    $("otroNombre").hidden = false;
    $("campoNombre").value = "";
    return $("campoNombre").focus();
  }
  guardarComo(b.dataset.v);
});
function guardarNombreEscrito() {
  const nombre = $("campoNombre").value.trim().replace(/\s+/g, " ");
  if (!nombre) return $("campoNombre").focus();
  guardarComo(nombre.charAt(0).toUpperCase() + nombre.slice(1));
}
$("guardarNombre").addEventListener("click", guardarNombreEscrito);
$("campoNombre").addEventListener("keydown", (e) => { if (e.key === "Enter") guardarNombreEscrito(); });

// Grupos de opciones con flechas, como radios nativos.
function radios(id, alElegir) {
  const grupo = $(id);
  const marcar = (b) => {
    for (const x of grupo.querySelectorAll("[role=radio]")) {
      x.setAttribute("aria-checked", String(x === b));
      x.tabIndex = x === b ? 0 : -1;
    }
    b.classList.remove("salta");
    void b.offsetWidth;
    b.classList.add("salta");
    alElegir(b.dataset.v);
  };
  grupo.addEventListener("click", (e) => {
    const b = e.target.closest("[role=radio]");
    if (b && !b.disabled) marcar(b);
  });
  grupo.addEventListener("keydown", (e) => {
    const lista = [...grupo.querySelectorAll("[role=radio]:not(:disabled)")];
    const i = lista.indexOf(document.activeElement);
    const paso = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    if (i < 0 || !paso) return;
    e.preventDefault();
    const sig = lista[(i + paso + lista.length) % lista.length];
    sig.focus();
    marcar(sig);
  });
  return (v) => {
    for (const x of grupo.querySelectorAll("[role=radio]")) {
      x.setAttribute("aria-checked", String(x.dataset.v === v));
      x.tabIndex = x.dataset.v === v || (!v && x === grupo.firstElementChild) ? 0 : -1;
    }
  };
}

// API de Grieta para reportes y precios. Sin direccion configurada, esas funciones avisan y no mandan nada.
let API = "";
async function llamar(ruta, opciones = {}) {
  if (!API) throw new Error("sin api");
  const r = await fetch(`${API}${ruta}`, opciones).catch(() => { throw new Error("sin conexion"); });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "error");
  return r.status === 204 ? null : r.json();
}
const NOMBRES_REPORTE = {
  banqueta: "Banqueta rota", sin_rampa: "No hay rampa", sin_techo: "Parada sin techo",
  obstaculo: "Obstáculo en el camino", sin_senalizacion: "Falta señalización", referencia: "Referencia", otro: "Aviso",
};
async function reportesCerca(lat, lon, radio = 120) {
  try { return await llamar(`/reportes?lat=${lat}&lon=${lon}&radio=${radio}`); } catch { return []; }
}
// Al llegar a una parada lee lo que otros dejaron: como encontrarla y que cuidar.
async function leerReferencias(parada) {
  const lista = await reportesCerca(parada.lat, parada.lon, 60);
  if (!lista.length) return;
  const refs = lista.filter((x) => x.tipo === "referencia" && x.descripcion).map((x) => x.descripcion);
  const avisos = lista.filter((x) => x.tipo !== "referencia").map((x) => (NOMBRES_REPORTE[x.tipo] ?? "aviso").toLowerCase());
  const mensajes = [];
  if (refs.length) mensajes.push(frase("referencia_parada", { referencia: refs[0] }));
  if (avisos.length) {
    if (mensajes.length) mensajes.push(" ");
    mensajes.push(frase("aviso_parada", { avisos: [...new Set(avisos)].join(", ") }));
  }
  if (mensajes.length) hablar(mensajes, true);
}

// Reportar un problema donde estas parado.
const reporte = { tipo: null, lat: null, lon: null, parada: null };
// Lo demas del reporte aparece hasta elegir el problema, para que la pantalla pida una cosa a la vez.
const marcarReporte = radios("tipoReporte", (v) => {
  reporte.tipo = v;
  const nuevo = $("reporteResto").hidden && v;
  $("reporteResto").hidden = !v;
  if (v) $("reporteEstado").className = "nota";
  if (nuevo) setTimeout(() => $("enviarReporte").scrollIntoView({ block: "nearest", behavior: "smooth" }), 50);
});
function abrirReporte(paradaFijada = null) {
  Object.assign(reporte, { tipo: null, lat: null, lon: null, parada: null });
  marcarReporte(null);
  $("descripcion").value = "";
  $("foto").value = "";
  $("fotoTexto").textContent = "Agregar foto (si quieres)";
  $("reporteResto").hidden = true;
  $("reporteEstado").textContent = "";
  $("reporteEstado").className = "nota";
  $("reporteDonde").textContent = "Buscando dónde estás...";
  ir("reporte");
  const fijar = async (lat, lon) => {
    Object.assign(reporte, { lat, lon });
    const p = Grieta.pasanAqui(lat, lon, hoyDia(), ahoraMin(), 120)[0];
    reporte.parada = p?.nombre ?? null;
    // Cerca de una parada, el reporte queda en la parada para que lo encuentre quien la consulte.
    if (p) {
      Object.assign(reporte, { lat: p.lat, lon: p.lon });
      $("reporteDonde").textContent = `En la parada ${cruce(p.nombre)}`;
      return;
    }
    $("reporteDonde").textContent = "En tu ubicación actual";
    try {
      const r = await (await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lon}&limit=1`)).json();
      const calle = r.features[0]?.properties?.street ?? r.features[0]?.properties?.name;
      if (calle) $("reporteDonde").textContent = `En ${calle}`;
    } catch {}
  };
  if (paradaFijada) {
    Object.assign(reporte, { lat: paradaFijada.lat, lon: paradaFijada.lon, parada: paradaFijada.nombre });
    $("reporteDonde").textContent = `En la parada ${cruce(paradaFijada.nombre)}`;
    return;
  }
  navigator.geolocation?.getCurrentPosition(
    ({ coords }) => fijar(coords.latitude, coords.longitude),
    () => (estado.origen ? fijar(estado.origen.lat, estado.origen.lon) : ($("reporteDonde").textContent = "Activa la ubicación para reportar")),
    { enableHighAccuracy: true, timeout: 10000 },
  );
}
// Las fotos del telefono pesan varios MB y traen las coordenadas de donde se tomaron: se redibujan
// a 1600 px en JPEG, que no conserva esos datos. Si no se puede, no se sube la original.
async function achicarFoto(f) {
  try {
    const img = await createImageBitmap(f);
    const escala = Math.min(1, 1600 / Math.max(img.width, img.height));
    const lienzo = document.createElement("canvas");
    lienzo.width = Math.round(img.width * escala);
    lienzo.height = Math.round(img.height * escala);
    lienzo.getContext("2d").drawImage(img, 0, 0, lienzo.width, lienzo.height);
    return await new Promise((listo) => lienzo.toBlob(listo, "image/jpeg", 0.85));
  } catch {
    return null;
  }
}
$("foto").addEventListener("change", () => {
  const f = $("foto").files[0];
  $("fotoTexto").textContent = f ? "Foto lista. Toca para cambiarla" : "Agregar foto (si quieres)";
});
$("enviarReporte").addEventListener("click", async () => {
  const decirR = (t) => { $("reporteEstado").textContent = t; hablar(t, false, true); };
  if (!reporte.tipo) return decirR("Elige qué problema encontraste.");
  if (reporte.lat === null) return decirR("Todavía no sé dónde estás. Activa la ubicación.");
  if (!API) return decirR("Los reportes todavía no están conectados al servidor.");
  $("enviarReporte").disabled = true;
  try {
    const nuevo = await llamar("/reportes", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo: reporte.tipo, parada: reporte.parada, lat: reporte.lat, lon: reporte.lon, descripcion: $("descripcion").value.trim() || null }),
    });
    const f = $("foto").files[0];
    let conFoto = true;
    if (f) {
      try {
        const foto = await achicarFoto(f);
        if (!foto) throw new Error("foto");
        await llamar(`/reportes/${nuevo.id}/foto`, { method: "POST", headers: { "Content-Type": foto.type }, body: foto });
      } catch {
        conFoto = false;
      }
    }
    decirR(conFoto ? "Gracias. Tu reporte ayuda a quien pase por aquí." : "Se guardó tu reporte, pero no se pudo subir la foto.");
    $("reporteEstado").className = "nota listo";
    $("reporteResto").hidden = true;
    $("reporteEstado").scrollIntoView({ block: "nearest" });
    // El reporte ya existe: se limpia el formulario para que otro toque no lo mande dos veces.
    Object.assign(reporte, { tipo: null });
    marcarReporte(null);
    $("descripcion").value = "";
    $("foto").value = "";
    $("fotoTexto").textContent = "Agregar foto (si quieres)";
  } catch (err) {
    decirR(["sin api", "sin conexion"].includes(err.message)
      ? "No se pudo enviar: no hay conexión con Grieta. Revisa tu internet e intenta otra vez."
      : `No se pudo enviar: ${err.message}.`);
    $("reporteEstado").scrollIntoView({ block: "nearest" });
  } finally {
    $("enviarReporte").disabled = false;
  }
});

// El precio que le salio a alguien, para que el modelo aprenda.
$("enviarPrecio").addEventListener("click", async () => {
  try {
    await llamar("/precios-reportados", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        app: estado.app, precio: Number($("precio").value),
        lat_origen: estado.origen.lat, lon_origen: estado.origen.lon, lat_destino: estado.destino.lat, lon_destino: estado.destino.lon,
      }),
    });
    $("gracias").textContent = "Gracias: con tu precio Grieta calcula mejor.";
    $("compartirPrecio").hidden = true;
  } catch (err) {
    $("gracias").textContent = ["sin api", "sin conexion"].includes(err.message)
      ? "No se pudo enviar: no hay conexión con Grieta. Revisa tu internet e intenta otra vez."
      : `No se pudo enviar: ${err.message}.`;
  }
});

// Bienvenida: lo primero es saber si la persona ve la pantalla, para no darle un camino que no puede seguir.
const PASOS_VOZ = {
  lector: "Listo, Grieta te va a hablar. ¿Tu teléfono ya te lee la pantalla, como VoiceOver o TalkBack? Arriba, sí. Abajo, no.",
  ubicacion: "¿Usamos tu ubicación? Así sé desde dónde sales y cuándo avisarte que te bajes. Arriba, sí. Abajo, ahora no.",
  movilidad: "Tu perfil, 1 de 3. ¿Cómo te mueves? Arriba, camino sin problema. En medio, me cuesta caminar. Abajo, uso silla de ruedas o andadera. Al final puedes saltar estas preguntas.",
  oido: "2 de 3. ¿Escuchas bien los avisos? Arriba, sí. Abajo, me cuesta escuchar.",
  tarifa: "3 de 3. ¿Pagas Tarifa Unidos, el pasaje de 2 pesos para estudiantes, mayores de 60 y personas con discapacidad? Arriba, sí. Abajo, no.",
};
// Orden de la bienvenida; la pregunta del lector solo aparece con la guía por voz.
const ordenPasos = () => ["vista", ...(acc.modoVoz ? ["lector"] : ["forma"]), "ubicacion", "movilidad", "oido", "tarifa"];
let pasoActual = "vista";
function irPaso(p) {
  ToquesGrieta.reiniciar();
  const anteriorPaso = pasoActual;
  pasoActual = p;
  const orden = ordenPasos();
  const numero = orden.indexOf(p) + 1;
  const progreso = $("progresoBienvenida");
  progreso.className = `bienvenida-progreso progreso-${numero}`;
  progreso.setAttribute("aria-valuemax", String(orden.length));
  progreso.setAttribute("aria-valuenow", String(numero));
  progreso.setAttribute("aria-valuetext", `Paso ${numero} de ${orden.length}`);
  document.querySelector(`#bienvenida [data-paso="${p}"] .paso-numero`).textContent = `PASO ${numero} DE ${orden.length}`;
  for (const d of document.querySelectorAll("#bienvenida [data-paso]")) d.hidden = d.dataset.paso !== p;
  const titulo = document.querySelector(`#bienvenida [data-paso="${p}"] h1`);
  $("bienvenida").setAttribute("aria-labelledby", titulo.id);
  titulo.focus({ preventScroll: true });
  $("hoja").scrollTop = 0;
  if (acc.modoVoz && PASOS_VOZ[p]) hablar(`${p === 'ubicacion' && anteriorPaso === 'lector' && ToquesGrieta.activo() ? ToquesGrieta.instrucciones + ' ' : ''}${PASOS_VOZ[p]}`, false, true);
}
function abrirBienvenida() {
  ir("bienvenida", true);
  irPaso("vista");
}
function terminarBienvenida(saltarTutorial = false) {
  escribir("grieta-bienvenida", true);
  if (!saltarTutorial && !leer("grieta-tutorial", false)) return TutorialGrieta.abrir("inicio", true);
  ir("inicio", true);
  if (acc.modoVoz) hablar(ayudaVoz(), false, true);
}
$("saltarBienvenida").addEventListener("click", () => {
  escribir("grieta-tutorial", { version: 1, completado: false });
  terminarBienvenida(true);
});
document.querySelector('#bienvenida [data-paso="vista"]').addEventListener("click", (e) => {
  const b = e.target.closest("[data-v]");
  if (!b) return;
  const v = b.dataset.v;
  Object.assign(acc, { modoVoz: v === "voz", grande: v !== "vista", contraste: v === "poco", voz: v === "voz" });
  guardarAcc();
  aplicarAcc();
  irPaso(v === "voz" ? "lector" : "forma");
});
// Completa o fácil: quien ve elige cuánto quiere en pantalla; quien no ve ya va al modo de voz
document.querySelector('#bienvenida [data-paso="forma"]').addEventListener("click", (e) => {
  const b = e.target.closest("[data-forma]");
  if (!b) return;
  acc.facil = b.dataset.forma === "facil";
  guardarAcc();
  aplicarAcc();
  irPaso("ubicacion");
});
document.querySelector('#bienvenida [data-paso="lector"]').addEventListener("click", (e) => {
  const b = e.target.closest("[data-lector]");
  if (!b) return;
  acc.lector = b.dataset.lector;
  acc.voz = b.dataset.lector === "no";
  guardarAcc();
  aplicarAcc();
  irPaso("ubicacion");
});
for (const b of document.querySelectorAll("#bienvenida .regresar")) {
  b.addEventListener("click", () => {
    const orden = ordenPasos();
    irPaso(orden[Math.max(0, orden.indexOf(pasoActual) - 1)]);
  });
}
$("permisoUbicacion").addEventListener("click", () => {
  ubicar();
  irPaso("movilidad");
});
$("sinUbicacion").addEventListener("click", () => {
  sinUbicacion("");
  irPaso("movilidad");
});
// Las tres preguntas del perfil: cada respuesta ajusta lo mismo que la pantalla "Tu perfil".
$("bienvenida").addEventListener("click", (e) => {
  const b = e.target.closest("[data-movilidad], [data-oido], [data-tarifa], .saltar");
  if (!b) return;
  if (b.classList.contains("saltar")) return terminarBienvenida();
  if (b.dataset.movilidad) {
    Object.assign(acc, { movilidad: b.dataset.movilidad, camino: b.dataset.movilidad !== "normal" });
  } else if (b.dataset.oido) {
    acc.oido = b.dataset.oido;
    acc.voz = b.dataset.oido === "bien" && acc.modoVoz && acc.lector !== "si";
  } else {
    acc.unidos = b.dataset.tarifa === "si";
    escribir("grieta-perfil", true);
  }
  guardarAcc();
  aplicarAcc();
  if (b.dataset.movilidad) return irPaso("oido");
  if (b.dataset.oido) return irPaso("tarifa");
  terminarBienvenida();
});
// Perfil de viaje: lo que la persona necesita para moverse, guardado solo en este telefono.
// Se pregunta por necesidades, no por diagnosticos, y cada respuesta ajusta los mismos interruptores de Ajustes.
function vistaActual() {
  return acc.modoVoz ? "voz" : acc.grande && acc.contraste ? "poco" : "vista";
}
// El perfil en fichas de dos palabras, con el mismo dibujo y color que su pregunta; tocar una lleva a esa pregunta.
function fichasPerfil() {
  const movilidad = acc.movilidad ?? (acc.camino ? "poco" : "normal");
  return [
    ["perfilVista", "anil", "ojo", { vista: "Veo bien", poco: "Veo poco", voz: "Grieta me habla" }[vistaActual()]],
    ["perfilLengua", "hospital", "idioma", { es: "Español", oto: "Hñöñho", nah: "Náhuatl" }[acc.idioma] ?? "Español", true],
    acc.modoVoz && ["perfilLectorOpciones", "ciruela", "decir", acc.lector === "si" ? "Uso lector" : "Grieta me lee"],
    !acc.modoVoz && ["perfilForma", "obsidiana", "letra", acc.facil ? "Lo esencial" : "Todo completo"],
    ["perfilMovilidad", "maiz", movilidad === "silla" ? "silla" : "caminar", { normal: "Camino bien", poco: "Camino poco", silla: "Silla o andadera" }[movilidad]],
    ["perfilOido", "ciruela", "decir", acc.oido === "poco" ? "Escucho poco" : "Escucho bien"],
    ["perfilTarifa", "anil", "qrobus", acc.unidos ? "Tarifa Unidos" : "Tarifa normal"],
  ].filter(Boolean);
}
function resumenCortoPerfil() {
  const vista = { vista: "Ves bien", poco: "Ves poco", voz: "Grieta te habla" }[vistaActual()];
  const movilidad = acc.movilidad ?? (acc.camino ? "poco" : "normal");
  const movimiento = { normal: "Caminas bien", poco: "Caminas poco", silla: "Usas silla de ruedas" }[movilidad];
  const densidad = { completa: "Completa", facil: "Fácil", voz: "Voz" }[densidadActual()];
  const oido = acc.oido === "poco" ? "Avisos con vibración" : "Avisos con voz";
  const tarifa = acc.unidos ? "Tarifa Unidos" : "Tarifa normal";
  return [vista, movimiento, densidad, oido, tarifa, acc.modoVoz ? (acc.lector === "si" ? "Usas lector de pantalla" : "Grieta te habla") : "", acc.idioma === "es" ? "" : `Prefieres ${acc.idioma === "nah" ? NOMBRE_NAHUATL : NOMBRE_OTOMI}`].filter(Boolean).join(" · ");
}
function pintarResumenPerfil() {
  if (!$("textoPerfil")) return;
  const movilidad = acc.movilidad ?? (acc.camino ? "poco" : "normal");
  const pictograma = `#p-${{ normal: "caminar", poco: "caminar", silla: "silla" }[movilidad]}`;
  $("textoPerfil").textContent = resumenCortoPerfil();
  $("ajustesAvatar").setAttribute("href", pictograma);
  $("perfilFichas").innerHTML = fichasPerfil().map(([grupo, tono, picto, texto, nombrePropio]) =>
    `<button type="button" class="perfil-ficha" data-ir-perfil="${grupo}">
      <span class="mini-ficha tono-${tono}" aria-hidden="true"><svg class="picto"><use href="#p-${picto}"/></svg></span><span${nombrePropio ? ' translate="no"' : ""}>${escapar(texto)}</span></button>`).join("");
}
$("perfilFichas").addEventListener("click", (e) => {
  const b = e.target.closest("[data-ir-perfil]");
  if (!b) return;
  const item = document.querySelector(`[data-grupo-perfil="${b.dataset.irPerfil}"]`);
  item.scrollIntoView({ behavior: suave() ? "smooth" : "auto", block: "start" });
  item.querySelector('[aria-checked="true"]')?.focus({ preventScroll: true });
});
// Lo que cambia cada respuesta, abajo de su pregunta
const EFECTOS = {
  perfilVista: { vista: "Mapa y letra normal.", poco: "Letra grande y más contraste.", voz: "Pocos botones, muy grandes, y Grieta te dice todo en voz alta." },
  perfilLectorOpciones: { si: "Grieta no habla encima de tu lector.", no: "Grieta te lee todo en voz alta." },
  perfilMovilidad: { normal: "Te busco la parada que más te convenga.", poco: "Te busco paradas más cerca.", silla: "Paradas cerca, y te aviso si reportaron que no tienen rampa." },
  perfilOido: { bien: "Durante el viaje te aviso con voz.", poco: "Avisos en pantalla grande y con vibración, sin voz." },
  perfilTarifa: { si: "Calculo el camión a $2 y el transbordo gratis.", no: "Calculo el camión con la tarifa normal." },
  perfilForma: { completa: "Precios, horarios, comparar y esperar.", facil: "Solo lo esencial, con botones grandes." },
  perfilLengua: { es: "La interfaz está en español. El audio sigue en español.", oto: "La traducción de la interfaz todavía no está disponible. El audio sigue en español.", nah: "La traducción de la interfaz todavía no está disponible. El audio sigue en español." },
};
const efecto = (grupo, v) => { $(`${grupo}Efecto`).textContent = EFECTOS[grupo][v] ?? ""; };
const RESPUESTAS_PERFIL = {
  perfilVista: { vista: "Veo bien", poco: "Veo poco", voz: "Quiero que Grieta me hable" },
  perfilLectorOpciones: { si: "Uso lector de pantalla", no: "Quiero que Grieta me hable" },
  perfilForma: { completa: "Quiero todas las opciones", facil: "Quiero lo esencial" },
  perfilMovilidad: { normal: "Camino sin problema", poco: "Me cuesta caminar", silla: "Uso silla de ruedas o andadera" },
  perfilOido: { bien: "Escucho bien los avisos", poco: "Me cuesta escuchar" },
  perfilTarifa: { si: "Pago Tarifa Unidos", no: "Pago tarifa normal" },
  perfilLengua: { es: "Español", oto: NOMBRE_OTOMI, nah: NOMBRE_NAHUATL },
};
function actualizarFilasPerfil() {
  const movilidad = acc.movilidad ?? (acc.camino ? "poco" : "normal");
  const valores = {
    perfilVista: vistaActual(),
    perfilLectorOpciones: acc.lector ?? "no",
    perfilForma: acc.facil ? "facil" : "completa",
    perfilMovilidad: movilidad,
    perfilOido: acc.oido ?? "bien",
    perfilTarifa: acc.unidos ? "si" : "no",
    perfilLengua: acc.idioma,
  };
  for (const [grupo, valor] of Object.entries(valores)) {
    const fila = document.querySelector(`[data-grupo-perfil="${grupo}"]`);
    const respuesta = RESPUESTAS_PERFIL[grupo][valor];
    efecto(grupo, valor);
    fila.querySelector(".respuesta-perfil").textContent = respuesta;
  }
  marcarVista(valores.perfilVista);
  marcarLector(acc.modoVoz ? valores.perfilLectorOpciones : null);
  marcarForma(valores.perfilForma);
  marcarMovilidad(valores.perfilMovilidad);
  marcarOido(valores.perfilOido);
  marcarTarifa(valores.perfilTarifa);
  marcarLengua(valores.perfilLengua);
  $("perfilLector").hidden = !acc.modoVoz;
  $("preguntaForma").hidden = acc.modoVoz;
}
const cambiarPerfil = (cambio) => {
  cambio();
  guardarAcc();
  aplicarAcc();
  actualizarFilasPerfil();
  calcular();
};
const marcarVista = radios("perfilVista", (v) => cambiarPerfil(() => {
  efecto("perfilVista", v);
  Object.assign(acc, { modoVoz: v === "voz", grande: v !== "vista", contraste: v === "poco" });
  if (v === "voz") acc.voz = acc.lector !== "si";
  else acc.voz = false;
  $("perfilLector").hidden = v !== "voz";
}));
const marcarLector = radios("perfilLectorOpciones", (v) => cambiarPerfil(() => {
  efecto("perfilLectorOpciones", v);
  acc.lector = v;
  acc.voz = v === "no";
}));
const marcarMovilidad = radios("perfilMovilidad", (v) => cambiarPerfil(() => {
  efecto("perfilMovilidad", v);
  acc.movilidad = v;
  acc.camino = v !== "normal";
}));
const marcarOido = radios("perfilOido", (v) => cambiarPerfil(() => {
  efecto("perfilOido", v);
  acc.oido = v;
  acc.voz = v === "bien" && acc.modoVoz && acc.lector !== "si";
}));
const marcarForma = radios("perfilForma", (v) => cambiarPerfil(() => {
  efecto("perfilForma", v);
  acc.facil = v === "facil";
}));
const marcarTarifa = radios("perfilTarifa", (v) => cambiarPerfil(() => {
  efecto("perfilTarifa", v);
  acc.unidos = v === "si";
}));
const marcarLengua = radios("perfilLengua", (v) => cambiarPerfil(() => {
  acc.idioma = v;
  Interfaz.cambiar(v);
}));
function abrirPerfil() {
  marcarVista(vistaActual());
  marcarLector(acc.modoVoz ? acc.lector : null);
  marcarMovilidad(acc.movilidad ?? (acc.camino ? "poco" : "normal"));
  marcarOido(acc.oido ?? "bien");
  marcarTarifa(acc.unidos ? "si" : "no");
  $("perfilLector").hidden = !acc.modoVoz;
  marcarForma(acc.facil ? "facil" : "completa");
  actualizarFilasPerfil();
  ir("perfil");
}
$("abrirPerfil").addEventListener("click", abrirPerfil);
$("resumenPerfil").addEventListener("click", abrirPerfil);
$("completarPerfil").addEventListener("click", abrirPerfil);
$("perfilListo").addEventListener("click", () => {
  escribir("grieta-perfil", true);
  hablar("Listo, guardé tu perfil.", false, true);
  history.back();
});
$("cerrarInvita").addEventListener("click", () => {
  escribir("grieta-invita-cerrada", true);
  $("invitaPerfil").hidden = true;
});

// Medidas de la pantalla en Ajustes, para revisar como acomoda iOS la app instalada.
function medirPantalla() {
  const css = getComputedStyle(document.documentElement);
  const etiqueta = document.querySelector('#pestanas [data-tab="inicio"] .pestana-texto');
  const caja = etiqueta?.getBoundingClientRect();
  const estilo = etiqueta ? getComputedStyle(etiqueta) : null;
  const centro = caja ? document.elementFromPoint(caja.left + caja.width / 2, caja.top + caja.height / 2) : null;
  const pestanas = $("pestanas").getBoundingClientRect();
  const claseCentro = centro ? String(centro.className?.baseVal ?? centro.className ?? "") : "";
  const medidasBase = `Pantalla ${screen.width}×${screen.height} · vista ${innerWidth}×${innerHeight} · ` +
    `${navigator.standalone ? "instalada" : "navegador"} · zona segura ${css.getPropertyValue("--zona-arriba").trim()} / ${css.getPropertyValue("--zona-abajo").trim()}`;
  const diagnostico = `Inicio getBoundingClientRect: top ${caja?.top.toFixed(1) ?? "n/d"} px · height ${caja?.height.toFixed(1) ?? "n/d"} px · width ${caja?.width.toFixed(1) ?? "n/d"} px · ` +
    `color ${estilo?.color ?? "n/d"} · opacity ${estilo?.opacity ?? "n/d"} · visibility ${estilo?.visibility ?? "n/d"} · display ${estilo?.display ?? "n/d"} · ` +
    `font-size ${estilo?.fontSize ?? "n/d"} · font-family ${estilo?.fontFamily ?? "n/d"} · -webkit-text-fill-color ${estilo?.getPropertyValue("-webkit-text-fill-color") ?? "n/d"} · ` +
    `elementFromPoint ${centro?.tagName.toLowerCase() ?? "n/d"}#${centro?.id || "—"}.${claseCentro || "—"} · ` +
    `#pestanas top ${pestanas.top.toFixed(1)} px · height ${pestanas.height.toFixed(1)} px · bottom ${pestanas.bottom.toFixed(1)} px · ` +
    `visualViewport.height ${window.visualViewport?.height.toFixed(1) ?? "n/d"} px · matchMedia standalone ${matchMedia("(display-mode: standalone)").matches}`;
  const lineaBase = document.createElement("span");
  lineaBase.textContent = medidasBase;
  const lineaDiagnostico = document.createElement("span");
  lineaDiagnostico.textContent = diagnostico;
  $("medidas").replaceChildren(lineaBase, document.createElement("br"), lineaDiagnostico);
}
addEventListener("resize", () => { if ($("medidas")) medirPantalla(); });

// Sin conexion: la app y los horarios quedan guardados en el telefono.
Interfaz.iniciar(acc.idioma, () => {
  for (const id of ["oto", "nah"]) EFECTOS.perfilLengua[id] = Interfaz.disponiblePara(id)
    ? id === "oto" && Interfaz.parcialPara(id) ? "Traducción automática parcial. Algunos textos siguen en español. El audio sigue en español." : "Traducción automática provisional. El audio sigue en español."
    : "La traducción de la interfaz todavía no está disponible. El audio sigue en español.";
  const disponible = Interfaz.disponiblePara("nah");
  document.querySelector('#perfilLengua [data-v="nah"]').disabled = !disponible;
  $("nahuatlPendiente").hidden = disponible;
  actualizarFilasPerfil();
});
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
function avisoConexion() {
  avisar(navigator.onLine ? "" : "Sin internet: puedes ver qué camión pasa y tus lugares guardados; para buscar calles hace falta conexión.");
}
addEventListener("online", avisoConexion);
addEventListener("offline", avisoConexion);

const primeraVez = !leer("grieta-bienvenida", false);
if (primeraVez) abrirBienvenida();
else {
  history.replaceState({ p: "inicio" }, "");
  mostrar("inicio");
}

Promise.all([
  Grieta.cargar(),
  fetch("datos/lugares.json").then((r) => r.json()),
  fetch("datos/config.json").then((r) => r.json()).catch(() => ({})),
]).then(([, l, config]) => {
  lugares = l;
  prepararLenguas(config);
  // En local se usa la API local, para que las pruebas no escriban en la base de produccion.
  API = ["localhost", "127.0.0.1"].includes(location.hostname) ? "http://localhost:3000/api" : config.api || "";
  pintarImpacto();
  pintarGuardados();
  avisoConexion();
  medirPantalla();
  if (!primeraVez) ubicar();
  accionInicial();
});

// Accesos directos del icono de la app (manifest): llegan como ?accion= y se hacen en cuanto hay ubicacion
async function accionInicial() {
  const accion = new URLSearchParams(location.search).get("accion");
  if (!accion || primeraVez) return;
  history.replaceState({ p: "inicio" }, "", location.pathname);
  for (let i = 0; i < 24 && !estado.gps; i++) await new Promise((r) => setTimeout(r, 250));
  if (accion === "casa") {
    const casa = guardados.find((g) => g.nombre === "Casa");
    return casa ? irA(casa) : $("guardados").querySelector('[data-nuevo="Casa"]')?.click();
  }
  if (accion === "camiones") return abrirCamiones();
  if (accion === "donde") return abrirUbicacion();
}

// Tarjeta para ensenarle al chofer a donde vas, con letra enorme. En camion dice la parada; en app, el destino.
function tarjetaChofer(abierta) {
  $("chofer").hidden = !abierta;
  // Mientras esta abierta, lo demas no recibe el foco ni lo lee el lector de pantalla.
  for (const e of document.body.children) if (e !== $("chofer") && e.tagName !== "SCRIPT") e.inert = abierta;
  if (abierta) $("choferDestino").focus();
  else if (!$("avisarChofer").closest("[hidden]")) $("avisarChofer").focus();
}
$("avisarChofer").addEventListener("click", () => {
  const c = guia.camion;
  const destino = c ? c.baja : estado.destino?.nombre;
  if (!destino) return;
  $("choferLinea").textContent = c ? `Ruta ${c.linea}` : "";
  $("choferLinea").hidden = !c;
  $("choferDestino").textContent = `Voy a ${cruce(destino)}.`;
  tarjetaChofer(true);
});
$("choferVoz").addEventListener("click", () => hablar(`${Interfaz.original($("choferDestino"))} ¿Me avisa cuando lleguemos, por favor?`, false, false, true));
$("choferCerrar").addEventListener("click", () => tarjetaChofer(false));
addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("chofer").hidden) tarjetaChofer(false); });
