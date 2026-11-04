const {chromium}=require('playwright');const assert=require('node:assert/strict');
(async()=>{const b=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE});try{
 const c=await b.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
 await c.addInitScript(()=>{
  localStorage.setItem('grieta-bienvenida','true');localStorage.setItem('grieta-acc',JSON.stringify({voz:true,tema:'oscuro'}));
  window.__modoSuelo='tarde';window.__voz=[];window.__vibraciones=[];window.__permisos=0;
  window.SpeechSynthesisUtterance=function(text){this.text=text;};
  Object.defineProperty(window,'speechSynthesis',{value:{speaking:false,getVoices:()=>[{lang:'es-MX',localService:true}],cancel:()=>{},speak:m=>{window.__voz.push(m.text);m.onend?.();}}});
  Object.defineProperty(navigator,'vibrate',{value:p=>{window.__vibraciones.push(p);return true;}});
  navigator.mediaDevices.getUserMedia=async()=>{window.__permisos++;const v=document.createElement('canvas');v.width=640;v.height=480;const x=v.getContext('2d');for(let j=0;j<24;j++)for(let i=0;i<32;i++){x.fillStyle=(i+j)%2?'#444':'#ccc';x.fillRect(i*20,j*20,20,20);}const s=v.captureStream(10);window.__pistas=s.getTracks();return s;};
  window.Worker=class{
   constructor(url){this.suelo=url.includes('escalones-worker');this.vivo=true;}
   terminate(){this.vivo=false;}
   postMessage(d){
    let r={tipo:'listo'},t=10;
    if(d.tipo==='iniciar'&&this.suelo&&window.__modoSuelo==='init-error')r={tipo:'error'};
    if(d.tipo==='detectar'){
     if(this.suelo){r={tipo:'suelo',ms:10,regiones:[{tipo:'escaleras',lado:'centro',confianza:.95,area:.2,caja:{x:.2,y:.2,w:.5,h:.5}}]};
      if(window.__modoSuelo==='error')r={tipo:'error'};
      if(window.__modoSuelo==='tarde')t=2400;
      if(window.__modoSuelo==='retener'){d.imagen?.close();window.__entregar=()=>this.onmessage?.({data:r});return;}
     }else {r={tipo:'objetos',ancho:d.ancho,alto:d.alto,detecciones:[],ms:10};if(window.__objetoTarde)t=1400;}
    }
    d.imagen?.close();setTimeout(()=>{if(this.vivo)this.onmessage?.({data:r});},t);
   }
  };
 });
 await c.route('**/vision/activos.json*',r=>r.fulfill({json:[]}));const p=await c.newPage(),errores=[];p.on('pageerror',e=>errores.push(e.message));
 await p.goto(process.env.GRIETA_URL??'http://127.0.0.1:8812');await p.locator('#abrirCamara').click();await p.locator('#camaraEscalones').check();await p.locator('#camaraIniciar').click();
 await p.waitForFunction(()=>document.querySelector('#camaraSueloEstado').textContent.includes('está tardando'),null,{timeout:7000});
 assert.equal(await p.locator('#camaraSueloAlerta').textContent(),'');assert(!await p.evaluate(()=>window.__voz.some(t=>t.startsWith('Posibles escaleras'))));
 await p.locator('#camaraDetener').click();await p.evaluate(()=>{window.__modoSuelo='normal';});await p.locator('#camaraIniciar').click();
 await p.waitForFunction(()=>document.querySelector('#camaraSueloAlerta').textContent.includes('Posibles escaleras'));
 await p.evaluate(()=>{window.__objetoTarde=true;});
 await p.waitForFunction(()=>document.querySelector('#camaraResultado').textContent.includes('Actualizando la descripción'));
 assert.match(await p.locator('#camaraSueloAlerta').textContent(),/Posibles escaleras/);assert.equal(await p.locator('#camaraRepetir').isDisabled(),false);
 await p.evaluate(()=>{window.__objetoTarde=false;});
 console.log('El retraso del detector de objetos conserva el aviso reciente e independiente de escaleras');
 await p.evaluate(()=>{const v=document.getElementById('camaraVideo');const t=v.currentTime;Object.defineProperty(v,'currentTime',{configurable:true,get:()=>t});});
 await p.waitForFunction(()=>document.querySelector('#camaraSueloEstado').textContent.includes('espero una imagen nueva'),null,{timeout:5000});
 assert.equal(await p.locator('#camaraSueloAlerta').textContent(),'');assert.equal(await p.locator('#camaraRepetir').isDisabled(),true);
 await p.evaluate(()=>{delete document.getElementById('camaraVideo').currentTime;});await p.locator('#camaraDetener').click();
 console.log('Retraso >2 s y video congelado: no avisa con imágenes viejas ni conserva la advertencia en Repetir');
 await p.evaluate(()=>{window.__modoSuelo='error';});await p.locator('#camaraIniciar').click();
 await p.waitForFunction(()=>document.querySelector('#camaraSueloEstado').textContent.includes('Se detuvieron los avisos'));
 assert(await p.locator('#camaraVideo').isVisible());assert.equal(await p.evaluate(()=>GrietaEscalones.activo),false);
 assert.match(await p.locator('#camaraEstado').textContent(),/^Cámara encendida/);await p.locator('#camaraDetener').click();
 console.log('Fallo del modelo durante uso: estado explícito y los otros motores continúan');
 await p.evaluate(()=>{window.__modoSuelo='init-error';window.__permisos=0;});await p.locator('#camaraIniciar').click();
 await p.waitForFunction(()=>document.querySelector('#camaraEstado').textContent.includes('No pude preparar los avisos'));
 assert.equal(await p.evaluate(()=>window.__permisos),0);assert(await p.locator('#camaraIniciar').isVisible());
 console.log('Modelo no preparado: no abre cámara y explica cómo reintentar o desactivar los avisos');
 await p.evaluate(()=>{window.__modoSuelo='retener';});await p.locator('#camaraIniciar').click();
 await p.waitForFunction(()=>typeof window.__entregar==='function');const anteriores=await p.evaluate(()=>window.__voz.filter(t=>t.startsWith('Posibles escaleras')).length);
 await p.locator('[data-tab="inicio"]').click();await p.evaluate(()=>window.__entregar());await p.waitForTimeout(100);
 assert.equal(await p.locator('#camaraSueloAlerta').textContent(),'');assert.deepEqual(await p.evaluate(()=>window.__pistas.map(t=>t.readyState)),['ended']);
 assert.equal(await p.evaluate(()=>window.__voz.filter(t=>t.startsWith('Posibles escaleras')).length),anteriores);assert.deepEqual(errores,[]);
 console.log('Respuesta después de salir descartada; pistas cerradas y cero errores JS');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
