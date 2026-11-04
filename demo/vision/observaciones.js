((raiz) => {
  const etiquetas = {
    person: ['una persona', 'personas'], bicycle: ['una bicicleta', 'bicicletas'], car: ['un auto', 'autos'], motorcycle: ['una moto', 'motos'], airplane: ['un avión', 'aviones'], bus: ['un camión', 'camiones'], train: ['un tren', 'trenes'], truck: ['un camión de carga', 'camiones de carga'], boat: ['una embarcación', 'embarcaciones'], 'traffic light': ['un semáforo', 'semáforos'], 'fire hydrant': ['un hidrante', 'hidrantes'], 'stop sign': ['una señal de alto', 'señales de alto'], 'parking meter': ['un parquímetro', 'parquímetros'], bench: ['una banca', 'bancas'], bird: ['un ave', 'aves'], cat: ['un gato', 'gatos'], dog: ['un perro', 'perros'], horse: ['un caballo', 'caballos'], sheep: ['una oveja', 'ovejas'], cow: ['una vaca', 'vacas'], elephant: ['un elefante', 'elefantes'], bear: ['un oso', 'osos'], zebra: ['una cebra', 'cebras'], giraffe: ['una jirafa', 'jirafas'], backpack: ['una mochila', 'mochilas'], umbrella: ['un paraguas', 'paraguas'], handbag: ['una bolsa', 'bolsas'], tie: ['una corbata', 'corbatas'], suitcase: ['una maleta', 'maletas'], frisbee: ['un disco de juego', 'discos de juego'], skis: ['unos esquís', 'pares de esquís'], snowboard: ['una tabla de nieve', 'tablas de nieve'], 'sports ball': ['una pelota', 'pelotas'], kite: ['un papalote', 'papalotes'], 'baseball bat': ['un bate', 'bates'], 'baseball glove': ['un guante de béisbol', 'guantes de béisbol'], skateboard: ['una patineta', 'patinetas'], surfboard: ['una tabla de surf', 'tablas de surf'], 'tennis racket': ['una raqueta', 'raquetas'], bottle: ['una botella', 'botellas'], 'wine glass': ['una copa', 'copas'], cup: ['una taza', 'tazas'], fork: ['un tenedor', 'tenedores'], knife: ['un cuchillo', 'cuchillos'], spoon: ['una cuchara', 'cucharas'], bowl: ['un tazón', 'tazones'], banana: ['un plátano', 'plátanos'], apple: ['una manzana', 'manzanas'], sandwich: ['un sándwich', 'sándwiches'], orange: ['una naranja', 'naranjas'], broccoli: ['un brócoli', 'brócolis'], carrot: ['una zanahoria', 'zanahorias'], 'hot dog': ['un hot dog', 'hot dogs'], pizza: ['una pizza', 'pizzas'], donut: ['una dona', 'donas'], cake: ['un pastel', 'pasteles'], chair: ['una silla', 'sillas'], couch: ['un sillón', 'sillones'], 'potted plant': ['una planta', 'plantas'], bed: ['una cama', 'camas'], 'dining table': ['una mesa', 'mesas'], toilet: ['un sanitario', 'sanitarios'], tv: ['una televisión', 'televisiones'], laptop: ['una computadora portátil', 'computadoras portátiles'], mouse: ['un ratón de computadora', 'ratones de computadora'], remote: ['un control remoto', 'controles remotos'], keyboard: ['un teclado', 'teclados'], 'cell phone': ['un teléfono', 'teléfonos'], microwave: ['un microondas', 'microondas'], oven: ['un horno', 'hornos'], toaster: ['un tostador', 'tostadores'], sink: ['un lavabo', 'lavabos'], refrigerator: ['un refrigerador', 'refrigeradores'], book: ['un libro', 'libros'], clock: ['un reloj', 'relojes'], vase: ['un florero', 'floreros'], scissors: ['unas tijeras', 'pares de tijeras'], 'teddy bear': ['un oso de peluche', 'osos de peluche'], 'hair drier': ['una secadora de pelo', 'secadoras de pelo'], toothbrush: ['un cepillo de dientes', 'cepillos de dientes'],
  };
  const nombres = Object.fromEntries(Object.entries(etiquetas).map(([k, v]) => [k, v[0]]));
  const prioridad = (clase) => ['car', 'truck', 'bus', 'motorcycle', 'bicycle', 'person', 'traffic light', 'stop sign', 'fire hydrant', 'bench'].includes(clase) ? 2 : 1;
  function deteccionesValidas(detecciones, ancho, alto) {
    if (!(ancho > 0 && alto > 0)) return [];
    const salida = [];
    for (const d of detecciones.slice().sort((a, b) => (b.categories?.[0]?.score ?? 0) - (a.categories?.[0]?.score ?? 0))) {
      const clase = d.categories?.[0]?.categoryName, confianza = d.categories?.[0]?.score, b = d.boundingBox;
      if (!nombres[clase] || !Number.isFinite(confianza) || confianza < 0.55 || !b || ![b.originX, b.originY, b.width, b.height].every(Number.isFinite) || b.width <= 0 || b.height <= 0) continue;
      const x = Math.max(0, b.originX / ancho), y = Math.max(0, b.originY / alto);
      const caja = { x, y, w: Math.min(1, (b.originX + b.width) / ancho) - x, h: Math.min(1, (b.originY + b.height) / alto) - y };
      if (caja.w <= 0 || caja.h <= 0) continue;
      if (salida.some((o) => o.clase === clase && GrietaSeguimiento.iou(o.caja, caja) > 0.7)) continue;
      salida.push({ clase, confianza, caja });
    }
    return salida.sort((a, b) => prioridad(b.clase) - prioridad(a.clase) || b.confianza - a.confianza);
  }
  const normalizar = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  function objetos(detecciones, ancho, alto = ancho) {
    const grupos = new Map();
    for (const o of deteccionesValidas(detecciones, ancho, alto)) {
      const centro = o.caja.x + o.caja.w / 2;
      const lado = centro < 0.33 ? 'a la izquierda' : centro > 0.67 ? 'a la derecha' : 'al centro';
      const clave = `${o.clase}:${lado}`;
      if (!grupos.has(clave)) grupos.set(clave, { clase: o.clase, lado, n: 0, confianza: o.confianza });
      grupos.get(clave).n++;
      grupos.get(clave).confianza = Math.min(grupos.get(clave).confianza, o.confianza);
    }
    return [...grupos.entries()].slice(0, 3).map(([clave, { clase, lado, n, confianza }]) => ({ clave, clase, confianza, texto: `${n > 1 ? `${n} ${etiquetas[clase][1]}` : nombres[clase]} ${lado}` }));
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
  raiz.GrietaVision = { objetos, textoLegible, paradaPosible, nombres, deteccionesValidas };
})(globalThis);
