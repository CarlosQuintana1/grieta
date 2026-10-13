const $ = (id) => document.getElementById(id);
const pesos = (x) => `$${Math.round(x)}`;
const QUERETARO = [20.6, -100.4];
const ACCIONES = { "pedir ya": "Pídelo ya", esperar: "Espera un poco", camion: "Vete en camión" };

const mapa = L.map("mapa", { zoomControl: false }).setView(QUERETARO, 12);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  maxZoom: 19,
}).addTo(mapa);

const marca = (color) => L.divIcon({ className: "marca", html: `<span style="background:${color}"></span>`, iconSize: [18, 18] });
const puntos = { origen: null, destino: null };
const capas = { origen: null, destino: null, linea: null };

function poner(cual, latlng) {
  puntos[cual] = [latlng.lat, latlng.lng];
  capas[cual]?.remove();
  capas[cual] = L.marker(latlng, { icon: marca(cual === "origen" ? "#cecece" : "#3a5a74") }).addTo(mapa);
}

mapa.on("click", (e) => {
  if (!puntos.origen) poner("origen", e.latlng);
  else if (!puntos.destino) poner("destino", e.latlng);
  else poner("destino", e.latlng);
  calcular();
});

$("reiniciar").addEventListener("click", () => {
  for (const k of ["origen", "destino", "linea"]) capas[k]?.remove();
  puntos.origen = puntos.destino = null;
  $("resultados").hidden = true;
  $("paso").textContent = "Toca el mapa para poner el origen.";
});

for (const id of ["dia", "hora", "app", "precio", "margen"]) $(id).addEventListener("input", calcular);

const ahora = new Date();
$("dia").value = String((ahora.getDay() + 6) % 7);
$("hora").value = `${String(ahora.getHours()).padStart(2, "0")}:${String(ahora.getMinutes()).padStart(2, "0")}`;

function calcular() {
  if (!puntos.origen) return;
  if (!puntos.destino) {
    $("paso").textContent = "Ahora toca el destino.";
    return;
  }
  $("paso").textContent = "Toca otro punto para cambiar el destino.";
  capas.linea?.remove();
  capas.linea = L.polyline([puntos.origen, puntos.destino], { color: "#3a5a74", weight: 2, dashArray: "4 6" }).addTo(mapa);

  const [h, m] = ($("hora").value || "12:00").split(":").map(Number);
  const r = Grieta.evaluar({
    origen: puntos.origen,
    destino: puntos.destino,
    dia: Number($("dia").value),
    minuto: h * 60 + m,
    app: $("app").value,
    precioVisto: Number($("precio").value),
    margen: Number($("margen").value || 0),
  });
  pintar(r);
}

function pintar(r) {
  $("resultados").hidden = false;
  const sig = r.siguiente ? Object.fromEntries(r.siguiente.porApp.map((x) => [x.app, x.precio])) : null;
  $("precios").innerHTML = `
    <p class="nota">${r.directo.km.toFixed(1)} km aproximados</p>
    <table>
      <tr><th>App</th><th>Esperado</th><th>Normal entre</th>${sig ? `<th>Desde ${Grieta.hhmm(r.siguiente.minuto)}</th>` : ""}</tr>
      ${r.directo.porApp.map((x) => `
        <tr class="${x.app === r.directo.mejor.app ? "mejor" : ""}">
          <td>${Grieta.nombreApp(x.app)}</td><td>${pesos(x.precio)}</td>
          <td>${pesos(x.bajo)} y ${pesos(x.alto)}</td>${sig ? `<td>${pesos(sig[x.app])}</td>` : ""}
        </tr>`).join("")}
    </table>`;

  $("opciones").innerHTML = r.opciones.map((o) => `
    <article>
      <div class="fila"><strong>${o.opcion}</strong><span>${pesos(o.costo)} · ${o.minutos} min</span></div>
      ${o.detalle ? `<p>${o.detalle}</p>` : ""}
    </article>`).join("") || "<p class=\"nota\">Sin opciones.</p>";

  const d = r.decision;
  if (!d) {
    $("decision").innerHTML = `<p class="nota">Pon la app y el precio que te marca para que Grieta decida si pedir ya, esperar o irte en camión.</p>`;
    return;
  }
  const texto = ACCIONES[d.accion];
  $("decision").innerHTML = `
    <h2>Qué conviene</h2>
    <p class="veredicto">${texto}</p>
    <p class="nota">Te marca ${(d.relacion).toFixed(2)} veces lo esperado (${pesos(d.esperado.precio)}).
      ${d.extra < 1e8 ? `La mejor opción con camión tarda ${Math.round(d.extra)} min más.` : "Ninguna opción con camión ahorra al menos 30%."}</p>
    <ul>${d.activas.slice(0, 3).map((a) => `<li><span>${a.w.toFixed(2)}</span> Si ${a.texto}: ${ACCIONES[a.accion].toLowerCase()}</li>`).join("")}</ul>`;
}

Grieta.cargar().then(({ modelo, qrobus }) => {
  const v = qrobus.vigencia;
  $("info").textContent = `Demo · ${modelo.momentos} registros hasta el ${modelo.hasta} · horarios de Qrobus vigentes al ${v.slice(6)}/${v.slice(4, 6)}/${v.slice(0, 4)}`;
});
