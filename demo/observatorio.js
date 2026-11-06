const $ = (id) => document.getElementById(id);
const TIPOS = {
  no_paro: "No hizo la parada", sucio: "Unidad sucia o en mal estado", manejo: "Manejo peligroso", cobro: "Cobro de más", acoso: "Acoso o agresión", otro_servicio: "Otra cosa del servicio",
  banqueta: "Banqueta rota", sin_rampa: "No hay rampa", sin_techo: "Parada sin techo", obstaculo: "Obstáculo", sin_senalizacion: "Falta señalización", referencia: "Referencia", otro: "Otra cosa",
};
const numero = (n) => n.toLocaleString("es-MX");
function barras(id, filas, nombre = (x) => x) {
  const lista = $(id);
  lista.replaceChildren();
  if (!filas.length) { const li = document.createElement("li"); li.className = "vacio"; li.textContent = "Todavía sin datos."; lista.append(li); return; }
  const tope = Math.max(...filas.map((f) => f.total));
  for (const f of filas) {
    const li = document.createElement("li"), etiqueta = document.createElement("span"), barra = document.createElement("span"), total = document.createElement("strong");
    etiqueta.textContent = nombre(f.clave); barra.className = "barra"; barra.style.width = `${(f.total / tope) * 100}%`; total.textContent = numero(f.total);
    li.append(etiqueta, barra, total); lista.append(li);
  }
}
(async () => {
  try {
    const config = await fetch("datos/config.json").then((r) => r.json()).catch(() => ({}));
    const api = ["localhost", "127.0.0.1"].includes(location.hostname) ? "http://localhost:3000/api" : config.api;
    $("enlaceJson").href = `${api}/observatorio`;
    const d = await fetch(`${api}/observatorio`).then((r) => { if (!r.ok) throw Error(); return r.json(); });
    $("cCo2").textContent = `${d.impacto.co2_kg.toLocaleString("es-MX", { maximumFractionDigits: 1 })} kg`;
    $("cViajes").textContent = numero(d.impacto.viajes);
    $("cQuejas").textContent = numero(d.quejas.total);
    $("cAcceso").textContent = numero(d.accesibilidad.vigentes);
    barras("quejasRuta", d.quejas.porRuta);
    barras("quejasTipo", d.quejas.porTipo, (t) => TIPOS[t] ?? t);
    barras("accesoTipo", d.accesibilidad.porTipo, (t) => TIPOS[t] ?? t);
    barras("accesoParada", d.accesibilidad.porParada);
    barras("llenoLinea", d.lleno.porLinea);
    const tope = Math.max(1, ...d.lleno.porHora);
    $("llenoHora").replaceChildren(...d.lleno.porHora.map((n, h) => {
      const s = document.createElement("span");
      s.style.height = `${(n / tope) * 100}%`; s.title = `${h}:00 · ${n}`;
      if (h % 6 === 0) s.dataset.h = `${h}h`;
      return s;
    }));
    $("estado").textContent = `Actualizado: ${new Date(d.actualizado).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })}`;
  } catch {
    $("estado").textContent = "No pude cargar los datos. Revisa tu conexión e intenta otra vez.";
  }
})();
