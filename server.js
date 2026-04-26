const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');

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
  FOOD_COUNT: 400,
  BOT_COUNT: 5,
  CENTER_ZONE_RADIUS: 400,
  COLORS: ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'],
  SKINS: ['circle', 'square', 'triangle', 'star'],
  FOOD_TIERS: [
    { radius: 5, value: 1, color: '#a8e6cf', weight: 0.6 },
    { radius: 8, value: 3, color: '#dcedc1', weight: 0.25 },
    { radius: 12, value: 8, color: '#ffd3b6', weight: 0.1 },
    { radius: 18, value: 20, color: '#ffaaa5', weight: 0.04 },
    { radius: 25, value: 50, color: '#ff8b94', weight: 0.01 }
  ]
};

// Game State
let players = {};
let foods = [];
let bots = {};
let leaderboard = [];

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
  do {
    x = randomRange(CONFIG.INITIAL_PLAYER_RADIUS, CONFIG.MAP_SIZE - CONFIG.INITIAL_PLAYER_RADIUS);
    y = randomRange(CONFIG.INITIAL_PLAYER_RADIUS, CONFIG.MAP_SIZE - CONFIG.INITIAL_PLAYER_RADIUS);
    if (avoidCenter) {
      const distFromCenter = getDistance(x, y, CONFIG.MAP_SIZE / 2, CONFIG.MAP_SIZE / 2);
      if (distFromCenter < CONFIG.CENTER_ZONE_RADIUS + 200) continue;
    }
    break;
  } while (false);
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
    velocity: { x: 0, y: 0 }
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
      lastUpdate: Date.now()
    };

    socket.emit('gameInit', {
      playerId: socket.id,
      mapSize: CONFIG.MAP_SIZE,
      colors: CONFIG.COLORS,
      skins: CONFIG.SKINS
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

  // Update players
  for (const pid in players) {
    const player = players[pid];
    
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

    // Calculate speed based on size
    const speed = CONFIG.BASE_SPEED * Math.pow(player.radius, -0.1) * (player.input.boost ? 1.5 : 1);
    
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

  // Collision detection - Players with Food
  for (const pid in players) {
    const player = players[pid];
    for (let i = foods.length - 1; i >= 0; i--) {
      const food = foods[i];
      if (checkCollision(player.x, player.y, player.radius, food.x, food.y, food.radius)) {
        player.score += food.value;
        player.radius = CONFIG.INITIAL_PLAYER_RADIUS * Math.pow(1 + player.score / 100, 0.3);
        foods.splice(i, 1);
        spawnFood();
        
        // Small chance to spawn extra food
        if (Math.random() < 0.1) spawnFood();
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
  }

  // Player vs Player collision
  const allEntities = [...Object.values(players), ...Object.values(bots)];
  
  for (let i = 0; i < allEntities.length; i++) {
    for (let j = i + 1; j < allEntities.length; j++) {
      const e1 = allEntities[i];
      const e2 = allEntities[j];
      
      // Skip if both are bots
      if (e1.isBot && e2.isBot) continue;
      
      const dist = getDistance(e1.x, e1.y, e2.x, e2.y);
      const minEatRadius = Math.max(e1.radius, e2.radius) * 1.2;
      
      if (dist < minEatRadius) {
        if (e1.radius > e2.radius * 1.1) {
          // e1 eats e2
          e1.score += e2.score * 0.5;
          e1.radius = CONFIG.INITIAL_PLAYER_RADIUS * Math.pow(1 + e1.score / 100, 0.3);
          
          if (e2.isBot) {
            delete bots[e2.id];
            setTimeout(createBot, 3000);
          } else {
            const e2Socket = io.sockets.sockets.get(e2.id);
            if (e2Socket) {
              e2Socket.emit('death', { killer: e1.name });
              delete players[e2.id];
            }
          }
        } else if (e2.radius > e1.radius * 1.1) {
          // e2 eats e1
          e2.score += e1.score * 0.5;
          e2.radius = CONFIG.INITIAL_PLAYER_RADIUS * Math.pow(1 + e2.score / 100, 0.3);
          
          if (e1.isBot) {
            delete bots[e1.id];
            setTimeout(createBot, 3000);
          } else {
            const e1Socket = io.sockets.sockets.get(e1.id);
            if (e1Socket) {
              e1Socket.emit('death', { killer: e2.name });
              delete players[e1.id];
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
    players: Object.values(players).map(p => ({
      id: p.id,
      x: p.x,
      y: p.y,
      radius: p.radius,
      color: p.color,
      skin: p.skin,
      name: p.name,
      score: Math.floor(p.score),
      crown: p.crown
    })),
    foods: foods.slice(0, 100), // Send only nearby foods for optimization
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
