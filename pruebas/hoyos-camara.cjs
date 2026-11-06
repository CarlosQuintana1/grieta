const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { servidor } = require('./hoyos-servidor.cjs');
(async()=>{
  const sinSW=process.env.HOYOS_SIN_SW==='1';
  const http=process.env.GRIETA_URL ? {url:process.env.GRIETA_URL,pedidos:[],excluidos:[],cerrar:async()=>{}} : await servidor({aislarCatalogos:true});
  const b=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE});
  try {
    const c=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:sinSW?'block':'allow'});
    const base=process.env.HOYOS_DATOS??'/private/tmp/grieta-hoyos';
    const imagenes=['img-1.jpg','commons-05.jpg'].map(n=>'data:image/jpeg;base64,'+fs.readFileSync(path.join(base,'muestra',n)).toString('base64'));
    await c.addInitScript(({imagenes})=>{
      localStorage.setItem('grieta-bienvenida','true');localStorage.setItem('grieta-acc',JSON.stringify({voz:true,vozElegida:true,lector:'no',modoVoz:false,tema:'oscuro'}));
      if(!localStorage.getItem('grieta-camara'))localStorage.setItem('grieta-camara',JSON.stringify({modelo:'ligero'}));
      window.__voz=[];window.__vibraciones=[];window.__terminados=[];window.__enviados=[];
      window.SpeechSynthesisUtterance=function(text){this.text=text;};
      Object.defineProperty(window,'speechSynthesis',{value:{speaking:false,getVoices:()=>[{localService:true,lang:'es-MX'}],cancel:()=>{},speak:m=>{window.__voz.push(m.text);m.onend?.();}}});
      Object.defineProperty(navigator,'vibrate',{value:p=>{window.__vibraciones.push(p);return true;}});
      const Original=window.Worker;
      window.Worker=class extends Original{constructor(url,opciones){super(url,opciones);this.nombre=url;}terminate(){window.__terminados.push(this.nombre);super.terminate();}postMessage(d,t){if(this.nombre.includes('hoyos-worker')&&d.tipo==='detectar')window.__enviados.push({ancho:d.ancho,alto:d.alto,bitmap:!!d.imagen});super.postMessage(d,t);}};
      navigator.mediaDevices.getUserMedia=async opts=>{
        window.__permiso=opts;
        const fotos=await Promise.all(imagenes.map(async src=>{const i=new Image();i.src=src;await i.decode();return i;}));
        const lienzo=document.createElement('canvas');lienzo.width=720;lienzo.height=960;
        let foto=0,oscura=false;
        window.__mostrar=n=>{foto=n;oscura=n<0;};
        const pintar=()=>{const x=lienzo.getContext('2d');x.fillStyle=oscura?'#000':'#222';x.fillRect(0,0,720,960);if(!oscura)x.drawImage(fotos[foto],0,120,720,720);};
        pintar();const reloj=setInterval(pintar,80),s=lienzo.captureStream(12);
        window.__pistas=s.getTracks();s.getTracks()[0].addEventListener('ended',()=>clearInterval(reloj));
        return s;
      };
    },{imagenes});
    const p=await c.newPage(),errores=[],red=[];p.on('pageerror',e=>errores.push(e.message));p.on('request',r=>red.push({url:r.url(),metodo:r.method()}));
    await p.goto(http.url);if(!sinSW)try { await p.waitForFunction(()=>navigator.serviceWorker.controller); } catch(e) { console.log('Recursos no disponibles',http.pedidos.filter(r=>r.estado!==200)); console.log(await p.evaluate(async()=>({registros:(await navigator.serviceWorker.getRegistrations()).map(r=>({activo:r.active?.state,instalando:r.installing?.state,espera:r.waiting?.state}))})));throw e; }
    if(http.excluidos.length)console.log('Solo fixture: excluidos catálogos aún no generados:',http.excluidos);
    await p.locator('#abrirCamara').tap();assert(await p.locator('#camaraHoyos').isChecked());
    await p.locator('#camaraIniciar').tap();await p.waitForFunction(()=>document.getElementById('camaraEstado').textContent.startsWith('Cámara encendida'),null,{timeout:120000});
    assert(!red.some(r=>r.url.includes('hoyos-v1.tflite')||r.url.includes('LICENSE-hoyos')));
    await p.locator('#camaraDetener').tap();await p.locator('#camaraIniciar').tap();
    await p.waitForFunction(()=>document.getElementById('camaraHoyosAlerta').textContent.startsWith('Posible hoyo'),null,{timeout:120000});
    assert(await p.locator('#camaraViaje').isChecked());assert(await p.locator('#camaraHoyos').isDisabled());
    assert.equal(await p.evaluate(()=>window.__permiso.audio),false);
    assert(await p.evaluate(()=>window.__voz.some(t=>t.startsWith('Posible hoyo'))));
    assert(await p.evaluate(()=>window.__vibraciones.some(v=>Array.isArray(v)&&v[0]===180)));
    const vozAntes=await p.evaluate(()=>window.__voz.length);await p.waitForTimeout(1000);
    assert(!await p.evaluate(n=>window.__voz.slice(n).some(t=>/Parece haber|No reconozco objetos/.test(t)),vozAntes));
    assert(await p.evaluate(()=>window.__enviados.every(d=>Math.max(d.ancho,d.alto)<=768)));
    assert.match(await p.locator('#camaraHoyosAlerta').textContent(),/de la imagen/);
    console.log('Modelo real: dos cuadros, Mi viaje, Bitmap vertical <=768, voz y vibración; narración ordinaria cede al aviso');
    await p.evaluate(()=>{window.createImageBitmap=undefined;window.__mostrar(1);});await p.locator('#camaraEntorno').check();
    await p.waitForFunction(()=>!document.getElementById('camaraHoyosAlerta').textContent,null,{timeout:12000});
    assert.equal(await p.locator('#camaraRepetir').isDisabled(),true);
    await p.evaluate(()=>window.__mostrar(0));
    await p.waitForFunction(()=>document.getElementById('camaraHoyosAlerta').textContent.startsWith('Posible hoyo'),null,{timeout:20000});
    assert(await p.evaluate(()=>window.__enviados.some(d=>!d.bitmap)));
    await p.screenshot({path:'/private/tmp/grieta-hoyos/camara-hoyos.png'});
    await p.evaluate(()=>window.__mostrar(-1));
    await p.waitForFunction(()=>document.getElementById('camaraHoyosEstado').textContent.includes('poco legible'),null,{timeout:10000});
    assert.equal(await p.locator('#camaraHoyosAlerta').textContent(),'');
    console.log('Todo el entorno y RGBA: vuelve a detectar; tapa sin aviso y oscuridad retiran la alerta');
    await p.locator('#camaraDetener').tap();assert.deepEqual(await p.evaluate(()=>window.__pistas.map(t=>t.readyState)),['ended']);
    assert(await p.evaluate(()=>window.__terminados.some(n=>n.includes('hoyos-worker'))));
    if(!sinSW){await c.setOffline(true);await p.reload({waitUntil:'domcontentloaded'});await p.locator('#abrirCamara').tap();
    assert(await p.locator('#camaraHoyos').isChecked());await p.locator('#camaraIniciar').tap();
    await p.waitForFunction(()=>document.getElementById('camaraHoyosAlerta').textContent.startsWith('Posible hoyo'),null,{timeout:120000});
    console.log('SW con fragmentos y manifiesto v5: modelo opcional funciona sin red después de primera descarga');}
    await p.locator('[data-tab="inicio"]').tap();assert.deepEqual(await p.evaluate(()=>window.__pistas.map(t=>t.readyState)),['ended']);
    await p.setViewportSize({width:320,height:844});await p.evaluate(()=>{acc.grande=true;acc.tema='claro';aplicarAcc();});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    assert.deepEqual(errores,[]);assert(red.every(r=>r.metodo==='GET'));assert(http.pedidos.every(r=>r.metodo==='GET'));
    assert(!await p.evaluate(()=>window.__voz.some(t=>/puedes avanzar|puedes cruzar|puedes bajar|paso libre/i.test(t))));
    console.log('Preferencia persiste apagada; salida cierra pistas y worker; 320px sin desbordar, solo GET y cero errores JS');
  } finally {await b.close();await http.cerrar();}
})().catch(e=>{console.error(e);process.exitCode=1;});
