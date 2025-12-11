/* Blackwell Clicker - script.js
   Full corrected script with working prestige (resets totalScore),
   fixed prestige cost (1T per point), implemented resetAllNormalProgress(),
   and general cleanup.
*/

"use strict";

/* ---------- Utilities ---------- */
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

let lastClickTime = 0;
const CLICK_COOLDOWN = 75; // ms between manual clicks (user had this value)

/* ---------- Number formatting (short scale fixed) ---------- */
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
  prestigeMultiplier: 1, // derived from prestigePoints but stored for convenience
  lastSave: Date.now()
};

// Items definitions (baseCost, increment, type)
const UPGRADE_DEFS = [
  { id: 'u1', name: 'Better Finger', desc: '+1 per click', baseCost: 10, increment: 1, type:'click' },
  { id: 'u2', name: 'Strong Grip', desc: '+5 per click', baseCost: 100, increment: 5, type:'click' },
  { id: 'u3', name: 'Mechanical Aid', desc: '+20 per click', baseCost: 500, increment: 20, type:'click' },
  { id: 'u4', name: 'Ultimate Click', desc: '+100 per click', baseCost: 10000, increment: 100, type:'click'},
  { id: 'u5', name: 'Click Mastery', desc: '+500 per click', baseCost: 500000, increment: 500, type:'click' },
  { id: 'u6', name: 'Transcendent Click', desc: '+2k per click', baseCost: 2000000, increment: 2000, type:'click' },
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
  return Math.ceil(baseCost * Math.pow(1.15, level));
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
      // example effects
      if (def.effect === 'doubleClick') {
        state.clickPower *= 2;
      } else if (def.effect === 'doubleAuto') {
        // naive doubling: multiply all auto defs' acquired contributions by 2 via storing a flag
        // We'll apply effect by doubling each auto level's effective cps via a multiplier store value
        state._autoMultiplier = (state._autoMultiplier || 1) * 2;
        computeCPS();
      } else if (def.effect === 'doubleBoth') {
        state.clickPower *= 2;
        state._autoMultiplier = (state._autoMultiplier || 1) * 2;
        computeCPS();
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

/* ---------- Prestige (fixed 1T per point, resets totalScore) ---------- */
const PRESTIGE_COST = 1e12; // 1 trillion per prestige point

// Calculate prestige from lifetime total (we will use state.totalScore)
function calculatePrestigeFromTotal(total) {
  return Math.floor(total / PRESTIGE_COST);
}

// Reset the player's normal progress while keeping prestigePoints & prestigeMultiplier
function resetAllNormalProgress() {
  state.score = 0;
  state.totalScore = 0; // user requested totalScore reset on prestige
  state.clickPower = 1;
  state.cps = 0;
  state.upgrades = {};
  state.autos = {};
  state.store = {};
  // keep any special multipliers that are intended to persist? — none by default
  // clear transient multipliers if you don't want them to persist:
  delete state._autoMultiplier;
}

function refreshPrestigeInfo() {
  prestigePointsEl.textContent = fmt(state.prestigePoints);
  const possible = calculatePrestigeFromTotal(state.totalScore);
  const can = possible > state.prestigePoints;
  prestigeBtn.disabled = !can;
  prestigeBtn.title = can ? 'Reset for prestige points' : 'You need more total score to earn new prestige points';
}

function doPrestige() {
  const possible = calculatePrestigeFromTotal(state.totalScore);
  const gain = possible - state.prestigePoints;
  if (gain <= 0) {
    alert("Not enough total score to prestige (1T per prestige point).");
    return;
  }
  if (!confirm(`Prestige will reset most progress and grant ${gain} prestige point(s). Continue?`)) return;

  state.prestigePoints += gain;
  // update multiplier (example: +5% per prestige point)
  state.prestigeMultiplier = 1 + (0.05 * state.prestigePoints);

  // reset normal progress but keep prestige data
  resetAllNormalProgress();

  saveState();
  refreshUI(true);
}

/* ---------- Click handler (cooldown enforced) ---------- */
function onClick() {
  const now = performance.now();

  if (now - lastClickTime < CLICK_COOLDOWN) {
    // optional feedback:
    // spawnFloatingText("Too fast!");
    return;
  }

  lastClickTime = now;

  // resume audio context if needed
  if (audioContext && audioContext.state === 'suspended') {
    audioContext.resume();
  }

  playClickSound();
  addScore(state.clickPower);
  refreshUI();
}

/* ---------- Game tick (per second) ---------- */
function gameTick() {
  // computeCPS takes into account raw auto levels; if we have an _autoMultiplier from store items, apply it here
  computeCPS();
  const autoMultiplier = state._autoMultiplier || 1;
  if (state.cps > 0) {
    addScore(state.cps * autoMultiplier, { floating:false });
  }
  refreshUI(false);
}

/* ---------- UI refresh ---------- */
function refreshUI(rebuildAll=false) {
  scoreDisplay.textContent = fmt(Math.floor(state.score));
  cpsDisplay.textContent = `${fmt(Math.floor(state.cps * (state._autoMultiplier || 1)))} / sec`;
  prestigePointsEl.textContent = fmt(state.prestigePoints);

  if (rebuildAll) {
    buildUpgrades();
    buildAutos();
    buildStore();
  } else {
    // simple rebuild for accuracy (costs are cheap to compute)
    buildUpgrades();
    buildAutos();
    buildStore();
  }

  refreshPrestigeInfo();

  saveIndicator.textContent = 'Autosaved';
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(saveState, 500);
}

/* ---------- Wire up UI ---------- */
function setupUI() {
  clickButton.addEventListener('click', onClick);
  prestigeBtn.addEventListener('click', doPrestige);
  resetBtn.addEventListener('click', hardReset);

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

  if (tickInterval) clearInterval(tickInterval);
  tickInterval = setInterval(gameTick, 1000);

  window.addEventListener('beforeunload', () => saveState());
}

/* ---------- Initialization ---------- */
function init() {
  // ensure defaults exist
  state.clickPower = state.clickPower || 1;
  state.prestigePoints = state.prestigePoints || 0;
  state.prestigeMultiplier = 1 + (0.05 * (state.prestigePoints || 0));
  state._autoMultiplier = state._autoMultiplier || 1;
  computeCPS();
  setupUI();
  refreshUI(true);
}

/* ==========================
     SECRET CHEAT CODE
   ========================== */

// The secret code (case-insensitive)
const SECRET_CODE = "blackwell"; 
let cheatBuffer = "";

// Listen for typed characters
window.addEventListener("keydown", (e) => {
  const key = e.key.toLowerCase();

  // Only allow letters, ignore space/shift/f1/etc.
  if (key.length === 1 && key.match(/[a-z0-9]/)) {
    cheatBuffer += key;

    // limit length to avoid infinite growth
    if (cheatBuffer.length > SECRET_CODE.length)
      cheatBuffer = cheatBuffer.slice(-SECRET_CODE.length);

    // check match
    if (cheatBuffer === SECRET_CODE) {
      toggleCheatPanel();
    }
  }
});

function toggleCheatPanel() {
  const panel = document.getElementById("dev-cheat-panel");
  panel.style.display = (panel.style.display === "flex") ? "none" : "flex";
}

/* ==========================
      DEV CHEAT ACTIONS
   ========================== */

const cheatPanel = document.getElementById("dev-cheat-panel");

cheatPanel.addEventListener("click", (e) => {
  const cheat = e.target.dataset.cheat;
  if (!cheat) return;

  switch (cheat) {
    case "add1m":
      state.score += 1_000_000;
      state.totalScore += 1_000_000;
      break;

    case "add1b":
      state.score += 1_000_000_000;
      state.totalScore += 1_000_000_000;
      break;

    case "addPrestige":
      state.prestigePoints += 10;
      state.prestigeMultiplier = 1 + state.prestigePoints * 0.05;
      break;

    case "maxClick":
      state.clickPower = 1e300;
      break;

    case "close":
      cheatPanel.style.display = "none";
      return;
  }

  saveState();
  refreshUI();
});

init();
/* ---------- End of script.js ---------- */
