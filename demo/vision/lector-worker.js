importScripts('vendor/tesseract/tesseract.min.js');
let lector;
self.onmessage = async ({ data }) => {
  try {
    if (data.tipo === 'iniciar') {
      const url = (ruta) => new URL(ruta, self.location).href;
      lector = await Tesseract.createWorker('spa', 1, {
        workerPath: url('vendor/tesseract/worker.min.js'), workerBlobURL: false,
        corePath: url('vendor/tesseract/core'), langPath: url('modelos'), cacheMethod: 'none',
        errorHandler: () => postMessage({ tipo: 'error' }),
      });
      await lector.setParameters({ tessedit_pageseg_mode: '11' });
      postMessage({ tipo: 'listo' });
    } else if (data.tipo === 'leer') {
      const lienzo = new OffscreenCanvas(data.ancho, data.alto);
      lienzo.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(data.pixeles), data.ancho, data.alto), 0, 0);
      const imagen = await lienzo.convertToBlob({ type: 'image/png' });
      const { data: resultado } = await lector.recognize(imagen);
      postMessage({ tipo: 'texto', datos: { text: resultado.text, confidence: resultado.confidence } });
    }
  } catch { postMessage({ tipo: 'error' }); }
};
