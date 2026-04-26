// run.io - Client-side game logic
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const minimapCanvas = document.getElementById('minimap');
const minimapCtx = minimapCanvas.getContext('2d');

// UI Elements
const mainMenu = document.getElementById('mainMenu');
const hud = document.getElementById('hud');
const playerNameInput = document.getElementById('playerName');
const colorPicker = document.getElementById('colorPicker');
const shapePicker = document.getElementById('shapePicker');
const playBtn = document.getElementById('playBtn');
const leaderboardList = document.getElementById('leaderboardList');
const scoreEl = document.getElementById('score');
const massEl = document.getElementById('mass');
const dashCooldownEl = document.getElementById('dashCooldown');
const splitCooldownEl = document.getElementById('splitCooldown');
const mobileControls = document.getElementById('mobileControls');

// Game state
let socket;
let playerId = null;
let players = {};
let foods = [];
let particles = [];
let floatingTexts = [];
let myPlayer = null;
let camera = { x: 0, y: 0 };
let selectedColor = '#ff6b6b';
let selectedShape = 'circle';
let gameRunning = false;

// Colors and shapes
const colors = ['#ff6b6b', '#feca57', '#48dbfb', '#ff9ff3', '#54a0ff', '#5f27cd', '#00d2d3', '#1dd1a1', '#ff6348', '#c8d6e5'];
const shapes = ['circle', 'square', 'triangle', 'star'];

// Initialize color picker
colors.forEach((color, index) => {
    const colorOption = document.createElement('div');
    colorOption.className = 'color-option' + (index === 0 ? ' selected' : '');
    colorOption.style.backgroundColor = color;
    colorOption.addEventListener('click', () => {
        document.querySelectorAll('.color-option').forEach(el => el.classList.remove('selected'));
        colorOption.classList.add('selected');
        selectedColor = color;
    });
    colorPicker.appendChild(colorOption);
});

// Initialize shape picker
shapes.forEach((shape, index) => {
    const shapeOption = document.createElement('div');
    shapeOption.className = 'shape-option' + (index === 0 ? ' selected' : '');
    const preview = document.createElement('div');
    preview.className = 'shape-preview';
    preview.style.backgroundColor = '#fff';
    
    if (shape === 'circle') {
        preview.style.borderRadius = '50%';
    } else if (shape === 'square') {
        preview.style.borderRadius = '0';
    } else if (shape === 'triangle') {
        preview.style.width = '0';
        preview.style.height = '0';
        preview.style.backgroundColor = 'transparent';
        preview.style.borderLeft = '10px solid transparent';
        preview.style.borderRight = '10px solid transparent';
        preview.style.borderBottom = '20px solid #fff';
    } else if (shape === 'star') {
        preview.style.clipPath = 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)';
        preview.style.backgroundColor = '#fff';
        preview.style.width = '20px';
        preview.style.height = '20px';
    }
    
    shapeOption.appendChild(preview);
    shapeOption.addEventListener('click', () => {
        document.querySelectorAll('.shape-option').forEach(el => el.classList.remove('selected'));
        shapeOption.classList.add('selected');
        selectedShape = shape;
    });
    shapePicker.appendChild(shapeOption);
});

// Resize canvas
function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// Connect to server
socket = io();

socket.on('connect', () => {
    console.log('Connected to server');
});

socket.on('playerId', (id) => {
    playerId = id;
});

socket.on('gameState', (state) => {
    players = state.players;
    foods = state.foods;
    
    if (players[playerId]) {
        myPlayer = players[playerId];
        gameRunning = true;
        
        // Update UI
        scoreEl.textContent = `Score: ${Math.floor(myPlayer.score || 0)}`;
        massEl.textContent = `Mass: ${Math.floor(myPlayer.mass || 10)}`;
        
        // Update camera
        camera.x = myPlayer.x - canvas.width / 2;
        camera.y = myPlayer.y - canvas.height / 2;
    }
});

socket.on('leaderboard', (leaderboard) => {
    leaderboardList.innerHTML = '';
    leaderboard.forEach((player, index) => {
        const li = document.createElement('li');
        const crown = index === 0 ? '<span class="crown">👑</span>' : '';
        const name = player.name || 'Anonymous';
        li.innerHTML = `${crown}${index + 1}. ${name.substring(0, 12)} - ${Math.floor(player.score || 0)}`;
        if (player.id === playerId) {
            li.style.color = '#48dbfb';
            li.style.fontWeight = 'bold';
        }
        leaderboardList.appendChild(li);
    });
});

socket.on('playerDisconnected', (id) => {
    delete players[id];
});

socket.on('gameOver', (data) => {
    gameRunning = false;
    mainMenu.style.display = 'flex';
    hud.style.display = 'none';
    alert(`Game Over! Final Score: ${data.score}`);
});

// Play button
playBtn.addEventListener('click', () => {
    const name = playerNameInput.value.trim() || 'Player';
    socket.emit('joinGame', {
        name: name,
        color: selectedColor,
        shape: selectedShape
    });
    
    mainMenu.style.display = 'none';
    hud.style.display = 'block';
    
    // Show mobile controls on touch devices
    if ('ontouchstart' in window) {
        mobileControls.style.display = 'flex';
    }
});

// Input handling
let mouseX = 0, mouseY = 0;
let keys = {};

canvas.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
});

canvas.addEventListener('mousedown', () => {
    if (gameRunning && myPlayer) {
        socket.emit('useAbility', 'dash');
    }
});

canvas.addEventListener('touchstart', (e) => {
    if (e.target.id === 'dashBtn') {
        if (gameRunning && myPlayer) {
            socket.emit('useAbility', 'dash');
        }
    } else if (e.target.id === 'splitBtn') {
        if (gameRunning && myPlayer) {
            socket.emit('useAbility', 'split');
        }
    } else {
        const touch = e.touches[0];
        mouseX = touch.clientX;
        mouseY = touch.clientY;
    }
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    mouseX = touch.clientX;
    mouseY = touch.clientY;
}, { passive: false });

document.addEventListener('keydown', (e) => {
    keys[e.key.toLowerCase()] = true;
    
    if (e.code === 'Space' && gameRunning && myPlayer) {
        socket.emit('useAbility', 'dash');
    }
    
    if ((e.key === 'w' || e.key === 'W') && gameRunning && myPlayer) {
        socket.emit('useAbility', 'split');
    }
});

document.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false;
});

// Send input to server
setInterval(() => {
    if (gameRunning && myPlayer) {
        let targetX, targetY;
        
        // Keyboard control
        if (keys['arrowup'] || keys['w']) {
            targetY = myPlayer.y - 100;
        }
        if (keys['arrowdown'] || keys['s']) {
            targetY = myPlayer.y + 100;
        }
        if (keys['arrowleft'] || keys['a']) {
            targetX = myPlayer.x - 100;
        }
        if (keys['arrowright'] || keys['d']) {
            targetX = myPlayer.x + 100;
        }
        
        // Mouse/touch takes priority
        if (mouseX !== 0 || mouseY !== 0) {
            targetX = camera.x + mouseX;
            targetY = camera.y + mouseY;
        }
        
        if (targetX !== undefined || targetY !== undefined) {
            socket.emit('input', {
                x: targetX !== undefined ? targetX : myPlayer.x,
                y: targetY !== undefined ? targetY : myPlayer.y
            });
        }
    }
}, 1000 / 30);

// Drawing functions
function drawShape(ctx, shape, x, y, size, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    
    if (shape === 'circle') {
        ctx.arc(x, y, size, 0, Math.PI * 2);
    } else if (shape === 'square') {
        ctx.rect(x - size, y - size, size * 2, size * 2);
    } else if (shape === 'triangle') {
        ctx.moveTo(x, y - size);
        ctx.lineTo(x + size, y + size);
        ctx.lineTo(x - size, y + size);
        ctx.closePath();
    } else if (shape === 'star') {
        const spikes = 5;
        const outerRadius = size;
        const innerRadius = size / 2;
        let rot = Math.PI / 2 * 3;
        let cx = x;
        let cy = y;
        let step = Math.PI / spikes;

        ctx.moveTo(cx, cy - outerRadius);
        for (let i = 0; i < spikes; i++) {
            x = cx + Math.cos(rot) * outerRadius;
            y = cy + Math.sin(rot) * outerRadius;
            ctx.lineTo(x, y);
            rot += step;

            x = cx + Math.cos(rot) * innerRadius;
            y = cy + Math.sin(rot) * innerRadius;
            ctx.lineTo(x, y);
            rot += step;
        }
        ctx.lineTo(cx, cy - outerRadius);
        ctx.closePath();
    }
    
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 3;
    ctx.stroke();
}

function drawGrid() {
    const gridSize = 50;
    const offsetX = -camera.x % gridSize;
    const offsetY = -camera.y % gridSize;
    
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    
    for (let x = offsetX; x < canvas.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }
    
    for (let y = offsetY; y < canvas.height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }
}

function drawCenterZone() {
    const mapSize = 4000;
    const zoneSize = 800;
    const zoneX = (mapSize / 2 - camera.x);
    const zoneY = (mapSize / 2 - camera.y);
    
    const gradient = ctx.createRadialGradient(zoneX, zoneY, 0, zoneX, zoneY, zoneSize);
    gradient.addColorStop(0, 'rgba(255, 215, 0, 0.1)');
    gradient.addColorStop(1, 'rgba(255, 215, 0, 0)');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(camera.x, camera.y, canvas.width, canvas.height);
}

function drawParticles() {
    particles.forEach((particle, index) => {
        ctx.globalAlpha = particle.life;
        ctx.fillStyle = particle.color;
        ctx.beginPath();
        ctx.arc(particle.x - camera.x, particle.y - camera.y, particle.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        
        particle.life -= 0.02;
        particle.x += particle.vx;
        particle.y += particle.vy;
        
        if (particle.life <= 0) {
            particles.splice(index, 1);
        }
    });
}

function drawFloatingTexts() {
    floatingTexts.forEach((text, index) => {
        ctx.globalAlpha = text.life;
        ctx.fillStyle = text.color;
        ctx.font = 'bold 20px Arial';
        ctx.fillText(text.text, text.x - camera.x, text.y - camera.y);
        ctx.globalAlpha = 1;
        
        text.life -= 0.02;
        text.y -= 1;
        
        if (text.life <= 0) {
            floatingTexts.splice(index, 1);
        }
    });
}

function drawMinimap() {
    minimapCtx.clearRect(0, 0, 150, 150);
    
    const mapSize = 4000;
    const scale = 150 / mapSize;
    
    // Draw all players
    Object.values(players).forEach(player => {
        minimapCtx.fillStyle = player.color;
        minimapCtx.beginPath();
        minimapCtx.arc(player.x * scale, player.y * scale, Math.max(3, player.mass * scale), 0, Math.PI * 2);
        minimapCtx.fill();
    });
    
    // Draw self indicator
    if (myPlayer) {
        minimapCtx.strokeStyle = '#fff';
        minimapCtx.lineWidth = 2;
        minimapCtx.beginPath();
        minimapCtx.arc(myPlayer.x * scale, myPlayer.y * scale, Math.max(5, myPlayer.mass * scale), 0, Math.PI * 2);
        minimapCtx.stroke();
    }
}

// Main game loop
function gameLoop() {
    // Clear canvas
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    if (gameRunning) {
        // Draw background
        drawGrid();
        drawCenterZone();
        
        // Draw food
        foods.forEach(food => {
            const screenX = food.x - camera.x;
            const screenY = food.y - camera.y;
            
            // Only draw if visible
            if (screenX > -50 && screenX < canvas.width + 50 && 
                screenY > -50 && screenY < canvas.height + 50) {
                
                let color;
                let glow = false;
                
                switch(food.tier) {
                    case 'legendary': color = '#ffd700'; glow = true; break;
                    case 'epic': color = '#9b59b6'; glow = true; break;
                    case 'rare': color = '#3498db'; glow = true; break;
                    case 'uncommon': color = '#2ecc71'; break;
                    default: color = '#e74c3c';
                }
                
                if (glow) {
                    ctx.shadowBlur = 15;
                    ctx.shadowColor = color;
                }
                
                drawShape(ctx, 'circle', screenX, screenY, food.size, color);
                ctx.shadowBlur = 0;
            }
        });
        
        // Draw players
        Object.values(players).forEach(player => {
            const screenX = player.x - camera.x;
            const screenY = player.y - camera.y;
            
            // Only draw if visible
            if (screenX > -100 && screenX < canvas.width + 100 && 
                screenY > -100 && screenY < canvas.height + 100) {
                
                // Draw crown for #1 player
                if (player.isCrowned) {
                    ctx.font = '30px Arial';
                    ctx.fillText('👑', screenX - 15, screenY - player.mass - 20);
                }
                
                // Draw player
                drawShape(ctx, player.shape || 'circle', screenX, screenY, player.mass, player.color);
                
                // Draw name
                ctx.fillStyle = '#fff';
                ctx.font = '14px Arial';
                ctx.textAlign = 'center';
                ctx.fillText(player.name || 'Anonymous', screenX, screenY - player.mass - 10);
            }
        });
        
        // Draw effects
        drawParticles();
        drawFloatingTexts();
        
        // Draw minimap
        drawMinimap();
    }
    
    requestAnimationFrame(gameLoop);
}

// Start game loop
gameLoop();

console.log('run.io client loaded');
