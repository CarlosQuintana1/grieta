'use strict';

(function (raiz, crear) {
  const api = crear();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  raiz.GrietaDesniveles = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  const CONFIANZA_MINIMA = 0.55;
  const CONFIANZA_TENTATIVA = Math.fround(0.9);
  const TIPOS = { 1: 'escaleras', 2: 'escalon' };
  const LADOS = ['izquierda', 'centro', 'derecha'];
  const separacionMinima = 150;
  const ventana = 2500;
  const espera = 8000;

  function prioridad(a, b) {
    return Number(b.lado === 'centro') - Number(a.lado === 'centro') ||
      b.area - a.area || b.confianza - a.confianza ||
      a.caja.x - b.caja.x || a.caja.y - b.caja.y ||
      a.tipo.localeCompare(b.tipo);
  }

  function regiones(entrada) {
    if (!entrada || typeof entrada !== 'object') return [];
    const { clases, confianzas, ancho, alto } = entrada;
    if (!Number.isSafeInteger(ancho) || ancho <= 0 ||
        !Number.isSafeInteger(alto) || alto <= 0) return [];
    const total = ancho * alto;
    if (!Number.isSafeInteger(total) ||
        !(clases instanceof Uint8Array) ||
        !(confianzas instanceof Float32Array) ||
        clases.length !== total || confianzas.length !== total) return [];

    const visitados = new Uint8Array(total);
    const cola = new Uint32Array(total);
    const minimo = Math.max(6, 0.002 * total);
    const resultado = [];
    // Float32 representa 0.55 ligeramente por encima del umbral.
    function admisible(i, clase) {
      const confianza = confianzas[i];
      return clases[i] === clase && Number.isFinite(confianza) &&
        confianza >= CONFIANZA_MINIMA && confianza <= 1;
    }

    for (let inicio = 0; inicio < total; inicio++) {
      const clase = clases[inicio];
      if (visitados[inicio] || !TIPOS[clase] || !admisible(inicio, clase)) continue;
      let cabeza = 0;
      let fin = 1;
      let suma = 0;
      let minX = ancho;
      let minY = alto;
      let maxX = 0;
      let maxY = 0;
      cola[0] = inicio;
      visitados[inicio] = 1;

      function agregar(i) {
        if (!visitados[i] && admisible(i, clase)) {
          visitados[i] = 1;
          cola[fin++] = i;
        }
      }

      while (cabeza < fin) {
        const i = cola[cabeza++];
        const x = i % ancho;
        const y = Math.floor(i / ancho);
        suma += confianzas[i];
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        if (x > 0) agregar(i - 1);
        if (x + 1 < ancho) agregar(i + 1);
        if (y > 0) agregar(i - ancho);
        if (y + 1 < alto) agregar(i + ancho);
      }

      if (fin < minimo) continue;
      // Caja en píxeles, con ancho/alto inclusivos; lado por tercios de la imagen.
      const centroX = (minX + maxX + 1) / 2 / ancho;
      resultado.push({
        tipo: TIPOS[clase],
        confianza: suma / fin,
        area: fin / total,
        caja: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
        lado: centroX < 1 / 3 ? 'izquierda' : centroX > 2 / 3 ? 'derecha' : 'centro'
      });
    }
    return resultado.sort(prioridad).slice(0, 3);
  }

  function regionValida(region) {
    if (!region || typeof region !== 'object') return false;
    const { tipo, lado, confianza, area, caja } = region;
    return (tipo === 'escaleras' || tipo === 'escalon') && LADOS.includes(lado) &&
      Number.isFinite(confianza) && confianza >= CONFIANZA_MINIMA && confianza <= 1 &&
      Number.isFinite(area) && area > 0 && area <= 1 &&
      !!caja && typeof caja === 'object' &&
      Number.isFinite(caja.x) && caja.x >= 0 &&
      Number.isFinite(caja.y) && caja.y >= 0 &&
      Number.isFinite(caja.w) && caja.w > 0 &&
      Number.isFinite(caja.h) && caja.h > 0 &&
      Number.isFinite(caja.x + caja.w) && Number.isFinite(caja.y + caja.h);
  }

  function clave(region) {
    return `${region.tipo}:${region.lado}`;
  }

  class Avisador {
    constructor() {
      this.reiniciar();
    }

    reiniciar() {
      this.historial = [];
      this.avisos = new Map();
      this.ultimoAhora = null;
      this.ultimaCaptura = null;
      this.ultimoFotograma = null;
    }

    actualizar(detecciones, opciones) {
      if (!Array.isArray(detecciones) || !opciones || typeof opciones !== 'object') return null;
      const { ahora, capturada, fotograma, malaImagen = false } = opciones;
      if (![ahora, capturada, fotograma].every(valor => Number.isFinite(valor) && valor >= 0) ||
          typeof malaImagen !== 'boolean' || capturada > ahora || ahora - capturada > 2000 ||
          (this.ultimoAhora !== null && ahora < this.ultimoAhora) ||
          (this.ultimaCaptura !== null && capturada < this.ultimaCaptura) ||
          (this.ultimoFotograma !== null && fotograma <= this.ultimoFotograma)) return null;

      // fotograma es un contador o tiempo de video estrictamente creciente.
      this.ultimoAhora = ahora;
      this.ultimaCaptura = capturada;
      this.ultimoFotograma = fotograma;
      this.historial = this.historial.filter(observacion => capturada - observacion.capturada <= ventana);
      if (malaImagen) return null;

      const actuales = detecciones.filter(regionValida).slice().sort(prioridad);
      // Cada cuadro aporta a lo sumo un voto por tipo/lado, incluso con varias cajas.
      this.historial.push({ capturada, claves: new Set(actuales.map(clave)) });
      if (this.historial.length > 3) this.historial.shift();

      for (const region of actuales) {
        const id = clave(region);
        const anterior = this.avisos.get(id);
        if (anterior !== undefined && ahora - anterior < espera) continue;
        const confirmada = this.historial.some(observacion =>
          observacion.claves.has(id) && capturada - observacion.capturada >= separacionMinima &&
          capturada - observacion.capturada <= ventana);
        // Conserva el umbral 0.9 al recibir medias de valores Float32.
        const tentativa = region.area > 0.12 && region.confianza >= CONFIANZA_TENTATIVA;
        if (!confirmada && !tentativa) continue;

        this.avisos.set(id, ahora);
        const ubicacion = region.lado === 'centro' ? 'al centro' : `a la ${region.lado}`;
        const nombre = region.tipo === 'escaleras' ? 'Posibles escaleras' : 'Posible escalón';
        return { texto: `${nombre} ${ubicacion} de la imagen.`, tipo: region.tipo, lado: region.lado };
      }
      return null;
    }
  }

  return Object.freeze({ regiones, Avisador });
});
