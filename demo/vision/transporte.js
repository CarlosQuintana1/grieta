(function (raiz, crear) {
  'use strict';
  const api = crear();
  if (typeof module === 'object' && module.exports) module.exports = api;
  raiz.GrietaTransporte = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SEPARADORES = '[ \\t\\u00a0\\-\\u2010-\\u2015]*';
  const BORDE_IZQUIERDO = /[\p{L}\p{N}\p{M}_]$/u;
  const BORDE_DERECHO = /^[\p{L}\p{N}\p{M}_]/u;
  const COMUNES = new Set((
    'centro ruta rutas linea lineas destino hacia desde hasta para parada paradas ' +
    'terminal salida entrada direccion sentido transporte autobus camion servicio ' +
    'qrobus avenida calle carretera boulevard bulevar plaza parque colonia ciudad ' +
    'zona estacion santa santo norte oriente poniente este oeste fraccionamiento ' +
    'unidad habitacional hospital mercado escuela universidad los las del que con por'
  ).split(' '));

  function cadena(valor) {
    return typeof valor === 'string' ? valor : '';
  }

  function codigo(valor) {
    const limpio = cadena(valor).toUpperCase().replace(/[ \t\u00a0\-\u2010-\u2015]/g, '');
    return /^[A-Z0-9]+$/.test(limpio) ? limpio : '';
  }

  function normalizar(valor) {
    return cadena(valor).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  }

  function catalogoValido(catalogo) {
    return Array.isArray(catalogo)
      ? [...new Set(catalogo.filter(entrada => codigo(entrada)))]
      : [];
  }

  function fragmento(token, numerico) {
    if (!token) return false;
    return /^\d+$/.test(token) || (/^[A-Z]$/.test(token) && !['Y', 'O', 'E', 'U'].includes(token)) ||
      (numerico && /\d/.test(token));
  }

  function limitesValidos(texto, inicio, fin, clave) {
    const antes = texto.slice(0, inicio);
    const despues = texto.slice(fin);
    if (BORDE_IZQUIERDO.test(antes) || BORDE_DERECHO.test(despues)) return false;
    const anterior = antes.match(/([\p{L}\p{N}_]+)[\s\-\u2010-\u2015]+$/u);
    const siguiente = despues.match(/^[\s\-\u2010-\u2015]+([\p{L}\p{N}_]+)/u);
    return !fragmento(anterior && anterior[1], /^\d+$/.test(clave)) &&
      !fragmento(siguiente && siguiente[1], /^\d+$/.test(clave));
  }

  function rutasEnTexto(texto, catalogo) {
    const lectura = cadena(texto).toUpperCase();
    return catalogoValido(catalogo).filter(entrada => {
      const clave = codigo(entrada);
      const patron = new RegExp([...clave].join(SEPARADORES), 'gu');
      for (const coincidencia of lectura.matchAll(patron)) {
        if (limitesValidos(lectura, coincidencia.index, coincidencia.index + coincidencia[0].length, clave)) {
          return true;
        }
      }
      return false;
    });
  }

  function palabrasDistintivas(texto) {
    return new Set((normalizar(texto).match(/\p{L}+/gu) || [])
      .filter(palabra => palabra.length >= 4 && !COMUNES.has(palabra)));
  }

  function coincideDestino(texto, destino) {
    const buscadas = palabrasDistintivas(destino);
    if (buscadas.size < 2) return false;
    const leidas = palabrasDistintivas(texto);
    return [...buscadas].every(palabra => leidas.has(palabra));
  }

  // destino es booleano; confirmada solo indica evidencia repetida del código.
  function resultado(estado, frase, linea = null, confirmada = false, destino = false) {
    return { estado, linea, destino, confirmada, frase };
  }

  class Confirmador {
    constructor() {
      this.reiniciar();
    }

    reiniciar() {
      this._contexto = null;
      this._ultimoInstante = null;
      this._borrarVotos();
    }

    _borrarVotos() {
      this._votos = [];
      this._codigo = null;
    }

    // instante es el tiempo del frame en ms; referencia identifica la sesión/escena por identidad.
    registrar(lectura = {}) {
      const { texto, confianza, instante, objetivo, catalogo, referencia } = lectura || {};
      const sentidos = [...new Set((Array.isArray(lectura.destinos) ? lectura.destinos : []).filter(s => typeof s === 'string' && s.trim()))];
      const entradas = catalogoValido(catalogo);
      const lineaBuscada = codigo(objetivo && objetivo.linea);
      const hacia = cadena(objetivo && objetivo.hacia);
      const contexto = {
        linea: lineaBuscada,
        hacia: normalizar(hacia).trim().replace(/\s+/g, ' '),
        catalogo: JSON.stringify([...entradas].sort()),
        destinos: JSON.stringify(sentidos.slice().sort()),
        referencia
      };
      if (!this._contexto || contexto.linea !== this._contexto.linea ||
          contexto.hacia !== this._contexto.hacia || contexto.catalogo !== this._contexto.catalogo || contexto.destinos !== this._contexto.destinos ||
          !Object.is(referencia, this._contexto.referencia)) {
        this._borrarVotos();
      }
      this._contexto = contexto;

      const tiempoValido = typeof instante === 'number' && Number.isFinite(instante);
      if (!tiempoValido || (this._ultimoInstante !== null && instante < this._ultimoInstante)) {
        this._borrarVotos();
      }
      this._ultimoInstante = tiempoValido ? instante : null;
      this._votos = this._votos.filter(voto => instante - voto.instante <= 10000);
      if (!this._votos.length) this._codigo = null;

      const rutas = rutasEnTexto(texto, entradas);
      if (rutas.length > 1) {
        this._borrarVotos();
        return resultado('varias', 'Aparecen varios códigos. Necesito una lectura de un solo letrero.');
      }
      if (rutas.length === 1 && this._codigo && rutas[0] !== this._codigo) this._borrarVotos();
      if (!cadena(texto).trim()) {
        return resultado('sin-lectura', 'Todavía no hay una lectura.');
      }
      if (rutas.length === 0) this._borrarVotos();
      if (typeof confianza !== 'number' || !Number.isFinite(confianza) || confianza < 65) {
        return resultado('leyendo', 'La lectura es poco clara. Necesito otra lectura.');
      }
      if (rutas.length === 0) {
        return resultado('leyendo', 'Todavía no distingo un código completo del catálogo.');
      }

      const linea = rutas[0];
      if (!lineaBuscada) {
        this._borrarVotos();
        return resultado('sin-objetivo', `Parece decir ${linea}.`, linea);
      }
      if (!tiempoValido) {
        return resultado('leyendo', `Parece decir ${linea}. Necesito lecturas con tiempo válido para comparar.`, linea);
      }

      const destinoCoincide = coincideDestino(texto, hacia);
      const otras = sentidos.filter(s => normalizar(s) !== normalizar(hacia) && coincideDestino(texto, s));
      const destinoLeido = destinoCoincide && otras.length === 0;
      const otroSentido = hacia && !destinoCoincide && otras.length === 1 ? otras[0] : '';
      const ultimo = this._votos[this._votos.length - 1];
      if (!ultimo || instante - ultimo.instante >= 500) {
        this._codigo = linea;
        this._votos.push({ instante, destino: destinoLeido, otroSentido });
      } else if (!destinoLeido) {
        this._votos.forEach(voto => { voto.destino = false; if (voto.otroSentido !== otroSentido) voto.otroSentido = ''; });
      }
      if (this._votos.length < 2) {
        return resultado('leyendo', `Parece decir ${linea}. Necesito otra lectura independiente.`, linea);
      }

      // El destino necesita dos votos consecutivos; un frame repetido nunca lo mejora.
      const destino = this._votos.slice(-2).every(voto => voto.destino);
      const coincide = codigo(linea) === lineaBuscada;
      const recientes = this._votos.slice(-2);
      if (coincide && recientes[0].otroSentido && recientes.every(v => v.otroSentido === recientes[0].otroSentido)) {
        return resultado('otro-sentido', `Parece decir ${linea}. El letrero parece indicar ${recientes[0].otroSentido}, otro sentido distinto al que buscas.`, linea, true);
      }
      const comparacion = coincide ? 'Coincide con la ruta que buscas' : 'No coincide con la ruta que buscas';
      const frase = destino
        ? `Parece decir ${linea}. ${comparacion}. También coincide el letrero de destino.`
        : `Parece decir ${linea}. ${comparacion}; no pude confirmar el sentido.`;
      return resultado(coincide ? 'coincide' : 'otra', frase, linea, true, destino);
    }
  }

  return { rutasEnTexto, coincideDestino, Confirmador };
});
