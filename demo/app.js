const $ = (id) => document.getElementById(id);
const pesos = (x) => `$${Math.round(x)}`;
const QUERETARO = [20.6, -100.4];
const RADIO_KM = 40;
const ACCIONES = { "pedir ya": "Pídelo ya", esperar: "Espera un poco", camion: "Vete en camión" };
const DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

const mapa = L.map("mapa", { zoomControl: false, attributionControl: false }).setView(QUERETARO, 12);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(mapa);
L.control.attribution({ position: "topright", prefix: false })
  .addAttribution('&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>').addTo(mapa);

const icono = (clase) => L.divIcon({ className: "", html: `<span class="marca ${clase}"></span>`, iconSize: [14, 14] });
const estado = { origen: null, destino: null, editando: "hacia", kmCalle: null, momento: 0, otra: null, prisa: 20, app: null, gps: null };
const AMBAR = "#e0a03c";
const TINTA = "#ede8df";
const ESPERAS = [0, 15, 30, 60];
const capas = {};
let lugares = [];

function dentroDeQueretaro(lat, lon) {
  return Grieta.metros(lat, lon, QUERETARO[0], QUERETARO[1]) / 1000 <= RADIO_KM;
}

function poner(cual, lugar) {
  estado[cual] = lugar;
  capas[cual]?.remove();
  capas[cual] = L.marker([lugar.lat, lugar.lon], { icon: icono(cual) }).addTo(mapa);
  $(cual === "origen" ? "desde" : "hacia").value = lugar.nombre;
  if (cual === "origen") {
    $("estado").textContent = "";
    $("pasanAqui").hidden = false;
  }
  if (estado.origen && estado.destino) trazar();
  else if (cual === "origen") {
    enfocar("hacia");
    $("hacia").focus();
  }
}

function enfocar(campo) {
  estado.editando = campo;
  sugerir("");
}

// Ubicacion del telefono como origen, si la da y esta en la zona.
function ubicar() {
  if (!navigator.geolocation) return sinUbicacion("Tu navegador no comparte la ubicación.");
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      if (!dentroDeQueretaro(coords.latitude, coords.longitude)) return sinUbicacion("Estás fuera de Querétaro. Escribe un origen.");
      estado.gps = { nombre: "Tu ubicación", lat: coords.latitude, lon: coords.longitude };
      $("estado").textContent = "";
      $("pasanAqui").hidden = false;
      if (!estado.origen) {
        poner("origen", estado.gps);
        mapa.setView([coords.latitude, coords.longitude], 14);
      }
    },
    () => sinUbicacion("Escribe dónde estás o toca el mapa."),
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
  );
}

function sinUbicacion(texto) {
  $("estado").textContent = texto;
  if (!estado.origen) enfocar("desde");
}

let espera;
function sugerir(texto) {
  clearTimeout(espera);
  const lista = $("sugerencias");
  if (texto.trim().length < 3) {
    const fijos = (estado.editando === "desde" && estado.gps ? [estado.gps] : []).concat(lugares);
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
      lista.innerHTML = res.length
        ? res.map((l, i) => `<li><button type="button" data-i="${i}">${l.nombre}<span>${l.detalle}</span></button></li>`).join("")
        : `<li class="vacio">No encontramos ese lugar. Prueba con otro nombre o toca el mapa.</li>`;
      lista.onclick = (e) => elegir(res[e.target.closest("button")?.dataset.i]);
      estado.resultados = res;
    } catch {
      lista.innerHTML = `<li class="vacio">Sin conexión con el buscador. Toca el mapa.</li>`;
    }
  }, 300);
}

function elegir(lugar) {
  if (!lugar) return;
  poner(estado.editando === "desde" ? "origen" : "destino", lugar);
}

for (const [campo, cual] of [["desde", "origen"], ["hacia", "destino"]]) {
  $(campo).addEventListener("focus", (e) => { e.target.select(); enfocar(campo); });
  $(campo).addEventListener("input", (e) => { estado.editando = campo; sugerir(e.target.value); });
  $(campo).addEventListener("blur", (e) => { if (!e.target.value && estado[cual]) e.target.value = estado[cual].nombre; });
}

mapa.on("click", async ({ latlng }) => {
  if (!dentroDeQueretaro(latlng.lat, latlng.lng)) return;
  const cual = !estado.origen || (estado.editando === "desde" && !estado.destino) ? "origen" : "destino";
  const lugar = { nombre: "Punto en el mapa", lat: latlng.lat, lon: latlng.lng };
  poner(cual, lugar);
  // Nombre de la calle o el lugar, si el buscador lo encuentra.
  try {
    const r = await (await fetch(`https://photon.komoot.io/reverse?lat=${latlng.lat}&lon=${latlng.lng}&limit=1`)).json();
    const p = r.features[0]?.properties;
    const nombre = p?.name ?? [p?.street, p?.housenumber].filter(Boolean).join(" ");
    if (nombre && estado[cual] === lugar) {
      lugar.nombre = nombre;
      $(cual === "origen" ? "desde" : "hacia").value = nombre;
      $(cual === "origen" ? "nombreDesde" : "nombreHacia").textContent = nombre;
    }
  } catch {}
});

async function trazar() {
  const { origen: o, destino: d } = estado;
  $("estado").textContent = "Calculando ruta...";
  $("sugerencias").innerHTML = "";
  capas.linea?.remove();
  quitarTrazo();
  estado.kmCalle = null;
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${o.lon},${o.lat};${d.lon},${d.lat}?overview=full&geometries=geojson`;
    const r = await (await fetch(url, { signal: AbortSignal.timeout(6000) })).json();
    const ruta = r.routes[0];
    estado.kmCalle = ruta.distance / 1000;
    capas.linea = L.geoJSON(ruta.geometry, { style: { color: AMBAR, weight: 4, opacity: 0.9 } }).addTo(mapa);
  } catch {
    capas.linea = L.polyline([[o.lat, o.lon], [d.lat, d.lon]], { color: AMBAR, weight: 3, dashArray: "4 8" }).addTo(mapa);
  }
  $("estado").textContent = "";
  mostrarViaje();
}

function mostrarViaje() {
  $("buscar").hidden = true;
  $("viaje").hidden = false;
  $("nombreDesde").textContent = `Desde ${estado.origen.nombre}`;
  $("nombreHacia").textContent = estado.destino.nombre;
  estado.momento = 0;
  calcular();
  $("nombreHacia").setAttribute("tabindex", "-1");
  $("nombreHacia").focus();
  encuadrar(capas.linea.getBounds());
}

$("cambiar").addEventListener("click", () => {
  quitarTrazo();
  $("viaje").hidden = true;
  $("buscar").hidden = false;
  $("hacia").focus();
});

$("centrar").addEventListener("click", () => {
  if (estado.gps) mapa.setView([estado.gps.lat, estado.gps.lon], 15);
  else ubicar();
});

function chips(id, alElegir, seQuita) {
  $(id).addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    const quitar = seQuita && b.classList.contains("activo");
    for (const x of $(id).children) x.classList.remove("activo");
    if (!quitar) b.classList.add("activo");
    alElegir(quitar ? null : b.dataset.v);
  });
}
chips("prisa", (v) => { estado.prisa = Number(v); calcular(); });
chips("appVista", (v) => {
  estado.app = v;
  $("ajustes").hidden = !v;
  if (v) $("precio").focus();
  calcular();
}, true);
$("precio").addEventListener("input", calcular);

// Momentos que se comparan: ahora, en 15, 30 y 60 minutos, y una hora que elige el usuario.
function momentos() {
  const ahora = new Date();
  const dia = (ahora.getDay() + 6) % 7;
  const minuto = ahora.getHours() * 60 + ahora.getMinutes();
  const lista = ESPERAS.map((m) => ({ dia, minuto: minuto + m, etiqueta: m ? (m < 60 ? `${m} min` : "1 h") : "Ahora" }));
  lista.push(estado.otra ? { ...estado.otra, etiqueta: Grieta.hhmm(estado.otra.minuto) } : { dia, minuto: minuto + 120, etiqueta: "Otra", vacia: true });
  return lista;
}

$("horas").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  estado.momento = Number(b.dataset.i);
  if (estado.momento === ESPERAS.length) {
    $("otraHora").hidden = false;
    if (!estado.otra) {
      const m = momentos().at(-1);
      $("dia").value = String((m.dia + Math.floor(m.minuto / 1440)) % 7);
      $("hora").value = Grieta.hhmm(m.minuto);
      leerOtra();
    }
  } else {
    $("otraHora").hidden = true;
  }
  calcular();
});
function leerOtra() {
  const [h, m] = ($("hora").value || "12:00").split(":").map(Number);
  estado.otra = { dia: Number($("dia").value), minuto: h * 60 + m };
}
for (const id of ["dia", "hora"]) $(id).addEventListener("input", () => { leerOtra(); calcular(); });

const normalizar = ({ dia, minuto }) => ({ dia: (dia + Math.floor(minuto / 1440)) % 7, minuto: minuto % 1440 });

function calcular() {
  if (!estado.origen || !estado.destino) return;
  const base = { origen: [estado.origen.lat, estado.origen.lon], destino: [estado.destino.lat, estado.destino.lon], kmCalle: estado.kmCalle };
  const lista = momentos();
  const precios = lista.map((m) => Grieta.cotizar({ ...base, ...m }));
  const elegido = normalizar(lista[estado.momento]);
  const r = Grieta.evaluar({ ...base, ...elegido, app: estado.app, precioVisto: Number($("precio").value), margen: estado.prisa, caminarMax: acc.camino ? 300 : undefined });
  pintarHoras(lista, precios, base);
  pintar(r, lista[estado.momento]);
}

function pintarHoras(lista, precios, base) {
  const cercanos = precios.slice(0, ESPERAS.length).map((p) => p.mejor.precio);
  const minimo = Math.min(...cercanos);
  $("horas").innerHTML = lista.map((m, i) => `
    <button type="button" data-i="${i}" class="${i === estado.momento ? "activo" : ""} ${i < ESPERAS.length && cercanos[i] === minimo ? "barata" : ""}">
      <span>${m.etiqueta}</span><strong>${m.vacia ? "+" : pesos(precios[i].mejor.precio)}</strong>
    </button>`).join("");

  const ahora = cercanos[0];
  const mejor = cercanos.slice(1).reduce((a, p, i) => (p < a.p ? { p, i: i + 1 } : a), { p: Infinity, i: 0 });
  const maximo = Math.max(...cercanos.slice(1));
  $("esperar").innerHTML = ahora - mejor.p >= 5
    ? `Si esperas hasta las ${Grieta.hhmm(lista[mejor.i].minuto)}, <strong>ahorras ${pesos(ahora - mejor.p)}</strong>.`
    : maximo - ahora >= 5
      ? `<strong>Pídelo ahora.</strong> En la próxima hora sube hasta ${pesos(maximo - ahora)}.`
      : `<strong>Da igual esperar:</strong> en la próxima hora casi no cambia.`;

  // La hora mas barata de lo que queda del dia, revisando el centro de cada franja.
  const hoy = lista[0];
  const opciones = [];
  for (let i = 0; i < Grieta.CORTES.length - 1; i++) {
    const [a, b] = [Grieta.CORTES[i] * 60, Grieta.CORTES[i + 1] * 60];
    if (b <= hoy.minuto) continue;
    const p = Grieta.cotizar({ ...base, dia: hoy.dia, minuto: Math.max(a, hoy.minuto) }).mejor.precio;
    opciones.push({ a, b, p });
  }
  const barata = opciones.reduce((x, y) => (y.p < x.p ? y : x), opciones[0]);
  $("mejorHora").textContent = !barata ? ""
    : barata.a <= hoy.minuto
      ? "Lo que queda del día no sale más barato que ahorita."
      : `Lo más barato hoy: de ${barata.a / 60} a ${barata.b / 60} h, ${pesos(barata.p)}.`;
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

function pasos(o) {
  const linea = (p) => {
    const min = Math.max(1, Math.round(p.min));
    if (p.tipo === "caminar") return p.hacia ? `Camina ${min} min a ${p.parada}` : `Camina ${min} min al destino`;
    if (p.tipo === "app") return p.hacia ? `${Grieta.nombreApp(p.app)} a ${p.parada}, ${pesos(p.costo)}` : `${Grieta.nombreApp(p.app)} al destino, ${pesos(p.costo)}`;
    return `Línea ${p.linea} a las ${Grieta.hhmm(p.sale)}, bajas en ${p.baja}`;
  };
  return `<ol class="pasos">${o.pasos.map((p) => `<li class="${p.tipo}">${linea(p)}</li>`).join("")}</ol>`;
}

function mensajeSinCamion(r) {
  return r.pasaCerca
    ? "Ningún Qrobus te lleva directo en la próxima hora."
    : "En la próxima hora no pasa ningún Qrobus cerca.";
}

function quitarTrazo() {
  capas.camion?.remove();
  capas.camion = null;
  capas.linea?.setStyle?.({ opacity: 0.9 });
  document.querySelectorAll("#camiones .tocable").forEach((x) => x.classList.remove("elegida"));
}

// Dibuja la opcion con camion: caminata punteada, app en linea delgada y el camion por sus paradas.
function dibujar(o, fila) {
  const yaEstaba = fila?.classList.contains("elegida");
  quitarTrazo();
  if (yaEstaba) return;
  fila?.classList.add("elegida");
  const estilo = (modo) => modo === "caminando"
    ? { color: TINTA, weight: 3, dashArray: "1 7", lineCap: "round" }
    : { color: TINTA, weight: 2, opacity: 0.7 };
  capas.linea?.setStyle?.({ opacity: 0.15 });
  capas.camion = L.featureGroup([
    L.polyline(o.trazo.acceso.puntos, estilo(o.trazo.acceso.modo)),
    L.polyline(o.trazo.camion, { color: AMBAR, weight: 5 }),
    L.polyline(o.trazo.salida.puntos, estilo(o.trazo.salida.modo)),
    ...[o.trazo.camion[0], o.trazo.camion.at(-1)].map((c) => L.circleMarker(c, { radius: 5, color: "#0b0a09", weight: 2, fillColor: AMBAR, fillOpacity: 1 })),
  ]).addTo(mapa);
  encuadrar(capas.camion.getBounds());
}

function encuadrar(limites) {
  const alto = $("hoja").getBoundingClientRect().height;
  mapa.fitBounds(limites, innerWidth >= 760
    ? { paddingTopLeft: [440, 40], paddingBottomRight: [40, 40] }
    : { paddingTopLeft: [30, 70], paddingBottomRight: [30, Math.min(alto, innerHeight * 0.64) + 20] });
}

function pintar(r, momento) {
  const orden = [...r.directo.porApp].sort((a, b) => a.precio - b.precio);
  const barata = orden[0];
  $("cuandoTexto").textContent = estado.momento === 0
    ? "Más barato ahorita"
    : `Más barato ${momento.etiqueta === "1 h" ? "en 1 hora" : estado.momento < ESPERAS.length ? `en ${momento.etiqueta}` : `el ${DIAS[r.ctx.dia]} a las ${Grieta.hhmm(r.ctx.minuto)}`}`;
  $("appBarata").textContent = Grieta.nombreApp(barata.app);
  $("precioBarato").textContent = pesos(barata.precio);
  $("km").textContent = `${r.directo.km.toFixed(1)} km, unos ${Math.round(r.directo.minutos)} min en auto`;

  $("apps").innerHTML = orden.map((x, i) => `
    <div class="opcion${i === 0 ? " mejor" : ""}">
      <div>${Grieta.nombreApp(x.app)}${x.app === "uber" ? `<a class="abrir" href="${enlaceUber()}" target="_blank" rel="noopener">Abrir</a>` : ""}
        <p class="tenue">Normal entre ${pesos(x.bajo)} y ${pesos(x.alto)}</p></div>
      <span class="precio">${pesos(x.precio)}</span>
    </div>`).join("");

  quitarTrazo();
  const conCamion = r.opciones.filter((o) => o.tipo !== "app");
  $("camiones").innerHTML = conCamion.length
    ? conCamion.map((o, i) => `
      <div class="opcion tocable" data-i="${i}">
        <div>${o.opcion}${pasos(o)}
          ${barata.precio - o.costo >= 5 ? `<span class="ahorro">Ahorras ${pesos(barata.precio - o.costo)}</span>` : ""}
          <div class="acciones">
            <button type="button" data-accion="escuchar" aria-label="Escuchar los pasos de esta opción">Escuchar</button>
            <button type="button" data-accion="iniciar" class="iniciar" aria-label="Iniciar viaje con avisos por voz">Iniciar viaje</button>
          </div></div>
        <span class="precio">${pesos(o.costo)}<small>${o.minutos} min</small></span>
      </div>`).join("") + `<p class="tenue" style="margin-top:10px">Toca una opción para verla en el mapa.</p>`
    : `<p class="tenue">${mensajeSinCamion(r)}</p>`;
  $("camiones").onclick = (e) => {
    const t = e.target.closest(".tocable");
    if (!t) return;
    const o = conCamion[t.dataset.i];
    const accion = e.target.closest("button")?.dataset.accion;
    if (accion === "escuchar") return hablar(textoPasos(o));
    if (accion === "iniciar") return iniciarGuia(o);
    dibujar(o, t);
  };

  const d = r.decision;
  $("veredicto").innerHTML = !d ? "" : `
    <div class="veredicto">
      <p class="grande">${ACCIONES[d.accion]}</p>
      <p>Te marca ${pesos(d.esperado.precio * d.relacion)} y lo normal es ${pesos(d.esperado.precio)}.
        ${d.extra < 1e8 ? `El camión que ahorra tarda ${Math.round(d.extra)} min más.` : "Ningún camión ahorra al menos 30%."}</p>
      <details><summary>Por qué</summary>
        <ul>${d.activas.slice(0, 3).map((a) => `<li><span>${a.w.toFixed(2)}</span>Si ${a.texto}: ${ACCIONES[a.accion].toLowerCase()}</li>`).join("")}</ul>
      </details>
    </div>`;
}


// Voz y vibracion. iPhone no deja vibrar desde el navegador; ahi solo queda la voz.
let vozGrieta = null;
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
// Vibracion y un tono corto por cada pulso, para que en iPhone tambien haya senal sin voz.
let audio;
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

function textoPasos(o) {
  return o.pasos.map((p) => {
    const min = Math.max(1, Math.round(p.min));
    if (p.tipo === "caminar") return p.hacia ? `Camina ${min} minutos a la parada ${p.parada}.` : `Camina ${min} minutos a tu destino.`;
    if (p.tipo === "app") return p.hacia ? `Pide ${Grieta.nombreApp(p.app)} hasta la parada ${p.parada}, unos ${Math.round(p.costo)} pesos.` : `Pide ${Grieta.nombreApp(p.app)} a tu destino, unos ${Math.round(p.costo)} pesos.`;
    return `Toma la línea ${p.linea} hacia ${p.hacia}, que pasa a las ${Grieta.hhmm(p.sale)}. Bájate en ${p.baja}, ${p.paradas} paradas después.`;
  }).join(" ");
}

// Que camiones pasan por las paradas cercanas, con sus proximas horas.
$("pasanAqui").addEventListener("click", () => {
  const punto = estado.gps ?? estado.origen;
  if (!punto) return;
  const ahora = new Date();
  const lista = Grieta.pasanAqui(punto.lat, punto.lon, (ahora.getDay() + 6) % 7, ahora.getHours() * 60 + ahora.getMinutes());
  $("paradas").hidden = false;
  if (!lista.length) {
    $("paradas").innerHTML = `<p class="tenue">No hay paradas de Qrobus con servicio a menos de 350 metros.</p>`;
    return hablar("No hay paradas de Qrobus con servicio cerca de ti.");
  }
  $("paradas").innerHTML = lista.map((p) => `
    <div class="parada">
      <p>${p.nombre} <span class="tenue">a ${Math.round(p.m)} m</span></p>
      <ul>${p.lineas.slice(0, 5).map((l) => `<li><strong>${l.linea}</strong> hacia ${l.hacia} · ${l.horas.map(Grieta.hhmm).join(" y ")}</li>`).join("")}</ul>
    </div>`).join("");
  const p = lista[0];
  hablar(`La parada más cercana es ${p.nombre}, a ${Math.round(p.m)} metros. ` +
    p.lineas.slice(0, 4).map((l) => `Línea ${l.linea} hacia ${l.hacia}, a las ${Grieta.hhmm(l.horas[0])}.`).join(" "));
});

// Guia de viaje: sigue el GPS y avisa con voz y vibracion antes de bajarse.
const guia = { activa: false };

function mostrarGuia(visible) {
  $("guia").hidden = !visible;
  $("viaje").hidden = visible;
  $("buscar").hidden = true;
}

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
      // El punto en el mapa sirve a quien acompaña; los avisos van por voz.
      const aqui = [coords.latitude, coords.longitude];
      if (capas.aqui) capas.aqui.setLatLng(aqui);
      else capas.aqui = L.marker(aqui, { icon: icono("origen") }).addTo(mapa);
      alMoverse(coords.latitude, coords.longitude);
    },
    () => decir("Sin ubicación", "Activa la ubicación para recibir los avisos."),
    { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
  );
}

function iniciarGuia(o) {
  terminarGuia(true);
  const camion = o.pasos.find((p) => p.tipo === "camion");
  Object.assign(guia, { activa: true, tipo: "camion", o, camion, fase: "parada", actual: 0, dichos: new Set() });
  mostrarGuia(true);
  mantenerPantalla();
  dibujar(o);
  const inicio = o.pasos[0];
  $("yaMeSubi").hidden = false;
  vibrar([60]);
  // Con el horario oficial: avisa 5 minutos y 1 minuto antes de que pase el camion.
  guia.horario = setInterval(() => {
    if (guia.fase !== "parada" && guia.fase !== "esperando") return;
    const ahora = new Date();
    const falta = guia.camion.sale - (ahora.getHours() * 60 + ahora.getMinutes() + ahora.getSeconds() / 60);
    const una = (clave, fn) => { if (!guia.dichos.has(clave)) { guia.dichos.add(clave); fn(); } };
    if (falta <= 1 && falta > -3) una("pasa1", () => { vibrar([500, 150, 500]); decir(`La ${guia.camion.linea} debe estar por pasar`, `Según el horario pasa a las ${Grieta.hhmm(guia.camion.sale)}. Pregúntale al chofer si es la ${guia.camion.linea} hacia ${guia.camion.hacia}.`); });
    else if (falta <= 5 && falta > 1) una("pasa5", () => { vibrar([300]); decir(`La ${guia.camion.linea} pasa en unos ${Math.round(falta)} minutos`, null); });
  }, 15000);
  decir(inicio.tipo === "app" ? `Pide ${Grieta.nombreApp(inicio.app)} a ${inicio.parada}` : `Camina a ${inicio.parada}`,
    `Ahí tomas la línea ${camion.linea} hacia ${camion.hacia}, a las ${Grieta.hhmm(camion.sale)}. Te aviso antes de bajar.`, "Hacia la parada");
  seguir(avanzarCamion);
}

function avanzarCamion(lat, lon) {
  const r = guia.o.recorrido;
  const final = r.at(-1);
  const d = r.map((s) => Grieta.metros(lat, lon, s.lat, s.lon));
  if (guia.fase === "parada" || guia.fase === "esperando") {
    if (guia.fase === "parada" && d[0] < 40) {
      guia.fase = "esperando";
      vibrar([300, 120, 300]);
      decir(`Llegaste a ${r[0].nombre}`, `Espera la línea ${guia.camion.linea} hacia ${guia.camion.hacia}. Pasa a las ${Grieta.hhmm(guia.camion.sale)}. Te aviso cuando esté por pasar.`, "En la parada");
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
  const una = (clave, fn) => { if (!guia.dichos.has(clave)) { guia.dichos.add(clave); fn(); } };
  if (faltan === 0 || d.at(-1) < 60) {
    una("llegaste", () => {
      vibrar([900, 200, 900]);
      guia.fase = "fin";
      $("yaMeSubi").hidden = true;
      const fin = guia.o.pasos.at(-1);
      decir(`Bájate aquí: ${final.nombre}`, fin.tipo === "caminar" ? `Después camina unos ${Math.max(1, Math.round(fin.min))} minutos a tu destino.` : `Después pide ${Grieta.nombreApp(fin.app)} a tu destino.`, "Llegaste");
    });
  } else if (faltan === 1) {
    una("una", () => { vibrar([700, 150, 700]); decir(`Bájate en la siguiente: ${final.nombre}`, "Toca el timbre.", "Ya casi"); });
  } else if (faltan === 2) {
    una("dos", () => { vibrar([400, 150, 400]); decir("Prepárate: bajas en dos paradas", `Tu parada es ${final.nombre}.`, "En el camión"); });
  } else {
    // En pantalla siempre; en voz cada 5 paradas y en cada una de las ultimas 5.
    $("guiaTitulo").textContent = `Faltan ${faltan} paradas`;
    $("guiaDetalle").textContent = `Vas por ${r[guia.actual].nombre}. Bajas en ${final.nombre}.`;
    if (faltan <= 5 || faltan % 5 === 0) una(`faltan${faltan}`, () => decir(`Faltan ${faltan} paradas`, `Vas por ${r[guia.actual].nombre}.`, "En el camión"));
  }
}

function subir(desde = 0) {
  if (guia.fase === "camion") return;
  guia.fase = "camion";
  guia.actual = desde;
  $("yaMeSubi").hidden = true;
  const faltan = guia.o.recorrido.length - 1 - desde;
  guia.dichos.add(`faltan${faltan}`);
  decir(`Vas en la línea ${guia.camion.linea}`, `Faltan ${faltan} paradas. Bajas en ${guia.o.recorrido.at(-1).nombre}. Te aviso dos paradas antes.`, "En el camión");
}
$("yaMeSubi").addEventListener("click", () => subir(guia.actual));

// Para cualquier viaje (app o auto): avisa por distancia al destino.
$("avisarLlegada").addEventListener("click", () => {
  terminarGuia(true);
  Object.assign(guia, { activa: true, tipo: "destino", dichos: new Set() });
  mostrarGuia(true);
  mantenerPantalla();
  $("yaMeSubi").hidden = true;
  decir(`Rumbo a ${estado.destino.nombre}`, "Te aviso a un kilómetro, a 300 metros y al llegar.", "En camino");
  seguir((lat, lon) => {
    const m = Grieta.metros(lat, lon, estado.destino.lat, estado.destino.lon);
    const una = (clave, fn) => { if (!guia.dichos.has(clave)) { guia.dichos.add(clave); fn(); } };
    if (m < 80) una("llegaste", () => { vibrar([900, 200, 900]); decir(`Llegaste a ${estado.destino.nombre}`, null, "Llegaste"); });
    else if (m < 300) una("300", () => { vibrar([700, 150, 700]); decir("Estás a 300 metros", "Prepárate para bajar.", "Ya casi"); });
    else if (m < 1000) una("1000", () => { vibrar([400, 150, 400]); decir("Falta un kilómetro", null, "En camino"); });
    else $("guiaDetalle").textContent = `Faltan ${(m / 1000).toFixed(1)} km.`;
  });
});

$("repetir").addEventListener("click", () => hablar($("guiaDetalle").dataset.ultimo ?? $("guiaTitulo").textContent));
$("terminar").addEventListener("click", () => terminarGuia());

function terminarGuia(sinVolver) {
  if (guia.reloj !== undefined) navigator.geolocation.clearWatch(guia.reloj);
  guia.reloj = undefined;
  clearInterval(guia.horario);
  guia.wake?.release?.();
  guia.activa = false;
  capas.aqui?.remove();
  capas.aqui = null;
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  if (!sinVolver) mostrarGuia(false);
}


// Ajustes de accesibilidad, guardados en este telefono.
const acc = { grande: false, contraste: false, voz: true, lenta: false, camino: false };
try { Object.assign(acc, JSON.parse(localStorage.getItem("grieta-acc") ?? "{}")); } catch {}
const OPCIONES = { grande: "optGrande", contraste: "optContraste", voz: "optVoz", lenta: "optLenta", camino: "optCamino" };
function aplicarAcc() {
  document.documentElement.classList.toggle("grande", acc.grande);
  document.documentElement.classList.toggle("contraste", acc.contraste);
  for (const [k, id] of Object.entries(OPCIONES)) $(id).checked = acc[k];
}
for (const [k, id] of Object.entries(OPCIONES)) {
  $(id).addEventListener("change", (e) => {
    acc[k] = e.target.checked;
    try { localStorage.setItem("grieta-acc", JSON.stringify(acc)); } catch {}
    aplicarAcc();
    if (k === "camino") calcular();
  });
}
aplicarAcc();
$("abrirAcc").addEventListener("click", () => {
  $("accesibilidad").hidden = false;
  $("hoja").scrollTop = 0;
  $("tituloAcc").setAttribute("tabindex", "-1");
  $("tituloAcc").focus();
});
$("cerrarAcc").addEventListener("click", () => {
  $("accesibilidad").hidden = true;
  $("abrirAcc").focus();
});

// Dictar el destino: llena el campo, busca y lee las primeras opciones.
const Reconocer = window.SpeechRecognition || window.webkitSpeechRecognition;
if (Reconocer) {
  $("dictar").hidden = false;
  $("dictar").addEventListener("click", () => {
    const rec = new Reconocer();
    rec.lang = "es-MX";
    rec.interimResults = false;
    $("dictar").classList.add("oyendo");
    speechSynthesis?.cancel();
    rec.onresult = (e) => {
      const texto = e.results[0][0].transcript;
      $("hacia").value = texto;
      estado.editando = "hacia";
      estado.resultados = null;
      sugerir(texto);
      // Espera a que lleguen los resultados del buscador y los dice.
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

// Donde estoy: la calle segun el buscador y la parada mas cercana.
function dondeEstoy() {
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
    $("estado").textContent = texto;
    if (guia.activa) $("guiaDetalle").textContent = texto;
    hablar(texto);
  }, () => hablar("No pude ver tu ubicación."), { enableHighAccuracy: true, timeout: 10000 });
}
$("dondeEstoy").addEventListener("click", dondeEstoy);
$("dondeGuia").addEventListener("click", dondeEstoy);

// Compartir el viaje con alguien de confianza: a donde va y donde esta ahorita.
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

Promise.all([Grieta.cargar(), fetch("datos/lugares.json").then((r) => r.json())]).then(([{ modelo }, l]) => {
  lugares = l;
  $("info").textContent = `Estimado con ${modelo.momentos} registros del equipo; el precio cambia por franjas de 3 horas. Horarios oficiales de Qrobus publicados por la Agencia de Movilidad.`;
  sugerir("");
  ubicar();
});
