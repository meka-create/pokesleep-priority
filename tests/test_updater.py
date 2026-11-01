import sys
from pathlib import Path
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
import update_master as m
from seed import make_seed

class UpdateMasterTests(unittest.TestCase):
    def test_seed_has_unique_forms(self):
        p=make_seed()['pokemon']
        self.assertEqual(len(p),245)
        self.assertEqual(len(set(x['key'] for x in p)),252)
        self.assertEqual(next(x for x in p if x['key']=='194:Paldea')['sleep'],'うとうと')
        self.assertEqual(next(x for x in p if x['key']=='37:Alola')['sleep'],'ぐっすり')
    def test_wiki_raw_rows(self):
        s='''|[[&icon(30,フシギダネ);>フシギダネ]]|0001|[[フシギダネ]]|うとうと|1|ワカクサ|&ref(foo);2||
|[[&icon(30,ミニリュウ);>ミニリュウ]]|0147|[[ミニリュウ]]|うとうと|2|シアン&br;EX|&ref(foo);3||'''
        v=m.parse_raw_wiki(s)
        self.assertIn((1,'フシギダネ','うとうと',0),v)
        self.assertIn((147,'ミニリュウ','うとうと',8),v)
    def test_html_rows(self):
        html='<table><tr><td>img</td><td>0001</td><td>フシギダネ</td><td>うとうと</td><td>1</td><td>ワカクサ</td><td>2</td><td></td></tr></table>'
        self.assertIn((1,'フシギダネ','うとうと',0),m.parse_html_wiki(html))
    def test_unicode_wiki_url_is_encoded(self):
        url=m.safe_request_url('https://wikiwiki.jp/poke_sleep/出現ポケモン一覧/うとうと')
        self.assertTrue(url.startswith('https://wikiwiki.jp/poke_sleep/'))
        self.assertIn('%E5%87%BA%E7%8F%BE',url)
        self.assertNotIn('うとうと',url)
        self.assertEqual(m.safe_request_url(url),url)

    def test_areas(self):
        self.assertEqual(m.area_for('シアン EX'),8)
        self.assertEqual(m.area_for('シアン'),1)
        self.assertEqual(m.area_for('ワカクサ&br;EX'),7)
    def test_new_species_island_assignment(self):
        seed=make_seed()
        mons=[{'id':x['id'],'name':x['name'],'sleepType':'dozing','form':x['form']} for x in seed['pokemon']]
        mons.append({'id':999,'name':'FutureTest','sleepType':'dozing'})
        # Artificial complete fixture with sufficient island coverage.
        rec={(x['id'],m.clean(x['name']),'うとうと',i) for i in range(9) for x in seed['pokemon'][:150]}
        rec.add((999,'シンポケ','うとうと',6))
        master=m.assemble(mons,{'FutureTest':'シンポケ'},rec,seed)
        future=next(x for x in master['pokemon'] if x['id']==999)
        self.assertEqual(future['name'],'シンポケ')
        self.assertEqual(future['islands'],[6])

    def test_fallback_source_accepts_flat_translation_map(self):
        # Real updater passes the flattened Japanese name dictionary.
        import json
        from availability import master_from_availability, FIELD_KEYS
        root=Path(__file__).resolve().parents[1]
        prev=json.loads((root/'data/master.json').read_text('utf-8'))
        species=[dict(id=p['id'], name=p['name'], sleepType='dozing',
                      form=p.get('form','')) for p in prev['pokemon']]
        species.append(dict(id=999, name='FutureTest', sleepType='dozing'))
        rows=[dict(id='baseline', pokedex_number=str(p['id']),
                   availability={'1_star':list(FIELD_KEYS)})
              for p in prev['pokemon']]
        rows.append(dict(id='futuretest', pokedex_number='999',
                         availability={'1_star':['cyan_beach']}))
        result=master_from_availability(species, {'FutureTest':'シンポケ'}, rows, prev)
        new=next(p for p in result['pokemon'] if p['key']=='999:default')
        self.assertEqual(new['name'],'シンポケ')
        self.assertEqual(new['islands'],[1])

    def test_partial_upstream_cannot_drop_previous_pokemon_or_islands(self):
        seed=make_seed()
        previous={**seed, 'pokemon':[dict(p) for p in seed['pokemon']]}
        missing=previous['pokemon'][0]
        missing['islands']=[4]
        event=previous['pokemon'][-1]
        event['islands']=[3]
        # Substantial otherwise valid source: 9 islands and >130 matches.
        species=[{'id':p['id'],'name':p['name'],'form':p['form'],'sleepType':'dozing'}
                 for p in seed['pokemon'][1:]]
        records={(p['id'],m.clean(p['name']),'うとうと',i)
                 for i in range(9) for p in seed['pokemon'][1:161]}
        result=m.assemble(species,{},records,previous)
        by_key={p['key']:p for p in result['pokemon']}
        self.assertEqual(len(result['pokemon']),len(previous['pokemon']))
        self.assertEqual(by_key[missing['key']]['islands'],[4])
        self.assertEqual(by_key[event['key']]['islands'],[3])

    def test_excluded_variants_never_return_on_wiki_update(self):
        from species_policy import EXCLUDED_KEYS, CANONICAL_NAMES
        previous=make_seed()
        old=make_seed()['pokemon']
        # Simulate all nine obsolete forms being present in an older master.
        old+=[{'key':k,'id':int(k.split(':')[0]),'name':'旧登録','form':k.split(':')[1],
               'sleep':'すやすや','islands':[0]} for k in EXCLUDED_KEYS]
        previous['pokemon']=old
        mons=[{'id':p['id'],'name':p['name'],'sleepType':'dozing','form':p.get('form','')}
              for p in old]
        records={(p['id'],m.clean(p['name']),'うとうと',i)
                 for i in range(9) for p in old[:170]}
        result=m.assemble(mons,{},records,previous)
        keys={p['key'] for p in result['pokemon']}
        self.assertEqual(len(result['pokemon']),245)
        self.assertFalse(keys&EXCLUDED_KEYS)
        for key,name in CANONICAL_NAMES.items():
            self.assertEqual(next(p for p in result['pokemon'] if p['key']==key)['name'],name)

    def test_reject_partial_master(self):
        seed=make_seed()
        mons=[{'id':x['id'],'name':x['name'],'sleepType':'dozing','form':x['form']} for x in seed['pokemon']]
        with self.assertRaises(ValueError):
            m.assemble(mons,{}, {(1,'フシギダネ','うとうと',0)},seed)

if __name__=='__main__':unittest.main()
