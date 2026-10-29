const $ = (id) => document.getElementById(id);
const pesos = (x) => `$${Math.round(x)}`;
const QUERETARO = [20.6, -100.4];
const RADIO_KM = 40;
const ESPERAS = [0, 15, 30, 60];
const DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const ACCIONES = { "pedir ya": "Pídelo ya", esperar: "Espera un poco", camion: "Vete en camión" };
// Cada veredicto lleva su forma, para no depender solo del color.
const SIMBOLOS = { "pedir ya": "✓", esperar: "!", camion: "✕" };

const escapar = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
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
const icono = (clase) => L.divIcon({ className: "", html: `<span class="marca ${clase}"></span>`, iconSize: [18, 18] });

const estado = { origen: null, destino: null, editando: "hacia", kmCalle: null, momento: 0, otra: null, prisa: 20, app: null, gps: null, elegida: null };
const capas = {};
let lugares = [];

// Ajustes guardados en este telefono.
const acc = { grande: false, contraste: false, daltonico: false, voz: true, lenta: false, camino: false, unidos: false, ...leer("grieta-acc", {}) };
const OPCIONES = { grande: "optGrande", contraste: "optContraste", daltonico: "optDaltonico", voz: "optVoz", lenta: "optLenta", camino: "optCamino", unidos: "optUnidos" };
function aplicarAcc() {
  document.documentElement.classList.toggle("grande", acc.grande);
  document.documentElement.classList.toggle("contraste", acc.contraste);
  document.documentElement.classList.toggle("daltonico", acc.daltonico);
  for (const [k, id] of Object.entries(OPCIONES)) $(id).checked = acc[k];
  $("optUnidos2").checked = acc.unidos;
  recolorear();
}
const guardarAcc = () => escribir("grieta-acc", acc);
for (const [k, id] of Object.entries(OPCIONES)) {
  $(id).addEventListener("change", (e) => {
    acc[k] = e.target.checked;
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
  inicio: { tab: "inicio", mapa: true },
  buscar: { tab: "inicio", encabezado: true },
  opciones: { tab: "inicio", mapa: true, encabezado: true },
  detalle: { tab: "inicio", mapa: true, encabezado: true },
  camiones: { tab: "inicio", encabezado: true },
  guia: {},
  reporte: { tab: "reporte" },
  ajustes: { tab: "ajustes" },
  viajes: { tab: "viajes" },
};
const titulos = { buscar: "Buscar", camiones: "Camiones cerca" };

function mostrar(nombre) {
  const conf = PANTALLAS[nombre];
  if (!$("chofer").hidden) tarjetaChofer(false);
  if (guia.activa && nombre !== "guia") terminarGuia(true);
  if (nombre === "inicio") limpiarRuta();
  if (nombre === "opciones") quitarTrazo();
  for (const s of document.querySelectorAll(".pantalla")) s.hidden = s.id !== nombre;
  document.body.dataset.pantalla = nombre;
  document.body.classList.toggle("con-mapa", Boolean(conf.mapa));
  document.body.classList.remove("alerta");
  $("encabezado").hidden = !conf.encabezado;
  if (conf.encabezado) $("tituloPantalla").textContent = titulos[nombre] ?? "";
  $("pestanas").hidden = !conf.tab;
  for (const b of $("pestanas").children) {
    if (b.dataset.tab === conf.tab) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  }
  $("hoja").scrollTop = 0;
  // El foco va al titulo para que el lector de pantalla anuncie el cambio.
  const titulo = conf.encabezado ? $("tituloPantalla") : [...$(nombre).querySelectorAll("h1")].find((h) => !h.closest("[hidden]"));
  titulo?.focus({ preventScroll: true });
  setTimeout(() => { mapa.invalidateSize(); if (conf.mapa) reencuadrar(nombre); }, 60);
}
// Un mapa que estuvo oculto pierde el encuadre; se rehace con lo que toca en cada pantalla.
function reencuadrar(nombre) {
  const capa = nombre === "detalle" ? capas.camion ?? capas.linea : nombre === "opciones" ? capas.linea : null;
  if (capa) return encuadrar(capa.getBounds());
  const c = estado.gps ?? estado.origen;
  if (nombre === "inicio" && c) mapa.setView([c.lat, c.lon], 15);
}
function ir(nombre, reemplazar) {
  if (history.state?.p !== nombre) history[reemplazar ? "replaceState" : "pushState"]({ p: nombre }, "");
  mostrar(nombre);
}
addEventListener("popstate", (e) => mostrar(e.state?.p ?? "inicio"));
$("atras").addEventListener("click", () => (history.state && history.length > 1 ? history.back() : ir("inicio", true)));
$("pestanas").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  const tab = b.dataset.tab;
  if (tab === "reporte") return abrirReporte();
  if (tab === "viajes") pintarViajes();
  ir(tab);
});

// Voz y vibracion, con un tono por pulso para que en iPhone tambien haya senal.
let vozGrieta = null;
let audio;
let ultimoDicho = "";
// Los nombres de las paradas son cruces escritos con abreviaturas: se leen como se dicen.
const DECIR = [[/\s*\/\s*/g, " y "], [/\bBlvd\./g, "bulevar"], [/\bAv\./g, "avenida"], [/\bFracc\./g, "fraccionamiento"], [/\bCol\./g, "colonia"], [/\bUaq\b/g, "UAQ"]];
// Lo urgente interrumpe lo que se esta diciendo; lo secundario espera su turno.
function hablar(texto, enCola = false) {
  ultimoDicho = texto;
  if (!acc.voz || !("speechSynthesis" in window)) return;
  if (!enCola) speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(DECIR.reduce((t, [a, b]) => t.replace(a, b), texto));
  vozGrieta ??= speechSynthesis.getVoices().find((v) => v.lang === "es-MX") ?? speechSynthesis.getVoices().find((v) => v.lang.startsWith("es"));
  if (vozGrieta) u.voice = vozGrieta;
  u.lang = "es-MX";
  u.rate = acc.lenta ? 0.8 : 1;
  speechSynthesis.speak(u);
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

function poner(cual, lugar) {
  estado[cual] = lugar;
  capas[cual]?.remove();
  capas[cual] = L.marker([lugar.lat, lugar.lon], { icon: icono(cual), keyboard: false }).addTo(mapa);
  if (cual === "origen") $("desdeTexto").textContent = `Sales de ${esGps(lugar) ? "tu ubicación" : lugar.nombre}`;
  estado.editando = "hacia";
  if (estado.origen && estado.destino) return trazar();
  const enBuscar = document.body.dataset.pantalla === "buscar";
  if (cual === "destino") {
    // Sin origen todavia: el mismo buscador pregunta desde donde sale.
    mapa.setView([lugar.lat, lugar.lon], 14);
    if (!enBuscar) ir("buscar");
    prepararBuscar("desde");
    avisar(`Vas a ${lugar.nombre}. Ahora dime desde dónde sales.`);
  } else if (enBuscar) {
    history.back();
  }
}

function ubicar(alTerminar) {
  if (!navigator.geolocation) return sinUbicacion("Tu navegador no comparte la ubicación.", alTerminar);
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      if (!dentroDeQueretaro(coords.latitude, coords.longitude)) return sinUbicacion("Estás fuera de Querétaro.", alTerminar);
      estado.gps = { nombre: "Tu ubicación", lat: coords.latitude, lon: coords.longitude };
      if (!estado.origen) {
        poner("origen", estado.gps);
        mapa.setView([coords.latitude, coords.longitude], 15);
      }
      alTerminar?.(true);
    },
    () => sinUbicacion("No pude ver tu ubicación.", alTerminar),
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
  );
}
function sinUbicacion(texto, alTerminar) {
  if (!estado.origen) $("desdeTexto").textContent = `${texto} ¿Desde dónde sales?`;
  $("cambiarDesde").textContent = estado.origen ? "Cambiar" : "Elegir";
  alTerminar?.(false);
}
$("cambiarDesde").addEventListener("click", () => abrirBuscar("desde"));

// Buscador
let recientes = leer("grieta-recientes", []);
function guardarReciente(l) {
  if (esGps(l)) return;
  recientes = [{ nombre: l.nombre, detalle: l.detalle ?? "", lat: l.lat, lon: l.lon }]
    .concat(recientes.filter((r) => r.nombre !== l.nombre || Grieta.metros(r.lat, r.lon, l.lat, l.lon) > 30)).slice(0, 5);
  escribir("grieta-recientes", recientes);
}

function prepararBuscar(modo) {
  estado.editando = modo;
  titulos.buscar = modo === "desde" ? "¿Desde dónde sales?" : "Buscar";
  $("tituloPantalla").textContent = titulos.buscar;
  $("campoBuscar").value = "";
  $("campoBuscar").placeholder = modo === "desde" ? "Desde dónde sales" : "Escribe un lugar o una calle";
  sugerir("");
}
function abrirBuscar(modo) {
  ir("buscar");
  prepararBuscar(modo);
}
$("abrirBuscar").addEventListener("click", () => abrirBuscar("hacia"));

const filaLugar = (l, i, icon = "pin") => `<li><button type="button" data-i="${i}">
  <span class="circulo${icon === "reloj" ? " tenue" : ""}">${ico(icon)}</span>
  <span class="fila-texto"><strong>${escapar(l.nombre)}</strong>${l.detalle ? `<small>${escapar(l.detalle)}</small>` : ""}</span>
  ${ico("chevron", "chevron")}</button></li>`;

const cerca = () => estado.gps ?? estado.origen;
function conDistancia(l) {
  const c = cerca();
  if (!c || l.detalle) return l;
  const km = Grieta.metros(c.lat, c.lon, l.lat, l.lon) / 1000;
  return { ...l, detalle: km < 1 ? `A ${Math.round(km * 1000)} m` : `A ${km.toFixed(1)} km` };
}

let espera;
function sugerir(texto) {
  clearTimeout(espera);
  const lista = $("resultados");
  const vacio = texto.trim().length < 3;
  $("bloqueRecientes").hidden = !vacio || !recientes.length;
  $("tituloResultados").textContent = vacio ? "Resultados cerca de ti" : "Resultados";
  $("recientes").innerHTML = recientes.map((l, i) => filaLugar(l, i, "reloj")).join("");
  if (vacio) {
    const c = cerca();
    const base = lugares.map(conDistancia);
    if (c) base.sort((a, b) => Grieta.metros(c.lat, c.lon, a.lat, a.lon) - Grieta.metros(c.lat, c.lon, b.lat, b.lon));
    const fijos = (estado.editando === "desde" && estado.gps ? [{ ...estado.gps, detalle: "Donde estás ahora" }] : []).concat(base.slice(0, 6));
    estado.resultados = fijos;
    lista.innerHTML = fijos.map((l, i) => filaLugar(l, i, esGps(l) ? "localizar" : "pin")).join("");
    return;
  }
  // Primero los lugares guardados y los de la app que coinciden; el buscador de mapas no siempre los conoce por su nombre completo.
  const buscado = sinAcentos(texto);
  const propios = [...guardados, ...lugares].filter((l) => sinAcentos(l.nombre).includes(buscado)).map(conDistancia);
  const pintarResultados = (res, vacio) => {
    estado.resultados = propios.concat(res).slice(0, 8);
    estado.buscado = true;
    lista.innerHTML = estado.resultados.length ? estado.resultados.map((l, i) => filaLugar(l, i)).join("") : `<li class="vacio">${vacio}</li>`;
  };
  espera = setTimeout(async () => {
    const c = cerca() ?? { lat: QUERETARO[0], lon: QUERETARO[1] };
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(texto)}&lat=${c.lat}&lon=${c.lon}&limit=6&bbox=-100.65,20.4,-100.15,20.9`;
    try {
      const { features } = await (await fetch(url)).json();
      const res = features.map(({ properties: p, geometry: g }) => ({
        nombre: p.name ?? p.street ?? "Sin nombre",
        detalle: [p.street && p.name ? p.street : null, p.district ?? p.city].filter(Boolean).join(", "),
        lat: g.coordinates[1], lon: g.coordinates[0],
      }));
      pintarResultados(res, "No encontré ese lugar. Prueba con otro nombre o toca el mapa en Inicio.");
    } catch {
      pintarResultados([], "No hay conexión con el buscador. Elige un lugar guardado o toca el mapa en Inicio.");
    }
  }, 300);
}
function elegir(lugar) {
  if (!lugar) return;
  guardarReciente(lugar);
  poner(estado.editando === "desde" ? "origen" : "destino", lugar);
}
$("resultados").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (b) elegir(estado.resultados?.[b.dataset.i]);
});
$("recientes").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (b) elegir(recientes[b.dataset.i]);
});
$("campoBuscar").addEventListener("input", (e) => sugerir(e.target.value));
$("campoBuscar").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && estado.resultados?.length && e.target.value.trim().length >= 3) elegir(estado.resultados[0]);
});

mapa.on("click", async ({ latlng }) => {
  if (document.body.dataset.pantalla !== "inicio" || !dentroDeQueretaro(latlng.lat, latlng.lng)) return;
  const cual = estado.editando === "desde" || !estado.origen ? "origen" : "destino";
  const lugar = { nombre: "Punto en el mapa", lat: latlng.lat, lon: latlng.lng };
  // Primero el nombre de la calle, para que la pantalla siguiente no diga "punto en el mapa".
  try {
    const r = await (await fetch(`https://photon.komoot.io/reverse?lat=${latlng.lat}&lon=${latlng.lng}&limit=1`)).json();
    const p = r.features[0]?.properties;
    lugar.nombre = p?.name ?? ([p?.street, p?.housenumber].filter(Boolean).join(" ") || lugar.nombre);
  } catch {}
  poner(cual, lugar);
});

// Ruta y opciones
async function trazar() {
  const { origen: o, destino: d } = estado;
  avisar("Buscando cómo llegar...");
  limpiarRuta(true);
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${o.lon},${o.lat};${d.lon},${d.lat}?overview=full&geometries=geojson`;
    const r = await (await fetch(url, { signal: AbortSignal.timeout(6000) })).json();
    estado.kmCalle = r.routes[0].distance / 1000;
    capas.linea = L.geoJSON(r.routes[0].geometry, { style: { color: tono("--ambar"), weight: 5, opacity: 0.95 } }).addTo(mapa);
  } catch {
    estado.kmCalle = null;
    capas.linea = L.polyline([[o.lat, o.lon], [d.lat, d.lon]], { color: tono("--ambar"), weight: 4, dashArray: "4 8" }).addTo(mapa);
  }
  avisar("");
  estado.momento = 0;
  estado.otra = null;
  titulos.opciones = `A ${d.nombre}`;
  ir("opciones", document.body.dataset.pantalla === "buscar");
  calcular();
  setTimeout(() => encuadrar(capas.linea.getBounds()), 120);
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

const encuadrar = (limites) => mapa.fitBounds(limites, { padding: [28, 28] });

function momentos() {
  const dia = hoyDia();
  const minuto = ahoraMin();
  const lista = ESPERAS.map((m) => ({ dia, minuto: minuto + m, etiqueta: m ? (m < 60 ? `En ${m} min` : "En 1 h") : "Ahora" }));
  lista.push(estado.otra ? { ...estado.otra, etiqueta: hora(estado.otra.minuto) } : { dia, minuto: minuto + 120, etiqueta: "Otra hora", vacia: true });
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
    tarifa: acc.unidos ? { pasaje: 2, transbordo: 0 } : undefined,
  });
  estado.r = r;
  pintarOpciones(r);
  pintarEspera(lista, precios, base);
  if (estado.elegida && document.body.dataset.pantalla === "detalle") {
    // Al cambiar la hora o el precio, el detalle se rehace con el mismo tipo de camino.
    const igual = r.opciones.find((o) => tituloOpcion(o) === tituloOpcion(estado.elegida)) ?? (estado.elegida.tipo === "app" ? r.opciones.find((o) => o.tipo === "app") : null);
    if (igual) { estado.elegida = igual; pintarDetalle(true); }
  }
  pintarVeredicto(r);
}

function tituloOpcion(o) {
  if (o.tipo === "app") return o.opcion.replace("Solo app (", "").replace(")", "");
  const lineas = o.pasos.filter((p) => p.tipo === "camion").map((p) => p.linea);
  const apps = o.pasos.filter((p) => p.tipo === "app").map((p) => Grieta.nombreApp(p.app));
  const camion = apps.length ? lineas.join(" + ") : `Qrobus ${lineas.join(" + ")}`;
  return o.pasos[0].tipo === "app" ? [apps[0], camion, ...apps.slice(1)].join(" + ") : [camion, ...apps].join(" + ");
}
const caminata = (o) => Math.round((o.pasos ?? []).filter((p) => p.tipo === "caminar").reduce((s, p) => s + p.min, 0));
const iconoOpcion = (o) => (o.tipo === "app" ? "auto" : o.tipo === "caminando+caminando" ? "camion" : "ruta");

// Maximo tres caminos: el mas rapido, el mas barato y uno equilibrado si es distinto.
function elegirTarjetas(r) {
  const ops = r.opciones;
  if (!ops.length) return [];
  const rapida = ops.reduce((a, b) => (b.minutos < a.minutos ? b : a));
  const barata = ops.reduce((a, b) => (b.costo < a.costo ? b : a));
  const valor = (o) => o.costo + 1.5 * o.minutos;
  const equilibrada = ops.reduce((a, b) => (valor(b) < valor(a) ? b : a));
  const lista = [];
  const agregar = (o, etiqueta) => {
    const ya = lista.find((x) => x.o === o);
    if (ya) ya.etiquetas.push(etiqueta);
    else lista.push({ o, etiquetas: [etiqueta] });
  };
  agregar(equilibrada, "Recomendado");
  agregar(rapida, "Más rápido");
  agregar(barata, "Más barato");
  // Si quedan menos de tres, la siguiente mejor como alternativa.
  const resto = ops.filter((o) => !lista.some((x) => x.o === o)).sort((a, b) => valor(a) - valor(b));
  if (lista.length < 3 && resto.length) agregar(resto[0], "Otra opción");
  return lista;
}

const llegada = (o) => estado.r.ctx.minuto + o.minutos;

function pintarOpciones(r) {
  titulos.opciones = `A ${estado.destino.nombre}`;
  if (document.body.dataset.pantalla === "opciones") $("tituloPantalla").textContent = titulos.opciones;
  const ya = guardados.find((g) => Grieta.metros(g.lat, g.lon, estado.destino.lat, estado.destino.lon) < 30);
  $("guardarLugar").textContent = ya ? `Guardado como ${ya.nombre}` : "Guardar este lugar";
  $("guardarLugar").disabled = Boolean(ya);
  const cuando = estado.momento === 0 ? "" : ` · saliendo ${estado.momento < ESPERAS.length ? momentos()[estado.momento].etiqueta.toLowerCase() : `el ${DIAS[r.ctx.dia]} a las ${hora(r.ctx.minuto)}`}`;
  $("resumenRuta").textContent = `Desde ${esGps(estado.origen) ? "tu ubicación" : estado.origen.nombre} · ${r.directo.km.toFixed(1)} km${cuando}`;
  // Los precios de las apps, a la vista sin tener que entrar a una opcion.
  const apps = [...r.directo.porApp].sort((a, b) => a.precio - b.precio);
  $("appsRapido").innerHTML = apps.map((x, i) => `<button type="button" class="app-rapida${i ? "" : " barata"}" data-app="${x.app}"
      aria-label="Abrir ${Grieta.nombreApp(x.app)}, unos ${Math.round(x.precio)} pesos${i ? "" : ", la más barata"}">
      <span>${Grieta.nombreApp(x.app)}</span><strong>${pesos(x.precio)}</strong>${i ? "" : `<small>Más barata</small>`}</button>`).join("");
  $("avisoRapido").textContent = "";
  $("compararPrecio").hidden = !r.opciones.some((o) => o.tipo === "app");
  estado.tarjetas = elegirTarjetas(r);
  $("cuantasOpciones").textContent = `${estado.tarjetas.length} ${estado.tarjetas.length === 1 ? "opción" : "opciones"}`;
  const primera = estado.tarjetas.length ? Math.min(...estado.tarjetas.map(({ o }) => llegada(o))) : null;
  $("llegasDesde").innerHTML = primera === null ? "" : `Llegas desde <strong>${hora(primera)}</strong>`;
  $("tarjetas").innerHTML = estado.tarjetas.map(({ o, etiquetas }, i) => {
    const pie = [`Llegas ${hora(llegada(o))}`, `${Math.round(o.minutos)} min`];
    if (caminata(o)) pie.push(`caminas ${caminata(o)} min`);
    return `<button type="button" class="tarjeta${i === 0 ? " principal" : ""}" data-i="${i}">
      <span class="circulo">${ico(iconoOpcion(o))}</span>
      <span class="fila-texto"><span class="etiqueta">${etiquetas.join(" · ")}</span>
        <strong>${escapar(tituloOpcion(o))}</strong><small>${pie.join(" · ")}</small></span>
      <span class="precio">${pesos(o.costo)}</span>${ico("chevron", "chevron")}
    </button>`;
  }).join("") || `<p class="nota">No encontré cómo llegar. Prueba con otro destino.</p>`;
  const hayCamion = r.opciones.some((o) => o.tipo !== "app");
  $("filaUnidos").hidden = !hayCamion;
  // Si el camion de la mejor opcion es de los ultimos del dia, se avisa a que hora pasa el ultimo.
  const conCamion = estado.tarjetas.map(({ o }) => o).find((o) => o.tipo !== "app");
  const c = conCamion?.pasos.find((p) => p.tipo === "camion");
  const quedan = c ? c.ultima - r.ctx.minuto : Infinity;
  $("ultimoCamion").hidden = !(quedan <= 120);
  if (quedan <= 120) {
    const app = [...r.directo.porApp].sort((x, y) => x.precio - y.precio)[0];
    $("ultimoCamion").innerHTML = `${ico("alerta")}<span class="fila-texto"><strong>El último ${escapar(c.linea)} de hoy pasa a las ${hora(c.ultima)}</strong>
      <small>Desde ${escapar(c.recorrido[0].nombre)}. Si lo pierdes, la app más barata te cuesta unos ${pesos(app.precio)} (${Grieta.nombreApp(app.app)}).</small></span>`;
  }
  if (!hayCamion) {
    $("tarjetas").innerHTML += `<p class="nota">${r.pasaCerca ? "Ningún Qrobus te lleva directo en la próxima hora." : "En la próxima hora no pasa ningún Qrobus cerca."}</p>`;
  }
}
$("tarjetas").addEventListener("click", (e) => {
  const t = e.target.closest(".tarjeta");
  if (!t) return;
  const { o, etiquetas } = estado.tarjetas[t.dataset.i];
  estado.elegida = o;
  estado.etiquetaElegida = etiquetas[0];
  titulos.detalle = tituloOpcion(o);
  ir("detalle");
  pintarDetalle();
});

// Comparar lo que marca la app: lleva directo al detalle del viaje en app, con el campo del precio listo.
$("compararPrecio").addEventListener("click", () => {
  const o = estado.r.opciones.find((x) => x.tipo === "app");
  if (!o) return;
  estado.elegida = o;
  estado.etiquetaElegida = "En app";
  titulos.detalle = tituloOpcion(o);
  ir("detalle");
  pintarDetalle();
  setTimeout(() => { $("appVista").scrollIntoView({ block: "center" }); $("appVista").focus({ preventScroll: true }); }, 150);
});

// Inicio de la franja de 3 horas que contiene ese minuto.
const inicioFranja = (minuto) => Math.max(...Grieta.CORTES.filter((c) => c * 60 <= minuto % 1440)) * 60;

function pintarEspera(lista, precios, base) {
  const cercanos = precios.slice(0, ESPERAS.length).map((p) => p.mejor.precio);
  const minimo = Math.min(...cercanos);
  $("horas").innerHTML = lista.map((m, i) => `
    <button type="button" data-i="${i}" aria-pressed="${i === estado.momento}" class="${i < ESPERAS.length && cercanos[i] === minimo ? "barata" : ""}"
      aria-label="${m.etiqueta}${m.vacia ? ", elegir día y hora" : `, ${Math.round(precios[i].mejor.precio)} pesos`}">
      <span>${m.etiqueta}</span><strong>${m.vacia ? "+" : pesos(precios[i].mejor.precio)}</strong>
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
    ? "Hoy no hay una franja más barata que la de ahorita. "
    : `La franja más barata hoy es de ${hora(barata.a)} a ${hora(barata.b)}: ${pesos(barata.p)}. `) +
    "Es lo normal según los registros: el precio esperado cambia por franjas de 3 horas, no en tiempo real.";
}
$("abrirEspera").addEventListener("click", () => {
  const abierto = $("abrirEspera").getAttribute("aria-expanded") === "true";
  $("abrirEspera").setAttribute("aria-expanded", String(!abierto));
  $("espera").hidden = abierto;
});
$("horas").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  estado.momento = Number(b.dataset.i);
  $("otraHora").hidden = estado.momento !== ESPERAS.length;
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
for (const id of ["dia", "hora"]) $(id).addEventListener("input", () => { leerOtra(); calcular(); });

// Detalle de un camino, con la hora de cada paso sacada de los mismos pasos.
function pasosDe(o) {
  if (o.tipo === "app") {
    const app = tituloOpcion(o);
    return [
      { titulo: `Pide ${app}`, nota: `Debería costar unos ${pesos(o.costo)}.`, hora: estado.r.ctx.minuto },
      { titulo: `Llegas a ${estado.destino.nombre}`, nota: `Unos ${Math.round(o.minutos)} minutos, contando la espera.`, hora: llegada(o) },
    ];
  }
  let t = estado.r.ctx.minuto;
  return o.pasos.map((p) => {
    const min = Math.max(1, Math.round(p.min));
    const inicio = p.tipo === "camion" ? p.sale : t;
    t = p.tipo === "camion" ? p.llega : t + p.min;
    if (p.tipo === "caminar" && p.transbordo) return { titulo: `Camina ${min} min y cambia de camión`, nota: p.parada, hora: inicio };
    if (p.tipo === "caminar") return p.hacia
      ? { titulo: `Camina ${min} min a la parada`, nota: p.parada, hora: inicio }
      : { titulo: `Camina ${min} min a tu destino`, nota: `${estado.destino.nombre}. Llegas a las ${hora(llegada(o))}.`, hora: inicio };
    if (p.tipo === "app") return p.hacia
      ? { titulo: `Pide ${Grieta.nombreApp(p.app)} hasta la parada`, nota: `${p.parada} · unos ${pesos(p.costo)}`, hora: inicio }
      : { titulo: `Pide ${Grieta.nombreApp(p.app)} a tu destino`, nota: `Unos ${pesos(p.costo)}. Llegas a las ${hora(llegada(o))}.`, hora: inicio };
    return { camion: true, titulo: `Toma la línea ${p.linea} a las ${hora(p.sale)}`, nota: `Hacia ${p.hacia}. Bájate en ${p.baja}, ${p.paradas} paradas después, a las ${hora(p.llega)}. Te aviso antes.`, hora: inicio };
  });
}

function pintarDetalle(sinMapa) {
  const o = estado.elegida;
  const esApp = o.tipo === "app";
  $("tituloPantalla").textContent = titulos.detalle = tituloOpcion(o);
  $("bloqueCamion").hidden = esApp;
  $("bloqueApp").hidden = !esApp;
  if (esApp) {
    pintarApps(o);
    if (!sinMapa) { quitarTrazo(); if (capas.linea) setTimeout(() => encuadrar(capas.linea.getBounds()), 120); }
    return;
  }
  const etiqueta = estado.etiquetaElegida ?? "Recomendado";
  $("detalleEtiqueta").textContent = etiqueta === "Recomendado" ? "Ruta recomendada" : etiqueta;
  $("detalleCifra").textContent = `${Math.round(o.minutos)} min · ${pesos(o.costo)}`;
  $("detalleLlegada").innerHTML = `Llegas <strong>${hora(llegada(o))}</strong>`;
  $("pasos").innerHTML = pasosDe(o).map((p, i) => `<li class="${p.camion ? "camion" : ""}">
    <span class="numero" aria-hidden="true">${i + 1}</span>
    <span class="fila-texto"><strong>${escapar(p.titulo)}</strong><small>${escapar(p.nota)}</small></span>
    <span class="hora">${hora(p.hora)}</span></li>`).join("");
  if (!sinMapa) dibujar(o);
}

function pintarApps(o) {
  const r = estado.r;
  const orden = [...r.directo.porApp].sort((a, b) => a.precio - b.precio);
  const barata = orden[0];
  $("appEtiqueta").textContent = estado.momento === 0 ? "Precio esperado ahora" : `Precio esperado a las ${hora(r.ctx.minuto)}`;
  $("appCifra").textContent = `${Grieta.nombreApp(barata.app)} ${pesos(barata.precio)}`;
  $("appRango").textContent = `Normal entre ${pesos(barata.bajo)} y ${pesos(barata.alto)} · llegas a las ${hora(llegada(o))}`;
  $("apps").innerHTML = orden.map((x, i) => `<li>
    <span class="fila-texto"><strong>${Grieta.nombreApp(x.app)}</strong>${i === 0 ? `<span class="etiqueta">Más barato</span>` : `<small>Normal entre ${pesos(x.bajo)} y ${pesos(x.alto)}</small>`}</span>
    <span class="precio">${pesos(x.precio)}</span></li>`).join("");
  // Un boton por app, la mas barata primero.
  $("abrirApps").innerHTML = orden.map((x, i) =>
    `<button type="button" class="boton${i ? " oscuro" : ""}" data-app="${x.app}">${ico("auto")}Abrir ${Grieta.nombreApp(x.app)} · ${pesos(x.precio)}</button>`).join("");
  $("appAviso").textContent = "";
}

$("empezar").addEventListener("click", () => iniciarGuia(estado.elegida));
$("avisarLlegada").addEventListener("click", () => iniciarDestino());
$("escuchar").addEventListener("click", () => hablar(pasosDe(estado.elegida).map((p) => `${p.titulo}. ${p.nota}`).join(" ")));

$("appVista").addEventListener("change", (e) => { estado.app = e.target.value || null; calcular(); });
$("prisa").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  for (const x of $("prisa").children) x.setAttribute("aria-pressed", String(x === b));
  estado.prisa = Number(b.dataset.v);
  calcular();
});
$("precio").addEventListener("input", calcular);

function pintarVeredicto(r) {
  const d = r.decision;
  $("enviarPrecio").hidden = !d || !API;
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
  // Muy arriba de lo normal: lo mas probable es alta demanda, y otra app puede salir mas barata.
  const otra = r.directo.porApp.filter((x) => x.app !== d.esperado.app).sort((x, y) => x.precio - y.precio)[0];
  const alta = d.relacion >= 1.4
    ? `<div class="aviso cuidado alta">${ico("alerta")}<span class="fila-texto"><strong>${Grieta.nombreApp(d.esperado.app)} está en alta demanda</strong>
        <small>Te marca ${pesos(visto)}; lo normal a esta hora es ${pesos(d.esperado.precio)}.${otra && otra.precio < visto * 0.85 ? ` ${Grieta.nombreApp(otra.app)} debería salir en unos ${pesos(otra.precio)}: revísala antes de pedir.` : ""}</small></span></div>`
    : "";
  $("veredicto").innerHTML = `${alta}
    <div class="recomendacion">
      <p class="etiqueta">Recomendación</p>
      <p class="veredicto"><span class="simbolo" aria-hidden="true">${SIMBOLOS[d.accion]}</span>${ACCIONES[d.accion]}</p>
      <p>Te marca ${pesos(visto)} y lo normal en ${Grieta.nombreApp(d.esperado.app)} a esta hora es ${pesos(d.esperado.precio)}.${porque}
        ${d.extra < 1e8 ? `El camión que ahorra tarda ${Math.round(d.extra)} min más.` : "Ningún camión ahorra al menos 30%."}</p>
      <button type="button" class="porque" aria-expanded="false" aria-controls="reglas">¿Por qué?</button>
      <ul id="reglas" class="reglas" hidden>${d.activas.slice(0, 3).map((a) => `<li>${Math.round(a.w * 100)}%: si ${a.texto}, ${ACCIONES[a.accion].toLowerCase()}</li>`).join("")}</ul>
    </div>`;
}
$("veredicto").addEventListener("click", (e) => {
  const b = e.target.closest(".porque");
  if (!b) return;
  const abierto = b.getAttribute("aria-expanded") === "true";
  b.setAttribute("aria-expanded", String(!abierto));
  $("reglas").hidden = abierto;
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
  const aviso = copiado
    ? `Copié "${destino}". En ${Grieta.nombreApp(app)}, pégalo como destino.`
    : `En ${Grieta.nombreApp(app)}, escribe como destino: ${destino}.`;
  for (const id of ["appAviso", "avisoRapido"]) $(id).textContent = aviso;
  hablar(aviso);
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
  const capasCamion = camiones.flatMap((c, k) => [
    L.polyline(c, { color: ambar, weight: 5, tono: "linea" }),
    ...(k > 0 ? [L.polyline([camiones[k - 1].at(-1), c[0]], estilo("caminando"))] : []),
    ...[c[0], c.at(-1)].map((x) => L.circleMarker(x, { radius: 5, color: "#0b0a09", weight: 2, fillColor: ambar, fillOpacity: 1, tono: "punto" })),
  ]);
  capas.camion = L.featureGroup([
    L.polyline(o.trazo.acceso.puntos, estilo(o.trazo.acceso.modo)),
    ...capasCamion,
    L.polyline(o.trazo.salida.puntos, estilo(o.trazo.salida.modo)),
  ]).addTo(mapa);
  setTimeout(() => encuadrar(capas.camion.getBounds()), 120);
}

// Al cambiar de tema, lo que ya esta dibujado toma los colores nuevos.
function recolorear() {
  if (typeof mapa === "undefined") return;
  const ambar = tono("--ambar");
  capas.linea?.setStyle?.({ color: ambar });
  capas.camion?.eachLayer((c) => c.setStyle(c.options.tono === "linea" ? { color: ambar } : c.options.tono === "punto" ? { fillColor: ambar } : { color: tono("--tinta") }));
}

// Camiones cerca
$("pasanAqui").addEventListener("click", () => abrirCamiones());
function abrirCamiones() {
  const punto = estado.gps ?? estado.origen;
  ir("camiones");
  const caja = $("camionesContenido");
  if (!punto) {
    caja.innerHTML = `<p class="texto">Primero necesito saber dónde estás. Activa la ubicación o elige desde dónde sales en Inicio.</p>`;
    return hablar("Primero necesito saber dónde estás.");
  }
  let lista = Grieta.pasanAqui(punto.lat, punto.lon, hoyDia(), ahoraMin());
  // Sin paradas con servicio a 350 m, se busca la mas cercana hasta 1 km para no dejar a nadie sin respuesta.
  if (!lista.length) lista = Grieta.pasanAqui(punto.lat, punto.lon, hoyDia(), ahoraMin(), 1000).slice(0, 1);
  if (!lista.length) {
    caja.innerHTML = `<p class="texto">No hay paradas de Qrobus con servicio a menos de un kilómetro.</p>`;
    return hablar("No hay paradas de Qrobus con servicio a menos de un kilómetro.");
  }
  const filas = (p) => `<ul class="filas">${p.lineas.slice(0, 6).map((l) => `<li><div class="fila">
      <span class="linea-caja">${escapar(l.linea)}</span>
      <span class="fila-texto"><strong>Hacia ${escapar(l.hacia)}</strong>${l.horas[1] !== undefined ? `<small>También a las ${hora(l.horas[1])}</small>` : ""}</span>
      <span class="hora-camion"><strong>${hora(l.horas[0])}</strong><small>según horario</small></span>
    </div></li>`).join("")}</ul>`;
  const p = lista[0];
  const minCaminar = Math.max(1, Math.round((p.m * 1.3) / 1000 / 4.5 * 60));
  caja.innerHTML = `
    <div class="parada-cerca">
      <span class="circulo-grande">${ico("camion")}</span>
      <p class="etiqueta">Parada más cercana · a ${Math.round(p.m)} m</p>
      <p class="parada-nombre">${escapar(cruce(p.nombre))}</p>
      <p class="nota">Camina ${minCaminar} min</p>
    </div>
    <button id="irParada" type="button" class="boton oscuro">${ico("ruta")}Ver cómo llegar a la parada</button>
    <h2>Próximos camiones</h2>
    ${filas(p)}
    <h2>Avisos de la parada</h2>
    <div id="avisosParada" class="avisos"><p class="nota">Buscando avisos...</p></div>
    ${lista.length > 1 ? `<h2>Otras paradas cerca</h2>${lista.slice(1).map((x) => `<h3>${escapar(x.nombre)} <span class="nota">a ${Math.round(x.m)} m</span></h3>${filas(x)}`).join("")}` : ""}
    <p class="nota pie">Las horas salen del horario oficial de Qrobus; el camión puede adelantarse o retrasarse.</p>`;
  $("irParada").addEventListener("click", () => poner("destino", { nombre: `Parada ${p.nombre}`, lat: p.lat, lon: p.lon }));
  hablar(`La parada más cercana es ${p.nombre}, a ${Math.round(p.m)} metros. ` +
    p.lineas.slice(0, 4).map((l) => `Línea ${l.linea} hacia ${l.hacia}, a las ${hora(l.horas[0])} según el horario.`).join(" "));
  reportesCerca(p.lat, p.lon, 60).then((avisos) => {
    const caja = $("avisosParada");
    if (!caja) return;
    caja.innerHTML = avisos.length
      ? avisos.slice(0, 4).map((a) => `<div class="aviso${a.tipo === "referencia" ? "" : " cuidado"}">
          ${ico(a.tipo === "referencia" ? "localizar" : "alerta")}
          <span class="fila-texto"><strong>${NOMBRES_REPORTE[a.tipo] ?? "Aviso"}</strong>${a.descripcion ? `<small>${escapar(a.descripcion)}</small>` : ""}</span></div>`).join("")
      : `<p class="nota">Nadie ha dejado avisos de esta parada. <button type="button" class="enlace" id="reportarParada">Reportar algo aquí</button></p>`;
    $("reportarParada")?.addEventListener("click", abrirReporte);
    if (avisos.length) leerReferencias(p);
  });
}

function dondeEstoy(destino) {
  const contar = (t) => { if (destino === "guia") $("guiaDetalle").textContent = t; else $("respuesta").textContent = t; };
  if (!navigator.geolocation) { contar("Tu navegador no comparte la ubicación."); return hablar("Tu navegador no comparte la ubicación."); }
  contar("Buscando dónde estás...");
  hablar("Buscando dónde estás.");
  navigator.geolocation.getCurrentPosition(async ({ coords }) => {
    const { latitude: lat, longitude: lon } = coords;
    let lugar = "";
    try {
      const r = await (await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lon}&limit=1`)).json();
      const p = r.features[0]?.properties ?? {};
      lugar = [p.street ? `${p.street}${p.housenumber ? " " + p.housenumber : ""}` : p.name, p.district ?? p.city].filter(Boolean).join(", ");
    } catch {}
    const parada = Grieta.pasanAqui(lat, lon, hoyDia(), ahoraMin(), 500)[0];
    const texto = `${lugar ? `Estás en ${lugar}.` : "No encontré el nombre de la calle."} ` +
      (parada ? `La parada más cercana es ${parada.nombre}, a ${Math.round(parada.m)} metros.` : "No hay paradas de Qrobus a menos de 500 metros.");
    contar(texto);
    hablar(texto);
  }, () => { contar("No pude ver tu ubicación."); hablar("No pude ver tu ubicación."); }, { enableHighAccuracy: true, timeout: 10000 });
}
$("dondeEstoy").addEventListener("click", () => dondeEstoy("inicio"));
$("dondeGuia").addEventListener("click", () => dondeEstoy("guia"));

// Dictar: llena el buscador, busca y lee las primeras opciones.
const Reconocer = window.SpeechRecognition || window.webkitSpeechRecognition;
function dictar(boton) {
  const rec = new Reconocer();
  rec.lang = "es-MX";
  boton.classList.add("oyendo");
  boton.setAttribute("aria-pressed", "true");
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  rec.onresult = (e) => {
    const texto = e.results[0][0].transcript;
    const dicho = sinAcentos(texto).replace(/^(a|al|a la|hacia|llevame a|ir a)\s+/, "");
    const guardado = guardados.find((g) => sinAcentos(g.nombre) === dicho);
    if (guardado) {
      hablar(`Vamos a ${guardado.nombre}.`);
      estado.editando = "hacia";
      return poner("destino", guardado);
    }
    if (document.body.dataset.pantalla !== "buscar") abrirBuscar("hacia");
    $("campoBuscar").value = texto;
    estado.resultados = null;
    estado.buscado = false;
    sugerir(texto);
    let intentos = 0;
    const leerRes = setInterval(() => {
      if (!estado.buscado && ++intentos < 12) return;
      clearInterval(leerRes);
      const res = estado.resultados ?? [];
      hablar(res.length
        ? `Encontré ${res.length} lugares. ` + res.slice(0, 3).map((l, i) => `${i + 1}: ${l.nombre}${l.detalle ? ", " + l.detalle : ""}.`).join(" ") + " Elige uno de la lista."
        : `No encontré ${texto}. Intenta con otro nombre.`);
    }, 400);
  };
  rec.onerror = () => hablar("No te escuché. Intenta otra vez.");
  rec.onend = () => { boton.classList.remove("oyendo"); boton.setAttribute("aria-pressed", "false"); };
  rec.start();
}
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
  $("guiaTitulo").innerHTML = escapar(cruce(titulo)).replace(/^Faltan (\d+)/, 'Faltan <span class="num">$1</span>');
}
function decir(titulo, detalle, etapa, alerta = false) {
  if (etapa) $("guiaEtapa").textContent = guia.camion && etapa !== "Llegaste" ? `${etapa} · ${guia.camion.linea}` : etapa;
  ponerTitulo(titulo);
  $("guiaDetalle").textContent = detalle ?? "";
  document.body.classList.toggle("alerta", alerta);
  pintarGuia();
  hablar(detalle ? `${titulo}. ${detalle}` : titulo);
}
// Barra con un segmento por parada del recorrido; con mas de 12 se agrupan.
function pintarGuia() {
  const c = guia.camion;
  $("guiaBaja").hidden = !c;
  $("barraParadas").hidden = !c;
  if (!c) return;
  const r = c.recorrido;
  $("guiaBaja").innerHTML = `Bajas en <strong>${escapar(cruce(r.at(-1).nombre))}</strong>`;
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
      alMoverse(coords.latitude, coords.longitude);
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
  ir("guia");
  Object.assign(guia, { activa: true, o, tramos, k: 0, camion: tramos[0], fase: "parada", actual: 0, dichos: new Set() });
  dibujar(o);
  mantenerPantalla();
  vibrar([60]);
  $("yaMeSubi").hidden = false;
  // Con el horario oficial: avisa 5 minutos y 1 minuto antes de que pase el camion.
  guia.horario = setInterval(() => {
    if (guia.fase !== "parada" && guia.fase !== "esperando") return;
    const c = guia.camion;
    const ahora = new Date();
    const falta = c.sale - (ahora.getHours() * 60 + ahora.getMinutes() + ahora.getSeconds() / 60);
    if (falta <= 1 && falta > -3) unaVez(`pasa1-${guia.k}`, () => { vibrar([500, 150, 500]); decir(`La ${c.linea} debe estar por pasar`, `Según el horario pasa a las ${hora(c.sale)}. Pregúntale al chofer si es la ${c.linea} hacia ${c.hacia}.`, "En la parada"); });
    else if (falta <= 5 && falta > 1) unaVez(`pasa5-${guia.k}`, () => { vibrar([300]); decir(`La ${c.linea} pasa en unos ${Math.round(falta)} minutos`, `Según el horario, a las ${hora(c.sale)}.`, "En la parada"); });
  }, 15000);
  const inicio = o.pasos[0];
  const c = guia.camion;
  decir(inicio.tipo === "app" ? `Pide ${Grieta.nombreApp(inicio.app)} a ${inicio.parada}` : `Camina a ${inicio.parada}`,
    `Ahí tomas la línea ${c.linea} hacia ${c.hacia}, a las ${hora(c.sale)} según el horario.${tramos.length > 1 ? " Después cambias de camión; te aviso." : ""} Te aviso antes de bajar.`, "Hacia la parada");
  seguir(avanzarCamion);
}

function avanzarCamion(lat, lon) {
  const c = guia.camion;
  const r = c.recorrido;
  const final = r.at(-1);
  const ultimo = guia.k === guia.tramos.length - 1;
  const d = r.map((x) => Grieta.metros(lat, lon, x.lat, x.lon));
  if (guia.fase === "parada" || guia.fase === "esperando") {
    if (guia.fase === "parada" && d[0] < 40) {
      guia.fase = "esperando";
      vibrar([300, 120, 300]);
      decir("Llegaste a la parada", `${r[0].nombre}. Espera la línea ${c.linea} hacia ${c.hacia}; según el horario pasa a las ${hora(c.sale)}. Te aviso cuando esté por pasar.`, "En la parada");
      leerReferencias(r[0]);
    }
    // Si ya va por la ruta del camion, lejos de la parada de subida, se subio.
    const masCerca = d.indexOf(Math.min(...d));
    if (masCerca >= 1 && d[masCerca] < 90) subir(masCerca);
    else if (guia.fase === "parada") $("guiaDetalle").textContent = `La parada está a ${Math.round(d[0])} metros.`;
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
        Object.assign(guia, { k: guia.k + 1, camion: sig, fase: "parada", actual: 0 });
        $("yaMeSubi").hidden = false;
        decir("Bájate aquí y cambia de camión", `Camina a ${sig.recorrido[0].nombre} y toma la línea ${sig.linea} hacia ${sig.hacia}, a las ${hora(sig.sale)} según el horario.`, "Transbordo", true);
        return;
      }
      guia.fase = "fin";
      guia.actual = r.length - 1;
      $("yaMeSubi").hidden = true;
      const fin = guia.o.pasos.at(-1);
      decir("Bájate aquí", `${final.nombre}. ${fin.tipo === "caminar" ? `Después camina unos ${Math.max(1, Math.round(fin.min))} minutos a tu destino.` : `Después pide ${Grieta.nombreApp(fin.app)} a tu destino.`}`, "Llegaste", true);
    });
  } else if (faltan === 1) {
    unaVez(clave("una"), () => { vibrar([700, 150, 700]); decir("Bájate en la siguiente parada", `Toca el timbre ahora. Bajas en ${final.nombre}.`, "Próxima parada", true); });
  } else if (faltan === 2) {
    unaVez(clave("dos"), () => { vibrar([400, 150, 400]); decir("Bajas en dos paradas", `Prepárate. Tu parada es ${final.nombre}.`, "En el camión"); });
  } else {
    // En pantalla siempre; en voz cada 5 paradas y en cada una de las ultimas 5.
    ponerTitulo(`Faltan ${faltan} paradas`);
    $("guiaDetalle").textContent = `Vas por ${r[guia.actual].nombre}.`;
    pintarGuia();
    if (faltan <= 5 || faltan % 5 === 0) unaVez(clave(`faltan${faltan}`), () => decir(`Faltan ${faltan} paradas`, `Vas por ${r[guia.actual].nombre}.`, "En el camión"));
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
  decir(`Faltan ${faltan} paradas`, `Vas en la ${guia.camion.linea}. Te aviso dos paradas antes de bajar.`, "En el camión");
}
$("yaMeSubi").addEventListener("click", () => subir(guia.actual));

// Para un viaje en app o en auto: avisa por distancia al destino.
function iniciarDestino() {
  terminarGuia();
  registrarViaje(estado.elegida);
  ir("guia");
  Object.assign(guia, { activa: true, o: null, camion: null, dichos: new Set() });
  mantenerPantalla();
  $("yaMeSubi").hidden = true;
  decir(`Rumbo a ${estado.destino.nombre}`, "Te aviso a un kilómetro, a 300 metros y al llegar.", "En camino");
  seguir((lat, lon) => {
    const m = Grieta.metros(lat, lon, estado.destino.lat, estado.destino.lon);
    if (m < 80) unaVez("llegaste", () => { vibrar([900, 200, 900]); decir("Llegaste", estado.destino.nombre, "Llegaste"); });
    else if (m < 300) unaVez("300", () => { vibrar([700, 150, 700]); decir("Estás a 300 metros", "Prepárate para bajar.", "Ya casi", true); });
    else if (m < 1000) unaVez("1000", () => { vibrar([400, 150, 400]); decir("Falta un kilómetro", null, "En camino"); });
    else $("guiaDetalle").textContent = `Faltan ${(m / 1000).toFixed(1)} km.`;
  });
}

$("repetir").addEventListener("click", () => {
  if (acc.voz) return hablar(ultimoDicho || $("guiaTitulo").textContent);
  // Sin la voz de Grieta, el aviso se vuelve a escribir para que el lector de pantalla lo lea otra vez.
  const aviso = $("guiaTitulo").innerHTML;
  $("guiaTitulo").innerHTML = "";
  setTimeout(() => { $("guiaTitulo").innerHTML = aviso; }, 100);
});
$("terminar").addEventListener("click", () => {
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
    navigator.geolocation?.getCurrentPosition(({ coords }) => enviar(coords.latitude, coords.longitude), () => hablar("No pude ver tu ubicación."));
  }
});

function terminarGuia() {
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
  if ("speechSynthesis" in window) speechSynthesis.cancel();
}

// Mis viajes: los ultimos viajes iniciados, para repetirlos con un toque.
let viajes = leer("grieta-viajes", []);
function registrarViaje(o) {
  const { destino: d } = estado;
  viajes = [{ destino: { nombre: d.nombre, lat: d.lat, lon: d.lon }, camino: tituloOpcion(o), fecha: new Date().toISOString() }].concat(viajes).slice(0, 20);
  escribir("grieta-viajes", viajes);
}
function fechaViaje(iso) {
  const f = new Date(iso);
  return `${DIAS[(f.getDay() + 6) % 7]} ${f.getDate()} ${MESES[f.getMonth()]}, ${hora(f.getHours() * 60 + f.getMinutes())}`;
}
function pintarViajes() {
  $("listaViajes").innerHTML = viajes.length
    ? viajes.map((v, i) => `<li><div class="fila">
        <span class="circulo">${ico("ruta")}</span>
        <span class="fila-texto"><strong>${escapar(v.destino.nombre)}</strong><small>${escapar(v.camino)} · ${fechaViaje(v.fecha)}</small></span>
        <button type="button" class="repetir-viaje" data-i="${i}" aria-label="Repetir el viaje a ${escapar(v.destino.nombre)}">${ico("repetir")}Repetir</button>
      </div></li>`).join("")
    : `<li class="vacio">Todavía no tienes viajes. Cuando empieces uno con avisos, aparece aquí para repetirlo.</li>`;
}
$("listaViajes").addEventListener("click", (e) => {
  const b = e.target.closest(".repetir-viaje");
  if (!b) return;
  const v = viajes[b.dataset.i];
  ir("inicio");
  poner("destino", { ...v.destino });
});

// Lugares guardados en este telefono: Casa, Escuela, Trabajo.
let guardados = leer("grieta-lugares", []);
let editando = false;
function pintarGuardados() {
  const casa = guardados.find((g) => g.nombre === "Casa");
  $("llevameCasa").hidden = !casa;
  $("guardados").hidden = !guardados.length;
  $("guardados").innerHTML = guardados.map((g, i) =>
    `<button type="button" class="chip" data-i="${i}" aria-label="Ir a ${escapar(g.nombre)}">${ico(g.nombre === "Casa" ? "casa" : "pin")}${escapar(g.nombre)}</button>`).join("");
  $("editarGuardados").hidden = !guardados.length;
  $("editarGuardados").textContent = editando ? "Listo" : "Editar";
  $("editarGuardados").setAttribute("aria-pressed", String(editando));
  $("listaGuardados").innerHTML = guardados.length
    ? guardados.map((g, i) => editando
      ? `<li><div class="fila"><span class="circulo">${ico(g.nombre === "Casa" ? "casa" : "pin")}</span><span class="fila-texto"><strong>${escapar(g.nombre)}</strong></span>
          <button type="button" class="quitar" data-quitar="${i}" aria-label="Quitar ${escapar(g.nombre)}">Quitar</button></div></li>`
      : `<li><button type="button" data-i="${i}"><span class="circulo">${ico(g.nombre === "Casa" ? "casa" : "pin")}</span>
          <span class="fila-texto"><strong>${escapar(g.nombre)}</strong><small>Ir a ${escapar(g.nombre)}</small></span>${ico("chevron", "chevron")}</button></li>`).join("")
    : `<li class="vacio">Cuando elijas un destino, toca "Guardar este lugar".</li>`;
}
function guardarLugares() {
  escribir("grieta-lugares", guardados);
  pintarGuardados();
}
const irA = (lugar) => { estado.editando = "hacia"; poner("destino", lugar); };
$("llevameCasa").addEventListener("click", () => irA(guardados.find((g) => g.nombre === "Casa")));
$("guardados").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (b) irA(guardados[b.dataset.i]);
});
$("listaGuardados").addEventListener("click", (e) => {
  const q = e.target.closest("[data-quitar]");
  if (q) {
    guardados.splice(Number(q.dataset.quitar), 1);
    if (!guardados.length) editando = false;
    guardarLugares();
    return;
  }
  const b = e.target.closest("button[data-i]");
  if (b) { ir("inicio"); irA(guardados[b.dataset.i]); }
});
$("editarGuardados").addEventListener("click", () => { editando = !editando; pintarGuardados(); });
$("guardarLugar").addEventListener("click", () => {
  const abierto = $("nombresLugar").hidden;
  $("nombresLugar").hidden = !abierto;
  $("guardarLugar").setAttribute("aria-expanded", String(abierto));
  if (abierto) $("nombresLugar").querySelector("button").focus();
});
$("nombresLugar").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  const { lat, lon } = estado.destino;
  guardados = guardados.filter((g) => g.nombre !== b.dataset.v).concat({ nombre: b.dataset.v, lat, lon });
  guardarLugares();
  $("nombresLugar").hidden = true;
  $("guardarLugar").setAttribute("aria-expanded", "false");
  $("guardarLugar").textContent = `Guardado como ${b.dataset.v}`;
  $("guardarLugar").disabled = true;
  hablar(`Guardé ${estado.destino.nombre} como ${b.dataset.v}.`);
});

// Grupos de opciones con flechas, como radios nativos.
function radios(id, alElegir) {
  const grupo = $(id);
  const marcar = (b) => {
    for (const x of grupo.querySelectorAll("[role=radio]")) {
      x.setAttribute("aria-checked", String(x === b));
      x.tabIndex = x === b ? 0 : -1;
    }
    alElegir(b.dataset.v);
  };
  grupo.addEventListener("click", (e) => {
    const b = e.target.closest("[role=radio]");
    if (b) marcar(b);
  });
  grupo.addEventListener("keydown", (e) => {
    const lista = [...grupo.querySelectorAll("[role=radio]")];
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
  const r = await fetch(`${API}${ruta}`, opciones);
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
  const texto = [refs.length ? `Referencia: ${refs[0]}.` : "", avisos.length ? `Cuidado: ${[...new Set(avisos)].join(", ")}.` : ""].join(" ").trim();
  if (texto) hablar(texto, true);
}

// Reportar un problema donde estas parado.
const reporte = { tipo: null, lat: null, lon: null, parada: null };
const marcarReporte = radios("tipoReporte", (v) => { reporte.tipo = v; });
function abrirReporte() {
  Object.assign(reporte, { tipo: null, lat: null, lon: null, parada: null });
  marcarReporte(null);
  $("descripcion").value = "";
  $("foto").value = "";
  $("fotoTexto").textContent = "Agregar foto";
  $("reporteEstado").textContent = "";
  $("reporteDonde").textContent = "Buscando dónde estás...";
  ir("reporte");
  const fijar = async (lat, lon) => {
    Object.assign(reporte, { lat, lon });
    const p = Grieta.pasanAqui(lat, lon, hoyDia(), ahoraMin(), 120)[0];
    reporte.parada = p?.nombre ?? null;
    // Cerca de una parada, el reporte queda en la parada para que lo encuentre quien la consulte.
    if (p) {
      Object.assign(reporte, { lat: p.lat, lon: p.lon });
      $("reporteDonde").textContent = `En la parada ${p.nombre}`;
      return;
    }
    $("reporteDonde").textContent = "En tu ubicación actual";
    try {
      const r = await (await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lon}&limit=1`)).json();
      const calle = r.features[0]?.properties?.street ?? r.features[0]?.properties?.name;
      if (calle) $("reporteDonde").textContent = `En ${calle}`;
    } catch {}
  };
  navigator.geolocation?.getCurrentPosition(
    ({ coords }) => fijar(coords.latitude, coords.longitude),
    () => (estado.origen ? fijar(estado.origen.lat, estado.origen.lon) : ($("reporteDonde").textContent = "Activa la ubicación para reportar")),
    { enableHighAccuracy: true, timeout: 10000 },
  );
}
// Las fotos del telefono pesan varios MB: se reducen a 1600 px en JPEG antes de subirlas.
async function achicarFoto(f) {
  try {
    const img = await createImageBitmap(f);
    const escala = Math.min(1, 1600 / Math.max(img.width, img.height));
    const lienzo = document.createElement("canvas");
    lienzo.width = Math.round(img.width * escala);
    lienzo.height = Math.round(img.height * escala);
    lienzo.getContext("2d").drawImage(img, 0, 0, lienzo.width, lienzo.height);
    return await new Promise((listo) => lienzo.toBlob((b) => listo(b ?? f), "image/jpeg", 0.85));
  } catch {
    return f;
  }
}
$("foto").addEventListener("change", () => {
  const f = $("foto").files[0];
  $("fotoTexto").textContent = f ? `Foto lista: ${f.name}` : "Agregar foto";
});
$("enviarReporte").addEventListener("click", async () => {
  const decirR = (t) => { $("reporteEstado").textContent = t; hablar(t); };
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
        await llamar(`/reportes/${nuevo.id}/foto`, { method: "POST", headers: { "Content-Type": foto.type }, body: foto });
      } catch {
        conFoto = false;
      }
    }
    decirR(conFoto ? "Gracias. Tu reporte ayuda a quien pase por aquí." : "Se guardó tu reporte, pero no se pudo subir la foto.");
    // El reporte ya existe: se limpia el formulario para que otro toque no lo mande dos veces.
    Object.assign(reporte, { tipo: null });
    marcarReporte(null);
    $("descripcion").value = "";
    $("foto").value = "";
    $("fotoTexto").textContent = "Agregar foto";
  } catch (err) {
    decirR(err.message === "sin api" ? "No hay conexión con el servidor." : `No se pudo enviar: ${err.message}.`);
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
    $("enviarPrecio").hidden = true;
  } catch (err) {
    $("gracias").textContent = err.message === "sin api" ? "No hay conexión con el servidor." : `No se pudo enviar: ${err.message}.`;
  }
});

// Bienvenida: solo la primera vez.
let paso = 1;
const marcarModo = radios("modoUso", (v) => {
  acc.grande = v === "grande";
  if (v === "voz") acc.voz = true;
  guardarAcc();
  aplicarAcc();
});
function pintarPaso() {
  for (const d of document.querySelectorAll("#bienvenida [data-paso]")) d.hidden = Number(d.dataset.paso) !== paso;
  [...document.querySelectorAll("#bienvenida .puntos span")].forEach((s, i) => s.classList.toggle("activo", i === paso - 1));
  $("pasoBienvenida").textContent = `Paso ${paso} de 3`;
  $("siguientePaso").textContent = paso === 3 ? "Empezar" : "Siguiente";
  document.querySelector(`#bienvenida [data-paso="${paso}"] h1`).focus({ preventScroll: true });
  $("hoja").scrollTop = 0;
}
function abrirBienvenida() {
  paso = 1;
  marcarModo(acc.grande ? "grande" : "vista");
  ir("bienvenida", true);
  pintarPaso();
}
$("siguientePaso").addEventListener("click", () => {
  if (paso < 3) { paso++; return pintarPaso(); }
  escribir("grieta-bienvenida", true);
  ir("inicio", true);
  if (!estado.gps) ubicar();
});
$("permisoUbicacion").addEventListener("click", () => {
  $("estadoUbicacion").textContent = "Pidiendo permiso...";
  ubicar((ok) => { $("estadoUbicacion").textContent = ok ? "Lista: ya sé desde dónde sales" : "No se activó; puedes elegir desde dónde sales"; });
});
$("permisoMicrofono").addEventListener("click", async () => {
  if (!Reconocer || !navigator.mediaDevices?.getUserMedia) {
    $("estadoMicrofono").textContent = "Este navegador no permite dictar; puedes escribir";
    return;
  }
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    s.getTracks().forEach((t) => t.stop());
    $("estadoMicrofono").textContent = "Listo: toca el micrófono para dictar";
  } catch {
    $("estadoMicrofono").textContent = "No se activó; puedes escribir";
  }
});
$("verBienvenida").addEventListener("click", abrirBienvenida);

// Sin conexion: la app y los horarios quedan guardados en el telefono.
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
]).then(([{ modelo }, l, config]) => {
  lugares = l;
  API = config.api || (["localhost", "127.0.0.1"].includes(location.hostname) ? "http://localhost:3000/api" : "");
  pintarGuardados();
  avisoConexion();
  const info = `Precios estimados con ${modelo.momentos} registros del equipo. Horarios oficiales de Qrobus.`;
  $("info").textContent = info;
  $("infoAjustes").textContent = info;
  if (!primeraVez) ubicar();
});

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
$("choferVoz").addEventListener("click", () => hablar(`${$("choferDestino").textContent} ¿Me avisa cuando lleguemos, por favor?`));
$("choferCerrar").addEventListener("click", () => tarjetaChofer(false));
addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("chofer").hidden) tarjetaChofer(false); });
