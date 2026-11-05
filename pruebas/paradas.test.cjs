const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

async function motor(datos) {
  const c = vm.createContext({fetch:async()=>({json:async()=>datos})});
  vm.runInContext(fs.readFileSync(process.env.GRIETA_MOTOR_PRUEBA ?? path.join(__dirname,'../demo/grieta.js'),'utf8')+';this.motor=Grieta;',c);
  await c.motor.cargar();return c.motor;
}
const plano = v => JSON.parse(JSON.stringify(v));
function catalogo(cantidad = 16) {
  return {
    servicio_por_dia:['laboral','laboral','laboral','laboral','laboral','sabado','domingo'],
    paradas:Array.from({length:cantidad+1},(_,i)=>[0,(i+1)*.0001,`Parada ${i+1}`]),
    patrones:[{linea:'A',hacia:'Terminal',paradas:Array.from({length:cantidad+1},(_,i)=>i),minutos:Array.from({length:cantidad+1},(_,i)=>i),salidas:{laboral:[600,660],sabado:[700],domingo:[800]}}],
  };
}

test('pasanAqui conserva tres candidatas por defecto y admite ocho dentro del radio',async()=>{
  const g=await motor(catalogo());
  assert.equal(g.pasanAqui(0,0,0,500,1000).length,3);
  const lista=g.pasanAqui(0,0,0,500,1000,8);
  assert.equal(lista.length,8);
  assert.deepEqual(plano(lista.map(p=>p.i)),[0,1,2,3,4,5,6,7]);
  assert(lista.every((p,i)=>p.m<=1000&&(!i||p.m>=lista[i-1].m)));
});

test('el límite se acota a doce sin ampliar el radio',async()=>{
  const g=await motor(catalogo());
  assert.equal(g.pasanAqui(0,0,0,500,1000,1000).length,12);
  assert.equal(g.pasanAqui(0,0,0,500,30,8).length,2);
  assert.equal(g.pasanAqui(0,0,0,500,1000,1).length,1);
  assert.equal(g.pasanAqui(0,0,0,500,1000,0).length,0);
});

test('límites inválidos no quitan el máximo ni alteran el valor por defecto',async()=>{
  const g=await motor(catalogo());
  for(const limite of [NaN,Infinity,-1,1.5,'8',null,{}]) {
    assert.equal(g.pasanAqui(0,0,0,500,1000,limite).length,3);
  }
});

test('consulta de horarios no toma salidas de una parada vecina cuando la exacta está sin salidas',async()=>{
  const datos=catalogo(2);
  datos.paradas=[[0,0,'Parada A'],[0,.000004,'Parada B'],[0,.01,'Terminal']];
  datos.patrones[0].paradas=[1,2];datos.patrones[0].minutos=[0,5];
  const g=await motor(datos);
  assert.equal(g.pasanAqui(0,0,0,500,1)[0].i,1);
  assert.deepEqual(plano(g.horariosParada(0,0,0,500)),[]);
  assert.equal(g.horariosParada(0,.000004,0,500)[0].linea,'A');
});

test('horarios por índice distinguen paradas con coordenadas idénticas',async()=>{
  const datos=catalogo(2);
  datos.paradas=[[0,0,'Parada A'],[0,0,'Parada B'],[0,.01,'Terminal']];
  datos.patrones[0].paradas=[1,2];datos.patrones[0].minutos=[0,5];
  const g=await motor(datos);
  assert.deepEqual(plano(g.horariosParadaPorIndice(0,0,500)),[]);
  assert.equal(g.horariosParadaPorIndice(1,0,500)[0].linea,'A');
  for(const i of [-1,3,NaN,'1'])assert.deepEqual(plano(g.horariosParadaPorIndice(i,0,500)),[]);
});

test('consulta por índice conserva horarios de madrugada y cambio de día',async()=>{
  const datos=catalogo(1);datos.patrones[0].salidas={laboral:[600,1450],sabado:[700],domingo:[800]};
  const g=await motor(datos);
  assert.equal(g.horariosParadaPorIndice(0,1,5)[0].horas[0],10);
  assert.equal(g.horariosParadaPorIndice(0,4,1440+650)[0].horas[0],2140);
  assert.equal(g.horariosParadaPorIndice(0,0,-1440+790)[0].horas[0],-640);
});

test('pasanAqui conserva el filtro por salidas y no inventa servicio para terminales',async()=>{
  const datos=catalogo(4);const g=await motor(datos);
  assert.equal(g.pasanAqui(0,0,0,500,1000,12).length,4);
  assert.deepEqual(plano(g.pasanAqui(0,0,0,800,1000,12)),[]);
  assert.deepEqual(plano(g.horariosParadaPorIndice(4,0,500)),[]);
});

test('candidatas físicas incluyen paradas sin salidas y describen solo distancia geométrica',async()=>{
  const datos=catalogo(4);datos.patrones[0].paradas=[2,3,4];datos.patrones[0].minutos=[0,1,2];
  const g=await motor(datos);
  const lista=g.paradasCercanas(0,0,1000,8);
  assert.deepEqual(plano(lista.map(p=>p.i)),[0,1,2,3,4]);
  assert(lista.every(p=>!('lineas' in p)&&!('caminado' in p)&&Number.isFinite(p.m)));
  assert.deepEqual(plano(g.pasanAqui(0,0,0,500,1000,8).map(p=>p.i)),[2,3]);
  assert.equal(g.paradasCercanas(0,0,1000,100).length,5);
});


test('llegada 1430 + 20 usa salida absoluta 1460 por índice y conserva 20 en API antigua',async()=>{
  const datos=catalogo(1);datos.patrones[0].salidas={laboral:[20],sabado:[20],domingo:[20]};
  const g=await motor(datos);
  for(const [dia,llegada,esperada] of [[4,1430+20,1460],[4,2880+10,2900],[6,1440+10,1460],[0,-1440+10,-1420],[0,10,20]]) {
    const porIndice=g.horariosParadaPorIndice(0,dia,llegada);
    const porCoordenadas=g.horariosParada(0,.0001,dia,llegada);
    const porRadio=g.pasanAqui(0,0,dia,llegada,1000,8)[0].lineas;
    assert.equal(porCoordenadas[0].horas[0],esperada-Math.floor(llegada/1440)*1440);
    for(const lista of [porIndice,porRadio]) {
      assert.equal(lista[0].horas[0],esperada);
      assert.equal(lista[0].horas[0]-llegada,10);
    }
  }
});

test('viaje GTFS posterior a 24:00 conserva el eje temporal al consultar el día siguiente',async()=>{
  const datos=catalogo(1);datos.patrones[0].salidas={laboral:[1460],sabado:[40],domingo:[]};
  const g=await motor(datos);
  assert.deepEqual(plano(g.horariosParadaPorIndice(0,4,1450)[0].horas),[1460,1480]);
  assert.deepEqual(plano(g.horariosParada(0,.0001,4,1450)[0].horas),[20,40]);
});
