import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const raiz=new URL('../demo/',import.meta.url); 
const datos=Object.fromEntries(await Promise.all(['modelo','qrobus'].map(async n=>[n,JSON.parse(await readFile(new URL(`datos/${n}.json`,raiz),'utf8'))])));
const entorno=vm.createContext({h3:{latLngToCell:()=>''},fetch:async p=>({json:async()=>datos[p.includes('modelo')?'modelo':'qrobus']})});
vm.runInContext(await readFile(new URL('grieta.js',raiz),'utf8')+'\nglobalThis.motor=Grieta;',entorno);
const g=entorno.motor;await g.cargar();
const base={origen:[20.63365,-100.405749],destino:[20.613191,-100.405908],dia:6,minuto:975};
const normal=g.evaluar(base);
const c=normal.opciones.flatMap(o=>o.pasos??[]).find(p=>p.tipo==='camion');
assert.ok(c,'El escenario inicial debe ofrecer un camión');
const omitido={linea:c.linea,hacia:c.hacia,sale:c.sale,parada:c.recorrido[0],dia:6};
const nueva=g.evaluar({...base,omitir:[omitido]});
assert.notDeepEqual(nueva.opciones,normal.opciones,'La salida perdida debe cambiar las alternativas disponibles');
assert.deepEqual(nueva.directo,normal.directo,'Descartar un camión no debe cambiar los precios de app');
function comprobar(r){
 for(const o of r.opciones) for(const p of o.pasos??[]){
  if(p.tipo!=='camion'||p.linea!==c.linea||p.hacia!==c.hacia)continue;
  const i=c.recorrido.findIndex(x=>g.metros(x.lat,x.lon,p.recorrido[0].lat,p.recorrido[0].lon)<50);
  if(i<0)continue;
  const patron=datos.qrobus.patrones.find(q=>q.linea===c.linea&&q.hacia===c.hacia&&q.paradas.some(k=>g.metros(...datos.qrobus.paradas[k].slice(0,2),c.recorrido[0].lat,c.recorrido[0].lon)<50)&&q.paradas.some(k=>g.metros(...datos.qrobus.paradas[k].slice(0,2),p.recorrido[0].lat,p.recorrido[0].lon)<50));
  const pos=(punto)=>patron.paradas.findIndex(k=>g.metros(...datos.qrobus.paradas[k].slice(0,2),punto.lat,punto.lon)<50);
  const pasoPerdido=c.sale-patron.minutos[pos(c.recorrido[0])]+patron.minutos[pos(p.recorrido[0])];
  assert.ok(p.sale>pasoPerdido,'No debe sugerirse el mismo camión desde otra parada');
 }
}
comprobar(nueva);
const siguiente=c.recorrido[1];comprobar(g.evaluar({...base,origen:[siguiente.lat,siguiente.lon],omitir:[omitido]}));
const lunes={...base,dia:0};
assert.deepEqual(g.evaluar({...lunes,omitir:[omitido]}).opciones,g.evaluar(lunes).opciones,'La exclusión del domingo no debe descartar salidas del lunes');
assert.deepEqual(g.evaluar({...base,omitir:[]}).opciones,normal.opciones,'Sin exclusiones el cálculo debe permanecer igual');
console.log('5 comprobaciones correctas: salida descartada, parada posterior, otra fecha, precios de app y cálculo sin exclusiones. H3 simulado: no se verifican precios por zona.');
