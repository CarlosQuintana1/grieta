const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const exe=process.env.CHROMIUM_EXECUTABLE;
const imagen='data:image/png;base64,'+require('node:fs').readFileSync(process.env.VISION_IMAGEN).toString('base64');
const base=process.env.GRIETA_URL ?? 'http://127.0.0.1:8791';
(async()=>{
 const b=await chromium.launch({headless:true,executablePath:exe});
 const ctx=await b.newContext({viewport:{width:390,height:844},permissions:['geolocation'],geolocation:{latitude:20.6,longitude:-100.4}});
 await ctx.addInitScript(({imagen})=>{
  localStorage.setItem('grieta-camara',JSON.stringify({enfoque:'entorno',escalones:false}));localStorage.setItem('grieta-bienvenida','true');localStorage.setItem('grieta-acc',JSON.stringify({tema:'oscuro',voz:false,toques:false}));
  window.__dichos = [];
  window.__vocesListas = false;
  let vozHabilitada = false;
  window.SpeechSynthesisUtterance = function (texto) { this.text = texto; };
  Object.defineProperty(window, 'speechSynthesis', { value: {
    getVoices: () => window.__vocesListas ? [{ lang: 'es-MX', localService: true }] : [],
    cancel() {},
    speak(mensaje) {
      const toque = window.event;
      if (toque?.isTrusted && toque.type === 'click' && toque.target.id === 'camaraIniciar') {
        vozHabilitada = true;
        window.__inicioSilencioso = mensaje.text === '' && mensaje.volume === 0;
      }
      if (!vozHabilitada || !mensaje.text) return;
      window.__dichos.push(mensaje.text);
      mensaje.onstart?.();
      mensaje.onend?.();
    },
  } });
  navigator.mediaDevices.getUserMedia=async(opciones)=>{
   window.__peticion=opciones;
   if(window.__denegar) throw new DOMException('denied','NotAllowedError');
   const c=document.createElement('canvas');c.width=960;c.height=600;window.__escena=c;
   const i=new Image();i.src=imagen;await i.decode();c.getContext('2d').drawImage(i,0,0,960,600);
   const stream=c.captureStream(5);window.__pistas=stream.getTracks();if(window.__retenerPermiso) await new Promise(resolve=>window.__continuarPermiso=resolve);return stream;
  };
 },{imagen});
 const p=await ctx.newPage();const errores=[];const red=[];
 p.on('pageerror',e=>errores.push(e.message));p.on('request',r=>red.push({url:r.url(),method:r.method(),body:!!r.postData()}));
 await p.goto(base);await p.evaluate(()=>navigator.serviceWorker.ready);
 await p.locator('#activarVoz').click(); assert(await p.locator('#inicioVoz').isVisible());
 await p.locator('[data-tab="ajustes"]').click();await p.locator('[data-tab="inicio"]').click();assert(await p.locator('#inicioVoz').isVisible());
 console.log('Voz visible al activar y regresar de Ajustes');
 await p.evaluate(()=>{acc.voz=false;aplicarAcc();});
 await p.locator('#vozCamara').click();await p.locator('#camaraIniciar').click();
 await p.waitForFunction(()=>document.querySelector('#camaraEstado').textContent.match(/^(Cámara encendida|No pude|No encontré)/),null,{timeout:180000});
 console.log('Cámara:',await p.locator('#camaraEstado').innerText());
 await p.waitForFunction(()=>document.querySelector('#camaraResultado').textContent.includes('perro'),null,{timeout:45000});
 assert.equal(await p.evaluate(()=>window.__inicioSilencioso),true);
 await p.waitForFunction(()=>document.getElementById('camaraAudio').textContent.includes('instala una voz'),null,{timeout:10000});
 assert.equal(await p.evaluate(()=>window.__dichos.some(t=>t.includes('perro'))),false);
 await p.evaluate(()=>window.__vocesListas=true);
 await p.waitForFunction(()=>window.__dichos.some(t=>t.includes('perro')),null,{timeout:8000});
 assert.equal(await p.locator('#camaraAudio').textContent(),'');
 assert(await p.locator('#camaraSueloEstado').isHidden());
 assert(await p.locator('#camaraHoyosEstado').isHidden());
 assert.match(await p.locator('#camaraEstado').getAttribute('class'),/\boculto\b/);
 console.log('Toque inicial habilita la voz; la descripción se reintenta cuando aparecen las voces locales.');
 assert.equal(await p.evaluate(()=>acc.voz),false);
 console.log('Detector real con narración automática y voz general apagada:',await p.locator('#camaraResultado').innerText());
 async function verificarVista() {
  assert(await p.locator('#pestanas').isHidden());
  const medidas=await p.evaluate(()=>{const v=document.getElementById('camaraVideo').getBoundingClientRect(), b=document.getElementById('camaraDetener').getBoundingClientRect();return {video:v.height,ancho:v.width,borde:b.bottom,w:innerWidth,h:innerHeight};});
  assert(medidas.video>medidas.h/2 && medidas.ancho===medidas.w && medidas.borde<=medidas.h,JSON.stringify(medidas));
 }
 await verificarVista();
 await p.screenshot({path:'/private/tmp/grieta-80-camara-390.png'});
 assert.equal(await p.evaluate(()=>window.__peticion.audio),false);
 await p.evaluate(()=>{const c=window.__escena;const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,c.width,c.height);x.fillStyle='black';x.font='bold 64px Arial';x.fillText('QROBUS',60,150);x.fillText('AVENIDA PLATON',60,280);x.fillText('CANTORES',60,410);});
 await p.waitForTimeout(500);await p.locator('#camaraLeer').click();
 await p.waitForFunction(()=>document.querySelector('#camaraResultado').textContent.includes('PLATON'),null,{timeout:45000});
 console.log('OCR real:',await p.locator('#camaraResultado').innerText());
 await p.locator('#atras').click();assert.deepEqual(await p.evaluate(()=>window.__pistas.map(t=>t.readyState)),['ended']);
 assert(await p.locator('#pestanas').isVisible());
 console.log('Pistas cerradas al salir');
 await p.locator('[data-tab="inicio"]').click();await p.locator('#vozCamara').click();await p.evaluate(()=>window.__denegar=true);await p.locator('#camaraIniciar').click();
 await p.waitForFunction(()=>document.querySelector('#camaraEstado').textContent.startsWith('No diste permiso'),null,{timeout:90000});console.log('Permiso denegado: recuperable');
 await p.evaluate(()=>window.__denegar=false);await p.setViewportSize({width:320,height:844});await p.evaluate(()=>{acc.grande=true;acc.tema='claro';aplicarAcc();});await ctx.setOffline(true);await p.locator('#camaraIniciar').click();
 await p.waitForFunction(()=>document.querySelector('#camaraEstado').textContent.match(/^(Cámara encendida|No pude|No encontré)/),null,{timeout:90000});console.log('Modelo y OCR arrancan sin red desde caché');await verificarVista();await p.screenshot({path:'/private/tmp/grieta-80-camara-320.png'});
 await p.locator('#camaraDetener').click();assert.deepEqual(await p.evaluate(()=>window.__pistas.map(t=>t.readyState)),['ended']);
 await ctx.setOffline(false);
 await p.setViewportSize({width:320,height:844});await p.screenshot({path:require('node:path').join(require('node:os').tmpdir(),'grieta-vision-320.png')});
 assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await p.locator('#camaraIniciar').click();await p.locator('#camaraDetener').click();await p.waitForTimeout(500);
 assert.equal(await p.evaluate(()=>document.querySelector('#camaraVideo').srcObject),null);console.log('Cancelar preparación: no abre cámara después');
 await p.evaluate(()=>window.__retenerPermiso=true);await p.locator('#camaraIniciar').click();
 await p.waitForFunction(()=>typeof window.__continuarPermiso==='function',null,{timeout:90000});
 await p.locator('#atras').click();await p.evaluate(()=>{window.__retenerPermiso=false;window.__continuarPermiso();});await p.waitForTimeout(300);
 assert.deepEqual(await p.evaluate(()=>window.__pistas.map(t=>t.readyState)),['ended']);console.log('Permiso resuelto después de salir: pistas cerradas');
 await p.locator('[data-tab="ajustes"]').click();
 await p.locator('#optTema [data-v="claro"]').click();await p.locator('#optGrande').check();
 await p.locator('[data-tab="inicio"]').click();await p.locator('#vozCamara').click();
 assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await p.screenshot({path:require('node:path').join(require('node:os').tmpdir(),'grieta-vision-claro-320.png')});
 await p.locator('#camaraIniciar').click();await p.waitForFunction(()=>document.querySelector('#camaraEstado').textContent.startsWith('Cámara encendida'),null,{timeout:90000});
 await p.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
 assert.deepEqual(await p.evaluate(()=>window.__pistas.map(t=>t.readyState)),['ended']);console.log('Ocultar la app: pistas cerradas');
 await p.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});navigator.mediaDevices.getUserMedia=undefined;});
 await p.locator('#camaraIniciar').click();assert.match(await p.locator('#camaraEstado').innerText(),/no admite/);console.log('Navegador sin cámara: explicación accesible');
 console.log('390 y 320 px, claro y letra grande sin desbordamiento; errores JS:',errores);assert.equal(errores.length,0);
 assert(red.every(r=>r.method==='GET'));console.log('Red: solo GET; sin envío de imágenes ni datos de cámara');
 await b.close();
})().catch(e=>{console.error(e);process.exit(1)});
