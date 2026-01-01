// Americas Map Quiz (GitHub Pages)
// Uses americas.svg (BlankMap-Americas.svg renamed to americas.svg)
//
// The SVG uses lowercase ISO-2 IDs (e.g., us, ca, mx, br).
// Option A: Keep tiny Caribbean islands visible but disabled.
// Add-ons: (1) longer red flash on wrong clicks, (2) TTS speaks each country name,
// (3) wrong-click error beep sound (no external audio files needed).

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

// ---------- Speech (Text-to-Speech) ----------
let speechEnabled = true;
let selectedVoice = null;

function pickVoice() {
  if (!("speechSynthesis" in window)) return;
  const voices = window.speechSynthesis.getVoices() || [];
  if (!voices.length) return;

  // Prefer an English voice if available
  selectedVoice =
    voices.find(v => /^en(-|_)?/i.test(v.lang) && /Google|Microsoft|Samantha|Daniel|Alex/i.test(v.name)) ||
    voices.find(v => /^en(-|_)?/i.test(v.lang)) ||
    voices[0];
}

// Some browsers load voices asynchronously
if ("speechSynthesis" in window) {
  pickVoice();
  window.speechSynthesis.onvoiceschanged = () => pickVoice();
}

function speak(text) {
  if (!speechEnabled) return;
  if (!("speechSynthesis" in window)) return;

  // Cancel queued speech so it stays snappy
  window.speechSynthesis.cancel();

  const u = new SpeechSynthesisUtterance(text);
  if (selectedVoice) u.voice = selectedVoice;
  u.rate = 0.95;  // slightly slower for clarity
  u.pitch = 1.0;
  u.volume = 1.0;

  window.speechSynthesis.speak(u);
}

// ---------- SFX (Web Audio) ----------
let sfxEnabled = true;
let audioCtx = null;

function ensureAudio() {
  if (!(window.AudioContext || window.webkitAudioContext)) return;
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
}

function playWrongBeep() {
  if (!sfxEnabled) return;
  if (!(window.AudioContext || window.webkitAudioContext)) return;

  ensureAudio();
  if (!audioCtx) return;

  const t0 = audioCtx.currentTime;

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  // Error sound: quick down-sweep
  osc.type = "square";
  osc.frequency.setValueAtTime(440, t0);
  osc.frequency.exponentialRampToValueAtTime(220, t0 + 0.12);

  // Envelope
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(0.18, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  osc.start(t0);
  osc.stop(t0 + 0.18);
}

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
  const country = byId.get(id);

  setPrompt(country);
  speak(country.name);
  setStatus("Click the correct country on the map.");
}

// ---------- Click feedback ----------
function markWrong(el) {
  el.classList.add("wrong");
  // Keep it red for a full second
  setTimeout(() => el.classList.remove("wrong"), 1000);
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
    if (!firstClickUsed) score += 1;

    completed.add(id);
    markCorrect(el);

    index += 1;
    setProgress();
    nextPrompt();
  } else {
    // Wrong click: consumes first click for point eligibility
    if (!firstClickUsed) firstClickUsed = true;

    playWrongBeep();
    markWrong(el);
    setStatus("Nope — try again.");
  }
}

// ---------- SVG loading ----------
async function loadSVG() {
  try {
    setStatus("Loading map…");
    const res = await fetch("americas.svg", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const svgText = await res.text();
    mapContainer.innerHTML = svgText;

    // Wire up active quiz countries
    for (const { id } of COUNTRIES) {
      const el = mapContainer.querySelector(`#${CSS.escape(id)}`);
      if (!el) continue;

      el.classList.add("country");
      el.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        handleCountryClick(id, el);
      });
    }

    // Disable tiny Caribbean islands (still visible)
    for (const id of DISABLED_ISLANDS) {
      const el = mapContainer.querySelector(`#${CSS.escape(id)}`);
      if (!el) continue;
      el.classList.add("disabled-island");
      el.style.pointerEvents = "none";
    }

    const missing = COUNTRIES.filter(c => !mapContainer.querySelector(`#${CSS.escape(c.id)}`));
    if (missing.length) {
      setStatus(`Map loaded, but missing ${missing.length} IDs (open console).`);
      console.warn("Missing IDs:", missing.map(m => m.id));
    } else {
      setStatus("Map loaded.");
    }

    setProgress();
    setPrompt(null);
  } catch (err) {
    console.error(err);
    setStatus('Failed to load "americas.svg"');
    resultsEl.classList.remove("muted");
    resultsEl.textContent = 'Could not load americas.svg. Make sure it is in the repo root.';
  }
}

// ---------- Buttons ----------
startBtn.addEventListener("click", () => {
  // Prime/Unlock audio on user gesture
  if ("speechSynthesis" in window) {
    pickVoice();
    window.speechSynthesis.cancel();
  }
  ensureAudio();

  order = shuffle(COUNTRIES.map(c => c.id));
  index = 0;
  score = 0;
  completed.clear();
  firstClickUsed = false;

  resultsEl.classList.add("muted");
  resultsEl.textContent = "Quiz running…";
  startBtn.disabled = true;
  restartBtn.disabled = false;

  startTime = performance.now();
  running = true;
  tick();

  setProgress();
  nextPrompt();
});

restartBtn.addEventListener("click", () => {
  stopTimer();
  resetUI();
});

// Init
resetUI();
loadSVG();
