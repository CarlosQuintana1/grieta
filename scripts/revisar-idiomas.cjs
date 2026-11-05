const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const raiz = path.join(__dirname, '..', 'demo');
const cargar = id => JSON.parse(fs.readFileSync(path.join(raiz, 'idiomas', id + '.json')));
const contexto = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(raiz, 'idioma.js'), 'utf8') + ';this.interfaz = Interfaz;', contexto);
const base = cargar('es');
const exigir = process.argv.includes('--exigir') ? process.argv[process.argv.indexOf('--exigir') + 1] : null;
let fallo = false;
for (const codigo of ['otq', 'nhe']) {
  const catalogo = cargar(codigo);
  const cantidad = catalogo.mensajes.filter(m => typeof m[codigo] === 'string' && m[codigo].trim()).length;
  const valido = contexto.interfaz.revisar(catalogo, base);
  console.log(`${codigo}: ${cantidad}/${base.mensajes.length} textos; ${valido ? catalogo.parcial ? 'parcial' : 'completo' : 'pendiente, desactivado'}`);
  if (codigo === exigir && (!valido || catalogo.parcial || !catalogo.completa)) fallo = true;
  if (catalogo.completa && !valido) fallo = true;
  if (catalogo.parcial && !valido) fallo = true;
}
if (exigir && !['otq', 'nhe'].includes(exigir)) fallo = true;
process.exitCode = fallo ? 1 : 0;
