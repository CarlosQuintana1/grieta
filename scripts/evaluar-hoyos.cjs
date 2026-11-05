const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { Avisador } = require('../demo/vision/hoyos.js');
const base = process.env.HOYOS_DATOS ?? '/private/tmp/grieta-hoyos';
const url = process.env.GRIETA_URL ?? 'http://127.0.0.1:8816';
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const iou = (a, b) => {
  const inter = Math.max(0, Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)) * Math.max(0, Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));
  return inter / (a.w*a.h+b.w*b.h-inter);
};
function medir(regiones, gt) {
  const usadas = new Set(); let tp = 0;
  for (const r of regiones) {
    const orden = gt.map((c,i)=>({i, solape:iou(r.caja,c)})).filter(v=>!usadas.has(v.i)).sort((a,b)=>b.solape-a.solape);
    if (orden[0]?.solape >= .5) { usadas.add(orden[0].i); tp++; }
  }
  return { tp, fp: regiones.length-tp, fn: gt.length-tp, gt:gt.length };
}
async function evaluar() {
  const { chromium } = require('playwright');
  const seleccion = JSON.parse(fs.readFileSync(path.join(base,'seleccion-previa.json')));
  assert.deepEqual(seleccion.map(i=>i.archivo),Array.from({length:20},(_,i)=>`img-${i+1}.jpg`));
  const commons = JSON.parse(fs.readFileSync(path.join(base,'commons-previo.json')));
  assert.equal(commons.length,11);
  const navegador = await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE});
  try {
    const contexto = await navegador.newContext({serviceWorkers:'block'});
    await contexto.route(url+'/**', r => new URL(r.request().url()).pathname === '/hoyos-evaluacion' ? r.fulfill({contentType:'text/html',body:'<!doctype html><title>Evaluación local de hoyos</title>'}) : r.continue());
    const p = await contexto.newPage(); const metodos = [], errores = [];
    p.on('request',r=>metodos.push(r.method())); p.on('pageerror',e=>errores.push(e.message));
    await p.goto(url+'/hoyos-evaluacion');
    await p.evaluate(async()=>{
      window.worker = new Worker('/vision/hoyos-worker.js?v=76');
      window.pedir = (d,transfer=[]) => new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('worker timeout')),60000);worker.onmessage=e=>{clearTimeout(t);e.data.tipo==='error'?reject(Error('modelo')):resolve(e.data);};worker.onerror=e=>{clearTimeout(t);reject(Error(e.message));};worker.postMessage(d,transfer);});
      const r=await pedir({tipo:'iniciar'}); if(r.tipo!=='listo')throw Error('init');
    });
    const filas=[];
    for (const foto of [...seleccion,...commons]) {
      const bytes=fs.readFileSync(path.join(base,'muestra',foto.archivo));
      if(foto.sha256) assert.equal(hash(bytes),foto.sha256);
      const medidas=await p.evaluate(async src=>{
        const i=new Image();i.src=src;await i.decode(); const s=Math.min(1,768/Math.max(i.width,i.height));
        const c=document.createElement('canvas');c.width=Math.max(1,Math.round(i.width*s));c.height=Math.max(1,Math.round(i.height*s));c.getContext('2d').drawImage(i,0,0,c.width,c.height);
        const bitmap=await createImageBitmap(c);const a=await pedir({tipo:'detectar',imagen:bitmap,ancho:c.width,alto:c.height},[bitmap]);
        const datos=c.getContext('2d').getImageData(0,0,c.width,c.height).data.buffer;
        const b=await pedir({tipo:'detectar',pixeles:datos,ancho:c.width,alto:c.height},[datos]);
        return {bitmap:a,rgba:b,ancho:c.width,alto:c.height};
      },'data:image/jpeg;base64,'+bytes.toString('base64'));
      assert.equal(medidas.bitmap.regiones.length,medidas.rgba.regiones.length);
      for (const r of medidas.bitmap.regiones) assert(medidas.rgba.regiones.some(b => iou(r.caja,b.caja) > .95 && Math.abs(r.confianza-b.confianza) < .03), 'Bitmap/RGBA deben conservar regiones y confianza con tolerancia de rasterización');
      const regiones=medidas.bitmap.regiones;
      const avisador=new Avisador(); assert.equal(avisador.actualizar(regiones,{ahora:0,capturada:0,fotograma:0}),null);
      const aviso=avisador.actualizar(regiones,{ahora:700,capturada:700,fotograma:1});
      let gt=[],anotacionSha256;
      if(foto.anotacion) {
        const texto=fs.readFileSync(path.join(base,'muestra',foto.anotacion));anotacionSha256=hash(texto);
        gt=texto.toString().trim().split('\n').filter(Boolean).map(l=>{const [clase,x,y,w,h]=l.trim().split(/\s+/).map(Number);assert.equal(clase,0);return{x:x-w/2,y:y-h/2,w,h};});
      }
      filas.push({...foto,sha256:hash(bytes),anotacionSha256,gt,regiones,aviso:aviso?.texto??null,...(foto.anotacion?{objetos:medir(regiones,gt)}:{}),ms:medidas.bitmap.ms,msRgba:medidas.rgba.ms,regionesRgba:medidas.rgba.regiones,ancho:medidas.ancho,alto:medidas.alto});
      console.log(foto.archivo,regiones.length,'regiones',Math.round(medidas.bitmap.ms)+'ms');
    }
    await p.evaluate(()=>worker.terminate()); assert.deepEqual(errores,[]); assert(metodos.every(m=>m==='GET'));
    const baches=filas.filter(f=>f.grupo==='bache'), negativas=filas.filter(f=>['tapa','sombra'].includes(f.grupo));
    const resumen={
      baches:{imagenes:20,escenaTP:baches.filter(f=>f.regiones.length).length,escenaFN:baches.filter(f=>!f.regiones.length).length,...baches.reduce((a,f)=>{for(const k of ['tp','fp','fn','gt'])a[k]+=f.objetos[k];return a;},{tp:0,fp:0,fn:0,gt:0})},
      abiertas:{imagenes:3,escenaTP:filas.filter(f=>f.grupo==='abierta'&&f.regiones.length).length,escenaFN:filas.filter(f=>f.grupo==='abierta'&&!f.regiones.length).length},
      negativas:{imagenes:6,escenaFP:negativas.filter(f=>f.regiones.length).length,regionesFP:negativas.reduce((n,f)=>n+f.regiones.length,0)},
      charcos:{imagenes:2,escenasConDeteccion:filas.filter(f=>f.grupo==='charco'&&f.regiones.length).length,clasificacion:'ambigua; no cuenta como FP/TN'},
      latencia:{mediana:[...filas].sort((a,b)=>a.ms-b.ms)[15].ms,maximo:Math.max(...filas.map(f=>f.ms))}
    };
    const salida={fecha:new Date().toISOString(),modeloSha256:hash(fs.readFileSync(path.join(__dirname,'../demo/vision/modelos/hoyos-v1.tflite'))),seleccionSha256:hash(fs.readFileSync(path.join(base,'seleccion-previa.json'))),contactoSha256:hash(fs.readFileSync(path.join(base,'contacto-antes.jpg'))),runtime:await navegador.version(),umbral:.65,iou:.5,maxRegiones:3,notas:'Muestra de conveniencia, selección previa a inferencia. Puede solaparse con entrenamiento. Commons positivas por escena, sin cajas GT. Dos repeticiones de foto prueban política, no confirman en video real. Latencia de escritorio; no prueba teléfono caminando.',resumen,filas};
    fs.writeFileSync(process.env.HOYOS_REPORTE??path.join(__dirname,'../docs/hoyos-evaluacion.json'),JSON.stringify(salida,null,2)+'\n');console.log(JSON.stringify(resumen));
  } finally { await navegador.close(); }
}
module.exports={iou,medir};
if(require.main===module)evaluar().catch(e=>{console.error(e);process.exitCode=1;});
