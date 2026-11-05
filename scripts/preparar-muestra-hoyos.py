from pathlib import Path
import argparse, hashlib, json, zipfile
from PIL import Image, ImageDraw

ap = argparse.ArgumentParser(description='Prepara selección numérica previa y contacto sin inferencia.')
ap.add_argument('--zip', type=Path, required=True)
ap.add_argument('--salida', type=Path, required=True)
ap.add_argument('--commons', type=Path, required=True, help='Carpeta externa con commons-00.jpg a commons-10.jpg')
a = ap.parse_args()
repo = Path(__file__).resolve().parents[1]
assert not a.salida.resolve().is_relative_to(repo), 'Las fotos no entran al repo/producto'
p = a.salida; (p/'muestra').mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(a.zip) as z:
    ids = sorted(int(Path(n).stem[4:]) for n in z.namelist() if Path(n).name.startswith('img-') and n.endswith('.jpg'))[:20]
    assert ids == list(range(1,21))
    seleccion = [{'archivo':f'img-{i}.jpg','grupo':'bache','anotacion':f'img-{i}.txt'} for i in ids]
    s = p/'seleccion-previa.json'
    if s.exists(): assert json.loads(s.read_text()) == seleccion
    else: s.write_text(json.dumps(seleccion,indent=2)+'\n')
    for i in ids:
        for ext in ['jpg','txt']:
            nombre = f'img-{i}.{ext}'; (p/'muestra'/nombre).write_bytes(z.read('Pothole Dataset/'+nombre))
fuentes = json.loads((repo/'docs/hoyos-fuentes.json').read_text())['commons']
(p/'commons-previo.json').write_text(json.dumps(fuentes,ensure_ascii=False,indent=2)+'\n')
for f in fuentes:
    b=(a.commons/f['archivo']).read_bytes(); assert hashlib.sha256(b).hexdigest()==f['sha256']
    (p/'muestra'/f['archivo']).write_bytes(b)
archivos=[f['archivo'] for f in seleccion+fuentes]
im=Image.new('RGB',(1000,7*190),'white');d=ImageDraw.Draw(im)
for i,n in enumerate(archivos):
    foto=Image.open(p/'muestra'/n);foto.thumbnail((192,160));x=i%5*200;y=i//5*190;im.paste(foto,(x,y));d.text((x+3,y+162),n,fill='black')
im.save(p/'contacto-antes.jpg')
print('Revisar visualmente ANTES de ejecutar scripts/evaluar-hoyos.cjs:',p/'contacto-antes.jpg')
