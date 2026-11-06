from pathlib import Path
import os,sys,hashlib
os.environ['TF_USE_LEGACY_KERAS']='1'
os.environ['TF_NUM_INTRAOP_THREADS']='2'
os.environ['TF_NUM_INTEROP_THREADS']='1'
import tensorflow as tf
import tf_keras as keras
from onnx2tf import convert
import argparse
ap=argparse.ArgumentParser(description='Convierte el YOLOX-s COCO oficial de Megvii; no reentrena pesos.')
ap.add_argument('--onnx',type=Path,required=True)
ap.add_argument('--salida',type=Path,required=True)
ap.add_argument('--trabajo',type=Path,required=True)
ap.add_argument('--esquemas',type=Path,required=True)
ap.add_argument('--calibracion',type=Path,help='Datos de prueba offline de onnx2tf; no se reentrena ni calibra int8')
ap.add_argument('--solo-fusion',action='store_true')
ap.add_argument('--entrada',type=int,default=640,choices=[320,416,512,640])
args=ap.parse_args()
args.onnx=args.onnx.resolve();args.salida=args.salida.resolve();args.esquemas=args.esquemas.resolve()
p=args.trabajo.resolve();p.mkdir(parents=True,exist_ok=True)
import onnx
from onnx import numpy_helper,helper
from onnxsim import simplify
import numpy as np
assert hashlib.sha256(args.onnx.read_bytes()).hexdigest() == 'c5c2d13e59ae883e6af3b45daea64af4833a4951c92d116ec270d9ddbe998063', 'Se requiere yolox_s.onnx de la release 0.1.1rc0'
grafo=onnx.load(str(args.onnx))
primera=next(n for n in grafo.graph.node if n.op_type=='Conv')
foco=next(n for n in grafo.graph.node if n.output[0]==primera.input[0]);assert foco.op_type=='Concat'
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
previos=grafo.graph.node[:list(grafo.graph.node).index(primera)]
quitar=[n for n in previos if n.op_type in ('Constant','Slice','Concat')]
for n in quitar:grafo.graph.node.remove(n)
onnx.checker.check_model(grafo);onnx.save(grafo,str(p/'yolox-fusionado.onnx'))
for d,v in zip(grafo.graph.input[0].type.tensor_type.shape.dim,[1,3,args.entrada,args.entrada]):d.dim_value=v
simple,valido=simplify(grafo,overwrite_input_shapes={grafo.graph.input[0].name:[1,3,args.entrada,args.entrada]});assert valido
onnx.save(simple,str(p/'yolox-simple.onnx'))
print('ONNX simplificado',len(simple.graph.node),'nodos',flush=True)
import json
linaje={'origen':{'sha256':hashlib.sha256(args.onnx.read_bytes()).hexdigest(),'bytes':args.onnx.stat().st_size},'fusionado':{'sha256':hashlib.sha256((p/'yolox-fusionado.onnx').read_bytes()).hexdigest()},'simplificado_preconversion':{'sha256':hashlib.sha256((p/'yolox-simple.onnx').read_bytes()).hexdigest()}}
(p/'linaje-conversion.json').write_text(json.dumps(linaje,indent=2)+'\n')
if args.solo_fusion:sys.exit(0)
import shutil
destino=p/'calibration_image_sample_data_20x128x128x3_float32.npy'
if args.calibracion and args.calibracion.resolve()!=destino:shutil.copyfile(args.calibracion.resolve(),destino)
if not destino.exists():np.save(destino,np.random.default_rng(0).random((20,128,128,3),dtype=np.float32))
os.chdir(p)
modelo=convert(input_onnx_file_path=str(p/'yolox-simple.onnx'),output_folder_path=str(p/'conversion'),disable_model_save=True,not_use_onnxsim=True,non_verbose=True)
print('Modelo convertido',modelo.input_shape,modelo.output_shape,flush=True)
imagen=keras.Input(shape=(args.entrada,args.entrada,3),batch_size=1,dtype='float32',name='imagen_rgb')
salida=modelo(imagen[:,:,:,::-1])
vector=keras.layers.Reshape((sum((args.entrada//k)**2 for k in (8,16,32))*85,),name='cajas_y_confianzas')(salida)
red=keras.Model(imagen,vector)
conversor=tf.lite.TFLiteConverter.from_keras_model(red)
conversor.optimizations=[tf.lite.Optimize.DEFAULT]
conversor.target_spec.supported_types=[tf.float16]
datos=conversor.convert()
sys.path.insert(0,str(args.esquemas))
import schema_py_generated as s
import metadata_schema_py_generated as m
import flatbuffers,numpy as np
meta=m.ModelMetadataT();meta.name='YOLOX-s COCO: salida original sin normalizar';meta.description='Pesos oficiales Megvii YOLOX-s 0.1.1rc0 sin reentrenar. Entrada RGB 0..255 convertida a BGR dentro de la red. Salida YOLOX aplanada, 85 campos por celda (4 caja, objeto, 80 clases COCO); decodificar antes de usar.';meta.version='1';meta.author='YOLOX Megvii; conversion de Grieta';meta.license='Apache License 2.0'
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
linaje['simplificado_posconversion']={'sha256':hashlib.sha256((p/'yolox-simple.onnx').read_bytes()).hexdigest()}
(p/'linaje-conversion.json').write_text(json.dumps(linaje,indent=2)+'\n')
print('Final',len(datos),hashlib.sha256(datos).hexdigest(),flush=True)
