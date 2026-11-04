import io,urllib.request,zipfile,json,pathlib,argparse
URL='https://s3.amazonaws.com/images.cocodataset.org/annotations/annotations_trainval2017.zip'
class Remoto(io.RawIOBase):
 def __init__(self):
  self.pos=0
  with urllib.request.urlopen(urllib.request.Request(URL,method='HEAD'),timeout=40) as r:self.size=int(r.headers['Content-Length'])
 def seekable(self):return True
 def readable(self):return True
 def tell(self):return self.pos
 def seek(self,o,w=0):self.pos=o if w==0 else self.pos+o if w==1 else self.size+o;return self.pos
 def read(self,n=-1):
  if n<0:n=self.size-self.pos
  if not n:return b''
  req=urllib.request.Request(URL,headers={'Range':f'bytes={self.pos}-{self.pos+n-1}'})
  with urllib.request.urlopen(req,timeout=60) as r:
   if r.status!=206:raise RuntimeError('El servidor no admite lectura parcial')
   data=r.read(n)
  self.pos+=len(data);return data
parser=argparse.ArgumentParser(description='Descarga parcial de anotaciones COCO y una muestra de validación para visión.')
parser.add_argument('--destino',required=True,type=pathlib.Path)
base=parser.parse_args().destino
base.mkdir(parents=True,exist_ok=True)
f=base/'instances_val2017.json'
if not f.exists():
 with zipfile.ZipFile(Remoto()) as z:f.write_bytes(z.read('annotations/instances_val2017.json'))
a=json.loads(f.read_text());cats={c['id']:c['name'] for c in a['categories']};street={1,2,3,4,6,8,10,11,13,14};ids=[]
for i in a['images']:
 labels=[x for x in a['annotations'] if x['image_id']==i['id'] and x['category_id'] in street and not x.get('iscrowd')]
 if len(labels)>=5:ids.append((i,labels))
 if len(ids)==16:break
elegidos={i['id'] for i,_ in ids}
porimagen={}
for an in a['annotations']:
 if an['category_id'] in street and not an.get('iscrowd'):porimagen.setdefault(an['image_id'],[]).append(an)
for categoria in [2,3,4,6,8,10,11,13,14]:
 agregados=0
 for i in a['images']:
  if i['id'] in elegidos:continue
  anns=porimagen.get(i['id'],[])
  if any(x['category_id']==categoria and x['area']>=1024 for x in anns):
   ids.append((i,anns));elegidos.add(i['id']);agregados+=1
  if agregados==2:break
muestra=[]
for i,anns in ids:
 nombre=pathlib.Path(i['file_name']).name
 if nombre!=i['file_name']:raise RuntimeError('Nombre de imagen no válido')
 out=base/nombre
 if not out.exists():
  with urllib.request.urlopen(f'https://s3.amazonaws.com/images.cocodataset.org/val2017/{nombre}',timeout=40) as r:out.write_bytes(r.read())
 muestra.append({**i,'annotations':[dict(x,clase=cats[x['category_id']]) for x in anns]})
(base/'muestra.json').write_text(json.dumps(muestra))
print('Muestra de validación oficial COCO:',len(muestra),'imágenes;',sum(len(i['annotations']) for i in muestra),'objetos de clases de calle')
