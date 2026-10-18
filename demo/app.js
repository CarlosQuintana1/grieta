const $ = (id) => document.getElementById(id);
const pesos = (x) => `$${Math.round(x)}`;
const QUERETARO = [20.6, -100.4];
const RADIO_KM = 40;
const AMBAR = "#e0a03c";
const TINTA = "#ede8df";
const ESPERAS = [0, 15, 30, 60];
const DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
const ACCIONES = { "pedir ya": "Pídelo ya", esperar: "Espera un poco", camion: "Vete en camión" };

const mapa = L.map("mapa", { zoomControl: false, attributionControl: false, keyboard: false }).setView(QUERETARO, 12);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(mapa);
L.control.attribution({ position: "bottomright", prefix: false })
  .addAttribution('&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>').addTo(mapa);
const icono = (clase) => L.divIcon({ className: "", html: `<span class="marca ${clase}"></span>`, iconSize: [16, 16] });

const estado = { origen: null, destino: null, editando: "hacia", kmCalle: null, momento: 0, otra: null, prisa: 20, app: null, gps: null, elegida: null };
const capas = {};
let lugares = [];

// Ajustes de accesibilidad, guardados en este telefono.
const acc = { grande: false, contraste: false, voz: true, lenta: false, camino: false, unidos: false };
try { Object.assign(acc, JSON.parse(localStorage.getItem("grieta-acc") ?? "{}")); } catch {}
const OPCIONES = { grande: "optGrande", contraste: "optContraste", voz: "optVoz", lenta: "optLenta", camino: "optCamino", unidos: "optUnidos" };
function aplicarAcc() {
  document.documentElement.classList.toggle("grande", acc.grande);
  document.documentElement.classList.toggle("contraste", acc.contraste);
  for (const [k, id] of Object.entries(OPCIONES)) $(id).checked = acc[k];
  $("optUnidos2").checked = acc.unidos;
}
function guardarAcc() {
  try { localStorage.setItem("grieta-acc", JSON.stringify(acc)); } catch {}
}
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

// Una pantalla a la vez; el foco va al titulo para que el lector de pantalla anuncie el cambio.
let pantallaAnterior = "inicio";
function ir(nombre) {
  for (const s of document.querySelectorAll(".pantalla")) s.hidden = s.id !== nombre;
  document.body.dataset.pantalla = nombre;
  $("contenido").scrollTop = 0;
  $(nombre).querySelector("h1")?.focus({ preventScroll: true });
  setTimeout(() => mapa.invalidateSize(), 250);
}
for (const b of document.querySelectorAll("[data-ir]")) {
  b.addEventListener("click", () => {
    if (b.dataset.ir === "inicio") limpiarRuta();
    if (b.dataset.ir === "opciones") quitarTrazo();
    ir(b.dataset.ir);
  });
}
$("abrirAcc").addEventListener("click", () => {
  pantallaAnterior = document.body.dataset.pantalla;
  if (pantallaAnterior !== "ajustes") ir("ajustes");
});
$("cerrarAcc").addEventListener("click", () => ir(pantallaAnterior));

// Voz y vibracion, con un tono por pulso para que en iPhone tambien haya senal.
let vozGrieta = null;
let audio;
function hablar(texto) {
  $("guiaDetalle").dataset.ultimo = texto;
  if (!acc.voz || !("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(texto);
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

// Ubicacion y lugares
const dentroDeQueretaro = (lat, lon) => Grieta.metros(lat, lon, QUERETARO[0], QUERETARO[1]) / 1000 <= RADIO_KM;

function poner(cual, lugar) {
  estado[cual] = lugar;
  capas[cual]?.remove();
  capas[cual] = L.marker([lugar.lat, lugar.lon], { icon: icono(cual), keyboard: false }).addTo(mapa);
  if (cual === "origen") {
    $("desdeTexto").textContent = `Sales de ${lugar.nombre === "Tu ubicación" ? "tu ubicación" : lugar.nombre}.`;
    $("cambiarDesde").textContent = "Cambiar";
    $("buscaDesde").hidden = true;
    estado.editando = "hacia";
  } else {
    $("hacia").value = lugar.nombre;
  }
  cerrarSugerencias();
  if (estado.origen && estado.destino) trazar();
  else if (cual === "origen") $("hacia").focus();
  else mapa.setView([lugar.lat, lugar.lon], 14);
}

function ubicar() {
  if (!navigator.geolocation) return sinUbicacion("Tu navegador no comparte la ubicación.");
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      if (!dentroDeQueretaro(coords.latitude, coords.longitude)) return sinUbicacion("Estás fuera de Querétaro. Elige desde dónde sales.");
      estado.gps = { nombre: "Tu ubicación", lat: coords.latitude, lon: coords.longitude };
      if (!estado.origen) {
        poner("origen", estado.gps);
        mapa.setView([coords.latitude, coords.longitude], 14);
      }
    },
    () => sinUbicacion("No pude ver tu ubicación."),
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
  );
}
function sinUbicacion(texto) {
  $("estado").textContent = "";
  $("desdeTexto").textContent = `${texto} ¿Desde dónde sales?`;
  $("cambiarDesde").textContent = "Elegir";
}

$("cambiarDesde").addEventListener("click", () => {
  $("buscaDesde").hidden = false;
  estado.editando = "desde";
  $("desde").value = "";
  $("desde").focus();
});

let espera;
function sugerir(texto) {
  clearTimeout(espera);
  const lista = $("sugerencias");
  $("atajos").hidden = true;
  $("respuesta").innerHTML = "";
  if (texto.trim().length < 3) {
    const fijos = (estado.editando === "desde" && estado.gps ? [estado.gps] : []).concat(guardados, lugares);
    lista.innerHTML = fijos.map((l, i) => `<li><button type="button" data-i="${i}">${l.nombre}</button></li>`).join("");
    lista.onclick = (e) => elegir(fijos[e.target.closest("button")?.dataset.i]);
    return;
  }
  espera = setTimeout(async () => {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(texto)}&lat=${QUERETARO[0]}&lon=${QUERETARO[1]}&limit=6&bbox=-100.65,20.4,-100.15,20.9`;
    try {
      const { features } = await (await fetch(url)).json();
      const res = features.map(({ properties: p, geometry: g }) => ({
        nombre: p.name ?? p.street ?? "Sin nombre",
        detalle: [p.street && p.name ? p.street : null, p.district ?? p.city].filter(Boolean).join(", "),
        lat: g.coordinates[1], lon: g.coordinates[0],
      }));
      estado.resultados = res;
      lista.innerHTML = res.length
        ? res.map((l, i) => `<li><button type="button" data-i="${i}">${l.nombre}<span>${l.detalle}</span></button></li>`).join("")
        : `<li class="vacio">No encontré ese lugar. Prueba con otro nombre o toca el mapa.</li>`;
      lista.onclick = (e) => elegir(res[e.target.closest("button")?.dataset.i]);
    } catch {
      lista.innerHTML = `<li class="vacio">No hay conexión con el buscador. Toca el mapa para elegir el lugar.</li>`;
    }
  }, 300);
}
function cerrarSugerencias() {
  $("sugerencias").innerHTML = "";
  $("atajos").hidden = false;
}
function elegir(lugar) {
  if (lugar) poner(estado.editando === "desde" ? "origen" : "destino", lugar);
}
for (const campo of ["desde", "hacia"]) {
  $(campo).addEventListener("focus", () => { estado.editando = campo; sugerir($(campo).value === estado.destino?.nombre ? "" : $(campo).value); });
  $(campo).addEventListener("input", (e) => { estado.editando = campo; sugerir(e.target.value); });
  $(campo).addEventListener("keydown", (e) => { if (e.key === "Escape") { cerrarSugerencias(); e.target.blur(); } });
}

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
  $("estado").textContent = "Buscando cómo llegar...";
  limpiarRuta(true);
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${o.lon},${o.lat};${d.lon},${d.lat}?overview=full&geometries=geojson`;
    const r = await (await fetch(url, { signal: AbortSignal.timeout(6000) })).json();
    estado.kmCalle = r.routes[0].distance / 1000;
    capas.linea = L.geoJSON(r.routes[0].geometry, { style: { color: AMBAR, weight: 4, opacity: 0.9 } }).addTo(mapa);
  } catch {
    estado.kmCalle = null;
    capas.linea = L.polyline([[o.lat, o.lon], [d.lat, d.lon]], { color: AMBAR, weight: 3, dashArray: "4 8" }).addTo(mapa);
  }
  $("estado").textContent = "";
  estado.momento = 0;
  estado.otra = null;
  ir("opciones");
  calcular();
  setTimeout(() => encuadrar(capas.linea.getBounds()), 260);
}

function limpiarRuta(soloMapa) {
  capas.linea?.remove();
  capas.linea = null;
  quitarTrazo();
  if (!soloMapa) {
    capas.destino?.remove();
    estado.destino = null;
    $("hacia").value = "";
  }
}

function encuadrar(limites) {
  mapa.fitBounds(limites, { padding: [28, 28] });
}

function momentos() {
  const ahora = new Date();
  const dia = (ahora.getDay() + 6) % 7;
  const minuto = ahora.getHours() * 60 + ahora.getMinutes();
  const lista = ESPERAS.map((m) => ({ dia, minuto: minuto + m, etiqueta: m ? (m < 60 ? `En ${m} min` : "En 1 h") : "Ahora" }));
  lista.push(estado.otra ? { ...estado.otra, etiqueta: Grieta.hhmm(estado.otra.minuto) } : { dia, minuto: minuto + 120, etiqueta: "Otra hora", vacia: true });
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
  pintarVeredicto(r);
}

function tituloOpcion(o) {
  if (o.tipo === "app") return o.opcion.replace("Solo app (", "").replace(")", "");
  const lineas = o.pasos.filter((p) => p.tipo === "camion").map((p) => p.linea);
  const apps = o.pasos.filter((p) => p.tipo === "app").map((p) => Grieta.nombreApp(p.app));
  const camion = `Qrobus ${lineas.join(" y ")}`;
  return o.pasos[0].tipo === "app" ? [apps[0], camion, ...apps.slice(1)].join(" + ") : [camion, ...apps].join(" + ");
}
const caminata = (o) => Math.round((o.pasos ?? []).filter((p) => p.tipo === "caminar").reduce((s, p) => s + p.min, 0));

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

function pintarOpciones(r) {
  $("tituloOpciones").textContent = estado.destino.nombre;
  const ya = guardados.find((g) => Grieta.metros(g.lat, g.lon, estado.destino.lat, estado.destino.lon) < 30);
  $("guardarLugar").textContent = ya ? `Guardado como ${ya.nombre}` : "Guardar este lugar";
  $("guardarLugar").disabled = Boolean(ya);
  const cuando = estado.momento === 0 ? "" : ` · saliendo ${estado.momento < ESPERAS.length ? momentos()[estado.momento].etiqueta.toLowerCase() : `el ${DIAS[r.ctx.dia]} a las ${Grieta.hhmm(r.ctx.minuto)}`}`;
  $("resumenRuta").textContent = `Desde ${estado.origen.nombre.toLowerCase() === "tu ubicación" ? "tu ubicación" : estado.origen.nombre} · ${r.directo.km.toFixed(1)} km${cuando}`;
  estado.tarjetas = elegirTarjetas(r);
  $("tarjetas").innerHTML = estado.tarjetas.map(({ o, etiquetas }, i) => {
    const pie = [`Llegas a las ${Grieta.hhmm(r.ctx.minuto + o.minutos)}`, `${Math.round(o.minutos)} min`];
    if (caminata(o)) pie.push(`caminas ${caminata(o)} min`);
    return `<button type="button" class="tarjeta${i === 0 ? " principal" : ""}" data-i="${i}">
      <span class="etiqueta">${etiquetas.join(" y ")}</span>
      <span class="titulo">${tituloOpcion(o)}</span><span class="precio">${pesos(o.costo)}</span>
      <span class="meta">${pie.join(" · ")}</span>
    </button>`;
  }).join("") || `<p class="nota">No encontré cómo llegar. Prueba con otro destino.</p>`;
  $("filaUnidos").hidden = !r.opciones.some((o) => o.tipo !== "app");
  if (!r.opciones.some((o) => o.tipo !== "app")) {
    $("tarjetas").innerHTML += `<p class="nota">${r.pasaCerca ? "Ningún Qrobus te lleva directo en la próxima hora." : "En la próxima hora no pasa ningún Qrobus cerca."}</p>`;
  }
}
$("tarjetas").addEventListener("click", (e) => {
  const t = e.target.closest(".tarjeta");
  if (!t) return;
  estado.elegida = estado.tarjetas[t.dataset.i].o;
  pintarDetalle();
  ir("detalle");
});

function pintarEspera(lista, precios, base) {
  const cercanos = precios.slice(0, ESPERAS.length).map((p) => p.mejor.precio);
  const minimo = Math.min(...cercanos);
  $("horas").innerHTML = lista.map((m, i) => `
    <button type="button" data-i="${i}" aria-pressed="${i === estado.momento}" class="${i < ESPERAS.length && cercanos[i] === minimo ? "barata" : ""}"
      aria-label="${m.etiqueta}${m.vacia ? "" : `, ${Math.round(precios[i].mejor.precio)} pesos`}">
      <span>${m.etiqueta}</span><strong>${m.vacia ? "+" : pesos(precios[i].mejor.precio)}</strong>
    </button>`).join("");
  const ahora = cercanos[0];
  const mejor = cercanos.slice(1).reduce((a, p, i) => (p < a.p ? { p, i: i + 1 } : a), { p: Infinity, i: 0 });
  const maximo = Math.max(...cercanos.slice(1));
  $("respuestaEspera").textContent = ahora - mejor.p >= 5
    ? `Sí: si sales a las ${Grieta.hhmm(lista[mejor.i].minuto)} ahorras ${pesos(ahora - mejor.p)}.`
    : maximo - ahora >= 5 ? `No: en la próxima hora sube hasta ${pesos(maximo - ahora)}.` : "Da igual: en la próxima hora casi no cambia.";

  const hoy = lista[0];
  const tramos = [];
  for (let i = 0; i < Grieta.CORTES.length - 1; i++) {
    const [a, b] = [Grieta.CORTES[i] * 60, Grieta.CORTES[i + 1] * 60];
    if (b <= hoy.minuto) continue;
    tramos.push({ a, b, p: Grieta.cotizar({ ...base, dia: hoy.dia, minuto: Math.max(a, hoy.minuto) }).mejor.precio });
  }
  const barata = tramos.reduce((x, y) => (y.p < x.p ? y : x), tramos[0]);
  $("mejorHora").textContent = !barata ? "" : barata.a <= hoy.minuto
    ? "Hoy no hay una hora más barata que ahorita."
    : `La hora más barata hoy es de ${barata.a / 60} a ${barata.b / 60} h: ${pesos(barata.p)}. El precio cambia por franjas de 3 horas.`;
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
});
function leerOtra() {
  const [h, m] = ($("hora").value || "12:00").split(":").map(Number);
  estado.otra = { dia: Number($("dia").value), minuto: h * 60 + m };
}
for (const id of ["dia", "hora"]) $(id).addEventListener("input", () => { leerOtra(); calcular(); });

// Detalle de un camino
function pasosDe(o) {
  if (o.tipo === "app") {
    const app = tituloOpcion(o);
    return [
      { titulo: `Pide ${app}`, nota: `Debería costar unos ${pesos(o.costo)}. Abajo ves el precio en cada app.` },
      { titulo: `Llegas a ${estado.destino.nombre}`, nota: `Unos ${Math.round(o.minutos)} minutos, contando la espera.` },
    ];
  }
  return o.pasos.map((p) => {
    const min = Math.max(1, Math.round(p.min));
    if (p.tipo === "caminar" && p.transbordo) return { titulo: `Camina ${min} min y cambia de camión`, nota: p.parada };
    if (p.tipo === "caminar") return p.hacia
      ? { titulo: `Camina ${min} min a la parada`, nota: p.parada }
      : { titulo: `Camina ${min} min a tu destino`, nota: estado.destino.nombre };
    if (p.tipo === "app") return p.hacia
      ? { titulo: `Pide ${Grieta.nombreApp(p.app)} hasta la parada`, nota: `${p.parada} · unos ${pesos(p.costo)}` }
      : { titulo: `Pide ${Grieta.nombreApp(p.app)} a tu destino`, nota: `Unos ${pesos(p.costo)}` };
    return { titulo: `Toma la línea ${p.linea} a las ${Grieta.hhmm(p.sale)}`, nota: `Hacia ${p.hacia}. Bájate en ${p.baja}, ${p.paradas} paradas después. Te aviso antes.` };
  });
}

function pintarDetalle() {
  const o = estado.elegida;
  const r = estado.r;
  $("tituloDetalle").textContent = tituloOpcion(o);
  $("detallePrecio").textContent = pesos(o.costo);
  $("detalleLlegada").textContent = `Llegas a las ${Grieta.hhmm(r.ctx.minuto + o.minutos)}`;
  $("pasos").innerHTML = pasosDe(o).map((p) => `<li><strong>${p.titulo}</strong><span>${p.nota}</span></li>`).join("");
  const esApp = o.tipo === "app";
  $("empezar").textContent = esApp ? "Avísame cuando esté llegando" : "Empezar con avisos";
  $("bloqueApp").hidden = !esApp;
  if (esApp) {
    const orden = [...r.directo.porApp].sort((a, b) => a.precio - b.precio);
    $("apps").innerHTML = orden.map((x) => `
      <div class="fila-app">
        <div>${Grieta.nombreApp(x.app)}${x.app === "uber" ? `<a class="abrir" href="${enlaceUber()}" target="_blank" rel="noopener">Abrir Uber</a>` : ""}
          <small>Normal entre ${pesos(x.bajo)} y ${pesos(x.alto)}</small></div>
        <span class="precio">${pesos(x.precio)}</span>
      </div>`).join("");
    quitarTrazo();
  } else {
    dibujar(o);
  }
}

$("empezar").addEventListener("click", () => (estado.elegida.tipo === "app" ? iniciarDestino() : iniciarGuia(estado.elegida)));
$("escuchar").addEventListener("click", () => hablar(pasosDe(estado.elegida).map((p) => `${p.titulo}. ${p.nota}.`).join(" ")));

function elegirEn(id, alElegir) {
  $(id).addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    for (const x of $(id).children) x.setAttribute("aria-pressed", String(x === b));
    alElegir(b.dataset.v);
  });
}
elegirEn("appVista", (v) => { estado.app = v; $("precio").focus(); calcular(); });
elegirEn("prisa", (v) => { estado.prisa = Number(v); calcular(); });
$("precio").addEventListener("input", calcular);

function pintarVeredicto(r) {
  const d = r.decision;
  $("enviarPrecio").hidden = !d || !API;
  $("gracias").textContent = "";
  $("veredicto").innerHTML = !d ? "" : `
    <div class="veredicto">
      <p class="grande">${ACCIONES[d.accion]}</p>
      <p>Te marca ${pesos(d.esperado.precio * d.relacion)} y lo normal a esta hora es ${pesos(d.esperado.precio)}.
        ${d.extra < 1e8 ? `El camión que ahorra tarda ${Math.round(d.extra)} min más.` : "Ningún camión ahorra al menos 30%."}</p>
      <details><summary>¿Por qué?</summary>
        <ul>${d.activas.slice(0, 3).map((a) => `<li>${Math.round(a.w * 100)}%: si ${a.texto}, ${ACCIONES[a.accion].toLowerCase()}</li>`).join("")}</ul>
      </details>
    </div>`;
}

const enlaceUber = () => {
  const { origen: o, destino: d } = estado;
  const q = new URLSearchParams({
    action: "setPickup",
    "pickup[latitude]": o.lat, "pickup[longitude]": o.lon, "pickup[nickname]": o.nombre,
    "dropoff[latitude]": d.lat, "dropoff[longitude]": d.lon, "dropoff[nickname]": d.nombre,
  });
  return `https://m.uber.com/ul/?${q}`;
};

function quitarTrazo() {
  capas.camion?.remove();
  capas.camion = null;
  capas.linea?.setStyle?.({ opacity: 0.9 });
}

// Camino con camion en el mapa: caminata punteada, app en linea delgada y el camion por sus paradas.
function dibujar(o) {
  quitarTrazo();
  const estilo = (modo) => (modo === "caminando" ? { color: TINTA, weight: 3, dashArray: "1 7", lineCap: "round" } : { color: TINTA, weight: 2, opacity: 0.7 });
  capas.linea?.setStyle?.({ opacity: 0.15 });
  const camiones = o.trazo.camiones;
  const capasCamion = camiones.flatMap((c, k) => [
    L.polyline(c, { color: AMBAR, weight: 5 }),
    ...(k > 0 ? [L.polyline([camiones[k - 1].at(-1), c[0]], estilo("caminando"))] : []),
    ...[c[0], c.at(-1)].map((x) => L.circleMarker(x, { radius: 5, color: "#0b0a09", weight: 2, fillColor: AMBAR, fillOpacity: 1 })),
  ]);
  capas.camion = L.featureGroup([
    L.polyline(o.trazo.acceso.puntos, estilo(o.trazo.acceso.modo)),
    ...capasCamion,
    L.polyline(o.trazo.salida.puntos, estilo(o.trazo.salida.modo)),
  ]).addTo(mapa);
  setTimeout(() => encuadrar(capas.camion.getBounds()), 260);
}

// Atajos del inicio
$("pasanAqui").addEventListener("click", () => {
  const punto = estado.gps ?? estado.origen;
  if (!punto) return decirRespuesta("Primero necesito saber dónde estás. Elige desde dónde sales.");
  const ahora = new Date();
  const lista = Grieta.pasanAqui(punto.lat, punto.lon, (ahora.getDay() + 6) % 7, ahora.getHours() * 60 + ahora.getMinutes());
  if (!lista.length) return decirRespuesta("No hay paradas de Qrobus con servicio a menos de 350 metros.");
  $("respuesta").innerHTML = lista.map((p) => `
    <div class="parada">
      <p><strong>${p.nombre}</strong> <span class="nota">a ${Math.round(p.m)} m</span></p>
      <ul>${p.lineas.slice(0, 5).map((l) => `<li>Línea ${l.linea} hacia ${l.hacia}: ${l.horas.map(Grieta.hhmm).join(" y ")}</li>`).join("")}</ul>
    </div>`).join("");
  const p = lista[0];
  hablar(`La parada más cercana es ${p.nombre}, a ${Math.round(p.m)} metros. ` +
    p.lineas.slice(0, 4).map((l) => `Línea ${l.linea} hacia ${l.hacia}, a las ${Grieta.hhmm(l.horas[0])}.`).join(" "));
  reportesCerca(p.lat, p.lon, 60).then((avisos) => {
    if (!avisos.length) return;
    $("respuesta").querySelector(".parada").insertAdjacentHTML("beforeend", avisos.slice(0, 3)
      .map((a) => `<p class="aviso-parada">${NOMBRES_REPORTE[a.tipo]}${a.descripcion ? `: ${a.descripcion}` : ""}</p>`).join(""));
    leerReferencias(p);
  });
});
function decirRespuesta(texto) {
  $("respuesta").innerHTML = `<p>${texto}</p>`;
  hablar(texto);
}

function dondeEstoy(destino) {
  if (!navigator.geolocation) return hablar("Tu navegador no comparte la ubicación.");
  hablar("Buscando dónde estás.");
  navigator.geolocation.getCurrentPosition(async ({ coords }) => {
    const { latitude: lat, longitude: lon } = coords;
    let lugar = "";
    try {
      const r = await (await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lon}&limit=1`)).json();
      const p = r.features[0]?.properties ?? {};
      lugar = [p.street ? `${p.street}${p.housenumber ? " " + p.housenumber : ""}` : p.name, p.district ?? p.city].filter(Boolean).join(", ");
    } catch {}
    const ahora = new Date();
    const parada = Grieta.pasanAqui(lat, lon, (ahora.getDay() + 6) % 7, ahora.getHours() * 60 + ahora.getMinutes(), 500)[0];
    const texto = `${lugar ? `Estás en ${lugar}.` : "No encontré el nombre de la calle."} ` +
      (parada ? `La parada más cercana es ${parada.nombre}, a ${Math.round(parada.m)} metros.` : "No hay paradas de Qrobus a menos de 500 metros.");
    if (destino === "guia") $("guiaDetalle").textContent = texto;
    else $("respuesta").innerHTML = `<p>${texto}</p>`;
    hablar(texto);
  }, () => hablar("No pude ver tu ubicación."), { enableHighAccuracy: true, timeout: 10000 });
}
$("dondeEstoy").addEventListener("click", () => dondeEstoy("inicio"));
$("dondeGuia").addEventListener("click", () => dondeEstoy("guia"));

// Dictar el destino: llena el campo, busca y lee las primeras opciones.
const Reconocer = window.SpeechRecognition || window.webkitSpeechRecognition;
if (Reconocer) {
  $("dictar").hidden = false;
  $("dictar").addEventListener("click", () => {
    const rec = new Reconocer();
    rec.lang = "es-MX";
    $("dictar").classList.add("oyendo");
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
      $("hacia").value = texto;
      estado.editando = "hacia";
      estado.resultados = null;
      sugerir(texto);
      let intentos = 0;
      const leer = setInterval(() => {
        if (!estado.resultados && ++intentos < 12) return;
        clearInterval(leer);
        const res = estado.resultados ?? [];
        hablar(res.length
          ? `Encontré ${res.length} lugares. ` + res.slice(0, 3).map((l, i) => `${i + 1}: ${l.nombre}${l.detalle ? ", " + l.detalle : ""}.`).join(" ") + " Elige uno de la lista."
          : `No encontré ${texto}. Intenta con otro nombre.`);
      }, 400);
    };
    rec.onerror = () => hablar("No te escuché. Intenta otra vez.");
    rec.onend = () => $("dictar").classList.remove("oyendo");
    rec.start();
  });
}

// Guia de viaje: sigue el GPS y avisa con voz, vibracion y tono antes de bajarse.
const guia = { activa: false };

function decir(titulo, detalle, etapa) {
  if (etapa) $("guiaEtapa").textContent = etapa;
  $("guiaTitulo").textContent = titulo;
  $("guiaDetalle").textContent = detalle ?? "";
  hablar(detalle ? `${titulo}. ${detalle}` : titulo);
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
    () => decir("Sin ubicación", "Activa la ubicación para recibir los avisos."),
    { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
  );
}
const unaVez = (clave, fn) => { if (!guia.dichos.has(clave)) { guia.dichos.add(clave); fn(); } };

function iniciarGuia(o) {
  terminarGuia(true);
  const tramos = o.pasos.filter((p) => p.tipo === "camion");
  Object.assign(guia, { activa: true, o, tramos, k: 0, camion: tramos[0], fase: "parada", actual: 0, dichos: new Set() });
  ir("guia");
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
    if (falta <= 1 && falta > -3) unaVez(`pasa1-${guia.k}`, () => { vibrar([500, 150, 500]); decir(`La ${c.linea} debe estar por pasar`, `Pregúntale al chofer si es la ${c.linea} hacia ${c.hacia}.`); });
    else if (falta <= 5 && falta > 1) unaVez(`pasa5-${guia.k}`, () => { vibrar([300]); decir(`La ${c.linea} pasa en unos ${Math.round(falta)} minutos`); });
  }, 15000);
  const inicio = o.pasos[0];
  const c = guia.camion;
  decir(inicio.tipo === "app" ? `Pide ${Grieta.nombreApp(inicio.app)} a ${inicio.parada}` : `Camina a ${inicio.parada}`,
    `Ahí tomas la línea ${c.linea} hacia ${c.hacia}, a las ${Grieta.hhmm(c.sale)}.${tramos.length > 1 ? " Después cambias de camión; te aviso." : ""} Te aviso antes de bajar.`, "Hacia la parada");
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
      decir("Llegaste a la parada", `${r[0].nombre}. Espera la línea ${c.linea} hacia ${c.hacia}; pasa a las ${Grieta.hhmm(c.sale)}. Te aviso cuando esté por pasar.`, "En la parada");
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
        decir("Bájate aquí y cambia de camión", `Camina a ${sig.recorrido[0].nombre} y toma la línea ${sig.linea} hacia ${sig.hacia}, a las ${Grieta.hhmm(sig.sale)}.`, "Transbordo");
        return;
      }
      guia.fase = "fin";
      $("yaMeSubi").hidden = true;
      const fin = guia.o.pasos.at(-1);
      decir("Bájate aquí", `${final.nombre}. ${fin.tipo === "caminar" ? `Después camina unos ${Math.max(1, Math.round(fin.min))} minutos a tu destino.` : `Después pide ${Grieta.nombreApp(fin.app)} a tu destino.`}`, "Llegaste");
    });
  } else if (faltan === 1) {
    unaVez(clave("una"), () => { vibrar([700, 150, 700]); decir("Bájate en la siguiente", `${final.nombre}. Toca el timbre.`, "Ya casi"); });
  } else if (faltan === 2) {
    unaVez(clave("dos"), () => { vibrar([400, 150, 400]); decir("Bajas en dos paradas", `Prepárate. Tu parada es ${final.nombre}.`, "En el camión"); });
  } else {
    // En pantalla siempre; en voz cada 5 paradas y en cada una de las ultimas 5.
    $("guiaTitulo").textContent = `Faltan ${faltan} paradas`;
    $("guiaDetalle").textContent = `Vas por ${r[guia.actual].nombre}. Bajas en ${final.nombre}.`;
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
  decir(`Faltan ${faltan} paradas`, `Vas en la ${guia.camion.linea}. Bajas en ${r.at(-1).nombre}. Te aviso dos paradas antes.`, "En el camión");
}
$("yaMeSubi").addEventListener("click", () => subir(guia.actual));

// Para un viaje en app o en auto: avisa por distancia al destino.
function iniciarDestino() {
  terminarGuia(true);
  Object.assign(guia, { activa: true, o: null, camion: null, dichos: new Set() });
  ir("guia");
  mantenerPantalla();
  $("yaMeSubi").hidden = true;
  decir(`Rumbo a ${estado.destino.nombre}`, "Te aviso a un kilómetro, a 300 metros y al llegar.", "En camino");
  seguir((lat, lon) => {
    const m = Grieta.metros(lat, lon, estado.destino.lat, estado.destino.lon);
    if (m < 80) unaVez("llegaste", () => { vibrar([900, 200, 900]); decir("Llegaste", estado.destino.nombre, "Llegaste"); });
    else if (m < 300) unaVez("300", () => { vibrar([700, 150, 700]); decir("Estás a 300 metros", "Prepárate para bajar.", "Ya casi"); });
    else if (m < 1000) unaVez("1000", () => { vibrar([400, 150, 400]); decir("Falta un kilómetro", null, "En camino"); });
    else $("guiaDetalle").textContent = `Faltan ${(m / 1000).toFixed(1)} km.`;
  });
}

$("repetir").addEventListener("click", () => hablar($("guiaDetalle").dataset.ultimo ?? $("guiaTitulo").textContent));
$("terminar").addEventListener("click", () => terminarGuia());
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

function terminarGuia(sinVolver) {
  if (guia.reloj !== undefined) navigator.geolocation.clearWatch(guia.reloj);
  guia.reloj = undefined;
  clearInterval(guia.horario);
  guia.wake?.release?.();
  guia.activa = false;
  capas.aqui?.remove();
  capas.aqui = null;
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  if (!sinVolver) ir("detalle");
}


// Lugares guardados en este telefono: Casa, Escuela, Trabajo.
let guardados = [];
try { guardados = JSON.parse(localStorage.getItem("grieta-lugares") ?? "[]"); } catch {}
const sinAcentos = (t) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

function pintarGuardados() {
  $("guardados").hidden = !guardados.length;
  $("guardados").innerHTML = guardados.map((g, i) => `<button type="button" data-i="${i}" aria-label="Ir a ${g.nombre}">${g.nombre}</button>`).join("");
  $("listaGuardados").innerHTML = guardados.length
    ? guardados.map((g, i) => `<div class="fila-guardado"><span>${g.nombre}</span><button type="button" data-i="${i}" aria-label="Quitar ${g.nombre}">Quitar</button></div>`).join("")
    : `<p class="nota">Cuando elijas un destino, toca "Guardar este lugar".</p>`;
}
function guardarLugares() {
  try { localStorage.setItem("grieta-lugares", JSON.stringify(guardados)); } catch {}
  pintarGuardados();
}
$("guardados").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  estado.editando = "hacia";
  poner("destino", guardados[b.dataset.i]);
});
$("listaGuardados").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  guardados.splice(Number(b.dataset.i), 1);
  guardarLugares();
});
$("guardarLugar").addEventListener("click", () => {
  $("nombresLugar").hidden = false;
  $("nombresLugar").querySelector("button").focus();
});
$("nombresLugar").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  const { lat, lon } = estado.destino;
  guardados = guardados.filter((g) => g.nombre !== b.dataset.v).concat({ nombre: b.dataset.v, lat, lon });
  guardarLugares();
  $("nombresLugar").hidden = true;
  $("guardarLugar").textContent = `Guardado como ${b.dataset.v}`;
  $("guardarLugar").disabled = true;
  hablar(`Guardé ${estado.destino.nombre} como ${b.dataset.v}.`);
});

// API de Grieta para reportes y precios. Sin direccion configurada, esas funciones avisan y no mandan nada.
let API = "";
async function llamar(ruta, opciones = {}) {
  if (!API) throw new Error("sin api");
  const r = await fetch(`${API}${ruta}`, opciones);
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "error");
  return r.status === 204 ? null : r.json();
}
const NOMBRES_REPORTE = {
  banqueta: "Banqueta rota o angosta", sin_rampa: "No hay rampa", sin_techo: "Parada sin techo ni banca",
  obstaculo: "Obstáculo en el camino", sin_senalizacion: "Sin señalización", referencia: "Referencia", otro: "Aviso",
};
async function reportesCerca(lat, lon, radio = 120) {
  try { return await llamar(`/reportes?lat=${lat}&lon=${lon}&radio=${radio}`); } catch { return []; }
}
// Al llegar a una parada lee lo que otros dejaron: como encontrarla y que cuidar.
async function leerReferencias(parada) {
  const lista = await reportesCerca(parada.lat, parada.lon, 60);
  if (!lista.length) return;
  const refs = lista.filter((x) => x.tipo === "referencia" && x.descripcion).map((x) => x.descripcion);
  const avisos = lista.filter((x) => x.tipo !== "referencia").map((x) => NOMBRES_REPORTE[x.tipo].toLowerCase());
  const texto = [refs.length ? `Referencia: ${refs[0]}.` : "", avisos.length ? `Cuidado: ${[...new Set(avisos)].join(", ")}.` : ""].join(" ").trim();
  if (texto) setTimeout(() => hablar(texto), 4000);
}

// Reportar un problema donde estas parado.
const reporte = { tipo: null, lat: null, lon: null, parada: null };
$("abrirReporte").addEventListener("click", () => {
  Object.assign(reporte, { tipo: null, lat: null, lon: null, parada: null });
  for (const b of $("tipoReporte").children) b.setAttribute("aria-checked", "false");
  $("descripcion").value = "";
  $("foto").value = "";
  $("fotoNombre").textContent = "";
  $("reporteEstado").textContent = "";
  ir("reporte");
  const fijar = (lat, lon) => {
    Object.assign(reporte, { lat, lon });
    const ahora = new Date();
    const p = Grieta.pasanAqui(lat, lon, (ahora.getDay() + 6) % 7, ahora.getHours() * 60 + ahora.getMinutes(), 120)[0];
    reporte.parada = p?.nombre ?? null;
    // Cerca de una parada, el reporte queda en la parada para que lo encuentre quien la consulte.
    if (p) Object.assign(reporte, { lat: p.lat, lon: p.lon });
    $("reporteDonde").textContent = p ? `Cerca de la parada ${p.nombre}.` : "En tu ubicación actual.";
  };
  navigator.geolocation?.getCurrentPosition(
    ({ coords }) => fijar(coords.latitude, coords.longitude),
    () => (estado.origen ? fijar(estado.origen.lat, estado.origen.lon) : ($("reporteDonde").textContent = "No pude ver tu ubicación; activa la ubicación para reportar.")),
    { enableHighAccuracy: true, timeout: 10000 },
  );
});
$("tipoReporte").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  reporte.tipo = b.dataset.v;
  for (const x of $("tipoReporte").children) x.setAttribute("aria-checked", String(x === b));
});
$("foto").addEventListener("change", () => {
  const f = $("foto").files[0];
  $("fotoNombre").textContent = f ? `Foto lista: ${f.name}` : "";
});
$("enviarReporte").addEventListener("click", async () => {
  const avisar = (t) => { $("reporteEstado").textContent = t; hablar(t); };
  if (!reporte.tipo) return avisar("Elige qué pasa aquí.");
  if (reporte.lat === null) return avisar("Todavía no sé dónde estás. Activa la ubicación.");
  if (!API) return avisar("Los reportes todavía no están conectados al servidor. Pronto.");
  $("enviarReporte").disabled = true;
  try {
    const nuevo = await llamar("/reportes", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo: reporte.tipo, parada: reporte.parada, lat: reporte.lat, lon: reporte.lon, descripcion: $("descripcion").value.trim() || null }),
    });
    const f = $("foto").files[0];
    if (f) await llamar(`/reportes/${nuevo.id}/foto`, { method: "POST", headers: { "Content-Type": f.type }, body: f });
    avisar("Gracias. Tu reporte ayuda a quien pase por aquí.");
  } catch (err) {
    avisar(err.message === "sin api" ? "No hay conexión con el servidor." : `No se pudo enviar: ${err.message}.`);
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
  } catch {
    $("gracias").textContent = "No se pudo enviar ahorita.";
  }
});

// Sin conexion: la app y los horarios quedan guardados en el telefono.
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
function avisoConexion() {
  $("estado").textContent = navigator.onLine ? "" : "Sin internet: puedes ver qué camión pasa y tus lugares guardados; para buscar calles hace falta conexión.";
}
addEventListener("online", avisoConexion);
addEventListener("offline", avisoConexion);

Promise.all([
  Grieta.cargar(),
  fetch("datos/lugares.json").then((r) => r.json()),
  fetch("datos/config.json").then((r) => r.json()).catch(() => ({})),
]).then(([{ modelo }, l, config]) => {
  lugares = l;
  API = config.api || (["localhost", "127.0.0.1"].includes(location.hostname) ? "http://localhost:3000/api" : "");
  pintarGuardados();
  avisoConexion();
  $("info").textContent = `Precios estimados con ${modelo.momentos} registros del equipo. Horarios oficiales de Qrobus.`;
  ubicar();
});
