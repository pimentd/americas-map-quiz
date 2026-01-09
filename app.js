// app.js — FULL FILE (with visible click rings for Bahamas + Trinidad & Tobago)
// + Labels appear after correctly identified countries

// ---------------- Data ----------------
const COUNTRIES = [
  { id: "ca", name: "Canada", region: "north" },
  { id: "us", name: "United States", region: "north" },
  { id: "mx", name: "Mexico", region: "north" },

  { id: "bz", name: "Belize", region: "central" },
  { id: "gt", name: "Guatemala", region: "central" },
  { id: "hn", name: "Honduras", region: "central" },
  { id: "sv", name: "El Salvador", region: "central" },
  { id: "ni", name: "Nicaragua", region: "central" },
  { id: "cr", name: "Costa Rica", region: "central" },
  { id: "pa", name: "Panama", region: "central" },

  { id: "co", name: "Colombia", region: "south" },
  { id: "ve", name: "Venezuela", region: "south" },
  { id: "gy", name: "Guyana", region: "south" },
  { id: "sr", name: "Suriname", region: "south" },
  { id: "ec", name: "Ecuador", region: "south" },
  { id: "pe", name: "Peru", region: "south" },
  { id: "br", name: "Brazil", region: "south" },
  { id: "bo", name: "Bolivia", region: "south" },
  { id: "py", name: "Paraguay", region: "south" },
  { id: "cl", name: "Chile", region: "south" },
  { id: "ar", name: "Argentina", region: "south" },
  { id: "uy", name: "Uruguay", region: "south" },

  { id: "bs", name: "Bahamas", region: "caribbean" },
  { id: "cu", name: "Cuba", region: "caribbean" },
  { id: "jm", name: "Jamaica", region: "caribbean" },
  { id: "ht", name: "Haiti", region: "caribbean" },
  { id: "do", name: "Dominican Republic", region: "caribbean" },
  { id: "tt", name: "Trinidad and Tobago", region: "caribbean" },

  { id: "pr", name: "Puerto Rico (USA)", region: "caribbean" },
  { id: "gf", name: "French Guiana (France)", region: "south" }
];

const DISABLED_ISLANDS = ["bb", "gd", "lc", "vc", "ag", "kn", "dm"];
const PRONUNCIATION = {};

// ---------------- DOM ----------------
const mapContainer = document.getElementById("mapContainer");
const mapStatus = document.getElementById("mapStatus");
const promptEl = document.getElementById("prompt");
const subpromptEl = document.getElementById("subprompt");
const timerEl = document.getElementById("timer");
const progressEl = document.getElementById("progress");
const percentEl = document.getElementById("percent");
const resultsEl = document.getElementById("results");
const startBtn = document.getElementById("startBtn");
const restartBtn = document.getElementById("restartBtn");

const endModal = document.getElementById("endModal");
const closeModalBtn = document.getElementById("closeModalBtn");
const finalPercentEl = document.getElementById("finalPercent");
const finalTimeEl = document.getElementById("finalTime");
const perfectBox = document.getElementById("perfectBox");
const confettiCanvas = document.getElementById("confettiCanvas");

const modebar = document.getElementById("modebar");
const modeButtons = modebar ? Array.from(modebar.querySelectorAll(".modebtn")) : [];

// ---------------- State ----------------
let svgEl = null;
let originalViewBox = null;

let currentMode = "all";
let activeCountries = [];
let order = [];
let index = 0;
let score = 0;
let completed = new Set();
let running = false;

let startTime = 0;
let rafId = 0;
let firstClickUsed = false;

const countryEls = new Map();
const byId = new Map(COUNTRIES.map(c => [c.id, c]));
const hitTargets = new Map();

// -------- Labels state --------
let labelsLayer = null;              // <g id="labelsLayer">
const placedLabels = new Map();      // id -> <text>

// ---------------- Helpers ----------------
function setStatus(text) {
  mapStatus.textContent = text;
}

function setPrompt(country) {
  promptEl.textContent = country ? country.name : "—";
  if (subpromptEl) subpromptEl.textContent = "";
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getActiveCountries() {
  if (currentMode === "all") return COUNTRIES;
  return COUNTRIES.filter(c => c.region === currentMode);
}

function setProgressAndPercent() {
  const total = activeCountries.length || 0;
  progressEl.textContent = `${Math.min(index, total)} / ${total}`;
  const pct = total ? (score / total) * 100 : 0;
  percentEl.textContent = `${Math.round(pct)}%`;
}

function tick() {
  if (!running) return;
  timerEl.textContent = `${((performance.now() - startTime) / 1000).toFixed(1)}s`;
  rafId = requestAnimationFrame(tick);
}

function stopTimer() {
  running = false;
  cancelAnimationFrame(rafId);
}

// SVG helpers
function getPaintTargets(rootEl) {
  if (!rootEl) return [];
  if (rootEl.tagName.toLowerCase() === "g") {
    const inner = rootEl.querySelectorAll("path");
    return inner.length ? Array.from(inner) : [rootEl];
  }
  return [rootEl];
}

function addClassToTargets(id, cls) {
  const entry = countryEls.get(id);
  if (!entry) return;
  entry.paintEls.forEach(el => el.classList.add(cls));
}

function removeClassFromTargets(id, cls) {
  const entry = countryEls.get(id);
  if (!entry) return;
  entry.paintEls.forEach(el => el.classList.remove(cls));
}

function resetClasses() {
  COUNTRIES.forEach(c => {
    removeClassFromTargets(c.id, "correct");
    removeClassFromTargets(c.id, "wrong");
    removeClassFromTargets(c.id, "locked");
  });
}

function markWrong(id) {
  addClassToTargets(id, "wrong");
  setTimeout(() => removeClassFromTargets(id, "wrong"), 1000);
}

// ---------------- Labels (NEW) ----------------
function ensureLabelsLayer() {
  if (!svgEl) return;
  if (labelsLayer && labelsLayer.ownerSVGElement) return;

  labelsLayer = svgEl.querySelector("#labelsLayer");
  if (!labelsLayer) {
    labelsLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
    labelsLayer.setAttribute("id", "labelsLayer");
    labelsLayer.style.pointerEvents = "none";
    svgEl.appendChild(labelsLayer);
  }
}

function clearLabels() {
  placedLabels.forEach(t => t.remove());
  placedLabels.clear();
  if (labelsLayer) labelsLayer.innerHTML = "";
}

function addCountryLabel(id) {
  if (!svgEl) return;
  ensureLabelsLayer();
  if (!labelsLayer) return;
  if (placedLabels.has(id)) return;

  const country = byId.get(id);
  if (!country) return;

  const entry = countryEls.get(id);
  if (!entry) return;

  let x = null;
  let y = null;

  // If we have a helper ring (Bahamas/TT), label relative to that ring so it's readable
  const ring = hitTargets.get(id);
  if (ring) {
    const cx = parseFloat(ring.getAttribute("cx"));
    const cy = parseFloat(ring.getAttribute("cy"));
    if (Number.isFinite(cx) && Number.isFinite(cy)) {
      x = cx;
      y = cy + 55; // below ring
    }
  }

  // Otherwise place label at bbox center
  if (x == null || y == null) {
    let bb;
    try {
      bb = entry.rootEl.getBBox();
    } catch {
      bb = null;
    }
    if (!bb) return;

    // Skip ultra-tiny shapes unless they have rings
    if (!ring && Math.min(bb.width, bb.height) < 18) return;

    x = bb.x + bb.width / 2;
    y = bb.y + bb.height / 2;
  }

  const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
  text.setAttribute("x", String(x));
  text.setAttribute("y", String(y));
  text.setAttribute("text-anchor", "middle");
  text.setAttribute("dominant-baseline", "middle");
  text.setAttribute("class", "country-label");
  text.textContent = country.name;

  labelsLayer.appendChild(text);
  placedLabels.set(id, text);
}

function markCorrect(id) {
  addClassToTargets(id, "correct");
  addClassToTargets(id, "locked");
  addCountryLabel(id); // NEW: label appears after correct click
}

// ---------------- Audio ----------------
let audioCtx = null;

function ensureAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
}

function playWrongBeep() {
  ensureAudio();
  const t = audioCtx.currentTime;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = "square";
  o.frequency.setValueAtTime(220, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.15, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
  o.connect(g).connect(audioCtx.destination);
  o.start(t);
  o.stop(t + 0.22);
}

// ---------------- Click rings ----------------
function addHitCircleForCountry(id, radius) {
  const entry = countryEls.get(id);
  if (!entry || !svgEl) return;

  const b = entry.rootEl.getBBox();
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;

  const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  circle.setAttribute("cx", cx);
  circle.setAttribute("cy", cy);
  circle.setAttribute("r", radius);
  circle.classList.add("hit-target");
  circle.addEventListener("click", e => {
    e.stopPropagation();
    handleCountryClick(id);
  });

  svgEl.appendChild(circle);
  hitTargets.set(id, circle);
}

function buildClickHelperRings() {
  if (countryEls.has("bs")) addHitCircleForCountry("bs", 45);
  if (countryEls.has("tt")) addHitCircleForCountry("tt", 40);
}

// ---------------- Quiz flow ----------------
function nextPrompt() {
  if (index >= activeCountries.length) {
    stopTimer();
    setStatus("Finished");

    const elapsed = (performance.now() - startTime) / 1000;
    const pct = (score / activeCountries.length) * 100;

    resultsEl.innerHTML = `
      <div><strong>Score:</strong> ${score} / ${activeCountries.length} (${pct.toFixed(1)}%)</div>
      <div><strong>Time:</strong> ${elapsed.toFixed(1)}s</div>
    `;

    finalPercentEl.textContent = `${pct.toFixed(1)}%`;
    finalTimeEl.textContent = `${elapsed.toFixed(1)}s`;
    perfectBox.classList.toggle("hidden", pct !== 100);

    endModal.classList.remove("hidden");
    return;
  }

  const country = byId.get(order[index]);
  setPrompt(country);
}

function handleCountryClick(id) {
  if (!running) return;

  const target = order[index];
  if (id === target) {
    score++;
    markCorrect(id);
    index++;
    setProgressAndPercent();
    nextPrompt();
  } else {
    playWrongBeep();
    markWrong(id);
  }
}

// ---------------- Load SVG ----------------
async function loadSVG() {
  const res = await fetch("americas.svg", { cache: "no-store" });
  mapContainer.innerHTML = await res.text();
  svgEl = mapContainer.querySelector("svg");

  originalViewBox = svgEl.getAttribute("viewBox");

  // Create labels layer once SVG is loaded
  ensureLabelsLayer();

  COUNTRIES.forEach(c => {
    const rootEl = svgEl.querySelector(`#${CSS.escape(c.id)}`);
    if (!rootEl) return;

    const paintEls = getPaintTargets(rootEl);
    countryEls.set(c.id, { rootEl, paintEls });

    rootEl.addEventListener("click", e => {
      e.stopPropagation();
      handleCountryClick(c.id);
    });
  });

  buildClickHelperRings();
}

// ---------------- Reset ----------------
function resetUI() {
  stopTimer();
  running = false;
  score = 0;
  index = 0;
  completed.clear();

  resultsEl.textContent = "Press Start to begin.";
  timerEl.textContent = "0.0s";
  percentEl.textContent = "0%";

  resetClasses();
  clearLabels();               // NEW: remove labels on reset
  endModal.classList.add("hidden");
  setPrompt(null);
}

// ---------------- Buttons ----------------
startBtn.addEventListener("click", () => {
  ensureAudio();
  resetUI();

  activeCountries = getActiveCountries();
  order = shuffle(activeCountries.map(c => c.id));

  running = true;
  startTime = performance.now();
  tick();

  nextPrompt();
});

restartBtn.addEventListener("click", resetUI);
closeModalBtn.addEventListener("click", () => endModal.classList.add("hidden"));

// SPACEBAR
window.addEventListener("keydown", e => {
  if (e.code !== "Space") return;
  e.preventDefault();
  if (running) resetUI();
  else startBtn.click();
});

// Init
resetUI();
loadSVG();
