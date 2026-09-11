"""Freeze attributed source maps into a local, 512px tile pyramid. No runtime CDN.
Run with Python + Pillow + numpy. Raw source downloads are ignored by Git.
"""
from pathlib import Path
import urllib.request, urllib.parse, concurrent.futures, json, hashlib
from PIL import Image
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
CACHE=ROOT/'.asset-cache'; CACHE.mkdir(exist_ok=True)
OUT=ROOT/'public'; (OUT/'tiles').mkdir(exist_ok=True)
Image.MAX_IMAGE_PIXELS=300_000_000
NASA='https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/'
SVS='https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/'
SSS='https://www.solarsystemscope.com/textures/download/'
sources={
 'earth':(NASA+'bmng-base/june/world.200406.3x21600x10800.jpg',4),
 'moon':(SVS+'lroc_color_poles_16k.tif',4),
 'moon-height':(SVS+'ldem_16_uint.tif',0),
 'saturn':(SSS+'8k_saturn.jpg',3), 'sun':(SSS+'8k_sun.jpg',3),
 'mars':(SSS+'8k_mars.jpg',3), 'jupiter':(SSS+'8k_jupiter.jpg',3),
 'mercury':(SSS+'8k_mercury.jpg',3), 'venus-surface':(SSS+'8k_venus_surface.jpg',3),
 'clouds':(SSS+'8k_earth_clouds.jpg',0), 'earth-specular':(SSS+'8k_earth_specular_map.tif',0),
}
for ident,name in [('io','Jupiter - Io (A)'),('europa','Jupiter - Europa'),('ganymede','Jupiter - Ganymede'),('callisto','Jupiter - Callisto'),('titan','Saturn - Titan'),('enceladus','Saturn - Enceladus'),('triton','Neptune - Triton')]:
 path=f'Images and Textures/{name}/{name}.jpg'
 sources[ident]=('https://raw.githubusercontent.com/nasa/NASA-3D-Resources/master/'+urllib.parse.quote(path),2)

def download(item):
 ident,(url,level)=item; dest=CACHE/(ident+Path(urllib.parse.urlparse(url).path).suffix)
 try:
  if not dest.exists():
   req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 Asterion planetary imagery'})
   temporary=dest.with_suffix(dest.suffix+'.part')
   with urllib.request.urlopen(req,timeout=120) as response: temporary.write_bytes(response.read())
   temporary.replace(dest)
  with Image.open(dest) as im: im.verify()
  print(f'Downloaded {ident}: {dest.stat().st_size:,} bytes',flush=True)
  return ident,dest,level,url
 except Exception as exc:
  print(f'UNAVAILABLE {ident}: {exc}',flush=True); return None

def tiles(ident,path,level):
 im=Image.open(path).convert('RGB')
 # Never upscale the source to imply extra observations.
 level=min(level,max(0,int(np.floor(np.log2(im.width/1024)))))
 base=im.resize((2048,1024),Image.Resampling.LANCZOS)
 base.save(OUT/'textures'/f'{ident}.jpg',quality=92)
 for l in range(level+1):
  width=1024*2**l; layer=im.resize((width,width//2),Image.Resampling.LANCZOS)
  folder=OUT/'tiles'/ident/str(l);folder.mkdir(parents=True,exist_ok=True)
  for y in range(2**l):
   for x in range(2**(l+1)):
    # One pixel gutters sample neighbors, including the wrapped longitude seam.
    tile=Image.new('RGB',(514,514))
    for offset,w in [(0,1),(1,512),(513,1)]:
     sx=(x*512+offset-1)%width
     for oy,h in [(0,1),(1,512),(513,1)]:
      sy=max(0,min(width//2-h,y*512+oy-1))
      tile.paste(layer.crop((sx,sy,sx+w,sy+h)),(offset,oy))
    tile.save(folder/f'{x}-{y}.webp',quality=88,method=4)
 return {'maxLevel':level,'sourceWidth':im.width,'width':1024*2**level,'height':1024*2**level//2}

if __name__=='__main__':
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool: downloaded=list(pool.map(download,sources.items()))
 manifest=json.loads((OUT/'tiles'/'manifest.json').read_text(encoding='utf-8')) if (OUT/'tiles'/'manifest.json').exists() else {}
 for item in downloaded:
  if not item:continue
  ident,path,level,url=item
  if ident.endswith('-height'):
   im=Image.open(path); print(ident,im.mode,im.size,im.getextrema(),flush=True)
   a=np.array(im)
   if ident=='moon-height':
    h=a.astype(np.float32)*.5-10000
   else:
    # GEBCO GeoTIFF must carry actual elevations, not a display greyscale.
    if a.dtype not in (np.int16,np.int32,np.float32,np.float64):
     print('Skipping non-metric Earth height raster',flush=True); continue
    h=np.maximum(0,a.astype(np.float32))
   h=Image.fromarray(h).resize((4096,2048),Image.Resampling.BILINEAR)
   a=np.array(h);lo=float(a.min());hi=float(a.max())
   # RGB packs a 16-bit height to avoid 8-bit elevation banding in WebGL.
   q=np.clip((a-lo)/(hi-lo)*65535,0,65535).astype(np.uint16)
   rgb=np.stack((q>>8,q&255,np.zeros_like(q)),axis=2).astype(np.uint8)
   Image.fromarray(rgb).save(OUT/'textures'/f'{ident}.png')
   manifest[ident]={'min':lo,'max':hi,'width':4096,'url':url}
  elif level==0:
   manifest[ident]={'width':4096,'sourceWidth':Image.open(path).width,'url':url}
   Image.open(path).convert('RGB').resize((4096,2048),Image.Resampling.LANCZOS).save(OUT/'textures'/f'{ident}.jpg',quality=92)
  else:
   manifest[ident]=tiles(ident,path,level)
   manifest[ident]['url']=url
   manifest[ident]['sha256']=hashlib.sha256(path.read_bytes()).hexdigest()
   print(f'Tiled {ident}: {manifest[ident]["width"]} pixels wide',flush=True)
  manifest[ident]['sha256']=hashlib.sha256(path.read_bytes()).hexdigest()
 (OUT/'tiles'/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
