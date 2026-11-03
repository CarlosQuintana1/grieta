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
test('rechaza una traducción sin revisar o marcada como incompleta', () => {
  for (const cambio of [{ revision: null }, { revision: '  ' }, { completa: false }, { codigo: 'es' }]) assert.equal(revisar({ ...valido(), ...cambio }, fuente), false);
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
test('el catálogo real registra pendientes y no afirma que existe una traducción', () => {
  const base = JSON.parse(fs.readFileSync(path.join(raiz, 'idiomas', 'es.json')));
  const c = JSON.parse(fs.readFileSync(path.join(raiz, 'idiomas', 'otq.json')));
  assert.equal(base.mensajes.length, c.mensajes.length);
  assert.ok(c.mensajes.length > 500);
  assert.equal(new Set(c.mensajes.map(x => x.clave)).size, c.mensajes.length);
  assert.equal(c.completa, false);
  assert.equal(c.revision, null);
  assert.ok(c.mensajes.every(x => x.otq === null));
  assert.equal(revisar(c, base), false);
});

test('el worker conserva el código y los dos catálogos para leerlos sin red', async () => {
  const manejadores = new Map(), guardadas = new Map();
  const origen = 'https://grieta.prueba/';
  const cache = {
    async addAll(archivos) {
      for (const archivo of archivos) {
        const url = new URL(archivo, origen);
        const contenido = url.origin === new URL(origen).origin
          ? fs.readFileSync(path.join(raiz, archivo === './' ? 'index.html' : archivo)) : 'Dependencia de prueba';
        guardadas.set(url.href, new Response(contenido));
      }
    },
    async put(solicitud, respuesta) { guardadas.set(solicitud.url, respuesta); },
  };
  const entorno = vm.createContext({
    URL, location: new URL(origen),
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
  for (const archivo of ['idioma.js', 'idiomas/es.json', 'idiomas/otq.json']) {
    let pendiente;
    manejadores.get('fetch')({ request: { url: origen + archivo + '?revision=prueba', method: 'GET' }, respondWith: p => { pendiente = p; } });
    const respuesta = await pendiente;
    assert.equal(await respuesta.text(), fs.readFileSync(path.join(raiz, archivo), 'utf8'));
  }
});
