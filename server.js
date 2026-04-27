const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000
});

app.use(express.static('public'));

// Game Configuration
const CONFIG = {
  MAP_SIZE: 3000,
  INITIAL_PLAYER_RADIUS: 20,
  MIN_ZOOM: 0.3,
  MAX_ZOOM: 1.5,
  BASE_SPEED: 3,
  FOOD_COUNT: 500,
  BOT_COUNT: 8,
  CENTER_ZONE_RADIUS: 400,
  COLORS: ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'],
  SKINS: ['circle', 'square', 'triangle', 'star'],
  FOOD_TIERS: [
    { radius: 5, value: 1, color: '#a8e6cf', weight: 0.5 },
    { radius: 8, value: 3, color: '#dcedc1', weight: 0.25 },
    { radius: 12, value: 8, color: '#ffd3b6', weight: 0.12 },
    { radius: 18, value: 20, color: '#ffaaa5', weight: 0.08 },
    { radius: 25, value: 50, color: '#ff8b94', weight: 0.05 }
  ],
  POWERUPS: [
    { type: 'speed', duration: 5000, color: '#00ffff', radius: 15, effect: 'Speed Boost' },
    { type: 'shield', duration: 4000, color: '#ffff00', radius: 15, effect: 'Shield' },
    { type: 'magnet', duration: 6000, color: '#ff00ff', radius: 15, effect: 'Magnet' },
    { type: 'doublePoints', duration: 8000, color: '#ff6600', radius: 15, effect: '2x Points' }
  ],
  DASH_COOLDOWN: 3000,
  DASH_DURATION: 300,
  DASH_MULTIPLIER: 3,
  COMBO_WINDOW: 2000,
  MAX_COMBO: 20
};

// Game State
let players = {};
let foods = [];
let bots = {};
let leaderboard = [];
let powerups = [];

// Helper Functions
function randomRange(min, max) {
  return Math.random() * (max - min) + min;
}

function randomColor() {
  return CONFIG.COLORS[Math.floor(Math.random() * CONFIG.COLORS.length)];
}

function getDistance(x1, y1, x2, y2) {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

function checkCollision(x1, y1, r1, x2, y2, r2) {
  return getDistance(x1, y1, x2, y2) < r1 + r2;
}

function getRandomPosition(avoidCenter = false) {
  let x, y;
  let attempts = 0;
  const maxAttempts = 10;
  
  do {
    x = randomRange(CONFIG.INITIAL_PLAYER_RADIUS, CONFIG.MAP_SIZE - CONFIG.INITIAL_PLAYER_RADIUS);
    y = randomRange(CONFIG.INITIAL_PLAYER_RADIUS, CONFIG.MAP_SIZE - CONFIG.INITIAL_PLAYER_RADIUS);
    
    if (avoidCenter) {
      const distFromCenter = getDistance(x, y, CONFIG.MAP_SIZE / 2, CONFIG.MAP_SIZE / 2);
      if (distFromCenter < CONFIG.CENTER_ZONE_RADIUS + 200) {
        attempts++;
        if (attempts >= maxAttempts) break;
        continue;
      }
    }
    break;
  } while (true);
  
  return { x, y };
}

function spawnFood(tierOverride = null) {
  let tier;
  if (tierOverride !== null) {
    tier = CONFIG.FOOD_TIERS[tierOverride];
  } else {
    const rand = Math.random();
    let cumulative = 0;
    for (const t of CONFIG.FOOD_TIERS) {
      cumulative += t.weight;
      if (rand <= cumulative) {
        tier = t;
        break;
      }
    }
    if (!tier) tier = CONFIG.FOOD_TIERS[0];
  }

  const pos = getRandomPosition();
  
  // Higher chance for rare food in center zone
  if (!tierOverride && getDistance(pos.x, pos.y, CONFIG.MAP_SIZE / 2, CONFIG.MAP_SIZE / 2) < CONFIG.CENTER_ZONE_RADIUS) {
    const centerRand = Math.random();
    if (centerRand < 0.3) tier = CONFIG.FOOD_TIERS[3];
    else if (centerRand < 0.5) tier = CONFIG.FOOD_TIERS[2];
  }

  foods.push({
    id: uuidv4(),
    x: pos.x,
    y: pos.y,
    radius: tier.radius,
    value: tier.value,
    color: tier.color,
    tier: CONFIG.FOOD_TIERS.indexOf(tier)
  });
}

function spawnPowerup() {
  const powerupConfig = CONFIG.POWERUPS[Math.floor(Math.random() * CONFIG.POWERUPS.length)];
  const pos = getRandomPosition();
  
  powerups.push({
    id: uuidv4(),
    x: pos.x,
    y: pos.y,
    ...powerupConfig,
    spawnTime: Date.now()
  });
}

function createBot() {
  const id = `bot_${uuidv4()}`;
  const pos = getRandomPosition(true);
  const bot = {
    id,
    name: `Bot ${Math.floor(Math.random() * 1000)}`,
    x: pos.x,
    y: pos.y,
    radius: CONFIG.INITIAL_PLAYER_RADIUS,
    color: randomColor(),
    skin: CONFIG.SKINS[Math.floor(Math.random() * CONFIG.SKINS.length)],
    score: 0,
    targetX: pos.x,
    targetY: pos.y,
    changeTargetTime: Date.now() + randomRange(1000, 3000),
    isBot: true,
    velocity: { x: 0, y: 0 },
    dashCooldown: 0,
    lastDashTime: 0,
    powerups: {},
    combo: 0,
    lastKillTime: 0
  };
  bots[id] = bot;
  return bot;
}

function updateBot(bot) {
  // Simple AI: wander and seek food
  if (Date.now() > bot.changeTargetTime) {
    // Find nearest food or flee from larger players
    let nearestFood = null;
    let minDist = Infinity;
    
    for (const food of foods) {
      const dist = getDistance(bot.x, bot.y, food.x, food.y);
      if (dist < minDist && dist < 300) {
        minDist = dist;
        nearestFood = food;
      }
    }

    // Check for threats
    let threat = null;
    for (const pid in players) {
      const p = players[pid];
      if (p.radius > bot.radius * 1.2 && getDistance(bot.x, bot.y, p.x, p.y) < 400) {
        threat = p;
        break;
      }
    }

    if (threat) {
      // Flee
      const angle = Math.atan2(bot.y - threat.y, bot.x - threat.x);
      bot.targetX = bot.x + Math.cos(angle) * 500;
      bot.targetY = bot.y + Math.sin(angle) * 500;
    } else if (nearestFood) {
      bot.targetX = nearestFood.x;
      bot.targetY = nearestFood.y;
    } else {
      bot.targetX = randomRange(100, CONFIG.MAP_SIZE - 100);
      bot.targetY = randomRange(100, CONFIG.MAP_SIZE - 100);
    }
    
    bot.changeTargetTime = Date.now() + randomRange(500, 2000);
  }

  // Move towards target
  const dx = bot.targetX - bot.x;
  const dy = bot.targetY - bot.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  
  if (dist > 0) {
    const speed = CONFIG.BASE_SPEED * Math.pow(bot.radius, -0.1) * 2;
    bot.velocity.x = (dx / dist) * speed;
    bot.velocity.y = (dy / dist) * speed;
    bot.x += bot.velocity.x;
    bot.y += bot.velocity.y;
  }

  // Keep in bounds
  bot.x = Math.max(bot.radius, Math.min(CONFIG.MAP_SIZE - bot.radius, bot.x));
  bot.y = Math.max(bot.radius, Math.min(CONFIG.MAP_SIZE - bot.radius, bot.y));
}

function calculateZoom(radius) {
  const baseZoom = 1;
  const zoomFactor = Math.pow(CONFIG.INITIAL_PLAYER_RADIUS / radius, 0.4);
  return Math.max(CONFIG.MIN_ZOOM, Math.min(CONFIG.MAX_ZOOM, baseZoom * zoomFactor));
}

function updateLeaderboard() {
  const allPlayers = [...Object.values(players), ...Object.values(bots)];
  leaderboard = allPlayers
    .sort((a, b) => b.score - a.score || b.radius - a.radius)
    .slice(0, 10)
    .map((p, index) => ({
      id: p.id,
      name: p.name,
      score: Math.floor(p.score),
      rank: index + 1,
      isBot: p.isBot || false
    }));
}

// Initialize game
for (let i = 0; i < CONFIG.FOOD_COUNT; i++) {
  spawnFood();
}

for (let i = 0; i < CONFIG.BOT_COUNT; i++) {
  createBot();
}

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  socket.on('join', (data) => {
    const pos = getRandomPosition(true);
    players[socket.id] = {
      id: socket.id,
      name: data.name || 'Player',
      x: pos.x,
      y: pos.y,
      radius: CONFIG.INITIAL_PLAYER_RADIUS,
      color: data.color || randomColor(),
      skin: data.skin || 'circle',
      score: 0,
      input: { x: 0, y: 0, boost: false },
      velocity: { x: 0, y: 0 },
      crown: false,
      lastUpdate: Date.now(),
      dashCooldown: 0,
      lastDashTime: 0,
      isDashing: false,
      powerups: {},
      combo: 0,
      lastKillTime: 0,
      kills: 0,
      deaths: 0
    };

    socket.emit('gameInit', {
      playerId: socket.id,
      mapSize: CONFIG.MAP_SIZE,
      colors: CONFIG.COLORS,
      skins: CONFIG.SKINS,
      config: {
        dashCooldown: CONFIG.DASH_COOLDOWN,
        dashDuration: CONFIG.DASH_DURATION
      }
    });
  });

  socket.on('input', (data) => {
    if (players[socket.id]) {
      players[socket.id].input = {
        x: data.x !== undefined ? data.x : players[socket.id].input.x,
        y: data.y !== undefined ? data.y : players[socket.id].input.y,
        boost: data.boost !== undefined ? data.boost : players[socket.id].input.boost
      };
    }
  });

  socket.on('boost', (isBoosting) => {
    if (players[socket.id]) {
      players[socket.id].input.boost = isBoosting;
    }
  });

  socket.on('dash', () => {
    const player = players[socket.id];
    if (player && player.dashCooldown === 0) {
      player.isDashing = true;
      player.lastDashTime = Date.now();
      player.dashCooldown = CONFIG.DASH_COOLDOWN;
      
      // Send dash confirmation with cooldown info
      socket.emit('dashUsed', {
        cooldown: CONFIG.DASH_COOLDOWN,
        duration: CONFIG.DASH_DURATION
      });
    }
  });

  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    delete players[socket.id];
  });
});

// Game Loop
let lastTime = Date.now();
const TICK_RATE = 1000 / 60; // 60 FPS

function gameLoop() {
  const now = Date.now();
  const delta = (now - lastTime) / 1000;
  lastTime = now;

  // Spawn powerups periodically
  if (powerups.length < 5 && Math.random() < 0.01) {
    spawnPowerup();
  }
  
  // Remove expired powerups
  for (let i = powerups.length - 1; i >= 0; i--) {
    if (now - powerups[i].spawnTime > 30000) {
      powerups.splice(i, 1);
    }
  }

  // Update players
  for (const pid in players) {
    const player = players[pid];
    
    // Handle dash mechanics
    if (player.isDashing && now - player.lastDashTime > CONFIG.DASH_DURATION) {
      player.isDashing = false;
    }
    
    // Update dash cooldown
    if (player.dashCooldown > 0 && now - player.lastDashTime > CONFIG.DASH_COOLDOWN) {
      player.dashCooldown = 0;
    }
    
    // Expire powerups
    for (const powerupType in player.powerups) {
      if (now - player.powerups[powerupType].endTime > 0) {
        delete player.powerups[powerupType];
      }
    }
    
    // Update combo decay
    if (player.combo > 0 && now - player.lastKillTime > CONFIG.COMBO_WINDOW) {
      player.combo = Math.max(0, player.combo - 1);
    }
    
    // Handle input
    let moveX = player.input.x;
    let moveY = player.input.y;
    
    // Normalize if using keyboard
    if (moveX !== 0 || moveY !== 0) {
      const len = Math.sqrt(moveX * moveX + moveY * moveY);
      if (len > 1) {
        moveX /= len;
        moveY /= len;
      }
    }

    // Calculate speed based on size with modifiers
    let speed = CONFIG.BASE_SPEED * Math.pow(player.radius, -0.1);
    
    // Apply boost
    if (player.input.boost) speed *= 1.5;
    
    // Apply dash
    if (player.isDashing) speed *= CONFIG.DASH_MULTIPLIER;
    
    // Apply speed powerup
    if (player.powerups.speed) speed *= 1.5;
    
    player.velocity.x = moveX * speed;
    player.velocity.y = moveY * speed;
    
    player.x += player.velocity.x;
    player.y += player.velocity.y;

    // Keep in bounds
    player.x = Math.max(player.radius, Math.min(CONFIG.MAP_SIZE - player.radius, player.x));
    player.y = Math.max(player.radius, Math.min(CONFIG.MAP_SIZE - player.radius, player.y));

    player.lastUpdate = now;
  }

  // Update bots
  for (const bid in bots) {
    updateBot(bots[bid]);
  }

  // Collision detection - Players with Food (optimized with spatial filtering)
  const visibleFoods = foods.filter(f => {
    // Only check foods that might be near players
    for (const pid in players) {
      const p = players[pid];
      if (getDistance(p.x, p.y, f.x, f.y) < 500) return true;
    }
    return false;
  });
  
  for (const pid in players) {
    const player = players[pid];
    
    // Check food collision with magnet effect
    let magnetRange = player.radius;
    if (player.powerups.magnet) magnetRange *= 3;
    
    for (let i = foods.length - 1; i >= 0; i--) {
      const food = foods[i];
      const dist = getDistance(player.x, player.y, food.x, food.y);
      
      // Skip distant foods for performance
      if (dist > 500 && !player.powerups.magnet) continue;
      
      // Magnet effect - attract food
      if (player.powerups.magnet && dist < magnetRange && dist > player.radius + food.radius) {
        const angle = Math.atan2(player.y - food.y, player.x - food.x);
        food.x += Math.cos(angle) * 5;
        food.y += Math.sin(angle) * 5;
      }
      
      if (checkCollision(player.x, player.y, player.radius, food.x, food.y, food.radius)) {
        let value = food.value;
        
        // Double points powerup
        if (player.powerups.doublePoints) value *= 2;
        
        // Combo bonus
        if (player.combo > 1) value *= (1 + player.combo * 0.1);
        
        player.score += value;
        player.radius = CONFIG.INITIAL_PLAYER_RADIUS * Math.pow(1 + player.score / 100, 0.3);
        foods.splice(i, 1);
        spawnFood();
        
        // Small chance to spawn extra food
        if (Math.random() < 0.1) spawnFood();
      }
    }
    
    // Check powerup collision
    for (let i = powerups.length - 1; i >= 0; i--) {
      const powerup = powerups[i];
      if (checkCollision(player.x, player.y, player.radius, powerup.x, powerup.y, powerup.radius)) {
        // Apply powerup
        player.powerups[powerup.type] = {
          endTime: Date.now() + powerup.duration,
          type: powerup.type
        };
        
        // Send notification to player
        const playerSocket = io.sockets.sockets.get(pid);
        if (playerSocket) {
          playerSocket.emit('powerupCollected', {
            type: powerup.type,
            effect: powerup.effect,
            duration: powerup.duration
          });
        }
        
        powerups.splice(i, 1);
        setTimeout(() => spawnPowerup(), 10000);
      }
    }
  }

  // Bots eating food
  for (const bid in bots) {
    const bot = bots[bid];
    for (let i = foods.length - 1; i >= 0; i--) {
      const food = foods[i];
      if (checkCollision(bot.x, bot.y, bot.radius, food.x, food.y, food.radius)) {
        bot.score += food.value;
        bot.radius = CONFIG.INITIAL_PLAYER_RADIUS * Math.pow(1 + bot.score / 100, 0.3);
        foods.splice(i, 1);
        spawnFood();
      }
    }
    
    // Bot powerup collection
    for (let i = powerups.length - 1; i >= 0; i--) {
      const powerup = powerups[i];
      if (checkCollision(bot.x, bot.y, bot.radius, powerup.x, powerup.y, powerup.radius)) {
        bot.powerups[powerup.type] = {
          endTime: Date.now() + powerup.duration,
          type: powerup.type
        };
        powerups.splice(i, 1);
      }
    }
  }

  // Player vs Player collision (optimized with distance check first)
  const allEntities = [...Object.values(players), ...Object.values(bots)];
  
  // Create spatial hash for optimization
  const CELL_SIZE = 200;
  const spatialHash = new Map();
  
  // Populate spatial hash
  for (const entity of allEntities) {
    const cellX = Math.floor(entity.x / CELL_SIZE);
    const cellY = Math.floor(entity.y / CELL_SIZE);
    const key = `${cellX},${cellY}`;
    
    if (!spatialHash.has(key)) {
      spatialHash.set(key, []);
    }
    spatialHash.get(key).push(entity);
  }
  
  // Only check collisions between entities in nearby cells
  const checkedPairs = new Set();
  
  for (const [key, entities] of spatialHash) {
    const [cellX, cellY] = key.split(',').map(Number);
    
    // Check adjacent cells too
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const neighborKey = `${cellX + dx},${cellY + dy}`;
        const neighbors = spatialHash.get(neighborKey);
        
        if (!neighbors) continue;
        
        for (let i = 0; i < entities.length; i++) {
          for (let j = 0; j < neighbors.length; j++) {
            const e1 = entities[i];
            const e2 = neighbors[j];
            
            // Skip if same entity or both bots
            if (e1.id === e2.id || (e1.isBot && e2.isBot)) continue;
            
            // Create unique pair key to avoid duplicate checks
            const pairKey = e1.id < e2.id ? `${e1.id}-${e2.id}` : `${e2.id}-${e1.id}`;
            if (checkedPairs.has(pairKey)) continue;
            checkedPairs.add(pairKey);
            
            const dist = getDistance(e1.x, e1.y, e2.x, e2.y);
            const minEatRadius = Math.max(e1.radius, e2.radius) * 1.2;
            
            if (dist < minEatRadius) {
              // Check shield powerup - cannot be eaten while shielded
              if (e2.powerups.shield && e1.radius > e2.radius * 1.1) {
                // Shield blocks the attack, push back attacker
                const angle = Math.atan2(e2.y - e1.y, e2.x - e1.x);
                e1.x += Math.cos(angle) * 20;
                e1.y += Math.sin(angle) * 20;
                continue;
              }
              if (e1.powerups.shield && e2.radius > e1.radius * 1.1) {
                const angle = Math.atan2(e1.y - e2.y, e1.x - e2.x);
                e2.x += Math.cos(angle) * 20;
                e2.y += Math.sin(angle) * 20;
                continue;
              }
              
              if (e1.radius > e2.radius * 1.1) {
                // e1 eats e2
                e1.score += e2.score * 0.5 + e2.radius * 2;
                e1.radius = CONFIG.INITIAL_PLAYER_RADIUS * Math.pow(1 + e1.score / 100, 0.3);
                
                // Track kills and combo
                if (!e1.isBot) {
                  e1.kills++;
                  e1.lastKillTime = Date.now();
                  e1.combo = Math.min(CONFIG.MAX_COMBO, e1.combo + 1);
                  
                  // Send kill notification
                  const e1Socket = io.sockets.sockets.get(e1.id);
                  if (e1Socket) {
                    e1Socket.emit('kill', {
                      victim: e2.name,
                      combo: e1.combo,
                      isStreak: e1.combo >= 3
                    });
                  }
                }
                
                if (e2.isBot) {
                  delete bots[e2.id];
                  setTimeout(createBot, 3000);
                } else {
                  e2.deaths++;
                  const e2Socket = io.sockets.sockets.get(e2.id);
                  if (e2Socket) {
                    e2Socket.emit('death', { 
                      killer: e1.name,
                      kills: e1.kills,
                      combo: e1.combo
                    });
                    delete players[e2.id];
                  }
                }
              } else if (e2.radius > e1.radius * 1.1) {
                // e2 eats e1
                e2.score += e1.score * 0.5 + e1.radius * 2;
                e2.radius = CONFIG.INITIAL_PLAYER_RADIUS * Math.pow(1 + e2.score / 100, 0.3);
                
                // Track kills and combo
                if (!e2.isBot) {
                  e2.kills++;
                  e2.lastKillTime = Date.now();
                  e2.combo = Math.min(CONFIG.MAX_COMBO, e2.combo + 1);
                  
                  // Send kill notification
                  const e2Socket = io.sockets.sockets.get(e2.id);
                  if (e2Socket) {
                    e2Socket.emit('kill', {
                      victim: e1.name,
                      combo: e2.combo,
                      isStreak: e2.combo >= 3
                    });
                  }
                }
                
                if (e1.isBot) {
                  delete bots[e1.id];
                  setTimeout(createBot, 3000);
                } else {
                  e1.deaths++;
                  const e1Socket = io.sockets.sockets.get(e1.id);
                  if (e1Socket) {
                    e1Socket.emit('death', { 
                      killer: e2.name,
                      kills: e2.kills,
                      combo: e2.combo
                    });
                    delete players[e1.id];
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  // Update crowns
  updateLeaderboard();
  const topPlayerId = leaderboard.length > 0 ? leaderboard[0].id : null;
  
  for (const pid in players) {
    players[pid].crown = (pid === topPlayerId);
  }

  // Send game state to all players
  const gameState = {
    players: [
      ...Object.values(players).map(p => ({
        id: p.id,
        x: p.x,
        y: p.y,
        radius: p.radius,
        color: p.color,
        skin: p.skin,
        name: p.name,
        score: Math.floor(p.score),
        crown: p.crown,
        powerups: Object.keys(p.powerups),
        combo: p.combo,
        dashCooldown: p.dashCooldown
      })),
      ...Object.values(bots).map(b => ({
        id: b.id,
        x: b.x,
        y: b.y,
        radius: b.radius,
        color: b.color,
        skin: b.skin,
        name: b.name,
        score: Math.floor(b.score),
        crown: b.crown,
        powerups: Object.keys(b.powerups),
        combo: b.combo,
        dashCooldown: b.dashCooldown,
        isBot: true
      }))
    ],
    foods: foods.slice(0, 100),
    powerups: powerups.map(p => ({
      id: p.id,
      x: p.x,
      y: p.y,
      type: p.type,
      color: p.color,
      radius: p.radius
    })),
    leaderboard,
    centerZone: {
      x: CONFIG.MAP_SIZE / 2,
      y: CONFIG.MAP_SIZE / 2,
      radius: CONFIG.CENTER_ZONE_RADIUS
    }
  };

  io.emit('gameState', gameState);

  // Respawn bots if needed
  const botCount = Object.keys(bots).length;
  if (botCount < CONFIG.BOT_COUNT) {
    createBot();
  }

  setTimeout(gameLoop, TICK_RATE);
}

// Start game loop
gameLoop();

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`run.io server running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT} in your browser`);
});
