"""Adapt the 9-field availability dataset to this app's form-aware stable keys."""
from __future__ import annotations
from collections import defaultdict
from embedded_islands import AREAS
from seed import REGIONAL_SPRITE_IDS

FIELD_KEYS = ('greengrass_isle','cyan_beach','taupe_hollow','snowdrop_tundra',
              'lapis_lakeside','old_gold_power_plant','amber_canyon',
              'greengrass_isle_expert','cyan_beach_expert')


def map_form(entry):
    slug = str(entry.get('id') or '').lower()
    if slug.startswith('ditto_'):
        return 'default'  # Dream style, not a separate selectable species.
    if slug=='clodsire':return 'Paldea'  # Upstream data models Clodsire in the Paldea form.
    if 'alolan_' in slug:return 'Alola'
    if 'paldean_' in slug:return 'Paldea'
    if slug.startswith('pumpkaboo_') or slug.startswith('gourgeist_'):
        for token,form in (('small','Small'),('medium','Medium'),('large','Large'),('jumbo','Jumbo')):
            if token in slug:return form
    if slug.startswith('toxtricity_'):
        return 'Low Key' if 'low_key' in slug else 'Amped'
    if 'halloween' in slug:return 'Halloween'
    if 'holiday' in slug:return 'Holiday'
    if 'captain' in slug:return 'Captain'
    if 'low_key' in slug:return 'Low Key'
    return 'default'


def master_from_availability(species, translations, entries, previous):
    """Use explicit species/form matches and preserve previously validated islands.

    Never assign a regional variant's islands to its unmodified form.
    """
    if len(entries)<230:
        raise ValueError(f'Source truncated: {len(entries)}')
    masks=defaultdict(int)
    for x in entries:
        if not isinstance(x,dict):continue
        raw=str(x.get('pokedex_number',''))
        try: dex=int(raw.split('.')[0])
        except ValueError: continue
        form=map_form(x)
        mask=0
        for locs in x.get('availability',{}).values():
            if not isinstance(locs,list):continue
            for loc in locs:
                if loc in FIELD_KEYS:mask|=1<<FIELD_KEYS.index(loc)
        masks[f'{dex}:{form}']|=mask
    prior={p['key']:p for p in previous.get('pokemon',[])}
    # Confirmed Oct 26 Pokémon: use official island list until source catches up.
    official_mask=sum(1<<i for i in (0,3,5,7))
    for key in ('200:default','429:default'):
        masks[key]=masks[key] or official_mask
    # Pumpkin size-specific entries contain incomplete style catalog in source;
    # regular-size established locations also apply to other sizes.
    for num in (710,711):
        medium=masks.get(f'{num}:Medium',0)
        for form in ('Small','Large','Jumbo'):
            masks[f'{num}:{form}']=masks.get(f'{num}:{form}',0)|medium
    out=[]; keys=set()
    labels=translations['pokemons']
    en_sleep={'dozing':'うとうと','snoozing':'すやすや','slumbering':'ぐっすり'}
    for p in species:
        if not isinstance(p,dict) or not isinstance(p.get('id'),int) or not p.get('name'):continue
        form=p.get('form') or 'default';key=f"{p['id']}:{form}"
        if key in keys:raise ValueError(f'Duplicate species key: {key}')
        keys.add(key)
        old=prior.get(key,{})
        mask=masks.get(key,0)
        islands=[i for i in range(9) if mask&(1<<i)]
        # Upstream incompleteness must not erase known validated appearances.
        if not islands and old.get('islands'):
            islands=old['islands']
        name=old.get('name') or labels.get(p['name']) or p['name']
        sleep=en_sleep.get(p.get('sleepType'),old.get('sleep','不明'))
        item={'key':key,'id':p['id'],'form':p.get('form') or '',
                    'name':name,'sleep':sleep,'islands':sorted(set(islands))}
        sprite_id=REGIONAL_SPRITE_IDS.get(key,old.get('spriteId'))
        if isinstance(sprite_id,int) and sprite_id>0:item['spriteId']=sprite_id
        out.append(item)
    for key,p in prior.items():
        if key not in keys:out.append(p)
    out.sort(key=lambda p:(p['id'],p['key']))
    mapped=sum(bool(p['islands']) for p in out)
    coverage={i for p in out for i in p['islands']}
    if len(out)<240 or mapped<225 or coverage!=set(range(9)):
        raise ValueError(f'Incomplete island mapping: {len(out)} / {mapped}, coverage {coverage}')
    return {'schema':1,'updatedAt':__import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(timespec='seconds'),
            'source':'nitoyon/pokesleep-tool & AnticCosine/sleep-dex & Pokemon Sleep official',
            'areasReady':True,'areas':AREAS,'pokemon':out}
