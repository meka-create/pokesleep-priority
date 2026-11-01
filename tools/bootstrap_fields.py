#!/usr/bin/env python3
"""Install first-party Pokémon Sleep field artwork once; committed PNGs avoid repeat visits.

Artwork URLs are stable reference sources rather than runtime image requests.
"""
from __future__ import annotations
from pathlib import Path
import time
import urllib.request

ASSETS=Path(__file__).resolve().parents[1]/"assets"
SOURCES={
    "field-greengrass.png":"https://pokemonsleep.mave.me/img/islands/greengrassisle.png",
    "field-cyan.png":"https://pokemonsleep.mave.me/img/islands/cyanbeach.png",
    "field-taupe.png":"https://pokemonsleep.mave.me/img/islands/taupehollow.png",
    "field-snowdrop.png":"https://pokemonsleep.mave.me/img/islands/snowdroptundra.png",
    "field-lapis.png":"https://pokemonsleep.mave.me/img/islands/lapislakeside.png",
    "field-gold.png":"https://pokemonsleep.mave.me/img/islands/oldgoldpowerplant.png",
    "field-amber.png":"https://www.pokepedia.fr/images/f/fa/Carte_Canyon_Ambre_Sleep.png",
}
PNG_SIGNATURE=b"\x89PNG\r\n\x1a\n"

def valid(data:bytes)->bool:
    return data.startswith(PNG_SIGNATURE) and 5000<len(data)<4_000_000

def install():
    ASSETS.mkdir(exist_ok=True,parents=True)
    for name,url in SOURCES.items():
        dest=ASSETS/name
        if dest.is_file() and valid(dest.read_bytes()):
            continue
        for attempt in range(3):
            try:
                request=urllib.request.Request(
                    url,headers={
                      "User-Agent":"Mozilla/5.0 (compatible; GenseNoteFieldArt/1.0)",
                      "Accept":"image/png,image/*;q=0.8"
                    })
                with urllib.request.urlopen(request,timeout=30) as response:
                    data=response.read(4_000_001)
                if not valid(data):
                    raise ValueError("Bad image data or unexpected size: "+name)
                temporary=dest.with_suffix(".png.tmp")
                temporary.write_bytes(data)
                temporary.replace(dest)
                print("Installed",name,len(data),"bytes")
                break
            except Exception as error:
                if attempt==2:
                    raise RuntimeError("Cannot install field artwork: "+name) from error
                time.sleep(1+attempt)
        time.sleep(0.35)

if __name__=="__main__":
    install()
