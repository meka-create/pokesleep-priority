"""Cram-o-matic candy master updater: offline deterministic validations."""
import json
import sys
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
from update_candy import build,validate

class CandyUpdaterTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.master=json.loads((ROOT/'data/master.json').read_text('utf-8'))
        cls.candy=json.loads((ROOT/'data/candy-master.json').read_text('utf-8'))

    def test_prebuilt_candy_master(self):
        self.assertTrue(validate(self.candy,self.master))
        self.assertEqual(self.candy['schema'],3)
        self.assertGreaterEqual(len(self.candy['families']),108)
        legends=sorted(f['id'] for f in self.candy['families'] if f['special']['legendary'])
        pending=[f['id'] for f in self.candy['families'] if f['special']['evolution']]
        self.assertEqual(legends,[150,151,243,244,245,380,381,488,491])
        self.assertEqual(pending,[56])

    def test_candy_root_and_costume_classification(self):
        # Synthetic upstream CSV records reconstruct every current family
        # from the independently validated snapshot, so no network is needed.
        species_by_id={}
        for f in self.candy['families']:
            root=f['id']
            species_by_id[root]={
                'id':str(root),'evolution_chain_id':str(root),
                'evolves_from_species_id':'',
                'is_legendary':'0','is_mythical':'0'}
            for id in f['members']:
                species_by_id[id]={
                    'id':str(id),'evolution_chain_id':str(root),
                    'evolves_from_species_id':'' if id==root else str(root),
                    'is_legendary':'1' if id in (150,243,244,245,380,381,488) else '0',
                    'is_mythical':'1' if id in (151,491) else '0'}
        species_by_id[979]={'id':'979','evolution_chain_id':'56',
            'evolves_from_species_id':'57','is_legendary':'0','is_mythical':'0'}
        variants=[
            {'species_id':'25','identifier':'pikachu-alola-cap'},
            {'species_id':'26','identifier':'raichu-alola'},
            {'species_id':'6','identifier':'charizard-mega-x'},
            {'species_id':'6','identifier':'charizard-gmax'},
        ]
        sleep_types=[{'id':f['labelId'],'type':f['type'],'form':''}
                     for f in self.candy['families']]
        result=build(self.master,list(species_by_id.values()),variants,
                     date='2026-11-02',sleep_pokemon=sleep_types)
        by_id={f['id']:f for f in result['families']}
        self.assertEqual(by_id[172]['labelId'],25)
        self.assertEqual(by_id[172]['members'],[25,26,172])
        self.assertEqual(by_id[172]['special']['regional'],[26])
        self.assertEqual(by_id[4]['special']['mega'],[6])
        self.assertEqual(by_id[4]['special']['gmax'],[6])
        self.assertEqual(by_id[56]['special']['evolution'],[979])
        self.assertEqual(by_id[150]['special']['legendary'],[150])
        self.assertEqual(by_id[151]['special']['legendary'],[151])
        self.assertEqual(by_id[133]['type'],'normal','Eevee Candy must not become nine types')
        self.assertEqual(by_id[37]['type'],'fire','Vulpix Candy must not change to Alolan Ice')
        self.assertEqual(by_id[194]['type'],'water','Wooper Candy must not change to Paldean Poison')
        self.assertEqual(by_id[710]['type'],'ghost','Pumpkaboo Candy must retain Ghost')
        for root in (52,83,439,215):
            if root in by_id:self.assertEqual(by_id[root]['special']['evolution'],[])
        # Annihilape becomes available in Sleep: pending classification clears.
        future_master=json.loads(json.dumps(self.master))
        future_master['pokemon'].append(
            {'id':979,'key':'979:default','name':'コノヨザル',
             'sleep':'うとうと','form':'','islands':[]})
        future=build(future_master,list(species_by_id.values()),variants,
                     date='2026-11-02',sleep_pokemon=sleep_types)
        by_future={f['id']:f for f in future['families']}
        self.assertEqual(by_future[56]['special']['evolution'],[])
        self.assertIn(979,by_future[56]['members'])
        # Legacy snapshots can be read during schema-2 upgrade, but should
        # never become current schema-2 data if required fields are missing.
        legacy=json.loads(json.dumps(self.candy))
        legacy['schema']=1
        for f in legacy['families']:
            del f['special']['legendary']
            del f['special']['evolution']
        self.assertTrue(validate(legacy,self.master))
        legacy['schema']=2
        with self.assertRaises(ValueError):validate(legacy,self.master)
        legacy=json.loads(json.dumps(self.candy))
        legacy['schema']=2
        for f in legacy['families']:del f['type']
        self.assertTrue(validate(legacy,self.master))
        legacy['schema']=3
        with self.assertRaises(ValueError):validate(legacy,self.master)
        no_type=json.loads(json.dumps(sleep_types))
        no_type[0]['type']='not-a-type'
        with self.assertRaises(ValueError):
            build(self.master,list(species_by_id.values()),variants,
                  sleep_pokemon=no_type,date='2026-11-02')

    def test_bad_master_is_rejected_without_overwrite(self):
        changed=json.loads(json.dumps(self.candy))
        changed['families'][0]['members'].append(9999)
        with self.assertRaises(ValueError):
            validate(changed,self.master)

if __name__=='__main__':
    unittest.main()
