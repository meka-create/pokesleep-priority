import sys
from pathlib import Path
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
import update_master as m
from seed import make_seed

class UpdateMasterTests(unittest.TestCase):
    def test_seed_has_unique_forms(self):
        p=make_seed()['pokemon']
        self.assertEqual(len(p),252)
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

    def test_reject_partial_master(self):
        seed=make_seed()
        mons=[{'id':x['id'],'name':x['name'],'sleepType':'dozing','form':x['form']} for x in seed['pokemon']]
        with self.assertRaises(ValueError):
            m.assemble(mons,{}, {(1,'フシギダネ','うとうと',0)},seed)

if __name__=='__main__':unittest.main()
