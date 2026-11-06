self.exports = {};
importScripts('vendor/mediapipe/vision_bundle.js');
const ETIQUETAS = ['person','bicycle','car','motorcycle','airplane','bus','train','truck','boat','traffic light','fire hydrant','stop sign','parking meter','bench','bird','cat','dog','horse','sheep','cow','elephant','bear','zebra','giraffe','backpack','umbrella','handbag','tie','suitcase','frisbee','skis','snowboard','sports ball','kite','baseball bat','baseball glove','skateboard','surfboard','tennis racket','bottle','wine glass','cup','fork','knife','spoon','bowl','banana','apple','sandwich','orange','broccoli','carrot','hot dog','pizza','donut','cake','chair','couch','potted plant','bed','dining table','toilet','tv','laptop','mouse','remote','keyboard','cell phone','microwave','oven','toaster','sink','refrigerator','book','clock','vase','scissors','teddy bear','hair drier','toothbrush'];
const ENTRADA = 512, CAMPOS = 85;
const rejilla = [8, 16, 32].flatMap((paso) => { const n = ENTRADA / paso; return Array.from({ length: n * n }, (_, i) => ({ x: i % n, y: Math.floor(i / n), paso })); });
let detector, yolox, lienzo, entrada, contextoEntrada;
// Salida cruda de YOLOX: centro, tamaño logarítmico, objeto y 80 clases; se devuelve con la forma de MediaPipe.
function decodificar(v, ancho, alto, escala) {
  const cajas = [];
  for (let f = 0; f < rejilla.length; f++) {
    const o = f * CAMPOS, objeto = v[o + 4];
    if (!(objeto >= 0.4)) continue;
    let clase = 0, mejor = 0;
    for (let c = 0; c < 80; c++) if (v[o + 5 + c] > mejor) { mejor = v[o + 5 + c]; clase = c; }
    const score = objeto * mejor;
    if (!(score >= 0.4)) continue;
    const { x, y, paso } = rejilla[f];
    const cx = (v[o] + x) * paso / escala, cy = (v[o + 1] + y) * paso / escala;
    const w = Math.exp(v[o + 2]) * paso / escala, h = Math.exp(v[o + 3]) * paso / escala;
    if (![cx, cy, w, h].every(Number.isFinite) || cx < 0 || cy < 0 || cx > ancho || cy > alto) continue;
    const x0 = Math.max(0, cx - w / 2), y0 = Math.max(0, cy - h / 2);
    cajas.push({ clase, score, x0, y0, x1: Math.min(ancho, cx + w / 2), y1: Math.min(alto, cy + h / 2) });
  }
  cajas.sort((a, b) => b.score - a.score);
  const quedan = [];
  const iou = (a, b) => {
    const i = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
    return i / ((a.x1 - a.x0) * (a.y1 - a.y0) + (b.x1 - b.x0) * (b.y1 - b.y0) - i);
  };
  for (const c of cajas) {
    if (quedan.length === 30) break;
    if (!quedan.some((q) => q.clase === c.clase && iou(q, c) > 0.45)) quedan.push(c);
  }
  return quedan.map((c) => ({ categories: [{ categoryName: ETIQUETAS[c.clase], score: c.score, index: c.clase }], boundingBox: { originX: c.x0, originY: c.y0, width: c.x1 - c.x0, height: c.y1 - c.y0 } }));
}
function detectarYolox(imagen, ancho, alto) {
  entrada ??= new OffscreenCanvas(ENTRADA, ENTRADA);
  contextoEntrada ??= entrada.getContext('2d', { willReadFrequently: true });
  const escala = Math.min(ENTRADA / ancho, ENTRADA / alto);
  contextoEntrada.fillStyle = '#727272'; contextoEntrada.fillRect(0, 0, ENTRADA, ENTRADA);
  if (imagen instanceof ImageData) {
    lienzo ??= new OffscreenCanvas(ancho, alto);
    if (lienzo.width !== ancho || lienzo.height !== alto) { lienzo.width = ancho; lienzo.height = alto; }
    lienzo.getContext('2d').putImageData(imagen, 0, 0);
    imagen = lienzo;
  }
  contextoEntrada.drawImage(imagen, 0, 0, ancho * escala, alto * escala);
  const vector = yolox.embed(entrada).embeddings?.[0]?.floatEmbedding;
  if (vector?.length !== rejilla.length * CAMPOS) throw Error('salida');
  return decodificar(vector, ancho, alto, escala);
}
self.onmessage = async ({ data }) => {
  try {
    if (data.tipo === 'iniciar') {
      const archivos = await exports.FilesetResolver.forVisionTasks(new URL('vendor/mediapipe/wasm', self.location).href);
      if (data.modelo === 'ligero') {
        detector = await exports.ObjectDetector.createFromOptions(archivos, {
          baseOptions: { modelAssetPath: new URL('modelos/efficientdet_lite0.tflite', self.location).href, delegate: 'CPU' },
          runningMode: 'IMAGE', scoreThreshold: 0.4, maxResults: 30,
        });
      } else {
        yolox = await exports.ImageEmbedder.createFromOptions(archivos, {
          baseOptions: { modelAssetPath: new URL('modelos/objetos-v1.tflite', self.location).href, delegate: 'CPU' },
          runningMode: 'IMAGE', l2Normalize: false, quantize: false,
        });
      }
      postMessage({ tipo: 'listo' });
    } else if (data.tipo === 'detectar') {
      const imagen = data.imagen ?? new ImageData(new Uint8ClampedArray(data.pixeles), data.ancho, data.alto);
      const inicio = performance.now();
      let detecciones;
      try {
        if (yolox) detecciones = detectarYolox(imagen, data.ancho, data.alto);
        else try { detecciones = detector.detect(imagen).detections; }
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
