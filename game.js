// =====================
// Retro Platformer Game
// =====================

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// ========== GAME CONSTANTS ==========
const GRAVITY = 0.7;
const JUMP_STRENGTH = -14;
const MOVE_SPEED = 5;
const WALL_JUMP_FORCE = 12;

// ========== PLAYER ==========
const player = {
  x: 100,
  y: 400,
  width: 32,
  height: 32,
  vx: 0,
  vy: 0,
  grounded: false,
  canWallJump: false,
  facing: 1,
  color: "#FFA500",
  coins: 0
};

// ========== INPUT ==========
const keys = {};
window.addEventListener("keydown", e => keys[e.code] = true);
window.addEventListener("keyup", e => keys[e.code] = false);

// ========== LEVEL STRUCTURE ==========
const levels = [
  {
    platforms: [
      {x: 0, y: 500, w: 2000, h: 40},
      {x: 300, y: 450, w: 100, h: 20},
      {x: 600, y: 400, w: 100, h: 20},
      {x: 900, y: 350, w: 100, h: 20},
      {x: 1200, y: 300, w: 100, h: 20},
      {x: 1500, y: 250, w: 100, h: 20},
    ],
    movingPlatforms: [
      {x: 1700, y: 400, w: 100, h: 20, range: 200, speed: 2, dir: 1}
    ],
    crumblingPlatforms: [
      {x: 500, y: 480, w: 80, h: 20, timer: 0, falling: false}
    ],
    spikes: [
      {x: 700, y: 480, w: 40, h: 20},
      {x: 1000, y: 480, w: 40, h: 20}
    ],
    enemies: [
      {x: 1300, y: 468, w: 32, h: 32, dir: 1, speed: 2, range: 100, startX: 1300}
    ],
    coins: [
      {x: 350, y: 410, collected: false},
      {x: 650, y: 360, collected: false},
      {x: 1550, y: 200, collected: false}
    ],
    goal: {x: 1850, y: 200, w: 40, h: 40}
  },
  {
    platforms: [
      {x: 0, y: 500, w: 2500, h: 40},
      {x: 400, y: 440, w: 150, h: 20},
      {x: 700, y: 380, w: 150, h: 20},
      {x: 1000, y: 320, w: 150, h: 20},
      {x: 1300, y: 260, w: 150, h: 20},
      {x: 1600, y: 200, w: 150, h: 20},
      {x: 1900, y: 140, w: 150, h: 20}
    ],
    movingPlatforms: [
      {x: 2200, y: 400, w: 120, h: 20, range: 150, speed: 2.5, dir: 1}
    ],
    crumblingPlatforms: [
      {x: 800, y: 480, w: 100, h: 20, timer: 0, falling: false}
    ],
    spikes: [
      {x: 600, y: 480, w: 40, h: 20},
      {x: 900, y: 480, w: 40, h: 20},
      {x: 1200, y: 480, w: 40, h: 20},
      {x: 1500, y: 480, w: 40, h: 20}
    ],
    enemies: [
      {x: 1000, y: 468, w: 32, h: 32, dir: -1, speed: 2, range: 200, startX: 1000}
    ],
    coins: [
      {x: 450, y: 400, collected: false},
      {x: 1250, y: 220, collected: false},
      {x: 1850, y: 100, collected: false}
    ],
    goal: {x: 2100, y: 100, w: 40, h: 40}
  }
];

let currentLevel = 0;

// ========== CAMERA ==========
let cameraX = 0;

// ========== GAME LOOP ==========
function update() {
  const level = levels[currentLevel];

  // Horizontal movement
  player.vx = 0;
  if (keys["ArrowLeft"] || keys["KeyA"]) {
    player.vx = -MOVE_SPEED;
    player.facing = -1;
  }
  if (keys["ArrowRight"] || keys["KeyD"]) {
    player.vx = MOVE_SPEED;
    player.facing = 1;
  }

  // Jump
  if ((keys["Space"] || keys["ArrowUp"] || keys["KeyW"]) && player.grounded) {
    player.vy = JUMP_STRENGTH;
    player.grounded = false;
  }

  // Wall jump
  if ((keys["Space"] || keys["ArrowUp"]) && player.canWallJump) {
    player.vy = -WALL_JUMP_FORCE;
    player.vx = -player.facing * MOVE_SPEED * 1.2;
    player.canWallJump = false;
  }

  // Gravity
  player.vy += GRAVITY;
  player.x += player.vx;
  player.y += player.vy;

  // Reset collision flags
  player.grounded = false;
  player.canWallJump = false;

  // Move platforms
  level.movingPlatforms.forEach(p => {
    p.x += p.speed * p.dir;
    if (Math.abs(p.x - (p.startX ??= p.x)) > p.range) p.dir *= -1;
  });

  // Handle crumbling platforms
  level.crumblingPlatforms.forEach(p => {
    if (p.falling) {
      p.y += 5;
    } else if (rectCollide(player, p)) {
      p.timer++;
      if (p.timer > 60) p.falling = true;
    }
  });

  // Platform collisions
  [...level.platforms, ...level.movingPlatforms, ...level.crumblingPlatforms].forEach(p => {
    if (rectCollide(player, p)) {
      if (player.vy > 0 && player.y + player.height - player.vy <= p.y) {
        player.y = p.y - player.height;
        player.vy = 0;
        player.grounded = true;
      } else if (player.vy < 0 && player.y >= p.y + p.h - 5) {
        player.y = p.y + p.h;
        player.vy = 0;
      } else if (player.x < p.x && player.vx > 0) {
        player.x = p.x - player.width;
        player.canWallJump = true;
      } else if (player.x > p.x && player.vx < 0) {
        player.x = p.x + p.w;
        player.canWallJump = true;
      }
    }
  });

  // Spikes
  level.spikes.forEach(s => {
    if (rectCollide(player, s)) resetLevel();
  });

  // Enemies
  level.enemies.forEach(e => {
    e.x += e.speed * e.dir;
    if (Math.abs(e.x - e.startX) > e.range) e.dir *= -1;
    if (rectCollide(player, e)) resetLevel();
  });

  // Coins
  level.coins.forEach(c => {
    if (!c.collected && Math.abs(player.x - c.x) < 20 && Math.abs(player.y - c.y) < 30) {
      c.collected = true;
      player.coins++;
    }
  });

  // Goal
  if (rectCollide(player, level.goal)) nextLevel();

  // Fall off map
  if (player.y > 800) resetLevel();

  // Camera
  cameraX = player.x - canvas.width / 2;
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(-cameraX, 0);

  const level = levels[currentLevel];

  drawRectArray(level.platforms, "#654321");
  drawRectArray(level.movingPlatforms, "#8B4513");
  drawRectArray(level.crumblingPlatforms, "#aa8844");
  drawRectArray(level.spikes, "red");
  drawEnemies(level.enemies);
  drawCoins(level.coins);
  drawGoal(level.goal);

  // Player
  ctx.fillStyle = player.color;
  ctx.fillRect(player.x, player.y, player.width, player.height);

  ctx.restore();

  // HUD
  ctx.fillStyle = "#000";
  ctx.font = "20px monospace";
  ctx.fillText(`Level: ${currentLevel + 1}`, 20, 30);
  ctx.fillText(`Coins: ${player.coins}`, 20, 60);
}

function drawRectArray(arr, color) {
  ctx.fillStyle = color;
  arr.forEach(p => ctx.fillRect(p.x, p.y, p.w, p.h));
}

function drawEnemies(enemies) {
  ctx.fillStyle = "#FF4444";
  enemies.forEach(e => ctx.fillRect(e.x, e.y, e.w, e.h));
}

function drawCoins(coins) {
  ctx.fillStyle = "gold";
  coins.forEach(c => {
    if (!c.collected) ctx.fillRect(c.x, c.y, 10, 10);
  });
}

function drawGoal(g) {
  ctx.fillStyle = "lime";
  ctx.fillRect(g.x, g.y, g.w, g.h);
}

// Utility collision
function rectCollide(a, b) {
  return a.x < b.x + b.w &&
         a.x + a.width > b.x &&
         a.y < b.y + b.h &&
         a.y + a.height > b.y;
}

// Reset & next level
function resetLevel() {
  const level = levels[currentLevel];
  player.x = 100;
  player.y = 400;
  player.vx = 0;
  player.vy = 0;
  level.crumblingPlatforms.forEach(p => { p.falling = false; p.timer = 0; });
}

function nextLevel() {
  currentLevel++;
  if (currentLevel >= levels.length) {
    alert(`🎉 You win! You collected ${player.coins} coins!`);
    currentLevel = 0;
    player.coins = 0;
  }
  resetLevel();
}

// Game loop
function gameLoop() {
  update();
  draw();
  requestAnimationFrame(gameLoop);
}
gameLoop();
