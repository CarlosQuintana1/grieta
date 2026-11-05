self.exports = {};
importScripts('vendor/mediapipe/vision_bundle.js', 'hoyos.js?v=76');
let modelo, ocupado = false;
const lienzo = new OffscreenCanvas(640, 640);
const contexto = lienzo.getContext('2d', { willReadFrequently: true });
self.onmessage = async ({ data }) => {
  try {
    if (ocupado) throw Error('ocupado');
    ocupado = true;
    if (data.tipo === 'iniciar') {
      modelo?.close();
      const archivos = await exports.FilesetResolver.forVisionTasks(new URL('vendor/mediapipe/wasm', self.location).href);
      modelo = await exports.ImageEmbedder.createFromOptions(archivos, {
        baseOptions: { modelAssetPath: new URL('modelos/hoyos-v1.tflite', self.location).href, delegate: 'CPU' },
        runningMode: 'IMAGE', l2Normalize: false, quantize: false,
      });
      postMessage({ tipo: 'listo' });
    } else if (data.tipo === 'detectar') {
      const inicio = performance.now();
      const { ancho, alto } = data;
      if (!modelo || !Number.isSafeInteger(ancho) || !Number.isSafeInteger(alto) ||
          ancho < 1 || alto < 1 || Math.max(ancho, alto) > 768) throw Error('imagen');
      const escala = Math.min(640 / ancho, 640 / alto);
      contexto.fillStyle = '#727272'; contexto.fillRect(0, 0, 640, 640);
      if (data.imagen) {
        if (data.imagen.width !== ancho || data.imagen.height !== alto) throw Error('dimensiones');
        contexto.drawImage(data.imagen, 0, 0, ancho * escala, alto * escala);
      } else {
        if (!(data.pixeles instanceof ArrayBuffer) || data.pixeles.byteLength !== ancho * alto * 4) throw Error('pixeles');
        const origen = new OffscreenCanvas(ancho, alto);
        origen.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(data.pixeles), ancho, alto), 0, 0);
        contexto.drawImage(origen, 0, 0, ancho * escala, alto * escala);
      }
      data.imagen?.close();
      const vector = modelo.embed(lienzo).embeddings?.[0]?.floatEmbedding;
      if (vector?.length !== 50400 || !vector.every(Number.isFinite)) throw Error('salida');
      const regiones = GrietaHoyosPolitica.decodificar(vector, { ancho, alto });
      postMessage({ tipo: 'suelo', regiones, ms: performance.now() - inicio });
    } else throw Error('mensaje');
  } catch { postMessage({ tipo: 'error' }); }
  finally { data.imagen?.close(); ocupado = false; }
};
