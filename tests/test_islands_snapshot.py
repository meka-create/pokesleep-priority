"""Regression tests for embedded island master and form-safe update source."""
import json
import sys
import unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
from availability import map_form, master_from_availability, FIELD_KEYS

class IslandSnapshotTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.master=json.loads((ROOT/'data/master.json').read_text('utf-8'))
        cls.by_key={p['key']:p for p in cls.master['pokemon']}

    def test_snapshot_complete_and_matches_offline_seed(self):
        m=self.master
        self.assertTrue(m['areasReady'])
        self.assertEqual(len(m['areas']),9)
        self.assertEqual(len(m['pokemon']),245)
        self.assertGreaterEqual(sum(bool(p['islands']) for p in m['pokemon']),235)
        self.assertEqual(set(range(9)),set(i for p in m['pokemon'] for i in p['islands']))
        js=(ROOT/'data/seed-data.js').read_text('utf-8').strip()
        self.assertTrue(js.startswith('window.__SEED_MASTER__='))
        self.assertEqual(json.loads(js.removeprefix('window.__SEED_MASTER__=').removesuffix(';')),m)

    def test_current_official_misdreavus_fields(self):
        self.assertEqual(self.by_key['200:default']['sleep'],'うとうと')
        self.assertEqual(self.by_key['429:default']['sleep'],'うとうと')
        self.assertTrue({0,3,5,7}.issubset(self.by_key['200:default']['islands']))
        self.assertTrue({0,3,5,7}.issubset(self.by_key['429:default']['islands']))

    def test_forms_do_not_inherit_other_region(self):
        self.assertTrue({3,7}.issubset(self.by_key['37:Alola']['islands']))
        self.assertTrue({0,2,6,7}.issubset(self.by_key['37:default']['islands']))
        self.assertTrue({0,2,7}.issubset(self.by_key['194:Paldea']['islands']))
        self.assertTrue({0,1}.issubset(self.by_key['194:default']['islands']))

    def test_availability_form_resolution(self):
        self.assertEqual(len(FIELD_KEYS),9)
        self.assertEqual(map_form({'id':'alolan_vulpix'}),'Alola')
        self.assertEqual(map_form({'id':'paldean_wooper'}),'Paldea')
        self.assertEqual(map_form({'id':'pumpkaboo_jumbo'}),'Jumbo')
        self.assertEqual(map_form({'id':'toxtricity_low_key_form'}),'Low Key')
        self.assertEqual(map_form({'id':'ditto_mew'}),'default')
        self.assertEqual(map_form({'id':'clodsire'}),'Paldea')

    def test_game_pokedex_taxonomy_has_no_duplicate_forms(self):
        from species_policy import EXCLUDED_KEYS, CANONICAL_NAMES
        self.assertFalse(EXCLUDED_KEYS.intersection(self.by_key))
        self.assertEqual(len(self.master['pokemon']),245)
        for key,name in CANONICAL_NAMES.items():
            self.assertEqual(self.by_key[key]['name'],name)
        for key in ('25:Halloween','133:Halloween','37:Alola','38:Alola',
                    '194:Paldea','849:Amped','849:Low Key','980:Paldea'):
            self.assertIn(key,self.by_key)

    def test_ratings_storage_independent_from_master(self):
        app=(ROOT/'app.js').read_text('utf-8')
        self.assertIn("ratings:'gense-note-ratings-v1'",app)
        self.assertIn("overrides:'gense-note-islands-v1'",app)
        self.assertIn("if(old.areasReady&&(!next.areasReady||",app)

if __name__=='__main__': unittest.main()
