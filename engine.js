const canvas = document.getElementById('main-game-display');
const dispCtx = canvas.getContext('2d');
dispCtx.imageSmoothingEnabled = false;
const W = canvas.width, H = canvas.height;

// Render at 1/4 resolution then blit up for chunky pixel look
const PSCALE = 4;
const off = document.createElement('canvas');
off.width  = Math.ceil(W / PSCALE);
off.height = Math.ceil(H / PSCALE);
const ctx = off.getContext('2d');
ctx.imageSmoothingEnabled = false;
ctx.scale(1 / PSCALE, 1 / PSCALE);

// ── Levels ───────────────────────────────────────────────────────────────────
const LEVELS = [LEVEL1, LEVEL2, LEVEL3, LEVEL4];
let currentLevelIdx = 0;
let currentLevel    = LEVELS[0];

// ── Save / Load ──────────────────────────────────────────────────────────────
const SAVE_KEY = 'prehistoricPeril_save';
function saveGame()  {
  const next = Math.min(currentLevelIdx + 2, LEVELS.length);
  localStorage.setItem(SAVE_KEY, JSON.stringify({ level: next }));
}
function hasSave()   { return !!localStorage.getItem(SAVE_KEY); }

// ── Title screen ─────────────────────────────────────────────────────────────
let titleScreen = true;
let hoveredBtn  = null;   // 'new' | 'load'
const btnNew  = { x: W / 2 - 160, y: H / 2 + 10,  w: 320, h: 72 };
const btnLoad = { x: W / 2 - 160, y: H / 2 + 110, w: 320, h: 72 };

function ptInBtn(mx, my, btn) {
  return mx >= btn.x && mx <= btn.x + btn.w && my >= btn.y && my <= btn.y + btn.h;
}
canvas.addEventListener('mousemove', e => {
  if (!titleScreen) return;
  const r  = canvas.getBoundingClientRect();
  const mx = (e.clientX - r.left) * (W / r.width);
  const my = (e.clientY - r.top)  * (H / r.height);
  hoveredBtn = ptInBtn(mx, my, btnNew) ? 'new'
             : ptInBtn(mx, my, btnLoad) ? 'load' : null;
});
canvas.addEventListener('click', e => {
  startMusic();
  if (cutscene) { cutscene = false; resetGame(); return; }
  if (!titleScreen) return;
  const r  = canvas.getBoundingClientRect();
  const mx = (e.clientX - r.left) * (W / r.width);
  const my = (e.clientY - r.top)  * (H / r.height);
  if (ptInBtn(mx, my, btnNew)) {
    currentLevelIdx = 0;
    currentLevel    = LEVELS[0];
    playerMaxHp = 5;
    titleScreen = false;
    cutscene = true;
    cutsceneTime = 0;
    stopMusic();
    startCutsceneMusic();
  } else if (ptInBtn(mx, my, btnLoad) && hasSave()) {
    const save = JSON.parse(localStorage.getItem(SAVE_KEY) || '{"level":1}');
    currentLevelIdx = Math.min((save.level || 1) - 1, LEVELS.length - 1);
    currentLevel = LEVELS[currentLevelIdx];
    titleScreen = false;
    resetGame();
  }
});

// Start music on the first pointer press anywhere on the page
document.addEventListener('pointerdown', startMusic, { once: true });

// ── Input ───────────────────────────────────────────────────────────────────
const keys = {};
let paused = false;
document.addEventListener('keydown', e => {
  startMusic();
  if (cutscene) { cutscene = false; resetGame(); return; }
  if (e.code === 'Space') {
    if (!titleScreen) {
      paused = !paused;
      if (audioCtx) { paused ? audioCtx.suspend() : audioCtx.resume(); }
    }
    e.preventDefault(); return;
  }
  keys[e.code] = true;
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))
    e.preventDefault();
});
document.addEventListener('keyup', e => { keys[e.code] = false; });

// ── Constants ────────────────────────────────────────────────────────────────
const GRAVITY   = 1.1;
const WALK_SPD  = 4.0;
const JUMP_VEL  = -18;
const SWING_DUR = 16;
const SWING_HIT_START = 3;
const SWING_HIT_END   = 12;

// ── Audio ─────────────────────────────────────────────────────────────────────
let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended' && !paused) audioCtx.resume();
  return audioCtx;
}

function playWhack() {
  const ac = getAudioCtx();
  const now = ac.currentTime;

  // Crack: bandpass-filtered noise burst
  const bufLen = Math.floor(ac.sampleRate * 0.12);
  const buf = ac.createBuffer(1, bufLen, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufLen * 0.25));
  const noise = ac.createBufferSource();
  noise.buffer = buf;
  const filter = ac.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 900;
  filter.Q.value = 1.2;
  const noiseGain = ac.createGain();
  noiseGain.gain.setValueAtTime(0.55, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
  noise.connect(filter); filter.connect(noiseGain); noiseGain.connect(ac.destination);
  noise.start(now);

  // Thud: descending sine for the impact body
  const osc = ac.createOscillator();
  osc.frequency.setValueAtTime(200, now);
  osc.frequency.exponentialRampToValueAtTime(55, now + 0.1);
  const oscGain = ac.createGain();
  oscGain.gain.setValueAtTime(0.5, now);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
  osc.connect(oscGain); oscGain.connect(ac.destination);
  osc.start(now); osc.stop(now + 0.1);
}

// ── Music ─────────────────────────────────────────────────────────────────────
const MUSIC_BPM  = 110;
const MUSIC_STEP = (60 / MUSIC_BPM) / 4; // 16th-note duration in seconds

// A minor pentatonic, two octaves
const PENTA = [110, 130.81, 146.83, 164.81, 196, 220, 261.63, 293.66, 329.63, 392, 440];
//              A2    C3      D3      E3     G3   A3    C4      D4      E4     G4   A4

// 16-step drum patterns (1 = hit, 0 = rest)
const PAT_KICK = [1,0,0,0, 1,0,0,1, 1,0,0,0, 1,0,0,0];
const PAT_WOOD = [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0];
const PAT_HHAT = [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0];

// 32-step melody and bass (PENTA index, -1 = rest)
const PAT_MELODY = [
  5,-1,6,-1, 7,-1,6,-1, 5,-1,-1,-1, 4,-1,5,-1,
  5,-1,-1,-1, 3,-1,4,-1, 5,-1,-1,-1, -1,-1,-1,-1,
];
const PAT_BASS = [
  0,-1,-1,-1, -1,-1,-1,-1, 0,-1,-1,-1, -1,-1,-1,-1,
  0,-1,-1,-1, -1,-1,-1,-1, 4,-1,-1,-1, 0,-1,-1,-1,
];

let musicGain = null, musicScheduler = null, musicBeat = 0, nextNoteTime = 0;

function getMusicGain() {
  if (!musicGain) {
    const ac = getAudioCtx();
    musicGain = ac.createGain();
    musicGain.gain.value = 0.32;
    musicGain.connect(ac.destination);
  }
  return musicGain;
}

function mKick(ac, when) {
  const o = ac.createOscillator();
  o.frequency.setValueAtTime(160, when);
  o.frequency.exponentialRampToValueAtTime(38, when + 0.18);
  const g = ac.createGain();
  g.gain.setValueAtTime(1.0, when); g.gain.exponentialRampToValueAtTime(0.001, when + 0.2);
  o.connect(g); g.connect(getMusicGain()); o.start(when); o.stop(when + 0.2);
}

function mWood(ac, when) {
  const o = ac.createOscillator();
  o.frequency.setValueAtTime(700, when);
  o.frequency.exponentialRampToValueAtTime(350, when + 0.04);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.6, when); g.gain.exponentialRampToValueAtTime(0.001, when + 0.06);
  o.connect(g); g.connect(getMusicGain()); o.start(when); o.stop(when + 0.06);
}

function mHihat(ac, when) {
  const bufLen = Math.floor(ac.sampleRate * 0.025);
  const buf = ac.createBuffer(1, bufLen, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) d[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const f = ac.createBiquadFilter();
  f.type = 'highpass'; f.frequency.value = 9000;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.15, when); g.gain.exponentialRampToValueAtTime(0.001, when + 0.025);
  src.connect(f); f.connect(g); g.connect(getMusicGain()); src.start(when);
}

function mNote(ac, freq, when) {
  const o = ac.createOscillator();
  o.type = 'triangle'; o.frequency.value = freq;
  const dur = MUSIC_STEP * 1.8;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0, when);
  g.gain.linearRampToValueAtTime(0.35, when + 0.01);
  g.gain.setValueAtTime(0.3, when + dur * 0.65);
  g.gain.exponentialRampToValueAtTime(0.001, when + dur);
  o.connect(g); g.connect(getMusicGain()); o.start(when); o.stop(when + dur);
}

function mBass(ac, freq, when) {
  const o = ac.createOscillator();
  o.type = 'sawtooth'; o.frequency.value = freq;
  const f = ac.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = 280;
  const dur = MUSIC_STEP * 3.5;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.55, when); g.gain.exponentialRampToValueAtTime(0.001, when + dur);
  o.connect(f); f.connect(g); g.connect(getMusicGain()); o.start(when); o.stop(when + dur);
}

function scheduleMusicStep() {
  const ac = getAudioCtx();
  if (nextNoteTime < ac.currentTime) nextNoteTime = ac.currentTime + 0.05;
  while (nextNoteTime < ac.currentTime + 0.15) {
    const s16 = musicBeat % 16;
    const s32 = musicBeat % 32;
    const t   = nextNoteTime;
    if (PAT_KICK[s16])        mKick(ac, t);
    if (PAT_WOOD[s16])        mWood(ac, t);
    if (PAT_HHAT[s16])        mHihat(ac, t);
    if (PAT_MELODY[s32] >= 0) mNote(ac, PENTA[PAT_MELODY[s32]], t);
    if (PAT_BASS[s32]   >= 0) mBass(ac, PENTA[PAT_BASS[s32]], t);
    nextNoteTime += MUSIC_STEP;
    musicBeat++;
  }
}

function startMusic() {
  if (musicScheduler || bossMusicScheduler) return;
  const ac = getAudioCtx();
  getMusicGain(); // create gain node eagerly so gain can be set immediately
  nextNoteTime = ac.currentTime + 0.05;
  musicScheduler = setInterval(scheduleMusicStep, 50);
}

function stopMusic() {
  clearInterval(musicScheduler);
  musicScheduler = null;
}

// ── Cutscene music ────────────────────────────────────────────────────────────
let cutsceneNodes = [];

function csNode(...nodes) { cutsceneNodes.push(...nodes); }

function csDrone(ac, dest, t0, at, freq, dur, vol = 0.28) {
  const o = ac.createOscillator();
  o.type = 'sawtooth'; o.frequency.value = freq;
  const vib = ac.createOscillator(); vib.frequency.value = 4.2;
  const vibG = ac.createGain(); vibG.gain.value = freq * 0.007;
  vib.connect(vibG); vibG.connect(o.frequency);
  const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
  const g = ac.createGain();
  g.gain.setValueAtTime(0, t0 + at);
  g.gain.linearRampToValueAtTime(vol, t0 + at + 0.18);
  g.gain.setValueAtTime(vol * 0.85, t0 + at + dur - 0.35);
  g.gain.linearRampToValueAtTime(0, t0 + at + dur);
  o.connect(f); f.connect(g); g.connect(dest);
  vib.start(t0 + at); o.start(t0 + at); vib.stop(t0 + at + dur); o.stop(t0 + at + dur);
  csNode(o, vib, g);
}

function csTimp(ac, dest, t0, at, freq, vol = 0.7) {
  const o = ac.createOscillator();
  o.frequency.setValueAtTime(freq, t0 + at);
  o.frequency.exponentialRampToValueAtTime(freq * 0.32, t0 + at + 0.45);
  const g = ac.createGain();
  g.gain.setValueAtTime(vol, t0 + at);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + at + 0.55);
  o.connect(g); g.connect(dest);
  o.start(t0 + at); o.stop(t0 + at + 0.6);
  csNode(o, g);
}

function csStab(ac, dest, t0, at, freq, vol = 0.5) {
  const o = ac.createOscillator();
  o.type = 'sawtooth'; o.frequency.value = freq;
  const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1400;
  const g = ac.createGain();
  g.gain.setValueAtTime(vol, t0 + at);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + at + 0.22);
  o.connect(f); f.connect(g); g.connect(dest);
  o.start(t0 + at); o.stop(t0 + at + 0.25);
  csNode(o, g);
}

function csCrash(ac, dest, t0, at, vol = 0.9) {
  const bufLen = Math.floor(ac.sampleRate * 1.4);
  const buf = ac.createBuffer(1, bufLen, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) d[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource(); src.buffer = buf;
  const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2800; f.Q.value = 0.5;
  const g = ac.createGain();
  g.gain.setValueAtTime(vol, t0 + at);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + at + 1.4);
  src.connect(f); f.connect(g); g.connect(dest);
  src.start(t0 + at);
  csNode(src, g);
}

function startCutsceneMusic() {
  stopCutsceneMusic();
  const ac = getAudioCtx();
  const t0 = ac.currentTime + 0.05;

  const dest = ac.createGain(); dest.gain.value = 0.55; dest.connect(ac.destination);
  csNode(dest);

  // ── ACT 1: Ominous foreboding (0–3 s) ────────────────────────────────────
  csDrone(ac, dest, t0, 0.00,  55.0, 3.6, 0.38); // A1 drone
  csDrone(ac, dest, t0, 0.30,  82.4, 3.2, 0.18); // E2 fifth overtone
  csTimp (ac, dest, t0, 0.00,  80,   0.65);       // opening thud
  csTimp (ac, dest, t0, 1.00,  75,   0.55);
  csTimp (ac, dest, t0, 2.00,  75,   0.55);
  csTimp (ac, dest, t0, 2.50,  65,   0.55);
  csTimp (ac, dest, t0, 2.75,  65,   0.65);       // pre-attack pulse

  // ── ACT 2: T-Rex attacks! (3–6 s) ────────────────────────────────────────
  csCrash(ac, dest, t0, 3.00, 1.05);              // T-Rex entrance CRASH
  csDrone(ac, dest, t0, 3.00,  55.0, 3.1, 0.42);
  csTimp (ac, dest, t0, 3.00,  95,   0.95);       // attack downbeat
  csStab (ac, dest, t0, 3.18, 220,   0.62);
  csStab (ac, dest, t0, 3.38, 247,   0.55);
  csStab (ac, dest, t0, 3.58, 262,   0.55);
  csTimp (ac, dest, t0, 3.72,  88,   0.75);
  csStab (ac, dest, t0, 3.88, 220,   0.58);
  csStab (ac, dest, t0, 4.08, 196,   0.52);
  csStab (ac, dest, t0, 4.28, 175,   0.52);       // descending = dread
  csTimp (ac, dest, t0, 4.45,  82,   0.82);
  csTimp (ac, dest, t0, 4.65,  82,   0.85);
  csTimp (ac, dest, t0, 4.82,  82,   0.92);       // rapid build to chomp
  // chomp lands at ~5.16 s (3 s + 3 s × 0.72)
  csCrash(ac, dest, t0, 5.12, 1.30);              // CHOMP impact
  csTimp (ac, dest, t0, 5.12,  42,   1.00);       // sub bass hit

  // ── ACT 3: VENGEANCE! (6–8.7 s) ──────────────────────────────────────────
  csDrone(ac, dest, t0, 6.00,  55.0, 2.9, 0.48);
  csDrone(ac, dest, t0, 6.00, 110.0, 2.9, 0.32); // octave power
  csTimp (ac, dest, t0, 6.00, 105,   1.00);       // rage opener
  csStab (ac, dest, t0, 6.22, 220,   0.68);
  csStab (ac, dest, t0, 6.42, 220,   0.68);
  csStab (ac, dest, t0, 6.58, 262,   0.72);
  csTimp (ac, dest, t0, 6.72,  95,   0.85);
  csStab (ac, dest, t0, 6.88, 330,   0.72);
  csStab (ac, dest, t0, 7.08, 392,   0.78);
  csTimp (ac, dest, t0, 7.12, 105,   0.90);
  csStab (ac, dest, t0, 7.28, 440,   0.85);       // climax!
  csTimp (ac, dest, t0, 7.50, 105,   0.82);
}

function stopCutsceneMusic() {
  for (const n of cutsceneNodes) {
    try { n.stop?.(); n.disconnect(); } catch (_) {}
  }
  cutsceneNodes = [];
}

// ── Victory music ─────────────────────────────────────────────────────────────
let victoryNodes = [];

function vmNote(ac, dest, t0, at, freq, dur, vol = 0.5) {
  const o = ac.createOscillator();
  o.type = 'triangle'; o.frequency.value = freq;
  const g = ac.createGain();
  g.gain.setValueAtTime(0, t0 + at);
  g.gain.linearRampToValueAtTime(vol, t0 + at + 0.02);
  g.gain.setValueAtTime(vol * 0.82, t0 + at + dur * 0.7);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + at + dur);
  o.connect(g); g.connect(dest);
  o.start(t0 + at); o.stop(t0 + at + dur + 0.05);
  victoryNodes.push(o, g);
}

function vmKick(ac, dest, t0, at, vol = 0.85) {
  const o = ac.createOscillator();
  o.frequency.setValueAtTime(180, t0 + at);
  o.frequency.exponentialRampToValueAtTime(45, t0 + at + 0.18);
  const g = ac.createGain();
  g.gain.setValueAtTime(vol, t0 + at); g.gain.exponentialRampToValueAtTime(0.001, t0 + at + 0.2);
  o.connect(g); g.connect(dest); o.start(t0 + at); o.stop(t0 + at + 0.22);
  victoryNodes.push(o, g);
}

function vmWood(ac, dest, t0, at, vol = 0.55) {
  const o = ac.createOscillator();
  o.frequency.setValueAtTime(900, t0 + at);
  o.frequency.exponentialRampToValueAtTime(420, t0 + at + 0.05);
  const g = ac.createGain();
  g.gain.setValueAtTime(vol, t0 + at); g.gain.exponentialRampToValueAtTime(0.001, t0 + at + 0.07);
  o.connect(g); g.connect(dest); o.start(t0 + at); o.stop(t0 + at + 0.08);
  victoryNodes.push(o, g);
}

function startVictoryMusic() {
  stopVictoryMusic();
  const ac = getAudioCtx();
  const t0 = ac.currentTime + 0.08;

  const dest = ac.createGain(); dest.gain.value = 0.52; dest.connect(ac.destination);
  victoryNodes.push(dest);

  // Ascending fanfare run: G4 A4 C5 E5 → G5 hold
  vmNote(ac, dest, t0, 0.00, 392,  0.13, 0.55);   // G4
  vmNote(ac, dest, t0, 0.14, 440,  0.13, 0.55);   // A4
  vmNote(ac, dest, t0, 0.28, 523,  0.13, 0.60);   // C5
  vmNote(ac, dest, t0, 0.42, 659,  0.18, 0.65);   // E5
  vmNote(ac, dest, t0, 0.61, 784,  0.55, 0.72);   // G5 — hold!

  // Second phrase: quick C5 E5 G5 → big C6 finale
  vmNote(ac, dest, t0, 1.25, 523,  0.11, 0.55);   // C5
  vmNote(ac, dest, t0, 1.38, 659,  0.11, 0.58);   // E5
  vmNote(ac, dest, t0, 1.51, 784,  0.11, 0.62);   // G5
  vmNote(ac, dest, t0, 1.65, 1047, 1.10, 0.70);   // C6 — finale!

  // Harmony (octave below)
  vmNote(ac, dest, t0, 0.00, 196,  0.13, 0.22);
  vmNote(ac, dest, t0, 0.14, 220,  0.13, 0.22);
  vmNote(ac, dest, t0, 0.28, 262,  0.13, 0.24);
  vmNote(ac, dest, t0, 0.42, 330,  0.18, 0.26);
  vmNote(ac, dest, t0, 0.61, 392,  0.55, 0.28);
  vmNote(ac, dest, t0, 1.65, 523,  1.10, 0.28);

  // Percussion
  vmKick(ac, dest, t0, 0.00); vmWood(ac, dest, t0, 0.00);
  vmWood(ac, dest, t0, 0.22); vmWood(ac, dest, t0, 0.44);
  vmKick(ac, dest, t0, 0.61); vmWood(ac, dest, t0, 0.61);
  vmWood(ac, dest, t0, 0.83); vmWood(ac, dest, t0, 1.05);
  vmKick(ac, dest, t0, 1.25); vmWood(ac, dest, t0, 1.25);
  vmWood(ac, dest, t0, 1.38); vmWood(ac, dest, t0, 1.51);
  vmKick(ac, dest, t0, 1.65); vmWood(ac, dest, t0, 1.65);
  vmWood(ac, dest, t0, 1.88); vmWood(ac, dest, t0, 2.10);
}

function stopVictoryMusic() {
  for (const n of victoryNodes) {
    try { n.stop?.(); n.disconnect(); } catch (_) {}
  }
  victoryNodes = [];
}

// ── Boss fight music ──────────────────────────────────────────────────────────
const BOSS_BPM  = 148;
const BOSS_STEP = (60 / BOSS_BPM) / 4;

const BOSS_SCALE = [82.41, 98, 110, 123.47, 146.83, 164.81, 196, 220, 246.94, 293.66, 329.63];

const BOSS_PAT_KICK  = [1,0,0,0, 0,0,0,1, 1,0,0,0, 0,0,0,0];
const BOSS_PAT_SNARE = [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0];
const BOSS_PAT_HHAT  = [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0];
const BOSS_PAT_MELODY = [
  5,-1,4,-1, 3,-1,5,-1, 4,-1,3,-1, 2,-1,-1,-1,
  5,-1,6,-1, 7,-1,5,-1, 4,-1,3,-1, -1,-1,2,-1,
];
const BOSS_PAT_BASS = [
  0,-1,-1,-1, -1,-1,-1,-1, 2,-1,-1,-1, -1,-1,-1,-1,
  0,-1,-1,-1, -1,-1,-1,-1, 3,-1,-1,-1, 0,-1,-1,-1,
];

let bossMusicScheduler = null, bossMusicBeat = 0, bossNextNoteTime = 0;

function bmKick(ac, when) {
  const o = ac.createOscillator();
  o.frequency.setValueAtTime(200, when);
  o.frequency.exponentialRampToValueAtTime(35, when + 0.22);
  const g = ac.createGain();
  g.gain.setValueAtTime(1.2, when); g.gain.exponentialRampToValueAtTime(0.001, when + 0.25);
  o.connect(g); g.connect(getMusicGain()); o.start(when); o.stop(when + 0.25);
}

function bmSnare(ac, when) {
  const bufLen = Math.floor(ac.sampleRate * 0.12);
  const buf = ac.createBuffer(1, bufLen, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ac.sampleRate * 0.04));
  const src = ac.createBufferSource();
  src.buffer = buf;
  const f = ac.createBiquadFilter();
  f.type = 'bandpass'; f.frequency.value = 2200;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.75, when); g.gain.exponentialRampToValueAtTime(0.001, when + 0.12);
  src.connect(f); f.connect(g); g.connect(getMusicGain()); src.start(when);
}

function bmNote(ac, freq, when) {
  const o = ac.createOscillator();
  o.type = 'sawtooth'; o.frequency.value = freq;
  const dur = BOSS_STEP * 1.6;
  const f = ac.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = 800;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0, when);
  g.gain.linearRampToValueAtTime(0.28, when + 0.01);
  g.gain.setValueAtTime(0.22, when + dur * 0.65);
  g.gain.exponentialRampToValueAtTime(0.001, when + dur);
  o.connect(f); f.connect(g); g.connect(getMusicGain()); o.start(when); o.stop(when + dur);
}

function bmBass(ac, freq, when) {
  const o = ac.createOscillator();
  o.type = 'sawtooth'; o.frequency.value = freq;
  const f = ac.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = 160;
  const dur = BOSS_STEP * 3;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.7, when); g.gain.exponentialRampToValueAtTime(0.001, when + dur);
  o.connect(f); f.connect(g); g.connect(getMusicGain()); o.start(when); o.stop(when + dur);
}

function scheduleBossMusicStep() {
  const ac = getAudioCtx();
  if (bossNextNoteTime < ac.currentTime) bossNextNoteTime = ac.currentTime + 0.05;
  while (bossNextNoteTime < ac.currentTime + 0.15) {
    const s16 = bossMusicBeat % 16;
    const s32 = bossMusicBeat % 32;
    const t   = bossNextNoteTime;
    if (BOSS_PAT_KICK[s16])        bmKick(ac, t);
    if (BOSS_PAT_SNARE[s16])       bmSnare(ac, t);
    if (BOSS_PAT_HHAT[s16])        mHihat(ac, t);
    if (BOSS_PAT_MELODY[s32] >= 0) bmNote(ac, BOSS_SCALE[BOSS_PAT_MELODY[s32]], t);
    if (BOSS_PAT_BASS[s32]   >= 0) bmBass(ac, BOSS_SCALE[BOSS_PAT_BASS[s32]], t);
    bossNextNoteTime += BOSS_STEP;
    bossMusicBeat++;
  }
}

function startBossMusic() {
  stopMusic();
  if (bossMusicScheduler) return;
  const ac = getAudioCtx();
  getMusicGain();
  bossNextNoteTime = ac.currentTime + 0.05;
  bossMusicBeat = 0;
  bossMusicScheduler = setInterval(scheduleBossMusicStep, 50);
}

function stopBossMusic() {
  clearInterval(bossMusicScheduler);
  bossMusicScheduler = null;
}

// ── Particles ────────────────────────────────────────────────────────────────
let particles = [];
function bloodBurst(x, y, count = 30) {
  const colors = ['#CC0000','#880000','#FF2020','#AA1010','#FF6060','#660000'];
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 12 + 3;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 3,
      r: Math.random() * 6 + 3,
      color: colors[Math.floor(Math.random() * colors.length)],
      life: 40 + Math.random() * 30,
      maxLife: 70,
    });
  }
}

function burst(x, y, colors, count = 10) {
  for (let i = 0; i < count; i++) {
    const c = colors[Math.floor(Math.random() * colors.length)];
    particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 7,
      vy: Math.random() * -5 - 1,
      r: Math.random() * 4 + 2,
      color: c,
      life: 30 + Math.random() * 20,
      maxLife: 50,
    });
  }
}

// ── Player ───────────────────────────────────────────────────────────────────
let debugInvincible = false;
let playerMaxHp = 5;

function resetPlayer() {
  return {
    x: 80, y: 380,
    w: 38, h: 58,
    vx: 0, vy: 0,
    onGround: false,
    facing: 1,
    swinging: false,
    swingFrame: 0,
    hp: playerMaxHp,
    maxHp: playerMaxHp,
    invincible: debugInvincible ? Infinity : 0,
    score: 0,
    walkCycle: 0,
  };
}
let player = resetPlayer();

// ── Camera ───────────────────────────────────────────────────────────────────
let camX = 0;

// ── AABB helpers ─────────────────────────────────────────────────────────────
function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x
      && a.y < b.y + b.h && a.y + a.h > b.y;
}
function landedOn(entity, plat, dt = 1) {
  const bottom = entity.y + entity.h;
  const step   = entity.vy * dt;           // distance moved down this tick
  return entity.vy >= 0
      && entity.x + entity.w > plat.x
      && entity.x < plat.x + plat.w
      && bottom >= plat.y - 2              // at or just above platform top
      && bottom <= plat.y + step + 2;     // no further than one tick past
}

// ── Bat hitbox ───────────────────────────────────────────────────────────────
function batHitbox() {
  const reach = 54, h = 18;
  if (player.facing === 1)
    return { x: player.x + player.w, y: player.y + 14, w: reach, h };
  else
    return { x: player.x - reach,    y: player.y + 14, w: reach, h };
}

// ── Game state ───────────────────────────────────────────────────────────────
let gameOver = false;
let won      = false;
let wonTimer = 0;
let enemies  = currentLevel.createEnemies();

// ── Cutscene state ───────────────────────────────────────────────────────────
let cutscene     = false;
let cutsceneTime = 0;
const CS_ACT1 = 180;  // wife scene
const CS_ACT2 = 360;  // attack scene
const CS_ACT3 = 520;  // vengeance scene → fade to game

// ── Boss state ────────────────────────────────────────────────────────────────
let boss            = null;
let bossProjectiles = [];
let bossTriggered   = false;
let bossHeart       = null;

let volcanoRock   = null;
let volcanoLavaX  = 99999;
let volcanoActive = false;

function initBoss() {
  return {
    hp: 10, maxHp: 10, state: 'idle', stateTimer: 0, attackIdx: 0,
    hitFlash: 0, hitCooldown: 0,
    dead: false, sinkY: 0,
    tongueLen: 0, tongueMaxLen: 380,
  };
}

function resetGame() {
  playerMaxHp = 5;
  player = resetPlayer();
  camX = 0;
  particles = [];
  gameOver = false;
  won = false;
  wonTimer = 0;
  enemies = currentLevel.createEnemies();
  boss = null; bossProjectiles = []; bossTriggered = false; bossHeart = null;
  volcanoRock = null; volcanoLavaX = 99999; volcanoActive = false;
  if (currentLevelIdx === 3) {
    volcanoRock = { x: 5090, y: 370, w: 90, h: 90, hp: 3, maxHp: 3, hitFlash: 0, hitCooldown: 0 };
  }
  stopCutsceneMusic();
  stopVictoryMusic();
  stopBossMusic();
  if (currentLevelIdx === 2) startBossMusic(); else startMusic();
}

// ── Update ───────────────────────────────────────────────────────────────────
function update(dt = 1) {
  if (paused) return;
  if (gameOver || won) {
    if (won) {
      wonTimer += dt;
      const isLastLevel = currentLevelIdx >= LEVELS.length - 1;
      const advance = keys['KeyR'] || wonTimer > 240 || isLastLevel || currentLevelIdx === 1;
      if (advance && !isLastLevel) {
        currentLevelIdx++;
        currentLevel = LEVELS[currentLevelIdx];
        resetGame();
        return;
      }
      if (advance) {
        titleScreen = true;
        stopVictoryMusic();
        startMusic();
        return;
      }
    }
    if (keys['KeyR']) resetGame();
    return;
  }

  // Horizontal
  if (keys['ArrowLeft'])  { player.vx = -WALK_SPD; player.facing = -1; }
  else if (keys['ArrowRight']) { player.vx =  WALK_SPD; player.facing =  1; }
  else player.vx *= Math.pow(0.65, dt);

  if (Math.abs(player.vx) > 0.2 && player.onGround)
    player.walkCycle += 0.25 * dt;

  // Jump
  if (keys['ArrowUp'] && player.onGround) {
    player.vy = JUMP_VEL;
    player.onGround = false;
    burst(player.x + player.w / 2, player.y + player.h, ['#C8A050','#8B6914'], 5);
  }

  // Swing
  if (keys['ArrowDown'] && !player.swinging) {
    player.swinging = true;
    player.swingFrame = 0;
    playWhack();
  }
  if (player.swinging) {
    player.swingFrame += dt;
    if (player.swingFrame >= SWING_DUR) player.swinging = false;

    // Hitbox active window
    if (player.swingFrame >= SWING_HIT_START && player.swingFrame <= SWING_HIT_END) {
      const bat = batHitbox();
      for (const e of enemies) {
        if (!e.alive || e.hitFlash > 10) continue;
        if (overlaps(bat, e)) {
          e.hp--;
          e.hitFlash = 20;
          burst(e.x + e.w / 2, e.y + e.h / 2, ['#FF5500','#FFD700','#FF8800'], 8);
          if (e.hp <= 0) {
            e.alive = false;
            burst(e.x + e.w / 2, e.y, ['#FFD700','#FFE86A','#FF8800'], 14);
          }
        }
      }
      // Boss hit — player must be on the tongue and swing at the mouth
      if (currentLevelIdx === 2 && boss && !boss.dead && boss.hitCooldown <= 0 &&
          boss.tongueLen > boss.tongueMaxLen * 0.65) {
        const tongueY = 428;
        const onTongue = Math.abs((player.y + player.h) - tongueY) < 16 &&
                         player.x > (700 - boss.tongueLen - 20) && player.x < 701;
        if (onTongue && overlaps(bat, { x: 635, y: 395, w: 80, h: 70 })) {
          boss.hp--;
          boss.hitFlash = 20;
          boss.hitCooldown = 35;
          burst(700, 420, ['#FFD700','#FF8800','#FF4444'], 14);
          if (boss.hp <= 0) {
            boss.dead = true;
            stopBossMusic();
            startMusic();
            bossHeart = { x: 700, y: 405, w: 36, h: 36, bobT: 0 };
            bloodBurst(700, 420, 40);
            bloodBurst(740, 430, 35);
            bloodBurst(780, 415, 35);
            bloodBurst(820, 425, 30);
            bloodBurst(760, 400, 30);
          }
        }
      }
    }
  }

  // Gravity + movement
  player.vy += GRAVITY * dt;
  player.x  += player.vx * dt;
  player.y  += player.vy * dt;

  // Platform landing
  player.onGround = false;
  for (const p of currentLevel.platforms) {
    if (landedOn(player, p, dt)) {
      player.y = p.y - player.h;
      player.vy = 0;
      player.onGround = true;
    }
  }

  // World bounds
  if (player.x < 0) player.x = 0;

  // Fell off screen
  if (player.y > H + 80) {
    gameOver = true;
    stopMusic();
  }

  // Enemy player damage
  if (player.invincible <= 0) {
    for (const e of enemies) {
      if (!e.alive) continue;
      if (overlaps(player, e)) {
        player.hp--;
        player.invincible = 80;
        player.vy = -9;
        player.vx = player.facing * -5;
        burst(player.x + player.w / 2, player.y, ['#FF3300','#FF9900'], 8);
        if (player.hp <= 0) { gameOver = true; stopMusic(); break; }
      }
    }
  }
  if (player.invincible > 0) player.invincible -= dt;

  // Enemy AI — each enemy owns its behaviour via update(e, dt)
  for (const e of enemies) {
    if (!e.alive) continue;
    if (e.hitFlash > 0) e.hitFlash -= dt;
    e.update(e, dt);
  }

  // Particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x   += p.vx * dt;
    p.y   += p.vy * dt;
    p.vy  += 0.25 * dt;
    p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }

  // Camera follows player with lead
  const targetCamX = player.x - W * 0.35;
  camX += (targetCamX - camX) * 0.1 * dt;
  camX = Math.max(0, camX);

  // ── Boss level (level 3) ────────────────────────────────────────────────────
  if (currentLevelIdx === 2) {
    // Auto-trigger boss when player enters the room
    if (!bossTriggered) { bossTriggered = true; boss = initBoss(); }

    updateBoss(dt);

    // Tongue platform
    if (boss && !boss.dead && boss.tongueLen > 10) {
      const tp = { x: 700 - boss.tongueLen, y: 440, w: boss.tongueLen, h: 14 };
      if (landedOn(player, tp, dt)) { player.y = tp.y - player.h; player.vy = 0; player.onGround = true; }
    }
    // Pond becomes solid platform when boss is dead
    if (boss && boss.dead) {
      const dp = { x: 500, y: 460, w: 390, h: 25 };
      if (landedOn(player, dp, dt)) { player.y = dp.y - player.h; player.vy = 0; player.onGround = true; }
    }
    // Pond hazard
    if (boss && !boss.dead && player.x + player.w > 505 && player.x < 885 &&
        player.y + player.h > 443 && player.invincible <= 0) {
      player.hp--; player.invincible = 90;
      player.x = 250; player.y = 350; player.vx = 0; player.vy = 0;
      burst(player.x + player.w / 2, 440, ['#3CA8D4','#7FD8F8','#FF3300'], 12);
      if (player.hp <= 0) { gameOver = true; stopMusic(); }
    }
    // Claw damage
    if (boss && !boss.dead && boss.state === 'claw' &&
        boss.stateTimer > 10 && boss.stateTimer < 70 && player.invincible <= 0) {
      const t = Math.min((boss.stateTimer - 10) / 15, 1) - Math.max((boss.stateTimer - 45) / 20, 0);
      if (t > 0) {
        const clawTipX = 700 - t * 480;
        if (overlaps(player, { x: clawTipX - 20, y: 380, w: 140, h: 100 })) {
          player.hp--; player.invincible = 80;
          burst(player.x + player.w / 2, player.y + player.h / 2, ['#FF3300','#FF9900'], 8);
          if (player.hp <= 0) { gameOver = true; stopMusic(); }
        }
      }
    }
    // Water ball damage
    if (boss && !boss.dead && player.invincible <= 0) {
      for (const pb of bossProjectiles) {
        if (overlaps(player, { x: pb.x - 10, y: pb.y - 10, w: 20, h: 20 })) {
          player.hp--; player.invincible = 80;
          burst(pb.x, pb.y, ['#3CA8D4','#7FD8F8'], 8);
          pb.y = 9999;
          if (player.hp <= 0) { gameOver = true; stopMusic(); }
        }
      }
    }
  }

  // Win condition
  if (bossHeart) {
    bossHeart.bobT += dt;
    if (overlaps(player, bossHeart)) {
      playerMaxHp = 6;
      player.maxHp = 6;
      player.hp = 6;
      burst(bossHeart.x, bossHeart.y, ['#FF3030','#FF6060','#FFD700','#FF9090'], 20);
      bossHeart = null;
    }
  }

  const bossCleared = currentLevelIdx !== 2 || (boss && boss.dead);
  if (bossCleared && overlaps(player, currentLevel.cave)) { won = true; saveGame(); stopMusic(); startVictoryMusic(); }

  if (currentLevelIdx === 3) updateVolcano(dt);
}

// ── Volcano sequence (level 4) ────────────────────────────────────────────────
function updateVolcano(dt) {
  if (volcanoRock) {
    if (volcanoRock.hitCooldown > 0) volcanoRock.hitCooldown -= dt;
    if (volcanoRock.hitFlash    > 0) volcanoRock.hitFlash    -= dt;
    if (player.swinging && player.swingFrame >= SWING_HIT_START && player.swingFrame <= SWING_HIT_END
        && volcanoRock.hitCooldown <= 0) {
      const bat = batHitbox();
      if (overlaps(bat, volcanoRock)) {
        volcanoRock.hp--;
        volcanoRock.hitCooldown = 20;
        volcanoRock.hitFlash    = 15;
        burst(volcanoRock.x + 45, volcanoRock.y + 40, ['#886644','#AAAAAA','#554422'], 12);
        if (volcanoRock.hp <= 0) {
          volcanoRock   = null;
          volcanoActive = true;
          volcanoLavaX  = 5800;
          burst(5135, 415, ['#FF4400','#FF8800','#FFAA00'], 30);
        }
      }
    }
  }

  if (!volcanoActive) return;

  volcanoLavaX -= 3.5 * dt;

  // Consume enemies the lava has passed
  for (const e of enemies) {
    if (e.alive && e.x + e.w > volcanoLavaX) {
      e.alive = false;
      burst(e.x + e.w / 2, e.y + e.h / 2, ['#FF4400','#FF8800'], 8);
    }
  }

  // Kill player if lava catches them
  if (player.x + player.w > volcanoLavaX && player.invincible <= 0) {
    player.hp = 0;
    gameOver = true;
    stopBossMusic();
    stopMusic();
  }

  // Win: player escapes through the vent at the top of the level
  if (player.y < 0 && player.x + player.w > 2620 && player.x < 2780) {
    won = true;
    saveGame();
    stopBossMusic();
    stopMusic();
    startVictoryMusic();
  }
}

function drawVolcanoRock() {
  if (!volcanoRock) return;
  const rx = sx(volcanoRock.x);
  const ry = volcanoRock.y;
  const flash = volcanoRock.hitFlash > 0;

  ctx.fillStyle = flash ? '#FFFFFF' : '#221408';
  ctx.beginPath(); ctx.ellipse(rx + 45, ry + 52, 50, 52, 0, 0, Math.PI * 2); ctx.fill();

  if (!flash) {
    ctx.fillStyle = '#110A04';
    ctx.beginPath(); ctx.ellipse(rx + 58, ry + 62, 36, 38, 0.3, 0, Math.PI * 2); ctx.fill();
    // Cracks with lava glow
    const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 400);
    ctx.strokeStyle = `rgba(255,${60 + pulse * 60 | 0},0,${0.6 + pulse * 0.3})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(rx + 28, ry + 18); ctx.lineTo(rx + 38, ry + 46); ctx.lineTo(rx + 32, ry + 64); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(rx + 52, ry + 12); ctx.lineTo(rx + 48, ry + 40); ctx.lineTo(rx + 58, ry + 68); ctx.stroke();
  }

  // HP pips
  for (let i = 0; i < volcanoRock.maxHp; i++) {
    ctx.fillStyle = i < volcanoRock.hp ? '#FF5500' : '#330000';
    ctx.fillRect(rx + 12 + i * 24, ry - 20, 18, 9);
  }
}

function drawLavaWall() {
  if (!volcanoActive) return;
  const wx = sx(volcanoLavaX);
  if (wx >= W) return;
  const x0 = Math.max(wx, 0);

  // Background fill
  const g = ctx.createLinearGradient(wx, 0, wx + 120, 0);
  g.addColorStop(0,   '#FFEE88');
  g.addColorStop(0.08,'#FF6600');
  g.addColorStop(0.4, '#CC2200');
  g.addColorStop(1,   '#880A00');
  ctx.fillStyle = g;
  ctx.fillRect(x0, 0, W - x0, H);

  // Bright leading edge
  if (wx >= 0) {
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(wx, 0, 4, H);
    ctx.fillStyle = '#FFEE44'; ctx.fillRect(wx + 4, 0, 10, H);
  }

  // Lava bubbles on leading face
  const t = Date.now() / 250;
  ctx.fillStyle = '#FF9900';
  for (let i = 0; i < 10; i++) {
    const by = ((i * 65 + t * 55) % (H + 20)) - 10;
    ctx.beginPath(); ctx.arc(wx + 18 + Math.sin(t + i * 1.3) * 14, by, 10 + Math.sin(t * 2 + i) * 4, 0, Math.PI * 2); ctx.fill();
  }
}

function drawVentOpening() {
  const ventX = sx(2620);
  const ventW  = 160;
  if (ventX + ventW < 0 || ventX > W) return;
  const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 350);
  const alpha = volcanoActive ? 0.55 + pulse * 0.35 : 0.2 + pulse * 0.1;
  const g = ctx.createLinearGradient(0, 0, 0, 60);
  g.addColorStop(0,   `rgba(255,${180 + pulse * 60 | 0},0,${alpha})`);
  g.addColorStop(1,   'rgba(255,80,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(ventX, 0, ventW, 60);
  // Arrow pointing up when lava is active
  if (volcanoActive) {
    ctx.fillStyle = `rgba(255,255,100,${0.6 + pulse * 0.4})`;
    ctx.beginPath();
    const ax = ventX + ventW / 2;
    const ay = 55 + Math.sin(Date.now() / 200) * 6;
    ctx.moveTo(ax, ay - 20); ctx.lineTo(ax - 14, ay); ctx.lineTo(ax + 14, ay);
    ctx.closePath(); ctx.fill();
  }
}

// ── updateBoss ────────────────────────────────────────────────────────────────
function updateBoss(dt) {
  if (!boss || boss.dead) {
    if (boss && boss.dead) boss.sinkY = Math.min(boss.sinkY + 0.04 * dt, 30);
    return;
  }
  boss.stateTimer += dt;
  boss.hitFlash    = Math.max(0, boss.hitFlash - dt);
  boss.hitCooldown = Math.max(0, boss.hitCooldown - dt);

  const ATTACKS = ['waterballs', 'claw', 'tongue'];

  if (boss.state === 'idle') {
    if (boss.stateTimer > 70) {
      boss.state = ATTACKS[boss.attackIdx % ATTACKS.length];
      boss.attackIdx++;
      boss.stateTimer = 0;
    }
  } else if (boss.state === 'waterballs') {
    if (boss.stateTimer % 5 < 1) {
      bossProjectiles.push({ x: Math.random() * 500, y: -40,
                             vx: (Math.random() - 0.5) * 1.5,
                             vy: 4 + Math.random() * 2.5 });
    }
    if (boss.stateTimer > 160) { boss.state = 'idle'; boss.stateTimer = 0; }
  } else if (boss.state === 'claw') {
    if (boss.stateTimer > 80) { boss.state = 'idle'; boss.stateTimer = 0; }
  } else if (boss.state === 'tongue') {
    const tM = boss.tongueMaxLen;
    if      (boss.stateTimer < 55)  boss.tongueLen = (boss.stateTimer / 55) * tM;
    else if (boss.stateTimer < 220) boss.tongueLen = tM;
    else if (boss.stateTimer < 275) boss.tongueLen = ((275 - boss.stateTimer) / 55) * tM;
    else { boss.tongueLen = 0; boss.state = 'idle'; boss.stateTimer = 0; }
  }

  // Update projectiles
  for (let i = bossProjectiles.length - 1; i >= 0; i--) {
    const pb = bossProjectiles[i];
    pb.x += pb.vx * dt; pb.y += pb.vy * dt;
    if (pb.y > H + 20) bossProjectiles.splice(i, 1);
  }
}

// ── Boss room draw functions ──────────────────────────────────────────────────
function drawBossRoomBG() {
  ctx.fillStyle = '#080810';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#1E1C18';
  ctx.fillRect(0, 0, W, 190);
  // Ceiling cracks
  ctx.fillStyle = '#151210';
  for (let i = 0; i < 8; i++) {
    const cx2 = (i * 130 - camX * 0.05) % W;
    ctx.fillRect(cx2, 50 + (i % 3) * 18, 2, 60 + (i % 2) * 30);
  }
  // Stalactites
  ctx.fillStyle = '#2A2520';
  for (let i = 0; i < 14; i++) {
    const stx = ((i * 72 - camX * 0.5) % (W + 80) + W + 80) % (W + 80) - 40;
    const sth = 28 + (i % 3) * 22;
    ctx.beginPath(); ctx.moveTo(stx, 0); ctx.lineTo(stx + 10, sth); ctx.lineTo(stx + 20, 0); ctx.fill();
  }
  ctx.fillStyle = '#1A1712';
  ctx.fillRect(0, 440, W, H - 440);
  // Torches
  for (const tx of [60, 220, 420, 620, 820, 1000]) {
    const tsx = sx(tx);
    if (tsx < -30 || tsx > W + 30) continue;
    const flicker = 0.72 + 0.28 * Math.sin(Date.now() / 130 + tx * 0.01);
    ctx.fillStyle = '#5A3820'; ctx.fillRect(tsx - 4, 195, 8, 22);
    ctx.fillStyle = '#3A2010'; ctx.fillRect(tsx - 6, 210, 12, 8);
    ctx.save(); ctx.globalAlpha = flicker;
    ctx.fillStyle = '#FF7700'; ctx.beginPath(); ctx.arc(tsx, 192, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#FFD000'; ctx.beginPath(); ctx.arc(tsx, 188, 5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.save(); ctx.globalAlpha = 0.07 * flicker;
    ctx.fillStyle = '#FF8800'; ctx.beginPath(); ctx.arc(tsx, 200, 55, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

function drawPond() {
  const px = sx(500);
  const pw = 390;
  if (boss && boss.dead) {
    // Drained pond — solid stone floor
    ctx.fillStyle = '#3A3530';
    ctx.fillRect(px, 432, pw, 53);
    ctx.fillStyle = '#4A4540';
    ctx.fillRect(px, 432, pw, 4);
    ctx.fillStyle = '#2A2520';
    ctx.fillRect(px, 483, pw, 2);
    ctx.fillStyle = '#302C28';
    for (let rx = px + 12; rx < px + pw - 6; rx += 22) {
      ctx.fillRect(rx, 442, 10, 4);
    }
  } else {
    ctx.fillStyle = '#0A3F62';
    ctx.fillRect(px, 432, pw, 53);
    const t = Date.now() / 700;
    ctx.fillStyle = 'rgba(120,210,255,0.18)';
    for (let i = 0; i < 7; i++) { const bx = px + ((t * 60 + i * 65) % pw); ctx.fillRect(bx, 432, 38, 4); }
    ctx.fillStyle = 'rgba(120,210,255,0.09)';
    for (let i = 0; i < 5; i++) { const bx = px + ((t * 35 + i * 88) % pw); ctx.fillRect(bx, 442, 55, 3); }
  }
}

function drawBoss() {
  if (!boss || boss.dead) return;

  const snoutX = sx(700);
  const by     = 408;

  // Tongue
  if (boss.tongueLen > 2) {
    const tl = boss.tongueLen, ty = by + 38;
    ctx.fillStyle = '#D0507A';
    ctx.fillRect(snoutX - tl, ty - 5, tl, 10);
    ctx.fillStyle = '#E87090';
    ctx.beginPath();
    ctx.moveTo(snoutX - tl, ty - 5); ctx.lineTo(snoutX - tl - 13, ty - 11); ctx.lineTo(snoutX - tl - 4, ty); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(snoutX - tl, ty + 5); ctx.lineTo(snoutX - tl - 13, ty + 11); ctx.lineTo(snoutX - tl - 4, ty); ctx.fill();
  }

  const HW = 70, BW = 90, TW = 30;

  // Tail
  ctx.strokeStyle = '#267826'; ctx.lineWidth = 18; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(snoutX + HW + BW, by + 10);
  ctx.lineTo(snoutX + HW + BW + TW, by + 32);
  ctx.lineTo(snoutX + HW + BW, by + 54);
  ctx.stroke();

  // Body
  ctx.fillStyle = '#267826';
  ctx.fillRect(snoutX + HW - 4, by + 8, BW + 4, 48);
  ctx.fillStyle = '#C8E870';
  for (let i = 0; i < 3; i++) {
    const bsx = snoutX + HW + i * 17;
    ctx.fillRect(bsx + 4, by + 12, 12, 36);
  }
  for (let i = 0; i < 3; i++) {
    const bsx = snoutX + HW + 8 + i * 17;
    ctx.fillRect(bsx + 2, by + 15, 8, 29);
  }

  // Jaw open amount
  const jg = boss.state === 'tongue'    && boss.tongueLen > 8 ? 1.0
           : boss.state === 'claw'      && boss.stateTimer > 10 ? 0.8
           : boss.state === 'waterballs'                        ? 0.35 : 0;

  // Upper jaw / head
  ctx.fillStyle = '#267826';
  ctx.beginPath();
  ctx.moveTo(snoutX, by + 20 - jg * 0.55);
  ctx.lineTo(snoutX + HW, by + 8);
  ctx.lineTo(snoutX + HW, by + 38);
  ctx.lineTo(snoutX, by + 38);
  ctx.closePath(); ctx.fill();

  // Eye
  ctx.fillStyle = '#FFD700';
  ctx.beginPath(); ctx.arc(snoutX + 50, by + 14, 9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.arc(snoutX + 52, by + 15, 5, 0, Math.PI * 2); ctx.fill();

  // Lower jaw
  ctx.fillStyle = '#1B6020';
  ctx.beginPath();
  ctx.moveTo(snoutX, by + 38 + jg * 22);
  ctx.lineTo(snoutX + HW, by + 38);
  ctx.lineTo(snoutX + HW, by + 52);
  ctx.lineTo(snoutX, by + 52 + jg * 22);
  ctx.closePath(); ctx.fill();

  // Teeth
  ctx.fillStyle = '#FFFFF0';
  for (let i = 0; i < 4; i++) {
    const tx = snoutX + 8 + i * 13;
    ctx.beginPath(); ctx.moveTo(tx, by + 38 - jg * 0.55); ctx.lineTo(tx + 5, by + 48 - jg * 0.55); ctx.lineTo(tx + 10, by + 38 - jg * 0.55); ctx.fill();
    ctx.beginPath(); ctx.moveTo(tx, by + 38 + jg * 22); ctx.lineTo(tx + 5, by + 28 + jg * 22); ctx.lineTo(tx + 10, by + 38 + jg * 22); ctx.fill();
  }

  // Legs
  ctx.fillStyle = '#267826';
  for (const lx of [snoutX + HW + 12, snoutX + HW + 55]) {
    ctx.fillRect(lx, by + 52, 16, 20);
    ctx.fillRect(lx - 4, by + 68, 24, 10);
  }

  // Claw attack
  if (boss.state === 'claw' && boss.stateTimer > 10 && boss.stateTimer < 80) {
    const tIn  = Math.min((boss.stateTimer - 10) / 15, 1);
    const tOut = boss.stateTimer > 45 ? Math.min((boss.stateTimer - 45) / 20, 1) : 0;
    const reach = (tIn - tOut) * 480;
    const cx2 = snoutX - reach, cy = by + 62;
    ctx.strokeStyle = '#267826'; ctx.lineWidth = 9; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(snoutX + 8, by + 52);
    ctx.quadraticCurveTo(snoutX - reach * 0.45, cy - 14, cx2 + 16, cy); ctx.stroke();
    ctx.fillStyle = '#1B5C1B';
    ctx.beginPath(); ctx.arc(cx2 + 13, cy, 13, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#D0D050'; ctx.lineWidth = 2.5;
    for (const [dx, dy] of [[-13, -5], [-16, 3], [-13, 11]]) {
      ctx.beginPath(); ctx.moveTo(cx2 + 13, cy); ctx.lineTo(cx2 + 13 + dx, cy + dy); ctx.stroke();
    }
  }

  // Dead — sinking
  if (boss.dead) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - boss.sinkY / 30);
    ctx.translate(0, boss.sinkY);
    ctx.restore();
  }

  // Hit flash
  if (boss.hitFlash > 0) {
    ctx.save();
    ctx.globalAlpha = (boss.hitFlash / 20) * 0.6;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(snoutX, by, HW + BW + TW, 70);
    ctx.restore();
  }

  // Water balls
  for (const pb of bossProjectiles) {
    ctx.fillStyle = '#3CA8D4';
    ctx.beginPath(); ctx.arc(sx(pb.x), pb.y, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#7FD8F8';
    ctx.beginPath(); ctx.arc(sx(pb.x) - 3, pb.y - 3, 4, 0, Math.PI * 2); ctx.fill();
  }
}

function drawBossHP() {
  if (!boss || boss.dead) return;
  const barW = 280, barH = 18;
  const bx = (W - barW) / 2, barY = 12;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath(); ctx.roundRect(bx - 10, barY - 8, barW + 20, barH + 34, 6); ctx.fill();
  ctx.font = 'bold 18px monospace'; ctx.textAlign = 'center'; ctx.fillStyle = '#FF6060';
  ctx.fillText('GRAND CHOMPY', W / 2, barY + 10);
  ctx.fillStyle = '#3A1010';
  ctx.fillRect(bx, barY + 16, barW, barH);
  ctx.fillStyle = '#CC2020';
  ctx.fillRect(bx, barY + 16, barW * (boss.hp / boss.maxHp), barH);
  ctx.textAlign = 'left';
}

// ── Draw helpers ─────────────────────────────────────────────────────────────
function sx(worldX) { return worldX - camX; }

function drawCave() {
  const cx = sx(currentLevel.cave.x - 40);
  const groundY = 460;

  // Rocky cliff body
  ctx.fillStyle = '#5A4535';
  ctx.beginPath();
  ctx.moveTo(cx,       groundY);
  ctx.lineTo(cx,       groundY - 140);
  ctx.lineTo(cx + 40,  groundY - 190);
  ctx.lineTo(cx + 80,  groundY - 210);
  ctx.lineTo(cx + 130, groundY - 180);
  ctx.lineTo(cx + 170, groundY - 130);
  ctx.lineTo(cx + 170, groundY);
  ctx.closePath();
  ctx.fill();

  // Rock highlight / lighter face
  ctx.fillStyle = '#7A6050';
  ctx.beginPath();
  ctx.moveTo(cx + 10,  groundY - 10);
  ctx.lineTo(cx + 10,  groundY - 130);
  ctx.lineTo(cx + 50,  groundY - 180);
  ctx.lineTo(cx + 90,  groundY - 195);
  ctx.lineTo(cx + 90,  groundY - 10);
  ctx.closePath();
  ctx.fill();

  // Dark cave opening (arch)
  ctx.fillStyle = '#0d0a08';
  ctx.beginPath();
  ctx.arc(cx + 55, groundY - 70, 38, Math.PI, 0);
  ctx.rect(cx + 17, groundY - 70, 76, 75);
  ctx.fill();

  // Cave inner shadow gradient
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(cx + 17, groundY - 70, 76, 75);

  // Stalactites inside
  ctx.fillStyle = '#2a1e14';
  for (let i = 0; i < 4; i++) {
    const sx2 = cx + 24 + i * 18;
    ctx.beginPath();
    ctx.moveTo(sx2,      groundY - 105);
    ctx.lineTo(sx2 + 7,  groundY - 105);
    ctx.lineTo(sx2 + 3,  groundY - 88);
    ctx.closePath();
    ctx.fill();
  }

  // Rock edge details
  ctx.fillStyle = '#3d2e20';
  ctx.fillRect(cx,      groundY - 145, 12, 30);
  ctx.fillRect(cx + 55, groundY - 195, 18, 20);
  ctx.fillRect(cx + 140, groundY - 120, 14, 25);

  // "CAVE" sign arrow / glow around entrance
  ctx.fillStyle = 'rgba(255,180,60,0.18)';
  ctx.beginPath();
  ctx.arc(cx + 55, groundY - 70, 50, Math.PI, 0);
  ctx.fill();
}

// Background sky + parallax
function drawBG() {
  // Sky gradient
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#5AAAE0');
  sky.addColorStop(0.7, '#D4EAF7');
  sky.addColorStop(1, '#E8D59A');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // Sun
  ctx.fillStyle = '#FFE040';
  ctx.beginPath();
  ctx.arc(W - 120, 70, 45, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,224,64,0.3)';
  ctx.beginPath();
  ctx.arc(W - 120, 70, 62, 0, Math.PI * 2);
  ctx.fill();

  // Far rolling hills (behind mountains)
  const hillOff = camX * 0.18;
  ctx.fillStyle = '#4A8C35';
  ctx.fillRect(0, H - 62, W, 62);
  ctx.fillStyle = '#5AA040';
  for (let i = -1; i < 7; i++) {
    const hx = i * 360 - hillOff % 360;
    ctx.beginPath();
    ctx.moveTo(hx, H - 60);
    ctx.bezierCurveTo(hx + 90, H - 105, hx + 270, H - 105, hx + 360, H - 60);
    ctx.lineTo(hx + 360, H);
    ctx.lineTo(hx, H);
    ctx.closePath();
    ctx.fill();
  }

  // Parallax mountains
  const mOffset = camX * 0.25;
  ctx.fillStyle = '#9C7A6A';
  for (let i = -1; i < 8; i++) {
    const mx = i * 320 - mOffset % 320;
    ctx.beginPath();
    ctx.moveTo(mx, H - 60);
    ctx.lineTo(mx + 120, H - 240);
    ctx.lineTo(mx + 240, H - 60);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = '#B8957A';
  for (let i = -1; i < 10; i++) {
    const mx = i * 220 - (mOffset * 0.6) % 220;
    ctx.beginPath();
    ctx.moveTo(mx, H - 60);
    ctx.lineTo(mx + 80, H - 170);
    ctx.lineTo(mx + 160, H - 60);
    ctx.closePath();
    ctx.fill();
  }

  // Grass strip over mountain bases
  ctx.fillStyle = '#3A7825';
  ctx.fillRect(0, H - 62, W, 62);
  ctx.fillStyle = '#5CB83E';
  ctx.fillRect(0, H - 62, W, 5);

  // Clouds
  const cOffset = camX * 0.12;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  const clouds = [[0,70,55],[180,50,40],[400,85,50],[600,55,45],[800,75,60],[1000,60,42]];
  for (const [bx, by, r] of clouds) {
    const cx2 = ((bx - cOffset % (W + 200) + W + 200)) % (W + 200) - 100;
    ctx.beginPath();
    ctx.arc(cx2,      by,     r,      0, Math.PI * 2);
    ctx.arc(cx2 + r,  by - 8, r * 0.8, 0, Math.PI * 2);
    ctx.arc(cx2 + r * 1.8, by, r * 0.7, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBG2() {
  // Sky — filtered light through canopy
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0,   '#0B1F05');
  sky.addColorStop(0.35,'#1A3A0A');
  sky.addColorStop(0.7, '#2E5C12');
  sky.addColorStop(1,   '#3A6A14');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // Dappled light shafts through the canopy
  const shaftOff = camX * 0.05;
  ctx.save();
  const shafts = [80, 250, 430, 650, 820, 1020];
  for (const bx of shafts) {
    const sx2 = ((bx - shaftOff % (W + 300) + W + 300)) % (W + 300) - 150;
    const g = ctx.createLinearGradient(sx2, 0, sx2 + 40, H * 0.85);
    g.addColorStop(0,   'rgba(180,255,80,0.07)');
    g.addColorStop(0.5, 'rgba(180,255,80,0.04)');
    g.addColorStop(1,   'rgba(180,255,80,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(sx2, 0);
    ctx.lineTo(sx2 + 50, 0);
    ctx.lineTo(sx2 + 90, H * 0.85);
    ctx.lineTo(sx2 + 40, H * 0.85);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // Far background trees (darkest, slowest parallax)
  const p1off = camX * 0.08;
  ctx.fillStyle = '#0D200A';
  for (let i = -1; i < 9; i++) {
    const tx = i * 290 - p1off % 290;
    const th = 220 + Math.sin(i * 2.3) * 40;
    // round canopy blob
    ctx.beginPath();
    ctx.arc(tx + 80, H - th, 75 + Math.sin(i * 1.1) * 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(tx + 130, H - th - 15, 60, 0, Math.PI * 2);
    ctx.fill();
    // trunk
    ctx.fillRect(tx + 70, H - th + 50, 20, th - 50);
  }

  // Mid-distance trees (medium green, faster parallax)
  const p2off = camX * 0.18;
  ctx.fillStyle = '#163B0C';
  for (let i = -1; i < 10; i++) {
    const tx = i * 220 - p2off % 220;
    const th = 160 + Math.sin(i * 3.1) * 30;
    ctx.beginPath();
    ctx.arc(tx + 60, H - th, 55 + Math.sin(i * 0.9) * 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(tx + 95, H - th - 10, 42, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(tx + 52, H - th + 38, 16, th - 38);
  }

  // Hanging vines
  const vineOff = camX * 0.22;
  ctx.strokeStyle = '#1A4A0A';
  ctx.lineWidth = 3;
  const vines = [60, 190, 340, 500, 660, 800, 970, 1120];
  for (const bx of vines) {
    const vx = ((bx - vineOff % (W + 200) + W + 200)) % (W + 200) - 100;
    const vlen = 80 + Math.sin(bx * 0.7) * 40;
    ctx.beginPath();
    ctx.moveTo(vx, 0);
    ctx.bezierCurveTo(vx - 12, vlen * 0.4, vx + 14, vlen * 0.7, vx, vlen);
    ctx.stroke();
    // small leaf
    ctx.fillStyle = '#1E5C10';
    ctx.beginPath();
    ctx.ellipse(vx, vlen, 9, 5, -0.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Near foreground foliage (darkest green, fastest parallax)
  const p3off = camX * 0.32;
  ctx.fillStyle = '#0E280A';
  for (let i = -1; i < 11; i++) {
    const tx = i * 185 - p3off % 185;
    // bush cluster at ground
    ctx.beginPath();
    ctx.arc(tx + 30, H - 55, 45, Math.PI, 0);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(tx + 80, H - 50, 38, Math.PI, 0);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(tx + 120, H - 52, 42, Math.PI, 0);
    ctx.fill();
  }

  // Ground strip — dark jungle floor with moss tinge
  ctx.fillStyle = '#1A3A08';
  ctx.fillRect(0, H - 60, W, 60);
  ctx.fillStyle = '#2A5A10';
  ctx.fillRect(0, H - 60, W, 6);
}

function drawBG4() {
  // Base — deep volcanic rock
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0,    '#0A0000');
  sky.addColorStop(0.35, '#1A0500');
  sky.addColorStop(0.7,  '#2D0A00');
  sky.addColorStop(1,    '#3D0E00');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // Glowing lava river at the bottom
  const lavaT = Date.now() / 900;
  const lavaBg = ctx.createLinearGradient(0, H - 55, 0, H);
  lavaBg.addColorStop(0, '#CC3300');
  lavaBg.addColorStop(0.5, '#FF6600');
  lavaBg.addColorStop(1, '#FF8800');
  ctx.fillStyle = lavaBg;
  ctx.fillRect(0, H - 55, W, 55);

  // Lava surface shimmer
  ctx.fillStyle = 'rgba(255,200,50,0.22)';
  for (let i = 0; i < 9; i++) {
    const bx = ((lavaT * 70 + i * 130) % (W + 80)) - 40;
    ctx.fillRect(bx, H - 55, 70, 5);
  }
  ctx.fillStyle = 'rgba(255,255,150,0.12)';
  for (let i = 0; i < 6; i++) {
    const bx = ((lavaT * 45 + i * 180) % (W + 80)) - 40;
    ctx.fillRect(bx, H - 52, 100, 3);
  }

  // Glow from lava onto cave walls
  const glowH = ctx.createLinearGradient(0, H - 200, 0, H - 55);
  glowH.addColorStop(0, 'rgba(200,60,0,0)');
  glowH.addColorStop(1, 'rgba(200,60,0,0.18)');
  ctx.fillStyle = glowH;
  ctx.fillRect(0, H - 200, W, 145);

  // Far stalactites — slow parallax
  const p1off = camX * 0.06;
  ctx.fillStyle = '#1A0800';
  const stalactites = [60, 190, 320, 470, 610, 760, 910, 1060, 1210];
  for (let i = 0; i < stalactites.length; i++) {
    const bx = ((stalactites[i] - p1off % (W + 180) + W + 180)) % (W + 180) - 90;
    const h2 = 60 + Math.sin(i * 1.7) * 25;
    ctx.beginPath();
    ctx.moveTo(bx, 0);
    ctx.lineTo(bx + 32, 0);
    ctx.lineTo(bx + 16, h2);
    ctx.closePath();
    ctx.fill();
  }

  // Mid rock columns/formations
  const p2off = camX * 0.14;
  ctx.fillStyle = '#120500';
  const cols = [100, 260, 420, 600, 780, 950, 1120];
  for (let i = 0; i < cols.length; i++) {
    const bx = ((cols[i] - p2off % (W + 250) + W + 250)) % (W + 250) - 125;
    const h2 = 80 + Math.sin(i * 2.3) * 30;
    ctx.beginPath();
    ctx.moveTo(bx, 0); ctx.lineTo(bx + 44, 0); ctx.lineTo(bx + 22, h2);
    ctx.closePath(); ctx.fill();
  }

  // Glowing lava cracks in cave walls — mid parallax
  const crackOff = camX * 0.18;
  const cracks = [40, 170, 310, 450, 610, 750, 900, 1050];
  for (let i = 0; i < cracks.length; i++) {
    const bx = ((cracks[i] - crackOff % (W + 200) + W + 200)) % (W + 200) - 100;
    const pulse = 0.5 + 0.5 * Math.sin(lavaT * 2.1 + i * 1.4);
    ctx.strokeStyle = `rgba(255,${80 + pulse * 80 | 0},0,${0.5 + pulse * 0.4})`;
    ctx.lineWidth = 2 + pulse * 2;
    const cy2 = 80 + Math.sin(i * 0.9) * 60;
    ctx.beginPath();
    ctx.moveTo(bx, cy2);
    ctx.lineTo(bx + 8,  cy2 + 22);
    ctx.lineTo(bx + 3,  cy2 + 38);
    ctx.lineTo(bx + 12, cy2 + 58);
    ctx.stroke();
  }

  // Foreground near stalactites — fastest parallax
  const p3off = camX * 0.28;
  ctx.fillStyle = '#0A0200';
  const nearStals = [30, 160, 310, 480, 640, 800, 960, 1120];
  for (let i = 0; i < nearStals.length; i++) {
    const bx = ((nearStals[i] - p3off % (W + 200) + W + 200)) % (W + 200) - 100;
    const h2 = 40 + Math.sin(i * 2.8) * 18;
    ctx.beginPath();
    ctx.moveTo(bx, 0); ctx.lineTo(bx + 24, 0); ctx.lineTo(bx + 12, h2);
    ctx.closePath(); ctx.fill();
  }

  // Floating embers
  const emberT = Date.now() / 1000;
  ctx.fillStyle = '#FF8800';
  for (let i = 0; i < 18; i++) {
    const ex = ((i * 137 + camX * 0.4 + Math.sin(emberT + i) * 18) % (W + 40) + W + 40) % (W + 40) - 20;
    const ey = H - 55 - ((emberT * 40 + i * 61) % (H - 55));
    const alpha = 0.3 + 0.4 * Math.sin(emberT * 3 + i * 0.8);
    ctx.globalAlpha = alpha;
    ctx.beginPath(); ctx.arc(ex, ey, 2 + Math.sin(i) * 1, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// Platforms (dirt + grass, or wood planks for level 2 elevated)
function drawPlatforms() {
  for (const p of currentLevel.platforms) {
    const px = sx(p.x);
    if (px + p.w < -10 || px > W + 10) continue;

    if (currentLevelIdx === 2) {
      // Stone cave ledge
      ctx.fillStyle = '#3A3530';
      ctx.fillRect(px, p.y, p.w, p.h);
      ctx.fillStyle = '#4A4540';
      ctx.fillRect(px, p.y, p.w, 4);
      ctx.fillStyle = '#2A2520';
      ctx.fillRect(px, p.y + p.h - 2, p.w, 2);
      ctx.fillStyle = '#302C28';
      for (let rx = px + 12; rx < px + p.w - 6; rx += 22) {
        ctx.fillRect(rx, p.y + 6, 10, 4);
      }
    } else if (currentLevelIdx === 3) {
      // Volcanic rock ledge — dark basalt with glowing edge
      ctx.fillStyle = '#1A0A00';
      ctx.fillRect(px, p.y, p.w, p.h);
      ctx.fillStyle = '#2A1000';
      ctx.fillRect(px, p.y, p.w, 4);
      const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 600 + p.x * 0.01);
      ctx.fillStyle = `rgba(255,${60 + pulse * 40 | 0},0,${0.35 + pulse * 0.2})`;
      ctx.fillRect(px, p.y + p.h - 3, p.w, 3);
      ctx.fillStyle = '#140800';
      for (let rx = px + 10; rx < px + p.w - 5; rx += 20) {
        ctx.fillRect(rx, p.y + 6, 8, 3);
      }
    } else if (currentLevelIdx === 1) {
      // Wood plank body
      ctx.fillStyle = '#7B4A12';
      ctx.fillRect(px, p.y, p.w, p.h);
      // Plank dividers
      ctx.fillStyle = '#5A3208';
      for (let lx = px + 35; lx < px + p.w - 5; lx += 40) {
        ctx.fillRect(lx, p.y, 2, p.h);
      }
      // Top highlight
      ctx.fillStyle = '#C07828';
      ctx.fillRect(px, p.y, p.w, 4);
      // Horizontal grain lines
      ctx.fillStyle = '#9B5E18';
      for (let gy = p.y + 6; gy < p.y + p.h - 2; gy += 4) {
        ctx.fillRect(px + 3, gy, p.w - 6, 1);
      }
      // Bottom shadow
      ctx.fillStyle = '#3A1E04';
      ctx.fillRect(px, p.y + p.h - 2, p.w, 2);
    } else {
      // Dirt body
      ctx.fillStyle = '#8B5E3C';
      ctx.fillRect(px, p.y, p.w, p.h);
      // Grass top
      ctx.fillStyle = '#4CAF50';
      ctx.fillRect(px, p.y, p.w, 7);
      // Grass tufts
      ctx.fillStyle = '#388E3C';
      for (let gx = px + 8; gx < px + p.w - 8; gx += 14) {
        ctx.fillRect(gx,     p.y - 4, 3, 5);
        ctx.fillRect(gx + 4, p.y - 3, 3, 4);
      }
      // Dirt texture
      ctx.fillStyle = '#7A5030';
      for (let dx = px + 10; dx < px + p.w - 5; dx += 18) {
        ctx.fillRect(dx, p.y + 10, 5, 3);
      }
    }
  }
}

// Caveman player
function drawPlayer() {
  if (player.invincible > 0 && Math.floor(player.invincible / 5) % 2 === 1) return;

  const px = sx(player.x) + player.w / 2;
  const py = player.y + player.h / 2;
  const f  = player.facing;

  ctx.save();
  ctx.translate(px, py);
  if (f === -1) ctx.scale(-1, 1);
  ctx.scale(0.6, 0.6);

  // Leg walk animation
  const legSwing = Math.sin(player.walkCycle) * (player.onGround ? 12 : 0);

  // Back leg
  ctx.fillStyle = '#C07840';
  ctx.save();
  ctx.translate(-6, 18);
  ctx.rotate((-legSwing * Math.PI) / 180);
  ctx.fillRect(-5, 0, 10, 22);
  ctx.fillStyle = '#7A4020';
  ctx.fillRect(-6, 20, 12, 7); // foot
  ctx.restore();

  // Front leg
  ctx.fillStyle = '#C68642';
  ctx.save();
  ctx.translate(6, 18);
  ctx.rotate((legSwing * Math.PI) / 180);
  ctx.fillRect(-5, 0, 10, 22);
  ctx.fillStyle = '#7A4020';
  ctx.fillRect(-6, 20, 12, 7); // foot
  ctx.restore();

  // Torso
  ctx.fillStyle = '#C68642';
  ctx.fillRect(-14, -12, 28, 30);

  // Loincloth
  ctx.fillStyle = '#5C3010';
  ctx.fillRect(-14, 10, 28, 15);
  // spots
  ctx.fillStyle = '#7A4818';
  ctx.fillRect(-9, 13, 7, 5);
  ctx.fillRect(4, 13, 7, 5);

  // Non-bat arm (left): hangs or raises
  ctx.fillStyle = '#C68642';
  ctx.save();
  ctx.translate(-16, -8);
  ctx.rotate(player.swinging ? 0.4 : 0.1);
  ctx.fillRect(-8, 0, 9, 20);
  ctx.restore();

  // Bat arm (right): swing animation
  ctx.fillStyle = '#C68642';
  ctx.save();
  ctx.translate(16, -8);

  // Compute swing angle: resting above head → sweep downward
  let batAngle;
  if (player.swinging) {
    const t = player.swingFrame / SWING_DUR;
    // Swing arc: starts at -2.2 rad (raised) sweeps to 0.8 rad (follow-through)
    batAngle = -2.2 + t * 3.0;
  } else {
    batAngle = -0.5; // resting: bat tilted back
  }
  ctx.rotate(batAngle);

  // Upper arm
  ctx.fillRect(-5, 0, 9, 18);

  // Bat
  ctx.save();
  ctx.translate(0, 18);
  // Handle (thin)
  ctx.fillStyle = '#8B6914';
  ctx.fillRect(-3, 0, 6, 28);
  // Grip wrap
  ctx.fillStyle = '#6B4A08';
  for (let gy = 4; gy < 26; gy += 7) {
    ctx.fillRect(-4, gy, 8, 3);
  }
  // Barrel (thick end)
  ctx.fillStyle = '#A06030';
  ctx.fillRect(-9, 28, 18, 26);
  // Wood grain
  ctx.strokeStyle = '#804820';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(-7, 32); ctx.lineTo(7, 32); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-7, 38); ctx.lineTo(7, 38); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-7, 44); ctx.lineTo(7, 44); ctx.stroke();
  // Knob
  ctx.fillStyle = '#8B5020';
  ctx.fillRect(-6, 54, 12, 5);
  ctx.restore();

  ctx.restore(); // bat arm

  // Head
  ctx.fillStyle = '#C68642';
  ctx.beginPath();
  ctx.arc(0, -28, 17, 0, Math.PI * 2);
  ctx.fill();

  // Brow ridge
  ctx.fillStyle = '#A05828';
  ctx.fillRect(-14, -40, 28, 7);

  // Messy hair
  ctx.fillStyle = '#1A0A00';
  ctx.beginPath();
  ctx.arc(0, -38, 14, Math.PI, 0);
  ctx.fill();
  // Hair spikes
  ctx.fillRect(-14, -44, 6, 12);
  ctx.fillRect(-5,  -48, 5, 14);
  ctx.fillRect(5,   -46, 6, 13);
  ctx.fillRect(11,  -42, 5, 10);

  // Eyes (slightly angry)
  ctx.fillStyle = '#fff';
  ctx.fillRect(-9, -35, 7, 6);
  ctx.fillRect(3,  -35, 7, 6);
  ctx.fillStyle = '#2a1a00';
  ctx.fillRect(-8, -34, 4, 4);
  ctx.fillRect(4,  -34, 4, 4);
  // Angry brows
  ctx.fillStyle = '#1A0A00';
  ctx.save();
  ctx.translate(-6, -37); ctx.rotate(0.25);
  ctx.fillRect(-5, 0, 10, 3);
  ctx.restore();
  ctx.save();
  ctx.translate(6, -37); ctx.rotate(-0.25);
  ctx.fillRect(-5, 0, 10, 3);
  ctx.restore();

  // Nose
  ctx.fillStyle = '#A05020';
  ctx.beginPath();
  ctx.arc(0, -26, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1A0A00';
  ctx.fillRect(-3, -26, 2, 2);
  ctx.fillRect(1,  -26, 2, 2);

  // Beard stubble
  ctx.fillStyle = '#1A0A00';
  for (let bx = -8; bx <= 8; bx += 5) {
    ctx.fillRect(bx, -18, 2, 3);
  }

  // WHACK flash on active swing
  if (player.swinging && player.swingFrame >= SWING_HIT_START && player.swingFrame <= SWING_HIT_END) {
    ctx.fillStyle = 'rgba(255,200,0,0.18)';
    ctx.beginPath();
    ctx.arc(30, 30, 38, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

// Enemy (lizard/velociraptor vibe)
function drawEnemy(e) {
  const px = sx(e.x) + e.w / 2;
  const py = e.y + e.h / 2;

  ctx.save();
  ctx.translate(px, py);
  if (e.dir < 0) ctx.scale(-1, 1);
  ctx.scale(0.65, 0.65);

  if (e.hitFlash > 0) {
    ctx.globalAlpha = 0.5 + 0.5 * (e.hitFlash / 20);
    ctx.filter = 'brightness(3) saturate(0)';
  }

  // Tail
  ctx.strokeStyle = '#3A6E30';
  ctx.lineWidth = 9;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-8, 4);
  ctx.quadraticCurveTo(-32, 10, -26, -8);
  ctx.stroke();
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(-26, -8);
  ctx.quadraticCurveTo(-38, -14, -34, -4);
  ctx.stroke();

  // Body
  ctx.fillStyle = '#4A8C3A';
  ctx.beginPath();
  ctx.ellipse(0, 4, 18, 14, 0, 0, Math.PI * 2);
  ctx.fill();

  // Belly
  ctx.fillStyle = '#8BC870';
  ctx.beginPath();
  ctx.ellipse(4, 6, 10, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  // Legs
  ctx.fillStyle = '#3A6E30';
  // back leg
  ctx.fillRect(-10, 14, 8, 12);
  ctx.fillRect(-12, 24, 12, 5);
  // front leg
  ctx.fillRect(4, 14, 8, 12);
  ctx.fillRect(2,  24, 12, 5);

  // Arms (tiny)
  ctx.fillRect(14,  0, 7, 8);
  ctx.fillRect(-18, 0, 7, 8);

  // Head
  ctx.fillStyle = '#4A8C3A';
  ctx.beginPath();
  ctx.arc(16, -6, 12, 0, Math.PI * 2);
  ctx.fill();

  // Snout
  ctx.fillRect(22, -8, 14, 8);

  // Eye
  ctx.fillStyle = '#FFE000';
  ctx.beginPath();
  ctx.arc(18, -12, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(19, -12, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillRect(18, -14, 2, 2);

  // Teeth
  ctx.fillStyle = '#F0F0D0';
  ctx.fillRect(24, -3, 3, 6);
  ctx.fillRect(29, -3, 3, 5);
  ctx.fillRect(33, -3, 3, 4);

  // Spines on back
  ctx.fillStyle = '#2A5020';
  for (let sp = -6; sp <= 6; sp += 4) {
    ctx.beginPath();
    ctx.moveTo(sp - 2, -8);
    ctx.lineTo(sp, -18);
    ctx.lineTo(sp + 2, -8);
    ctx.closePath();
    ctx.fill();
  }

  ctx.filter = 'none';
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawLeopard(e) {
  const px = sx(e.x) + e.w / 2;
  const py = e.y + e.h / 2;

  ctx.save();
  ctx.translate(px, py);
  if (e.dir < 0) ctx.scale(-1, 1);
  ctx.scale(0.65, 0.65);

  if (e.hitFlash > 0) {
    ctx.globalAlpha = 0.5 + 0.5 * (e.hitFlash / 20);
    ctx.filter = 'brightness(3) saturate(0)';
  }

  // Tail — long, curling upward
  ctx.strokeStyle = '#B8820A';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-14, 2);
  ctx.bezierCurveTo(-30, 6, -38, -10, -28, -22);
  ctx.stroke();
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-28, -22);
  ctx.quadraticCurveTo(-22, -30, -16, -24);
  ctx.stroke();

  // Body — low and elongated
  ctx.fillStyle = '#D4A020';
  ctx.beginPath();
  ctx.ellipse(0, 6, 22, 11, 0, 0, Math.PI * 2);
  ctx.fill();

  // Belly
  ctx.fillStyle = '#F0D878';
  ctx.beginPath();
  ctx.ellipse(2, 9, 13, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  // Spots — rosette pattern
  ctx.fillStyle = '#5A2800';
  for (const [sx2, sy2, r] of [[-10, 2, 4.5], [2, 0, 5], [13, 3, 4.5], [-4, 10, 4], [10, 10, 4.5]]) {
    ctx.beginPath();
    ctx.arc(sx2, sy2, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // rosette holes
  ctx.fillStyle = '#D4A020';
  for (const [sx2, sy2, r] of [[-10, 2, 2], [2, 0, 2.5], [13, 3, 2], [-4, 10, 2], [10, 10, 2]]) {
    ctx.beginPath();
    ctx.arc(sx2, sy2, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Four legs — short, thick
  ctx.fillStyle = '#B88010';
  ctx.fillRect(-16, 14, 7, 11);  // back-left
  ctx.fillRect(-6,  14, 7, 11);  // back-right
  ctx.fillRect( 6,  14, 7, 11);  // front-left
  ctx.fillRect( 16, 14, 7, 11);  // front-right
  // paws
  ctx.fillStyle = '#F0D878';
  ctx.fillRect(-17, 23, 9, 4);
  ctx.fillRect( -7, 23, 9, 4);
  ctx.fillRect(  5, 23, 9, 4);
  ctx.fillRect( 15, 23, 9, 4);

  // Head
  ctx.fillStyle = '#D4A020';
  ctx.beginPath();
  ctx.arc(22, -2, 12, 0, Math.PI * 2);
  ctx.fill();

  // Ears
  ctx.fillStyle = '#B88010';
  ctx.beginPath();
  ctx.moveTo(15, -10); ctx.lineTo(18, -22); ctx.lineTo(23, -10); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(24, -10); ctx.lineTo(27, -21); ctx.lineTo(31, -10); ctx.fill();

  // Muzzle
  ctx.fillStyle = '#F0D878';
  ctx.beginPath();
  ctx.ellipse(30, 2, 8, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Nose
  ctx.fillStyle = '#FF6060';
  ctx.beginPath();
  ctx.arc(36, 0, 2.5, 0, Math.PI * 2);
  ctx.fill();

  // Eyes — green with slit pupil
  ctx.fillStyle = '#40CC40';
  ctx.beginPath();
  ctx.arc(20, -6, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#000';
  ctx.fillRect(20, -10, 1.5, 8);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillRect(17, -8, 1.5, 1.5);

  // Whiskers
  ctx.strokeStyle = '#F0F0D0';
  ctx.lineWidth = 1.5;
  for (const [x1, y1, x2, y2] of [[30,-2,44,-4],[30,-2,44,-1],[30,2,44,3]]) {
    ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
  }

  // HP pip (second heart if hp=2)
  if (e.maxHp > 1) {
    ctx.filter = 'none';
    ctx.fillStyle = e.hp >= 2 ? '#FF3030' : '#444';
    ctx.beginPath();
    ctx.arc(-4, -26, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = e.hp >= 1 ? '#FF3030' : '#444';
    ctx.beginPath();
    ctx.arc(6, -26, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.filter = 'none';
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawMosquito(e) {
  const ex = sx(e.x + e.w / 2);
  const ey = e.y + e.h / 2;
  const wt = e.wingT || 0;
  const flash = e.hitFlash > 0;

  // Wings
  const wingY = Math.abs(Math.sin(wt * 0.5)) * 10 + 3;
  ctx.save();
  ctx.globalAlpha = flash ? 1 : 0.55;
  ctx.fillStyle = flash ? '#FFFFFF' : '#B8E0FF';
  ctx.beginPath(); ctx.ellipse(ex - 9, ey - wingY, 13, 5, -0.25, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(ex + 6, ey - wingY, 13, 5,  0.25, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  // Body
  ctx.fillStyle = flash ? '#FFFFFF' : '#1E1008';
  ctx.beginPath(); ctx.ellipse(ex, ey, 12, 5, 0, 0, Math.PI * 2); ctx.fill();

  // Abdomen stripe
  if (!flash) {
    ctx.fillStyle = '#3A2010';
    ctx.beginPath(); ctx.ellipse(ex + 4, ey + 1, 6, 3, 0, 0, Math.PI * 2); ctx.fill();
  }

  // Proboscis pointing at player
  const pdx = (player.x + player.w / 2) - (e.x + e.w / 2);
  const pdy = (player.y + player.h / 2) - (e.y + e.h / 2);
  const pang = Math.atan2(pdy, pdx);
  ctx.strokeStyle = flash ? '#FFFFFF' : '#0A0500';
  ctx.lineWidth = 1.5; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(ex + Math.cos(pang) * 12, ey + Math.sin(pang) * 5);
  ctx.lineTo(ex + Math.cos(pang) * 24, ey + Math.sin(pang) * 11);
  ctx.stroke();

  // Eyes
  ctx.fillStyle = '#FF1010';
  ctx.beginPath(); ctx.arc(ex + 9, ey - 2, 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.arc(ex + 10, ey - 2, 1.2, 0, Math.PI * 2); ctx.fill();

  // HP pips
  for (let i = 0; i < e.maxHp; i++) {
    ctx.fillStyle = i < e.hp ? '#FF3030' : '#333';
    ctx.fillRect(ex - 10 + i * 11, ey - 20, 8, 4);
  }
}

// HUD
function drawHUD() {
  // Panel — three rows: HEALTH label, hearts, score
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath();
  ctx.roundRect(10, 10, 220, 116, 8);
  ctx.fill();

  ctx.textAlign = 'left';

  // Row 1: HEALTH label
  ctx.font = 'bold 40px monospace';
  ctx.fillStyle = '#FFD700';
  ctx.fillText('HEALTH', 22, 56);

  // Row 2: hearts
  for (let i = 0; i < player.maxHp; i++) {
    ctx.fillStyle = i < player.hp ? '#FF3030' : '#444';
    ctx.font = '40px sans-serif';
    ctx.fillText('♥', 22 + i * 38, 104);
  }

  // WHACK text
  if (player.swinging && player.swingFrame >= SWING_HIT_START && player.swingFrame <= SWING_HIT_END) {
    const alpha = 1 - (player.swingFrame - SWING_HIT_START) / (SWING_HIT_END - SWING_HIT_START);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = 'bold 80px monospace';
    ctx.fillStyle = '#FFE000';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#FF6600';
    ctx.shadowBlur = 3;
    ctx.fillText('WHACK!', W / 2, 160);
    ctx.restore();
  }
}

// Game over / win overlays
function drawOverlay() {
  if (paused) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.font = 'bold 80px monospace';
    ctx.fillStyle = '#fff';
    ctx.fillText('PAUSED', W / 2, H / 2);
    ctx.font = 'bold 44px monospace';
    ctx.fillStyle = '#C8A862';
    ctx.fillText('Space to resume', W / 2, H / 2 + 100);
    return;
  }
  const isLastLevel = currentLevelIdx >= LEVELS.length - 1;
  if (!gameOver && !won) return;
  if (won && isLastLevel) return;
  if (won && currentLevelIdx === 1) return;
  ctx.fillStyle = 'rgba(0,0,0,0.72)';
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = 'center';
  if (won) {
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 80px monospace';
    if (currentLevelIdx < LEVELS.length - 1) {
      ctx.fillText('Level ' + (currentLevelIdx + 1) + ' Complete!', W / 2, H / 2);
      ctx.font = 'bold 44px monospace';
      ctx.fillStyle = '#C8A862';
      ctx.fillText('Press R to continue', W / 2, H / 2 + 110);
      return;
    }
    ctx.fillText('YOU WIN!', W / 2, H / 2);
  } else {
    ctx.fillStyle = '#FF3030';
    ctx.font = 'bold 80px monospace';
    ctx.fillText('GAME OVER', W / 2, H / 2);
  }
  ctx.font = 'bold 44px monospace';
  ctx.fillStyle = '#C8A862';
  ctx.fillText('Press R to play again', W / 2, H / 2 + 110);
}

// Particles
function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = p.life / p.maxLife;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(sx(p.x), p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ── Title screen draw ────────────────────────────────────────────────────────
function drawTitleScreen() {
  // Volcanic sky
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0,   '#0d0500');
  sky.addColorStop(0.4, '#3a0e00');
  sky.addColorStop(1,   '#7a2e00');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // Lava glow behind volcano
  const glow = ctx.createRadialGradient(760, 300, 30, 760, 300, 320);
  glow.addColorStop(0, 'rgba(255,90,0,0.45)');
  glow.addColorStop(1, 'rgba(255,40,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // ── VOLCANO ──────────────────────────────────────────────────────────────
  // Main cone
  ctx.fillStyle = '#2e1608';
  ctx.beginPath();
  ctx.moveTo(490, H); ctx.lineTo(760, 55); ctx.lineTo(1030, H);
  ctx.closePath(); ctx.fill();

  // Lighter face
  ctx.fillStyle = '#4a2510';
  ctx.beginPath();
  ctx.moveTo(580, H); ctx.lineTo(760, 55); ctx.lineTo(870, H);
  ctx.closePath(); ctx.fill();

  // Crater glow
  ctx.fillStyle = '#FF5500';
  ctx.beginPath(); ctx.ellipse(760, 68, 52, 22, 0, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#FF8800';
  ctx.beginPath(); ctx.ellipse(760, 68, 32, 13, 0, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#FFD700';
  ctx.beginPath(); ctx.ellipse(760, 68, 14, 6,  0, 0, Math.PI*2); ctx.fill();

  // Lava flow left
  ctx.fillStyle = '#FF4400';
  ctx.beginPath();
  ctx.moveTo(738, 80);
  ctx.bezierCurveTo(700,160, 650,220, 635,330);
  ctx.lineTo(668,330);
  ctx.bezierCurveTo(678,220, 726,160, 758,80);
  ctx.closePath(); ctx.fill();

  // Lava flow right
  ctx.fillStyle = '#FF6600';
  ctx.beginPath();
  ctx.moveTo(762, 78);
  ctx.bezierCurveTo(800,150, 840,210, 855,300);
  ctx.lineTo(878,300);
  ctx.bezierCurveTo(864,210, 820,150, 782,78);
  ctx.closePath(); ctx.fill();

  // Lava pool base
  ctx.fillStyle = '#FF3300';
  ctx.beginPath(); ctx.ellipse(760, H-8, 210, 28, 0, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#FF7700';
  ctx.beginPath(); ctx.ellipse(760, H-8, 120, 16, 0, 0, Math.PI*2); ctx.fill();

  // Fire jets at crater
  const fireColors = ['#FF2200','#FF6600','#FFB300','#FF4400','#FF8800'];
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = fireColors[i];
    const fx = 732 + i * 16, fh = 50 + (i%2)*35;
    ctx.beginPath();
    ctx.moveTo(fx, 65); ctx.lineTo(fx-10, 65-fh); ctx.lineTo(fx+10, 65-fh);
    ctx.closePath(); ctx.fill();
  }

  // Smoke
  ctx.fillStyle = 'rgba(60,40,30,0.65)';
  for (const [scx, scy, sr] of [[745,18,26],[768,4,20],[722,12,18],[752,35,14]]) {
    ctx.beginPath(); ctx.arc(scx, scy, sr, 0, Math.PI*2); ctx.fill();
  }

  // Ground / lava-lit floor
  ctx.fillStyle = '#1a0800';
  ctx.fillRect(0, H - 28, W, 28);

  // ── T-REX ────────────────────────────────────────────────────────────────
  const bx = 210, by = 480; // base (feet bottom)

  // Tail
  ctx.fillStyle = '#2a6818';
  ctx.beginPath();
  ctx.moveTo(bx - 30, by - 210);
  ctx.quadraticCurveTo(bx-160, by-180, bx-230, by-250);
  ctx.quadraticCurveTo(bx-210, by-220, bx-130, by-170);
  ctx.quadraticCurveTo(bx-60,  by-155, bx-10,  by-185);
  ctx.closePath(); ctx.fill();

  // Back leg
  ctx.fillStyle = '#2a6818';
  ctx.fillRect(bx+40,  by-180, 55, 100); // thigh
  ctx.fillRect(bx+50,  by-82,  42, 82);  // shin
  ctx.fillRect(bx+20,  by-8,   90, 22);  // foot
  ctx.fillRect(bx+14,  by+12,  22, 14);  // toe
  ctx.fillRect(bx+42,  by+14,  22, 12);
  ctx.fillRect(bx+68,  by+12,  22, 14);

  // Front leg
  ctx.fillStyle = '#348a20';
  ctx.fillRect(bx-20,  by-190, 52, 95);
  ctx.fillRect(bx-10,  by-97,  40, 80);
  ctx.fillRect(bx-40,  by-24,  88, 22);
  ctx.fillRect(bx-46,  by-4,   22, 14);
  ctx.fillRect(bx-18,  by-2,   22, 12);
  ctx.fillRect(bx+8,   by-4,   22, 14);

  // Body
  ctx.fillStyle = '#348a20';
  ctx.beginPath();
  ctx.ellipse(bx+20, by-240, 110, 80, -0.15, 0, Math.PI*2);
  ctx.fill();

  // Belly
  ctx.fillStyle = '#80c858';
  ctx.beginPath();
  ctx.ellipse(bx+40, by-220, 60, 45, -0.1, 0, Math.PI*2);
  ctx.fill();

  // Spines
  ctx.fillStyle = '#1a4e0e';
  for (let i = 0; i < 6; i++) {
    const spx = bx - 30 + i*22, spy = by - 300 - i*8;
    ctx.beginPath();
    ctx.moveTo(spx-8, spy); ctx.lineTo(spx, spy-32); ctx.lineTo(spx+8, spy);
    ctx.closePath(); ctx.fill();
  }

  // Neck
  ctx.fillStyle = '#348a20';
  ctx.beginPath();
  ctx.moveTo(bx+80, by-300);
  ctx.lineTo(bx+170, by-430);
  ctx.lineTo(bx+200, by-410);
  ctx.lineTo(bx+110, by-275);
  ctx.closePath(); ctx.fill();

  // Round skull
  ctx.fillStyle = '#348a20';
  ctx.beginPath();
  ctx.ellipse(bx+168, by-438, 72, 56, 0, 0, Math.PI*2);
  ctx.fill();
  // Brow ridge bump
  ctx.fillStyle = '#1a4e0e';
  ctx.beginPath();
  ctx.ellipse(bx+162, by-488, 60, 16, 0.1, 0, Math.PI*2);
  ctx.fill();
  // Snout (upper) connecting skull to tip
  ctx.fillStyle = '#348a20';
  ctx.fillRect(bx+218, by-462, 80, 58);
  // Snout tip
  ctx.fillRect(bx+290, by-464, 20, 108);
  // Lower jaw
  ctx.fillStyle = '#2a6818';
  ctx.fillRect(bx+148, by-396, 148, 36);

  // Teeth upper
  ctx.fillStyle = '#f0f0d0';
  for (let i = 0; i < 6; i++) ctx.fillRect(bx+152+i*22, by-390, 14, 18);
  // Teeth lower
  for (let i = 0; i < 5; i++) ctx.fillRect(bx+160+i*22, by-370, 14, 16);

  // Eye
  ctx.fillStyle = '#FFD700';
  ctx.beginPath(); ctx.arc(bx+182, by-440, 18, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#111';
  ctx.beginPath(); ctx.arc(bx+184, by-440, 11, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillRect(bx+178, by-450, 7, 7);

  // Tiny arm
  ctx.fillStyle = '#348a20';
  ctx.fillRect(bx+90, by-305, 28, 44);
  ctx.fillRect(bx+92, by-264, 34, 14);
  ctx.fillStyle = '#c8b060';
  ctx.fillRect(bx+92, by-252, 10, 12);
  ctx.fillRect(bx+108, by-252, 10, 12);

  // ── UI overlay ───────────────────────────────────────────────────────────
  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  ctx.fillRect(0, 0, W, H);

  // Title
  ctx.textAlign = 'center';
  ctx.font = 'bold 100px monospace';
  ctx.fillStyle = '#FF5500';
  ctx.fillText('PREHISTORIC', W/2, H/2 - 110);
  ctx.fillStyle = '#FFD700';
  ctx.fillText('PERIL', W/2, H/2 - 20);

  // NEW GAME button
  const newHov = hoveredBtn === 'new';
  ctx.fillStyle = newHov ? '#FFD700' : '#5C3A10';
  ctx.beginPath(); ctx.roundRect(btnNew.x, btnNew.y, btnNew.w, btnNew.h, 8); ctx.fill();
  ctx.font = 'bold 56px monospace';
  ctx.fillStyle = newHov ? '#000' : '#FFD700';
  ctx.fillText('NEW GAME', W/2, btnNew.y + 50);

  // LOAD GAME button
  const canLoad = hasSave();
  const loadHov = hoveredBtn === 'load' && canLoad;
  ctx.fillStyle = loadHov ? '#FFD700' : (canLoad ? '#5C3A10' : '#333');
  ctx.beginPath(); ctx.roundRect(btnLoad.x, btnLoad.y, btnLoad.w, btnLoad.h, 8); ctx.fill();
  ctx.font = 'bold 56px monospace';
  ctx.fillStyle = loadHov ? '#000' : (canLoad ? '#FFD700' : '#666');
  ctx.fillText('LOAD GAME', W/2, btnLoad.y + 50);
}

// ── Cutscene draw ────────────────────────────────────────────────────────────
function drawCutscene() {
  const t = cutsceneTime;
  function clamp01(v) { return Math.min(1, Math.max(0, v)); }

  // Shared daytime background
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#5AAAE0');
  sky.addColorStop(0.7, '#D4EAF7');
  sky.addColorStop(1, '#8BC860');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = '#FFE040';
  ctx.beginPath(); ctx.arc(820, 70, 42, 0, Math.PI * 2); ctx.fill();

  // Ground
  ctx.fillStyle = '#4CAF50';
  ctx.fillRect(0, H - 80, W, 80);
  ctx.fillStyle = '#388E3C';
  ctx.fillRect(0, H - 80, W, 10);

  // Trees
  for (const [tx] of [[90], [280], [560], [760]]) {
    ctx.fillStyle = '#4a5e25';
    ctx.fillRect(tx - 5, H - 110, 10, 32);
    ctx.fillStyle = '#2E7D32';
    ctx.beginPath(); ctx.arc(tx, H - 110, 28, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(tx + 16, H - 98, 20, 0, Math.PI * 2); ctx.fill();
  }

  // ── Helper: draw cavewoman ────────────────────────────────────────────────
  function drawWife(x, y, scared, facingLeft = false) {
    ctx.save();
    ctx.translate(x, y);
    if (facingLeft) ctx.scale(-1, 1);
    ctx.scale(0.6, 0.6);

    // Legs
    ctx.fillStyle = '#C07840';
    ctx.fillRect(-10, 18, 10, 28); ctx.fillRect(2, 18, 10, 28);
    ctx.fillStyle = '#7A4020';
    ctx.fillRect(-12, 43, 14, 7); ctx.fillRect(0, 43, 14, 7);

    // Spotted dress
    ctx.fillStyle = '#5C3010';
    ctx.beginPath();
    ctx.moveTo(-18, 10); ctx.lineTo(-26, 52); ctx.lineTo(26, 52); ctx.lineTo(18, 10);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#8B5020';
    ctx.fillRect(-12, 16, 7, 6); ctx.fillRect(5, 26, 7, 6); ctx.fillRect(-6, 38, 7, 5);

    // Torso
    ctx.fillStyle = '#C68642';
    ctx.fillRect(-14, -12, 28, 24);

    // Arms — raised in fear or relaxed
    ctx.fillStyle = '#C68642';
    if (scared) {
      ctx.save(); ctx.translate(-16, -8); ctx.rotate(-1.1); ctx.fillRect(-5, -22, 9, 22); ctx.restore();
      ctx.save(); ctx.translate(16, -8);  ctx.rotate(1.1);  ctx.fillRect(-4, -22, 9, 22); ctx.restore();
    } else {
      ctx.save(); ctx.translate(-16, -6); ctx.rotate(0.1); ctx.fillRect(-5, 0, 9, 20); ctx.restore();
      ctx.save(); ctx.translate(16, -6);  ctx.rotate(-0.1); ctx.fillRect(-4, 0, 9, 20); ctx.restore();
    }

    // Head
    ctx.fillStyle = '#C68642';
    ctx.beginPath(); ctx.arc(0, -28, 17, 0, Math.PI * 2); ctx.fill();

    // Long hair
    ctx.fillStyle = '#1A0A00';
    ctx.beginPath(); ctx.arc(0, -34, 15, Math.PI, 0); ctx.fill();
    ctx.fillRect(-15, -36, 9, 44); ctx.fillRect(8, -36, 9, 38);

    // Flower in hair
    ctx.fillStyle = '#FF5080';
    for (let a = 0; a < 5; a++) {
      const ax = Math.cos(a * Math.PI * 2 / 5) * 5 - 10;
      const ay = Math.sin(a * Math.PI * 2 / 5) * 5 - 46;
      ctx.beginPath(); ctx.arc(ax, ay, 4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#FFE000';
    ctx.beginPath(); ctx.arc(-10, -46, 3, 0, Math.PI * 2); ctx.fill();

    // Eyes
    ctx.fillStyle = '#fff';
    ctx.fillRect(-9, -34, 7, 5); ctx.fillRect(3, -34, 7, 5);
    if (scared) {
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.arc(-5, -32, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(7, -32, 3.5, 0, Math.PI * 2); ctx.fill();
      // Scared mouth (open O)
      ctx.beginPath(); ctx.arc(0, -21, 5, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = '#2a1a00';
      ctx.fillRect(-8, -33, 5, 4); ctx.fillRect(4, -33, 5, 4);
      // Smile
      ctx.strokeStyle = '#5A2000'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, -20, 5, 0.2, Math.PI - 0.2); ctx.stroke();
    }

    ctx.restore();
  }

  // ── Helper: draw cutscene T-Rex (facing left, chomping) ──────────────────
  function drawCSTRex(x, y, sc = 1, jawOpen = 0.5) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(sc * 0.7, sc * 0.7); // face right

    // Tail
    ctx.fillStyle = '#2a6818';
    ctx.beginPath();
    ctx.moveTo(80, 50); ctx.quadraticCurveTo(200, 30, 240, -30);
    ctx.quadraticCurveTo(220, -15, 165, 20); ctx.quadraticCurveTo(110, 55, 90, 70);
    ctx.closePath(); ctx.fill();

    // Legs
    ctx.fillStyle = '#2a6818';
    ctx.fillRect(30, 110, 50, 90); ctx.fillRect(38, 192, 38, 55); ctx.fillRect(8, 240, 80, 18);
    ctx.fillStyle = '#348a20';
    ctx.fillRect(-30, 100, 48, 85); ctx.fillRect(-22, 178, 36, 52); ctx.fillRect(-50, 224, 78, 18);

    // Body
    ctx.fillStyle = '#348a20';
    ctx.beginPath(); ctx.ellipse(0, 80, 95, 65, -0.1, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#80c858';
    ctx.beginPath(); ctx.ellipse(22, 92, 55, 38, -0.05, 0, Math.PI * 2); ctx.fill();

    // Spines
    ctx.fillStyle = '#1a4e0e';
    for (let i = 0; i < 5; i++) {
      const spx = -38 + i * 22, spy = 18 - i * 9;
      ctx.beginPath(); ctx.moveTo(spx-7, spy); ctx.lineTo(spx, spy-28); ctx.lineTo(spx+7, spy); ctx.closePath(); ctx.fill();
    }

    // Neck
    ctx.fillStyle = '#348a20';
    ctx.beginPath();
    ctx.moveTo(-55, 28); ctx.lineTo(-150, -90); ctx.lineTo(-172, -68); ctx.lineTo(-78, 50);
    ctx.closePath(); ctx.fill();

    // Skull
    ctx.fillStyle = '#348a20';
    ctx.beginPath(); ctx.ellipse(-158, -108, 58, 44, 0.08, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1a4e0e';
    ctx.beginPath(); ctx.ellipse(-152, -150, 52, 15, 0.1, 0, Math.PI * 2); ctx.fill();

    // Upper jaw / snout
    ctx.fillStyle = '#348a20';
    ctx.fillRect(-210, -132, 72, 46);
    ctx.fillRect(-278, -134, 24, 100);

    // Upper teeth
    ctx.fillStyle = '#f0f0d0';
    for (let i = 0; i < 5; i++) ctx.fillRect(-206 + i * 18, -92, 14, 16);

    // Lower jaw (rotates open)
    ctx.save();
    ctx.translate(-158, -88);
    ctx.rotate(-jawOpen * 0.55);
    ctx.fillStyle = '#2a6818';
    ctx.fillRect(-52, 0, 130, 32);
    ctx.fillStyle = '#f0f0d0';
    for (let i = 0; i < 5; i++) ctx.fillRect(-44 + i * 18, 0, 14, 18);
    ctx.restore();

    // Eye
    ctx.fillStyle = '#FFD700';
    ctx.beginPath(); ctx.arc(-168, -124, 16, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(-166, -124, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillRect(-172, -132, 7, 7);

    // Tiny arm
    ctx.fillStyle = '#348a20';
    ctx.fillRect(-92, 18, 24, 38); ctx.fillRect(-90, 54, 32, 12);

    ctx.restore();
  }

  // ── ACT 1: Peaceful wife scene ────────────────────────────────────────────
  if (t <= CS_ACT1) {
    const textAlpha = clamp01(t < 20 ? t / 20 : t > 100 ? (CS_ACT1 - t) / 20 : 1);

    // Flowers near wife
    for (const [fx, fy] of [[W*0.38-55, H-83],[W*0.38+50, H-86],[W*0.38+20, H-80]]) {
      ctx.fillStyle = '#FF6090'; ctx.beginPath(); ctx.arc(fx, fy, 5, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#FFE000'; ctx.beginPath(); ctx.arc(fx, fy, 2, 0, Math.PI*2); ctx.fill();
    }

    drawWife(W * 0.38, H - 80, false);

    ctx.save();
    ctx.globalAlpha = textAlpha;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.beginPath(); ctx.roundRect(W/2 - 310, 28, 620, 72, 8); ctx.fill();
    ctx.textAlign = 'center';
    ctx.font = 'bold 40px monospace';
    ctx.fillStyle = '#FFD700';
    ctx.fillText('Your beloved wife, Mog...', W/2, 76);
    ctx.restore();
  }

  // ── ACT 2: T-Rex attack ───────────────────────────────────────────────────
  else if (t <= CS_ACT2) {
    const lt = t - CS_ACT1;
    const dur = CS_ACT2 - CS_ACT1;
    const chomped = lt > dur * 0.72;

    if (!chomped) {
      const trexX  = W + 120 - (lt / (dur * 0.72)) * (W * 0.52);
      const wifeX  = W * 0.38 - lt * 1.4;
      drawWife(wifeX, H - 80, true, true);
      drawCSTRex(trexX, H - 80, 1.2, 0.8);

      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.beginPath(); ctx.roundRect(W/2 - 260, 28, 520, 72, 8); ctx.fill();
      ctx.textAlign = 'center';
      ctx.font = 'bold 40px monospace';
      ctx.fillStyle = '#FF4400';
      ctx.fillText('A T-Rex appears!', W/2, 76);
    } else {
      const ft = lt - dur * 0.72; // frames since chomp
      // White flash
      if (ft < 10) {
        ctx.fillStyle = `rgba(255,255,255,${clamp01(1 - ft * 0.1)})`;
        ctx.fillRect(0, 0, W, H);
      }
      drawCSTRex(W * 0.52, H - 80, 1.2, 0.6);

      // Debris particles
      for (let i = 0; i < 9; i++) {
        const ang = (i / 9) * Math.PI * 2;
        const d = Math.min(ft * 4, 80);
        ctx.fillStyle = i % 2 === 0 ? '#C8A050' : '#FF6600';
        ctx.beginPath();
        ctx.arc(W*0.44 + Math.cos(ang)*d, H-90 + Math.sin(ang)*d*0.5, 5, 0, Math.PI*2);
        ctx.fill();
      }

      const ta = clamp01((ft - 4) / 10);
      ctx.save();
      ctx.globalAlpha = ta;
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.beginPath(); ctx.roundRect(W/2 - 220, 28, 440, 72, 8); ctx.fill();
      ctx.textAlign = 'center';
      ctx.font = 'bold 48px monospace';
      ctx.fillStyle = '#FF2200';
      ctx.fillText('NOOOOO!!!', W/2, 78);
      ctx.restore();
    }
  }

  // ── ACT 3: Caveman vows vengeance ─────────────────────────────────────────
  else {
    const lt   = t - CS_ACT2;
    const dur  = CS_ACT3 - CS_ACT2;

    // T-Rex exits right
    drawCSTRex(W * 0.52 + lt * 1.5, H - 80, 0.8, 0.2);

    // Angry caveman storms in from left
    const caveX = Math.min(W * 0.3, 30 + lt * 5);
    ctx.save();
    ctx.translate(caveX, H - 80);
    ctx.scale(0.7, 0.7);
    // Legs
    ctx.fillStyle = '#C07840';
    ctx.fillRect(-8, 18, 10, 28); ctx.fillRect(4, 18, 10, 28);
    ctx.fillStyle = '#7A4020';
    ctx.fillRect(-10, 43, 14, 7); ctx.fillRect(2, 43, 14, 7);
    // Loincloth
    ctx.fillStyle = '#5C3010'; ctx.fillRect(-14, 10, 28, 18);
    ctx.fillStyle = '#7A4818'; ctx.fillRect(-9, 13, 7, 5); ctx.fillRect(4, 13, 7, 5);
    // Torso
    ctx.fillStyle = '#C68642'; ctx.fillRect(-14, -12, 28, 24);
    // Fist raised in rage
    ctx.fillStyle = '#C68642';
    ctx.save(); ctx.translate(-16, -8); ctx.rotate(0.2); ctx.fillRect(-5, 0, 9, 20); ctx.restore();
    ctx.save(); ctx.translate(16, -10); ctx.rotate(-1.6); ctx.fillRect(-5, -22, 9, 22); ctx.restore();
    ctx.fillRect(8, -36, 18, 16); // fist
    // Head
    ctx.fillStyle = '#C68642'; ctx.beginPath(); ctx.arc(0, -30, 18, 0, Math.PI*2); ctx.fill();
    // Brow
    ctx.fillStyle = '#A05828'; ctx.fillRect(-14, -42, 28, 7);
    // Hair
    ctx.fillStyle = '#1A0A00';
    ctx.beginPath(); ctx.arc(0, -38, 14, Math.PI, 0); ctx.fill();
    ctx.fillRect(-14, -44, 6, 12); ctx.fillRect(-5, -48, 5, 14);
    ctx.fillRect(5, -46, 6, 13); ctx.fillRect(11, -42, 5, 10);
    // Angry eyes (wide)
    ctx.fillStyle = '#fff'; ctx.fillRect(-9, -38, 7, 7); ctx.fillRect(3, -38, 7, 7);
    ctx.fillStyle = '#000'; ctx.fillRect(-8, -37, 5, 5); ctx.fillRect(4, -37, 5, 5);
    // Angry brows
    ctx.fillStyle = '#1A0A00';
    ctx.save(); ctx.translate(-6, -41); ctx.rotate(0.45); ctx.fillRect(-5,0,12,4); ctx.restore();
    ctx.save(); ctx.translate(6, -41);  ctx.rotate(-0.45); ctx.fillRect(-7,0,12,4); ctx.restore();
    // Roaring mouth
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(0, -23, 7, 0.1, Math.PI - 0.1); ctx.fill();
    ctx.restore();

    // Shaking vengeance text
    const ta    = clamp01(lt / 20);
    const shake = lt > 15 ? Math.sin(lt * 0.9) * 4 : 0;
    ctx.save();
    ctx.globalAlpha = ta;
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.beginPath(); ctx.roundRect(W/2 - 320 + shake, 18, 640, 110, 8); ctx.fill();
    ctx.textAlign = 'center';
    ctx.font = 'bold 52px monospace';
    ctx.fillStyle = '#FF3300';
    ctx.fillText('VENGEANCE!!!', W/2 + shake, 64);
    ctx.font = 'bold 28px monospace';
    ctx.fillStyle = '#FFD700';
    ctx.fillText('Your quest for revenge begins...', W/2 + shake * 0.5, 106);
    ctx.restore();

    // Fade to black
    if (lt > dur - 50) {
      ctx.fillStyle = `rgba(0,0,0,${clamp01((lt - (dur - 50)) / 50)})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  // Skip hint
  ctx.textAlign = 'center';
  ctx.font = '22px monospace';
  ctx.fillStyle = 'rgba(200,168,98,0.55)';
  ctx.fillText('Press any key to skip', W/2, H - 18);
}

// ── Game loop ─────────────────────────────────────────────────────────────────
let lastTime = null;

function loop(timestamp) {
  // dt is normalized to 1.0 at 60 fps; cap at 100 ms to avoid spike after tab switch
  const elapsed = lastTime !== null ? Math.min(timestamp - lastTime, 100) : 1000 / 60;
  lastTime = timestamp;
  const dt = elapsed / (1000 / 60);

  ctx.clearRect(0, 0, W, H);
  if (titleScreen) {
    drawTitleScreen();
  } else if (cutscene) {
    cutsceneTime += dt;
    if (cutsceneTime >= CS_ACT3) { cutscene = false; resetGame(); }
    else drawCutscene();
  } else {
    update(dt);
    if (currentLevelIdx === 2) drawBossRoomBG();
    else if (currentLevelIdx === 3) drawBG4();
    else if (currentLevelIdx === 0) drawBG(); else drawBG2();
    if (currentLevelIdx === 3) drawVentOpening();
    drawPlatforms();
    drawCave();
    if (currentLevelIdx === 2) { drawPond(); drawBoss(); }
    if (currentLevelIdx === 3) { drawVolcanoRock(); drawLavaWall(); }
    drawParticles();
    for (const e of enemies) {
      if (e.alive) {
        if (e.type === 'leopard') drawLeopard(e);
        else if (e.type === 'mosquito') drawMosquito(e);
        else drawEnemy(e);
      }
    }
    drawPlayer();
    if (bossHeart) {
      const bob = Math.sin(bossHeart.bobT * 0.08) * 7;
      ctx.font = '44px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#FF3030';
      ctx.shadowColor = '#FF9090';
      ctx.shadowBlur = 12;
      ctx.fillText('♥', sx(bossHeart.x + 18), bossHeart.y + bob);
      ctx.shadowBlur = 0;
    }
    drawHUD();
    if (currentLevelIdx === 2) drawBossHP();
    drawOverlay();
  }

  // Blit low-res offscreen to display canvas (nearest-neighbour = chunky pixels)
  dispCtx.clearRect(0, 0, W, H);
  dispCtx.drawImage(off, 0, 0, W, H);

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
