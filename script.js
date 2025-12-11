/* Blackwell Clicker - script.js
   Full integrated script:
   - bulk buy (1/5/10/100)
   - active multiplier highlight
   - prestige (1T per point, resets totalScore)
   - secret dev-cheat panel
   - autos, store, save/load, click cooldown, floating text
*/

"use strict";

/* ---------- Utilities ---------- */
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

let lastClickTime = 0;
const CLICK_COOLDOWN = 75; // ms between manual clicks

/* ---------- Number formatting (short scale) ---------- */
function fmt(n) {
  if (n === 0) return "0";
  if (!n || !isFinite(n)) return "0";
  const abs = Math.abs(n);

  if (abs >= 1e69) return (n / 1e69).toFixed(2) + "DVg";
  if (abs >= 1e66) return (n / 1e66).toFixed(2) + "UVg";
  if (abs >= 1e63) return (n / 1e63).toFixed(2) + "Vg";
  if (abs >= 1e60) return (n / 1e60).toFixed(2) + "Nvd";
  if (abs >= 1e57) return (n / 1e57).toFixed(2) + "Ocd";
  if (abs >= 1e54) return (n / 1e54).toFixed(2) + "Spd";
  if (abs >= 1e51) return (n / 1e51).toFixed(2) + "Sxd";
  if (abs >= 1e48) return (n / 1e48).toFixed(2) + "Qn";
  if (abs >= 1e45) return (n / 1e45).toFixed(2) + "Qd";
  if (abs >= 1e42) return (n / 1e42).toFixed(2) + "Td";
  if (abs >= 1e39) return (n / 1e39).toFixed(2) + "Dd";
  if (abs >= 1e36) return (n / 1e36).toFixed(2) + "Ud";
  if (abs >= 1e33) return (n / 1e33).toFixed(2) + "Dc";
  if (abs >= 1e30) return (n / 1e30).toFixed(2) + "No";
  if (abs >= 1e27) return (n / 1e27).toFixed(2) + "Oc";
  if (abs >= 1e24) return (n / 1e24).toFixed(2) + "Sp";
  if (abs >= 1e21) return (n / 1e21).toFixed(2) + "Sx";
  if (abs >= 1e18) return (n / 1e18).toFixed(2) + "Qi";
  if (abs >= 1e15) return (n / 1e15).toFixed(2) + "Qa";
  if (abs >= 1e12) return (n / 1e12).toFixed(2) + "T";
  if (abs >= 1e9)  return (n / 1e9).toFixed(2)  + "B";
  if (abs >= 1e6)  return (n / 1e6).toFixed(2)  + "M";
  if (abs >= 1e3)  return (n / 1e3).toFixed(2)  + "k";
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
  prestigeMultiplier: 1,
  lastSave: Date.now()
};

const UPGRADE_DEFS = [
  { id: 'u1', name: 'Better Finger', desc: '+1 per click', baseCost: 10, increment: 1 },
  { id: 'u2', name: 'Strong Grip', desc: '+5 per click', baseCost: 100, increment: 5 },
  { id: 'u3', name: 'Mechanical Aid', desc: '+20 per click', baseCost: 500, increment: 20 },
  { id: 'u4', name: 'Ultimate Click', desc: '+100 per click', baseCost: 10000, increment: 100 },
  { id: 'u5', name: 'Click Mastery', desc: '+500 per click', baseCost: 500000, increment: 500 },
  { id: 'u6', name: 'Transcendent Click', desc: '+2k per click', baseCost: 2000000, increment: 2000 },
];

const AUTO_DEFS = [
  { id: 'a1', name: 'Tiny Auto', desc: 'Generates 1 / sec', baseCost: 5, cps: 1 },
  { id: 'a2', name: 'Robot Hand', desc: 'Generates 10 / sec', baseCost: 100, cps: 10 },
  { id: 'a3', name: 'Factory', desc: 'Generates 100 / sec', baseCost: 10000, cps: 100 },
  { id: 'a4', name: 'Click Empire', desc: 'Generates 1k / sec', baseCost: 100000, cps: 1000 },
  { id: 'a5', name: 'AI Overlord', desc: 'Generates 10k / sec', baseCost: 1000000, cps: 10000 },
  { id: 'a6', name: 'Quantum Computer', desc: 'Generates 100k / sec', baseCost: 10000000, cps: 100000 },
];

const STORE_DEFS = [
  { id: 's1', name: 'Click Booster', desc: 'Double click power', baseCost: 100000, effect:'doubleClick' },
  { id: 's2', name: 'Auto Enhancer', desc: 'Double all auto CPS', baseCost: 500000, effect:'doubleAuto' },
  { id: 's3', name: 'Mega Pack', desc: 'Double both click power and auto CPS', baseCost: 2000000, effect:'doubleBoth' },
];

/* Game vars */
let state = loadState();
let tickInterval = null;
let saveTimeout = null;
let buyMultiplier = 1; // default

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

/* ---------- Audio (simple click sound) ---------- */
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
  if (saveIndicator) {
    saveIndicator.textContent = 'Saved';
    saveIndicator.style.opacity = '1';
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(()=> saveIndicator.style.opacity = '0.6', 900);
  }
}

function loadState() {
  const raw = localStorage.getItem('bw_clicker_v1');
  if (!raw) return JSON.parse(JSON.stringify(DEFAULT_STATE));
  try {
    const parsed = JSON.parse(raw);
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
function singleCost(base, level) {
  return Math.ceil(base * Math.pow(1.15, level));
}

function bulkCost(base, startLevel, amount) {
  let total = 0;
  for (let i = 0; i < amount; i++) total += singleCost(base, startLevel + i);
  return total;
}

function maxAffordable(base, startLevel, money) {
  let levels = 0;
  while (true) {
    const cost = singleCost(base, startLevel + levels);
    if (money < cost) break;
    money -= cost;
    levels++;
    if (levels > 1e7) break;
  }
  return levels;
}

function addScore(n, opts={floating:true}) {
  const realAdd = n * state.prestigeMultiplier;
  state.score += realAdd;
  state.totalScore += realAdd;
  if (opts.floating) spawnFloatingText(`+${fmt(n)}`);
}

function computeCPS() {
  let cps = 0;
  for (const def of AUTO_DEFS) {
    const lvl = state.autos[def.id] || 0;
    cps += lvl * def.cps;
  }
  state.cps = cps;
}

/* ---------- Buy multiplier helpers ---------- */
const MULTIPLIERS = [1, 5, 10, 100];

function setBuyMultiplier(m) {
  buyMultiplier = m;
  document.querySelectorAll("#buy-multiplier button").forEach(b => {
    const val = Number(b.dataset.multi);
    b.classList.toggle("active", val === m);
  });
  refreshUI(true);
}

function setupBuyMultiplier() {
  document.querySelectorAll("#buy-multiplier button").forEach(btn => {
    const m = Number(btn.dataset.multi);
    btn.addEventListener('click', () => setBuyMultiplier(m));
  });
  setBuyMultiplier(1); // default
}

/* ---------- Build lists ---------- */
function buildUpgrades() {
  upgradeList.innerHTML = '';
  for (const def of UPGRADE_DEFS) {
    const lvl = state.upgrades[def.id] || 0;
    const chosenLevels = Math.min(buyMultiplier, maxAffordable(def.baseCost, lvl, Math.floor(state.score)));
    const cost = bulkCost(def.baseCost, lvl, chosenLevels);

    const btn = document.createElement('button');
    btn.className = 'upgrade-item';
    if (state.score < cost || chosenLevels <= 0) btn.classList.add('disabled');

    btn.title = MULTIPLIERS.map(m => {
      const l = Math.min(m, maxAffordable(def.baseCost, lvl, Math.floor(state.score)));
      return `${m}×: ${l} for ${fmt(bulkCost(def.baseCost, lvl, l))}`;
    }).join('\n');

    btn.innerHTML = `
      <div class="upgrade-left">
        <div class="upgrade-name">${def.name} <small style="color:var(--muted)"> (x${lvl})</small></div>
        <div class="upgrade-desc">${def.desc}</div>
      </div>
      <div class="upgrade-right">
        <div>Cost: ${fmt(cost)}</div>
        <div style="font-size:0.82rem;color:var(--muted)">+${fmt(def.increment * chosenLevels)} / click</div>
      </div>
    `;

    btn.addEventListener('click', () => {
      if (chosenLevels <= 0 || state.score < cost) return;
      state.score -= cost;
      state.upgrades[def.id] = (state.upgrades[def.id] || 0) + chosenLevels;
      state.clickPower += def.increment * chosenLevels;
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
    const chosenLevels = Math.min(buyMultiplier, maxAffordable(def.baseCost, lvl, Math.floor(state.score)));
    const cost = bulkCost(def.baseCost, lvl, chosenLevels);

    const btn = document.createElement('button');
    btn.className = 'upgrade-item';
    if (state.score < cost || chosenLevels <= 0) btn.classList.add('disabled');

    btn.title = MULTIPLIERS.map(m => {
      const l = Math.min(m, maxAffordable(def.baseCost, lvl, Math.floor(state.score)));
      return `${m}×: ${l} for ${fmt(bulkCost(def.baseCost, lvl, l))}`;
    }).join('\n');

    btn.innerHTML = `
      <div class="upgrade-left">
        <div class="upgrade-name">${def.name} <small style="color:var(--muted)">(x${lvl})</small></div>
        <div class="upgrade-desc">${def.desc}</div>
      </div>
      <div class="upgrade-right">
        <div>Cost: ${fmt(cost)}</div>
        <div style="font-size:0.82rem;color:var(--muted)">${fmt(def.cps * chosenLevels)} / sec</div>
      </div>
    `;

    btn.addEventListener('click', () => {
      if (chosenLevels <= 0 || state.score < cost) return;
      state.score -= cost;
      state.autos[def.id] = (state.autos[def.id] || 0) + chosenLevels;
      computeCPS();
      saveState();
      refreshUI();
    });

    autoList.appendChild(btn);
  }
}

/* ---------- Store ---------- */
function buildStore() {
  storeList.innerHTML = '';
  for (const def of STORE_DEFS) {
    const lvl = state.store[def.id] || 0;
    const cost = def.baseCost;
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
      if (def.effect === 'doubleClick') state.clickPower *= 2;
      if (def.effect === 'doubleAuto') state._autoMultiplier = (state._autoMultiplier || 1) * 2;
      if (def.effect === 'doubleBoth') {
        state.clickPower *= 2;
        state._autoMultiplier = (state._autoMultiplier || 1) * 2;
      }
      computeCPS();
      saveState();
      refreshUI();
    });

    storeList.appendChild(btn);
  }
}

/* ---------- Floating text ---------- */
function spawnFloatingText(text) {
  const el = document.createElement('div');
  el.className = 'float-text';
  el.textContent = text;
  const width = floatingLayer?.clientWidth || 200;
  const x = Math.random() * (width - 40) + 20;
  el.style.left = `${x}px`;
  el.style.top = `0px`;
  el.style.color = '#bdeafe';
  floatingLayer?.appendChild(el);
  setTimeout(()=> el.remove(), 1000);
}

/* ---------- Prestige ---------- */
const PRESTIGE_COST = 1e12; // 1T

function calculatePrestigeFromTotal(total) {
  return Math.floor(total / PRESTIGE_COST);
}

function resetAllNormalProgress() {
  state.score = 0;
  state.totalScore = 0;
  state.clickPower = 1;
  state.cps = 0;
  state.upgrades = {};
  state.autos = {};
  state.store = {};
  delete state._autoMultiplier;
}

function refreshPrestigeInfo() {
  if (prestigePointsEl) prestigePointsEl.textContent = fmt(state.prestigePoints);
  const possible = calculatePrestigeFromTotal(state.totalScore);
  const can = possible > state.prestigePoints;
  if (prestigeBtn) {
    prestigeBtn.disabled = !can;
    prestigeBtn.title = can ? 'Reset for prestige points' : 'You need more total score';
  }
}

function doPrestige() {
  const possible = calculatePrestigeFromTotal(state.totalScore);
  const gain = possible - state.prestigePoints;
  if (gain <= 0) { alert("Not enough total score to prestige."); return; }
  if (!confirm(`Prestige will reset most progress and grant ${gain} prestige point(s). Continue?`)) return;

  state.prestigePoints += gain;
  state.prestigeMultiplier = 1 + (0.05 * state.prestigePoints);
  resetAllNormalProgress();
  saveState();
  refreshUI(true);
}

/* ---------- Click handler ---------- */
function onClick() {
  const now = performance.now();
  if (now - lastClickTime < CLICK_COOLDOWN) return;
  lastClickTime = now;

  if (audioContext && audioContext.state === 'suspended') audioContext.resume();
  playClickSound();
  addScore(state.clickPower);
  refreshUI();
}

/* ---------- Game tick ---------- */
function gameTick() {
  computeCPS();
  if (state.cps > 0) addScore(state.cps * (state._autoMultiplier || 1), { floating:false });
  refreshUI(false);
}

/* ---------- UI refresh ---------- */
function refreshUI(rebuildAll=false) {
  if (scoreDisplay) scoreDisplay.textContent = fmt(Math.floor(state.score));
  if (cpsDisplay) cpsDisplay.textContent = `${fmt(Math.floor(state.cps * (state._autoMultiplier || 1)))} / sec`;
  if (prestigePointsEl) prestigePointsEl.textContent = fmt(state.prestigePoints);

  buildUpgrades();
  buildAutos();
  buildStore();
  refreshPrestigeInfo();

  if (saveIndicator) {
    saveIndicator.textContent = 'Autosaved';
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(saveState, 500);
  }
}

/* ---------- UI wiring ---------- */
function setupUI() {
  clickButton?.addEventListener('click', onClick);
  prestigeBtn?.addEventListener('click', doPrestige);
  resetBtn?.addEventListener('click', hardReset);

  window.addEventListener('keydown', e => {
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return;

    if (e.code === 'Space') { e.preventDefault(); clickButton?.classList.add('active'); onClick(); }
    if (e.key === '1') setBuyMultiplier(1);
    if (e.key === '2') setBuyMultiplier(5);
    if (e.key === '3') setBuyMultiplier(10);
    if (e.key === '4') setBuyMultiplier(100);
  });
  window.addEventListener('keyup', e => { if (e.code === 'Space') clickButton?.classList.remove('active'); });

  if (tickInterval) clearInterval(tickInterval);
  tickInterval = setInterval(gameTick, 1000);
  window.addEventListener('beforeunload', () => saveState());
}

/* ---------- SECRET CHEAT ---------- */
const SECRET_CODE = "blackwell";
let cheatBuffer = "";
window.addEventListener("keydown", e => {
  const key = e.key.toLowerCase();
  const active = document.activeElement;
  if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return;
  if (key.length === 1 && key.match(/[a-z0-9]/)) {
    cheatBuffer += key;
    if (cheatBuffer.length > SECRET_CODE.length) cheatBuffer = cheatBuffer.slice(-SECRET_CODE.length);
    if (cheatBuffer === SECRET_CODE) toggleCheatPanel();
  }
});

function toggleCheatPanel() {
  const panel = document.getElementById("dev-cheat-panel");
  if (!panel) return;
  panel.style.display = (panel.style.display === "flex") ? "none" : "flex";
}

const cheatPanel = document.getElementById("dev-cheat-panel");
if (cheatPanel) {
  cheatPanel.addEventListener("click", e => {
    const cheat = e.target.dataset.cheat;
    if (!cheat) return;
    switch (cheat) {
      case "add1m": state.score += 1_000_000; state.totalScore += 1_000_000; break;
      case "add1b": state.score += 1_000_000_000; state.totalScore += 1_000_000_000; break;
      case "addPrestige": state.prestigePoints += 10; state.prestigeMultiplier = 1 + state.prestigePoints * 0.05; break;
      case "maxClick": state.clickPower = 1e300; break;
      case "close": cheatPanel.style.display = "none"; return;
    }
    saveState();
    refreshUI();
  });
}

/* ---------- Initialization ---------- */
function init() {
  state = Object.assign(JSON.parse(JSON.stringify(DEFAULT_STATE)), state || {});
  state.clickPower = state.clickPower || 1;
  state.prestigePoints = state.prestigePoints || 0;
  state.prestigeMultiplier = 1 + (0.05 * (state.prestigePoints || 0));
  state._autoMultiplier = state._autoMultiplier || 1;

  setupBuyMultiplier();
  setupUI();
  computeCPS();
  refreshUI(true);
}

init();
