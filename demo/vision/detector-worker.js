self.exports = {};
importScripts('vendor/mediapipe/vision_bundle.js');
let detector, lienzo;
self.onmessage = async ({ data }) => {
  try {
    if (data.tipo === 'iniciar') {
      const archivos = await exports.FilesetResolver.forVisionTasks(new URL('vendor/mediapipe/wasm', self.location).href);
      const modelo = data.modelo === 'ligero' ? 'efficientdet_lite0' : 'efficientdet_lite2';
      detector = await exports.ObjectDetector.createFromOptions(archivos, {
        baseOptions: { modelAssetPath: new URL(`modelos/${modelo}.tflite`, self.location).href, delegate: 'CPU' },
        runningMode: 'IMAGE', scoreThreshold: 0.4, maxResults: 30,
      });
      postMessage({ tipo: 'listo' });
    } else if (data.tipo === 'detectar') {
      const imagen = data.imagen ?? new ImageData(new Uint8ClampedArray(data.pixeles), data.ancho, data.alto);
      const inicio = performance.now();
      let detecciones;
      try {
        try { detecciones = detector.detect(imagen).detections; }
        catch (error) {
          if (!data.imagen) throw error;
          lienzo ??= new OffscreenCanvas(data.ancho, data.alto);
          if (lienzo.width !== data.ancho || lienzo.height !== data.alto) { lienzo.width = data.ancho; lienzo.height = data.alto; }
          const contexto = lienzo.getContext('2d', { willReadFrequently: true });
          contexto.drawImage(imagen, 0, 0);
          detecciones = detector.detect(contexto.getImageData(0, 0, data.ancho, data.alto)).detections;
        }
      } finally { data.imagen?.close(); }
      postMessage({ tipo: 'objetos', detecciones, ancho: data.ancho, alto: data.alto, ms: performance.now() - inicio });
    }
  } catch { postMessage({ tipo: 'error' }); }
};
