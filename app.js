// Americas Map Quiz (GitHub Pages)
// Uses americas.svg (BlankMap-Americas.svg renamed to americas.svg)
//
// Features:
// - Timed quiz with randomized order
// - Spoken country names (TTS)
// - Error beep on wrong click
// - Longer red flash on wrong click
// - Small Caribbean islands visible but disabled
// - Includes Puerto Rico (USA) and French Guiana (France)

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
  { id: "tt", name: "Trinidad and Tobago" },

  // Territories
  { id: "pr", name: "Puerto Rico (USA)" },
  { id: "gf", name: "French Guiana (France)" }
];

// Small Caribbean islands to show but disable
const DISABLED_ISLANDS = ["bb", "gd", "lc", "vc", "ag", "kn", "dm"];

// ---------- SPEECH (TEXT TO SPEECH) ----------
let speechEnabled = true;
let selectedVoice = null;

function pickVoice() {
  if (!("speechSynthesis" in window)) return;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return;

  selectedVoice =
    voices.find(v => /^en/i.test(v.lang) && /Google|Microsoft|Alex|Samantha/i.test(v.name)) ||
    voices.find(v => /^en/i.test(v.lang)) ||
    voices[0];
}

if ("speechSynthesis" in window) {
  pickVoice();
  window.speechSynthesis.onvoiceschanged = pickVoice;
}

function speak(text) {
  if (!speechEnabled) return;
  if (!("speechSynthesis" in window)) return;

  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  if (selectedVoice) u.voice = selectedVoice;
  u.rate = 0.95;
  window.speechSynthesis.speak(u);
}

// ---------- SOUND EFFECTS ----------
let audioCtx = null;

function ensureAudio() {
  if (!(window.AudioContext || window.webkitAudioContext)) return;
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
}

function playWrongBeep() {
  ensureAudio();
  if (!audioCtx) return;

  const t = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = "square";
  osc.frequency.setValueAtTime(440, t);
  osc.frequency.exponentialRampToValueAtTime(220, t + 0.12);

  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.18, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  osc.start(t);
  osc.stop(t + 0.18);
}

// ---------- DOM ----------
const mapContainer = document.getElementById("mapContainer");
const mapStatus = document.getElementById("mapStatus");
const promptEl = document.getElementById("prompt");
const timerEl = document.getElementById("timer");
const progressEl = document.getElementById("progress");
const resultsEl = document.getElementById("results");
const startBtn = document.getElementById("startBtn");
const restartBtn = document.getElementById("restartBtn");

// ---------- STATE ----------
let order = [];
let index = 0;
let running = false;
let startTime = 0;
let rafId = 0;
let score = 0;
let firstClickUsed = false;

const total = COUNTRIES.length;
const byId = new Map(COUNTRIES.map(c => [c.id, c]));
const completed = new Set();

// ---------- HELPERS ----------
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
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

function nextPrompt() {
  if (index >= total) {
    stopTimer();
    promptEl.textContent = "—";
    mapStatus.textContent = "Finished.";
    resultsEl.innerHTML = `
      <strong>Score:</strong> ${score} / ${total} (${((score / total) * 100).toFixed(1)}%)<br>
      <strong>Time:</strong> ${timerEl.textContent}
    `;
    return;
  }

  firstClickUsed = false;
  const country = byId.get(order[index]);
  promptEl.textContent = country.name;
  speak(country.name);
  mapStatus.textContent = "Click the correct country on the map.";
}

function markWrong(el) {
  el.classList.add("wrong");
  setTimeout(() => el.classList.remove("wrong"), 1000);
}

function markCorrect(el) {
  el.classList.add("correct", "locked");
}

// ---------- CLICK HANDLING ----------
function handleCountryClick(id, el) {
  if (!running || completed.has(id)) return;

  if (id === order[index]) {
    if (!firstClickUsed) score++;
    completed.add(id);
    markCorrect(el);
    index++;
    progressEl.textContent = `${index} / ${total}`;
    nextPrompt();
  } else {
    firstClickUsed = true;
    playWrongBeep();
    markWrong(el);
    mapStatus.textContent = "Nope — try again.";
  }
}

// ---------- LOAD SVG ----------
async function loadSVG() {
  const res = await fetch("americas.svg");
  mapContainer.innerHTML = await res.text();

  for (const { id } of COUNTRIES) {
    const el = mapContainer.querySelector(`#${CSS.escape(id)}`);
    if (!el) continue;
    el.classList.add("country");
    el.addEventListener("click", e => {
      e.preventDefault();
      handleCountryClick(id, el);
    });
  }

  for (const id of DISABLED_ISLANDS) {
    const el = mapContainer.querySelector(`#${CSS.escape(id)}`);
    if (el) {
      el.classList.add("disabled-island");
      el.style.pointerEvents = "none";
    }
  }

  progressEl.textContent = `0 / ${total}`;
  mapStatus.textContent = "Map loaded.";
}

// ---------- BUTTONS ----------
startBtn.addEventListener("click", () => {
  ensureAudio();
  pickVoice();

  order = shuffle(COUNTRIES.map(c => c.id));
  index = 0;
  score = 0;
  completed.clear();
  firstClickUsed = false;

  resultsEl.textContent = "Quiz running…";
  startBtn.disabled = true;
  restartBtn.disabled = false;

  startTime = performance.now();
  running = true;
  tick();

  progressEl.textContent = `0 / ${total}`;
  nextPrompt();
});

restartBtn.addEventListener("click", () => {
  stopTimer();
  startBtn.disabled = false;
  restartBtn.disabled = true;
  resultsEl.textContent = "Press Start to begin.";
  promptEl.textContent = "—";
  mapStatus.textContent = "Ready.";
});

// Init
loadSVG();
