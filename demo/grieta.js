// Mismos calculos que modelo/tarifa.py, camion.py y decision.py, con los datos de exportar_demo.py.
const Grieta = (() => {
  const CORTES = [0, 6, 9, 12, 15, 18, 21, 24];
  const CAMINAR_MAX_M = 700;
  const APP_MAX_KM = 5;
  const VEL_CAMINAR = 4.5;
  const VEL_APP = 28;
  const RODEO = 1.3;
  const ESPERA_APP = 5;
  const VENTANA_MIN = 60;
  const TRANSBORDO_M = 250;
  const ESPERA_TRANSBORDO = 2;
  const AHORRO_MINIMO = 0.3;
  const INF = 1e9;

  let modelo, qrobus, porParada;

  async function cargar(base = "datos") {
    [modelo, qrobus] = await Promise.all(
      ["modelo.json", "qrobus.json"].map((f) => fetch(`${base}/${f}`).then((r) => r.json())),
    );
    // Para cada parada, en que recorridos aparece y en que posicion.
    porParada = qrobus.paradas.map(() => []);
    qrobus.patrones.forEach((p, i) => p.paradas.forEach((s, pos) => porParada[s].push([i, pos])));
    return { modelo, qrobus };
  }

  function franjaDe(hora) {
    for (let i = 1; i < CORTES.length; i++) if (hora < CORTES[i]) return modelo.franjas[i - 1];
    return modelo.franjas.at(-1);
  }

  function metros(lat1, lon1, lat2, lon2) {
    const r = Math.PI / 180;
    const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 +
      Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
    return 6371000 * 2 * Math.asin(Math.sqrt(a));
  }

  function precio(app, km, min, celdaO, celdaD, franja, finde) {
    const a = modelo.apps[app];
    const base = a.formula[0] + a.formula[1] * km + a.formula[2] * min;
    const logF = a.intercepto + a.franjas[franja] + a.finde * finde + (a.origen[celdaO] ?? 0) + (a.destino[celdaD] ?? 0);
    return { precio: base * Math.exp(logF), bajo: base * Math.exp(logF + a.rango[0]), alto: base * Math.exp(logF + a.rango[1]) };
  }

  function contexto(dia, minuto) {
    const hora = minuto / 60;
    return { dia, minuto, franja: franjaDe(hora), finde: dia >= 5 ? 1 : 0, servicio: qrobus.servicio_por_dia[dia] };
  }

  function tramoApp(ctx, o, d, kmCalle) {
    const km = kmCalle ?? (metros(o[0], o[1], d[0], d[1]) / 1000) * RODEO;
    const min = (km / VEL_APP) * 60;
    const celdaO = h3.latLngToCell(o[0], o[1], modelo.h3_res);
    const celdaD = h3.latLngToCell(d[0], d[1], modelo.h3_res);
    const porApp = Object.keys(modelo.apps).map((app) => ({ app, ...precio(app, km, min, celdaO, celdaD, ctx.franja, ctx.finde) }));
    const mejor = porApp.reduce((a, b) => (b.precio < a.precio ? b : a));
    return { km, minutos: ESPERA_APP + min, porApp, mejor };
  }

  function alcanzables(ctx, punto, hacia, caminarMax = CAMINAR_MAX_M) {
    const res = new Map();
    qrobus.paradas.forEach(([lat, lon], i) => {
      const m = metros(punto[0], punto[1], lat, lon);
      if (m > APP_MAX_KM * 1000) return;
      if (m <= caminarMax) {
        res.set(i, { modo: "caminando", costo: 0, min: (m * RODEO) / 1000 / VEL_CAMINAR * 60 });
      } else {
        const t = hacia ? tramoApp(ctx, punto, [lat, lon]) : tramoApp(ctx, [lat, lon], punto);
        res.set(i, { modo: "app", costo: t.mejor.precio, min: t.minutos, app: t.mejor.app });
      }
    });
    return res;
  }

  const NOMBRES = {
    "caminando+caminando": "Solo camión",
    "app+caminando": "App hasta la parada + camión",
    "caminando+app": "Camión + app al final",
    "app+app": "App + camión + app",
  };

  function tramo(t, parada, hacia) {
    const nombre = qrobus.paradas[parada][2];
    return t.modo === "caminando"
      ? { tipo: "caminar", min: t.min, parada: nombre, hacia }
      : { tipo: "app", app: t.app, costo: t.costo, min: t.min, parada: nombre, hacia };
  }

  // Paradas a pocos metros de cada parada, para cambiar de camion caminando.
  let vecinas;
  function vecinasDe(i) {
    if (!vecinas) {
      const celda = (lat, lon) => `${Math.round(lat / 0.003)}:${Math.round(lon / 0.003)}`;
      const malla = new Map();
      qrobus.paradas.forEach(([lat, lon], k) => {
        const c = celda(lat, lon);
        if (!malla.has(c)) malla.set(c, []);
        malla.get(c).push(k);
      });
      vecinas = qrobus.paradas.map(([lat, lon]) => {
        const [a, b] = celda(lat, lon).split(":").map(Number);
        const lista = [];
        for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) {
          for (const k of malla.get(`${a + x}:${b + y}`) ?? []) {
            const m = metros(lat, lon, qrobus.paradas[k][0], qrobus.paradas[k][1]);
            if (m <= TRANSBORDO_M) lista.push([k, m]);
          }
        }
        return lista;
      });
    }
    return vecinas[i];
  }

  const coords = (i) => qrobus.paradas[i].slice(0, 2);
  const nombreParada = (i) => qrobus.paradas[i][2];

  // Primera salida de un recorrido que pasa por la posicion pos despues del minuto t.
  function salidaDesde(p, servicio, pos, t, ventana = VENTANA_MIN) {
    const salidas = p.salidas[servicio];
    if (!salidas) return undefined;
    return salidas.map((x) => x + p.minutos[pos]).find((h) => h >= t && h <= t + ventana);
  }

  function tramoCamion(p, pb, pa, sale, servicio) {
    const llega = sale - p.minutos[pb] + p.minutos[pa];
    // La ultima salida del dia de esa linea desde la parada donde se sube.
    const ultima = Math.max(...(p.salidas[servicio] ?? [sale - p.minutos[pb]])) + p.minutos[pb];
    return {
      tipo: "camion", linea: p.linea, hacia: p.hacia, sale, llega, ultima, paradas: pa - pb, baja: nombreParada(p.paradas[pa]),
      recorrido: p.paradas.slice(pb, pa + 1).map((k) => ({ nombre: nombreParada(k), lat: qrobus.paradas[k][0], lon: qrobus.paradas[k][1] })),
    };
  }

  function armar(ctx, o, d, acceso, sb, camiones, salida, sa, tarifa) {
    const pasos = [tramo(acceso, sb, true)];
    camiones.forEach((c, k) => {
      if (k > 0 && c.caminar) pasos.push({ tipo: "caminar", min: c.caminar, parada: c.recorrido[0].nombre, hacia: true, transbordo: true });
      pasos.push(c);
    });
    pasos.push(tramo(salida, sa, false));
    const ultimo = camiones.at(-1);
    return {
      tipo: `${acceso.modo}+${salida.modo}`,
      transbordos: camiones.length - 1,
      costo: acceso.costo + tarifa.pasaje + tarifa.transbordo * (camiones.length - 1) + salida.costo,
      minutos: ultimo.llega + salida.min - ctx.minuto,
      detalle: camiones.map((c) => `línea ${c.linea}: ${c.recorrido[0].nombre} (${hhmm(c.sale)}) a ${c.baja}`).join("; "),
      pasos,
      recorrido: camiones[0].recorrido,
      trazo: {
        acceso: { modo: acceso.modo, puntos: [o, coords(sb)] },
        camiones: camiones.map((c) => c.recorrido.map((r) => [r.lat, r.lon])),
        salida: { modo: salida.modo, puntos: [coords(sa), d] },
      },
    };
  }

  function opciones(ctx, o, d, kmCalle, caminarMax, tarifa = { pasaje: qrobus.pasaje, transbordo: qrobus.pasaje / 2 }) {
    const directo = tramoApp(ctx, o, d, kmCalle);
    const filas = [{ opcion: `Solo app (${nombreApp(directo.mejor.app)})`, tipo: "app", costo: directo.mejor.precio, minutos: directo.minutos, detalle: "" }];
    const sube = alcanzables(ctx, o, true, caminarMax);
    const baja = alcanzables(ctx, d, false, caminarMax);
    const mejores = new Map();
    const llegada1 = new Map();
    let pasaCerca = false;

    const quedarse = (fila, clave) => {
      for (const sufijo of [":rapida", ":barata"]) {
        const actual = mejores.get(clave + sufijo);
        const campo = sufijo === ":rapida" ? "minutos" : "costo";
        if (!actual || fila[campo] < actual[campo] || (fila[campo] === actual[campo] && fila.minutos < actual.minutos)) mejores.set(clave + sufijo, fila);
      }
    };

    // Un camion: directo al destino, y de paso a que hora se llega a cada parada para transbordar.
    qrobus.patrones.forEach((p) => {
      p.paradas.forEach((sb, pb) => {
        const s = sube.get(sb);
        if (!s) return;
        const sale = salidaDesde(p, ctx.servicio, pb, ctx.minuto + s.min);
        if (sale === undefined) return;
        if (s.modo === "caminando") pasaCerca = true;
        for (let pa = pb + 1; pa < p.paradas.length; pa++) {
          const llega = sale - p.minutos[pb] + p.minutos[pa];
          const parada = p.paradas[pa];
          const previa = llegada1.get(parada);
          if (!previa || llega + s.costo / 10 < previa.llega + previa.s.costo / 10) llegada1.set(parada, { llega, p, pb, pa, sb, s, sale });
          const b = baja.get(parada);
          if (b) quedarse(armar(ctx, o, d, s, sb, [tramoCamion(p, pb, pa, sale, ctx.servicio)], b, parada, tarifa), `${s.modo}+${b.modo}`);
        }
      });
    });

    // Dos camiones: se baja en una parada, camina a una cercana y toma otra linea.
    const listo = new Map();
    for (const [x, primero] of llegada1) {
      for (const [y, m] of vecinasDe(x)) {
        const caminar = (m * RODEO) / 1000 / VEL_CAMINAR * 60;
        const t = primero.llega + caminar + ESPERA_TRANSBORDO;
        const previo = listo.get(y);
        if (!previo || t < previo.t) listo.set(y, { t, caminar, primero });
      }
    }
    qrobus.patrones.forEach((q) => {
      q.paradas.forEach((tb, qb) => {
        const cambio = listo.get(tb);
        if (!cambio || cambio.primero.p.linea === q.linea) return;
        const sale = salidaDesde(q, ctx.servicio, qb, cambio.t);
        if (sale === undefined) return;
        for (let qa = qb + 1; qa < q.paradas.length; qa++) {
          const b = baja.get(q.paradas[qa]);
          if (!b) continue;
          const f = cambio.primero;
          const segundo = { ...tramoCamion(q, qb, qa, sale, ctx.servicio), caminar: Math.max(1, Math.round(cambio.caminar)) };
          quedarse(armar(ctx, o, d, f.s, f.sb, [tramoCamion(f.p, f.pb, f.pa, f.sale, ctx.servicio), segundo], b, q.paradas[qa], tarifa), `2:${f.s.modo}+${b.modo}`);
        }
      });
    });

    for (const f of mejores.values()) filas.push({ ...f, opcion: NOMBRES[f.tipo] + (f.transbordos ? " con transbordo" : "") });
    const unicas = [...new Map(filas.map((f) => [`${f.opcion}|${f.detalle}`, { ...f, costo: Math.round(f.costo), minutos: Math.round(f.minutos) }])).values()];
    // Fuera las opciones que cuestan mas y tardan mas que alguna otra.
    const vivas = unicas.filter((r) => !unicas.some((x) =>
      x.costo <= r.costo && x.minutos <= r.minutos && (x.costo < r.costo || x.minutos < r.minutos)));
    return { directo, opciones: vivas.sort((a, b) => a.minutos - b.minutos || a.costo - b.costo), pasaCerca };
  }

  const trapecio = (x, a, b, c, d) => {
    if (x <= a || x >= d) return b <= x && x <= c ? 1 : 0;
    if (x < b) return (x - a) / (b - a);
    if (x <= c) return 1;
    return (d - x) / (d - c);
  };
  const triangulo = (x, a, b, c) => trapecio(x, a, b, b, c);

  const CONJUNTOS = {
    precio: {
      barato: (x) => trapecio(x, -INF, -INF, 0.85, 0.95),
      normal: (x) => triangulo(x, 0.85, 1.0, 1.15),
      caro: (x) => triangulo(x, 1.05, 1.25, 1.45),
      "muy caro": (x) => trapecio(x, 1.3, 1.5, INF, INF),
    },
    margen: {
      poco: (x) => trapecio(x, -INF, -INF, 5, 15),
      algo: (x) => triangulo(x, 5, 20, 40),
      mucho: (x) => trapecio(x, 25, 45, INF, INF),
    },
    camion: {
      poco: (x) => trapecio(x, -INF, -INF, 10, 20),
      algo: (x) => triangulo(x, 10, 25, 40),
      mucho: (x) => trapecio(x, 30, 45, INF, INF),
    },
  };

  const REGLAS = [
    [{ precio: ["barato"] }, "pedir ya"],
    [{ precio: ["normal"], margen: ["poco"] }, "pedir ya"],
    [{ precio: ["normal"], camion: ["algo", "mucho"] }, "pedir ya"],
    [{ precio: ["caro", "muy caro"], margen: ["poco"], camion: ["algo", "mucho"] }, "pedir ya"],
    [{ precio: ["caro"], margen: ["algo", "mucho"] }, "esperar"],
    [{ precio: ["muy caro"], margen: ["algo", "mucho"], camion: ["algo", "mucho"] }, "esperar"],
    [{ precio: ["caro", "muy caro"], camion: ["poco"] }, "camion"],
    [{ precio: ["muy caro"], margen: ["algo", "mucho"], camion: ["algo"] }, "camion"],
    [{ precio: ["normal"], margen: ["mucho"], camion: ["poco"] }, "camion"],
  ];

  const FRASES = { precio: "el precio está {}", margen: "te sobra {} tiempo", camion: "el camión tarda {} más" };

  function decidir(precioRel, margen, camion) {
    const entradas = { precio: precioRel, margen, camion };
    const grados = Object.fromEntries(Object.entries(CONJUNTOS).map(([v, cs]) =>
      [v, Object.fromEntries(Object.entries(cs).map(([c, f]) => [c, f(entradas[v])]))]));
    const fuerza = { "pedir ya": 0, esperar: 0, camion: 0 };
    const activas = [];
    for (const [cond, accion] of REGLAS) {
      // Y = minimo; varios conjuntos en una misma variable = O = maximo.
      const w = Math.min(...Object.entries(cond).map(([v, cs]) => Math.max(...cs.map((c) => grados[v][c]))));
      if (w > 0) activas.push({ w, accion, texto: Object.entries(cond).map(([v, cs]) => FRASES[v].replace("{}", cs.join(" o "))).join(" y ") });
      fuerza[accion] = Math.max(fuerza[accion], w);
    }
    const accion = Object.keys(fuerza).reduce((a, b) => (fuerza[b] > fuerza[a] ? b : a));
    return { accion, fuerza, activas: activas.sort((a, b) => b.w - a.w) };
  }

  function evaluar({ origen, destino, dia, minuto, app, precioVisto, margen, kmCalle, caminarMax, tarifa }) {
    const ctx = contexto(dia, minuto);
    const { directo, opciones: lista, pasaCerca } = opciones(ctx, origen, destino, kmCalle, caminarMax, tarifa);
    const res = { ctx, directo, opciones: lista, pasaCerca };

    const inicio = CORTES.find((c) => c > minuto / 60);
    if (inicio < 24 && inicio * 60 - minuto <= 90) {
      const sig = tramoApp(contexto(dia, inicio * 60), origen, destino, kmCalle);
      res.siguiente = { minuto: inicio * 60, porApp: sig.porApp };
    }
    if (app && precioVisto > 0) {
      const esperado = directo.porApp.find((x) => x.app === app);
      const conCamion = lista.filter((f) => !f.opcion.startsWith("Solo app") && f.costo <= precioVisto * (1 - AHORRO_MINIMO));
      const minApp = lista.find((f) => f.opcion.startsWith("Solo app"))?.minutos ?? directo.minutos;
      const extra = conCamion.length ? Math.min(...conCamion.map((f) => f.minutos)) - minApp : INF;
      res.decision = { esperado, relacion: precioVisto / esperado.precio, extra, ...decidir(precioVisto / esperado.precio, margen, extra) };
    }
    return res;
  }

  // Paradas cerca de un punto con las lineas que pasan y sus proximas horas segun el horario.
  function pasanAqui(lat, lon, dia, minuto, radio = 350) {
    const servicio = qrobus.servicio_por_dia[dia];
    const cerca = qrobus.paradas
      .map(([la, lo, nombre], i) => ({ i, nombre, lat: la, lon: lo, m: metros(lat, lon, la, lo) }))
      .filter((x) => x.m <= radio)
      .sort((a, b) => a.m - b.m);
    return cerca.map((parada) => {
      const lineas = new Map();
      for (const [pi, pos] of porParada[parada.i]) {
        const p = qrobus.patrones[pi];
        if (pos === p.paradas.length - 1 || !p.salidas[servicio]) continue;
        const horas = p.salidas[servicio].map((x) => x + p.minutos[pos]).filter((t) => t >= minuto).slice(0, 2);
        if (!horas.length) continue;
        const clave = `${p.linea}|${p.hacia}`;
        const actual = lineas.get(clave);
        if (!actual || horas[0] < actual.horas[0]) lineas.set(clave, { linea: p.linea, hacia: p.hacia, horas });
      }
      return { ...parada, lineas: [...lineas.values()].sort((a, b) => a.horas[0] - b.horas[0]) };
    }).filter((x) => x.lineas.length).slice(0, 3);
  }

  // Precio del mismo viaje a otra hora; si pasa de medianoche cuenta como el dia siguiente.
  function cotizar({ origen, destino, dia, minuto, kmCalle }) {
    const d = (dia + Math.floor(minuto / 1440)) % 7;
    const t = tramoApp(contexto(d, minuto % 1440), origen, destino, kmCalle);
    return { minuto, porApp: t.porApp, mejor: t.mejor };
  }

  function hhmm(min) {
    const m = Math.round(min) % 1440;
    return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  }

  const nombreApp = (a) => ({ uber: "Uber", didi: "DiDi", indrive: "inDrive" })[a];

  return { cargar, cotizar, evaluar, pasanAqui, hhmm, metros, CORTES, nombreApp, get modelo() { return modelo; }, get qrobus() { return qrobus; } };
})();
