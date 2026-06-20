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

// ── Save / Load ──────────────────────────────────────────────────────────────
const SAVE_KEY = 'prehistoricPeril_save';
function saveGame()  { localStorage.setItem(SAVE_KEY, JSON.stringify({ level: 1 })); }
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
  if (cutscene) { cutscene = false; resetGame(); return; }
  if (!titleScreen) return;
  const r  = canvas.getBoundingClientRect();
  const mx = (e.clientX - r.left) * (W / r.width);
  const my = (e.clientY - r.top)  * (H / r.height);
  if (ptInBtn(mx, my, btnNew)) {
    titleScreen = false;
    cutscene = true;
    cutsceneTime = 0;
  } else if (ptInBtn(mx, my, btnLoad) && hasSave()) {
    titleScreen = false;
    resetGame();
  }
});

// ── Input ───────────────────────────────────────────────────────────────────
const keys = {};
let paused = false;
document.addEventListener('keydown', e => {
  if (cutscene) { cutscene = false; resetGame(); return; }
  if (e.code === 'Space') { if (!titleScreen) paused = !paused; e.preventDefault(); return; }
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
  if (audioCtx.state === 'suspended') audioCtx.resume();
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
  if (musicScheduler) return;
  const ac = getAudioCtx();
  nextNoteTime = ac.currentTime + 0.05;
  musicScheduler = setInterval(scheduleMusicStep, 50);
}

// ── Particles ────────────────────────────────────────────────────────────────
let particles = [];
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
function resetPlayer() {
  return {
    x: 80, y: 380,
    w: 38, h: 58,
    vx: 0, vy: 0,
    onGround: false,
    facing: 1,
    swinging: false,
    swingFrame: 0,
    hp: 5,
    invincible: 0,
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
let enemies  = createEnemies();

// ── Cutscene state ───────────────────────────────────────────────────────────
let cutscene     = false;
let cutsceneTime = 0;
const CS_ACT1 = 180;  // wife scene
const CS_ACT2 = 360;  // attack scene
const CS_ACT3 = 520;  // vengeance scene → fade to game

function resetGame() {
  player = resetPlayer();
  camX = 0;
  particles = [];
  gameOver = false;
  won = false;
  enemies = createEnemies();
  startMusic();
}

// ── Update ───────────────────────────────────────────────────────────────────
function update(dt = 1) {
  if (paused) return;
  if (gameOver || won) {
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
    }
  }

  // Gravity + movement
  player.vy += GRAVITY * dt;
  player.x  += player.vx * dt;
  player.y  += player.vy * dt;

  // Platform landing
  player.onGround = false;
  for (const p of platforms) {
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
        if (player.hp <= 0) { gameOver = true; break; }
      }
    }
  }
  if (player.invincible > 0) player.invincible -= dt;

  // Enemy AI: patrol platform edges
  for (const e of enemies) {
    if (!e.alive) continue;
    if (e.hitFlash > 0) e.hitFlash -= dt;

    const plat = platforms[e.platRef];
    e.x += e.vx * e.dir * dt;

    // Reverse at platform edges
    if (e.x <= plat.x) { e.x = plat.x; e.dir = 1; }
    if (e.x + e.w >= plat.x + plat.w) { e.x = plat.x + plat.w - e.w; e.dir = -1; }
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

  // Win condition: walk into the cave
  if (overlaps(player, cave)) { won = true; saveGame(); }
}

// ── Draw helpers ─────────────────────────────────────────────────────────────
function sx(worldX) { return worldX - camX; }

function drawCave() {
  const cx = sx(4020);
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

// Platforms (dirt + grass top)
function drawPlatforms() {
  for (const p of platforms) {
    const px = sx(p.x);
    if (px + p.w < -10 || px > W + 10) continue;
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
  for (let i = 0; i < 5; i++) {
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
  if (!gameOver && !won) return;
  ctx.fillStyle = 'rgba(0,0,0,0.72)';
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = 'center';
  if (won) {
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 80px monospace';
    ctx.fillText('Level Complete!', W / 2, H / 2);
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
    drawBG();
    drawPlatforms();
    drawCave();
    drawParticles();
    for (const e of enemies) {
      if (e.alive) drawEnemy(e);
    }
    drawPlayer();
    drawHUD();
    drawOverlay();
  }

  // Blit low-res offscreen to display canvas (nearest-neighbour = chunky pixels)
  dispCtx.clearRect(0, 0, W, H);
  dispCtx.drawImage(off, 0, 0, W, H);

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
