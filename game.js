/* Retro Platformer — full game
   - Paste into game.js
   - Designed for performance on Chromebooks
   - Procedural tile textures (no external images)
*/

/* ==========================
   CONFIG
   ========================== */
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');

const TILE = 32;                 // pixel tile size
const GRAV = 1200;               // px/s^2
const PLAYER_SPEED = 260;        // px/s
const JUMP_SPEED = 520;          // px/s initial
const MAX_FALL = 1100;
const DASH_SPEED = 480;
const DT_STEP = 1/60;
let WIDTH = canvas.width;
let HEIGHT = canvas.height;

/* HUD elements */
const levelText = document.getElementById('levelText');
const scoreText = document.getElementById('scoreText');
const coinsText = document.getElementById('coinsText');
const livesText = document.getElementById('livesText');

/* Touch controls */
const touchControls = document.getElementById('touch-controls');
const tLeft = document.getElementById('t-left');
const tRight = document.getElementById('t-right');
const tJump = document.getElementById('t-jump');
const tDash = document.getElementById('t-dash');

function showTouchIfNeeded(){
  const small = window.matchMedia && window.matchMedia('(max-width:820px)').matches;
  if(small) touchControls.classList.remove('hidden'); else touchControls.classList.add('hidden');
}
showTouchIfNeeded();
window.addEventListener('resize', showTouchIfNeeded);

/* ==========================
   AUDIO (tiny beeps)
   ========================== */
const AudioCtx = window.AudioContext || window.webkitAudioContext;
const audioCtx = new AudioCtx();
function beep(freq=440, t=0.06, type='sine', vol=0.05){
  if(audioCtx.state === 'suspended') return;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.value = vol;
  o.connect(g); g.connect(audioCtx.destination);
  o.start();
  o.stop(audioCtx.currentTime + t);
}

/* user gesture for audio */
document.addEventListener('click', ()=>{ if(audioCtx.state==='suspended') audioCtx.resume(); }, {once:true});

/* ==========================
   TEXTURE / TILE GENERATION
   Use offscreen canvases to create small pixel textures for tiles
   ========================== */
function makeTileTexture(type){
  const s = TILE;
  const oc = document.createElement('canvas');
  oc.width = s; oc.height = s;
  const octx = oc.getContext('2d');
  octx.imageSmoothingEnabled = false;

  // base
  if(type === 'dirt'){
    octx.fillStyle = '#8b5a2b';
    octx.fillRect(0,0,s,s);
    // darker specks
    for(let i=0;i<18;i++){
      octx.fillStyle = ['#7a4f25','#6f4620'][i%2];
      octx.fillRect(Math.random()*s|0, Math.random()*s|0, 2,2);
    }
  } else if(type === 'grass'){
    // top grass strip + dirt below
    octx.fillStyle = '#6fbf30';
    octx.fillRect(0,0,s,10);
    // blade pixels
    for(let x=0;x<s;x+=3){
      octx.fillStyle = ['#6fbf30','#5aa224'][Math.random()*2|0];
      octx.fillRect(x, 6 + (Math.random()*6|0), 1, 4);
    }
    // dirt under
    octx.fillStyle = '#8b5a2b';
    octx.fillRect(0,10,s,s-10);
  } else if(type === 'spike'){
    // transparent background; draw spikes bottom-up
    octx.clearRect(0,0,s,s);
    octx.fillStyle = '#c62828';
    for(let i=0;i< s; i+=8){
      octx.beginPath();
      octx.moveTo(i, s);
      octx.lineTo(i+4, s-12);
      octx.lineTo(i+8, s);
      octx.closePath();
      octx.fill();
    }
  } else if(type === 'coin'){
    octx.fillStyle = '#ffd64d';
    octx.beginPath();
    octx.arc(s/2, s/2, s*0.32, 0, Math.PI*2);
    octx.fill();
    octx.fillStyle = '#fffbdd';
    octx.fillRect(s/2 - 4, s/2 - 8, 2, 8);
  } else if(type === 'flag'){
    octx.fillStyle = '#3b7dd8';
    octx.fillRect(6,4,4,s-8); // pole
    // flag stripe
    octx.fillStyle = '#e23b3b';
    octx.beginPath();
    octx.moveTo(10,8);
    octx.lineTo(22,12);
    octx.lineTo(10,18);
    octx.closePath();
    octx.fill();
  } else {
    octx.fillStyle = '#000';
    octx.fillRect(0,0,s,s);
  }
  return oc;
}

const TEX = {
  dirt: makeTileTexture('dirt'),
  grass: makeTileTexture('grass'),
  spike: makeTileTexture('spike'),
  coin: makeTileTexture('coin'),
  flag: makeTileTexture('flag')
};

/* ==========================
   WORLD / LEVEL GENERATION
   We'll produce long, challenging levels programmatically so they're long & skill-based
   Tile grid: each tile is 32px. We'll store a tile map for solids and special objects
   ========================== */

class Level {
  constructor(wTiles, hTiles, seed=1){
    this.w = wTiles;
    this.h = hTiles;
    this.tiles = new Uint8Array(wTiles*hTiles); // 0 empty, 1 solid
    this.spikes = [];       // {x,y} in px
    this.coins = [];        // {x,y, collected}
    this.moving = [];       // moving platforms {x,y,w,h,rx,ry,period,phase}
    this.crumble = [];      // crumbling platforms {x,y,w,h, timer, falling}
    this.enemies = [];      // enemies {x,y,w,h,dir,range,speed}
    this.goal = null;       // goal {x,y,w,h}
    this.seed = seed;
  }

  setTile(tx,ty,val){ if(tx>=0 && tx<this.w && ty>=0 && ty<this.h) this.tiles[ty*this.w+tx]=val; }
  getTile(tx,ty){ if(tx<0||tx>=this.w||ty<0||ty>=this.h) return 0; return this.tiles[ty*this.w+tx]; }

  // build a long terrain with platforms, gaps, spikes and collectibles
  buildPattern(){
    // base ground row at h-2
    const groundY = this.h-2;
    for(let x=0;x<this.w;x++) this.setTile(x, groundY, 1);

    // shore up a few columns up (like ledges)
    const rng = (n,off=0)=> (Math.abs(Math.sin((this.seed+off)*123.456 + n*7.89))*10000|0) % n;

    // create series of platform clusters, gaps, spikes and coins
    let cursor = 4;
    while(cursor < this.w - 12){
      // decide a chunk type
      const chance = (cursor / this.w);
      // place platforms with increasing difficulty as we go
      const platLen = 3 + (cursor % 6);
      const platY = groundY - 2 - ((cursor/20|0) % 6); // varying heights
      for(let i=0;i<platLen;i++){
        this.setTile(cursor + i, platY, 1);
        // occasionally place a coin above
        if((cursor+i) % 5 === 2){
          this.coins.push({x:(cursor+i)*TILE + TILE/2 - 5, y:(platY-1)*TILE + TILE/2 - 6, collected:false});
        }
      }

      // sometimes moving platform
      if((cursor % 17) === 3){
        const px = cursor*TILE;
        const py = (platY-2)*TILE;
        this.moving.push({x:px, y:py, w: TILE*3, h: TILE/2, rx: 120 + (cursor % 3)*40, ry:0, period: 2.4 + (cursor%5)*0.2, phase: (cursor%7)*0.5});
      }

      // sometimes a crumble platform in gap
      if((cursor % 19) === 7){
        const cx = (cursor+5)*TILE;
        const cy = (groundY-3)*TILE;
        this.crumble.push({x:cx, y:cy, w: TILE*2, h:TILE/2, timer:0, falling:false});
      }

      // put spikes in gaps sometimes
      if((cursor % 11) === 5){
        const sx = (cursor+platLen+1)*TILE;
        const sy = (groundY)*TILE - TILE/2;
        this.spikes.push({x:sx, y:sy, w: TILE/1, h: TILE/2});
      }

      // spawn enemies occasionally
      if((cursor % 29) === 11){
        const ex = (cursor+2)*TILE;
        const ey = (groundY-1)*TILE - 28;
        this.enemies.push({x:ex, y:ey, w:28, h:28, dir: (cursor%2?1:-1), range: TILE*6 + (cursor%8)*TILE, speed: 60 + (cursor%3)*10, sx:ex});
      }

      // move cursor forward by a gap length
      const gap = 2 + ((cursor>>3) % 5);
      cursor += platLen + gap + (rng(3, cursor)%4);
    }

    // place a final goal flag near end
    const fx = (this.w - 6)*TILE;
    const fy = (this.h-5)*TILE - TILE;
    this.goal = {x: fx, y: fy, w: TILE*1.25, h: TILE*1.5};

    // sprinkle some coins near start & middle & end
    for(let i=2;i<8;i++){
      this.coins.push({x:(4+i*6)*TILE + 8, y:(groundY-3)*TILE, collected:false});
    }
    for(let i=0;i<12;i++){
      const px = Math.min(this.w-8, 16 + i*14);
      this.coins.push({x:px*TILE + 6, y:(groundY - (2 + (i%4)))*TILE, collected:false});
    }
  }
}

/* build 3 levels with increasing width/difficulty */
const LEVELS = [];
LEVELS.push((() => { const L = new Level(220, 17, 13); L.buildPattern(); return L; })());
LEVELS.push((() => { const L = new Level(300, 18, 37); L.buildPattern(); return L; })());
LEVELS.push((() => { const L = new Level(360, 19, 73); L.buildPattern(); return L; })());

/* ==========================
   GAME STATE
   ========================== */
let curLevelIndex = 0;
let cur = LEVELS[curLevelIndex];

const state = {
  player: {
    x: TILE*2,
    y: (cur.h-4)*TILE,
    w: 28, h: 36,
    vx:0, vy:0,
    facing:1,
    grounded:false,
    jumps:0,
    canWallJump:false,
    dashTimer:0,
    dashCooldown:0,
  },
  cameraX:0,
  score:0,
  coins:0,
  lives:3,
  particles: []
};

/* ==========================
   INPUT
   ========================== */
const input = {
  left:false, right:false, up:false, dash:false
};
window.addEventListener('keydown', (e)=>{
  if(e.code==='ArrowLeft' || e.code==='KeyA') input.left=true;
  if(e.code==='ArrowRight' || e.code==='KeyD') input.right=true;
  if(e.code==='ArrowUp' || e.code==='KeyW' || e.code==='Space') input.up=true;
  if(e.code==='ShiftLeft' || e.code==='KeyK') input.dash=true;
  if(e.code==='KeyR') respawnLevel();
});
window.addEventListener('keyup', (e)=>{
  if(e.code==='ArrowLeft' || e.code==='KeyA') input.left=false;
  if(e.code==='ArrowRight' || e.code==='KeyD') input.right=false;
  if(e.code==='ArrowUp' || e.code==='KeyW' || e.code==='Space') input.up=false;
  if(e.code==='ShiftLeft' || e.code==='KeyK') input.dash=false;
});

/* touch handlers */
tLeft.addEventListener('touchstart',e=>{ e.preventDefault(); input.left=true; });
tLeft.addEventListener('touchend',e=>{ e.preventDefault(); input.left=false; });
tRight.addEventListener('touchstart',e=>{ e.preventDefault(); input.right=true; });
tRight.addEventListener('touchend',e=>{ e.preventDefault(); input.right=false; });
tJump.addEventListener('touchstart',e=>{ e.preventDefault(); input.up=true; setTimeout(()=>input.up=false, 150); });
tDash.addEventListener('touchstart',e=>{ e.preventDefault(); input.dash=true; setTimeout(()=>input.dash=false, 120); });

/* ==========================
   COLLISION HELPERS
   ========================== */
function rectsOverlap(a,b){
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
function tileSolidAtPixel(px, py){
  const tx = Math.floor(px / TILE);
  const ty = Math.floor(py / TILE);
  return cur.getTile(tx, ty) === 1;
}
function getTileBox(tx, ty){ return {x: tx*TILE, y: ty*TILE, w:TILE, h:TILE}; }

/* ==========================
   ENTITIES UPDATE
   ========================== */
function updateEntities(dt){
  // moving platforms
  for(const m of cur.moving){
    // simple oscillation
    const t = performance.now()*0.001;
    const off = Math.sin((t + (m.phase||0)) * (Math.PI * 2 / m.period)) * (m.rx||m.ry||0);
    m._x = m.x + off;
    m._y = m.y; // only horizontal currently
  }
  // crumble platforms: if falling, drop
  for(const c of cur.crumble){
    if(c.falling){
      c.y += 240 * dt;
    }
  }
  // enemies: simple patrol
  for(const e of cur.enemies){
    e.x += (e.speed || 60) * (e.dir || 1) * dt;
    if(Math.abs(e.x - e.sx) > e.range) e.dir *= -1;
  }
}

/* ==========================
   PARTICLES (very simple)
   ========================== */
function spawnParticle(x,y,vx,vy,ttl=0.45,color='#fff'){
  state.particles.push({x,y,vx,vy,ttl,color});
}
function updateParticles(dt){
  for(let i=state.particles.length-1;i>=0;i--){
    const p = state.particles[i];
    p.x += p.vx*dt; p.y += p.vy*dt;
    p.vy += 600*dt; p.ttl -= dt;
    if(p.ttl <= 0) state.particles.splice(i,1);
  }
}

/* ==========================
   PLAYER PHYSICS & COLLISIONS
   ========================== */
function simulatePlayer(dt){
  const p = state.player;

  // horizontal control
  let targetVX = 0;
  if(input.left) { targetVX = -PLAYER_SPEED; p.facing = -1; }
  if(input.right){ targetVX = PLAYER_SPEED; p.facing = 1; }

  // dash
  if(input.dash && p.dashCooldown <= 0 && p.dashTimer <= 0){
    p.dashTimer = 0.12; p.dashCooldown = 0.6;
    p.vx = (p.facing) * DASH_SPEED;
    spawnParticle(p.x + p.w/2, p.y + p.h/2, p.vx*0.01, -40, 0.18, '#88f');
    beep(900, 0.06, 'square', 0.04);
  }

  // smooth vx toward target if not dashing
  if(p.dashTimer <= 0){
    p.vx = targetVX;
  } else {
    p.dashTimer -= dt;
    // allow slight gravity while dashing
    p.vy += GRAV * dt * 0.05;
  }

  // jumping
  if(input.up){
    if(p.grounded){
      p.vy = -JUMP_SPEED;
      p.grounded = false;
      p.jumps = 1;
      spawnParticle(p.x + p.w/2, p.y + p.h, (Math.random()-0.5)*120, -140, 0.3, '#ffd');
      beep(880, 0.06, 'sine', 0.06);
      input.up = false; // avoid repeated auto
    } else if(p.canWallJump){
      // wall jump — push away from wall
      p.vy = -JUMP_SPEED * 0.92;
      p.vx = -p.facing * (PLAYER_SPEED*1.1);
      p.canWallJump = false;
      spawnParticle(p.x + p.w/2, p.y + p.h/2, -p.vx*0.01, -80, 0.25, '#ffb');
      beep(1100, 0.06, 'square', 0.06);
    } else if((p.jumps||0) < 2){
      // double jump allowed (once)
      p.vy = -JUMP_SPEED * 0.9;
      p.jumps = 2;
      spawnParticle(p.x + p.w/2, p.y + p.h/2, (Math.random()-0.5)*100, -120, 0.25, '#bdf');
      beep(1100, 0.04, 'triangle', 0.04);
      input.up = false;
    }
  }

  // gravity
  p.vy += GRAV * dt;
  p.vy = Math.min(p.vy, MAX_FALL);

  // integrate
  let nx = p.x + p.vx * dt;
  let ny = p.y + p.vy * dt;

  // collision with solid tiles (simple pixel stepped approach checking corners)
  // We'll step Y separately then X to avoid tunneling for normal speeds
  // Vertical collision
  const stepY = ny - p.y;
  p.grounded = false; p.canWallJump = false;
  if(stepY !== 0){
    const sign = Math.sign(stepY);
    let moved = 0;
    while(Math.abs(moved) < Math.abs(stepY)){
      const step = Math.sign(stepY) * Math.min(Math.abs(stepY)-Math.abs(moved), 6); // step size 6 px
      p.y += step; moved += step;
      // check collision with solid tile set
      if(checkPlayerSolidCollision()){
        // revert step
        p.y -= step;
        p.vy = 0;
        if(sign > 0){
          p.grounded = true;
          p.jumps = 0;
        }
        break;
      }
    }
  }

  // Horizontal collision
  const stepX = nx - p.x;
  if(stepX !== 0){
    const sign = Math.sign(stepX);
    let moved = 0;
    while(Math.abs(moved) < Math.abs(stepX)){
      const step = Math.sign(stepX) * Math.min(Math.abs(stepX)-Math.abs(moved), 6);
      p.x += step; moved += step;
      if(checkPlayerSolidCollision()){
        p.x -= step;
        p.vx = 0;
        // touching wall: allow wall jump
        p.canWallJump = true;
        break;
      }
    }
  }

  // interactions with moving platforms (carry)
  for(const m of cur.moving){
    const box = {x:(m._x||m.x), y:m._y||m.y, w:m.w, h:m.h};
    if(rectsOverlap(p, box)){
      // if landing on top
      if(p.vy >= 0 && p.y + p.h - (m._y||m.y) <= 14){
        p.y = (m._y||m.y) - p.h;
        p.vy = 0;
        p.grounded = true;
        p.jumps = 0;
        // move with platform
        p.x += ((m._x||m.x) - m.x) || 0;
      }
    }
  }

  // crumble platforms: if standing, start timer then fall
  for(const c of cur.crumble){
    if(rectsOverlap(p, c) && p.y + p.h - c.y <= 14 && p.vy >= 0){
      c.timer = (c.timer||0) + 1;
      if(c.timer > 50 && !c.falling){
        c.falling = true;
        beep(180, 0.08, 'sine', 0.06);
      }
    } else {
      c.timer = 0;
    }
  }

  // collect coins
  for(const coin of cur.coins){
    if(!coin.collected && Math.hypot((p.x + p.w/2) - coin.x, (p.y + p.h/2) - coin.y) < 22){
      coin.collected = true;
      state.coins += 1;
      state.score += 10;
      spawnParticle(coin.x, coin.y, (Math.random()-0.5)*120, -120, 0.45, '#ffd700');
      beep(1200, 0.06, 'triangle', 0.06);
    }
  }

  // spikes
  for(const s of cur.spikes){
    const box = {x:s.x, y:s.y, w:s.w, h:s.h};
    if(rectsOverlap(p, box)){
      // death -> respawn
      damagePlayer();
    }
  }

  // enemies collision
  for(const e of cur.enemies){
    if(rectsOverlap(p, e)){
      // if downward stomp
      if(p.vy > 160 && (p.y + p.h - e.y) < 18){
        // kill enemy
        const idx = cur.enemies.indexOf(e);
        if(idx>=0) cur.enemies.splice(idx,1);
        state.score += 50;
        p.vy = -JUMP_SPEED * 0.6;
        spawnParticle(e.x + e.w/2, e.y + e.h/2, (Math.random()-0.5)*160, -120, 0.4, '#f8c');
        beep(600, 0.08, 'square', 0.06);
      } else {
        damagePlayer();
      }
    }
  }

  // check goal
  if(cur.goal && rectsOverlap(p, cur.goal)){
    levelClear();
  }

  // fall-off death
  if(p.y > cur.h * TILE + 200) damagePlayer();

  // cooldowns
  if(p.dashCooldown > 0) p.dashCooldown = Math.max(0, p.dashCooldown - dt);
}

/* check player against solid tiles -> used in stepping */
function checkPlayerSolidCollision(){
  const p = state.player;
  const corners = [
    {x: p.x + 2, y: p.y + 2},
    {x: p.x + p.w - 2, y: p.y + 2},
    {x: p.x + 2, y: p.y + p.h - 2},
    {x: p.x + p.w - 2, y: p.y + p.h - 2},
  ];
  for(const c of corners){
    const tx = Math.floor(c.x / TILE);
    const ty = Math.floor(c.y / TILE);
    if(cur.getTile(tx,ty) === 1) return true;
  }
  // also check moving platform tops for blocking horizontally (prevent getting stuck)
  return false;
}

/* ==========================
   PLAYER DAMAGE / RESPAWN
   ========================== */
let lastCheckpoint = {x: TILE*2, y: (cur.h-4)*TILE};
function damagePlayer(){
  state.lives -= 1;
  spawnParticle(state.player.x + 12, state.player.y + 12, (Math.random()-0.5)*200, -120, 0.6, '#f55');
  beep(160, 0.18, 'sine', 0.12);
  if(state.lives <= 0){
    // game over: reset everything
    state.lives = 3;
    state.score = 0;
    state.coins = 0;
    curLevelIndex = 0;
    cur = LEVELS[curLevelIndex];
  }
  // respawn at checkpoint
  state.player.x = lastCheckpoint.x;
  state.player.y = lastCheckpoint.y;
  state.player.vx = 0; state.player.vy = 0;
}

/* ==========================
   LEVEL PROGRESSION
   ========================== */
function levelClear(){
  state.score += 200;
  beep(700, 0.18, 'sine', 0.14);
  curLevelIndex++;
  if(curLevelIndex >= LEVELS.length){
    // win: restart at level 1
    alert(`YOU WIN! Score: ${state.score}, Coins: ${state.coins}`);
    curLevelIndex = 0;
    state.score = 0; state.coins = 0; state.lives = 3;
  }
  cur = LEVELS[curLevelIndex];
  // place player at start
  lastCheckpoint = {x: TILE*2, y: (cur.h-4)*TILE};
  state.player.x = lastCheckpoint.x;
  state.player.y = lastCheckpoint.y;
  state.player.vx = 0; state.player.vy = 0;
  // reset moving/crumble/enemy states for that level (rebuild to safe states)
  cur.enemies.forEach(e=> e.x = e.sx );
  cur.crumble.forEach(c=> { c.timer = 0; c.falling = false; });
  updateHUD();
}

/* respawn level without losing life */
function respawnLevel(){
  state.player.x = lastCheckpoint.x;
  state.player.y = lastCheckpoint.y;
  state.player.vx = 0; state.player.vy = 0;
}

/* ==========================
   HUD
   ========================== */
function updateHUD(){
  levelText.textContent = `Level ${curLevelIndex + 1}`;
  scoreText.textContent = `Score: ${state.score}`;
  coinsText.textContent = `Coins: ${state.coins}`;
  livesText.textContent = `Lives: ${state.lives}`;
}

/* ==========================
   RENDERING
   ========================== */
function draw(){
  // clear
  ctx.fillStyle = '#7ec0ee';
  ctx.fillRect(0,0,WIDTH,HEIGHT);

  // parallax sky (simple)
  ctx.fillStyle = '#9bd8ff';
  for(let i=0;i<3;i++){
    ctx.globalAlpha = 0.12 + i*0.08;
    ctx.fillRect(( -state.cameraX*0.05 + i*120) % WIDTH - 80, 30 + i*20, 260, 30);
  }
  ctx.globalAlpha = 1;

  // translate camera
  ctx.save();
  ctx.translate(-state.cameraX, 0);

  // draw tilemap: draw only visible tiles for performance
  const startTx = Math.max(0, Math.floor(state.cameraX / TILE) - 2);
  const endTx = Math.min(cur.w-1, Math.floor((state.cameraX + WIDTH)/TILE) + 2);
  for(let ty=0; ty<cur.h; ty++){
    for(let tx=startTx; tx<=endTx; tx++){
      if(cur.getTile(tx,ty) === 1){
        // draw dirt base + grass on top if top exposed
        const px = tx*TILE, py = ty*TILE;
        // draw grass if tile above empty
        if(cur.getTile(tx,ty-1) === 0 && ty < cur.h-1){
          ctx.drawImage(TEX.grass, px, py);
        } else {
          ctx.drawImage(TEX.dirt, px, py);
        }
      }
    }
  }

  // moving platforms
  for(const m of cur.moving){
    const mx = (m._x||m.x), my = (m._y||m.y);
    ctx.fillStyle = '#8b5a2b';
    ctx.fillRect(mx, my, m.w, m.h);
    // little top highlight
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(mx+2, my+2, m.w-4, 4);
  }

  // crumble platforms
  for(const c of cur.crumble){
    ctx.fillStyle = c.falling ? '#6b4a2b' : '#c08b4e';
    ctx.fillRect(c.x, c.y, c.w, c.h);
  }

  // spikes
  for(const s of cur.spikes){
    // use spike texture repeated
    const reps = Math.ceil(s.w / TILE);
    for(let i=0;i<reps;i++){
      ctx.drawImage(TEX.spike, s.x + i*TILE, s.y);
    }
  }

  // coins
  for(const coin of cur.coins){
    if(!coin.collected){
      ctx.drawImage(TEX.coin, Math.round(coin.x - 16), Math.round(coin.y - 16));
    }
  }

  // enemies
  for(const e of cur.enemies){
    ctx.fillStyle = '#c33';
    ctx.fillRect(e.x, e.y, e.w, e.h);
    // small eye
    ctx.fillStyle = '#fff'; ctx.fillRect(e.x + 6, e.y + 6, 6, 6);
  }

  // goal flag
  if(cur.goal){
    ctx.drawImage(TEX.flag, cur.goal.x, cur.goal.y, cur.goal.w, cur.goal.h);
    // pole
    ctx.fillStyle = '#3b3b3b';
    ctx.fillRect(cur.goal.x + 8, cur.goal.y, 4, cur.goal.h);
  }

  // player
  const pl = state.player;
  ctx.fillStyle = '#ff6b6b';
  ctx.fillRect(Math.round(pl.x), Math.round(pl.y), pl.w, pl.h);
  // eyes
  ctx.fillStyle = '#111'; ctx.fillRect(pl.x + (pl.facing>0? pl.w-10:6), pl.y + 8, 4, 4);

  // particles
  for(const part of state.particles){
    ctx.fillStyle = part.color;
    ctx.fillRect(part.x - 2, part.y - 2, 4, 4);
  }

  ctx.restore();

  // HUD overlay (already DOM-based but we keep textual in DOM)
  updateHUD();
}

/* ==========================
   GAME LOOP
   ========================== */
let last = performance.now();
function frame(now){
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;

  // small fixed-step integration to stabilize physics
  let acc = dt;
  while(acc > 0){
    const step = Math.min(DT_STEP, acc);
    updateEntities(step);
    simulatePlayer(step);
    updateParticles(step);
    acc -= step;
  }

  // camera smoothing
  const targetCam = state.player.x - WIDTH/2 + state.player.w/2;
  state.cameraX += (targetCam - state.cameraX) * Math.min(1, 6 * dt);
  // clamp camera to level bounds
  state.cameraX = Math.max(0, Math.min(state.cameraX, cur.w*TILE - WIDTH));

  draw();
  requestAnimationFrame(frame);
}

/* ==========================
   INIT / START
   ========================== */
function startGame(){
  cur = LEVELS[curLevelIndex];
  // initial player
  state.player.x = TILE*2; state.player.y = (cur.h-4)*TILE;
  lastCheckpoint = {x: state.player.x, y: state.player.y};
  // ensure some default values defined for moving platforms
  for(const m of cur.moving){ if(!m.period) m.period = 2; if(!m._x) m._x = m.x; if(!m._y) m._y = m.y; }
  requestAnimationFrame(frame);
}
startGame();

/* expose a small debug helper for console play */
window.__GAME = {state, LEVELS, respawnLevel, nextLevel: ()=> levelClear(), curLevelIndex};
