/* Applet-style platformer
   Paste this into game.js (or bundle into index.html).
   Author: ChatGPT — ready for GitHub.
*/

/* =========================
   Config
   ========================= */
const CONFIG = {
  canvasWidth: 960,
  canvasHeight: 540,
  scale: 2,              // internal scale for crisp pixel look (we handle resizing)
  tileSize: 32,
  gravity: 1400,         // px/s^2
  maxFPS: 120,
  player: {
    width: 26,
    height: 36,
    speed: 280,
    jumpSpeed: 520,
    maxFallSpeed: 900,
    frictionGround: 0.85,
    frictionAir: 0.98,
  },
  colors: {
    sky1: '#7ec0ee',
    sky2: '#a0d8ff',
    ground: '#2f2f2f',
    player: '#ff6b6b',
    enemy: '#264653',
    coin: '#ffd166',
    portal: '#9b5de5',
  }
};

/* =========================
   Canvas setup
   ========================= */
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });
canvas.width = CONFIG.canvasWidth;
canvas.height = CONFIG.canvasHeight;

/* fit canvas to element while preserving pixel-perfect look */
function fitCanvas() {
  const styleW = canvas.clientWidth;
  const styleH = canvas.clientHeight;
  canvas.style.imageRendering = 'pixelated';
  // no extra scaling of drawing buffer — we rely on CSS size
}
fitCanvas();
window.addEventListener('resize', fitCanvas);

/* =========================
   Input
   ========================= */
const keys = {
  left: false,
  right: false,
  jump: false,
  pause: false,
  restart: false,
};

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = true;
  if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = true;
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') keys.jump = true;
  if (e.code === 'KeyP') keys.pause = !keys.pause;
  if (e.code === 'KeyR') initLevel(currentLevelIndex);
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = false;
  if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = false;
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') keys.jump = false;
});

/* Touch controls */
const touchControls = document.getElementById('touch-controls');
const leftBtn = document.getElementById('left-btn');
const rightBtn = document.getElementById('right-btn');
const jumpBtn = document.getElementById('jump-btn');

function showTouchIfMobile() {
  const small = window.matchMedia && window.matchMedia('(max-width:820px)').matches;
  if (small) touchControls.classList.remove('hidden'); else touchControls.classList.add('hidden');
}
showTouchIfMobile();
window.addEventListener('resize', showTouchIfMobile);

[leftBtn, rightBtn, jumpBtn].forEach(btn => {
  btn.addEventListener('touchstart', (e) => { e.preventDefault(); if (btn===leftBtn) keys.left=true; if (btn===rightBtn) keys.right=true; if (btn===jumpBtn) keys.jump=true; });
  btn.addEventListener('touchend', (e) => { e.preventDefault(); if (btn===leftBtn) keys.left=false; if (btn===rightBtn) keys.right=false; if (btn===jumpBtn) keys.jump=false; });
});

/* UI buttons */
document.getElementById('pause').addEventListener('click', () => { keys.pause = !keys.pause; });
document.getElementById('restart').addEventListener('click', () => { initLevel(currentLevelIndex); });

/* HUD helpers */
function setHUD(score, lives, level) {
  document.getElementById('score').textContent = `Score: ${score}`;
  document.getElementById('lives').textContent = `Lives: ${lives}`;
  document.getElementById('level').textContent = `Level: ${level+1}`;
}

/* =========================
   Sound (tiny WebAudio helper)
   ========================= */
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function beep(freq=440, duration=0.08, type='sine', vol=0.08) {
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.value = vol;
  o.connect(g); g.connect(audioCtx.destination);
  o.start();
  o.stop(audioCtx.currentTime + duration);
}

/* =========================
   Utility
   ========================= */
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function now() { return performance.now() / 1000; }

/* =========================
   Tilemap / levels
   0 = empty
   1 = solid block
   2 = coin
   3 = moving platform
   4 = one-way platform (stand on top)
   5 = portal/goal
   6 = enemy spawn
   ========================= */
const LEVELS = [
  {
    tilesWide: 60,
    tilesHigh: 17,
    layout: [
      // short example level (rows concatenated top-down). Use '.' for 0 in comment, but we store numbers.
      // We'll programmatically create a floor and some platforms + coins.
    ],
    name: "Demo Meadow"
  },
  {
    tilesWide: 80,
    tilesHigh: 17,
    layout: [],
    name: "Twin Peaks"
  }
];

/* helper to build a blank level and add elements */
function makeLevel(w, h, patternFn) {
  const arr = new Array(w*h).fill(0);
  if (patternFn) patternFn(arr, w, h);
  return arr;
}

/* Build sample level 1 */
LEVELS[0].layout = makeLevel(60, 17, (a, w, h) => {
  // floor
  for (let x=0;x<w;x++) a[(h-2)*w + x] = 1; // second-to-last row
  // scattered platforms and coins
  const plats = [
    {x:4,y:11,len:6},
    {x:14,y:9,len:4},
    {x:22,y:7,len:8},
    {x:36,y:10,len:6},
    {x:52,y:8,len:5},
  ];
  plats.forEach(p => {
    for (let i=0;i<p.len;i++) a[(p.y)*w + p.x + i] = 1;
    // coins above
    for (let i=0;i<Math.min(4,p.len);i++){
      a[(p.y-1)*w + p.x + i] = 2;
    }
  });
  // moving platform
  a[(12)*w + 30] = 3;
  // one-way platforms
  for (let i=0;i<5;i++) a[(13)*w + 46 + i] = 4;
  // enemy spawns
  a[(h-3)*w + 16] = 6;
  a[(h-3)*w + 38] = 6;
  // portal/goal
  a[(h-3)*w + (w-4)] = 5;
});

/* Build sample level 2 with tighter gaps and multiple moving platforms */
LEVELS[1].layout = makeLevel(80, 17, (a,w,h) => {
  for (let x=0;x<w;x++) a[(h-2)*w + x] = 1;
  // terraces
  for (let seg=0; seg<6; seg++){
    const gx = 8 + seg*11;
    const gy = 10 - (seg % 3);
    for (let x=0;x<7;x++) a[(gy)*w + gx + x] = 1;
    a[(gy-1)*w + gx+3] = 2;
  }
  // moving platforms cluster
  a[(12)*w + 28] = 3;
  a[(10)*w + 45] = 3;
  a[(9)*w + 62] = 3;
  // enemies
  a[(h-3)*w + 18] = 6;
  a[(h-3)*w + 46] = 6;
  a[(h-3)*w + 62] = 6;
  // portal near end
  a[(h-3)*w + (w - 5)] = 5;
});

/* =========================
   Game world state
   ========================= */
let state = {
  score: 0,
  lives: 3,
  particles: [],
  entities: [],
  tiles: [],
  tilesWide: 0,
  tilesHigh: 0,
  tileSize: CONFIG.tileSize,
  cameraX: 0,
  cameraY: 0,
  paused: false,
  goalReached: false,
  highScore: parseInt(localStorage.getItem('applet_highscore')||'0',10),
  checkpoint: null,
};

let currentLevelIndex = 0;

/* Entity class (player/enemy/platform) */
class Entity {
  constructor(x,y,w,h,type='generic'){
    this.x = x; this.y = y;
    this.w = w; this.h = h;
    this.vx = 0; this.vy = 0;
    this.type = type;
    this.grounded = false;
    this.dir = 1;
    this.dead = false;
    this.extra = {}; // slot for custom fields
  }
  get centerX(){ return this.x + this.w/2; }
  get centerY(){ return this.y + this.h/2; }
  intersects(other){
    return !(this.x+this.w <= other.x || this.x >= other.x+other.w || this.y+this.h <= other.y || this.y >= other.y+other.h);
  }
}

/* Init level by index */
function initLevel(idx){
  const level = LEVELS[idx];
  state.tiles = level.layout.slice();
  state.tilesWide = level.tilesWide;
  state.tilesHigh = level.tilesHigh;
  state.score = 0;
  state.goalReached = false;
  state.entities = [];
  state.particles = [];
  state.paused = false;
  state.checkpoint = null;
  // create player
  const player = new Entity(64, (state.tilesHigh-4)*CONFIG.tileSize, CONFIG.player.width, CONFIG.player.height, 'player');
  player.canDoubleJump = false;
  player.jumps = 0;
  state.entities.push(player);
  // spawn enemies by scanning tilemap
  for (let y=0;y<state.tilesHigh;y++){
    for (let x=0;x<state.tilesWide;x++){
      const t = state.tiles[y*state.tilesWide + x];
      if (t === 6){
        const en = new Entity(x*CONFIG.tileSize+4, y*CONFIG.tileSize - 28, 24, 30,'enemy');
        en.patrolMinX = (x-4)*CONFIG.tileSize;
        en.patrolMaxX = (x+6)*CONFIG.tileSize;
        en.speed = 60 + Math.random()*40;
        en.dir = Math.random() < 0.5 ? -1 : 1;
        state.entities.push(en);
        // clear the tile so not solid
        state.tiles[y*state.tilesWide + x] = 0;
      }
    }
  }
  // set camera to player
  state.cameraX = player.x - canvas.width/2 + player.w/2;
  state.cameraY = player.y - canvas.height/2 + player.h/2;
  setHUD(state.score, state.lives, currentLevelIndex);
}

/* =========================
   Collision helpers (tile collisions)
   ========================= */
function tileAtPixels(px, py){
  const tx = Math.floor(px / CONFIG.tileSize);
  const ty = Math.floor(py / CONFIG.tileSize);
  if (tx < 0 || tx >= state.tilesWide || ty < 0 || ty >= state.tilesHigh) return 0;
  return state.tiles[ty*state.tilesWide + tx];
}

function setTile(tx, ty, val){
  if (tx < 0 || tx >= state.tilesWide || ty < 0 || ty >= state.tilesHigh) return;
  state.tiles[ty*state.tilesWide + tx] = val;
}

/* Sweep-based AABB collision resolution for solid tiles */
function resolveTileCollisions(entity, dt){
  const left = entity.x;
  const right = entity.x + entity.w;
  const top = entity.y;
  const bottom = entity.y + entity.h;

  // check all tiles overlapped by entity
  const tx0 = Math.floor(left / CONFIG.tileSize);
  const tx1 = Math.floor((right-1)/ CONFIG.tileSize);
  const ty0 = Math.floor(top / CONFIG.tileSize);
  const ty1 = Math.floor((bottom-1) / CONFIG.tileSize);

  entity.grounded = false;
  for (let ty = ty0; ty <= ty1; ty++){
    for (let tx = tx0; tx <= tx1; tx++){
      if (tx < 0 || tx >= state.tilesWide || ty < 0 || ty >= state.tilesHigh) continue;
      const t = state.tiles[ty*state.tilesWide + tx];
      if (t === 0 || t === 2 || t === 3 || t === 4 || t === 5) continue; // not standard solid ones; handle separately
      // solid tile
      const tileRect = {x: tx*CONFIG.tileSize, y: ty*CONFIG.tileSize, w: CONFIG.tileSize, h: CONFIG.tileSize};
      // compute overlap
      const overlapX = Math.min(entity.x + entity.w, tileRect.x + tileRect.w) - Math.max(entity.x, tileRect.x);
      const overlapY = Math.min(entity.y + entity.h, tileRect.y + tileRect.h) - Math.max(entity.y, tileRect.y);
      if (overlapX > 0 && overlapY > 0){
        // resolve smallest axis
        if (overlapX < overlapY){
          if (entity.x < tileRect.x) {
            entity.x -= overlapX;
            entity.vx = 0;
          } else {
            entity.x += overlapX;
            entity.vx = 0;
          }
        } else {
          if (entity.y < tileRect.y) {
            entity.y -= overlapY;
            entity.vy = 0;
            entity.grounded = true;
            entity.jumps = 0;
          } else {
            entity.y += overlapY;
            entity.vy = 0;
          }
        }
      }
    }
  }
}

/* =========================
   Game step/update
   ========================= */
let lastTime = now();
let accumulator = 0;
function gameLoop(){
  const t = now();
  let dt = t - lastTime;
  lastTime = t;
  dt = Math.min(dt, 1/30); // clamp big jumps

  if (!keys.pause && !state.paused){
    update(dt);
  }

  render();

  requestAnimationFrame(gameLoop);
}

/* Update world (physics, AI, collisions) */
function update(dt){
  const player = state.entities.find(e => e.type === 'player');

  // ---- Player controls & movement ----
  if (player){
    // horizontal control
    if (keys.left) player.vx = -CONFIG.player.speed;
    else if (keys.right) player.vx = CONFIG.player.speed;
    else player.vx = 0;

    // jump
    if (keys.jump && (player.grounded || (player.canDoubleJump && player.jumps < 1))) {
      if (player.grounded) {
        player.vy = -CONFIG.player.jumpSpeed;
        player.grounded = false;
        player.jumps = 1;
        spawnParticle(player.centerX, player.y + player.h, 8, 'jump');
        beep(880, 0.06, 'sine', 0.06);
      } else if (player.canDoubleJump && player.jumps < 2) {
        player.vy = -CONFIG.player.jumpSpeed * 0.9;
        player.jumps++;
        spawnParticle(player.centerX, player.centerY, 10, 'jump');
        beep(1100, 0.06, 'square', 0.06);
      }
      // prevent repeated immediate jumps until key released
      keys.jump = false;
    }

    // apply gravity
    player.vy += CONFIG.gravity * dt;
    player.vy = clamp(player.vy, -9999, CONFIG.player.maxFallSpeed);

    // integrate
    player.x += player.vx * dt;
    player.y += player.vy * dt;

    // collisions
    resolveTileCollisions(player, dt);

    // interact with special tiles: coins, moving platforms, one-way, portal
    handleSpecialTiles(player, dt);
  }

  // ---- Entities (enemies/moving platforms) ----
  for (const ent of state.entities){
    if (ent.type === 'enemy'){
      // simple patrol
      ent.vx = ent.dir * ent.speed;
      ent.vy += CONFIG.gravity * dt;
      ent.x += ent.vx * dt;
      ent.y += ent.vy * dt;
      // flip if hitting solid or reaching patrol edges
      // if we detect no ground ahead, flip
      const footX = ent.dir === 1 ? ent.x + ent.w + 2 : ent.x - 2;
      const footY = ent.y + ent.h + 4;
      const tBelow = tileAtPixels(footX, footY);
      const tAtFront = tileAtPixels(ent.centerX + ent.dir* (ent.w/2 + 8), ent.centerY);
      if ((tBelow === 0 && ent.grounded) || tAtFront === 1) {
        ent.dir *= -1;
      }
      // collision with environment for enemies as well
      resolveTileCollisions(ent, dt);
    } else if (ent.type === 'movingPlatform'){
      // moving platforms are special: move horizontally and loop
      if (!('path' in ent.extra)){
        ent.extra.path = [ent.x, ent.x+120];
        ent.extra.speed = 60;
        ent.extra.dir = 1;
      }
      ent.x += ent.extra.dir * ent.extra.speed * dt;
      if (ent.x < ent.extra.path[0]) { ent.x = ent.extra.path[0]; ent.extra.dir = 1; }
      if (ent.x > ent.extra.path[1]) { ent.x = ent.extra.path[1]; ent.extra.dir = -1; }
    }
  }

  // ---- Collisions between player and enemies / pickups ----
  handleEntityInteractions();

  // ---- Particles update ----
  updateParticles(dt);

  // ---- Camera follow ----
  if (player){
    const targetX = player.x + player.w/2 - canvas.width/2;
    const targetY = player.y + player.h/2 - canvas.height/2;
    state.cameraX += (targetX - state.cameraX) * clamp(5*dt, 0, 1);
    state.cameraY += (targetY - state.cameraY) * clamp(5*dt, 0, 1);
    state.cameraX = clamp(state.cameraX, 0, state.tilesWide*CONFIG.tileSize - canvas.width);
    state.cameraY = clamp(state.cameraY, 0, state.tilesHigh*CONFIG.tileSize - canvas.height);
  }

  setHUD(state.score, state.lives, currentLevelIndex);
}

/* handle coins, portals, moving platforms, one-way platforms */
function handleSpecialTiles(player, dt){
  // get the tile indices player overlaps
  const tx0 = Math.floor(player.x / CONFIG.tileSize);
  const tx1 = Math.floor((player.x + player.w - 1) / CONFIG.tileSize);
  const ty0 = Math.floor(player.y / CONFIG.tileSize);
  const ty1 = Math.floor((player.y + player.h - 1) / CONFIG.tileSize);

  for (let ty=ty0; ty<=ty1; ty++){
    for (let tx=tx0; tx<=tx1; tx++){
      if (tx < 0 || tx >= state.tilesWide || ty < 0 || ty >= state.tilesHigh) continue;
      const t = state.tiles[ty*state.tilesWide + tx];
      if (t === 2){ // coin
        state.tiles[ty*state.tilesWide + tx] = 0;
        state.score += 10;
        spawnParticle((tx+0.5)*CONFIG.tileSize, (ty+0.5)*CONFIG.tileSize, 12, 'coin');
        beep(1200, 0.05, 'triangle', 0.06);
      } else if (t === 5) { // portal
        // reach goal
        if (!state.goalReached){
          state.goalReached = true;
          beep(600, 0.2, 'sine', 0.12);
          setTimeout(() => {
            // advance level if exists
            currentLevelIndex = (currentLevelIndex + 1) % LEVELS.length;
            initLevel(currentLevelIndex);
          }, 800);
        }
      } else if (t === 3) {
        // moving platform: if player stands on it, carry player
        // find platform entity or emulate movement
        // simple approach: if player's bottom is at tile top and vy >= 0, snap to it and carry horizontally if platform moves
        const tileTop = ty * CONFIG.tileSize;
        const prevBottom = player.y + player.h - player.vy * dt;
        if (prevBottom <= tileTop + 2 && player.y + player.h >= tileTop) {
          player.y = tileTop - player.h;
          player.vy = 0;
          player.grounded = true;
        }
      } else if (t === 4) {
        // one-way platform: stand on from above
        const tileTop = ty*CONFIG.tileSize;
        const prevBottom = player.y + player.h - player.vy * dt;
        if (prevBottom <= tileTop + 2 && player.y + player.h >= tileTop) {
          player.y = tileTop - player.h;
          player.vy = 0;
          player.grounded = true;
        }
      }
    }
  }
}

/* entity interactions: player <-> enemies */
function handleEntityInteractions(){
  const player = state.entities.find(e => e.type === 'player');
  if (!player) return;
  for (const ent of state.entities){
    if (ent === player) continue;
    if (ent.type === 'enemy' && !ent.dead){
      if (player.intersects(ent)){
        // if player is falling onto enemy -> kill enemy
        if (player.vy > 80 && (player.y + player.h - ent.y) < 18){
          ent.dead = true;
          state.score += 50;
          player.vy = -CONFIG.player.jumpSpeed * 0.5;
          spawnParticle(ent.centerX, ent.centerY, 20, 'enemyDeath');
          beep(550, 0.08, 'sawtooth', 0.09);
        } else {
          // else player takes damage
          damagePlayer(player, ent);
        }
      }
    }
  }
  // remove dead enemies (with small delay not implemented): keep for now but mark invisible
  state.entities = state.entities.filter(e => !(e.type==='enemy' && e.dead && Math.random()<0.001)); // slow fade-out
}

/* player damage */
function damagePlayer(player, source){
  // knockback
  player.vx = (player.centerX < source.centerX) ? -200 : 200;
  player.vy = -240;
  // respawn at checkpoint or start
  state.lives -= 1;
  spawnParticle(player.centerX, player.centerY, 18, 'hit');
  beep(160, 0.18, 'sine', 0.14);
  if (state.lives <= 0){
    // game over -> restart level and reset lives
    if (state.score > state.highScore) {
      state.highScore = state.score;
      localStorage.setItem('applet_highscore', state.highScore);
    }
    state.lives = 3;
    initLevel(currentLevelIndex);
  } else {
    // respawn at checkpoint or start
    if (state.checkpoint){
      player.x = state.checkpoint.x;
      player.y = state.checkpoint.y;
    } else {
      player.x = 64; player.y = (state.tilesHigh-4)*CONFIG.tileSize;
    }
  }
}

/* =========================
   Particles
   ========================= */
function spawnParticle(x, y, n=10, kind='coin'){
  for (let i=0;i<n;i++){
    const p = {
      x: x + (Math.random()-0.5)*10,
      y: y + (Math.random()-0.5)*10,
      vx: (Math.random()-0.5)*220,
      vy: (Math.random()-0.5)*220,
      life: 0.5 + Math.random()*0.5,
      size: 2 + Math.random()*4,
      kind,
    };
    state.particles.push(p);
  }
}

function updateParticles(dt){
  for (let i = state.particles.length - 1; i >= 0; i--){
    const p = state.particles[i];
    p.vy += CONFIG.gravity * 0.001 * dt * 60;
    p.vx *= 0.99;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (p.life <= 0) state.particles.splice(i,1);
  }
}

/* =========================
   Render
   ========================= */
function render(){
  // draw sky background
  ctx.fillStyle = CONFIG.colors.sky1;
  ctx.fillRect(0,0,canvas.width,canvas.height);
  // parallax clouds (simple)
  drawParallax();

  // translate for camera
  ctx.save();
  ctx.translate(-state.cameraX, -state.cameraY);

  // draw tiles
  drawTiles();

  // draw entities
  for (const ent of state.entities){
    if (ent.type === 'player') drawPlayer(ent);
    else if (ent.type === 'enemy') drawEnemy(ent);
    else if (ent.type === 'movingPlatform') drawMovingPlatform(ent);
  }

  // draw particles
  drawParticles();

  ctx.restore();

  // HUD overlay (could be enhanced)
  // draw highscore small tip
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(6, canvas.height-28, 250, 22);
  ctx.fillStyle = '#fff';
  ctx.font = '12px sans-serif';
  ctx.fillText(`High score: ${state.highScore}`, 12, canvas.height-12);
}

/* draw sky parallax */
function drawParallax(){
  // subtle gradient
  const g = ctx.createLinearGradient(0,0,0,canvas.height);
  g.addColorStop(0, CONFIG.colors.sky1);
  g.addColorStop(1, CONFIG.colors.sky2);
  ctx.fillStyle = g;
  ctx.fillRect(0,0,canvas.width,canvas.height);

  // some cloud blobs
  const time = performance.now()*0.00008;
  for (let i=0;i<6;i++){
    const x = ((time*30*(0.2+i*0.1)) % (canvas.width+300)) - 150 + i*200;
    const y = 40 + i*28;
    ctx.globalAlpha = 0.6 - i*0.06;
    drawRoundedRect(ctx, x, y, 180, 40, 30);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/* drawTiles: iterate tilemap and draw each tile type */
function drawTiles(){
  const ts = CONFIG.tileSize;
  for (let y=0;y<state.tilesHigh;y++){
    for (let x=0;x<state.tilesWide;x++){
      const t = state.tiles[y*state.tilesWide + x];
      const px = x*ts, py = y*ts;
      if (t === 1){
        // solid ground (draw simple block with top highlight)
        ctx.fillStyle = CONFIG.colors.ground;
        ctx.fillRect(px, py, ts, ts);
        ctx.fillStyle = '#3b3b3b';
        ctx.fillRect(px, py, ts, ts*0.25);
      } else if (t === 2){
        // coin
        ctx.beginPath();
        ctx.fillStyle = CONFIG.colors.coin;
        ctx.arc(px+ts/2, py+ts/2, ts*0.28, 0, Math.PI*2);
        ctx.fill();
      } else if (t === 3){
        // moving platform visual
        ctx.fillStyle = '#9ecbff';
        roundRect(ctx, px+4, py+ts*0.25, ts-8, ts*0.5, 6, true, false);
      } else if (t === 4){
        // one-way platform (thin)
        ctx.fillStyle = '#5f7a7a';
        ctx.fillRect(px, py + ts*0.4, ts, ts*0.12);
      } else if (t === 5){
        // portal/goal
        ctx.fillStyle = CONFIG.colors.portal;
        roundRect(ctx, px+6, py+4, ts-12, ts-8, 6, true, false);
      }
    }
  }
}

/* draw player as rounded rectangle with small eyes */
function drawPlayer(p){
  ctx.save();
  ctx.translate(p.x, p.y);
  // body
  roundRect(ctx, 0, 0, p.w, p.h, 6, true, false);
  ctx.fillStyle = CONFIG.colors.player;
  ctx.fill();
  // eyes
  ctx.fillStyle = '#222';
  ctx.fillRect(p.w*0.25, p.h*0.28, 4, 4);
  ctx.fillRect(p.w*0.65, p.h*0.28, 4, 4);
  ctx.restore();
}

/* draw enemy */
function drawEnemy(e){
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.fillStyle = CONFIG.colors.enemy;
  roundRect(ctx, 0, 0, e.w, e.h, 6, true, false);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillRect(e.w*0.25, e.h*0.25, 6, 6);
  ctx.restore();
}

/* draw moving platform entity (if any) */
function drawMovingPlatform(e){
  ctx.fillStyle = '#9ecbff';
  roundRect(ctx, e.x+4, e.y+4, e.w-8, e.h-8, 6, true, false);
}

/* draw particles */
function drawParticles(){
  for (const p of state.particles){
    ctx.globalAlpha = clamp(p.life,0,1);
    if (p.kind === 'coin') ctx.fillStyle = CONFIG.colors.coin;
    else if (p.kind === 'jump') ctx.fillStyle = '#b3ffb3';
    else if (p.kind === 'hit') ctx.fillStyle = '#ff9b9b';
    else if (p.kind === 'enemyDeath') ctx.fillStyle = '#ffaaff';
    else ctx.fillStyle = '#fff';
    ctx.fillRect(p.x - state.cameraX, p.y - state.cameraY, p.size, p.size);
    ctx.globalAlpha = 1;
  }
}

/* helpers for rounded rect */
function roundRect(ctx, x, y, w, h, r, fill=false, stroke=true){
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.arcTo(x+w, y, x+w, y+h, r);
  ctx.arcTo(x+w, y+h, x, y+h, r);
  ctx.arcTo(x, y+h, x, y, r);
  ctx.arcTo(x, y, x+w, y, r);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}
function drawRoundedRect(cx, x, y, w, h, r){
  ctx.beginPath();
  ctx.roundRect = ctx.roundRect || roundRect;
}

/* =========================
   Setup & start
   ========================= */
function startGame(){
  initLevel(0);
  lastTime = now();
  requestAnimationFrame(gameLoop);
}

// small bootstrap: ensure user gesture for audio context
document.addEventListener('click', () => {
  if (audioCtx.state === 'suspended') audioCtx.resume();
}, { once: true });

// initialize canvas style
ctx.imageSmoothingEnabled = false;
ctx.textBaseline = 'top';
ctx.font = '14px sans-serif';
ctx.fillStyle = '#fff';

// start
startGame();
