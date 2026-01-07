/* app.js – FULL FILE
   - Loads SVG map
   - Region modes + auto-zoom
   - Timed quiz, randomized order
   - Correct = green, wrong = red flash + wrong sound
   - Speech says country name (improved reliability)
   - End modal + confetti + perfect-score jingle
   - Single primary button:
       Idle  -> START
       Running -> START OVER
       Finished -> PLAY AGAIN
*/

const SVG_CANDIDATES = ["americas.svg", "BlankMap-Americas.svg", "blankmap-americas.svg"];

// =====================
// Data
// =====================
const COUNTRIES = [
  // North America
  { id: "ca", name: "Canada", region: "north" },
  { id: "us", name: "United States", region: "north" },
  { id: "mx", name: "Mexico", region: "north" },

  // Central America
  { id: "bz", name: "Belize", region: "central" },
  { id: "gt", name: "Guatemala", region: "central" },
  { id: "sv", name: "El Salvador", region: "central" },
  { id: "hn", name: "Honduras", region: "central" },
  { id: "ni", name: "Nicaragua", region: "central" },
  { id: "cr", name: "Costa Rica", region: "central" },
  { id: "pa", name: "Panama", region: "central" },

  // South America
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

  // Caribbean (selected)
  { id: "bs", name: "Bahamas", region: "caribbean" },
  { id: "cu", name: "Cuba", region: "caribbean" },
  { id: "jm", name: "Jamaica", region: "caribbean" },
  { id: "ht", name: "Haiti", region: "caribbean" },
  { id: "do", name: "Dominican Republic", region: "caribbean" },
  { id: "tt", name: "Trinidad and Tobago", region: "caribbean" },

  // Territories
  { id: "pr", name: "Puerto Rico (USA)", region: "caribbean" },
  { id: "gf", name: "French Guiana (France)", region: "south" }
];

const DISABLED_ISLAND_IDS = new Set([
  // add tiny islands here if you ever re-enable them in the SVG
]);

// =====================
// DOM
// =====================
const mapContainer = document.getElementById("mapContainer");
const mapStatus = document.getElementById("mapStatus");

const promptEl = document.getElementById("prompt");
const subpromptEl = document.getElementById("subprompt");

const startBtn = document.getElementById("startBtn");
const restartBtn = document.getElementById("restartBtn"); // exists in HTML but hidden in CSS
const modebar = document.getElementById("modebar");

const progressEl = document.getElementById("progress");
const timerEl = document.getElementById("timer");
const percentEl = document.getElementById("percent");
const resultsEl = document.getElementById("results");

const endModal = document.getElementById("endModal");
const closeModalBtn = document.getElementById("closeModalBtn");
const finalPercentEl = document.getElementById("finalPercent");
const finalTimeEl = document.getElementById("finalTime");
const perfectBox = document.getElementById("perfectBox");
const confettiCanvas = document.getElementById("confettiCanvas");

// =====================
// State
// =====================
let svgRoot = null;
let countryEls = new Map(); // id -> element
let ringEls = new Map();    // id -> hit ring element

let mode = "all"; // all | caribbean | central | south
let quizList = [];
let index = 0;
let correct = 0;

let running = false;
let finished = false;

let startTime = 0;
let rafId = 0;

let lastSpokenName = "";
let lastSpokenAt = 0;

// =====================
// Utils
// =====================
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function fmtTime(ms) {
  return (ms / 1000).toFixed(1) + "s";
}

function setStatus(msg) {
  mapStatus.textContent = msg;
}

function setModeButtonsDisabled(disabled) {
  [...modebar.querySelectorAll(".modebtn")].forEach(btn => {
    btn.disabled = disabled;
  });
}

function setActiveModeButton(modeVal) {
  [...modebar.querySelectorAll(".modebtn")].forEach(btn => {
    btn.classList.toggle("active", btn.dataset.mode === modeVal);
  });
}

function computeListForMode() {
  if (mode === "all") return COUNTRIES;
  if (mode === "caribbean") return COUNTRIES.filter(c => c.region === "caribbean");
  if (mode === "central") return COUNTRIES.filter(c => c.region === "central");
  if (mode === "south") return COUNTRIES.filter(c => c.region === "south");
  return COUNTRIES;
}

function updateProgressUI() {
  const total = quizList.length || computeListForMode().length;
  progressEl.textContent = `${correct} / ${total}`;
  const pct = total ? Math.round((correct / total) * 100) : 0;
  percentEl.textContent = `${pct}%`;
}

function updateTimerUI(ms) {
  timerEl.textContent = fmtTime(ms);
}

function updateResultsUI(text, muted = false) {
  resultsEl.textContent = text;
  resultsEl.classList.toggle("muted", muted);
}

// Primary button label logic
function updatePrimaryButton() {
  if (running) {
    startBtn.textContent = "Start Over";
    startBtn.title = "Restart the quiz now";
    return;
  }
  if (finished) {
    startBtn.textContent = "Play Again";
    startBtn.title = "Start a new run";
    return;
  }
  startBtn.textContent = "Start";
  startBtn.title = "Start the quiz";
}

// =====================
// Audio / Speech
// =====================
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function beep(type = "wrong") {
  // small “gamey” beep using WebAudio (no external files)
  const t = audioCtx.currentTime;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();

  o.type = "sine";
  o.frequency.value = type === "wrong" ? 220 : 660;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.08, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);

  o.connect(g);
  g.connect(audioCtx.destination);

  o.start(t);
  o.stop(t + 0.26);
}

function playPerfectJingle() {
  // quick triad-ish jingle
  const now = audioCtx.currentTime;
  const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
  notes.forEach((freq, i) => {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = "triangle";
    o.frequency.value = freq;

    const t0 = now + i * 0.12;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.12, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);

    o.connect(g);
    g.connect(audioCtx.destination);

    o.start(t0);
    o.stop(t0 + 0.2);
  });
}

function speakName(name) {
  // Chrome on macOS sometimes “misses” speech if you re-trigger too quickly.
  // This tries to improve reliability:
  // - cancel any prior utterance
  // - avoid re-speaking the exact same word immediately
  const now = performance.now();
  if (name === lastSpokenName && now - lastSpokenAt < 400) return;

  if (!("speechSynthesis" in window)) return;

  try {
    window.speechSynthesis.cancel();

    const u = new SpeechSynthesisUtterance(name);
    u.rate = 0.95;
    u.pitch = 1.05;
    u.volume = 1.0;

    // Prefer an English voice (usually sounds less robotic)
    const voices = window.speechSynthesis.getVoices?.() || [];
    const preferred =
      voices.find(v => /en-US/i.test(v.lang) && /Google/i.test(v.name)) ||
      voices.find(v => /en-US/i.test(v.lang)) ||
      voices.find(v => /^en/i.test(v.lang));
    if (preferred) u.voice = preferred;

    window.speechSynthesis.speak(u);

    lastSpokenName = name;
    lastSpokenAt = now;
  } catch {
    // ignore
  }
}

// On some browsers, voices load async
if ("speechSynthesis" in window) {
  window.speechSynthesis.onvoiceschanged = () => {
    // noop, but touching it helps some engines populate voices
    window.speechSynthesis.getVoices?.();
  };
}

// =====================
// Confetti
// =====================
let confettiRAF = 0;

function startConfetti() {
  const ctx = confettiCanvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;

  const rect = confettiCanvas.getBoundingClientRect();
  confettiCanvas.width = Math.floor(rect.width * dpr);
  confettiCanvas.height = Math.floor(rect.height * dpr);
  ctx.scale(dpr, dpr);

  const W = rect.width;
  const H = rect.height;

  const pieces = Array.from({ length: 130 }, () => ({
    x: Math.random() * W,
    y: -Math.random() * H,
    r: 2 + Math.random() * 4,
    vy: 1 + Math.random() * 3,
    vx: -0.8 + Math.random() * 1.6,
    rot: Math.random() * Math.PI,
    vr: -0.08 + Math.random() * 0.16
  }));

  function frame() {
    ctx.clearRect(0, 0, W, H);
    for (const p of pieces) {
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;

      if (p.y > H + 10) {
        p.y = -10;
        p.x = Math.random() * W;
      }
      if (p.x < -10) p.x = W + 10;
      if (p.x > W + 10) p.x = -10;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillRect(-p.r, -p.r, p.r * 2, p.r * 2);
      ctx.restore();
    }

    confettiRAF = requestAnimationFrame(frame);
  }

  // random-ish fill colors without hardcoding specific palette logic
  // (we just set a different fillStyle a few times to create variety)
  const origFill = ctx.fillStyle;
  let i = 0;
  const styles = ["rgba(255,255,255,.9)", "rgba(122,167,255,.9)", "rgba(53,208,127,.9)", "rgba(255,92,117,.9)"];
  const oldFillRect = ctx.fillRect.bind(ctx);
  ctx.fillRect = function(x, y, w, h) {
    ctx.fillStyle = styles[i++ % styles.length];
    return oldFillRect(x, y, w, h);
  };

  frame();

  // restore method after starting
  setTimeout(() => {
    ctx.fillStyle = origFill;
  }, 0);
}

function stopConfetti() {
  cancelAnimationFrame(confettiRAF);
  confettiRAF = 0;
  const ctx = confettiCanvas.getContext("2d");
  const rect = confettiCanvas.getBoundingClientRect();
  ctx.clearRect(0, 0, rect.width, rect.height);
}

// =====================
// SVG Loading + Wiring
// =====================
async function loadSVG() {
  for (const filename of SVG_CANDIDATES) {
    try {
      const res = await fetch(filename, { cache: "no-store" });
      if (!res.ok) continue;
      const txt = await res.text();

      const parser = new DOMParser();
      const doc = parser.parseFromString(txt, "image/svg+xml");
      const svg = doc.querySelector("svg");
      if (!svg) continue;

      mapContainer.innerHTML = "";
      mapContainer.appendChild(svg);
      svgRoot = svg;

      setStatus("Map loaded.");
      wireUpSVG(svg);

      return true;
    } catch {
      // try next
    }
  }

  setStatus("Could not load map (SVG not found).");
  return false;
}

function wireUpSVG(svg) {
  countryEls.clear();
  ringEls.clear();

  // countries are paths with ids like "us", "ca", etc
  COUNTRIES.forEach(({ id }) => {
    const el = svg.querySelector(`#${CSS.escape(id)}`);
    if (el) {
      el.classList.add("country");
      countryEls.set(id, el);

      if (DISABLED_ISLAND_IDS.has(id)) {
        el.classList.add("disabled-island");
        el.style.pointerEvents = "none";
      }

      el.addEventListener("click", () => onMapClick(id));
    }
  });

  // helper click rings (added in SVG or previously inserted)
  // class: .hit-target with data-for="bs" etc.
  svg.querySelectorAll(".hit-target").forEach(ring => {
    const forId = ring.getAttribute("data-for");
    if (!forId) return;
    ringEls.set(forId, ring);

    ring.addEventListener("click", (e) => {
      e.stopPropagation();
      onMapClick(forId);
    });
  });

  // ocean/lakes styling lives in SVG; container background is also ocean
  // (we keep both)

  // Make viewBox responsive
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
}

// =====================
// Zoom (region focus)
// =====================
const ZOOMS = {
  all:     { x: 0.5, y: 0.5, s: 1.0 },
  caribbean:{ x: 0.62, y: 0.42, s: 2.0 },
  central: { x: 0.52, y: 0.52, s: 1.7 },
  south:   { x: 0.58, y: 0.68, s: 1.5 }
};

function applyZoom(modeVal) {
  if (!svgRoot) return;
  const z = ZOOMS[modeVal] || ZOOMS.all;

  // We implement zoom via SVG viewBox manipulation.
  // We derive the original viewBox, then set a cropped viewBox.
  const vb = svgRoot.viewBox.baseVal;
  if (!vb || !vb.width || !vb.height) return;

  const W = vb.width;
  const H = vb.height;

  const cropW = W / z.s;
  const cropH = H / z.s;

  const cx = vb.x + W * z.x;
  const cy = vb.y + H * z.y;

  const x = cx - cropW / 2;
  const y = cy - cropH / 2;

  svgRoot.setAttribute("viewBox", `${x} ${y} ${cropW} ${cropH}`);
}

// =====================
// Quiz Logic
// =====================
function resetMapColors() {
  countryEls.forEach(el => {
    el.classList.remove("correct", "wrong", "locked");
  });
}

function setPrompt(text, sub = "") {
  promptEl.textContent = text || "—";
  subpromptEl.textContent = sub || "";
}

function currentTarget() {
  return quizList[index] || null;
}

function startTimer() {
  startTime = performance.now();
  cancelAnimationFrame(rafId);

  const tick = () => {
    if (!running) return;
    const ms = performance.now() - startTime;
    updateTimerUI(ms);
    rafId = requestAnimationFrame(tick);
  };
  tick();
}

function stopTimer() {
  cancelAnimationFrame(rafId);
  rafId = 0;
}

function startQuiz() {
  if (!svgRoot) return;

  // Ensure audio is allowed after user gesture
  if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});

  closeEndModal();
  stopConfetti();

  running = true;
  finished = false;

  correct = 0;
  index = 0;

  resetMapColors();

  quizList = shuffle(computeListForMode());

  setModeButtonsDisabled(true);
  restartBtn && (restartBtn.disabled = false);

  updatePrimaryButton();
  updateProgressUI();
  updateTimerUI(0);
  updateResultsUI("Quiz running...", true);

  applyZoom(mode);

  const tgt = currentTarget();
  setPrompt(tgt?.name || "—");
  if (tgt) speakName(tgt.name);

  startTimer();
}

function restartQuizOnly() {
  running = false;
  finished = false;

  stopTimer();
  window.speechSynthesis?.cancel?.();

  correct = 0;
  index = 0;
  quizList = [];

  resetMapColors();

  setModeButtonsDisabled(false);
  restartBtn && (restartBtn.disabled = true);

  updatePrimaryButton();
  updateProgressUI();
  updateTimerUI(0);
  setPrompt("—");
  updateResultsUI("Press Start to begin.", true);

  applyZoom(mode);
}

function endQuiz() {
  running = false;
  finished = true;

  stopTimer();

  const total = quizList.length || 0;
  const pct = total ? Math.round((correct / total) * 100) : 0;
  const ms = performance.now() - startTime;

  updatePrimaryButton();
  updateResultsUI(`Score: ${correct} / ${total} (${pct}%)\nTime: ${fmtTime(ms)}`, false);

  finalPercentEl.textContent = `${pct}%`;
  finalTimeEl.textContent = fmtTime(ms);

  const perfect = pct === 100 && total > 0;
  perfectBox.classList.toggle("hidden", !perfect);

  openEndModal();

  if (perfect) {
    startConfetti();
    playPerfectJingle();
  }

  setModeButtonsDisabled(false);
  restartBtn && (restartBtn.disabled = false);
}

function onMapClick(id) {
  if (!running) return;

  const tgt = currentTarget();
  if (!tgt) return;

  const clickedEl = countryEls.get(id) || ringEls.get(id);
  const targetEl = countryEls.get(tgt.id);

  if (id === tgt.id) {
    // correct
    if (targetEl) targetEl.classList.add("correct", "locked");
    correct++;
    index++;

    updateProgressUI();

    if (index >= quizList.length) {
      setPrompt("—");
      endQuiz();
      return;
    }

    const next = currentTarget();
    setPrompt(next?.name || "—");
    if (next) speakName(next.name);
  } else {
    // wrong
    if (clickedEl) {
      clickedEl.classList.add("wrong");
      setTimeout(() => clickedEl.classList.remove("wrong"), 650);
    }
    beep("wrong");
  }
}

// =====================
// Modal
// =====================
function openEndModal() {
  endModal.classList.remove("hidden");
}

function closeEndModal() {
  endModal.classList.add("hidden");
}

// =====================
// Event Listeners
// =====================
startBtn.addEventListener("click", () => {
  // The one-button behavior:
  // - Idle: Start
  // - Running: Start Over (immediate restart)
  // - Finished: Play Again (start fresh)
  if (running) {
    restartQuizOnly();
    startQuiz();
    return;
  }
  if (finished) {
    restartQuizOnly();
    startQuiz();
    return;
  }
  startQuiz();
});

restartBtn && restartBtn.addEventListener("click", () => {
  // still works if you ever unhide it
  restartQuizOnly();
});

modebar.addEventListener("click", (e) => {
  const btn = e.target.closest(".modebtn");
  if (!btn) return;
  if (btn.disabled) return;

  mode = btn.dataset.mode;
  setActiveModeButton(mode);

  // if finished/idle, show the zoom immediately
  applyZoom(mode);

  // If not running, update the total shown in progress
  if (!running) {
    const total = computeListForMode().length;
    progressEl.textContent = `0 / ${total}`;
    percentEl.textContent = "0%";
  }
});

closeModalBtn.addEventListener("click", () => {
  closeEndModal();
});

endModal.addEventListener("click", (e) => {
  if (e.target.classList.contains("modal-backdrop")) {
    closeEndModal();
  }
});

// =====================
// Init
// =====================
(function init() {
  setActiveModeButton(mode);
  updatePrimaryButton();

  // show initial totals
  const total = computeListForMode().length;
  progressEl.textContent = `0 / ${total}`;
  percentEl.textContent = "0%";
  updateTimerUI(0);
  setPrompt("—");
  updateResultsUI("Press Start to begin.", true);

  loadSVG().then(ok => {
    if (!ok) return;
    applyZoom(mode);
  });
})();
