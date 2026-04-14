#!/usr/bin/env python3
"""
One-time setup: fetch PvPoke's gamemaster.json and extract base stats
into a slim pokemon_stats.json for use by calc.py.

Usage:
  python setup_data.py
  python setup_data.py --output pokemon_stats.json
  python setup_data.py --local gamemaster.json   # if you already have the file
"""

import argparse
import json
import os
import sys
import urllib.request

PVPOKE_URL = (
    "https://raw.githubusercontent.com/pvpoke/pvpoke/master/src/data/gamemaster/pokemon.json"
)
# Fallback: the monolithic gamemaster (larger, same data)
PVPOKE_URL_MONO = (
    "https://raw.githubusercontent.com/pvpoke/pvpoke/master/src/data/gamemaster.json"
)

OUT_DEFAULT = os.path.join(os.path.dirname(__file__), "pokemon_stats.json")


def fetch(url):
    print(f"Fetching {url} …")
    try:
        with urllib.request.urlopen(url, timeout=30) as r:
            return json.loads(r.read())
    except Exception as e:
        return None, str(e)


def parse_pvpoke_pokemon_list(data):
    """Parse PvPoke's pokemon.json (list of species objects)."""
    out = {}
    for entry in data:
        species_id = entry.get("speciesId", "")
        if not species_id:
            continue
        bs = entry.get("baseStats", {})
        atk = bs.get("atk")
        def_ = bs.get("def")
        hp = bs.get("hp")
        if None in (atk, def_, hp):
            continue
        name = entry.get("speciesName", species_id).replace("_", " ").title()
        dex = entry.get("dex", 0)
        out[species_id] = {"name": name, "dex": dex, "atk": atk, "def": def_, "sta": hp}
    return out


def parse_pvpoke_mono(data):
    """Parse PvPoke's monolithic gamemaster.json, which has a 'pokemon' list."""
    pokemon_list = data.get("pokemon", [])
    if not pokemon_list:
        # Some versions nest differently
        pokemon_list = data
    return parse_pvpoke_pokemon_list(pokemon_list)


def main():
    parser = argparse.ArgumentParser(description="Fetch and build pokemon_stats.json")
    parser.add_argument("--output", "-o", default=OUT_DEFAULT, help="Output file path")
    parser.add_argument("--local", "-l", default=None,
                        help="Path to a local gamemaster.json instead of fetching")
    args = parser.parse_args()

    if args.local:
        print(f"Loading local file: {args.local}")
        with open(args.local) as f:
            raw = json.load(f)
        # Could be a list or a dict with 'pokemon' key
        if isinstance(raw, list):
            db = parse_pvpoke_pokemon_list(raw)
        else:
            db = parse_pvpoke_mono(raw)
    else:
        # Try the slimmer per-species endpoint first
        raw = fetch(PVPOKE_URL)
        if raw is None or isinstance(raw, tuple):
            print("Primary URL failed, trying fallback …")
            raw = fetch(PVPOKE_URL_MONO)
            if raw is None or isinstance(raw, tuple):
                sys.exit("Could not fetch gamemaster. Check your internet connection.")
            db = parse_pvpoke_mono(raw)
        elif isinstance(raw, list):
            db = parse_pvpoke_pokemon_list(raw)
        else:
            db = parse_pvpoke_mono(raw)

    if not db:
        sys.exit("Parsing produced no entries — the gamemaster format may have changed.")

    with open(args.output, "w") as f:
        json.dump(db, f, separators=(",", ":"))

    print(f"Wrote {len(db)} species to {args.output}")
    print("You can now run:  python calc.py list")


if __name__ == "__main__":
    main()
