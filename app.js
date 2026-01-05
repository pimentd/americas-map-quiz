// Americas Map Quiz (GitHub Pages)
// Uses americas.svg in repo root
//
// Features:
// - Timed quiz with randomized order
// - Spoken country names (TTS) [Mac Chrome tuned voice + reliability]
// - Error beep on wrong click
// - Longer red flash on wrong click (1s)
// - Small Caribbean islands visible but disabled
// - Includes Puerto Rico (USA) and French Guiana (France)
// - Fix for SVG groups (<g>) like Bahamas/Jamaica: apply classes to paintable child shapes
// - End-of-quiz giant modal with percent/time
// - If 100%: fireworks emoji + confetti animation + WebAudio fanfare

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

  // Caribbean
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

// Small Caribbean islands to show but disable (still visible)
const DISABLED_ISLANDS = ["bb", "gd", "lc", "vc", "ag", "kn", "dm"];

// ---------- Speech (TTS) ----------
let speechEnabled = true;
let selectedVoice = null;

// MacBook Chrome–tuned voice picking (prefers Google US English if available)
function pickVoice() {
  if (!("speechSynthesis" in window)) return;

  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return;

  const isEnglish = (v) => /^en(-|_)?/i.test(v.lang || "");

  // BEST OPTIONS on Chrome for macOS (in order)
  const preferredNameMatchers = [
    /google (us )?english/i, // usually the smoothest on Chrome
    /google english/i,

    /samantha/i, // Apple voices (often available)
    /alex/i,
    /daniel/i,
    /karen/i,
    /moira/i,

    /microsoft/i // sometimes present
  ];

  // 1) Try preferred names first
  for (const rx of preferredNameMatchers) {
    const v = voices.find(v => isEnglish(v) && rx.test(v.name || ""));
    if (v) {
      selectedVoice = v;
      return;
    }
  }

  // 2) Otherwise pick any en-US voice
  const enUS = voices.find(v => (v.lang || "").toLowerCase() === "en-us");
  if (enUS) {
    selectedVoice = enUS;
    return;
  }

  // 3) Otherwise any English voice
  selectedVoice = voices.find(isEnglish) || voices[0];
}

// Some browsers load voices asynchronously
if ("speechSynthesis" in window) {
  pickVoice();
  window.speechSynthesis.onvoiceschanged = () => pickVoice();
}

// Pronunciation overrides (optional)
const PRONUNCIATION = {
  // "bs": "The Bahamas",
  // "us": "United States of America",
};

let lastSpokenText = "";
let lastSpeakAt = 0;

function speak(text) {
  if (!speechEnabled) return;
  if (!("speechSynthesis" in window)) return;

  const now = performance.now();

  // Prevent rapid duplicate calls (can cause silent drops)
  if (text === lastSpokenText && (now - lastSpeakAt) < 300) return;

  lastSpokenText = text;
  lastSpeakAt = now;

  const synth = window.speechSynthesis;

  // Cancel only if currently speaking/queued
  if (synth.speaking || synth.pending) synth.cancel();

  const u = new SpeechSynthesisUtterance(text);

  // Helps Chrome/macOS use intended voice/cadence
  u.lang = "en-US";

  if (selectedVoice) u.voice = selectedVoice;

  // Sweet spot for naturalness
  u.rate = 0.90;
  u.pitch = 0.92;
  u.volume = 1.0;

  let started = false;
  u.onstart = () => { started = true; };

  // Tiny delay avoids clipped first syllables + feels less rushed
  setTimeout(() => {
    try {
      synth.speak(u);
    } catch (_) {}
  }, 50);

  // Safety retry: if it didn’t start, retry once
  setTimeout(() => {
    if (!started && !synth.speaking) {
      try {
        synth.cancel();
        const u2 = new SpeechSynthesisUtterance(text);
        u2.lang = "en-US";
        if (selectedVoice) u2.voice = selectedVoice;
        u2.rate = 0.90;
        u2.pitch = 0.92;
        u2.volume = 1.0;
        synth.speak(u2);
      } catch (_) {}
    }
  }, 220);
}

// ---------- Audio (SFX + Fanfare) ----------
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

function playFanfare() {
  ensureAudio();
  if (!audioCtx) return;

  const t0 = audioCtx.currentTime + 0.02;

  function note(freq, start, dur, type = "triangle", vol = 0.20) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(vol, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);

    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }

  // Simple triumphant arpeggio in C major + chord hit
  const C4 = 261.63, E4 = 329.63, G4 = 392.0, C5 = 523.25;
  const C3 = 130.81, E3 = 164.81, G3 = 196.0;

  note(C4, t0 + 0.00, 0.20, "triangle", 0.22);
  note(E4, t0 + 0.18, 0.20, "triangle", 0.22);
  note(G4, t0 + 0.36, 0.22, "triangle", 0.22);
  note(C5, t0 + 0.56, 0.28, "triangle", 0.24);

  note(C3, t0 + 0.92, 0.55, "sine", 0.18);
  note(E3, t0 + 0.92, 0.55, "sine", 0.16);
  note(G3, t0 + 0.92, 0.55, "sine", 0.16);
  note(C4, t0 + 0.92, 0.55, "triangle", 0.12);
}

// ---------- Confetti (Canvas) ----------
let confettiRAF = 0;
let confettiActive = false;

function stopConfetti() {
  confettiActive = false;
  cancelAnimationFrame(confettiRAF);
  confettiRAF = 0;
}

function startConfetti(canvas) {
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const dpr = Math.max(1, window.devicePixelRatio || 1);

  function resize() {
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
  }
  resize();

  const colors = ["#ffffff", "#7aa7ff", "#35d07f", "#ff5c75", "#f7d154"];
  const N = 180;
  const parts = Array.from({ length: N }, () => ({
    x: Math.random() * canvas.width,
    y: -Math.random() * canvas.height,
    vx: (Math.random() - 0.5) * 1.3 * dpr,
    vy: (2.0 + Math.random() * 3.6) * dpr,
    r: (2 + Math.random() * 4) * dpr,
    a: Math.random() * Math.PI * 2,
    va: (Math.random() - 0.5) * 0.25,
    c: colors[(Math.random() * colors.length) | 0],
    wob: (Math.random() * 0.8 + 0.2) * dpr
  }));

  confettiActive = true;

  function frame() {
    if (!confettiActive) return;

    resize();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const p of parts) {
      p.x += p.vx + Math.sin(p.a) * p.wob;
      p.y += p.vy;
      p.a += p.va;

      if (p.y > canvas.height + 20 * dpr) {
        p.y = -20 * dpr;
        p.x = Math.random() * canvas.width;
      }
      if (p.x < -20 * dpr) p.x = canvas.width + 20 * dpr;
      if (p.x > canvas.width + 20 * dpr) p.x = -20 * dpr;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.a);
      ctx.fillStyle = p.c;
      ctx.globalAlpha = 0.95;
      ctx.fillRect(-p.r, -p.r * 0.6, p.r * 2.2, p.r * 1.2);
      ctx.restore();
    }

    confettiRAF = requestAnimationFrame(frame);
  }

  frame();
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

// End modal
const endModal = document.getElementById("endModal");
const closeModalBtn = document.getElementById("closeModalBtn");
const modalRestartBtn = document.getElementById("modalRestartBtn");
const finalPercentEl = document.getElementById("finalPercent");
const finalTimeEl = document.getElementById("finalTime");
const perfectBox = document.getElementById("perfectBox");
const confettiCanvas = document.getElementById("confettiCanvas");

// ---------- State ----------
let order = [];
let index = 0;
let running = false;
let startTime = 0;
let rafId = 0;
let score = 0;
let firstClickUsed = false;

const byId = new Map(COUNTRIES.map(c => [c.id, c]));
const completed = new Set();

// id -> { rootEl, paintEls[] }
const countryEls = new Map();

// ---------- Helpers ----------
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

function getPaintTargets(rootEl) {
  if (!rootEl) return [];
  const tag = (rootEl.tagName || "").toLowerCase();
  if (tag === "g") {
    const inner = rootEl.querySelectorAll("path, polygon, rect, circle, ellipse, polyline, line");
    return inner.length ? Array.from(inner) : [rootEl];
  }
  return [rootEl];
}

function addClassToTargets(id, className) {
  const entry = countryEls.get(id);
  if (!entry) return;
  for (const el of entry.paintEls) el.classList.add(className);
}

function removeClassFromTargets(id, className) {
  const entry = countryEls.get(id);
  if (!entry) return;
  for (const el of entry.paintEls) el.classList.remove(className);
}

function resetClasses() {
  for (const { id } of COUNTRIES) {
    removeClassFromTargets(id, "wrong");
    removeClassFromTargets(id, "correct");
    removeClassFromTargets(id, "locked");
    addClassToTargets(id, "country");
  }
}

function setPrompt(country) {
  promptEl.textContent = country ? country.name : "—";
  if (subpromptEl) subpromptEl.textContent = country ? `(${country.id})` : "";
}

function setStatus(text) {
  mapStatus.textContent = text;
}

function setProgress() {
  progressEl.textContent = `${Math.min(index, COUNTRIES.length)} / ${COUNTRIES.length}`;
}

// ---------- Feedback ----------
function markWrong(id) {
  addClassToTargets(id, "wrong");
  setTimeout(() => removeClassFromTargets(id, "wrong"), 1000);
}

function markCorrect(id) {
  addClassToTargets(id, "correct");
  addClassToTargets(id, "locked");
}

// ---------- End modal ----------
function openEndModal({ percentText, timeText, perfect }) {
  if (!endModal) return;

  if (finalPercentEl) finalPercentEl.textContent = percentText;
  if (finalTimeEl) finalTimeEl.textContent = timeText;

  if (perfect) {
    if (perfectBox) perfectBox.classList.remove("hidden");
    if (confettiCanvas) startConfetti(confettiCanvas);
    playFanfare();
  } else {
    if (perfectBox) perfectBox.classList.add("hidden");
    stopConfetti();
  }

  endModal.classList.remove("hidden");
}

function closeEndModal() {
  if (!endModal) return;
  endModal.classList.add("hidden");
  stopConfetti();
}

// ---------- Quiz flow ----------
function nextPrompt() {
  if (index >= COUNTRIES.length) {
    stopTimer();
    setPrompt(null);
    setStatus("Finished.");

    const elapsed = (performance.now() - startTime) / 1000;
    const pct = (score / COUNTRIES.length) * 100;
    const perfect = score === COUNTRIES.length;

    if (resultsEl) {
      resultsEl.classList.remove("muted");
      resultsEl.innerHTML = `
        <div><strong>Score:</strong> ${score} / ${COUNTRIES.length} (${pct.toFixed(1)}%)</div>
        <div><strong>Time:</strong> ${elapsed.toFixed(1)}s</div>
      `;
    }

    openEndModal({
      percentText: `${pct.toFixed(1)}%`,
      timeText: `${elapsed.toFixed(1)}s`,
      perfect
    });

    return;
  }

  firstClickUsed = false;
  const country = byId.get(order[index]);
  setPrompt(country);

  const spoken = PRONUNCIATION[country.id] || country.name;
  speak(spoken);

  setStatus("Click the correct country on the map.");
}

// ---------- Click handling ----------
function handleCountryClick(id) {
  if (!running) return;
  if (completed.has(id)) return;

  const targetId = order[index];

  if (id === targetId) {
    if (!firstClickUsed) score++;
    completed.add(id);
    markCorrect(id);

    index++;
    setProgress();
    nextPrompt();
  } else {
    if (!firstClickUsed) firstClickUsed = true;
    playWrongBeep();
    markWrong(id);
    setStatus("Nope — try again.");
  }
}

// ---------- Load SVG ----------
async function loadSVG() {
  try {
    setStatus("Loading map…");
    const res = await fetch("americas.svg", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    mapContainer.innerHTML = await res.text();

    // Wire up countries
    for (const { id } of COUNTRIES) {
      const rootEl = mapContainer.querySelector(`#${CSS.escape(id)}`);
      if (!rootEl) continue;

      const paintEls = getPaintTargets(rootEl);
      countryEls.set(id, { rootEl, paintEls });

      for (const el of paintEls) el.classList.add("country");

      const clickHandler = (e) => {
        e.preventDefault();
        e.stopPropagation();
        handleCountryClick(id);
      };

      rootEl.addEventListener("click", clickHandler);
      for (const el of paintEls) el.addEventListener("click", clickHandler);
    }

    // Disable tiny islands (still visible)
    for (const id of DISABLED_ISLANDS) {
      const rootEl = mapContainer.querySelector(`#${CSS.escape(id)}`);
      if (!rootEl) continue;

      const paintEls = getPaintTargets(rootEl);
      for (const el of paintEls) {
        el.classList.add("disabled-island");
        el.style.pointerEvents = "none";
      }
      rootEl.style.pointerEvents = "none";
    }

    setStatus("Map loaded.");
    setProgress();
    setPrompt(null);
  } catch (err) {
    console.error(err);
    setStatus('Failed to load "americas.svg"');
    if (resultsEl) {
      resultsEl.classList.remove("muted");
      resultsEl.textContent = 'Could not load americas.svg. Make sure it is in the repo root.';
    }
  }
}

// ---------- Reset ----------
function resetUI() {
  stopTimer();
  running = false;

  if ("speechSynthesis" in window) window.speechSynthesis.cancel();

  score = 0;
  index = 0;
  firstClickUsed = false;
  completed.clear();

  if (resultsEl) {
    resultsEl.classList.add("muted");
    resultsEl.textContent = "Press Start to begin.";
  }
  if (timerEl) timerEl.textContent = "0.0s";

  startBtn.disabled = false;
  restartBtn.disabled = true;

  setPrompt(null);
  setStatus("Ready.");
  setProgress();

  resetClasses();
  closeEndModal();
}

// ---------- Buttons ----------
startBtn.addEventListener("click", () => {
  // Prime/unlock audio on user gesture
  ensureAudio();
  pickVoice();

  // Warm up speech engine (reduces occasional drops)
  try {
    const warm = new SpeechSynthesisUtterance(" ");
    warm.lang = "en-US";
    warm.volume = 0;
    window.speechSynthesis.speak(warm);
    window.speechSynthesis.cancel();
  } catch (_) {}

  closeEndModal();

  order = shuffle(COUNTRIES.map(c => c.id));
  index = 0;
  score = 0;
  completed.clear();
  firstClickUsed = false;

  if (resultsEl) {
    resultsEl.classList.add("muted");
    resultsEl.textContent = "Quiz running…";
  }
  startBtn.disabled = true;
  restartBtn.disabled = false;

  resetClasses();

  startTime = performance.now();
  running = true;
  tick();

  setProgress();
  nextPrompt();
});

restartBtn.addEventListener("click", resetUI);
modalRestartBtn?.addEventListener("click", () => {
  closeEndModal();
  resetUI();
});
closeModalBtn?.addEventListener("click", closeEndModal);
endModal?.addEventListener("click", (e) => {
  if (e.target.classList && e.target.classList.contains("modal-backdrop")) closeEndModal();
});

// Init
resetUI();
loadSVG();
