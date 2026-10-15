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
  if (cual === "origen") $("estado").textContent = "";
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
    lista.innerHTML = fijos.map((l, i) => `<li data-i="${i}">${l.nombre}</li>`).join("");
    lista.onclick = (e) => elegir(fijos[e.target.closest("li")?.dataset.i]);
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
        ? res.map((l, i) => `<li data-i="${i}">${l.nombre}<span>${l.detalle}</span></li>`).join("")
        : `<li class="vacio">No encontramos ese lugar. Prueba con otro nombre o toca el mapa.</li>`;
      lista.onclick = (e) => elegir(res[e.target.closest("li")?.dataset.i]);
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
  document.activeElement?.blur();
  estado.momento = 0;
  calcular();
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
  const r = Grieta.evaluar({ ...base, ...elegido, app: estado.app, precioVisto: Number($("precio").value), margen: estado.prisa });
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
  const yaEstaba = fila.classList.contains("elegida");
  quitarTrazo();
  if (yaEstaba) return;
  fila.classList.add("elegida");
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
          ${barata.precio - o.costo >= 5 ? `<span class="ahorro">Ahorras ${pesos(barata.precio - o.costo)}</span>` : ""}</div>
        <span class="precio">${pesos(o.costo)}<small>${o.minutos} min</small></span>
      </div>`).join("") + `<p class="tenue" style="margin-top:10px">Toca una opción para verla en el mapa.</p>`
    : `<p class="tenue">${mensajeSinCamion(r)}</p>`;
  $("camiones").onclick = (e) => {
    const t = e.target.closest(".tocable");
    if (t) dibujar(conCamion[t.dataset.i], t);
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

Promise.all([Grieta.cargar(), fetch("datos/lugares.json").then((r) => r.json())]).then(([{ modelo, qrobus }, l]) => {
  lugares = l;
  const v = qrobus.vigencia;
  $("info").textContent = `Estimado con ${modelo.momentos} registros del equipo; el precio cambia por franjas de 3 horas. Horarios oficiales de Qrobus vigentes al ${v.slice(6)}/${v.slice(4, 6)}/${v.slice(0, 4)}.`;
  sugerir("");
  ubicar();
});
