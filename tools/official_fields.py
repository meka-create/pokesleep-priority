"""Officially confirmed Pokémon Sleep encounter metadata for fresh species.

These records complement scraped/wiki/third-party availability snapshots when
those sources lag an announced release. Keys include a form to prevent spreading
normal-form fields to unrelated variants. Keep this list intentionally small.

Source (2026-11-04 announcement; playable from 2026-11-16 15:00 JST):
https://www.pokemonsleep.net/news/343537333535313639343230353431393637/
"""
OFFICIAL_ENCOUNTERS = {
    '546:default': ('すやすや', (0, 1, 6, 7, 8)),  # モンメン
    '547:default': ('すやすや', (0, 1, 6, 7, 8)),  # エルフーン
}
