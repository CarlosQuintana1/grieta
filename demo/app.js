const $ = (id) => document.getElementById(id);
const pesos = (x) => `$${Math.round(x)}`;
const QUERETARO = [20.6, -100.4];
const RADIO_KM = 40;
const ACCIONES = { "pedir ya": "Pídelo ya", esperar: "Espera un poco", camion: "Vete en camión" };
const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

const mapa = L.map("mapa", { zoomControl: false, attributionControl: false }).setView(QUERETARO, 12);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(mapa);
L.control.attribution({ position: "topright", prefix: false })
  .addAttribution('&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>').addTo(mapa);

const icono = (clase) => L.divIcon({ className: "", html: `<span class="marca ${clase}"></span>`, iconSize: [18, 18] });
const estado = { origen: null, destino: null, editando: "hacia", kmCalle: null, horario: null, prisa: 20, app: null, gps: null };
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
      if (!dentroDeQueretaro(coords.latitude, coords.longitude)) return sinUbicacion("Estás fuera de Querétaro: escribe un origen.");
      estado.gps = { nombre: "Tu ubicación", lat: coords.latitude, lon: coords.longitude };
      $("estado").textContent = "";
      if (!estado.origen) {
        poner("origen", estado.gps);
        mapa.setView([coords.latitude, coords.longitude], 14);
      }
    },
    () => sinUbicacion("No pudimos ver tu ubicación. Escribe dónde estás o toca el mapa."),
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
    lista.innerHTML = fijos.map((l, i) => `<li data-i="${i}"><strong>${l.nombre}</strong></li>`).join("");
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
        ? res.map((l, i) => `<li data-i="${i}"><strong>${l.nombre}</strong><span>${l.detalle}</span></li>`).join("")
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
  capas.linea?.remove();
  estado.kmCalle = null;
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${o.lon},${o.lat};${d.lon},${d.lat}?overview=full&geometries=geojson`;
    const r = await (await fetch(url, { signal: AbortSignal.timeout(6000) })).json();
    const ruta = r.routes[0];
    estado.kmCalle = ruta.distance / 1000;
    capas.linea = L.geoJSON(ruta.geometry, { style: { color: "#6f9cc0", weight: 5, opacity: 0.9 } }).addTo(mapa);
  } catch {
    capas.linea = L.polyline([[o.lat, o.lon], [d.lat, d.lon]], { color: "#6f9cc0", weight: 3, dashArray: "4 8" }).addTo(mapa);
  }
  mostrarViaje();
}

function mostrarViaje() {
  $("buscar").hidden = true;
  $("viaje").hidden = false;
  $("nombreDesde").textContent = estado.origen.nombre;
  $("nombreHacia").textContent = estado.destino.nombre;
  document.activeElement?.blur();
  calcular();
  const alto = $("hoja").getBoundingClientRect().height;
  const ancho = innerWidth >= 760;
  mapa.fitBounds(capas.linea.getBounds(), ancho
    ? { paddingTopLeft: [440, 40], paddingBottomRight: [40, 40] }
    : { paddingTopLeft: [40, 70], paddingBottomRight: [40, Math.min(alto, innerHeight * 0.62) + 20] });
}

$("cambiar").addEventListener("click", () => {
  $("viaje").hidden = true;
  $("buscar").hidden = false;
  $("hacia").focus();
});

$("centrar").addEventListener("click", () => {
  if (estado.gps) mapa.setView([estado.gps.lat, estado.gps.lon], 15);
  else ubicar();
});

$("cuando").addEventListener("click", () => {
  const abierto = !$("horario").hidden;
  $("horario").hidden = abierto;
  if (!abierto && !estado.horario) {
    const ahora = new Date();
    $("dia").value = String((ahora.getDay() + 6) % 7);
    $("hora").value = `${String(ahora.getHours()).padStart(2, "0")}:${String(ahora.getMinutes()).padStart(2, "0")}`;
  }
});
for (const id of ["dia", "hora"]) {
  $(id).addEventListener("input", () => {
    estado.horario = { dia: Number($("dia").value), hora: $("hora").value };
    $("cuando").textContent = `${DIAS[estado.horario.dia]} ${estado.horario.hora}`;
    calcular();
  });
}

function segmento(id, alElegir, seQuita) {
  $(id).addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    const quitar = seQuita && b.classList.contains("activo");
    for (const x of $(id).children) x.classList.remove("activo");
    if (!quitar) b.classList.add("activo");
    alElegir(quitar ? null : b.dataset.v);
  });
}
segmento("prisa", (v) => { estado.prisa = Number(v); calcular(); });
segmento("appVista", (v) => {
  estado.app = v;
  $("precio").hidden = !v;
  if (v) $("precio").focus();
  calcular();
}, true);
$("precio").addEventListener("input", calcular);

function calcular() {
  if (!estado.origen || !estado.destino) return;
  const ahora = new Date();
  const [h, m] = (estado.horario?.hora ?? `${ahora.getHours()}:${ahora.getMinutes()}`).split(":").map(Number);
  const r = Grieta.evaluar({
    origen: [estado.origen.lat, estado.origen.lon],
    destino: [estado.destino.lat, estado.destino.lon],
    dia: estado.horario?.dia ?? (ahora.getDay() + 6) % 7,
    minuto: h * 60 + m,
    app: estado.app,
    precioVisto: Number($("precio").value),
    margen: estado.prisa,
    kmCalle: estado.kmCalle,
  });
  pintar(r);
}

function pintar(r) {
  $("km").textContent = `${r.directo.km.toFixed(1)} km`;
  const orden = [...r.directo.porApp].sort((a, b) => a.precio - b.precio);
  $("apps").innerHTML = orden.map((x, i) => `
    <div class="opcion${i === 0 ? " mejor" : ""}">
      <div><strong>${Grieta.nombreApp(x.app)}</strong>${i === 0 ? '<span class="etiqueta">Más barata</span>' : ""}
        <p>Normal entre ${pesos(x.bajo)} y ${pesos(x.alto)} · ${Math.round(r.directo.minutos)} min</p></div>
      <span class="precio">${pesos(x.precio)}</span>
    </div>`).join("");
  if (r.siguiente) {
    const sig = r.siguiente.porApp.map((x) => `${Grieta.nombreApp(x.app)} ${pesos(x.precio)}`).join(" · ");
    $("apps").innerHTML += `<p class="nota">Desde las ${Grieta.hhmm(r.siguiente.minuto)}: ${sig}</p>`;
  }

  const conCamion = r.opciones.filter((o) => !o.opcion.startsWith("Solo app"));
  $("camiones").innerHTML = conCamion.length
    ? conCamion.map((o) => `
      <div class="opcion">
        <div><strong>${o.opcion}</strong><p>${o.detalle}</p></div>
        <span class="precio">${pesos(o.costo)}<small>${o.minutos} min</small></span>
      </div>`).join("")
    : `<p class="nota">No hay un Qrobus directo en la próxima hora.</p>`;

  const d = r.decision;
  $("veredicto").innerHTML = !d ? "" : `
    <div class="tarjeta">
      <p class="grande">${ACCIONES[d.accion]}</p>
      <p>Te marca ${pesos(d.esperado.precio * d.relacion)}; lo normal a esta hora es ${pesos(d.esperado.precio)}.
        ${d.extra < 1e8 ? `El camión más rápido que ahorra tarda ${Math.round(d.extra)} min más.` : "Ninguna opción con camión ahorra al menos 30%."}</p>
      <details><summary>Por qué</summary>
        <ul>${d.activas.slice(0, 3).map((a) => `<li><span>${a.w.toFixed(2)}</span>Si ${a.texto}: ${ACCIONES[a.accion].toLowerCase()}</li>`).join("")}</ul>
      </details>
    </div>`;
}

Promise.all([Grieta.cargar(), fetch("datos/lugares.json").then((r) => r.json())]).then(([{ modelo, qrobus }, l]) => {
  lugares = l;
  const v = qrobus.vigencia;
  $("info").textContent = `Demo con ${modelo.momentos} registros del equipo. Horarios oficiales de Qrobus vigentes al ${v.slice(6)}/${v.slice(4, 6)}/${v.slice(0, 4)}.`;
  sugerir("");
  ubicar();
});
