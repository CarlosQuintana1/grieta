const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const carpeta = process.env.COCO_MUESTRA;
  if (!carpeta) throw Error('Indica COCO_MUESTRA con muestra.json e imágenes oficiales de validación.');
  const muestra = JSON.parse(fs.readFileSync(path.join(carpeta, 'muestra.json'))).map((i) => ({ ...i, imagen: fs.readFileSync(path.join(carpeta, i.file_name)).toString('base64') }));
  const navegador = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE, headless: true });
  try {
    const pagina = await navegador.newPage();
    await pagina.goto((process.env.GRIETA_URL ?? 'http://127.0.0.1:8791') + '/vision/activos.json');
    const resultados = await pagina.evaluate(async (muestra) => {
      const resultados = [];
      const clases = new Set(['person', 'bicycle', 'car', 'motorcycle', 'bus', 'truck', 'traffic light', 'fire hydrant', 'stop sign', 'parking meter']);
      const iou = (a, b) => {
        const area = Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]));
        return area / (a[2] * a[3] + b[2] * b[3] - area);
      };
      for (const modelo of ['ligero', 'detalle']) {
        const worker = new Worker('detector-worker.js');
        const pedir = (datos, transferir = []) => new Promise((resolve, reject) => {
          worker.onmessage = ({ data }) => data.tipo === 'error' ? reject(Error('Modelo no disponible')) : resolve(data);
          worker.onerror = reject;
          worker.postMessage(datos, transferir);
        });
        await pedir({ tipo: 'iniciar', modelo });
        let aciertos = 0, predicciones = 0, anotaciones = 0;
        const tiempos = [], casos = [];
        for (const imagen of muestra) {
          const img = new Image(); img.src = 'data:image/jpeg;base64,' + imagen.imagen; await img.decode();
          const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
          const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
          const pixeles = ctx.getImageData(0, 0, c.width, c.height);
          const r = await pedir({ tipo: 'detectar', pixeles: pixeles.data.buffer, ancho: c.width, alto: c.height }, [pixeles.data.buffer]);
          const candidatos = r.detecciones.filter((d) => clases.has(d.categories[0].categoryName) && d.categories[0].score >= .55).sort((a, b) => b.categories[0].score - a.categories[0].score);
          const vistos = new Set();
          for (const d of candidatos) {
            const caja = [d.boundingBox.originX, d.boundingBox.originY, d.boundingBox.width, d.boundingBox.height];
            const mejores = imagen.annotations.map((a, i) => ({ i, a, valor: iou(caja, a.bbox) })).filter((x) => !vistos.has(x.i) && x.a.clase === d.categories[0].categoryName).sort((a, b) => b.valor - a.valor);
            if (mejores[0]?.valor >= .5) vistos.add(mejores[0].i);
          }
          casos.push({ imagen: imagen.id, aciertos: vistos.size, predicciones: candidatos.length, anotaciones: imagen.annotations.length });
          aciertos += vistos.size; predicciones += candidatos.length; anotaciones += imagen.annotations.length; tiempos.push(r.ms);
        }
        tiempos.sort((a, b) => a - b);
        resultados.push({ modelo, aciertos, predicciones, anotaciones, mediana_ms: Math.round(tiempos[Math.floor(tiempos.length / 2)]), casos });
        worker.terminate();
      }
      return resultados;
    }, muestra);
    if (process.env.VISION_RESULTADO) fs.writeFileSync(process.env.VISION_RESULTADO, JSON.stringify(resultados, null, 2) + '\n');
    resultados.forEach(({ casos, ...r }) => console.log(JSON.stringify(r)));
  } finally { await navegador.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
