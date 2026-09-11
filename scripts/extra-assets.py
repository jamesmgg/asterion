from pathlib import Path
import urllib.request, urllib.parse, json, concurrent.futures, hashlib
from PIL import Image
import numpy as np
ROOT=Path(__file__).resolve().parents[1];CACHE=ROOT/'.asset-cache';OUT=ROOT/'public'
CACHE.mkdir(exist_ok=True)
Image.MAX_IMAGE_PIXELS=300_000_000
jobs={
 'earth-dem': 'https://www.ngdc.noaa.gov/mgg/global/relief/ETOPO2022/data/60s/60s_surface_elev_gtif/ETOPO_2022_v1_60s_N90W180_surface.tif',
 'mars-label':'https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg016/megt90n000eb.lbl',
 'mars-dem':'https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg016/megt90n000eb.img',
}
def get(item):
 name,url=item;path=CACHE/(name+Path(urllib.parse.urlparse(url).path).suffix)
 try:
  if not path.exists():
   temporary=path.with_suffix(path.suffix+'.part')
   with urllib.request.urlopen(url,timeout=180) as r,open(temporary,'wb') as f:
    while chunk:=r.read(1024*1024):f.write(chunk)
   temporary.replace(path)
  print(name,path.stat().st_size,flush=True);return name,path
 except Exception as e:print('FAILED',name,e,flush=True);return name,None
if __name__=='__main__':
 with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool: paths=dict(pool.map(get,jobs.items()))
 manifest=json.loads((OUT/'tiles/manifest.json').read_text(encoding='utf-8'))
 for ident,name in [('earth','earth-dem'),('mars','mars-dem')]:
  if not paths[name]:continue
  if ident=='earth':
   im=Image.open(paths[name]);print(im.mode,im.size,flush=True)
   a=np.maximum(0,np.array(im,dtype=np.float32))
  else:
   label=paths['mars-label'].read_text(encoding='utf-8');print(label[:5000],flush=True)
   a=np.fromfile(paths[name],dtype='>i2').reshape(2880,5760).astype(np.float32)
   # MOLA longitude is 0..360 E. Rendering maps use -180..180 E.
   a=np.roll(a,a.shape[1]//2,axis=1)
  im=Image.fromarray(a).resize((4096,2048),Image.Resampling.BILINEAR);a=np.array(im)
  lo=float(a.min());hi=float(a.max());q=np.clip((a-lo)/(hi-lo)*65535,0,65535).astype(np.uint16)
  rgb=np.stack((q>>8,q&255,np.zeros_like(q)),axis=2).astype(np.uint8)
  Image.fromarray(rgb).save(OUT/'textures'/f'{ident}-height.png')
  manifest[ident+'-height']={'min':lo,'max':hi,'width':4096,'url':jobs[name],'sha256':hashlib.sha256(paths[name].read_bytes()).hexdigest()}
 (OUT/'tiles/manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
