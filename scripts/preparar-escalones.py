from pathlib import Path
import io,zipfile,hashlib,argparse
import numpy as np
import tensorflow as tf
# Esquemas puros de tflite-support 0.4.4 en PYTHONPATH.
import schema_py_generated as s
import metadata_schema_py_generated as m
ap=argparse.ArgumentParser(description='Exporta el modelo oficial con las salidas de escaleras y escalón.')
ap.add_argument('--grafo',type=Path,required=True);ap.add_argument('--salida',type=Path,required=True)
args=ap.parse_args()
tf.compat.v1.disable_eager_execution()
gd=tf.compat.v1.GraphDef();gd.ParseFromString(args.grafo.read_bytes())
with tf.Graph().as_default() as g:
 tf.import_graph_def(gd,name='')
 entrada=g.get_tensor_by_name('MobilenetV2/MobilenetV2/input:0')
 logits=g.get_tensor_by_name('logits/semantic/BiasAdd:0')
 assert logits.shape[-1]==151
 probs=tf.nn.softmax(logits,axis=-1)
 escaleras=probs[:,:,:,54]+probs[:,:,:,60]
 escalon=probs[:,:,:,122]
 otro=1.0-escaleras-escalon
 salida=tf.stack([otro,escaleras,escalon],axis=-1,name='probabilidades_suelo')
 with tf.compat.v1.Session(graph=g,config=tf.compat.v1.ConfigProto(intra_op_parallelism_threads=1,inter_op_parallelism_threads=1)) as sesion:
  converter=tf.compat.v1.lite.TFLiteConverter.from_session(sesion,[entrada],[salida])
  converter.optimizations=[]
  modelo=converter.convert()
print('Convertido',len(modelo),flush=True)
inter=tf.lite.Interpreter(model_content=modelo,num_threads=1);inter.allocate_tensors();print('IO',inter.get_input_details()[0]['shape'],inter.get_output_details()[0]['shape'],flush=True)
meta=m.ModelMetadataT();meta.name='Escaleras y escalon: DeepLabV3+ MobileNetV2 ADE20K';meta.description='Derivado del modelo oficial TensorFlow 2018-12-03. Pesos sin reentrenar. Agrupa ADE20K 54 y 60 como escaleras, 122 como escalon y el resto como otro. Solo indicios visuales, no distancia ni seguridad.';meta.version='1';meta.author='TensorFlow Authors; conversion de Grieta';meta.license='Apache License 2.0'
entradaMeta=m.TensorMetadataT();entradaMeta.name='imagen';entradaMeta.content=m.ContentT();entradaMeta.content.contentPropertiesType=m.ContentProperties.ImageProperties;entradaMeta.content.contentProperties=m.ImagePropertiesT();entradaMeta.content.contentProperties.colorSpace=m.ColorSpaceType.RGB
proceso=m.ProcessUnitT();proceso.optionsType=m.ProcessUnitOptions.NormalizationOptions;proceso.options=m.NormalizationOptionsT();proceso.options.mean=[127.5];proceso.options.std=[127.5];entradaMeta.processUnits=[proceso]
salidaMeta=m.TensorMetadataT();salidaMeta.name='probabilidades';salidaMeta.content=m.ContentT();salidaMeta.content.contentPropertiesType=m.ContentProperties.FeatureProperties;salidaMeta.content.contentProperties=m.FeaturePropertiesT();salidaMeta.stats=m.StatsT();salidaMeta.stats.min=[0.0];salidaMeta.stats.max=[1.0]
archivo=m.AssociatedFileT();archivo.name='categorias-suelo.txt';archivo.type=m.AssociatedFileType.TENSOR_AXIS_LABELS;salidaMeta.associatedFiles=[archivo]
sg=m.SubGraphMetadataT();sg.inputTensorMetadata=[entradaMeta];sg.outputTensorMetadata=[salidaMeta];meta.subgraphMetadata=[sg]
import flatbuffers
b=flatbuffers.Builder(0);b.Finish(meta.Pack(b),file_identifier=b'M001');metaBytes=bytes(b.Output())
modeloObjeto=s.ModelT.InitFromObj(s.Model.GetRootAsModel(modelo,0));buffer=s.BufferT();buffer.data=np.frombuffer(metaBytes,dtype=np.uint8);modeloObjeto.buffers.append(buffer);md=s.MetadataT();md.name='TFLITE_METADATA';md.buffer=len(modeloObjeto.buffers)-1;modeloObjeto.metadata=(modeloObjeto.metadata or [])+[md]
b=flatbuffers.Builder(0);b.Finish(modeloObjeto.Pack(b),file_identifier=b'TFL3');resultado=io.BytesIO(bytes(b.Output()))
with zipfile.ZipFile(resultado,'a',zipfile.ZIP_STORED) as z:z.writestr(zipfile.ZipInfo('categorias-suelo.txt',(1980,1,1,0,0,0)),'otro\nescaleras\nescalon\n')
args.salida.parent.mkdir(parents=True,exist_ok=True);args.salida.write_bytes(resultado.getvalue());print('Final',len(resultado.getvalue()),hashlib.sha256(resultado.getvalue()).hexdigest(),flush=True)
