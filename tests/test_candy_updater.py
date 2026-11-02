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
        self.assertGreaterEqual(len(self.candy['families']),108)

    def test_candy_root_and_costume_classification(self):
        # Synthetic upstream CSV records reconstruct every current family
        # from the independently validated snapshot, so no network is needed.
        species_by_id={}
        for f in self.candy['families']:
            root=f['id']
            species_by_id[root]={
                'id':str(root),'evolution_chain_id':str(root),
                'evolves_from_species_id':''}
            for id in f['members']:
                species_by_id[id]={
                    'id':str(id),'evolution_chain_id':str(root),
                    'evolves_from_species_id':'' if id==root else str(root)}
        variants=[
            {'species_id':'25','identifier':'pikachu-alola-cap'},
            {'species_id':'26','identifier':'raichu-alola'},
            {'species_id':'6','identifier':'charizard-mega-x'},
            {'species_id':'6','identifier':'charizard-gmax'},
        ]
        result=build(self.master,list(species_by_id.values()),variants,date='2026-11-02')
        by_id={f['id']:f for f in result['families']}
        self.assertEqual(by_id[172]['labelId'],25)
        self.assertEqual(by_id[172]['members'],[25,26,172])
        self.assertEqual(by_id[172]['special']['regional'],[26])
        self.assertEqual(by_id[4]['special']['mega'],[6])
        self.assertEqual(by_id[4]['special']['gmax'],[6])

    def test_bad_master_is_rejected_without_overwrite(self):
        changed=json.loads(json.dumps(self.candy))
        changed['families'][0]['members'].append(9999)
        with self.assertRaises(ValueError):
            validate(changed,self.master)

if __name__=='__main__':
    unittest.main()
