import os
os.environ['TF_NUM_INTRAOP_THREADS']='2'
os.environ['TF_NUM_INTEROP_THREADS']='1'
import argparse, hashlib, json
from pathlib import Path
import tensorflow as tf
import onnxruntime as ort
import numpy as np
from PIL import Image

ap=argparse.ArgumentParser(description='Compara HF original, copia analítica, Focus fusionado y TFLite.')
ap.add_argument('--datos',type=Path,required=True,help='Carpeta externa con muestra/')
ap.add_argument('--original',type=Path,required=True,help='ONNX descargado, SHA LFS 9d55…')
ap.add_argument('--analitico',type=Path,help='Copia local procesada 24cf…; opcional')
ap.add_argument('--fusionado',type=Path,required=True,help='ONNX Focus fusionado/simplificado')
ap.add_argument('--tflite',type=Path,required=True)
ap.add_argument('--reporte',type=Path,required=True)
a=ap.parse_args()
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert sha(a.original)=='9d55b8cc134f034b1885bd97aded14dcb17d887b8d5b7fbb3940e820d24c7660'
archivos={'original_hf':a.original,'fusionado':a.fusionado,'tflite':a.tflite}
if a.analitico:archivos['analitico_preexistente']=a.analitico
sesiones={n:ort.InferenceSession(str(p),providers=['CPUExecutionProvider']) for n,p in archivos.items() if n!='tflite'}
t=tf.lite.Interpreter(model_path=str(a.tflite),num_threads=2);t.allocate_tensors();filas=[]
for n in [1,4,17]:
 im=Image.open(a.datos/f'muestra/img-{n}.jpg').convert('RGB');w,h=im.size;s=min(640/w,640/h)
 c=np.full((640,640,3),114,dtype=np.float32)
 c[:int(h*s),:int(w*s)]=np.array(im.resize((int(w*s),int(h*s)),Image.Resampling.BILINEAR))
 entrada=c[:,:,::-1].transpose(2,0,1)[None]
 salidas={k:v.run(None,{v.get_inputs()[0].name:entrada})[0].reshape(-1) for k,v in sesiones.items()}
 t.set_tensor(t.get_input_details()[0]['index'],c[None]);t.invoke();z=t.get_tensor(t.get_output_details()[0]['index']).reshape(-1)
 x=salidas['original_hf'];d=np.abs(x-z)
 assert z.shape==(50400,) and np.isfinite(z).all()
 fila=dict(imagen=f'img-{n}.jpg',hf_fusionado_max=float(np.max(abs(x-salidas['fusionado']))),tflite_max=float(d.max()),tflite_media=float(d.mean()),tflite_p99=float(np.quantile(d,.99)),campos_max=np.max(d.reshape(8400,6),axis=0).tolist(),finito=True,salida=list(z.shape))
 if a.analitico:fila['hf_analitico_max']=float(np.max(abs(x-salidas['analitico_preexistente'])))
 filas.append(fila)
r={'referencia':'Descarga HF fijada; no se atribuye el hash analítico al original','archivos':{n:{'sha256':sha(p),'bytes':p.stat().st_size} for n,p in archivos.items()},'filas':filas}
a.reporte.write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(filas))
