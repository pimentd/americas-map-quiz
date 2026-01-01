// Americas Map Quiz (GitHub Pages)
// Uses americas.svg (BlankMap-Americas.svg renamed to americas.svg)
//
// The SVG uses lowercase ISO-2 IDs (e.g., us, ca, mx, br).
// Option A: Keep tiny Caribbean islands visible but disabled.

const COUNTRIES = [
  // North America
  { id: "ca", name: "Canada" },
  { id: "us", name: "United States" },
  { id: "mx", name: "Mexico" },

  // Central America
  { id: "bz", name: "Belize" },
  { id: "gt", name: "Guatemala" },
  { id: "hn", name: "Honduras" },
  { id: "sv", name: "El Salvador" },
  { id: "ni", name: "Nicaragua" },
  { id: "cr", name: "Costa Rica" },
  { id: "pa", name: "Panama" },

  // South America
  { id: "co", name: "Colombia" },
  { id: "ve", name: "Venezuela" },
  { id: "gy", name: "Guyana" },
  { id: "sr", name: "Suriname" },
  { id: "ec", name: "Ecuador" },
  { id: "pe", name: "Peru" },
  { id: "br", name: "Brazil" },
  { id: "bo", name: "Bolivia" },
  { id: "py", name: "Paraguay" },
  { id: "cl", name: "Chile" },
  { id: "ar", name: "Argentina" },
  { id: "uy", name: "Uruguay" },

  // Caribbean (larger / commonly assessed)
  { id: "bs", name: "Bahamas" },
  { id: "cu", name: "Cuba" },
  { id: "jm", name: "Jamaica" },
  { id: "ht", name: "Haiti" },
  { id: "do", name: "Dominican Republic" },
  { id: "tt", name: "Trinidad and Tobago" }
];

// Keep these visible but NOT clickable and NOT included in prompts.
const DISABLED_ISLANDS = ["bb", "gd", "lc", "vc", "ag", "kn", "dm"];

// ---------- DOM ----------
const mapContainer = document.getElementById("mapContainer");
const mapStatus = document.getElementById("mapStatus");
const promptEl = document.getElementById("prompt");
const subpromptEl = document.getElementById("subprompt");
const timerEl = document.getElementById("timer");
const progressEl = document.getElementById("progress");
const resultsEl = document.getElementById("results");
const startBtn = document.getElementById("startBtn");
const restartBtn = document.getElementById("restartBtn");

// ---------- State ----------
let order = [];
let index = 0;

let running = false;
let startTime = 0;
let rafId = 0;

let score = 0;               // points earned (only first click per prompt)
let firstClickUsed = false;  // for current prompt

const total = COUNTRIES.length;
const byId = new Map(COUNTRIES.map(c => [c.id, c]));
const completed = new Set(); // ids already finished

// ---------- Helpers ----------
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function formatSeconds(sec) {
  return `${sec.toFixed(1)}s`;
}

function setStatus(text) {
  mapStatus.textContent = text;
}

function setPrompt(country) {
  promptEl.textContent = country ? country.name : "—";
  subpromptEl.textContent = country ? `(${country.id})` : "";
}

function setProgress() {
  progressEl.textContent = `${Math.min(index, total)} / ${total}`;
}

function tick() {
  if (!running) return;
  const elapsed = (performance.now() - startTime) / 1000;
  timerEl.textContent = formatSeconds(elapsed);
  rafId = requestAnimationFrame(tick);
}

function stopTimer() {
  running = false;
  cancelAnimationFrame(rafId);
  rafId = 0;
}

function resetUI() {
  resultsEl.classList.add("muted");
  resultsEl.textContent = "Press Start to begin.";
  timerEl.textContent = "0.0s";

  score = 0;
  index = 0;
  firstClickUsed = false;
  completed.clear();

  setProgress();
  setPrompt(null);

  startBtn.disabled = false;
  restartBtn.disabled = true;

  // Reset classes for active quiz countries
  for (const { id } of COUNTRIES) {
    const el = mapContainer.querySelector(`#${CSS.escape(id)}`);
    if (el) el.setAttribute("class", "country");
  }

  // Re-apply disabled styling (in case restart)
  for (const id of DISABLED_ISLANDS) {
    const el = mapContainer.querySelector(`#${CSS.escape(id)}`);
    if (!el) continue;
    el.classList.add("disabled-island");
    el.style.pointerEvents = "none";
  }
}

function showFinal() {
  const elapsed = (performance.now() - startTime) / 1000;
  const pct = (score / total) * 100;

  resultsEl.classList.remove("muted");
  resultsEl.innerHTML = `
    <div><strong>Score:</strong> ${score} / ${total} (${pct.toFixed(1)}%)</div>
    <div><strong>Time:</strong> ${formatSeconds(elapsed)}</div>
  `;
}

// ---------- Quiz flow ----------
function nextPrompt() {
  if (index >= total) {
    stopTimer();
    setPrompt(null);
    setStatus("Finished.");
    showFinal();
    return;
  }

  firstClickUsed = false;
  const id = order[index];
  setPrompt(byId.get(id));
  setStatus("Click the correct country on the map.");
}

// ---------- Click feedback ----------
function markWrong(el) {
  el.classList.add("wrong");
  setTimeout(() => el.classList.remove("wrong"), 220);
}

function markCorrect(el) {
  el.classList.add("correct", "locked");
}

// ---------- Click handling ----------
function handleCountryClick(id, el) {
  if (!running) return;
  if (completed.has(id)) return;

  const targetId = order[index];
  if (!targetId) return;

  if (id === targetId) {
    // Award point only if first click for this prompt
    if (!firstClickUsed) score += 1
