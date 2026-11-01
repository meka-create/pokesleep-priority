"""Regional Pokémon sprites and stable user-data compatibility regression tests."""
import json
import sys
import unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
from seed import make_seed, REGIONAL_SPRITE_IDS

class SpriteTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.master=json.loads((ROOT/'data/master.json').read_text('utf-8'))
        cls.by_key={x['key']:x for x in cls.master['pokemon']}

    def test_regional_ids_in_offline_master_and_seed(self):
        seed={x['key']:x for x in make_seed()['pokemon']}
        for key,sprite_id in REGIONAL_SPRITE_IDS.items():
            self.assertEqual(seed[key]['spriteId'],sprite_id)
            self.assertEqual(self.by_key[key]['spriteId'],sprite_id)
        self.assertNotIn('spriteId',self.by_key['37:default'])
        self.assertNotIn('spriteId',self.by_key['38:default'])
        self.assertNotIn('spriteId',self.by_key['194:default'])
        # Clodsire is a standalone Pokémon, not a regional Wooper sprite.
        self.assertNotIn('spriteId',self.by_key['980:Paldea'])

    def test_runtime_never_uses_normal_sprite_for_unknown_region(self):
        app=(ROOT/'app.js').read_text('utf-8')
        self.assertIn('if(!isRegional(p))return p.id;',app)
        self.assertIn('return Number.isInteger(id)&&id>0?id:null;',app)
        self.assertIn("const custom=state.icons.get(p.key),id=spriteId(p)",app)
        self.assertIn('async function resolveRegionalSprites()',app)
        self.assertIn("new Request(url.href,{mode:'no-cors',credentials:'omit'})",(ROOT/'sw.js').read_text('utf-8'))
        self.assertIn("if(!response.ok)return;",(ROOT/'sw.js').read_text('utf-8'))
        self.assertIn("mode:'cors'",(ROOT/'sw.js').read_text('utf-8'))
        self.assertIn('MAX_SPRITES=350',(ROOT/'sw.js').read_text('utf-8'))

    def test_local_user_data_keys_remain_unchanged(self):
        app=(ROOT/'app.js').read_text('utf-8')
        for fragment in ["ratings:'gense-note-ratings-v1'", "overrides:'gense-note-islands-v1'", "prefs:'gense-note-prefs-v1'", "indexedDB.open('gense-note-icons',1)"]:
            self.assertIn(fragment,app)
        self.assertEqual(self.master['schema'],1)

if __name__=='__main__':unittest.main()
