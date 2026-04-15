/**
 * app.js — UI controller for the CP/IV Calculator
 */
import { calcCP, calcHP, ivPct, reverseCalc, LEVELS } from './calc.js';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let allSpecies = {};       // { speciesId: { name, dex, atk, def, sta } }
let selectedSpecies = null; // current species entry
let suggestionsVisible = false;

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------
async function loadSpecies() {
  try {
    const res = await fetch('pokemon_stats.json');
    allSpecies = await res.json();
    populateRecents();
  } catch (e) {
    showError('Could not load species data. Make sure pokemon_stats.json is present.');
  }
}

// ---------------------------------------------------------------------------
// Species search / autocomplete
// ---------------------------------------------------------------------------
const speciesInput = document.getElementById('species-input');
const suggestionBox = document.getElementById('species-suggestions');
const clearBtn = document.getElementById('species-clear');

function searchSpecies(query) {
  if (!query) return [];
  const q = query.toLowerCase().replace(/[^a-z0-9]/g, '');
  const results = [];
  for (const [id, entry] of Object.entries(allSpecies)) {
    const idNorm = id.replace(/[^a-z0-9]/g, '');
    const nameNorm = entry.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const score = idNorm.startsWith(q) || nameNorm.startsWith(q) ? 2
                : idNorm.includes(q) || nameNorm.includes(q) ? 1 : 0;
    if (score) results.push({ id, entry, score });
  }
  results.sort((a, b) => b.score - a.score || a.entry.dex - b.entry.dex);
  return results.slice(0, 10);
}

function renderSuggestions(matches) {
  suggestionBox.innerHTML = '';
  if (!matches.length) {
    suggestionBox.classList.remove('visible');
    return;
  }
  for (const { id, entry } of matches) {
    const div = document.createElement('div');
    div.className = 'suggestion-item';
    div.innerHTML = `<span class="sug-dex">#${entry.dex}</span> <span class="sug-name">${entry.name}</span>`;
    div.addEventListener('mousedown', e => {
      e.preventDefault();
      selectSpecies(id, entry);
    });
    suggestionBox.appendChild(div);
  }
  suggestionBox.classList.add('visible');
  suggestionsVisible = true;
}

function selectSpecies(id, entry) {
  selectedSpecies = { id, ...entry };
  speciesInput.value = entry.name;
  suggestionBox.classList.remove('visible');
  suggestionsVisible = false;
  clearBtn.style.display = 'flex';
  saveRecent(id, entry);
  updateURL();
}

speciesInput.addEventListener('input', () => {
  const q = speciesInput.value.trim();
  if (!q) {
    suggestionBox.classList.remove('visible');
    selectedSpecies = null;
    clearBtn.style.display = 'none';
    return;
  }
  renderSuggestions(searchSpecies(q));
});

speciesInput.addEventListener('keydown', e => {
  const items = suggestionBox.querySelectorAll('.suggestion-item');
  const active = suggestionBox.querySelector('.suggestion-item.active');
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    const next = active ? active.nextElementSibling : items[0];
    active?.classList.remove('active');
    next?.classList.add('active');
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    const prev = active?.previousElementSibling;
    active?.classList.remove('active');
    prev?.classList.add('active');
  } else if (e.key === 'Enter') {
    if (active) {
      active.dispatchEvent(new MouseEvent('mousedown'));
    } else if (items[0]) {
      items[0].dispatchEvent(new MouseEvent('mousedown'));
    }
  } else if (e.key === 'Escape') {
    suggestionBox.classList.remove('visible');
  }
});

speciesInput.addEventListener('blur', () => {
  setTimeout(() => {
    suggestionBox.classList.remove('visible');
    suggestionsVisible = false;
  }, 150);
});

clearBtn.addEventListener('click', () => {
  speciesInput.value = '';
  selectedSpecies = null;
  clearBtn.style.display = 'none';
  suggestionBox.classList.remove('visible');
  document.getElementById('results').innerHTML = '';
  document.getElementById('forward-result').innerHTML = '';
  updateURL();
  speciesInput.focus();
});

// ---------------------------------------------------------------------------
// Recents
// ---------------------------------------------------------------------------
const RECENTS_KEY = 'cpiv_recents';

function saveRecent(id, entry) {
  let recents = getRecents();
  recents = recents.filter(r => r.id !== id);
  recents.unshift({ id, name: entry.name, dex: entry.dex });
  localStorage.setItem(RECENTS_KEY, JSON.stringify(recents.slice(0, 6)));
  populateRecents();
}

function getRecents() {
  try { return JSON.parse(localStorage.getItem(RECENTS_KEY)) || []; }
  catch { return []; }
}

function populateRecents() {
  const recents = getRecents();
  const box = document.getElementById('recents');
  if (!recents.length) { box.innerHTML = ''; return; }
  box.innerHTML = recents.map(r =>
    `<button class="recent-chip" data-id="${r.id}">${r.name}</button>`
  ).join('');
  box.querySelectorAll('.recent-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const entry = allSpecies[id];
      if (entry) selectSpecies(id, entry);
    });
  });
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`panel-${btn.dataset.tab}`).classList.add('active');
    updateURL();
  });
});

// ---------------------------------------------------------------------------
// Appraisal buttons
// ---------------------------------------------------------------------------
let appraisalValue = null;

document.querySelectorAll('.appraisal-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.appraisal-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    appraisalValue = btn.dataset.val === '' ? null : parseInt(btn.dataset.val);
  });
});

// ---------------------------------------------------------------------------
// Source → min-iv mapping
// ---------------------------------------------------------------------------
const SOURCE_MIN_IV = { wild: 0, weather: 4, raid: 10, lucky: 12 };

// ---------------------------------------------------------------------------
// Reverse search
// ---------------------------------------------------------------------------
document.getElementById('search-btn').addEventListener('click', runReverse);
document.getElementById('cp-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') runReverse();
});

function runReverse() {
  const resultsEl = document.getElementById('results');

  if (!selectedSpecies) {
    resultsEl.innerHTML = '<p class="error">Select a Pokémon first.</p>';
    return;
  }

  const cpRaw = document.getElementById('cp-input').value.trim();
  const targetCP = parseInt(cpRaw);
  if (!cpRaw || isNaN(targetCP) || targetCP < 10) {
    resultsEl.innerHTML = '<p class="error">Enter a valid CP (minimum 10).</p>';
    return;
  }

  const source = document.getElementById('source-select').value;
  const minIV = SOURCE_MIN_IV[source] ?? 0;
  const levelPin = document.getElementById('level-select').value;
  const pinLevel = levelPin ? parseFloat(levelPin) : null;

  resultsEl.innerHTML = '<p class="searching">Searching…</p>';

  // Defer to avoid blocking the UI paint
  setTimeout(() => {
    const { atk, def, sta } = selectedSpecies;
    const results = reverseCalc(atk, def, sta, targetCP, {
      minIV,
      pinLevel,
      appraisal: appraisalValue,
    });

    renderReverseResults(results, targetCP);
    updateURL();
  }, 10);
}

function renderReverseResults(results, targetCP) {
  const el = document.getElementById('results');
  const name = selectedSpecies.name;

  if (!results.length) {
    el.innerHTML = `
      <div class="no-results">
        <p>No matches for <strong>${name}</strong> at CP ${targetCP}.</p>
        <p class="hint">Try removing filters, or double-check the CP.</p>
      </div>`;
    return;
  }

  const displayed = results.slice(0, 200);
  const more = results.length - displayed.length;

  const rows = displayed.map(({ level, a, d, s, pct }) => {
    const cls = pct === 100 ? ' class="perfect"' : pct >= 93.4 ? ' class="great"' : '';
    return `<tr${cls}>
      <td>${level % 1 === 0 ? level.toFixed(0) : level.toFixed(1)}</td>
      <td>${a}</td><td>${d}</td><td>${s}</td>
      <td>${pct.toFixed(1)}%</td>
      <td>${a + d + s}</td>
    </tr>`;
  }).join('');

  el.innerHTML = `
    <div class="results-header">
      <span class="results-title">${name} — CP ${targetCP}</span>
      <span class="results-count">${results.length} match${results.length !== 1 ? 'es' : ''}</span>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Lv</th><th>Atk</th><th>Def</th><th>Sta</th><th>IV%</th><th>Sum</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${more ? `<p class="more-hint">…${more} more hidden. Add filters to narrow down.</p>` : ''}
  `;
}

// ---------------------------------------------------------------------------
// Forward calc
// ---------------------------------------------------------------------------
document.getElementById('calc-btn').addEventListener('click', runForward);

function runForward() {
  const el = document.getElementById('forward-result');

  if (!selectedSpecies) {
    el.innerHTML = '<p class="error">Select a Pokémon first.</p>';
    return;
  }

  let a = parseInt(document.getElementById('atk-iv').value);
  let d = parseInt(document.getElementById('def-iv').value);
  let s = parseInt(document.getElementById('sta-iv').value);
  const level = parseFloat(document.getElementById('level-input').value);

  if (document.getElementById('purified-check').checked) {
    a = Math.min(15, a + 2);
    d = Math.min(15, d + 2);
    s = Math.min(15, s + 2);
  }

  if ([a, d, s].some(v => isNaN(v) || v < 0 || v > 15)) {
    el.innerHTML = '<p class="error">IVs must be 0–15.</p>';
    return;
  }
  if (isNaN(level) || level < 1 || level > 51) {
    el.innerHTML = '<p class="error">Level must be 1–51.</p>';
    return;
  }

  const snapped = Math.round(level * 2) / 2;
  const { atk, def, sta, name } = selectedSpecies;

  const cp = calcCP(atk, def, sta, a, d, s, snapped);
  const hp = calcHP(sta, s, snapped);
  const pct = ivPct(a, d, s);

  el.innerHTML = `
    <div class="forward-result-box">
      <div class="result-name">${name}  <span class="result-level">Lv ${snapped}</span></div>
      <div class="result-ivs">${a} / ${d} / ${s} <span class="result-pct">(${pct.toFixed(1)}%)</span></div>
      <div class="result-cp">CP <strong>${cp}</strong></div>
      <div class="result-hp">HP ${hp}</div>
    </div>
  `;
  updateURL();
}

// Quick-set level buttons
document.querySelectorAll('.level-preset').forEach(btn => {
  btn.addEventListener('click', () => {
    document.getElementById('level-input').value = btn.dataset.level;
  });
});

// ---------------------------------------------------------------------------
// Dark / light mode
// ---------------------------------------------------------------------------
const themeBtn = document.getElementById('theme-toggle');
const saved = localStorage.getItem('cpiv_theme');
if (saved === 'dark') document.documentElement.setAttribute('data-theme', 'dark');

themeBtn.addEventListener('click', () => {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  document.documentElement.setAttribute('data-theme', isDark ? 'light' : 'dark');
  localStorage.setItem('cpiv_theme', isDark ? 'light' : 'dark');
});

// ---------------------------------------------------------------------------
// Shareable URL
// ---------------------------------------------------------------------------
function updateURL() {
  const params = new URLSearchParams();
  const activeTab = document.querySelector('.tab-btn.active')?.dataset.tab;
  if (activeTab && activeTab !== 'reverse') params.set('tab', activeTab);
  if (selectedSpecies) params.set('pokemon', selectedSpecies.id);

  if (activeTab === 'reverse') {
    const cp = document.getElementById('cp-input').value;
    if (cp) params.set('cp', cp);
  } else {
    const a = document.getElementById('atk-iv').value;
    const d = document.getElementById('def-iv').value;
    const s = document.getElementById('sta-iv').value;
    const lv = document.getElementById('level-input').value;
    if (a !== '15') params.set('a', a);
    if (d !== '15') params.set('d', d);
    if (s !== '15') params.set('s', s);
    if (lv !== '40') params.set('lv', lv);
  }

  const url = params.toString() ? `?${params}` : location.pathname;
  history.replaceState(null, '', url);
}

function loadFromURL() {
  const params = new URLSearchParams(location.search);
  const tab = params.get('tab');
  if (tab) {
    document.querySelector(`.tab-btn[data-tab="${tab}"]`)?.click();
  }
  const pokemonId = params.get('pokemon');
  if (pokemonId && allSpecies[pokemonId]) {
    selectSpecies(pokemonId, allSpecies[pokemonId]);
  }
  const cp = params.get('cp');
  if (cp) {
    document.getElementById('cp-input').value = cp;
    if (pokemonId && allSpecies[pokemonId]) runReverse();
  }
  const a = params.get('a'), d = params.get('d'), s = params.get('s'), lv = params.get('lv');
  if (a) document.getElementById('atk-iv').value = a;
  if (d) document.getElementById('def-iv').value = d;
  if (s) document.getElementById('sta-iv').value = s;
  if (lv) document.getElementById('level-input').value = lv;
  if ((a || d || s || lv) && pokemonId && allSpecies[pokemonId]) runForward();
}

// ---------------------------------------------------------------------------
// Error display
// ---------------------------------------------------------------------------
function showError(msg) {
  document.getElementById('results').innerHTML = `<p class="error">${msg}</p>`;
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
(async () => {
  await loadSpecies();
  loadFromURL();
})();
