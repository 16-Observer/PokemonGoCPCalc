/**
 * Pokémon GO CP ↔ IV Calculator — math module
 * Pure functions, no DOM dependencies. Works in browser and Node.
 */

// ---------------------------------------------------------------------------
// CPM TABLE
// Whole-level CPMs (levels 1–51). Half-levels derived via quadratic mean.
// Levels 1–20: Niantic Game Master (accurate).
// Levels 21–51: interpolated from spec reference points.
// ---------------------------------------------------------------------------
const WHOLE_CPM = [
  0.09399414, // 1
  0.16639787, // 2
  0.21573247, // 3
  0.25572005, // 4
  0.29024988, // 5
  0.32108760, // 6
  0.34921268, // 7
  0.37523559, // 8
  0.39956728, // 9
  0.42250003, // 10
  0.44310755, // 11
  0.46279839, // 12
  0.48168495, // 13
  0.49984500, // 14
  0.51735985, // 15
  0.53430003, // 16
  0.55070996, // 17
  0.56663001, // 18
  0.58209556, // 19
  0.59740001, // 20
  0.61150000, // 21
  0.62560000, // 22
  0.63970000, // 23
  0.65380000, // 24
  0.66790000, // 25  ≈ 0.6679
  0.68066000, // 26
  0.69342000, // 27
  0.70618000, // 28
  0.71894000, // 29
  0.73170000, // 30  ≈ 0.7317
  0.73760000, // 31
  0.74350000, // 32
  0.74940000, // 33
  0.75530000, // 34
  0.76120000, // 35  ≈ 0.7612
  0.76702000, // 36
  0.77284000, // 37
  0.77866000, // 38
  0.78448000, // 39
  0.79030000, // 40  ≈ 0.7903
  0.79440000, // 41
  0.79850000, // 42
  0.80260000, // 43
  0.80670000, // 44
  0.81080000, // 45  ≈ 0.8108
  0.81670000, // 46
  0.82260000, // 47
  0.82850000, // 48
  0.83440000, // 49
  0.84030000, // 50  ≈ 0.8403
  0.91710000, // 51  Best Buddy
];

// Build full 101-entry CPM map and ordered LEVELS array
export const CPM = new Map();
export const LEVELS = [];

for (let i = 0; i < 51; i++) {
  const L = i + 1;
  CPM.set(L, WHOLE_CPM[i]);
  LEVELS.push(L);
  if (i < 50) {
    const halfL = L + 0.5;
    CPM.set(halfL, Math.sqrt((WHOLE_CPM[i] ** 2 + WHOLE_CPM[i + 1] ** 2) / 2));
    LEVELS.push(halfL);
  }
}
LEVELS.push(51); // already added whole level 51 above, but sort for safety

// Appraisal tiers (IV sum 0–45)
export const APPRAISAL_RANGES = {
  0: [0, 22],
  1: [23, 29],
  2: [30, 36],
  3: [37, 45],
};

// ---------------------------------------------------------------------------
// Core math
// ---------------------------------------------------------------------------

export function calcCP(baseAtk, baseDef, baseSta, atkIV, defIV, staIV, level) {
  const cpm = CPM.get(level);
  return Math.max(
    10,
    Math.floor(
      (baseAtk + atkIV) *
      Math.sqrt(baseDef + defIV) *
      Math.sqrt(baseSta + staIV) *
      cpm ** 2 /
      10
    )
  );
}

export function calcHP(baseSta, staIV, level) {
  return Math.max(10, Math.floor((baseSta + staIV) * CPM.get(level)));
}

export function ivPct(a, d, s) {
  return Math.round((a + d + s) / 45 * 1000) / 10;
}

// ---------------------------------------------------------------------------
// Reverse search
// ---------------------------------------------------------------------------

export function reverseCalc(baseAtk, baseDef, baseSta, targetCP, opts = {}) {
  const {
    minIV = 0,
    pinLevel = null,
    minLevel = 1,
    maxLevel = 51,
    appraisal = null,
  } = opts;

  const [sumLo, sumHi] = appraisal !== null ? APPRAISAL_RANGES[appraisal] : [0, 45];
  const searchLevels = pinLevel !== null
    ? [pinLevel]
    : LEVELS.filter(l => l >= minLevel && l <= maxLevel);

  const results = [];
  for (const level of searchLevels) {
    for (let a = minIV; a <= 15; a++) {
      for (let d = minIV; d <= 15; d++) {
        for (let s = minIV; s <= 15; s++) {
          const sum = a + d + s;
          if (sum < sumLo || sum > sumHi) continue;
          if (calcCP(baseAtk, baseDef, baseSta, a, d, s, level) === targetCP) {
            results.push({ level, a, d, s, pct: ivPct(a, d, s) });
          }
        }
      }
    }
  }

  results.sort((x, y) => y.pct - x.pct || y.level - x.level);
  return results;
}

// ---------------------------------------------------------------------------
// Quick self-test (run with: node calc.js)
// ---------------------------------------------------------------------------
if (typeof process !== 'undefined' && process.argv[1]?.endsWith('calc.js')) {
  const tests = [
    // [baseAtk, baseDef, baseSta, a, d, s, level, expected CP]
    [300, 182, 214, 15, 15, 15, 40, 4178],  // Mewtwo 15/15/15 lv40
    [300, 182, 214, 15, 15, 15, 20, 2387],  // Mewtwo 15/15/15 lv20
    [187, 225, 284, 15, 15, 15, 40, 3379],  // Giratina-Altered 15/15/15 lv40
    [225, 187, 284, 15, 15, 15, 40, 3683],  // Giratina-Origin 15/15/15 lv40
    [29,   85,  85, 15, 15, 15, 40,  274],  // Magikarp 15/15/15 lv40
  ];
  let pass = 0;
  for (const [ba, bd, bs, a, d, s, lv, expected] of tests) {
    const got = calcCP(ba, bd, bs, a, d, s, lv);
    const ok = got === expected;
    console.log(`${ok ? '✓' : '✗'} calcCP → ${got} (expected ${expected})`);
    if (ok) pass++;
  }
  console.log(`\n${pass}/${tests.length} tests passed`);
}
