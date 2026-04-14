# Pokémon GO CP ↔ IV Calculator

Bidirectional CP/IV calculator for Pokémon GO. Python CLI, no dependencies beyond the standard library.

---

## Quick Start

The repo ships with ~55 common species so you can use it immediately.  
For all ~1,000+ species, run the setup step first.

```bash
# Optional but recommended — downloads all species from PvPoke's gamemaster
python setup_data.py

# Then use the calculator
python calc.py forward --pokemon mewtwo --atk 15 --def 15 --sta 15 --level 40
python calc.py reverse --pokemon mewtwo --cp 4178
```

---

## Forward Mode — CP from IVs

```
python calc.py forward --pokemon <name> --atk <0-15> --def <0-15> --sta <0-15> --level <1-51>
```

Examples:

```bash
# Perfect Mewtwo at level 40
python calc.py forward --pokemon mewtwo --atk 15 --def 15 --sta 15 --level 40
# → CP 4178

# Raid catch (level 20) with specific IVs
python calc.py forward --pokemon rayquaza --atk 13 --def 11 --sta 15 --level 20

# Purified (adds +2 to each IV, capped at 15)
python calc.py forward --pokemon gengar --atk 13 --def 13 --sta 13 --level 25 --purified
```

**Level shortcuts** (common encounter levels):
| Source | Level |
|--------|-------|
| Raid catch | 20 |
| Weather-boosted raid | 25 |
| Research reward / Egg hatch | 15 or 20 |
| Wild catch max | 30 |
| Powered-up max | 50 |
| Best Buddy max | 51 |

---

## Reverse Mode — IVs from CP

```
python calc.py reverse --pokemon <name> --cp <number> [filters]
```

Returns every (Level, Atk, Def, Sta) combination that produces the observed CP, sorted by IV% descending.

### Filters

| Flag | Description | Example |
|------|-------------|---------|
| `--min-iv N` | Floor on each individual IV | `--min-iv 10` for raid/egg |
| `--level L` | Pin to a specific level | `--level 20` for raid catch |
| `--min-level L` | Level range low bound | `--min-level 20` |
| `--max-level L` | Level range high bound | `--max-level 25` |
| `--appraisal {0-3}` | Filter by appraisal star count | `--appraisal 3` for 3★ |

### IV floors by catch method

| Method | `--min-iv` |
|--------|-----------|
| Wild catch | `0` |
| Weather-boosted wild | `4` (approx) |
| Raid / Egg / Research | `10` |
| Lucky trade | `12` |

### Appraisal tiers

| Stars | `--appraisal` | IV Sum |
|-------|--------------|--------|
| 0 ★ | `0` | 0–22 |
| 1 ★ | `1` | 23–29 |
| 2 ★ | `2` | 30–36 |
| 3 ★ | `3` | 37–45 |

### Examples

```bash
# Raid-caught Mewtwo — pin to level 20, IV floor 10
python calc.py reverse --pokemon mewtwo --cp 2387 --min-iv 10 --level 20

# Weather-boosted raid — search levels 20–25, IV floor 10
python calc.py reverse --pokemon rayquaza --cp 3200 --min-iv 10 --min-level 20 --max-level 25

# Wild catch, 3-star appraisal, level cap 30
python calc.py reverse --pokemon dragonite --cp 2800 --appraisal 3 --max-level 30

# Egg hatch, no other filters
python calc.py reverse --pokemon togekiss --cp 1200 --min-iv 10 --level 20
```

---

## List Species

```bash
python calc.py list
python calc.py list | grep -i galarian
python calc.py list | grep "Giratina"
```

---

## Getting All Species (Setup)

```bash
python setup_data.py
```

Downloads PvPoke's gamemaster and extracts base stats for all ~1,000+ species into `pokemon_stats.json`. Takes a few seconds and requires internet access. Re-run occasionally to pick up newly added Pokémon.

```bash
# If you already have a local gamemaster.json from PvPoke or PokeMiners:
python setup_data.py --local /path/to/gamemaster.json
```

---

## How It Works

**Forward formula** (from Niantic's Game Master):
```
CP = max(10, floor(
    (BaseAtk + AtkIV)
    × sqrt(BaseDef + DefIV)
    × sqrt(BaseSta + StaIV)
    × CPM²
    / 10
))
```

**Reverse algorithm:** brute-force over all 16³ = 4,096 IV combinations × 101 possible levels ≈ 414K calculations per search. Runs in under a second.

**CPM table:** 101 hard-coded values for levels 1–51 in 0.5 increments. Values for levels 1–20 are sourced from the Game Master. Levels 21–51 are interpolated from reference points; run `setup_data.py` to load exact values.

---

## Bundled Species

The repo includes ~55 commonly looked-up Pokémon so the tool works offline without setup:

Mewtwo, Mew, Rayquaza, Dragonite, Tyranitar, Snorlax, Gyarados, Machamp, Gengar, Alakazam, Vaporeon, Jolteon, Flareon, Lapras, Slaking, Garchomp, Lucario, Togekiss, Rhyperior, Metagross, Salamence, Dialga, Palkia, Giratina (both forms), Darkrai, Reshiram, Zekrom, Landorus (Therian), Groudon, Kyogre, Xerneas, Yveltal, and the full Kanto starters + Pikachu/Eevee/Magikarp lines.

---

## Roadmap

| Version | Plan |
|---------|------|
| v0.1 | Python CLI — this |
| v0.2 | Port math to JavaScript module + unit tests |
| v0.3 | Basic web UI (forward mode) |
| v0.4 | Reverse mode UI + filtering |
| v1.0 | Polish, mobile, deploy to Cloudflare Pages |
