(function (raiz, crear) {
  'use strict';
  const politica = crear();
  if (typeof module === 'object' && module.exports) module.exports = politica;
  raiz.GrietaHoyosPolitica = politica;
})(globalThis, function () {
  'use strict';

  const ENTRADA = 640;
  const CAMPOS = 6;
  const AREA_MINIMA = 0.001;
  const SEPARACION = 150;
  const VENTANA = 2500;
  const ENFRIAMIENTO = 8000;
  const rejilla = [];

  for (const paso of [8, 16, 32]) {
    for (let y = 0; y < ENTRADA / paso; y++) {
      for (let x = 0; x < ENTRADA / paso; x++) rejilla.push({ x, y, paso });
    }
  }

  function probabilidad(valor) {
    return Number.isFinite(valor) && valor >= 0 && valor <= 1;
  }

  function ladoDe(caja) {
    const centro = caja.x + caja.w / 2;
    return centro < 1 / 3 ? 'izquierda' : centro < 2 / 3 ? 'centro' : 'derecha';
  }

  function interseccionUnion(a, b) {
    const ancho = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
    const alto = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    const interseccion = ancho * alto;
    return interseccion / (a.w * a.h + b.w * b.h - interseccion);
  }

  function esVector(valor) {
    return Array.isArray(valor) || (ArrayBuffer.isView(valor) && !(valor instanceof DataView));
  }

  function lectorDe(vector) {
    if (esVector(vector) && vector.length === rejilla.length * CAMPOS) {
      return (fila, campo) => vector[fila * CAMPOS + campo];
    }
    if (!Array.isArray(vector) || vector.length !== 1 || !Array.isArray(vector[0])) return null;
    const filas = vector[0];
    if (filas.length !== rejilla.length) return null;
    for (const fila of filas) if (!esVector(fila) || fila.length !== CAMPOS) return null;
    return (fila, campo) => filas[fila][campo];
  }

  function decodificar(vector, opciones = {}) {
    if (!opciones || typeof opciones !== 'object') return [];
    const { ancho, alto, entrada = ENTRADA, confianzaMinima = 0.65 } = opciones;
    if (!Number.isSafeInteger(ancho) || ancho <= 0 || !Number.isSafeInteger(alto) || alto <= 0 ||
        entrada !== ENTRADA || !probabilidad(confianzaMinima)) return [];
    const leer = lectorDe(vector);
    if (!leer) return [];

    const escala = Math.min(ENTRADA / ancho, ENTRADA / alto);
    const contenidoAncho = ancho * escala;
    const contenidoAlto = alto * escala;
    const candidatas = [];

    for (let fila = 0; fila < rejilla.length; fila++) {
      const campos = Array.from({ length: CAMPOS }, (_, campo) => leer(fila, campo));
      if (!campos.every(Number.isFinite)) continue;
      const [desfaseX, desfaseY, logAncho, logAlto, objeto, clase] = campos;
      if (!probabilidad(objeto) || !probabilidad(clase)) continue;
      const confianza = objeto * clase;
      if (confianza < confianzaMinima) continue;

      const { x, y, paso } = rejilla[fila];
      const centroX = (desfaseX + x) * paso;
      const centroY = (desfaseY + y) * paso;
      const cajaAncho = Math.exp(logAncho) * paso;
      const cajaAlto = Math.exp(logAlto) * paso;
      if (![centroX, centroY, cajaAncho, cajaAlto].every(Number.isFinite) ||
          cajaAncho <= 0 || cajaAlto <= 0) continue;
      // El relleno 114 queda fuera del contenido, a la derecha y abajo.
      if (centroX < 0 || centroX >= contenidoAncho || centroY < 0 || centroY >= contenidoAlto) continue;

      const izquierda = Math.max(0, centroX - cajaAncho / 2);
      const arriba = Math.max(0, centroY - cajaAlto / 2);
      const derecha = Math.min(contenidoAncho, centroX + cajaAncho / 2);
      const abajo = Math.min(contenidoAlto, centroY + cajaAlto / 2);
      // El minimo de 8 px se mide en la imagen original, despues del recorte.
      if ((derecha - izquierda) / escala < 8 || (abajo - arriba) / escala < 8) continue;
      const caja = {
        x: izquierda / contenidoAncho,
        y: arriba / contenidoAlto,
        w: (derecha - izquierda) / contenidoAncho,
        h: (abajo - arriba) / contenidoAlto
      };
      const area = caja.w * caja.h;
      if (area < AREA_MINIMA) continue;
      candidatas.push({ tipo: 'hoyo', confianza, area, caja, lado: ladoDe(caja) });
    }

    candidatas.sort((a, b) => b.confianza - a.confianza);
    const regiones = [];
    for (const candidata of candidatas) {
      if (regiones.some(region => interseccionUnion(region.caja, candidata.caja) > 0.45)) continue;
      regiones.push(candidata);
      if (regiones.length === 3) break;
    }
    return regiones;
  }

  function copiarRegion(region) {
    if (!region || region.tipo !== 'hoyo' || !probabilidad(region.confianza) || region.confianza < 0.65 || !region.caja) return null;
    const { x, y, w, h } = region.caja;
    if (![x, y, w, h].every(Number.isFinite) || x < 0 || y < 0 || w <= 0 || h <= 0 ||
        x + w > 1 + 1e-12 || y + h > 1 + 1e-12) return null;
    const caja = { x, y, w: Math.min(w, 1 - x), h: Math.min(h, 1 - y) };
    const area = caja.w * caja.h;
    if (!Number.isFinite(region.area) || area < AREA_MINIMA || region.area > 1 ||
        Math.abs(region.area - area) > 1e-9 || region.lado !== ladoDe(caja)) return null;
    return { tipo: 'hoyo', confianza: region.confianza, area, caja, lado: region.lado };
  }

  function compatibles(a, b) {
    if (interseccionUnion(a.caja, b.caja) >= 0.1) return true;
    const distancia = Math.hypot(
      a.caja.x + a.caja.w / 2 - b.caja.x - b.caja.w / 2,
      a.caja.y + a.caja.h / 2 - b.caja.y - b.caja.h / 2
    );
    const razonArea = a.area / b.area;
    return distancia <= 0.12 && razonArea >= 0.4 && razonArea <= 2.5;
  }

  class Avisador {
    constructor() {
      this.reiniciar();
    }

    reiniciar() {
      this.observaciones = [];
      this.ultimoFotograma = null;
      this.ultimaCaptura = null;
      this.ultimoAhora = null;
      this.avisos = { izquierda: -Infinity, centro: -Infinity, derecha: -Infinity };
    }

    actualizar(regiones, opciones = {}) {
      if (!opciones || typeof opciones !== 'object') {
        this.observaciones = [];
        return null;
      }
      const { ahora, capturada, fotograma, malaImagen = false } = opciones;
      const tiemposValidos = [ahora, capturada, fotograma].every(valor => Number.isFinite(valor) && valor >= 0);
      const invalida = !tiemposValidos || typeof malaImagen !== 'boolean' || malaImagen ||
        capturada > ahora || ahora - capturada > 2000 ||
        (this.ultimoAhora !== null && ahora < this.ultimoAhora) ||
        (this.ultimoFotograma !== null && fotograma <= this.ultimoFotograma) ||
        (this.ultimaCaptura !== null && capturada <= this.ultimaCaptura);

      if (tiemposValidos) {
        this.ultimoAhora = ahora;
        this.ultimaCaptura = capturada;
        this.ultimoFotograma = fotograma;
      }
      if (invalida || !Array.isArray(regiones)) {
        this.observaciones = [];
        return null;
      }
      const actuales = Array.from(regiones, copiarRegion);
      if (actuales.some(region => !region)) {
        this.observaciones = [];
        return null;
      }

      this.observaciones = this.observaciones.filter(observacion => capturada - observacion.capturada <= VENTANA);
      const ultima = this.observaciones.at(-1);
      // Muestrea tambien los fallos de deteccion, sin acumular fotogramas consecutivos.
      if (ultima && capturada - ultima.capturada < SEPARACION) return null;
      this.observaciones.push({ capturada, regiones: actuales });
      this.observaciones = this.observaciones.slice(-3);
      const anteriores = this.observaciones.slice(0, -1);

      for (const region of actuales.sort((a, b) => b.confianza - a.confianza)) {
        if (ahora - this.avisos[region.lado] < ENFRIAMIENTO) continue;
        const confirmada = anteriores.some(observacion =>
          capturada - observacion.capturada >= SEPARACION &&
          observacion.regiones.some(anterior => compatibles(region, anterior))
        );
        if (!confirmada) continue;
        this.avisos[region.lado] = ahora;
        const ubicacion = region.lado === 'centro' ? 'en el centro' : `a la ${region.lado}`;
        return { texto: `Posible hoyo ${ubicacion} de la imagen.`, tipo: 'hoyo', lado: region.lado };
      }
      return null;
    }
  }

  return { decodificar, Avisador };
});
