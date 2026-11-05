const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const raiz = path.join(__dirname, '..', 'demo');
const contexto = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(raiz, 'idioma.js'), 'utf8') + ';this.interfaz = Interfaz;', contexto);
const { revisar } = contexto.interfaz;
const fuente = { mensajes: [{ clave: 'llegada', es: 'Llegas a {lugar} a las {hora}' }, { clave: 'inicio', es: 'Inicio' }] };
const valido = () => ({ codigo: 'otq', completa: true, revision: 'Escenario de prueba, sin texto en otomí', mensajes: [
  { clave: 'inicio', es: 'Inicio', otq: 'Prueba de Inicio' },
  { clave: 'llegada', es: 'Llegas a {lugar} a las {hora}', otq: 'Prueba: {hora}, {lugar}' },
] });

test('acepta otro orden de mensajes y variables sin perder datos del viaje', () => {
  assert.equal(revisar(valido(), fuente), true);
});
test('rechaza una traducción incompleta o sin revisión ni procedencia automática', () => {
  for (const cambio of [{ revision: null }, { revision: '  ' }, { completa: false }, { codigo: 'es' }]) assert.equal(revisar({ ...valido(), ...cambio }, fuente), false);
});
test('acepta un catálogo automático identificado como provisional y con procedencia', () => {
  const c = { ...valido(), revision: null, provisional: true, fuente: { tipo: 'automatica', nombre: 'Escenario de prueba', url: 'https://example.com/catalogo' } };
  assert.equal(revisar(c, fuente), true);
  assert.equal(revisar({ ...c, fuente: null }, fuente), false);
  assert.equal(revisar({ ...c, provisional: false }, fuente), false);
});
test('rechaza variables perdidas, nuevas y repetidas por error', () => {
  for (const otq of ['Prueba {lugar}', 'Prueba {lugar} {hora} {precio}', 'Prueba {lugar} {lugar} {hora}']) {
    const c = valido(); c.mensajes[1].otq = otq;
    assert.equal(revisar(c, fuente), false);
  }
});
test('rechaza un catálogo vacío, un texto pendiente y quitar mensajes para aparentar cobertura', () => {
  for (const mensajes of [[], valido().mensajes.slice(0, 1), [...valido().mensajes, valido().mensajes[0]]]) assert.equal(revisar({ ...valido(), mensajes }, fuente), false);
  for (const otq of [null, '', '  ', 0]) { const c = valido(); c.mensajes[0].otq = otq; assert.equal(revisar(c, fuente), false); }
});
test('rechaza cambiar la clave o el texto fuente de una instrucción', () => {
  for (const cambio of [{ clave: 'otra' }, { es: 'Llegas a otro lugar' }]) {
    const c = valido(); Object.assign(c.mensajes[1], cambio);
    assert.equal(revisar(c, fuente), false);
  }
});
test('rechaza datos mal formados sin lanzar errores', () => {
  for (const c of [null, {}, { ...valido(), mensajes: [null, null] }]) assert.equal(revisar(c, fuente), false);
  assert.equal(revisar(valido(), { mensajes: [null, null] }), false);
});
test('el catálogo real contiene los textos provisionales y conserva todas las variables', () => {
  const base = JSON.parse(fs.readFileSync(path.join(raiz, 'idiomas', 'es.json')));
  const c = JSON.parse(fs.readFileSync(path.join(raiz, 'idiomas', 'otq.json')));
  assert.ok(base.mensajes.length > c.mensajes.length);
  assert.ok(c.mensajes.length > 500);
  assert.equal(new Set(c.mensajes.map(x => x.clave)).size, c.mensajes.length);
  assert.equal(c.completa, false);
  assert.equal(c.parcial, true);
  assert.equal(c.provisional, true);
  assert.equal(c.revision, null);
  assert.ok(c.mensajes.every(x => typeof x.otq === 'string' && x.otq.trim()));
  assert.equal(revisar(c, base), true);
  for (const m of c.mensajes) {
    const huecos = texto => [...texto.matchAll(/\{(\w+)\}/g)].map(x => x[1]).sort();
    assert.deepEqual(huecos(m.es), huecos(m.otq), m.es);
  }
});
test('la traducción conserva los números y las marcas que aparecen en los textos fuente', () => {
  const c = JSON.parse(fs.readFileSync(path.join(raiz, 'idiomas', 'otq.json')));
  const numeros = texto => [...texto.replace(/\{\w+\}/g, '').matchAll(/\d+(?:[.,]\d+)?/g)].map(x => x[0]).sort();
  const marcas = /Grieta|Qrobus|Uber|DiDi|inDrive|WhatsApp|VoiceOver|TalkBack|Tarifa Unidos/gi;
  for (const m of c.mensajes) {
    assert.deepEqual(numeros(m.es), numeros(m.otq), m.es);
    assert.deepEqual((m.es.match(marcas) || []).map(x => x.toLowerCase()).sort(), (m.otq.match(marcas) || []).map(x => x.toLowerCase()).sort(), m.es);
  }
});

test('el worker conserva el código y los catálogos activos y pendientes sin red', async () => {
  const manejadores = new Map(), guardadas = new Map();
  const origen = 'https://grieta.prueba/';
  const cache = {
    async addAll(archivos) {
      for (const archivo of archivos) {
        assert.equal(archivo.cache, 'reload');
        const url = new URL(archivo.url, origen);
        const contenido = url.origin === new URL(origen).origin
          ? fs.readFileSync(path.join(raiz, url.pathname === '/' ? 'index.html' : url.pathname.slice(1))) : 'Dependencia de prueba';
        guardadas.set(url.href, new Response(contenido));
      }
    },
    async put(solicitud, respuesta) { guardadas.set(solicitud.url, respuesta); },
  };
  const entorno = vm.createContext({
    URL, Request, location: new URL(origen),
    self: { addEventListener: (nombre, fn) => manejadores.set(nombre, fn), skipWaiting: async () => {}, clients: { claim: async () => {} } },
    caches: {
      open: async () => cache,
      match: async (solicitud, opciones) => {
        assert.equal(opciones.ignoreSearch, true);
        return guardadas.get(solicitud.url.split('?')[0])?.clone();
      },
    },
    fetch: async () => { throw new Error('Sin red durante la prueba'); },
  });
  vm.runInContext(fs.readFileSync(path.join(raiz, 'sw.js'), 'utf8'), entorno);
  let instalacion;
  manejadores.get('install')({ waitUntil: p => { instalacion = p; } });
  await instalacion;
  for (const archivo of ['idioma.js', 'idiomas/es.json', 'idiomas/otq.json', 'idiomas/nhe.json', 'tutorial.js']) {
    let pendiente;
    manejadores.get('fetch')({ request: { url: origen + archivo + '?revision=prueba', method: 'GET' }, respondWith: p => { pendiente = p; } });
    const respuesta = await pendiente;
    assert.equal(await respuesta.text(), fs.readFileSync(path.join(raiz, archivo), 'utf8'));
  }
});

test('náhuatl completo tiene traducción provisional, procedencia y todas las claves', () => {
  const base = JSON.parse(fs.readFileSync(path.join(raiz, 'idiomas/es.json')));
  const c = JSON.parse(fs.readFileSync(path.join(raiz, 'idiomas/nhe.json')));
  assert.equal(c.completa, true); assert.equal(c.parcial, false);
  assert.equal(c.provisional, true); assert.equal(c.revision, null);
  assert.equal(c.fuente.tipo, 'automatica');
  assert.equal(new URL(c.fuente.url).hostname, 'translate.google.com');
  assert.equal(revisar(c, base), true);
  assert.deepEqual(c.mensajes.map(m => [m.clave,m.es]), base.mensajes.map(m => [m.clave,m.es]));
  assert.ok(c.mensajes.every(m => typeof m.nhe === 'string' && m.nhe.trim()));
  assert.notEqual(c.mensajes.find(m => m.es === 'Inicio').nhe, 'Inicio');
});
test('un catálogo parcial identificado conserva sus mensajes y rechaza integridad rota', () => {
  const c = { ...valido(), completa: false, parcial: true, mensajes: valido().mensajes.slice(0,1) };
  assert.equal(revisar(c, fuente),true);
  assert.equal(revisar({...c, parcial: false},fuente),false);
  assert.equal(revisar({...c, completa: true},fuente),false);
  assert.equal(revisar({...c, mensajes:[]},fuente),false);
});
test('valida náhuatl completo sin reutilizar por error el campo de otomí', () => {
  const c = { ...valido(), codigo:'nhe', mensajes:valido().mensajes.map(({otq,...m})=>({...m,nhe:otq})) };
  assert.equal(revisar(c,fuente),true);
  delete c.mensajes[0].nhe;
  assert.equal(revisar(c,fuente),false);
});
test('rechaza alterar números o marcas incluso con las variables intactas', () => {
  const base={mensajes:[{clave:'precio',es:'Grieta: 2 pesos a las {hora}'}]};
  const c={codigo:'nhe',completa:true,revision:'Catálogo sintético de prueba',mensajes:[{...base.mensajes[0],nhe:'Grieta: prueba 2 {hora}'}]};
  assert.equal(revisar(c,base),true);
  c.mensajes[0].nhe='Prueba 3 {hora}';assert.equal(revisar(c,base),false);
});
