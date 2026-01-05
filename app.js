// Americas Map Quiz (GitHub Pages)
// Uses americas.svg in repo root
//
// Region practice toggles + automatic zoom to selected region.
// Features:
// - Timed quiz with randomized order
// - Spoken country names (TTS) tuned for Chrome on Mac
// - Error beep on wrong click + longer red flash (1s)
// - Small Caribbean islands visible but disabled
// - Includes Puerto Rico (USA) and French Guiana (France)
// - Fix for SVG groups (<g>) like Bahamas/Jamaica: apply classes to paintable child shapes
// - End-of-quiz giant modal with percent/time
// - If 100%: fireworks emoji + confetti + WebAudio fanfare
//
// Zoom fix:
// - Uses getBBox + getCTM corner transforms to compute bbox in SVG coordinate space (reliable)

const COUNTRIES = [
  // North America (included only in "All Americas" mode)
  { id: "ca", name: "Canada", region: "north" },
  { id: "us", name: "United States", region: "north" },
  { id: "mx", name: "Mexico", region: "north" },

  // Central America
  { id: "bz", name: "Belize", region: "central" },
  { id: "gt", name: "Guatemala", region: "central" },
  { id: "hn", name: "Honduras", region: "central" },
  { id: "sv", name: "El Salvador", region: "central" },
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

  // Caribbean (larger/common)
  { id: "bs", name: "Bahamas", region: "caribbean" },
  { id: "cu", name: "Cuba", region: "caribbean" },
  { id: "jm", name: "Jamaica", region: "caribbean" },
  { id: "ht", name: "Haiti", region: "caribbean" },
  { id: "do", name: "Dominican Republic", region: "caribbean" },
  { id: "tt", name: "Trinidad and Tobago", region: "caribbean" },

  // Territories (assigned geographically)
  { id: "pr", name: "Puerto Rico (USA)", region: "caribbean" },
  { id: "gf", name: "French Guiana (France)", region: "south" }
];

// Small Caribbean islands to show but disable (still visible)
const DISABLED_ISLANDS = ["bb", "gd", "lc", "vc", "ag", "kn", "dm"];

// ---------- Region Mode ----------
let currentMode = "all"; // all | caribbean | central | south
function getActiveCountries() {
  if (currentMode === "all") return COUNTRIES;
  return COUNTRIES.filter(c => c.region === currentMode);
}

// ---------- Speech (TTS) ----------
let speechEnabled = true;
let selectedVoice = null;

function pickVoice() {
  if (!("speechSynthesis" in window)) return;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return;

  const isEnglish = (v) => /^en(-|_)?/i.test(v.lang || "");

  const preferredNameMatchers = [
    /google (us )?english/i,
    /google english/i,
    /samantha/i,
    /alex/i,
    /daniel/i,
    /karen/i,
    /moira/i
  ];

  for (const rx of preferredNameMatchers) {
    const v = voices.find(v => isEnglish(v) && rx.test(v.name || ""));
    if (v) { selectedVoice = v; return; }
  }

  const enUS = voices.find(v => (v.lang || "").toLowerCase() === "en-us");
  selectedVoice = enUS || voices.find(isEnglish) || voices[0];
}

if ("speechSynthesis" in window) {
  pickVoice();
  window.speechSynthesis.onvoiceschanged = () => pickVoice();
}

const PRONUNCIATION = {
  // Optional:
  // bs: "The Bahamas",
  // us: "United States of America",
};

let lastSpokenText = "";
let lastSpeakAt = 0;

function speak(text) {
  if (!speechEnabled) return;
  if (!("speechSynthesis" in window)) return;

  const now = performance.now();
  if (text === lastSpokenText && (now - lastSpeakAt) < 300) return;

  lastSpokenText = text;
  lastSpeakAt = now;

  const synth = window.speechSynthesis;
  if (synth.speaking || synth.pending) synth.cancel();

  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  if (selectedVoice) u.voice = selectedVoice;

  u.rate = 0.90;
  u.pitch = 0.92;
  u.volume = 1.0;

  let started = false;
  u.onstart = () => { started = true; };

  setTimeout(() => { try { synth.speak(u); } catch (_) {} }, 50);

  // Retry once if it didn't start (Mac Chrome sometimes drops)
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

// Mode buttons
const modebar = document.getElementById("modebar");
const modeButtons = modebar ? Array.from(modebar.querySelectorAll(".modebtn")) : [];

// End modal
const endModal = document.getElementById("endModal");
const closeModalBtn = document.getElementById("closeModalBtn");
const finalPercentEl = document.getElementById("finalPercent");
const finalTimeEl = document.getElementById("finalTime");
const perfectBox = document.getElementById("perfectBox");
const confettiCanvas = document.getElementById("confettiCanvas");

// ---------- SVG Zoom State ----------
let svgEl = null;
let originalViewBox = null;

function setViewBox(x, y, w, h) {
  if (!svgEl) return;
  svgEl.setAttribute("viewBox", `${x} ${y} ${w} ${h}`);
}

function restoreViewBox() {
  if (!svgEl || !originalViewBox) return;
  svgEl.setAttribute("viewBox", originalViewBox);
}

function unionBBox(a, b) {
  if (!a) return b;
  if (!b) return a;
  const x1 = Math.min(a.x, b.x);
  const y1 = Math.min(a.y, b.y);
  const x2 = Math.max(a.x + a.w, b.x + b.w);
  const y2 = Math.max(a.y + a.h, b.y + b.h);
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

// Transform a point using an SVGMatrix
function transformPoint(x, y, m) {
  return {
    x: m.a * x + m.c * y + m.e,
    y: m.b * x + m.d * y + m.f
  };
}

// Compute element bbox in SVG coordinate system using getBBox + getCTM corner transforms
function getBBoxInSvgCoords(el) {
  if (!el || typeof el.getBBox !== "function") return null;

  let bb;
  try {
    bb = el.getBBox();
  } catch (_) {
    return null;
  }

  const ctm = el.getCTM?.();
  if (!ctm) {
    // If no CTM, assume bbox is already in SVG coords (best effort)
    return { x: bb.x, y: bb.y, w: bb.width, h: bb.height };
  }

  const p1 = transformPoint(bb.x, bb.y, ctm);
  const p2 = transformPoint(bb.x + bb.width, bb.y, ctm);
  const p3 = transformPoint(bb.x, bb.y + bb.height, ctm);
  const p4 = transformPoint(bb.x + bb.width, bb.y + bb.height, ctm);

  const xs = [p1.x, p2.x, p3.x, p4.x];
  const ys = [p1.y, p2.y, p3.y, p4.y];

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  if (![minX, maxX, minY, maxY].every(Number.isFinite)) return null;

  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function zoomToIds(ids, paddingPct = 0.10) {
  if (!svgEl) return;

  let bbox = null;

  for (const id of ids) {
    const entry = countryEls.get(id);
    if (!entry) continue;

    // Prefer root bbox; if it fails, try paint elements
    let b = getBBoxInSvgCoords(entry.rootEl);
    if (!b) {
      for (const pe of entry.paintEls) {
        b = getBBoxInSvgCoords(pe);
        if (b) break;
      }
    }
    if (!b) continue;

    bbox = unionBBox(bbox, b);
  }

  // If bbox looks invalid, bail out to original viewBox
  if (!bbox || !Number.isFinite(bbox.w) || !Number.isFinite(bbox.h) || bbox.w <= 0 || bbox.h <= 0) {
    restoreViewBox();
    return;
  }

  const padX = bbox.w * paddingPct;
  const padY = bbox.h * paddingPct;

  setViewBox(
    bbox.x - padX,
    bbox.y - padY,
    bbox.w + padX * 2,
    bbox.h + padY * 2
  );
}

function applyRegionZoom() {
  if (!svgEl) return;

  if (currentMode === "all") {
    restoreViewBox();
    return;
  }

  const ids = activeCountries.map(c => c.id);

  // Different padding per mode (Caribbean needs less padding to feel zoomed in)
  const pad =
    currentMode === "caribbean" ? 0.06 :
    currentMode === "central" ? 0.08 :
    0.10;

  zoomToIds(ids, pad);
}

// Apply zoom AFTER the browser has painted the SVG (important for stable bbox)
function applyRegionZoomNextFrame() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      applyRegionZoom();
    });
  });
}

// ---------- State ----------
let activeCountries = getActiveCountries();
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
  progressEl.textContent = `${Math.min(index, activeCountries.length)} / ${activeCountries.length}`;
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
  endModal.classList.add("hidden");
  stopConfetti();
}

// ---------- Quiz flow ----------
function nextPrompt() {
  if (index >= activeCountries.length) {
    stopTimer();
    setPrompt(null);
    setStatus("Finished.");

    const elapsed = (performance.now() - startTime) / 1000;
    const pct = activeCountries.length ? (score / activeCountries.length) * 100 : 0;
    const perfect = score === activeCountries.length && activeCountries.length > 0;

    resultsEl.classList.remove("muted");
    resultsEl.innerHTML = `
      <div><strong>Score:</strong> ${score} / ${activeCountries.length} (${pct.toFixed(1)}%)</div>
      <div><strong>Time:</strong> ${elapsed.toFixed(1)}s</div>
    `;

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

// ---------- Modes ----------
function setMode(mode) {
  if (running) return; // don’t switch mid-run

  currentMode = mode;
  activeCountries = getActiveCountries();

  modeButtons.forEach(b => b.classList.toggle("active", b.dataset.mode === mode));

  completed.clear();
  score = 0;
  index = 0;

  timerEl.textContent = "0.0s";
  resultsEl.classList.add("muted");
  resultsEl.textContent = "Press Start to begin.";

  setPrompt(null);
  setStatus("Ready.");
  setProgress();
  resetClasses();
  closeEndModal();

  applyRegionZoomNextFrame();
}

modeButtons.forEach(btn => {
  btn.addEventListener("click", () => setMode(btn.dataset.mode));
});

// ---------- Load SVG ----------
async function loadSVG() {
  try {
    setStatus("Loading map…");
    const res = await fetch("americas.svg", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    mapContainer.innerHTML = await res.text();

    svgEl = mapContainer.querySelector("svg");
    if (svgEl && !originalViewBox) {
      originalViewBox = svgEl.getAttribute("viewBox");
      if (!originalViewBox) {
        const w = Number(svgEl.getAttribute("width")) || 1000;
        const h = Number(svgEl.getAttribute("height")) || 600;
        originalViewBox = `0 0 ${w} ${h}`;
        svgEl.setAttribute("viewBox", originalViewBox);
      }
    }

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

    applyRegionZoomNextFrame();
  } catch (err) {
    console.error(err);
    setStatus('Failed to load "americas.svg"');
    resultsEl.classList.remove("muted");
    resultsEl.textContent = 'Could not load americas.svg. Make sure it is in the repo root.';
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

  resultsEl.classList.add("muted");
  resultsEl.textContent = "Press Start to begin.";
  timerEl.textContent = "0.0s";

  startBtn.disabled = false;
  restartBtn.disabled = true;

  setPrompt(null);
  setStatus("Ready.");
  setProgress();

  resetClasses();
  closeEndModal();

  applyRegionZoomNextFrame();
}

// ---------- Buttons ----------
startBtn.addEventListener("click", () => {
  ensureAudio();
  pickVoice();

  // Warm up speech engine (helps reliability)
  try {
    const warm = new SpeechSynthesisUtterance(" ");
    warm.lang = "en-US";
    warm.volume = 0;
    window.speechSynthesis.speak(warm);
    window.speechSynthesis.cancel();
  } catch (_) {}

  closeEndModal();

  activeCountries = getActiveCountries();
  applyRegionZoomNextFrame();

  order = shuffle(activeCountries.map(c => c.id));

  index = 0;
  score = 0;
  completed.clear();
  firstClickUsed = false;

  resultsEl.classList.add("muted");
  resultsEl.textContent = "Quiz running…";

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

closeModalBtn.addEventListener("click", closeEndModal);
endModal.addEventListener("click", (e) => {
  if (e.target.classList && e.target.classList.contains("modal-backdrop")) closeEndModal();
});

// Init
resetUI();
loadSVG();
setMode("all");
