/* Blackwell Clicker - script.js
   Features:
   - Click button increases score (base click power)
   - Upgrades (per-click upgrades) with cost scaling
   - Auto-clickers (adds CPS) with cost scaling
   - Store items (bulk upgrades)
   - Prestige: reset for prestige points which provide permanent multiplier
   - Save/load via localStorage
   - Floating click animation + simple click sound via WebAudio
*/

"use strict";

/* ---------- Utilities ---------- */
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

function fmt(n) {
  if (n >= 1e12) return (n/1e12).toFixed(2)+"T";
  if (n >= 1e9) return (n/1e9).toFixed(2)+"B";
  if (n >= 1e6) return (n/1e6).toFixed(2)+"M";
  if (n >= 1e3) return (n/1e3).toFixed(2)+"k";
  return Math.floor(n).toString();
}

/* ---------- Game state and default config ---------- */
const DEFAULT_STATE = {
  score: 0,
  totalScore: 0,
  clickPower: 1,
  cps: 0,
  upgrades: {},   // id -> level
  autos: {},      // id -> level
  store: {},      // id -> level
  prestigePoints: 0,
  prestigeMultiplier: 1, // derived from prestigePoints but stored for convenience
  lastSave: Date.now()
};

// Items definitions (baseCost, increment, type)
const UPGRADE_DEFS = [
  { id: 'u1', name: 'Better Finger', desc: '+1 per click', baseCost: 10, increment: 1, type:'click' },
  { id: 'u2', name: 'Strong Grip', desc: '+5 per click', baseCost: 50, increment: 5, type:'click' },
  { id: 'u3', name: 'Mechanical Aid', desc: '+20 per click', baseCost: 200, increment: 20, type:'click' },
];

const AUTO_DEFS = [
  { id: 'a1', name: 'Tiny Auto', desc: 'Generates 1 / sec', baseCost: 30, cps: 1 },
  { id: 'a2', name: 'Robot Hand', desc: 'Generates 8 / sec', baseCost: 400, cps: 8 },
  { id: 'a3', name: 'Factory', desc: 'Generates 60 / sec', baseCost: 4000, cps: 60 },
];

const STORE_DEFS = [
  { id: 's1', name: 'Click Booster', desc: 'Double click power for 1 purchase', baseCost: 1000, effect:'doubleClick' },
];

/* Game vars */
let state = loadState();
let tickInterval = null;
let saveTimeout = null;

/* ---------- DOM refs ---------- */
const scoreDisplay = $('#score-display');
const clickButton = $('#click-button');
const upgradeList = $('#upgrade-list');
const autoList = $('#auto-list');
const storeList = $('#store-list');
const cpsDisplay = $('#cps-display');
const prestigeBtn = $('#prestige-btn');
const prestigePointsEl = $('#prestige-points');
const saveIndicator = $('#save-indicator');
const floatingLayer = $('#floating-layer');
const resetBtn = $('#reset-btn');

/* ---------- Audio (simple click sound using WebAudio) ---------- */
const audioContext = (typeof AudioContext !== 'undefined') ? new AudioContext() : null;
function playClickSound() {
  if (!audioContext) return;
  const o = audioContext.createOscillator();
  const g = audioContext.createGain();
  o.type = 'sine';
  o.frequency.value = 900 + Math.random()*200;
  g.gain.value = 0.06;
  o.connect(g);
  g.connect(audioContext.destination);
  o.start();
  o.stop(audioContext.currentTime + 0.05);
}

/* ---------- Save / Load ---------- */
function saveState() {
  state.lastSave = Date.now();
  localStorage.setItem('bw_clicker_v1', JSON.stringify(state));
  saveIndicator.textContent = 'Saved';
  saveIndicator.style.opacity = '1';
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(()=> saveIndicator.style.opacity = '0.6', 900);
}

function loadState() {
  const raw = localStorage.getItem('bw_clicker_v1');
  if (!raw) return JSON.parse(JSON.stringify(DEFAULT_STATE));
  try {
    const parsed = JSON.parse(raw);
    // ensure defaults for missing keys
    return Object.assign(JSON.parse(JSON.stringify(DEFAULT_STATE)), parsed);
  } catch(e) {
    console.warn('Failed to parse save; resetting.');
    return JSON.parse(JSON.stringify(DEFAULT_STATE));
  }
}

function hardReset() {
  if (!confirm('Reset all progress? This cannot be undone.')) return;
  state = JSON.parse(JSON.stringify(DEFAULT_STATE));
  saveState();
  refreshUI(true);
}

/* ---------- Game logic ---------- */
function costFor(baseCost, level) {
  // Typical incremental scaling: base * 1.15^level
  return Math.ceil(baseCost * Math.pow(1.25, level));
}

function addScore(n, opts={floating:true}) {
  const realAdd = n * state.prestigeMultiplier;
  state.score += realAdd;
  state.totalScore += realAdd;
  if (opts.floating) spawnFloatingText(`+${fmt(n)}`);
}

function computeCPS() {
  // Sum autos
  let cps = 0;
  for (const def of AUTO_DEFS) {
    const lvl = state.autos[def.id] || 0;
    // each level of this auto provides def.cps
    cps += lvl * def.cps;
  }
  state.cps = cps;
}

/* ---------- UI building ---------- */
function buildUpgrades() {
  upgradeList.innerHTML = '';
  for (const def of UPGRADE_DEFS) {
    const lvl = state.upgrades[def.id] || 0;
    const cost = costFor(def.baseCost, lvl);
    const btn = document.createElement('button');
    btn.className = 'upgrade-item';
    if (state.score < cost) btn.classList.add('disabled');
    btn.innerHTML = `
      <div class="upgrade-left">
        <div class="upgrade-name">${def.name} <small style="color:var(--muted)"> (x${lvl})</small></div>
        <div class="upgrade-desc">${def.desc}</div>
      </div>
      <div class="upgrade-right">
        <div>Cost: ${fmt(cost)}</div>
        <div style="font-size:0.82rem;color:var(--muted)">+${fmt(def.increment)} / click</div>
      </div>
    `;
    btn.addEventListener('click', () => {
      if (state.score < cost) return;
      state.score -= cost;
      state.upgrades[def.id] = (state.upgrades[def.id] || 0) + 1;
      state.clickPower += def.increment;
      // reflect clickPower directly for compatibility, but click uses clickPower always
      saveState();
      refreshUI();
    });
    upgradeList.appendChild(btn);
  }
}

function buildAutos() {
  autoList.innerHTML = '';
  for (const def of AUTO_DEFS) {
    const lvl = state.autos[def.id] || 0;
    const cost = costFor(def.baseCost, lvl);
    const btn = document.createElement('button');
    btn.className = 'upgrade-item';
    if (state.score < cost) btn.classList.add('disabled');
    btn.innerHTML = `
      <div class="upgrade-left">
        <div class="upgrade-name">${def.name} <small style="color:var(--muted)">(x${lvl})</small></div>
        <div class="upgrade-desc">${def.desc}</div>
      </div>
      <div class="upgrade-right">
        <div>Cost: ${fmt(cost)}</div>
        <div style="font-size:0.82rem;color:var(--muted)">${fmt(def.cps)} / sec</div>
      </div>
    `;
    btn.addEventListener('click', () => {
      if (state.score < cost) return;
      state.score -= cost;
      state.autos[def.id] = (state.autos[def.id] || 0) + 1;
      computeCPS();
      saveState();
      refreshUI();
    });
    autoList.appendChild(btn);
  }
}

function buildStore() {
  storeList.innerHTML = '';
  for (const def of STORE_DEFS) {
    const lvl = state.store[def.id] || 0;
    const cost = costFor(def.baseCost, lvl);
    const btn = document.createElement('button');
    btn.className = 'upgrade-item';
    if (state.score < cost) btn.classList.add('disabled');
    btn.innerHTML = `
      <div class="upgrade-left">
        <div class="upgrade-name">${def.name} <small style="color:var(--muted)">(x${lvl})</small></div>
        <div class="upgrade-desc">${def.desc}</div>
      </div>
      <div class="upgrade-right">
        <div>Cost: ${fmt(cost)}</div>
      </div>
    `;
    btn.addEventListener('click', () => {
      if (state.score < cost) return;
      state.score -= cost;
      state.store[def.id] = (state.store[def.id] || 0) + 1;
      // example effect
      if (def.effect === 'doubleClick') {
        state.clickPower *= 2;
      }
      saveState();
      refreshUI();
    });
    storeList.appendChild(btn);
  }
}

/* ---------- Floating text animation ---------- */
function spawnFloatingText(text) {
  const el = document.createElement('div');
  el.className = 'float-text';
  el.textContent = text;
  const width = floatingLayer.clientWidth || 200;
  const x = Math.random() * (width - 40) + 20;
  el.style.left = `${x}px`;
  el.style.top = `0px`;
  el.style.color = '#bdeafe';
  floatingLayer.appendChild(el);
  setTimeout(()=> {
    el.remove();
  }, 1000);
}

/* ---------- Prestige ---------- */
function computePrestigePointsFromScore(score) {
  // 1 prestige point for each 10k totalScore (can change)
  return Math.floor(score / 10000);
}

function refreshPrestigeInfo() {
  prestigePointsEl.textContent = fmt(state.prestigePoints);
  const can = computePrestigePointsFromScore(state.totalScore) > state.prestigePoints;
  prestigeBtn.disabled = !can;
  prestigeBtn.title = can ? 'Reset for prestige points' : 'You need more total score to earn new prestige points';
}

function doPrestige() {
  const newPoints = computePrestigePointsFromScore(state.totalScore) - state.prestigePoints;
  if (newPoints <= 0) {
    alert('Not enough total score to prestige.');
    return;
  }
  if (!confirm(`Prestige will reset your score, upgrades, autos and store. You will gain ${newPoints} prestige point(s). Continue?`)) return;

  state.prestigePoints += newPoints;
  // apply a permanent multiplier: 5% per prestige point
  state.prestigeMultiplier = 1 + (0.05 * state.prestigePoints);

  // reset progress but keep prestige and multiplier
  state.score = 0;
  state.totalScore = 0;
  state.clickPower = 1;
  state.cps = 0;
  state.upgrades = {};
  state.autos = {};
  state.store = {};

  saveState();
  refreshUI(true);
}

/* ---------- Click handler ---------- */
function onClick() {
  // if audio context suspended (autoplay policies), resume on first user gesture
  if (audioContext && audioContext.state === 'suspended') {
    audioContext.resume();
  }
  playClickSound();
  // add base click amount (clickPower)
  addScore(state.clickPower);
  refreshUI();
}

/* ---------- Game tick (per second) ---------- */
function gameTick() {
  computeCPS();
  if (state.cps > 0) {
    // cps is raw; we add for this tick
    addScore(state.cps, { floating:false });
  }
  refreshUI(false); // no need to rebuild DOM heavy parts every tick
}

/* ---------- UI refresh ---------- */
function refreshUI(rebuildAll=false) {
  // score and cps
  scoreDisplay.textContent = fmt(Math.floor(state.score));
  cpsDisplay.textContent = `${fmt(Math.floor(state.cps))} / sec`;

  prestigePointsEl.textContent = fmt(state.prestigePoints);
  // rebuild lists when necessary (or when forced)
  if (rebuildAll) {
    buildUpgrades();
    buildAutos();
    buildStore();
  } else {
    // update enabled/disabled state quickly
    for (const btn of upgradeList.children) {
      const costText = btn.querySelector('.upgrade-right div')?.textContent || '';
      // naive: re-run build for simplicity (cost calc small)
    }
    buildUpgrades();
    buildAutos();
    buildStore();
  }
  refreshPrestigeInfo();
  saveIndicator.textContent = 'Autosaved';
  // debounce an actual save to avoid hammering
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(saveState, 500);
}

/* ---------- Wire up UI ---------- */
function setupUI() {
  clickButton.addEventListener('click', onClick);
  prestigeBtn.addEventListener('click', doPrestige);
  resetBtn.addEventListener('click', hardReset);

  // keyboard: space or enter to click
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      clickButton.classList.add('active');
      onClick();
    }
  });

  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') clickButton.classList.remove('active');
  });

  // auto-tick every second
  if (tickInterval) clearInterval(tickInterval);
  tickInterval = setInterval(gameTick, 1000);

  // save before unload
  window.addEventListener('beforeunload', () => saveState());
}

/* ---------- Initialization ---------- */
function init() {
  // derive some state values if not present
  state.clickPower = state.clickPower || 1;
  state.prestigeMultiplier = 1 + (0.05 * (state.prestigePoints || 0));
  computeCPS();
  setupUI();
  refreshUI(true);
}

init();
