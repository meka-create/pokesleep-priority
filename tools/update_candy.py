#!/usr/bin/env python3
"""Validated, fail-closed Cram-o-matic family/variant master for Pokémon Sleep.

Independent of the user's legacy ZIP. Candy families use PokéAPI's main-series
evolution species data and the CURRENT app's Pokémon Sleep master. Because
special-form metadata is from the main games, it is reference information, not
a claim that a form is playable in Pokémon Sleep.

The upstream CSV lists may change; never erase a validated snapshot on failure.
"""
from __future__ import annotations
import csv
import datetime as dt
import io
import json
import re
import urllib.request
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
CANDY=ROOT/'data'/'candy-master.json'
SEED=ROOT/'data'/'candy-seed.js'
MONS=ROOT/'data'/'master.json'
SOURCE='https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/'
CANDY_NAMES={172:25,173:35,174:39,440:113,439:122,360:202,438:185}
KINDS=('regional','mega','gmax')

def fetch_csv(filename):
    req=urllib.request.Request(SOURCE+filename,headers={
        'User-Agent':'GensenNote-CandyMaster/1.0 (GitHub Actions, daily)',
        'Accept':'text/csv','Cache-Control':'no-cache'})
    with urllib.request.urlopen(req,timeout=30) as res:
        result=list(csv.DictReader(io.StringIO(res.read().decode('utf-8-sig'))))
    if len(result)<1000:raise ValueError('Truncated PokeAPI CSV: '+filename)
    return result

def build(master, species, forms, date=None):
    if master.get('schema')!=1 or len(master.get('pokemon',[]))<200:
        raise ValueError('Invalid Sleep species master')
    pokemon=master['pokemon']
    ids={int(p['id']) for p in pokemon}
    if len(ids)<200:raise ValueError('Incomplete Sleep species master')
    species_by_id={int(s['id']):s for s in species}
    chains={}
    for row in species:
        chain=int(row['evolution_chain_id']) if row.get('evolution_chain_id') else 0
        if chain:chains.setdefault(chain,[]).append(int(row['id']))
    groups={}
    for id in ids:
        row=species_by_id.get(id)
        if not row or not row.get('evolution_chain_id'):
            raise ValueError('PokeAPI missing current Sleep dex id '+str(id))
        chain=int(row['evolution_chain_id'])
        groups.setdefault(chain,set()).add(id)
    variant_ids={}
    for row in forms:
        id=int(row['species_id'])
        slug=row['identifier']
        entry=variant_ids.setdefault(id,set())
        # Pikachu Alola Cap is a *costume*, NOT an Alolan regional species.
        if re.search(r'-(alola|galar|hisui|paldea)$',slug):entry.add('regional')
        if re.search(r'-mega(?:-|$)',slug):entry.add('mega')
        if slug.endswith('-gmax'):entry.add('gmax')
    families=[]
    for chain,matched in groups.items():
        related=chains[chain]
        roots=[id for id in related if not species_by_id[id].get('evolves_from_species_id')]
        if len(roots)!=1:raise ValueError('Invalid evolution root: '+str(chain))
        root=roots[0]
        members=sorted(matched)
        label_id=(CANDY_NAMES.get(root) if CANDY_NAMES.get(root) in matched
                  else root if root in matched else members[0])
        special={kind:sorted(id for id in related if kind in variant_ids.get(id,set()))
                 for kind in KINDS}
        families.append({'id':root,'labelId':label_id,'members':members,'special':special})
    families.sort(key=lambda f:(f['labelId'],f['id']))
    today=date or dt.datetime.now(dt.timezone(dt.timedelta(hours=9))).date().isoformat()
    result={'schema':1,'updatedAt':today,
            'source':'PokeAPI pokemon_species.csv and pokemon.csv; current Pokémon Sleep master',
            'families':families}
    validate(result,master)
    return result

def validate(result,master,require_coverage=True):
    if result.get('schema')!=1 or not isinstance(result.get('families'),list):
        raise ValueError('Broken candy master schema')
    families=result['families']
    if not 70<=len(families)<=1000:raise ValueError('Implausible family count')
    mapping={}
    for family in families:
        if not isinstance(family['id'],int) or family['id']<1:raise ValueError('Invalid family ID')
        if family['labelId'] not in family['members']:raise ValueError('Missing label species')
        if not family['members'] or family['members']!=sorted(set(family['members'])):raise ValueError('Invalid members')
        for id in family['members']:
            if id in mapping:raise ValueError('Duplicate candy family membership: '+str(id))
            mapping[id]=family['id']
        kinds=family.get('special')
        if not isinstance(kinds,dict) or set(kinds)!=set(KINDS):raise ValueError('Invalid special form fields')
        if any(not isinstance(kinds[k],list) or kinds[k]!=sorted(set(kinds[k]))
               or any(not isinstance(i,int) or i<1 for i in kinds[k]) for k in KINDS):
            raise ValueError('Invalid special form entries')
    if require_coverage and set(mapping)!={int(p['id']) for p in master['pokemon']}:
        raise ValueError('Incomplete or extra master membership')
    by_root={f['id']:f for f in families}
    pikachu=by_root.get(172)
    if not pikachu or not {25,26,172}.issubset(pikachu['members']) or pikachu['labelId']!=25:
        raise ValueError('Pikachu baby family regressed')
    if 25 in pikachu['special']['regional']:raise ValueError('Pikachu Alola Cap falsely treated as regional')
    if not {'mega','gmax'}.issubset({k for k,v in by_root[4]['special'].items() if v}):
        raise ValueError('Charizard special forms missing')
    return True

def main():
    old=json.loads(CANDY.read_text('utf-8')) if CANDY.exists() else None
    master=json.loads(MONS.read_text('utf-8'))
    if old:validate(old,master,require_coverage=False)  # New Sleep species may precede this snapshot.
    try:
        result=build(master,fetch_csv('pokemon_species.csv'),fetch_csv('pokemon.csv'))
    except Exception as e:
        if old:
            print('Candy upstream validation unavailable; retaining last validated master:',e)
            return
        raise
    if old:
        by_member_old={i:f['id'] for f in old['families'] for i in f['members']}
        by_member_new={i:f['id'] for f in result['families'] for i in f['members']}
        if any(by_member_new.get(i)!=root for i,root in by_member_old.items()):
            print('Candy family migration detected; retaining old master for explicit review')
            return
        if old['families']==result['families']:
            print('Candy family / special form metadata unchanged; retaining previous snapshot')
            return
    serial=json.dumps(result,ensure_ascii=False,separators=(',',':'))
    CANDY.write_text(serial+'\n',encoding='utf-8')
    SEED.write_text('window.__CANDY_MASTER__='+serial+';\n',encoding='utf-8')
    print('Updated candy master:',len(result['families']),'families')

if __name__=='__main__':main()
