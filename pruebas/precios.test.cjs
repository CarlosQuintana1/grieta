const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const raiz=process.env.GRIETA_REPO??path.join(__dirname,'..');
async function cotizar(habitual){
 const modelo={h3_res:7,franjas:Array(7).fill('dia'),apps:{}};
 for(const app of ['uber','didi','indrive']){
  modelo.apps[app]={formula:[100,10,0],intercepto:0,franjas:{dia:0},finde:0,origen:{},destino:{},rango:[Math.log(.5),Math.log(1.8)]};
  if(habitual!==undefined)modelo.apps[app].rango_habitual=habitual;
 }
 const qrobus={paradas:[],patrones:[],servicio_por_dia:Array(7).fill('dia')};
 const c=vm.createContext({h3:{latLngToCell:()=> 'celda'},fetch:async url=>({json:async()=>url.endsWith('modelo.json')?modelo:qrobus})});
 vm.runInContext(fs.readFileSync(path.join(raiz,'demo/grieta.js'),'utf8')+';this.motor=Grieta;',c);
 await c.motor.cargar();return JSON.parse(JSON.stringify(c.motor.cotizar({origen:[20.6,-100.4],destino:[20.61,-100.4],dia:2,minuto:600,kmCalle:5})));
}
test('la banda habitual reduce la anchura sin cambiar precio, banda amplia ni app elegida',async()=>{
 const antes=await cotizar(),ahora=await cotizar([Math.log(.9),Math.log(1.1)]);
 assert.equal(ahora.mejor.app,antes.mejor.app);
 for(let i=0;i<3;i++){
  const a=ahora.porApp[i],b=antes.porApp[i];assert.equal(a.precio,150);assert.equal(a.precio,b.precio);assert.equal(a.bajo,b.bajo);assert.equal(a.alto,b.alto);
  assert(Math.abs(a.habitual.bajo-135)<1e-9);assert(Math.abs(a.habitual.alto-165)<1e-9);assert(a.habitual.bajo>a.bajo&&a.habitual.alto<a.alto);
 }
});
test('modelos antiguos y bandas malformadas conservan los intervalos anteriores',async()=>{
 for(const dato of [undefined,null,[],[.1,-.1],[-.1],[-.1,.1,.2],['0',.1],[NaN,.1],[0,Infinity]]){
  const r=await cotizar(dato);assert(r.porApp.every(a=>!('habitual' in a)));assert(r.porApp.every(a=>a.precio===150&&a.bajo===75&&Math.abs(a.alto-270)<1e-9));
 }
});
test('las dos exportaciones coinciden y las tres bandas habituales están dentro de las amplias',()=>{
 const demo=fs.readFileSync(path.join(raiz,'demo/datos/modelo.json'));
 assert.deepEqual(demo,fs.readFileSync(path.join(raiz,'nube/cotizar/modelo.json')));
 const m=JSON.parse(demo);assert.deepEqual(m.cuantiles_habitual,[.25,.75]);
 for(const a of Object.values(m.apps)){
  assert.equal(a.rango_habitual.length,2);assert(a.rango_habitual.every(Number.isFinite));
  assert(a.rango[0]<=a.rango_habitual[0]&&a.rango_habitual[0]<a.rango_habitual[1]&&a.rango_habitual[1]<=a.rango[1]);
 }
});
