/* app.js
   - Loads SVG map
   - Region modes + auto-zoom (via viewBox)
   - Timed quiz, randomized order
   - Correct = green, wrong = red flash + sound
   - Speech says country name
   - End modal + confetti + perfect score
   - Start button toggles: START (idle) <-> START OVER (running)
   - Spacebar: idle=start, running=start-over (reset to idle, NOT auto-start)
   - Correct-country labels (HTML overlay that survives zoom)
*/

// -------------------- Data --------------------
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

  { id: "cu", name: "Cuba", region: "caribbean" },
  { id: "ht", name: "Haiti", region: "caribbean" },
  { id: "do", name: "Dominican Republic", region: "caribbean" },
  { id: "jm", name: "Jamaica", region: "caribbean" },
  { id: "bs", name: "Bahamas", region: "caribbean" },
  { id: "tt", name: "Trinidad and Tobago", region: "caribbean" },
  { id: "ag", name: "Antigua and Barbuda", region: "caribbean" },
  { id: "bb", name: "Barbados", region: "caribbean" },
  { id: "gd", name: "Grenada", region: "caribbean" },
  { id: "kn", name: "Saint Kitts and Nevis", region: "caribbean" },
  { id: "lc", name: "Saint Lucia", region: "caribbean" },
  { id: "vc", name: "Saint Vincent and the Grenadines", region: "caribbean" },
  { id: "dm", name: "Dominica", region: "caribbean" },

  { id: "co", name: "Colombia", region: "south" },
  { id: "ve", name: "Venezuela", region: "south" },
  { id: "gy", name: "Guyana", region: "south" },
  { id: "sr", name: "Suriname", region: "south" },
  { id: "ec", name: "Ecuador", region: "south" },
  { id: "pe", name: "Peru", region: "south" },
  { id: "br", name: "Brazil", region: "south" },
  { id: "bo", name: "Bolivia", region: "south" },
  { id: "py", name: "Paraguay", region: "south" },
  { id: "uy", name: "Uruguay", region: "south" },
  { id: "ar", name: "Argentina", region: "south" },
  { id: "cl", name: "Chile", region: "south" }
];

// hit rings (click helpers) — positions are read from SVG circles we inject
const HIT_RING_IDS = ["bs", "tt"];

// -------------------- DOM --------------------
const mapContainer = document.getElementById("mapContainer");
const mapStatus = document.getElementById("mapStatus");

const promptEl = document.getElementById("prompt");
const subpromptEl = document.getElementById("subprompt");

const startBtn = document.getElementById("startBtn");

const progressEl = document.getElementById("progress");
const timerEl = document.getElementById("timer");
const percentEl = document.getElementById("percent");
const resultsEl = document.getElementById("results");

const modebar = document.getElementById("modebar");

// modal
const endModal = document.getElementById("endModal");
const closeModalBtn = document.getElementById("closeModalBtn");
const finalPercentEl = document.getElementById("finalPercent");
const finalTimeEl = document.getElementById("finalTime");
const perfectBox = document.getElementById("perfectBox");
const confettiCanvas = document.getElementById("confettiCanvas");

// -------------------- State --------------------
let svgEl = null;
let svgRootViewBox = null; // original viewBox string
let countryEls = new Map(); // id -> SVG element
let hitRingEls = new Map(); // id -> SVG circle (hit target)
let labels = new Map();     // id -> HTML label div

let mode = "all"; // all | caribbean | central | south
let pool = [];    // countries for current mode
let order = [];
let index = 0;

let running = false;
let finished = false;

let correct = 0;
let wrong = 0;

let t0 = 0;
let timerHandle = null;

// label overlay layer
let labelLayer = null;

// -------------------- Utilities --------------------
function shuffle(arr){
  const a = arr.slice();
  for(let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}

function fmtTime(s){
  return `${s.toFixed(1)}s`;
}

function computePercent(){
  const answered = correct + wrong;
  if(answered === 0) return 0;
  return Math.round((correct / answered) * 100);
}

function setStatus(text){
  mapStatus.textContent = text;
}

function setPrompt(text){
  promptEl.textContent = text;
}

function setSubprompt(text){
  subpromptEl.textContent = text || "";
}

function updateHUD(){
  progressEl.textContent = `${index} / ${order.length}`;
  timerEl.textContent = fmtTime(getElapsed());
  percentEl.textContent = `${computePercent()}%`;
}

function getElapsed(){
  if(!running && t0 === 0) return 0;
  const now = performance.now();
  const elapsed = (now - t0) / 1000;
  return running ? elapsed : elapsed; // if paused, we just stop interval anyway
}

function setResults(text, muted=false){
  resultsEl.textContent = text;
  resultsEl.classList.toggle("muted", !!muted);
}

// -------------------- Audio (simple, no external files) --------------------
let audioCtx = null;
function beep(type="bad"){
  try{
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = "sine";
    o.frequency.value = type==="good" ? 660 : 220;
    g.gain.value = 0.0001;
    o.connect(g); g.connect(audioCtx.destination);
    o.start();
    const t = audioCtx.currentTime;
    g.gain.exponentialRampToValueAtTime(0.2, t+0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t+0.18);
    o.stop(t+0.2);
  }catch(e){}
}

// -------------------- Speech (less robotic) --------------------
function speak(text){
  if(!("speechSynthesis" in window)) return;
  try{
    window.speechSynthesis.cancel();

    const u = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();

    // try to pick a natural English voice on Chrome/macOS
    const preferred =
      voices.find(v => /Samantha/i.test(v.name)) ||
      voices.find(v => /Google US English/i.test(v.name)) ||
      voices.find(v => /Alex/i.test(v.name)) ||
      voices.find(v => /English/i.test(v.lang) && /en-US/i.test(v.lang)) ||
      voices.find(v => /English/i.test(v.lang)) ||
      null;

    if(preferred) u.voice = preferred;

    u.rate = 0.95;
    u.pitch = 1.05;
    u.volume = 1;

    window.speechSynthesis.speak(u);
  }catch(e){}
}

// -------------------- Labels (HTML overlay) --------------------
function ensureLabelLayer(){
  if(labelLayer) return;

  const mapArea = document.querySelector(".map-area");
  labelLayer = document.createElement("div");
  labelLayer.className = "label-layer";
  mapArea.appendChild(labelLayer);
}

function clearLabels(){
  if(!labelLayer) return;
  for(const div of labels.values()){
    div.remove();
  }
  labels.clear();
}

function addLabelFor(id, name){
  ensureLabelLayer();
  if(labels.has(id)) return;

  const div = document.createElement("div");
  div.className = "country-label";
  div.textContent = name;

  labelLayer.appendChild(div);
  labels.set(id, div);

  positionLabel(id);
}

function positionLabel(id){
  if(!svgEl || !labelLayer) return;
  const div = labels.get(id);
  if(!div) return;

  const mapArea = document.querySelector(".map-area");
  const areaRect = mapArea.getBoundingClientRect();

  // prefer hit-ring center (for tiny islands)
  const ring = hitRingEls.get(id);
  let rect = null;

  if(ring){
    rect = ring.getBoundingClientRect();
  }else{
    const el = countryEls.get(id);
    if(!el) return;
    rect = el.getBoundingClientRect();
  }

  const cx = rect.left + rect.width/2;
  const cy = rect.top + rect.height/2;

  const x = cx - areaRect.left;
  const y = cy - areaRect.top;

  div.style.left = `${x}px`;
  div.style.top = `${y}px`;
}

function repositionAllLabels(){
  for(const id of labels.keys()){
    positionLabel(id);
  }
}

// -------------------- SVG / Map --------------------
async function loadSVG(){
  setStatus("Loading map…");

  const candidates = ["americas.svg", "Americas.svg", "AMERICAS.SVG"];
  let svgText = null;

  for(const file of candidates){
    try{
      const res = await fetch(file, { cache: "no-store" });
      if(res.ok){
        svgText = await res.text();
        break;
      }
    }catch(e){}
  }

  if(!svgText){
    setStatus("Could not load americas.svg");
    return;
  }

  mapContainer.innerHTML = svgText;
  svgEl = mapContainer.querySelector("svg");
  if(!svgEl){
    setStatus("SVG missing <svg> root");
    return;
  }

  // store original viewBox
  svgRootViewBox = svgEl.getAttribute("viewBox") || null;

  // build country elements map:
  // We support either:
  //  - elements with id="us" etc
  //  - elements with data-id="us"
  //  - elements with class="country" and id matching
  countryEls.clear();
  for(const c of COUNTRIES){
    const el =
      svgEl.querySelector(`[data-id="${c.id}"]`) ||
      svgEl.querySelector(`#${CSS.escape(c.id)}`) ||
      null;

    if(el){
      el.classList.add("country");
      el.dataset.countryId = c.id;
      countryEls.set(c.id, el);
      el.addEventListener("click", () => onCountryClick(c.id));
    }
  }

  // ocean coloring (if SVG has .ocean etc)
  const oceanEls = svgEl.querySelectorAll(".ocean");
  oceanEls.forEach(o => o.style.fill = getComputedStyle(document.documentElement).getPropertyValue("--ocean").trim() || "#78a6da");

  // inject hit rings (Bahamas + Trinidad & Tobago) as clickable helpers
  injectHitRings();

  setStatus("Map loaded.");
  setTimeout(() => { setStatus("Map loaded."); }, 50);

  // layout: labels should update on resize
  window.addEventListener("resize", () => {
    applyZoom(mode);
    repositionAllLabels();
  });

  applyMode("all", true);
  updateHUD();
  setPrompt("—");
  setSubprompt("Press Start (or Space).");

  // In case voices aren’t loaded until user gesture; warm them up
  if("speechSynthesis" in window){
    window.speechSynthesis.getVoices();
  }
}

function injectHitRings(){
  hitRingEls.clear();

  // choose an overlay group near the end so rings sit above countries
  let overlay = svgEl.querySelector("#hit_overlay");
  if(!overlay){
    overlay = document.createElementNS("http://www.w3.org/2000/svg", "g");
    overlay.setAttribute("id", "hit_overlay");
    svgEl.appendChild(overlay);
  }else{
    overlay.innerHTML = "";
  }

  // You can tweak these if you want slightly smaller Bahamas ring
  // They’re in SVG coordinate space (same as the SVG viewBox)
  const ringDefs = [
    { id:"bs", cx: 690, cy: 365, r: 24 }, // Bahamas (slightly smaller so it doesn’t overlap Cuba as much)
    { id:"tt", cx: 770, cy: 495, r: 18 }  // Trinidad & Tobago
  ];

  for(const def of ringDefs){
    const circ = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circ.setAttribute("class", "hit-target");
    circ.setAttribute("cx", def.cx);
    circ.setAttribute("cy", def.cy);
    circ.setAttribute("r", def.r);
    circ.dataset.countryId = def.id;

    circ.addEventListener("click", (e) => {
      e.stopPropagation();
      onCountryClick(def.id);
    });

    overlay.appendChild(circ);
    hitRingEls.set(def.id, circ);
  }
}

// -------------------- Zoom --------------------
function applyZoom(which){
  if(!svgEl) return;

  // If your SVG already has a good viewBox, keep it as the all-mode.
  // These region boxes are intentionally conservative.
  // If you want tighter zoom, adjust numbers slightly.
  const vbAll = svgRootViewBox || "0 0 1000 600";

  const viewBoxes = {
    all: vbAll,

    // These assume a typical “Americas” SVG coordinate system.
    // If your SVG uses a different one, the zoom still won’t break gameplay,
    // it’ll just be less perfect — but it will still work.
    caribbean: "560 300 320 260",
    central:   "520 240 420 360",
    south:     "600 300 380 520"
  };

  const vb = viewBoxes[which] || vbAll;
  svgEl.setAttribute("viewBox", vb);
}

function applyMode(newMode, initial=false){
  mode = newMode;

  // update active button UI
  [...modebar.querySelectorAll(".modebtn")].forEach(btn => {
    btn.classList.toggle("active", btn.dataset.mode === newMode);
  });

  // build pool
  if(newMode === "all"){
    pool = COUNTRIES.slice();
  }else if(newMode === "caribbean"){
    pool = COUNTRIES.filter(c => c.region === "caribbean");
  }else if(newMode === "central"){
    pool = COUNTRIES.filter(c => c.region === "central");
  }else if(newMode === "south"){
    pool = COUNTRIES.filter(c => c.region === "south");
  }else{
    pool = COUNTRIES.slice();
  }

  // disable islands (visual only) when not in caribbean/all (optional)
  // (You can remove this if you don’t want them dimmed)
  const caribIds = new Set(COUNTRIES.filter(c => c.region==="caribbean").map(c => c.id));
  for(const [id, el] of countryEls.entries()){
    const shouldDim = (mode !== "all" && mode !== "caribbean" && caribIds.has(id));
    el.classList.toggle("disabled-island", shouldDim);
  }

  applyZoom(newMode);
  repositionAllLabels();

  if(initial){
    progressEl.textContent = `0 / ${pool.length}`;
  }else{
    // don’t auto-start when changing modes
    resetToIdle();
  }
}

// -------------------- Game Flow --------------------
function updateStartButton(){
  if(running){
    startBtn.textContent = "Start Over";
  }else{
    startBtn.textContent = "Start";
  }
}

function startGame(){
  closeEndModal();

  running = true;
  finished = false;

  correct = 0;
  wrong = 0;
  index = 0;

  clearLabels();
  clearCountryStyles();

  order = shuffle(pool);

  t0 = performance.now();
  updateHUD();
  updateStartButton();

  setResults("Quiz running…", true);

  nextPrompt();

  if(timerHandle) clearInterval(timerHandle);
  timerHandle = setInterval(() => {
    timerEl.textContent = fmtTime(getElapsed());
  }, 100);
}

function resetToIdle(){
  // stop timers
  running = false;
  finished = false;
  if(timerHandle){
    clearInterval(timerHandle);
    timerHandle = null;
  }

  // reset scoreboard
  correct = 0;
  wrong = 0;
  index = 0;
  t0 = 0;

  clearLabels();
  clearCountryStyles();

  updateHUD();
  updateStartButton();

  setPrompt("—");
  setSubprompt("Press Start (or Space).");
  setResults("Press Start to begin. (Spacebar works too.)", true);
}

function finishGame(){
  running = false;
  finished = true;

  if(timerHandle){
    clearInterval(timerHandle);
    timerHandle = null;
  }

  const time = getElapsed();
  const pct = computePercent();

  updateStartButton();
  setSubprompt("Nice work.");

  // modal
  finalPercentEl.textContent = `${pct}%`;
  finalTimeEl.textContent = fmtTime(time);

  if(pct === 100){
    perfectBox.classList.remove("hidden");
    playConfetti();
    // tiny “win” beep
    beep("good");
  }else{
    perfectBox.classList.add("hidden");
    clearConfetti();
  }

  endModal.classList.remove("hidden");
  setResults(`Score: ${correct} / ${order.length} (${pct}%) — Time: ${fmtTime(time)}`, false);

  // IMPORTANT: after finishing, we go back to START behavior (not auto-start)
  running = false;
  updateStartButton();
}

function nextPrompt(){
  if(index >= order.length){
    setPrompt("—");
    finishGame();
    return;
  }
  const current = order[index];
  setPrompt(current.name);
  setSubprompt("");
  speak(current.name);
  updateHUD();
}

// -------------------- Click Handling --------------------
function clearCountryStyles(){
  for(const el of countryEls.values()){
    el.classList.remove("correct","wrong","locked");
  }
}

function onCountryClick(id){
  if(!running) return;
  if(finished) return;

  const target = order[index];
  if(!target) return;

  if(id === target.id){
    correct++;
    index++;

    const el = countryEls.get(id);
    if(el){
      el.classList.add("correct");
      el.classList.add("locked");
    }

    // add label for correct
    addLabelFor(id, target.name);

    beep("good");
    updateHUD();
    nextPrompt();
  }else{
    wrong++;
    const el = countryEls.get(id);
    if(el){
      el.classList.add("wrong");
      setTimeout(() => el.classList.remove("wrong"), 280);
    }
    beep("bad");
    updateHUD();
  }
}

// -------------------- Modal / Confetti --------------------
function closeEndModal(){
  endModal.classList.add("hidden");
  clearConfetti();
}

closeModalBtn.addEventListener("click", closeEndModal);
endModal.addEventListener("click", (e) => {
  if(e.target && e.target.classList.contains("modal-backdrop")){
    closeEndModal();
  }
});

function playConfetti(){
  if(!confettiCanvas) return;

  const ctx = confettiCanvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const w = confettiCanvas.clientWidth;
  const h = confettiCanvas.clientHeight;
  confettiCanvas.width = Math.floor(w * dpr);
  confettiCanvas.height = Math.floor(h * dpr);
  ctx.scale(dpr, dpr);

  const pieces = Array.from({length: 120}).map(() => ({
    x: Math.random()*w,
    y: -20 - Math.random()*h,
    r: 2 + Math.random()*4,
    vy: 1.5 + Math.random()*3.5,
    vx: -1 + Math.random()*2,
    a: Math.random()*Math.PI*2
  }));

  let frames = 0;
  function tick(){
    frames++;
    ctx.clearRect(0,0,w,h);

    for(const p of pieces){
      p.x += p.vx;
      p.y += p.vy;
      p.a += 0.1;

      // no fixed colors requested — let canvas default stroke/fill vary:
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.a);
      ctx.fillRect(-p.r, -p.r, p.r*2, p.r*2);
      ctx.restore();

      if(p.y > h + 30){
        p.y = -20;
        p.x = Math.random()*w;
      }
    }

    if(frames < 180){
      requestAnimationFrame(tick);
    }
  }
  tick();
}

function clearConfetti(){
  if(!confettiCanvas) return;
  const ctx = confettiCanvas.getContext("2d");
  ctx.clearRect(0,0,confettiCanvas.width,confettiCanvas.height);
}

// -------------------- Events --------------------
startBtn.addEventListener("click", () => {
  if(!running){
    startGame();
  }else{
    // START OVER behavior: reset to idle (does NOT auto-start)
    resetToIdle();
  }
});

modebar.addEventListener("click", (e) => {
  const btn = e.target.closest(".modebtn");
  if(!btn) return;
  applyMode(btn.dataset.mode);
});

// Spacebar control
document.addEventListener("keydown", (e) => {
  // ignore if typing in an input/textarea (you don't have any, but safe)
  const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : "";
  if(tag === "input" || tag === "textarea") return;

  if(e.code === "Space"){
    e.preventDefault();
    if(!running){
      startGame();
    }else{
      resetToIdle();
    }
  }
});

// Keep labels aligned if user zooms device UI etc.
window.addEventListener("scroll", () => repositionAllLabels(), { passive:true });

// -------------------- Init --------------------
loadSVG();
