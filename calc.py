#!/usr/bin/env python3
"""
Pokémon GO CP ↔ IV Calculator — v0.1

Usage:
  python calc.py forward --pokemon mewtwo --atk 15 --def 15 --sta 15 --level 40
  python calc.py reverse --pokemon mewtwo --cp 4178
  python calc.py reverse --pokemon mewtwo --cp 2387 --min-iv 10 --level 20
  python calc.py list
  python calc.py list | grep -i pikachu
"""

import argparse
import json
import math
import os
import sys

# ---------------------------------------------------------------------------
# CPM TABLE
# Whole-level values (levels 1–51) are the primary data; half-level values
# are derived via: CPM(L+0.5) = sqrt((CPM(L)² + CPM(L+1)²) / 2)
#
# Levels 1–20: sourced from Niantic's Game Master (accurate).
# Levels 21–51: linearly interpolated between spec reference points
#   (25=0.6679, 30=0.7317, 35=0.7612, 40=0.7903, 45=0.8108, 50=0.8403,
#    51=0.9171).  Run 'python setup_data.py' to replace with exact values.
# ---------------------------------------------------------------------------
_WHOLE_CPM = [
    0.09399414,  # 1
    0.16639787,  # 2
    0.21573247,  # 3
    0.25572005,  # 4
    0.29024988,  # 5
    0.32108760,  # 6
    0.34921268,  # 7
    0.37523559,  # 8
    0.39956728,  # 9
    0.42250003,  # 10
    0.44310755,  # 11
    0.46279839,  # 12
    0.48168495,  # 13
    0.49984500,  # 14
    0.51735985,  # 15
    0.53430003,  # 16
    0.55070996,  # 17
    0.56663001,  # 18
    0.58209556,  # 19
    0.59740001,  # 20
    # Approximate (spec reference pts + linear interpolation between them):
    0.61150000,  # 21
    0.62560000,  # 22
    0.63970000,  # 23
    0.65380000,  # 24
    0.66790000,  # 25  spec ≈ 0.6679
    0.68066000,  # 26
    0.69342000,  # 27
    0.70618000,  # 28
    0.71894000,  # 29
    0.73170000,  # 30  spec ≈ 0.7317
    0.73760000,  # 31
    0.74350000,  # 32
    0.74940000,  # 33
    0.75530000,  # 34
    0.76120000,  # 35  spec ≈ 0.7612
    0.76702000,  # 36
    0.77284000,  # 37
    0.77866000,  # 38
    0.78448000,  # 39
    0.79030000,  # 40  spec ≈ 0.7903
    0.79440000,  # 41
    0.79850000,  # 42
    0.80260000,  # 43
    0.80670000,  # 44
    0.81080000,  # 45  spec ≈ 0.8108
    0.81670000,  # 46
    0.82260000,  # 47
    0.82850000,  # 48
    0.83440000,  # 49
    0.84030000,  # 50  spec ≈ 0.8403
    0.91710000,  # 51  Best Buddy (spec ≈ 0.9171)
]

# Build full 101-entry CPM lookup (levels 1, 1.5, 2, … 50.5, 51)
_whole_levels = list(range(1, 52))
CPM = {float(L): _WHOLE_CPM[i] for i, L in enumerate(_whole_levels)}
for i in range(50):
    L = i + 1
    lo, hi = _WHOLE_CPM[i], _WHOLE_CPM[i + 1]
    CPM[L + 0.5] = math.sqrt((lo ** 2 + hi ** 2) / 2)

LEVELS = sorted(CPM.keys())  # 101 entries: 1.0, 1.5, 2.0, … 51.0


def _load_exact_cpm():
    """Optionally replace hardcoded CPMs with exact values from setup_data.py."""
    path = os.path.join(os.path.dirname(__file__), "cpm_table.json")
    if not os.path.exists(path):
        return
    with open(path) as f:
        data = json.load(f)
    if isinstance(data, list):
        for lvl, val in data:
            CPM[round(float(lvl), 1)] = val
    elif isinstance(data, dict):
        for k, v in data.items():
            CPM[round(float(k), 1)] = v


_load_exact_cpm()

# ---------------------------------------------------------------------------
# Appraisal tiers (IV sum 0–45)
# ---------------------------------------------------------------------------
APPRAISAL_RANGES = {0: (0, 22), 1: (23, 29), 2: (30, 36), 3: (37, 45)}

# ---------------------------------------------------------------------------
# Species data
# ---------------------------------------------------------------------------
_STATS_FILE = os.path.join(os.path.dirname(__file__), "pokemon_stats.json")


def load_stats():
    if not os.path.exists(_STATS_FILE):
        sys.exit(
            f"Error: {_STATS_FILE} not found.\n"
            "Run 'python setup_data.py' to download full Pokémon data."
        )
    with open(_STATS_FILE) as f:
        return json.load(f)


def find_pokemon(db, name):
    key = name.lower().replace(" ", "-")
    if key in db:
        return key, db[key]
    matches = [(k, v) for k, v in db.items() if key in k]
    if len(matches) == 1:
        return matches[0]
    if len(matches) > 1:
        sys.exit(
            f"Ambiguous '{name}'. Matches: {', '.join(m[0] for m in matches[:10])}"
        )
    sys.exit(
        f"'{name}' not found. Run 'python calc.py list' to see loaded species."
    )


# ---------------------------------------------------------------------------
# Core math
# ---------------------------------------------------------------------------

def calc_cp(base_atk, base_def, base_sta, atk_iv, def_iv, sta_iv, level):
    cpm = CPM[level]
    cp = math.floor(
        (base_atk + atk_iv)
        * math.sqrt(base_def + def_iv)
        * math.sqrt(base_sta + sta_iv)
        * cpm ** 2
        / 10
    )
    return max(10, cp)


def calc_hp(base_sta, sta_iv, level):
    return max(10, math.floor((base_sta + sta_iv) * CPM[level]))


def iv_pct(a, d, s):
    return round((a + d + s) / 45 * 100, 1)


# ---------------------------------------------------------------------------
# Subcommands
# ---------------------------------------------------------------------------

def cmd_forward(args):
    db = load_stats()
    key, entry = find_pokemon(db, args.pokemon)

    level = args.level
    if level not in CPM:
        sys.exit(f"Invalid level {level}.")

    a, d, s = args.atk, getattr(args, "def"), args.sta
    if args.purified:
        a, d, s = min(15, a + 2), min(15, d + 2), min(15, s + 2)

    for iv in (a, d, s):
        if not 0 <= iv <= 15:
            sys.exit("IVs must be 0–15.")

    cp = calc_cp(entry["atk"], entry["def"], entry["sta"], a, d, s, level)
    hp = calc_hp(entry["sta"], s, level)

    print(f"\n{entry['name']}  (Lv {level})")
    print(f"  IVs : {a}/{d}/{s}  ({iv_pct(a, d, s)}%)")
    print(f"  CP  : {cp}")
    print(f"  HP  : {hp}")


def cmd_reverse(args):
    db = load_stats()
    key, entry = find_pokemon(db, args.pokemon)

    target_cp = args.cp
    min_iv = args.min_iv
    appraisal = args.appraisal
    pin_level = args.level

    base_atk, base_def, base_sta = entry["atk"], entry["def"], entry["sta"]

    if pin_level is not None:
        if pin_level not in CPM:
            sys.exit(f"Invalid level {pin_level}.")
        search_levels = [pin_level]
    elif args.min_level is not None or args.max_level is not None:
        lo = args.min_level or 1.0
        hi = args.max_level or 51.0
        search_levels = [lvl for lvl in LEVELS if lo <= lvl <= hi]
    else:
        search_levels = LEVELS

    if appraisal is not None:
        sum_lo, sum_hi = APPRAISAL_RANGES[appraisal]
    else:
        sum_lo, sum_hi = 0, 45

    results = []
    for level in search_levels:
        for a in range(min_iv, 16):
            for d in range(min_iv, 16):
                for s in range(min_iv, 16):
                    iv_sum = a + d + s
                    if not (sum_lo <= iv_sum <= sum_hi):
                        continue
                    if calc_cp(base_atk, base_def, base_sta, a, d, s, level) == target_cp:
                        results.append((level, a, d, s))

    if not results:
        print(f"\nNo matches for {entry['name']} at CP {target_cp}.")
        filters = []
        if min_iv:
            filters.append(f"--min-iv {min_iv}")
        if pin_level:
            filters.append(f"--level {pin_level}")
        if args.min_level:
            filters.append(f"--min-level {args.min_level}")
        if args.max_level:
            filters.append(f"--max-level {args.max_level}")
        if appraisal is not None:
            filters.append(f"--appraisal {appraisal}")
        if filters:
            print(f"  Active filters: {', '.join(filters)} — try removing some.")
        return

    results.sort(key=lambda r: (iv_pct(r[1], r[2], r[3]), r[0]), reverse=True)

    print(f"\n{entry['name']}  CP {target_cp}  — {len(results)} match(es)\n")
    hdr = f"{'Level':>6}  {'Atk':>3}  {'Def':>3}  {'Sta':>3}  {'IV%':>6}  {'Sum':>4}"
    print(hdr)
    print("-" * len(hdr))

    for level, a, d, s in results[:200]:
        print(f"{level:>6.1f}  {a:>3}  {d:>3}  {s:>3}  {iv_pct(a,d,s):>5.1f}%  {a+d+s:>4}")

    if len(results) > 200:
        print(
            f"\n  … {len(results) - 200} more hidden. "
            "Use --min-iv, --level, --appraisal, --min-level / --max-level to filter."
        )


def cmd_list(args):
    db = load_stats()
    items = sorted(db.items(), key=lambda x: (x[1].get("dex", 9999), x[0]))
    print(f"\n{'#':>4}  {'Key':<32}  {'Name':<28}  Atk  Def  Sta")
    print("-" * 78)
    for key, e in items:
        print(f"{e.get('dex','?'):>4}  {key:<32}  {e['name']:<28}  {e['atk']:>3}  {e['def']:>3}  {e['sta']:>3}")
    print(f"\n{len(db)} species loaded from {_STATS_FILE}")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def level_type(s):
    try:
        v = round(float(s) * 2) / 2  # snap to nearest 0.5
    except ValueError:
        raise argparse.ArgumentTypeError(f"'{s}' is not a valid level.")
    if not (1.0 <= v <= 51.0):
        raise argparse.ArgumentTypeError("Level must be 1–51.")
    return v


def main():
    parser = argparse.ArgumentParser(
        prog="calc.py",
        description="Pokémon GO CP ↔ IV Calculator",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    sub = parser.add_subparsers(dest="command", required=True)

    # forward
    fwd = sub.add_parser("forward", aliases=["f"], help="CP from IVs + level")
    fwd.add_argument("--pokemon", "-p", required=True)
    fwd.add_argument("--atk", "-a", type=int, required=True)
    fwd.add_argument("--def", "-d", type=int, required=True, dest="def")
    fwd.add_argument("--sta", "-s", type=int, required=True)
    fwd.add_argument("--level", "-l", type=level_type, required=True)
    fwd.add_argument("--purified", action="store_true", help="+2 to each IV (cap 15)")
    fwd.set_defaults(func=cmd_forward)

    # reverse
    rev = sub.add_parser("reverse", aliases=["r"], help="All IV combos for a given CP")
    rev.add_argument("--pokemon", "-p", required=True)
    rev.add_argument("--cp", "-c", type=int, required=True)
    rev.add_argument("--min-iv", type=int, default=0, metavar="N",
                     help="IV floor per stat (10=raid/egg, 12=lucky, 0=wild)")
    rev.add_argument("--level", "-l", type=level_type, default=None,
                     help="Pin to one level (e.g. 20 for raid, 25 for weather)")
    rev.add_argument("--min-level", type=level_type, default=None)
    rev.add_argument("--max-level", type=level_type, default=None)
    rev.add_argument("--appraisal", type=int, choices=[0, 1, 2, 3], default=None,
                     help="0=0★(0-22) 1=1★(23-29) 2=2★(30-36) 3=3★(37-45)")
    rev.set_defaults(func=cmd_reverse)

    # list
    lst = sub.add_parser("list", aliases=["ls"], help="Show all loaded species")
    lst.set_defaults(func=cmd_list)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
