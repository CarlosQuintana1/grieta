from pathlib import Path
import os,sys,hashlib
os.environ['TF_USE_LEGACY_KERAS']='1'
os.environ['TF_NUM_INTRAOP_THREADS']='2'
os.environ['TF_NUM_INTEROP_THREADS']='1'
import tensorflow as tf
import tf_keras as keras
from onnx2tf import convert
import argparse
ap=argparse.ArgumentParser(description='Convierte el YOLOX-s fijado; no reentrena pesos.')
ap.add_argument('--onnx',type=Path,required=True)
ap.add_argument('--salida',type=Path,required=True)
ap.add_argument('--trabajo',type=Path,required=True)
ap.add_argument('--esquemas',type=Path,required=True)
ap.add_argument('--calibracion',type=Path,help='Datos de prueba offline de onnx2tf; no se reentrena ni calibra int8')
ap.add_argument('--solo-fusion',action='store_true')
args=ap.parse_args()
args.onnx=args.onnx.resolve();args.salida=args.salida.resolve();args.esquemas=args.esquemas.resolve()
p=args.trabajo.resolve();p.mkdir(parents=True,exist_ok=True)
import onnx
from onnx import numpy_helper,helper
from onnxsim import simplify
import numpy as np
assert hashlib.sha256(args.onnx.read_bytes()).hexdigest() == '9d55b8cc134f034b1885bd97aded14dcb17d887b8d5b7fbb3940e820d24c7660', 'Se requiere el ONNX HF original, no una copia procesada'
grafo=onnx.load(str(args.onnx))
primera=next(n for n in grafo.graph.node if n.name=='/backbone/backbone/stem/conv/conv/Conv')
peso=next(t for t in grafo.graph.initializer if t.name==primera.input[1])
w=numpy_helper.to_array(peso);assert w.shape==(32,12,3,3)
fusion=np.zeros((32,3,6,6),dtype=w.dtype)
for grupo,(dy,dx) in enumerate([(0,0),(1,0),(0,1),(1,1)]):
 fusion[:,:,dy::2,dx::2]=w[:,grupo*3:(grupo+1)*3,:,:]
peso.CopyFrom(numpy_helper.from_array(fusion,peso.name))
primera.input[0]=grafo.graph.input[0].name
for atributo in primera.attribute:
 if atributo.name in ('kernel_shape','strides','pads'):
  atributo.CopyFrom(helper.make_attribute(atributo.name,{'kernel_shape':[6,6],'strides':[2,2],'pads':[2,2,2,2]}[atributo.name]))
quitar=[n for n in grafo.graph.node if n.name.startswith('/backbone/backbone/stem/') and n.op_type in ('Constant','Slice','Concat')]
for n in quitar:grafo.graph.node.remove(n)
onnx.checker.check_model(grafo);onnx.save(grafo,str(p/'pothole-fusionado.onnx'))
simple,valido=simplify(grafo);assert valido
onnx.save(simple,str(p/'pothole-simple.onnx'))
print('ONNX simplificado',len(simple.graph.node),'nodos',flush=True)
import json
linaje={'origen':{'sha256':hashlib.sha256(args.onnx.read_bytes()).hexdigest(),'bytes':args.onnx.stat().st_size},'fusionado':{'sha256':hashlib.sha256((p/'pothole-fusionado.onnx').read_bytes()).hexdigest()},'simplificado_preconversion':{'sha256':hashlib.sha256((p/'pothole-simple.onnx').read_bytes()).hexdigest()}}
(p/'linaje-conversion.json').write_text(json.dumps(linaje,indent=2)+'\n')
if args.solo_fusion:sys.exit(0)
if not args.calibracion:ap.error('--calibracion es necesario para conversión offline')
import shutil
calibracion=args.calibracion.resolve()
destino=p/'calibration_image_sample_data_20x128x128x3_float32.npy'
if calibracion!=destino:shutil.copyfile(calibracion,destino)
os.chdir(p)
modelo=convert(input_onnx_file_path=str(p/'pothole-simple.onnx'),output_folder_path=str(p/'conversion'),disable_model_save=True,not_use_onnxsim=True,non_verbose=True)
print('Modelo convertido',modelo.input_shape,modelo.output_shape,flush=True)
imagen=keras.Input(shape=(640,640,3),batch_size=1,dtype='float32',name='imagen_rgb')
salida=modelo(imagen[:,:,:,::-1])
vector=keras.layers.Reshape((50400,),name='cajas_y_confianzas')(salida)
red=keras.Model(imagen,vector)
conversor=tf.lite.TFLiteConverter.from_keras_model(red)
conversor.optimizations=[tf.lite.Optimize.DEFAULT]
conversor.target_spec.supported_types=[tf.float16]
datos=conversor.convert()
sys.path.insert(0,str(args.esquemas))
import schema_py_generated as s
import metadata_schema_py_generated as m
import flatbuffers,numpy as np
meta=m.ModelMetadataT();meta.name='YOLOX-s baches: salida original sin normalizar';meta.description='Pesos AMD-PAVS-AI pothole-detection sin reentrenar. Entrada RGB 0..255 convertida a BGR dentro de la red. Salida YOLOX 8400x6 aplanada, sin L2 ni cuantizacion de la salida; decodificar antes de avisar. No mide profundidad.';meta.version='1';meta.author='AMD-PAVS-AI; YOLOX Megvii; conversion de Grieta';meta.license='Apache License 2.0'
im=m.TensorMetadataT();im.name='imagen';im.content=m.ContentT();im.content.contentPropertiesType=m.ContentProperties.ImageProperties;im.content.contentProperties=m.ImagePropertiesT();im.content.contentProperties.colorSpace=m.ColorSpaceType.RGB
proceso=m.ProcessUnitT();proceso.optionsType=m.ProcessUnitOptions.NormalizationOptions;proceso.options=m.NormalizationOptionsT();proceso.options.mean=[0.0];proceso.options.std=[1.0];im.processUnits=[proceso]
sal=m.TensorMetadataT();sal.name='cajas_y_confianzas';sal.content=m.ContentT();sal.content.contentPropertiesType=m.ContentProperties.FeatureProperties;sal.content.contentProperties=m.FeaturePropertiesT()
sg=m.SubGraphMetadataT();sg.inputTensorMetadata=[im];sg.outputTensorMetadata=[sal];meta.subgraphMetadata=[sg]
b=flatbuffers.Builder(0);b.Finish(meta.Pack(b),file_identifier=b'M001');mb=bytes(b.Output())
obj=s.ModelT.InitFromObj(s.Model.GetRootAsModel(datos,0));buf=s.BufferT();buf.data=np.frombuffer(mb,dtype=np.uint8);obj.buffers.append(buf);md=s.MetadataT();md.name='TFLITE_METADATA';md.buffer=len(obj.buffers)-1;obj.metadata=(obj.metadata or [])+[md]
b=flatbuffers.Builder(0);b.Finish(obj.Pack(b),file_identifier=b'TFL3');datos=bytes(b.Output())
args.salida.parent.mkdir(parents=True,exist_ok=True)
args.salida.write_bytes(datos)
assert hashlib.sha256(args.onnx.read_bytes()).hexdigest()==linaje['origen']['sha256'], 'El original debe permanecer intacto'
linaje['tflite']={'sha256':hashlib.sha256(datos).hexdigest(),'bytes':len(datos)}
linaje['simplificado_posconversion']={'sha256':hashlib.sha256((p/'pothole-simple.onnx').read_bytes()).hexdigest()}
(p/'linaje-conversion.json').write_text(json.dumps(linaje,indent=2)+'\n')
print('Final',len(datos),hashlib.sha256(datos).hexdigest(),flush=True)
