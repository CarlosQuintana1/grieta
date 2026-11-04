((raiz) => {
  const nombres = { person: 'una persona', bicycle: 'una bicicleta', car: 'un auto', motorcycle: 'una moto', bus: 'un camión', truck: 'un camión de carga', 'traffic light': 'un semáforo', 'fire hydrant': 'un hidrante', 'stop sign': 'una señal de alto', bench: 'una banca', chair: 'una silla', dog: 'un perro', cat: 'un gato', backpack: 'una mochila', suitcase: 'una maleta', umbrella: 'un paraguas', bottle: 'una botella', 'potted plant': 'una planta', 'dining table': 'una mesa' };
  const normalizar = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  function objetos(detecciones, ancho) {
    return detecciones.filter((d) => nombres[d.categories?.[0]?.categoryName] && d.categories[0].score >= 0.6).map((d) => {
      const centro = (d.boundingBox.originX + d.boundingBox.width / 2) / ancho;
      const lado = centro < 0.33 ? 'a la izquierda' : centro > 0.67 ? 'a la derecha' : 'al centro';
      return { clave: `${d.categories[0].categoryName}:${lado}`, texto: `${nombres[d.categories[0].categoryName]} ${lado}` };
    }).filter((d, i, lista) => lista.findIndex((otro) => otro.clave === d.clave) === i).slice(0, 3);
  }
  function textoLegible(datos) {
    if (!Number.isFinite(datos?.confidence) || datos.confidence < 65) return '';
    return String(datos.text ?? '').replace(/[\p{C}]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 220);
  }
  function paradaPosible(texto, paradas) {
    const leido = ` ${normalizar(texto)} `;
    const comunes = new Set(['calle', 'avenida', 'av', 'blvd', 'col', 'de', 'del', 'la', 'el', 'los', 'las', 'y']);
    const coincidencias = paradas.filter((p) => {
      const palabras = [...new Set(normalizar(p).split(' ').filter((s) => s.length > 3 && !comunes.has(s)))];
      return palabras.length >= 2 && palabras.join('').length >= 12 && palabras.every((s) => leido.includes(` ${s} `));
    });
    return coincidencias.length === 1 ? coincidencias[0] : null;
  }
  raiz.GrietaVision = { objetos, textoLegible, paradaPosible, nombres };
})(globalThis);
