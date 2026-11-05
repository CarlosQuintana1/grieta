const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {medir}=require('../scripts/evaluar-hoyos.cjs');
function entorno({longitud=50400,error=false}={}) {
  const enviados=[],dibujos=[],opciones=[],cerradas=[];
  const ctx={fillRect(){},putImageData(){},drawImage(...v){dibujos.push(v);}};
  const c=vm.createContext({Uint8ClampedArray,ArrayBuffer,performance:{now:()=>10},URL,ImageData:class {},OffscreenCanvas:class{getContext(){return ctx;}},postMessage:d=>enviados.push(d),GrietaHoyosPolitica:{decodificar:()=>[]}});
  c.self=c;c.location='http://localhost/vision/hoyos-worker.js';
  c.importScripts=()=>{c.exports.FilesetResolver={forVisionTasks:async()=>({})};c.exports.ImageEmbedder={createFromOptions:async(_a,o)=>{opciones.push(o);return {embed(){if(error)throw Error('inferir');return{embeddings:[{floatEmbedding:Array(longitud).fill(0)}]};},close(){cerradas.push('modelo');}};}};};
  vm.runInContext(fs.readFileSync(require('path').join(__dirname,'../demo/vision/hoyos-worker.js'),'utf8'),c);
  return {c,enviados,dibujos,opciones,cerradas,enviar:d=>c.onmessage({data:d})};
}
test('usa ImageEmbedder sin L2 ni cuantización y rellena abajo/derecha con 114',async()=>{
  const e=entorno();await e.enviar({tipo:'iniciar'});
  assert.equal(e.opciones[0].l2Normalize,false);assert.equal(e.opciones[0].quantize,false);
  assert.equal(e.opciones[0].baseOptions.delegate,'CPU');
  let cerrada=false;await e.enviar({tipo:'detectar',ancho:768,alto:384,imagen:{width:768,height:384,close(){cerrada=true;}}});
  assert(cerrada);assert.equal(e.enviados.at(-1).tipo,'suelo');assert.deepEqual(e.dibujos[0].slice(1),[0,0,640,320]);
});
test('rechaza tensor incompatible o error de inferencia y libera Bitmap',async()=>{
  for(const config of [{longitud:1024},{error:true}]){
    const e=entorno(config);await e.enviar({tipo:'iniciar'});let cerrada=false;
    await e.enviar({tipo:'detectar',ancho:640,alto:640,imagen:{width:640,height:640,close(){cerrada=true;}}});
    assert(cerrada);assert.equal(e.enviados.at(-1).tipo,'error');
  }
});
test('rechaza tamaños mayores a 768, RGBA truncado e inferencia antes de iniciar',async()=>{
  for(const d of [{tipo:'detectar',ancho:1,alto:1,pixeles:new ArrayBuffer(4)},{tipo:'detectar',ancho:769,alto:10},{tipo:'detectar',ancho:10,alto:10,pixeles:new ArrayBuffer(3)}]){
    const e=entorno();if(d.ancho!==1)await e.enviar({tipo:'iniciar'});await e.enviar(d);assert.equal(e.enviados.at(-1).tipo,'error');
  }
});
test('evaluación uno a uno cuenta duplicados como FP y omisiones como FN',()=>{
  const caja={x:.1,y:.1,w:.2,h:.2};
  assert.deepEqual(medir([{caja},{caja}],[caja,{x:.7,y:.7,w:.1,h:.1}]),{tp:1,fp:1,fn:1,gt:2});
});
