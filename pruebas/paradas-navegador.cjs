const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async()=>{
  const navegador=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE});
  try {
    const contexto=await navegador.newContext({serviceWorkers:'block',permissions:[]});
    const url=process.env.GRIETA_URL??'http://127.0.0.1:8816';
    const datos={servicio_por_dia:Array(7).fill('diario'),paradas:Array.from({length:17},(_,i)=>[0,i*.000004,`Parada ${i+1}`]),patrones:[{linea:'A',hacia:'Terminal',paradas:Array.from({length:16},(_,i)=>i+1),minutos:Array.from({length:16},(_,i)=>i),salidas:{diario:[20,600,660]}}]};
    await contexto.route(url+'/prueba-paradas',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Prueba de motor</title><script src="grieta.js"></script>'}));
    await contexto.route('**/datos/qrobus.json',r=>r.fulfill({json:datos}));
    await contexto.route('**/datos/modelo.json',r=>r.fulfill({json:{}}));
    const p=await contexto.newPage(),errores=[],red=[];p.on('pageerror',e=>errores.push(e.message));p.on('request',r=>red.push({metodo:r.method(),url:r.url()}));
    await p.goto(url+'/prueba-paradas');
    const resultado=await p.evaluate(async()=>{
      await Grieta.cargar();
      return {defecto:Grieta.pasanAqui(0,0,0,500,1000).length,ocho:Grieta.pasanAqui(0,0,0,500,1000,8).length,maximo:Grieta.pasanAqui(0,0,0,500,1000,99).length,fisica:Grieta.paradasCercanas(0,0,1000,8)[0].i,horariosExactos:Grieta.horariosParada(0,0,0,500),horariosPorIndice:Grieta.horariosParadaPorIndice(1,0,500),cruceMedianoche:Grieta.horariosParadaPorIndice(1,0,1450),relativasAntiguas:Grieta.horariosParada(0,.000004,0,1450)};
    });
    assert.equal(resultado.defecto,3);assert.equal(resultado.ocho,8);assert.equal(resultado.maximo,12);assert.equal(resultado.fisica,0);assert.deepEqual(resultado.horariosExactos,[]);assert.equal(resultado.horariosPorIndice[0].linea,'A');assert.equal(resultado.cruceMedianoche[0].horas[0],1460);assert.equal(resultado.relativasAntiguas[0].horas[0],20);
    assert.deepEqual(errores,[]);assert(red.every(r=>r.metodo==='GET'&&r.url.startsWith(url+'/')));
    console.log('Motor real en navegador: límites 3/8/12, parada física sin horarios, consulta exacta y medianoche 1460 absoluta/20 antigua relativa, cero errores y solo GET locales.');
  } finally {await navegador.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
