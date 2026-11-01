#!/usr/bin/env python3
"""Rebuild the offline 9-island encounter snapshot from a validated October 2026
public dataset. Each mask is a bitset of 9 fields (least significant bit =
Greengrass Isle). This generated mapping is encounter metadata, not artwork.
Source: https://github.com/AnticCosine/sleep-dex/blob/main/src/assets/data/pokemon.json
Additional official Misdreavus information: https://www.pokemonsleep.net/news/343532353938363734313136303530393531/
"""
from __future__ import annotations
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AREAS = ['ワカクサ本島','シアンの砂浜','トープ洞窟','ウノハナ雪原','ラピスラズリ湖畔','ゴールド旧発電所','アンバー渓谷','ワカクサ本島 EX','シアンの砂浜 EX']
# Cached from AnticCosine/sleep-dex data, last updated 2026-10-08.
MASKS = '''1:41,2:41,3:41,4:3p,5:3p,6:3p,7:ar,8:ar,9:ar,10:4j,11:4h,12:4h,19:9,20:9,23:1t,24:1t,25:4j,26:4h,27:5h,28:5h,35:e7,36:e7,37:5h,38:5h,39:77,40:77,50:5,51:5,52:41,53:41,54:77,55:76,56:9,57:9,58:3p,59:3o,69:j,70:h,71:h,74:5,75:5,76:4,79:3,80:3,81:4h,82:4h,83:bn,84:41,85:41,92:11,93:11,94:10,95:3o,104:3p,105:3p,113:cp,115:3n,122:2,127:cj,132:e7,133:cj,134:3n,135:4h,136:3p,147:7k,148:7k,149:7k,150:ap,151:0,152:41,153:41,154:41,155:3p,156:3p,157:3p,158:ar,159:ar,160:ar,172:4h,173:e7,174:77,175:h,176:h,177:5t,178:5d,179:3t,180:3t,181:3s,185:3n,194:3,195:3,196:41,197:3p,198:4p,199:2,202:h,208:4k,213:av,214:cj,215:3t,225:3t,228:3p,229:3o,242:cp,243:4h,244:5h,245:b7,246:5h,247:3o,248:3o,252:b7,253:b7,254:b7,255:41,256:41,257:41,258:at,259:at,260:at,280:40,281:40,282:40,287:3t,288:3t,289:3t,302:3o,303:69,304:4g,305:4g,306:4g,311:69,312:69,316:b,317:9,328:1w,329:1w,330:1w,333:3t,334:3s,353:4h,354:4h,359:3t,360:h,363:3t,364:3s,365:3s,371:1s,372:1s,373:1s,380:5t,381:5t,387:45,388:45,389:45,390:5h,391:5h,392:5h,393:az,394:az,395:az,403:w,404:w,405:w,425:4h,426:4g,430:4p,438:3n,439:2,440:cp,442:5l,447:d,448:8,453:77,454:77,459:3s,460:3s,461:3t,462:4h,468:75,470:41,471:3t,475:40,488:49,491:0,517:41,518:41,557:1s,558:1s,590:cx,591:cx,627:cj,628:ch,696:5h,697:5h,700:ap,701:b7,702:4x,714:5h,715:5h,736:80,737:80,738:80,742:ar,743:ar,759:g,760:g,764:ar,777:69,778:4h,780:cx,845:az,848:69,906:41,907:41,908:41,909:3r,910:3q,911:3q,912:41,913:40,914:40,921:4p,922:4o,923:4o,957:bn,958:bn,959:bn,974:3t,975:3s,980:3p'''
BASE = {int(pair.split(':')[0]):int(pair.split(':')[1],36) for pair in MASKS.split(',')}
OVERRIDES = {
    '25:Low Key':0, '25:Holiday':0,'25:Halloween':0,'25:Captain':1,
    '37:Alola':int('3s',36), '38:Alola':int('3s',36),
    '133:Holiday':0, '133:Halloween':0,
    '194:Paldea':int('3p',36), '363:Holiday':0,
    '849:Amped':int('5d',36), '849:Low Key':int('5d',36),
}
# Oct 26 release: official list for both Misdreavus and Mismagius.
BASE[200] = BASE[429] = (1<<0)|(1<<3)|(1<<5)|(1<<7)
# All Pumpkaboo/Gourgeist sizes share the same species appearance locations;
# source explicitly lists medium-size entries; apply to other sizes only when
# the regular species is known to be available on the island.
BASE[710] = BASE[711] = int('4h',36)


def apply(master):
    for p in master['pokemon']:
        mask=OVERRIDES.get(p['key'], BASE.get(p['id'],0) if not (p['form'] and p['id'] in (25,133,363)) else 0)
        p['islands']=[i for i in range(9) if mask&(1<<i)]
    if len(master['pokemon'])<200 or len([p for p in master['pokemon'] if p['islands']])<200:
        raise ValueError('Incomplete embedded island data')
    coverage={i for p in master['pokemon'] for i in p['islands']}
    if coverage!=set(range(9)):
        raise ValueError('Missing island(s): '+str(set(range(9))-coverage))
    master.update(schema=1,areas=AREAS,areasReady=True,updatedAt='2026-11-01',source='AnticCosine/sleep-dex (2026-10-08); Pokémon Sleep official (2026-10-15)')
    return master


def main():
    path=ROOT/'data'/'master.json'
    master=apply(json.loads(path.read_text('utf-8')))
    serial=json.dumps(master,ensure_ascii=False,separators=(',',':'))
    path.write_text(serial+'\n',encoding='utf-8')
    (ROOT/'data'/'seed-data.js').write_text('window.__SEED_MASTER__='+serial+';\n',encoding='utf-8')
    print('Pokemon:',len(master['pokemon']),'assigned:',sum(bool(p['islands']) for p in master['pokemon']))
    print('Counts:',[(name,sum(i in p['islands'] for p in master['pokemon'])) for i,name in enumerate(AREAS)])

if __name__=='__main__':main()
