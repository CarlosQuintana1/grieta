const Interfaz = (() => {
  const atributos = ["aria-label", "aria-valuetext", "aria-description", "placeholder", "title", "alt"];
  const omitir = "script, style, svg, [translate='no'], #mapa, #medidas, #chofer, #perfilLengua, #filaLengua .respuesta-perfil";
  const textos = new WeakMap();
  const propiedades = new WeakMap();
  const lenguas = { oto: "otq", nah: "nhe" };
  const catalogos = new Map();
  let catalogo = null;
  let fuente = null;
  let reglas = [];
  let elegido = "es";
  let activo = "es";
  let avisar = () => {};
  let observador;
  const normalizar = (t) => String(t).normalize("NFC").replace(/\s+/g, " ").trim();
  const huecos = (t) => [...String(t).matchAll(/\{(\w+)\}/g)].map((x) => x[1]).sort().join("|");
  const literal = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const preservados = t => JSON.stringify([
    ...String(t).replace(/\{\w+\}/g, "").matchAll(/\d+(?:[.,]\d+)?|Grieta|Qrobus|Uber|DiDi|inDrive|WhatsApp|VoiceOver|TalkBack|Tarifa Unidos/gi)
  ].map(x => x[0].toLowerCase()).sort());
  function revisar(c, base = fuente) {
    const revisado = typeof c?.revision === "string" && Boolean(c.revision.trim());
    const provisional = c?.provisional === true && c.fuente?.tipo === "automatica" && typeof c.fuente?.nombre === "string" && Boolean(c.fuente.nombre.trim()) && /^https:\/\//.test(c.fuente?.url ?? "");
    if (c?.completa === true && c?.parcial === true) return false;
    if (!Object.values(lenguas).includes(c?.codigo) || (c.completa !== true && c.parcial !== true) || (!revisado && !provisional) || !Array.isArray(c.mensajes) || !c.mensajes.length) return false;
    if (!Array.isArray(base?.mensajes) || (c.completa === true ? c.mensajes.length !== base.mensajes.length : c.mensajes.length > base.mensajes.length) || !base.mensajes.every((m) => m && typeof m.clave === "string" && typeof m.es === "string")) return false;
    const originales = new Map(base.mensajes.map((m) => [m.clave, m.es]));
    const vistos = new Set();
    return c.mensajes.every((m) => {
      if (!m || typeof m.es !== "string" || !m.es.trim() || originales.get(m.clave) !== m.es || typeof m[c.codigo] !== "string" || !m[c.codigo].trim() || huecos(m.es) !== huecos(m[c.codigo]) || preservados(m.es) !== preservados(m[c.codigo]) || vistos.has(normalizar(m.es))) return false;
      vistos.add(normalizar(m.es));
      return true;
    });
  }

  function compilar(m) {
    const nombres = [];
    const partes = normalizar(m.es).split(/(\{\w+\})/g);
    const patron = partes.map((p) => {
      if (!/^\{\w+\}$/.test(p)) return literal(p);
      const nombre = p.slice(1, -1);
      nombres.push(nombre);
      const opciones = m.variables?.[nombre]?.opciones;
      const formato = { kg: "\\d+(?:\\.\\d)? kg", importe: "\\$-?[\\d.,]+", rango: "\\$[\\d.,]+–[\\d.,]+", numero: "-?\\d+", hora: "\\d{1,2}:\\d{2} (?:am|pm)", rango_voz: "entre \\d+ y \\d+ pesos", precio_voz: "(?:precio estimado entre \\d+ y \\d+|\\d+) pesos" }[m.variables?.[nombre]?.formato];
      return Array.isArray(opciones) ? `(${opciones.map(literal).join("|")})` : `(${formato ?? ".*?"})`;
    }).join("");
    return { ...m, nombres, patron: new RegExp(`^${patron}$`, "u"), peso: normalizar(m.es).replace(/\{\w+\}/g, "").length };
  }

  function traducir(texto, elemento, nivel = 0) {
    const original = normalizar(texto);
    if (activo === "es" || !original || nivel > 5) return texto;
    const coma = texto.indexOf(",");
    if (elemento.closest("#horas button") && coma > 0) {
      return traducir(texto.slice(0, coma), elemento, nivel + 1) + traducir(texto.slice(coma), elemento, nivel + 1);
    }
    for (const r of reglas) {
      if (r.selector && !elemento.closest(r.selector)) continue;
      const encuentro = r.patron.exec(original);
      if (!encuentro) continue;
      const valores = new Map();
      let coinciden = true;
      r.nombres.forEach((nombre, i) => {
        const valor = encuentro[i + 1];
        if (valores.has(nombre) && valores.get(nombre) !== valor) coinciden = false;
        valores.set(nombre, valor);
      });
      if (!coinciden) continue;
      const resultado = r.traduccion.replace(/\{(\w+)\}/g, (_, nombre) => {
        const valor = valores.get(nombre) ?? "";
        const variable = r.variables?.[nombre];
        const permitido = !variable?.solo || variable.solo.includes(valor);
        return variable?.traducir && permitido ? traducir(valor, elemento, nivel + 1) : valor;
      });
      return texto.slice(0, texto.indexOf(texto.trim())) + resultado + (texto.match(/\s*$/)?.[0] ?? "");
    }
    if (elemento.closest("#textoPerfil, #llegadaApp, #detalleEtiqueta, .tarjeta .etiqueta, .tarjeta .duracion") && original.includes("·")) {
      return texto.split(/(\s*·\s*)/).map((p, i) => i % 2 ? p : traducir(p, elemento, nivel + 1)).join("");
    }
    if (elemento.closest("#guiaEtapa") && original.includes(" · ")) {
      const [etapa, ...linea] = original.split(" · ");
      return [traducir(etapa, elemento, nivel + 1), ...linea].join(" · ");
    }
    if (elemento.closest("#camaraResultado, #camaraAlerta") && texto.includes(", ")) {
      return texto.split(/(, )/).map((p, i) => i % 2 ? p : traducir(p, elemento, nivel + 1)).join("");
    }
    const oraciones = texto.split(/(?<=[.!?])(\s+)(?=[A-ZÁÉÍÓÚÜÑ¿¡])/u);
    if (oraciones.length > 1) return oraciones.map((p, i) => i % 2 ? p : traducir(p, elemento, nivel + 1)).join("");
    return texto;
  }

  function tituloConNumero(elemento) {
    if (elemento.id !== "guiaTitulo") return false;
    const [antes, cifra, despues] = elemento.childNodes;
    if (elemento.childNodes.length !== 3 || antes.nodeType !== Node.TEXT_NODE || despues.nodeType !== Node.TEXT_NODE || !cifra.classList?.contains("num")) return false;
    const numero = cifra.textContent;
    if (!/^\d+$/.test(numero)) return false;
    const resultado = traducir(original(elemento), elemento);
    const posicion = resultado.indexOf(numero);
    if (posicion < 0 || resultado.indexOf(numero, posicion + numero.length) >= 0) return false;
    for (const [nodo, actual] of [[antes, resultado.slice(0, posicion)], [despues, resultado.slice(posicion + numero.length)]]) {
      const previo = textos.get(nodo);
      const es = previo && nodo.data === previo.actual ? previo.es : nodo.data;
      textos.set(nodo, { es, actual });
      if (nodo.data !== actual) nodo.data = actual;
    }
    return true;
  }
  function textoNodo(nodo) {
    const padre = nodo.parentElement;
    if (!padre || padre.closest(omitir)) return;
    if (tituloConNumero(padre)) return;
    const previo = textos.get(nodo);
    const fuente = previo && nodo.data === previo.actual ? previo.es : nodo.data;
    const actual = traducir(fuente, padre);
    textos.set(nodo, { es: fuente, actual });
    if (nodo.data !== actual) nodo.data = actual;
  }

  function elementoNodo(elemento) {
    if (elemento.closest(omitir)) return;
    let registro = propiedades.get(elemento);
    if (!registro) propiedades.set(elemento, registro = new Map());
    for (const atributo of atributos) {
      const valor = elemento.getAttribute(atributo);
      if (valor === null) { registro.delete(atributo); continue; }
      const previo = registro.get(atributo);
      const fuente = previo && valor === previo.actual ? previo.es : valor;
      const actual = traducir(fuente, elemento);
      registro.set(atributo, { es: fuente, actual });
      if (valor !== actual) elemento.setAttribute(atributo, actual);
    }
    tituloConNumero(elemento);
  }

  function recorrer(raiz) {
    if (raiz.nodeType === Node.TEXT_NODE) return textoNodo(raiz);
    if (raiz.nodeType !== Node.ELEMENT_NODE || raiz.closest(omitir)) return;
    elementoNodo(raiz);
    const arbol = document.createTreeWalker(raiz, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.nodeType === Node.ELEMENT_NODE ? n : n.parentElement)?.closest(omitir) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
    });
    while (arbol.nextNode()) {
      if (arbol.currentNode.nodeType === Node.TEXT_NODE) textoNodo(arbol.currentNode);
      else elementoNodo(arbol.currentNode);
    }
  }

  function observar() {
    observador.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: atributos });
  }
  function aplicar() {
    observador?.disconnect();
    catalogo = catalogos.get(lenguas[elegido]) ?? null;
    activo = catalogo?.codigo ?? "es";
    reglas = catalogo?.reglas ?? [];
    document.documentElement.lang = activo;
    recorrer(document.body);
    if (observador) observar();
    avisar();
  }
  function cambiar(idioma) {
    elegido = Object.hasOwn(lenguas, idioma) ? idioma : "es";
    aplicar();
  }
  // La voz conserva el texto original aunque la pantalla ya este traducida.
  function original(elemento, atributo = null) {
    if (atributo) {
      const actual = elemento.getAttribute(atributo), previo = propiedades.get(elemento)?.get(atributo);
      return previo && actual === previo.actual ? previo.es : actual;
    }
    return [...elemento.childNodes].map((n) => {
      if (n.nodeType !== Node.TEXT_NODE) return original(n);
      const previo = textos.get(n);
      return previo && n.data === previo.actual ? previo.es : n.data;
    }).join("");
  }
  async function iniciar(idioma, alCambiar) {
    elegido = Object.hasOwn(lenguas, idioma) ? idioma : "es";
    avisar = alCambiar;
    observador = new MutationObserver((cambios) => {
      if (activo === "es") return;
      observador.disconnect();
      try {
        for (const c of cambios) {
          if (c.type === "childList") c.addedNodes.forEach(recorrer);
          else recorrer(c.target);
        }
      } finally { observar(); }
    });
    observar();
    try {
      const [base, ...lista] = await Promise.all(["es", ...Object.values(lenguas)].map(async (id) => {
        try {
          const r = await fetch(`idiomas/${id}.json`);
          return r.ok ? await r.json() : null;
        } catch { return null; }
      }));
      fuente = base;
      for (const c of lista) {
        if (!revisar(c)) continue;
        const traducciones = new Map(c.mensajes.map((m) => [m.clave, m[c.codigo]]));
        c.reglas = base.mensajes.filter((m) => traducciones.has(m.clave)).map((m) => compilar({ ...m, traduccion: traducciones.get(m.clave) })).sort((a, b) => b.peso - a.peso);
        catalogos.set(c.codigo, c);
      }
    } catch {}
    aplicar();
  }
  return { iniciar, cambiar, original, revisar, disponiblePara: (id) => catalogos.has(lenguas[id]), parcialPara: (id) => catalogos.get(lenguas[id])?.parcial === true, get disponible() { return Boolean(catalogo); }, get provisional() { return Boolean(catalogo?.provisional); } };
})();
