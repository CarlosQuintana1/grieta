((raiz) => {
  function iou(a, b) {
    const cruce = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    return cruce / Math.max(0.00001, a.w * a.h + b.w * b.h - cruce);
  }
  function calidad(pixeles, ancho, alto, previa) {
    const gris = new Float32Array(48 * 32);
    let suma = 0, suma2 = 0;
    for (let y = 0; y < 32; y++) for (let x = 0; x < 48; x++) {
      const i = (Math.min(alto - 1, Math.floor(y * alto / 32)) * ancho + Math.min(ancho - 1, Math.floor(x * ancho / 48))) * 4;
      const v = pixeles[i] * 0.299 + pixeles[i + 1] * 0.587 + pixeles[i + 2] * 0.114;
      gris[y * 48 + x] = v; suma += v; suma2 += v * v;
    }
    const luz = suma / gris.length, contraste = Math.sqrt(Math.max(0, suma2 / gris.length - luz * luz));
    let diferencia = 0;
    if (previa) for (let i = 0; i < gris.length; i++) diferencia += Math.abs((gris[i] - luz) - (previa.gris[i] - previa.luz));
    const movimiento = previa ? diferencia / gris.length / 255 : 0;
    const problema = luz < 28 ? 'oscura' : luz > 246 && contraste < 8 ? 'expuesta' : contraste < 8 ? 'sin-detalle' : null;
    return { gris, luz, contraste, movimiento, problema };
  }
  class Seguimiento {
    constructor() { this.reiniciar(); }
    reiniciar() { this.pistas = []; this.numero = 0; this.ultimoAviso = -Infinity; }
    actualizar(objetos, tiempo, inestable = false) {
      if (inestable) { this.pistas = []; return null; }
      const disponibles = this.pistas.filter((p) => tiempo - p.tiempo < 1500);
      const ocupadas = new Set();
      const nuevas = [];
      let aviso = null;
      for (const objeto of objetos.filter((o) => ['car', 'truck', 'bus', 'motorcycle', 'bicycle'].includes(o.clase) && o.confianza >= 0.65)) {
        const candidatos = disponibles.filter((p) => p.clase === objeto.clase && !ocupadas.has(p.id)).map((p) => ({ p, similitud: iou(p.caja, objeto.caja) })).sort((a, b) => b.similitud - a.similitud);
        const pista = candidatos[0]?.similitud > 0.2 ? candidatos[0].p : { id: ++this.numero, clase: objeto.clase, historia: [] };
        ocupadas.add(pista.id);
        pista.caja = objeto.caja; pista.tiempo = tiempo;
        pista.historia = [...pista.historia.filter((h) => tiempo - h.t <= 2200), { t: tiempo, area: objeto.caja.w * objeto.caja.h }].slice(-8);
        nuevas.push(pista);
        const h = pista.historia, ultima = h.at(-1), primera = h[0], caja = objeto.caja;
        const centro = caja.x + caja.w / 2;
        const crece = h.length >= 3 && ultima.t - primera.t >= 600 && ultima.area >= primera.area * 1.5 && h.slice(1).every((v, i) => v.area >= h[i].area * 0.95);
        if (!aviso && crece && ultima.area >= 0.06 && centro > 0.3 && centro < 0.7 && caja.y + caja.h > 0.45 && tiempo - this.ultimoAviso > 8000) aviso = objeto;
      }
      this.pistas = nuevas;
      if (aviso) this.ultimoAviso = tiempo;
      return aviso;
    }
  }
  raiz.GrietaSeguimiento = { iou, calidad, Seguimiento };
})(globalThis);
