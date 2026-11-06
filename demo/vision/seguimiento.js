((raiz) => {
  function iou(a, b) {
    const cruce = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    return cruce / Math.max(0.00001, a.w * a.h + b.w * b.h - cruce);
  }
  function calidad(pixeles, ancho, alto, previa, mascaras = []) {
    const gris = new Float32Array(64 * 48);
    let suma = 0, suma2 = 0;
    for (let y = 0; y < 48; y++) for (let x = 0; x < 64; x++) {
      const i = (Math.min(alto - 1, Math.floor(y * alto / 48)) * ancho + Math.min(ancho - 1, Math.floor(x * ancho / 64))) * 4;
      const v = pixeles[i] * 0.299 + pixeles[i + 1] * 0.587 + pixeles[i + 2] * 0.114;
      gris[y * 64 + x] = v; suma += v; suma2 += v * v;
    }
    const luz = suma / gris.length, contraste = Math.sqrt(Math.max(0, suma2 / gris.length - luz * luz));
    let diferencia = 0;
    if (previa) for (let i = 0; i < gris.length; i++) diferencia += Math.abs((gris[i] - luz) - (previa.gris[i] - previa.luz));
    const movimiento = previa ? diferencia / gris.length / 255 : 0;
    const problema = luz < 28 ? 'oscura' : luz > 246 && contraste < 8 ? 'expuesta' : contraste < 8 ? 'sin-detalle' : null;
    let nitidez = 0;
    for (let y = 1; y < 47; y++) for (let x = 1; x < 63; x++) { const k = y * 64 + x; nitidez += (gris[k - 1] + gris[k + 1] + gris[k - 64] + gris[k + 64] - gris[k] * 4) ** 2; }
    const camara = GrietaMovimiento.estimar(gris, previa?.gris, movimiento, luz, previa?.luz, mascaras);
    return { gris, luz, contraste, movimiento, problema, camara, nitidez: nitidez / (46 * 62) };
  }
  const VEHICULOS = ['car', 'truck', 'bus', 'motorcycle', 'bicycle'];
  // Filtro de Kalman 1D con velocidad constante; dt en segundos.
  const kalman = (z, r, varVel) => ({ x: z, v: 0, p00: r, p01: 0, p11: varVel, r });
  function predecir(k, dt, q) {
    k.x += k.v * dt;
    const p00 = k.p00 + dt * (2 * k.p01 + dt * k.p11) + q * dt ** 3 / 3, p01 = k.p01 + dt * k.p11 + q * dt ** 2 / 2;
    k.p00 = p00; k.p01 = p01; k.p11 += q * dt;
  }
  function corregir(k, z) {
    const s = k.p00 + k.r, k0 = k.p00 / s, k1 = k.p01 / s, y = z - k.x;
    k.x += k0 * y; k.v += k1 * y;
    const p00 = (1 - k0) * k.p00, p01 = (1 - k0) * k.p01, p11 = k.p11 - k1 * k.p01;
    k.p00 = p00; k.p01 = p01; k.p11 = p11;
  }
  // Asignación húngara (Kuhn-Munkres con potenciales) para filas <= columnas.
  function hungaro(costos) {
    const n = costos.length, m = costos[0]?.length ?? 0;
    if (!n || !m) return [];
    const u = new Array(n + 1).fill(0), v = new Array(m + 1).fill(0), p = new Array(m + 1).fill(0), camino = new Array(m + 1).fill(0);
    for (let i = 1; i <= n; i++) {
      p[0] = i; let j0 = 0;
      const minimo = new Array(m + 1).fill(Infinity), usado = new Array(m + 1).fill(false);
      do {
        usado[j0] = true; const i0 = p[j0]; let delta = Infinity, j1 = 0;
        for (let j = 1; j <= m; j++) if (!usado[j]) {
          const actual = costos[i0 - 1][j - 1] - u[i0] - v[j];
          if (actual < minimo[j]) { minimo[j] = actual; camino[j] = j0; }
          if (minimo[j] < delta) { delta = minimo[j]; j1 = j; }
        }
        for (let j = 0; j <= m; j++) if (usado[j]) { u[p[j]] += delta; v[j] -= delta; } else minimo[j] -= delta;
        j0 = j1;
      } while (p[j0] !== 0);
      do { const j1 = camino[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
    }
    const asignacion = new Array(n).fill(-1);
    for (let j = 1; j <= m; j++) if (p[j]) asignacion[p[j] - 1] = j - 1;
    return asignacion;
  }
  const PROHIBIDO = 1e6;
  function emparejar(pistas, objetos) {
    if (!pistas.length || !objetos.length) return new Map();
    const transpuesta = pistas.length > objetos.length;
    const filas = transpuesta ? objetos : pistas, columnas = transpuesta ? pistas : objetos;
    const costos = filas.map((f) => columnas.map((c) => {
      const [pista, objeto] = transpuesta ? [c, f] : [f, c];
      const similitud = pista.clase === objeto.clase ? iou(cajaDe(pista), objeto.caja) : 0;
      return similitud > 0.2 ? 1 - similitud : PROHIBIDO;
    }));
    const pares = new Map();
    hungaro(costos).forEach((j, i) => { if (j >= 0 && costos[i][j] < PROHIBIDO) pares.set(transpuesta ? j : i, transpuesta ? i : j); });
    return pares;
  }
  function cajaDe(p) {
    const area = Math.exp(p.la.x), w = Math.sqrt(area * p.aspecto), h = Math.sqrt(area / p.aspecto);
    return { x: p.cx.x - w / 2, y: p.cy.x - h / 2, w, h };
  }
  function nuevaPista(id, objeto, tiempo) {
    const c = objeto.caja;
    return { id, clase: objeto.clase, aspecto: c.w / Math.max(.00001, c.h), tiempo, aciertos: 0, historia: [],
      cx: kalman(c.x + c.w / 2, .02 ** 2, .25), cy: kalman(c.y + c.h / 2, .02 ** 2, .25), la: kalman(Math.log(Math.max(1e-6, c.w * c.h)), .1 ** 2, 1) };
  }
  class Seguimiento {
    constructor() { this.reiniciar(); }
    reiniciar() { this.pistas = []; this.numero = 0; this.ultimoAviso = -Infinity; this.tiempo = null; }
    actualizar(objetos, tiempo, movimiento = false) {
      const transformacion = movimiento && typeof movimiento === 'object' ? movimiento : GrietaMovimiento.identidad();
      if (movimiento === true || !transformacion.fiable || transformacion.invalido) { this.pistas = []; return null; }
      // Una pista sin detección sobrevive hasta un segundo: el detector puede saltarse un cuadro.
      this.pistas = this.pistas.filter((p) => tiempo - p.tiempo <= 1000);
      for (const p of this.pistas) {
        const dt = Math.max(0, tiempo - p.ultimaPrediccion) / 1000;
        predecir(p.cx, dt, .05); predecir(p.cy, dt, .05); predecir(p.la, dt, .5);
        p.ultimaPrediccion = tiempo;
        const antes = cajaDe(p), despues = GrietaMovimiento.transformarCaja(antes, transformacion);
        const factor = despues.w * despues.h / Math.max(.00001, antes.w * antes.h);
        p.cx.x = despues.x + despues.w / 2; p.cy.x = despues.y + despues.h / 2; p.la.x += Math.log(Math.max(1e-6, factor));
        p.historia = p.historia.map((h) => ({ ...h, area: h.area * factor }));
      }
      const vehiculos = objetos.filter((o) => VEHICULOS.includes(o.clase) && o.confianza >= 0.65);
      const pares = emparejar(this.pistas, vehiculos);
      const usados = new Set(pares.values());
      let aviso = null;
      const actualizadas = [];
      pares.forEach((j, i) => actualizadas.push([this.pistas[i], vehiculos[j]]));
      vehiculos.forEach((o, j) => {
        if (usados.has(j)) return;
        const p = nuevaPista(++this.numero, o, tiempo); p.ultimaPrediccion = tiempo; this.pistas.push(p);
        actualizadas.push([p, o]);
      });
      for (const [pista, objeto] of actualizadas) {
        const caja = objeto.caja, area = caja.w * caja.h;
        if (pista.aciertos) { corregir(pista.cx, caja.x + caja.w / 2); corregir(pista.cy, caja.y + caja.h / 2); corregir(pista.la, Math.log(Math.max(1e-6, area))); }
        pista.aspecto = caja.w / Math.max(.00001, caja.h); pista.tiempo = tiempo; pista.aciertos++;
        pista.historia = [...pista.historia.filter((h) => tiempo - h.t <= 2200), { t: tiempo, area, completa: caja.x > .02 && caja.y > .02 && caja.x + caja.w < .98 && caja.y + caja.h < .98 }].slice(-8);
        const h = pista.historia, ultima = h.at(-1), primera = h[0];
        const centro = caja.x + caja.w / 2;
        // La velocidad filtrada del logaritmo del área sustituye la exigencia de crecer en cada cuadro.
        const crece = h.every((v) => v.completa) && h.length >= 3 && ultima.t - primera.t >= 600 && ultima.area >= primera.area * 1.5 && pista.la.v >= 0.3;
        if (!aviso && crece && ultima.area >= 0.06 && centro > 0.3 && centro < 0.7 && caja.y + caja.h > 0.45 && tiempo - this.ultimoAviso > 8000) aviso = objeto;
      }
      if (aviso) this.ultimoAviso = tiempo;
      return aviso;
    }
  }
  raiz.GrietaSeguimiento = { iou, calidad, Seguimiento, hungaro };
})(globalThis);
