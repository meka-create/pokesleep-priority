"""Validate bundled PNG field and app icons without additional dependencies.

A missing/corrupted image must fail CI before Pages deploy. File presence
alone is insufficient for the 9-field offline background feature.
"""
import struct
import unittest
import zlib
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
FIELDS=("greengrass","cyan","taupe","snowdrop","lapis","gold")
LANDSCAPES=("amber-landscape","greengrass-ex","cyan-ex")
APP_ICONS=("apple-touch-icon.png","favicon-32.png","favicon-48.png",
           "icon-192.png","icon-512.png","icon-header-96.png",
           "icon-maskable-192.png","icon-maskable-512.png")
PNG=b"\x89PNG\r\n\x1a\n"


def inspect_png(path):
    data=path.read_bytes()
    if not data.startswith(PNG):
        raise ValueError(f"Invalid PNG signature: {path}")
    offset=8
    dimensions=None
    found_end=False
    while offset<len(data):
        if offset+12>len(data):
            raise ValueError(f"Truncated chunk: {path}")
        size=struct.unpack(">I",data[offset:offset+4])[0]
        kind=data[offset+4:offset+8]
        end=offset+12+size
        if end>len(data):
            raise ValueError(f"Chunk exceeds file: {path}")
        body=data[offset+8:offset+8+size]
        expected=struct.unpack(">I",data[offset+8+size:end])[0]
        if zlib.crc32(kind+body)!=expected:
            raise ValueError(f"Bad CRC: {path}, {kind!r}")
        if kind==b"IHDR":
            if dimensions is not None or size!=13:
                raise ValueError("Duplicate/invalid IHDR")
            dimensions=struct.unpack(">II",body[:8])
        if kind==b"IEND":
            if size or end!=len(data):
                raise ValueError("Bad IEND")
            found_end=True
            break
        offset=end
    if dimensions is None or not found_end:
        raise ValueError(f"Missing IHDR or IEND: {path}")
    return dimensions


class PNGAssetsTest(unittest.TestCase):
    def test_all_field_bands_are_complete_images(self):
        for item in FIELDS:
            path=ROOT/"assets"/f"field-{item}.png"
            with self.subTest(item=item):
                self.assertTrue(path.is_file(),str(path))
                w,h=inspect_png(path)
                self.assertGreaterEqual(w,100)
                self.assertGreaterEqual(h,45)
                self.assertLessEqual(w,6000)
                self.assertLessEqual(h,6000)

    def test_three_distinct_landscapes_are_complete_jpegs(self):
        import hashlib
        unique=set()
        for item in LANDSCAPES:
            path=ROOT/"assets"/f"field-{item}.jpg"
            with self.subTest(item=item):
                self.assertTrue(path.is_file(),str(path))
                data=path.read_bytes()
                self.assertGreater(len(data),5000)
                self.assertTrue(data.startswith(bytes.fromhex("ffd8ff")))
                self.assertTrue(data.endswith(bytes.fromhex("ffd9")))
                unique.add(hashlib.sha256(data).hexdigest())
        self.assertEqual(len(unique),3,"EX fields and Amber must have distinct scenery")

    def test_app_icons_are_valid_png(self):
        for item in APP_ICONS:
            with self.subTest(item=item):
                path=ROOT/"assets"/item
                self.assertTrue(path.is_file())
                w,h=inspect_png(path)
                self.assertGreater(w,0)
                self.assertGreater(h,0)

if __name__=="__main__":
    unittest.main()
