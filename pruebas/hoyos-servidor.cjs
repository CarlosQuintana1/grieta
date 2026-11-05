const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const raiz = path.resolve(__dirname,'../demo');
async function servidor() {
  const excluidos=[];
  const tipos={'.html':'text/html','.js':'text/javascript','.json':'application/json','.wasm':'application/wasm','.css':'text/css','.png':'image/png'};
  const pedidos=[];
  const s=http.createServer((req,res)=>{
    const pedido={metodo:req.method,ruta:req.url};pedidos.push(pedido);
    if(req.method!=='GET'){res.writeHead(405);return res.end();}
    let nombre=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\//,'')||'index.html';
    const f=path.resolve(raiz,nombre);
    if(!f.startsWith(raiz+path.sep)){res.writeHead(403);return res.end();}
    try {const datos=fs.readFileSync(f);
      pedido.estado=200;res.writeHead(200,{'Content-Type':tipos[path.extname(f)]??'application/octet-stream','Cache-Control':'no-cache'});res.end(datos);}catch(e){pedido.estado=404;pedido.error=e.message;res.writeHead(404);res.end();}
  });
  await new Promise(resolve=>s.listen(0,'127.0.0.1',resolve));
  return {url:`http://127.0.0.1:${s.address().port}`,pedidos,excluidos,cerrar:()=>new Promise(resolve=>s.close(resolve))};
}
module.exports={servidor};
