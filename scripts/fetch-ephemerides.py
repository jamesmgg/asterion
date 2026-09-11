"""Freeze two years of hourly JPL Horizons geometric planet-centered states.
NASA/JPL API is queried sequentially. No runtime service or credentials required.
"""
from pathlib import Path
import urllib.parse,urllib.request,json
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'public/ephemerides';OUT.mkdir(exist_ok=True)
targets=[('moon',301,399),('io',501,599),('europa',502,599),('ganymede',503,599),('callisto',504,599),('titan',606,699),('enceladus',602,699),('triton',801,899)]
for name,code,parent in targets:
 dest=OUT/(name+'.json')
 if dest.exists():print('Cached',name,flush=True);continue
 params={'format':'json','COMMAND':f"'{code}'",'CENTER':f"'500@{parent}'",'MAKE_EPHEM':"'YES'",'EPHEM_TYPE':"'VECTORS'",'START_TIME':"'2026-01-01'",'STOP_TIME':"'2028-01-01'",'STEP_SIZE':"'1 h'",'VEC_TABLE':"'2'",'REF_PLANE':"'ECLIPTIC'",'REF_SYSTEM':"'ICRF'",'OUT_UNITS':"'KM-S'",'VEC_CORR':"'NONE'",'CSV_FORMAT':"'YES'",'OBJ_DATA':"'NO'"}
 url='https://ssd.jpl.nasa.gov/api/horizons.api?'+urllib.parse.urlencode(params)
 result=json.load(urllib.request.urlopen(url,timeout=180))
 raw=result.get('result','')
 if '$$SOE' not in raw:raise RuntimeError(name+': '+str(result)[:600])
 records=raw.split('$$SOE')[1].split('$$EOE')[0].strip().splitlines();states=[];start=None
 for line in records:
  cols=line.split(',');jd=float(cols[0]);start=jd if start is None else start
  # Store SI metres and metres/second, rounded to a millimetre and micrometre/s.
  states.append([round(float(cols[i])*1000,3 if i<5 else 6) for i in range(2,8)])
 doc={'source':'NASA/JPL Horizons','target':code,'center':parent,'frame':'ICRF ecliptic J2000','timescale':'TDB','start':start,'step':1/24,'states':states}
 dest.write_text(json.dumps(doc,separators=(',',':'))+'\n',encoding='utf-8')
 print(name,len(states),'hourly vectors',dest.stat().st_size,'bytes',flush=True)
