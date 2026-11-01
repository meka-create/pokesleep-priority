"""Canonical Pokémon Sleep species policy shared by both master updaters.

Count actual Pokédex species, NOT upstream costume colors and pumpkin sizes.
The retained keys remain stable for saved ratings; excluded keys are not
automatically merged or migrated.
"""
EXCLUDED_KEYS=frozenset(["25:Low Key","25:Halloween2","133:Halloween2","710:Small","710:Large","710:Jumbo","711:Small","711:Large","711:Jumbo"])
CANONICAL_NAMES={"710:Medium":"バケッチャ","711:Medium":"パンプジン"}

def included(key):
    if key in EXCLUDED_KEYS:return False
    number,sep,form=key.partition(':')
    if sep and number in ('710','711'):return form=='Medium'
    if sep and number in ('25','133') and form.startswith('Halloween'):
        return form=='Halloween'
    return True

def name_for(key, original):
    return CANONICAL_NAMES.get(key,original)

def normalize_records(records):
    result=[]
    seen=set()
    for pokemon in records:
        key=pokemon['key']
        if not included(key):
            continue
        if key in seen:
            raise ValueError(f'Duplicate Pokédex species key: {key}')
        seen.add(key)
        value=dict(pokemon)
        value['name']=name_for(key,value['name'])
        result.append(value)
    return result
