#!/usr/bin/env python3
"""Import the exact user-provided icon pack from an immutable upstream commit."""
from __future__ import annotations
import hashlib
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE_COMMIT = "6e726dea66d6f5815a24606e676a44a35c54c4fd"
SOURCE_URL = "https://raw.githubusercontent.com/meka-create/pokesleep-odds/" + SOURCE_COMMIT + "/assets/"
SHA256 = {
  "apple-touch-icon.png": "bdc88be6b61ef220a6c7f6af4a169439dc0c93d85d1b8266c78e5fd5556a4bf4",
  "icon-512.png": "ef9afac8824e2733046adab47e802f71fd483bcf443c44a02052ed1a9ae40db2",
  "favicon-48.png": "ece2534bb344cfcc29e2a0f4f8b7cdfab311edde5997c9868c232f98f187ee0f",
  "icon-maskable-512.png": "3ebd5c608bfbfcdeed9e258b9e38fe02565d19e4ffea13bfb6d03a55ee3224db",
  "favicon-32.png": "074654a07037fefa3a6dbbcee564925fba4699114f4b5e898ab4b927b4a4f0fb",
  "icon-header-96.png": "bc6a87c2b51f30bf511bab85e188dc4652bceaea2bd866ef4f4b33fd4da8b8a6",
  "icon-192.png": "90a8672c41acae941e17c50595d307936e5dd187c47c14015a91c79550f44331",
  "icon-maskable-192.png": "e14508b3a3bf38e2f849472153904a19a771561f6971c287bb88ceba315ee281"
}

def bootstrap(fetch=None):
    fetch = fetch or urllib.request.urlopen
    for name, expected in SHA256.items():
        target = ROOT / "assets" / name
        if target.exists() and hashlib.sha256(target.read_bytes()).hexdigest() == expected:
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        last_error = None
        for attempt in range(3):
            try:
                request = urllib.request.Request(SOURCE_URL+name, headers={"User-Agent":"pokesleep-priority-icon-bootstrap/1.0"})
                with fetch(request, timeout=35) as response:
                    image = response.read()
                if hashlib.sha256(image).hexdigest() != expected:
                    raise ValueError(f"Icon integrity mismatch: {name}")
                tmp = target.with_suffix(target.suffix + ".tmp")
                tmp.write_bytes(image)
                tmp.replace(target)
                print(f"Installed verified icon: {name}")
                break
            except Exception as exc:
                last_error = exc
                if attempt < 2: time.sleep(attempt + 1)
        else:
            raise RuntimeError(f"Unable to import {name}: {last_error}")

if __name__ == "__main__":
    bootstrap()
