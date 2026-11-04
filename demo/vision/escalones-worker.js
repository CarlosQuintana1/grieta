self.exports = {};
importScripts('vendor/mediapipe/vision_bundle.js', 'desniveles.js?v=74');
let segmentador;
const lienzo = new OffscreenCanvas(513, 513);
const contexto = lienzo.getContext('2d', { willReadFrequently: true });
self.onmessage = async ({ data }) => {
  try {
    if (data.tipo === 'iniciar') {
      const archivos = await exports.FilesetResolver.forVisionTasks(new URL('vendor/mediapipe/wasm', self.location).href);
      segmentador = await exports.ImageSegmenter.createFromOptions(archivos, {
        baseOptions: { modelAssetPath: new URL('modelos/escalones-v1.tflite', self.location).href, delegate: 'CPU' },
        runningMode: 'IMAGE', outputCategoryMask: true, outputConfidenceMasks: true,
      });
      postMessage({ tipo: 'listo' });
    } else if (data.tipo === 'detectar') {
      const inicio = performance.now(), imagen = data.imagen ?? new ImageData(new Uint8ClampedArray(data.pixeles), data.ancho, data.alto);
      const recorte = data.vista === 'suelo' ? { x: .15, y: .35, w: .7, h: .65 } : { x: 0, y: 0, w: 1, h: 1 };
      const sx = recorte.x * data.ancho, sy = recorte.y * data.alto, sw = recorte.w * data.ancho, sh = recorte.h * data.alto;
      const escala = Math.min(513 / sw, 513 / sh);
      const w = Math.round(sw * escala), h = Math.round(sh * escala), x = Math.floor((513 - w) / 2), y = Math.floor((513 - h) / 2);
      contexto.fillStyle = '#7f7f7f'; contexto.fillRect(0, 0, 513, 513);
      try {
        if (data.imagen) contexto.drawImage(imagen, sx, sy, sw, sh, x, y, w, h);
        else {
          const origen = new OffscreenCanvas(data.ancho, data.alto); origen.getContext('2d').putImageData(imagen, 0, 0);
          contexto.drawImage(origen, sx, sy, sw, sh, x, y, w, h);
        }
      } finally { data.imagen?.close(); }
      let resultado;
      segmentador.segment(lienzo, (r) => {
        try {
          if (!r.categoryMask || r.confidenceMasks?.length !== 3) throw Error('categorias');
          const ancho = Math.max(1, Math.round(129 * w / 513)), alto = Math.max(1, Math.round(129 * h / 513));
          const clases = new Uint8Array(ancho * alto), confianzas = new Float32Array(ancho * alto);
          const mask = r.categoryMask, categorias = mask.getAsUint8Array();
          const probabilidades = [null, r.confidenceMasks[1].getAsFloat32Array(), r.confidenceMasks[2].getAsFloat32Array()];
          for (let j = 0; j < alto; j++) for (let i = 0; i < ancho; i++) {
            const px = Math.min(mask.width - 1, Math.floor((x + (i + .5) * w / ancho) / 513 * mask.width));
            const py = Math.min(mask.height - 1, Math.floor((y + (j + .5) * h / alto) / 513 * mask.height));
            const origen = py * mask.width + px, destino = j * ancho + i, clase = categorias[origen];
            if (clase === 1 || clase === 2) {
              const probabilidad = probabilidades[clase][origen];
              if (!Number.isFinite(probabilidad) || probabilidad < 0 || probabilidad > 1.00001) throw Error('confianza');
              clases[destino] = clase; confianzas[destino] = Math.min(1, probabilidad);
            }
          }
          const regiones = GrietaDesniveles.regiones({ clases, confianzas, ancho, alto }).map(r => {
            const caja = { x: recorte.x + r.caja.x / ancho * recorte.w, y: recorte.y + r.caja.y / alto * recorte.h, w: r.caja.w / ancho * recorte.w, h: r.caja.h / alto * recorte.h };
            const centro = caja.x + caja.w / 2;
            return { ...r, area: r.area * recorte.w * recorte.h, lado: centro < .33 ? 'izquierda' : centro > .67 ? 'derecha' : 'centro', caja };
          });
          resultado = { tipo: 'suelo', regiones, ms: performance.now() - inicio };
        } finally { r.categoryMask?.close(); r.confidenceMasks?.forEach((m) => m.close()); }
      });
      postMessage(resultado);
    }
  } catch { postMessage({ tipo: 'error' }); }
};
