/* app.js — FULL FILE
   - Loads SVG map
   - Region modes + auto-zoom
   - Timed quiz, randomized order
   - Correct = green, wrong = red flash + wrong sound
   - Speech says country name (improved reliability)
   - End modal + confetti + perfect-score jingle
   - START button becomes START OVER while running/finished
*/

const SVG_CANDIDATES = ["americas.svg", "BlankMap-Americas.svg", "BlankMap-Americas.svg".toLowerCase()];

// --------------------- DOM ---------------------
const modebar = document.getElementById("modebar");
const startBtn = document.getElementById("startBtn");

const promptEl = document.getElementById("prompt");
const subpromptEl = document.getElementById("subprompt");
const mapStatusEl = document.getElementById("mapStatus");
const mapContainer = document.getElementById("mapContainer");

const timerEl = document.getElementById("timer");
const percentEl = document.getElementById("percent");
const progressEl = document.getElementById("progress");
const resultsEl = document.getElementById("results");

// End modal
const endModal = document.getElementById("endModal");
const closeModalBtn = document.getElementById("closeModalBtn");
const finalPercentEl = document.getElementById("finalPercent");
const finalTimeEl = document.getElementById("finalTime");
const perfectBox = document.getElementById("perfectBox");
const confettiCanvas = document.getElementById("confettiCanvas");

// --------------------- DATA ---------------------
// NOTE: IDs MUST match SVG element IDs (lowercase) for countries.
// Your SVG has ids like: ca, us, mx, gt, ... and also bs, tt, pr, gf etc.
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

  // Caribbean (bigger / commonly assessed)
  { id: "bs", name: "Bahamas", region: "caribbean" },
  { id: "cu", name: "Cuba", region: "caribbean" },
  { id: "jm", name: "Jamaica", region: "caribbean" },
  { id: "ht", name: "Haiti", region: "caribbean" },
  { id: "do", name: "Dominican Republic", region: "caribbean" },
  { id: "tt", name: "Trinidad and Tobago", region: "caribbean" },

  // Territories (optional / included by request)
  { id: "pr", name: "Puerto Rico (USA)", region: "caribbean" },
  { id: "gf", name: "French Guiana (France)", region: "south" },
];

const MODE_LABEL = {
  all: "All Americas",
  caribbean: "Caribbean",
  central: "Central America",
  south: "South America",
};

// --------------------- STATE ---------------------
let svgEl = null;
let countryEls = new Map(); // id -> SVG element
let hitTargetsGroup = null;

let mode = "all";
let activeList = [];     // [{id,name,region}]
let order = [];          // list of ids in randomized order
let idx = 0;

let correct = 0;
let wrong = 0;

let running = false;
let finished = false;
let startTime = 0;
let raf = null;

let audioUnlocked = false;
let audioCtx = null;

// Speech
let chosenVoice = null;
let voicesReady = false;
let lastSpoken = "";

// Confetti
let confettiRunning = false;

// --------------------- UTIL ---------------------
function $(sel, root=document){ return root.querySelector(sel); }
function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

function shuffle(arr){
  const a = arr.slice();
  for(let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function formatTime(ms){
  const s = ms/1000;
  return `${s.toFixed(1)}s`;
}

function setStatus(text){
  mapStatusEl.textContent = text;
  mapStatusEl.style.opacity = "1";
}

function hideStatusSoon(){
  // subtle fade after a moment
  setTimeout(()=>{ mapStatusEl.style.opacity = "0.9"; }, 1200);
  setTimeout(()=>{ mapStatusEl.style.opacity = "0.75"; }, 2200);
}

// --------------------- BUTTON STATE (START <-> START OVER) ---------------------
function setStartIdle(){
  startBtn.textContent = "START";
  startBtn.classList.add("primary");
  startBtn.classList.remove("danger");
}

function setStartOver(){
  startBtn.textContent = "START OVER";
  startBtn.classList.remove("primary");
  startBtn.classList.add("danger");
}

// --------------------- AUDIO ---------------------
function ensureAudio(){
  if(audioUnlocked) return;
  try{
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    // tiny silent beep to unlock
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    g.gain.value = 0.0001;
    o.connect(g).connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + 0.02);
    audioUnlocked = true;
  }catch(e){
    audioUnlocked = true; // degrade gracefully
  }
}

function beepWrong(){
  if(!audioCtx) return;
  const now = audioCtx.currentTime;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = "square";
  o.frequency.setValueAtTime(170, now);
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(0.12, now + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
  o.connect(g).connect(audioCtx.destination);
  o.start(now);
  o.stop(now + 0.27);
}

function jinglePerfect(){
  if(!audioCtx) return;
  const now = audioCtx.currentTime;
  const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
  notes.forEach((f, i) => {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(f, now + i*0.11);
    g.gain.setValueAtTime(0.0001, now + i*0.11);
    g.gain.exponentialRampToValueAtTime(0.10, now + i*0.11 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + i*0.11 + 0.20);
    o.connect(g).connect(audioCtx.destination);
    o.start(now + i*0.11);
    o.stop(now + i*0.11 + 0.22);
  });
}

// --------------------- SPEECH (less robotic + more reliable) ---------------------
function loadVoices(){
  const vs = window.speechSynthesis?.getVoices?.() || [];
  voicesReady = vs.length > 0;
  return vs;
}

function pickVoice(){
  if(!window.speechSynthesis) return;
  const vs = loadVoices();
  if(!vs.length) return;

  // Prefer more natural English voices (Chrome/Mac often has these)
  const preferred = vs.find(v =>
    /Google US English/i.test(v.name) ||
    /Samantha/i.test(v.name) ||
    (/English/i.test(v.lang) && /premium|enhanced|natural/i.test(v.name))
  );

  const fallback = vs.find(v => /^en/i.test(v.lang)) || vs[0];
  chosenVoice = preferred || fallback;
}

if(window.speechSynthesis){
  window.speechSynthesis.onvoiceschanged = () => {
    loadVoices();
    pickVoice();
  };
  // attempt early load
  setTimeout(() => { loadVoices(); pickVoice(); }, 250);
}

function speak(text){
  if(!window.speechSynthesis) return;
  if(!text) return;

  // avoid repeating instantly
  if(text === lastSpoken) return;
  lastSpoken = text;

  // cancel any stuck utterance
  window.speechSynthesis.cancel();

  const u = new SpeechSynthesisUtterance(text);

  if(chosenVoice) u.voice = chosenVoice;

  // "less robotic" defaults
  u.rate = 0.98;
  u.pitch = 1.05;
  u.volume = 1;

  // Safari/Chrome quirk protection: speak on next tick
  setTimeout(() => {
    try{
      window.speechSynthesis.speak(u);

      // reliability retry: if it doesn't start (rare), try once more
      setTimeout(() => {
        if(!window.speechSynthesis.speaking && running && !finished){
          window.speechSynthesis.cancel();
          const u2 = new SpeechSynthesisUtterance(text);
          if(chosenVoice) u2.voice = chosenVoice;
          u2.rate = 0.98; u2.pitch = 1.05; u2.volume = 1;
          window.speechSynthesis.speak(u2);
        }
      }, 220);
    }catch(e){}
  }, 40);
}

// --------------------- SVG LOADING ---------------------
async function fetchFirstAvailable(){
  for(const p of SVG_CANDIDATES){
    try{
      const res = await fetch(p, { cache: "no-cache" });
      if(res.ok) return await res.text();
    }catch(e){}
  }
  throw new Error("Could not load SVG. Make sure americas.svg is in your repo root.");
}

function injectOceanStyle(svg){
  // Ensure ocean/lakes are blue even if SVG has internal white fill
  const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
  style.textContent = `
    .ocean{ fill: var(--ocean) !important; stroke: none !important; }
    .lake{ fill: var(--ocean) !important; stroke: none !important; }
  `;
  svg.insertBefore(style, svg.firstChild);
}

function collectCountries(){
  countryEls.clear();

  // Elements are typically paths with ids like 'us', 'ca', etc.
  for(const c of COUNTRIES){
    const el = svgEl.querySelector(`#${CSS.escape(c.id)}`);
    if(el){
      countryEls.set(c.id, el);
      el.classList.add("country");
      el.style.cursor = "pointer";
      el.dataset.cid = c.id;
    }
  }
}

function resetClasses(){
  for(const el of countryEls.values()){
    el.classList.remove("correct", "wrong", "locked");
  }
}

function setAllLocked(locked){
  for(const el of countryEls.values()){
    if(locked) el.classList.add("locked");
    else el.classList.remove("locked");
  }
}

// --------------------- HIT RINGS ---------------------
function ensureHitTargetsGroup(){
  if(hitTargetsGroup) return hitTargetsGroup;
  hitTargetsGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
  hitTargetsGroup.setAttribute("id", "hit_targets");
  svgEl.appendChild(hitTargetsGroup);
  return hitTargetsGroup;
}

function addHitCircleForCountry(id, radius){
  const el = countryEls.get(id);
  if(!el) return;

  const box = el.getBBox();
  const cx = box.x + box.width/2;
  const cy = box.y + box.height/2;

  const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  c.setAttribute("cx", cx);
  c.setAttribute("cy", cy);
  c.setAttribute("r", radius);
  c.classList.add("hit-target");
  c.dataset.cid = id;

  // ring click should behave as clicking the country
  c.addEventListener("click", (e) => {
    e.stopPropagation();
    handleCountryClick(id);
  });

  ensureHitTargetsGroup().appendChild(c);
}

function buildClickHelperRings(){
  if(!svgEl) return;
  // clear old rings
  if(hitTargetsGroup) hitTargetsGroup.innerHTML = "";

  // Bahamas ring slightly smaller to avoid overlapping Cuba
  addHitCircleForCountry("bs", 45);

  // Trinidad and Tobago
  addHitCircleForCountry("tt", 40);
}

// --------------------- REGION LISTS + ZOOM ---------------------
function getActiveCountries(){
  if(mode === "all") return COUNTRIES;
  if(mode === "caribbean") return COUNTRIES.filter(c => c.region === "caribbean");
  if(mode === "central") return COUNTRIES.filter(c => c.region === "central");
  if(mode === "south") return COUNTRIES.filter(c => c.region === "south");
  return COUNTRIES;
}

function unionBBox(elements){
  let u = null;
  for(const el of elements){
    try{
      const b = el.getBBox();
      if(!u){
        u = { x:b.x, y:b.y, x2:b.x+b.width, y2:b.y+b.height };
      }else{
        u.x = Math.min(u.x, b.x);
        u.y = Math.min(u.y, b.y);
        u.x2 = Math.max(u.x2, b.x+b.width);
        u.y2 = Math.max(u.y2, b.y+b.height);
      }
    }catch(e){}
  }
  if(!u) return null;
  return { x:u.x, y:u.y, width:u.x2-u.x, height:u.y2-u.y };
}

function setViewBoxForRegion(){
  if(!svgEl) return;
  const list = getActiveCountries().map(c => c.id);
  const els = list.map(id => countryEls.get(id)).filter(Boolean);

  // If Caribbean: include rings so the view feels right
  if(mode === "caribbean" && hitTargetsGroup){
    // include circles for bbox
    Array.from(hitTargetsGroup.querySelectorAll("circle")).forEach(c => els.push(c));
  }

  const b = unionBBox(els);
  if(!b) return;

  // padding to keep edges visible
  const pad = Math.max(b.width, b.height) * 0.12;
  const x = b.x - pad;
  const y = b.y - pad;
  const w = b.width + pad*2;
  const h = b.height + pad*2;

  svgEl.setAttribute("viewBox", `${x} ${y} ${w} ${h}`);
}

function zoomNextFrame(){
  requestAnimationFrame(() => setViewBoxForRegion());
}

// --------------------- GAME FLOW ---------------------
function updateHUD(){
  const total = order.length || 0;
  progressEl.textContent = `${correct} / ${total}`;

  const attempts = correct + wrong;
  const pct = attempts > 0 ? Math.round((correct/attempts)*100) : 0;
  percentEl.textContent = `${pct}%`;
}

function tick(){
  if(!running) return;
  const elapsed = performance.now() - startTime;
  timerEl.textContent = formatTime(elapsed);
  raf = requestAnimationFrame(tick);
}

function setPrompt(text){
  promptEl.textContent = text || "—";
}

function nextPrompt(){
  if(idx >= order.length){
    finishGame();
    return;
  }
  const id = order[idx];
  const c = activeList.find(x => x.id === id);
  const name = c ? c.name : id.toUpperCase();
  setPrompt(name);
  subpromptEl.textContent = ""; // keep clean
  speak(name);
}

function startGameFresh(){
  ensureAudio();
  pickVoice();
  closeEndModal();

  activeList = getActiveCountries().filter(c => countryEls.has(c.id));

  // Build randomized order (only those present in SVG)
  order = shuffle(activeList.map(c => c.id));

  idx = 0;
  correct = 0;
  wrong = 0;

  resetClasses();
  setAllLocked(false);

  resultsEl.classList.add("muted");
  resultsEl.textContent = "Quiz running…";

  running = true;
  finished = false;

  startTime = performance.now();
  timerEl.textContent = "0.0s";

  updateHUD();
  nextPrompt();

  if(raf) cancelAnimationFrame(raf);
  tick();

  // button becomes START OVER while active
  setStartOver();
}

function startOverNow(){
  // hard reset + immediate start
  resetUIOnly();
  startGameFresh();
}

function resetUIOnly(){
  running = false;
  finished = false;
  if(raf) cancelAnimationFrame(raf);
  raf = null;

  try{ window.speechSynthesis?.cancel?.(); }catch(e){}

  idx = 0;
  correct = 0;
  wrong = 0;
  order = [];

  resetClasses();
  setAllLocked(false);

  timerEl.textContent = "0.0s";
  percentEl.textContent = "0%";
  progressEl.textContent = "0 / 0";
  setPrompt("—");
  subpromptEl.textContent = "";

  resultsEl.classList.add("muted");
  resultsEl.textContent = "Press Start to begin.";

  // back to START
  setStartIdle();
}

function finishGame(){
  running = false;
  finished = true;
  if(raf) cancelAnimationFrame(raf);

  // Final stats
  const elapsed = performance.now() - startTime;
  const attempts = correct + wrong;
  const pct = attempts > 0 ? Math.round((correct/attempts)*100) : 0;

  resultsEl.classList.remove("muted");
  resultsEl.textContent = `Score: ${correct} / ${order.length} (${pct}%)\nTime: ${formatTime(elapsed)}`;

  // modal
  finalPercentEl.textContent = `${pct}%`;
  finalTimeEl.textContent = formatTime(elapsed);

  const perfect = (pct === 100) && (correct === order.length);
  if(perfect){
    perfectBox.classList.remove("hidden");
    ensureAudio();
    jinglePerfect();
    startConfetti();
  }else{
    perfectBox.classList.add("hidden");
    stopConfetti();
  }

  openEndModal();

  // keep button as START OVER
  setStartOver();
}

// --------------------- CLICK HANDLING ---------------------
function flashWrong(el){
  el.classList.add("wrong");
  // longer red (kids notice)
  setTimeout(() => el.classList.remove("wrong"), 900);
}

function markCorrect(el){
  el.classList.add("correct");
}

function handleCountryClick(id){
  if(!running || finished) return;
  const target = order[idx];
  const el = countryEls.get(id);
  if(!el) return;

  if(id === target){
    correct++;
    markCorrect(el);
    idx++;
    updateHUD();
    nextPrompt();
  }else{
    wrong++;
    updateHUD();
    flashWrong(el);
    ensureAudio();
    beepWrong();
  }
}

// --------------------- MODAL ---------------------
function openEndModal(){
  if(!endModal) return;
  endModal.classList.remove("hidden");
}

function closeEndModal(){
  if(!endModal) return;
  endModal.classList.add("hidden");
}

// --------------------- CONFETTI ---------------------
function resizeConfetti(){
  if(!confettiCanvas) return;
  const dpr = window.devicePixelRatio || 1;
  const rect = confettiCanvas.getBoundingClientRect();
  confettiCanvas.width = Math.floor(rect.width * dpr);
  confettiCanvas.height = Math.floor(rect.height * dpr);
}

let confetti = [];
function startConfetti(){
  if(!confettiCanvas) return;
  resizeConfetti();
  confettiRunning = true;
  confetti = [];
  const w = confettiCanvas.width;
  const h = confettiCanvas.height;

  for(let i=0;i<160;i++){
    confetti.push({
      x: Math.random()*w,
      y: -Math.random()*h,
      vx: (Math.random()-0.5)*1.2,
      vy: 1.2 + Math.random()*2.2,
      r: 2 + Math.random()*4,
      a: Math.random()*Math.PI*2,
      va: (Math.random()-0.5)*0.25
    });
  }
  requestAnimationFrame(drawConfetti);
}

function stopConfetti(){
  confettiRunning = false;
}

function drawConfetti(){
  if(!confettiRunning || !confettiCanvas) return;
  const ctx = confettiCanvas.getContext("2d");
  if(!ctx) return;
  const w = confettiCanvas.width;
  const h = confettiCanvas.height;

  ctx.clearRect(0,0,w,h);

  // no custom colors per tool rules? (This is not a chart; it's canvas art.)
  // We'll use grayscale/white-ish for subtlety.
  ctx.fillStyle = "rgba(255,255,255,.85)";

  for(const p of confetti){
    p.x += p.vx;
    p.y += p.vy;
    p.a += p.va;

    if(p.y > h + 20){
      p.y = -20;
      p.x = Math.random()*w;
    }

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.a);
    ctx.fillRect(-p.r, -p.r/2, p.r*2, p.r);
    ctx.restore();
  }

  requestAnimationFrame(drawConfetti);
}

// --------------------- INIT ---------------------
function bindModeButtons(){
  if(!modebar) return;
  modebar.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-mode]");
    if(!btn) return;
    const m = btn.dataset.mode;
    if(!m) return;

    // Don't change modes mid-run — keep it simple and predictable.
    if(running){
      resultsEl.classList.remove("muted");
      resultsEl.textContent = "Finish or press START OVER to change modes.";
      return;
    }

    mode = m;
    Array.from(modebar.querySelectorAll(".modebtn")).forEach(b => b.classList.remove("active"));
    btn.classList.add("active");

    // zoom to region
    zoomNextFrame();

    // Rebuild rings (Bahamas/TT) so they remain visible/clickable in all modes
    buildClickHelperRings();

    updateHUD();
    setStatus(`Mode: ${MODE_LABEL[mode] || mode}`);
    hideStatusSoon();
  });
}

function bindButtons(){
  // START / START OVER (same button)
  startBtn.addEventListener("click", () => {
    ensureAudio(); // unlock for speech + beeps
    closeEndModal();

    if(running || finished){
      // immediate restart
      startOverNow();
      return;
    }
    // start new
    startGameFresh();
  });

  closeModalBtn?.addEventListener("click", () => {
    closeEndModal();
  });

  // click outside card to close
  endModal?.addEventListener("click", (e) => {
    if(e.target && e.target.classList && e.target.classList.contains("modal-backdrop")){
      closeEndModal();
    }
  });

  window.addEventListener("resize", () => {
    if(confettiRunning) resizeConfetti();
  });
}

function bindCountryClicks(){
  for(const [id, el] of countryEls.entries()){
    el.addEventListener("click", () => handleCountryClick(id));
  }
}

async function init(){
  setStartIdle();
  setStatus("Loading map…");

  const svgText = await fetchFirstAvailable();
  mapContainer.innerHTML = svgText;

  svgEl = mapContainer.querySelector("svg");
  if(!svgEl) throw new Error("SVG not found in file.");

  // helpful: make sure it scales nicely
  svgEl.setAttribute("preserveAspectRatio", "xMidYMid meet");

  injectOceanStyle(svgEl);
  collectCountries();
  buildClickHelperRings();
  bindCountryClicks();

  bindModeButtons();
  bindButtons();

  // initial zoom
  zoomNextFrame();

  // initial hud
  activeList = getActiveCountries().filter(c => countryEls.has(c.id));
  order = activeList.map(c => c.id);
  correct = 0; wrong = 0;
  updateHUD();

  setStatus("Map loaded.");
  hideStatusSoon();
}

init().catch(err => {
  console.error(err);
  setStatus("Error loading map. Check console + file name.");
  resultsEl.classList.remove("muted");
  resultsEl.textContent = "Could not load the SVG map. Make sure 'americas.svg' is in the repo root.";
});
