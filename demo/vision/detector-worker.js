self.exports = {};
importScripts('vendor/mediapipe/vision_bundle.js');
let detector;
self.onmessage = async ({ data }) => {
  try {
    if (data.tipo === 'iniciar') {
      const archivos = await exports.FilesetResolver.forVisionTasks(new URL('vendor/mediapipe/wasm', self.location).href);
      detector = await exports.ObjectDetector.createFromOptions(archivos, {
        baseOptions: { modelAssetPath: new URL('modelos/efficientdet_lite0.tflite', self.location).href, delegate: 'CPU' },
        runningMode: 'IMAGE', scoreThreshold: 0.6, maxResults: 8,
      });
      postMessage({ tipo: 'listo' });
    } else if (data.tipo === 'detectar') {
      const imagen = new ImageData(new Uint8ClampedArray(data.pixeles), data.ancho, data.alto);
      postMessage({ tipo: 'objetos', detecciones: detector.detect(imagen).detections, ancho: data.ancho });
    }
  } catch { postMessage({ tipo: 'error' }); }
};
