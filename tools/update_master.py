#!/usr/bin/env python3
"""Refresh Pokémon Sleep species & island appearances from two public data sources.

Fail closed: a broken/partial wiki or GitHub response must NEVER overwrite a
previously validated island master. Meant for scheduled GitHub Actions + manual run.
"""
from __future__ import annotations
import datetime as dt
import json
import re
import sys
import urllib.request
from urllib.parse import urlsplit, urlunsplit, quote
from collections import defaultdict
from pathlib import Path
from bs4 import BeautifulSoup
from seed import make_seed, REGIONAL_SPRITE_IDS, disambiguate_form_name
from availability import master_from_availability

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT/'data'/'master.json'
BASE = 'https://raw.githubusercontent.com/nitoyon/pokesleep-tool/main/'
WIKI_BASE = 'https://wikiwiki.jp/poke_sleep/出現ポケモン一覧/'
AVAILABILITY = 'https://raw.githubusercontent.com/AnticCosine/sleep-dex/main/src/assets/data/pokemon.json'
TYPES = ('うとうと', 'すやすや', 'ぐっすり')
AREA_NAMES = ('ワカクサ本島','シアンの砂浜','トープ洞窟','ウノハナ雪原',
              'ラピスラズリ湖畔','ゴールド旧発電所','アンバー渓谷',
              'ワカクサ本島 EX','シアンの砂浜 EX')
AREA_LABELS = ('ワカクサ','シアン','トープ','ウノハナ','ラピス','ゴールド','アンバー')
SLEEP_EN = {'dozing':'うとうと','snoozing':'すやすや','slumbering':'ぐっすり'}
ALIASES = {'Pikachu (Low Key)': 'ピカチュウ（ローキー）'}


def safe_request_url(url):
    """Encode Japanese Wiki path segments before passing them to urllib."""
    parsed=urlsplit(url)
    return urlunsplit((parsed.scheme,parsed.netloc,quote(parsed.path,safe='/%'),parsed.query,parsed.fragment))


def download(url):
    req=urllib.request.Request(safe_request_url(url),headers={'User-Agent':'PokeSleepPriorityPWA/1.0 (personal open-source data updater)','Accept':'text/html,application/json','Cache-Control':'no-cache'})
    with urllib.request.urlopen(req,timeout=30) as response:
        return response.read().decode('utf-8')


def clean(value):
    return re.sub(r'[\s\u3000_・]', '', str(value)).replace('（','(').replace('）',')').replace('&br;','').strip()


def area_for(value):
    t=clean(value)
    if 'ワカクサ' in t and 'EX' in t: return 7
    if 'シアン' in t and 'EX' in t: return 8
    for idx, label in enumerate(AREA_LABELS):
        if label in t: return idx
    return None


def parse_raw_wiki(text):
    """Wiki syntax fallback (includes nested wiki table rows but not headings)."""
    records=set()
    for line in text.splitlines():
        if not line.lstrip().startswith('|'): continue
        # The rendered wiki markup stores name/area/sleep exactly at these columns.
        cols=line.strip().split('|')
        if len(cols)<9: continue
        try:
            num=int(cols[2].strip())
        except ValueError:
            continue
        if not (1<=num<=1100) or cols[4].strip() not in TYPES: continue
        island=area_for(cols[6]);
        if island is None: continue
        name=cols[3].strip()
        name=re.sub(r'\[\[([^\]|>]+)(?:>[^\]]+)?\]\]',r'\1',name)
        name=re.sub(r'&[a-z]+\([^)]*\);','',name)
        name=name.replace("''",'').strip()
        if name:
            records.add((num,clean(name),cols[4].strip(),island))
    return records


def parse_html_wiki(text):
    soup=BeautifulSoup(text,'html.parser')
    records=set()
    for tr in soup.select('tr'):
        cols=tr.find_all(['td','th'],recursive=False)
        if len(cols)<7: continue
        cells=[c.get_text(' ',strip=True) for c in cols]
        try: num=int(cells[1].replace('#','').strip())
        except (ValueError, IndexError): continue
        if not (1<=num<=1100):continue
        if clean(cells[3]) not in TYPES: continue
        island=area_for(cells[5]);
        if island is None: continue
        records.add((num,clean(cells[2]),clean(cells[3]),island))
    return records


def parse_wiki(text):
    parsed=parse_html_wiki(text)
    raw=parse_raw_wiki(text)
    # Avoid mixing partial unrelated pages. Both are automatically deduplicated.
    return parsed|raw


def assemble(pokemon_data, translations, encounter_records, previous):
    seed=make_seed()
    local_ja={p['key']:p['name'] for p in seed['pokemon']}
    prior={p['key']:p for p in previous.get('pokemon',[])}
    slots=defaultdict(set)
    sleep_by_key={}
    # Build a fresh matching index from *all* upstream entries, not the frozen
    # initial seed, so future newly released Pokémon get island assignments too.
    by_number=defaultdict(list)
    for pokemon in pokemon_data:
        if not isinstance(pokemon,dict) or not isinstance(pokemon.get('id'),int):continue
        num=pokemon['id'];form=pokemon.get('form') or ''
        key=f'{num}:{form or "default"}'
        display=local_ja.get(key,translations.get(pokemon.get('name'),pokemon.get('name','')))
        by_number[num].append({'key':key,'name':clean(display)})
    # Matching only by dex number would merge distinct forms. Exact Japanese
    # names take priority; pumpkin sizes share one Wiki appearance record.
    for num, name, sleep, area in encounter_records:
        matches=[p for p in by_number.get(num,[]) if p['name']==name]
        if not matches and num in (710,711) and name in ('バケッチャ','パンプジン'):
            matches=by_number[num]
        for p in matches:
            slots[p['key']].add(area)
            sleep_by_key[p['key']]=sleep
    output=[];known=set()
    for entry in pokemon_data:
        if not isinstance(entry,dict) or not isinstance(entry.get('id'),int) or not isinstance(entry.get('name'),str):continue
        num=entry['id'];en=entry['name'];form=entry.get('form') or ''
        key=f'{num}:{form or "default"}'
        if key in known:raise ValueError(f'duplicate key: {key}')
        known.add(key)
        local=prior.get(key,{})
        if key in local_ja: named=local_ja[key]
        else: named=translations.get(en,ALIASES.get(en,en))
        named=disambiguate_form_name(form,named)
        sleep=SLEEP_EN.get(entry.get('sleepType'),sleep_by_key.get(key,local.get('sleep','不明')))
        islands=sorted(slots.get(key,set()))
        # A partial wiki scrape must never silently unmap a previously
        # confirmed Pokémon (including time-limited/event appearances).
        if not islands and local.get('islands'):
            islands=list(local['islands'])
        item={'key':key,'id':num,'name':named,'sleep':sleep,'islands':islands,'form':form}
        sprite_id=REGIONAL_SPRITE_IDS.get(key,local.get('spriteId'))
        if isinstance(sprite_id,int) and sprite_id>0:item['spriteId']=sprite_id
        output.append(item)
    # A temporary omission in the upstream species list must NOT remove a
    # user's existing Pokémon from the built-in master. Keep it until a
    # separately verified migration explicitly retires that stable key.
    for key, item in prior.items():
        if key not in known:
            output.append(item)
            known.add(key)
    output.sort(key=lambda p:(p['id'],p['key']))
    unique_with_areas=sum(bool(x['islands']) for x in output)
    coverage={i for p in output for i in p['islands']}
    if encounter_records:
        # Require meaningful coverage before replacing any known, possibly valid master.
        if len(encounter_records)<400 or unique_with_areas<130 or len(coverage)<8:
            raise ValueError(f'Wiki records insufficient: rows={len(encounter_records)}, pokemon={unique_with_areas}, areas={len(coverage)}')
    return {'schema':1,'updatedAt':dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds'),
            'source':'nitoyon/pokesleep-tool & wikiwiki.jp/poke_sleep',
            'areasReady':bool(encounter_records),
            'areas':list(AREA_NAMES),'pokemon':output}


def main():
    previous=json.loads(OUT.read_text('utf-8')) if OUT.exists() else make_seed()
    species=json.loads(download(BASE+'src/data/pokemon.json'))
    names=json.loads(download(BASE+'src/i18n/ja/pokemons.json'))['pokemons']
    if len(species)<200 or len(names)<200:raise ValueError('Unexpectedly small species source')
    # Prefer the newer, independently maintained wiki tables when they pass
    # strict volume/field validation. Fall back to structured nine-field data.
    wiki_error=None
    try:
        records=set()
        for style in TYPES:
            html=download(WIKI_BASE+style)
            found=parse_wiki(html)
            if len(found)<140:
                raise ValueError(f'Wiki page broken/partial: {style}: {len(found)}')
            records|=found
        master=assemble(species,names,records,previous)
        print(f'Wiki source validated: {len(records)} style rows')
    except Exception as exc:
        wiki_error=exc
        records=json.loads(download(AVAILABILITY))
        master=master_from_availability(species,names,records,previous)
        print(f'Wiki unavailable ({wiki_error}); validated structured availability source: {len(records)} records')
    # Fail closed if a partial source would silently erase previously confirmed
    # fields for lots of Pokémon.
    old_mapped=sum(bool(p['islands']) for p in previous.get('pokemon',[]))
    new_mapped=sum(bool(p['islands']) for p in master['pokemon'])
    if previous.get('areasReady') and new_mapped<old_mapped*.95:
        raise ValueError(f'Refusing mass island regression: {old_mapped} -> {new_mapped}')
    if previous.get('areasReady') and len(master['pokemon'])<int(len(previous['pokemon'])*.90):
        raise ValueError('Refusing large decrease in Pokémon count')
    # A scheduled check must not generate a new commit when no actual data
    # changed, and should preserve the original snapshot date.
    if (previous.get('areasReady') and previous.get('pokemon')==master.get('pokemon')
            and previous.get('areas')==master.get('areas')):
        print('No encounter/species changes; keeping existing validated master')
        return
    tmp=OUT.with_suffix('.json.tmp')
    tmp.write_text(json.dumps(master,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
    tmp.replace(OUT)
    (ROOT/'data'/'seed-data.js').write_text('window.__SEED_MASTER__='+json.dumps(master,ensure_ascii=False,separators=(',',':'))+';\n',encoding='utf-8')
    print('Saved',len(master['pokemon']),'species',sum(bool(p['islands']) for p in master['pokemon']),'assigned to islands')

if __name__=='__main__':
    try:main()
    except Exception as exc:
        print('Master update aborted; previous master preserved:',exc,file=sys.stderr)
        sys.exit(1)
