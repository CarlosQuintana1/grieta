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

  function alcanzables(ctx, punto, hacia) {
    const res = new Map();
    qrobus.paradas.forEach(([lat, lon], i) => {
      const m = metros(punto[0], punto[1], lat, lon);
      if (m > APP_MAX_KM * 1000) return;
      if (m <= CAMINAR_MAX_M) {
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

  function opciones(ctx, o, d, kmCalle) {
    const directo = tramoApp(ctx, o, d, kmCalle);
    const filas = [{ opcion: `Solo app (${nombreApp(directo.mejor.app)})`, tipo: "app", costo: directo.mejor.precio, minutos: directo.minutos, detalle: "" }];
    const sube = alcanzables(ctx, o, true);
    const baja = alcanzables(ctx, d, false);
    const mejores = new Map();
    let pasaCerca = false;

    qrobus.patrones.forEach((p) => {
      const salidas = p.salidas[ctx.servicio];
      if (!salidas) return;
      p.paradas.forEach((sb, pb) => {
        const s = sube.get(sb);
        if (!s) return;
        // Primera salida que alcanza esta parada a tiempo, dentro de la proxima hora.
        const desde = ctx.minuto + s.min;
        const sale = salidas.map((x) => x + p.minutos[pb]).find((t) => t >= desde && t <= desde + VENTANA_MIN);
        if (sale === undefined) return;
        if (s.modo === "caminando") pasaCerca = true;
        for (let pa = pb + 1; pa < p.paradas.length; pa++) {
          const b = baja.get(p.paradas[pa]);
          if (!b) continue;
          const llega = sale - p.minutos[pb] + p.minutos[pa];
          const coords = (i) => qrobus.paradas[i].slice(0, 2);
          const fila = {
            tipo: `${s.modo}+${b.modo}`,
            costo: s.costo + qrobus.pasaje + b.costo,
            minutos: llega + b.min - ctx.minuto,
            detalle: `línea ${p.linea}: ${qrobus.paradas[sb][2]} (${hhmm(sale)}) a ${qrobus.paradas[p.paradas[pa]][2]}`,
            pasos: [
              tramo(s, sb, true),
              { tipo: "camion", linea: p.linea, sale, llega, paradas: pa - pb, baja: qrobus.paradas[p.paradas[pa]][2] },
              tramo(b, p.paradas[pa], false),
            ],
            trazo: {
              acceso: { modo: s.modo, puntos: [o, coords(sb)] },
              camion: p.paradas.slice(pb, pa + 1).map(coords),
              salida: { modo: b.modo, puntos: [coords(p.paradas[pa]), d] },
            },
          };
          for (const clave of [`${fila.tipo}:rapida`, `${fila.tipo}:barata`]) {
            const actual = mejores.get(clave);
            const campo = clave.endsWith("rapida") ? "minutos" : "costo";
            if (!actual || fila[campo] < actual[campo]) mejores.set(clave, fila);
          }
        }
      });
    });

    for (const f of mejores.values()) filas.push({ ...f, opcion: NOMBRES[f.tipo] });
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

  function evaluar({ origen, destino, dia, minuto, app, precioVisto, margen, kmCalle }) {
    const ctx = contexto(dia, minuto);
    const { directo, opciones: lista, pasaCerca } = opciones(ctx, origen, destino, kmCalle);
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

  function hhmm(min) {
    const m = Math.round(min) % 1440;
    return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  }

  const nombreApp = (a) => ({ uber: "Uber", didi: "DiDi", indrive: "inDrive" })[a];

  return { cargar, evaluar, hhmm, metros, nombreApp, get modelo() { return modelo; }, get qrobus() { return qrobus; } };
})();
