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
const leaderboard = document.getElementById('leaderboard');

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

// Performance optimization: throttle rendering
let lastRenderTime = 0;
const TARGET_FPS = 60;
const FRAME_INTERVAL = 1000 / TARGET_FPS;

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

socket.on('gameInit', (data) => {
    playerId = data.playerId;
    console.log('Game initialized with player ID:', playerId);
});

socket.on('gameState', (state) => {
    players = state.players;
    foods = state.foods || [];
    
    if (players[playerId]) {
        myPlayer = players[playerId];
        gameRunning = true;
        
        // Update UI
        scoreEl.textContent = `Score: ${Math.floor(myPlayer.score || 0)}`;
        massEl.textContent = `Mass: ${Math.floor(myPlayer.radius || 20)}`;
        
        // Update camera to follow player smoothly
        const targetCamX = myPlayer.x - canvas.width / 2;
        const targetCamY = myPlayer.y - canvas.height / 2;
        camera.x += (targetCamX - camera.x) * 0.1;
        camera.y += (targetCamY - camera.y) * 0.1;
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

socket.on('death', (data) => {
    gameRunning = false;
    mainMenu.style.display = 'flex';
    hud.style.display = 'none';
    alert(`Game Over! You were eaten by ${data.killer}`);
});

// Play button
playBtn.addEventListener('click', () => {
    const name = playerNameInput.value.trim() || 'Player';
    socket.emit('join', {
        name: name,
        color: selectedColor,
        skin: selectedShape
    });
    
    mainMenu.style.display = 'none';
    hud.style.display = 'block';
    
    // Show mobile controls on touch devices
    if ('ontouchstart' in window) {
        mobileControls.style.display = 'flex';
    }
});

// Mobile button handlers
const dashBtn = document.getElementById('dashBtn');
const splitBtn = document.getElementById('splitBtn');

if (dashBtn) {
    dashBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (gameRunning && myPlayer) {
            socket.emit('boost', true);
        }
    }, { passive: false });
    
    dashBtn.addEventListener('touchend', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (gameRunning && myPlayer) {
            socket.emit('boost', false);
        }
    });
    
    dashBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (gameRunning && myPlayer) {
            socket.emit('boost', true);
        }
    });
    
    dashBtn.addEventListener('mouseup', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (gameRunning && myPlayer) {
            socket.emit('boost', false);
        }
    });
}

if (splitBtn) {
    // Split functionality removed for simplified gameplay - can be re-added later
    splitBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
    }, { passive: false });
    
    splitBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
    });
}

// Leaderboard drag functionality for mobile and desktop
let leaderboardDrag = {
    isDragging: false,
    startX: 0,
    startY: 0,
    initialLeft: 0,
    initialTop: 0
};

const startDrag = (clientX, clientY) => {
    leaderboardDrag.isDragging = true;
    leaderboardDrag.startX = clientX;
    leaderboardDrag.startY = clientY;
    
    const rect = leaderboard.getBoundingClientRect();
    leaderboardDrag.initialLeft = rect.left;
    leaderboardDrag.initialTop = rect.top;
    
    leaderboard.classList.add('dragging');
};

const moveDrag = (clientX, clientY) => {
    if (!leaderboardDrag.isDragging) return;
    
    const deltaX = clientX - leaderboardDrag.startX;
    const deltaY = clientY - leaderboardDrag.startY;
    
    leaderboard.style.left = (leaderboardDrag.initialLeft + deltaX) + 'px';
    leaderboard.style.top = (leaderboardDrag.initialTop + deltaY) + 'px';
    leaderboard.style.right = 'auto';
};

const endDrag = () => {
    leaderboardDrag.isDragging = false;
    leaderboard.classList.remove('dragging');
};

// Touch events for leaderboard
leaderboard.addEventListener('touchstart', (e) => {
    const header = e.target.closest('h3');
    if (!header) return;
    
    e.preventDefault();
    e.stopPropagation();
    const touch = e.touches[0];
    startDrag(touch.clientX, touch.clientY);
}, { passive: false, capture: true });

leaderboard.addEventListener('touchmove', (e) => {
    if (!leaderboardDrag.isDragging) return;
    
    e.preventDefault();
    e.stopPropagation();
    const touch = e.touches[0];
    moveDrag(touch.clientX, touch.clientY);
}, { passive: false, capture: true });

leaderboard.addEventListener('touchend', (e) => {
    e.preventDefault();
    e.stopPropagation();
    endDrag();
});

leaderboard.addEventListener('touchcancel', (e) => {
    e.preventDefault();
    e.stopPropagation();
    endDrag();
});

// Mouse events for leaderboard
leaderboard.addEventListener('mousedown', (e) => {
    const header = e.target.closest('h3');
    if (!header) return;
    
    e.preventDefault();
    e.stopPropagation();
    startDrag(e.clientX, e.clientY);
});

document.addEventListener('mousemove', (e) => {
    if (!leaderboardDrag.isDragging) return;
    
    e.preventDefault();
    moveDrag(e.clientX, e.clientY);
});

document.addEventListener('mouseup', () => {
    endDrag();
});

// Input handling - optimized for mobile and desktop
let mouseX = 0, mouseY = 0;
let keys = {};
let touchActive = false;
let touchStartTime = 0;
let lastTouchX = 0, lastTouchY = 0;

// Mouse movement for desktop
canvas.addEventListener('mousemove', (e) => {
    if (!touchActive) {
        mouseX = e.clientX;
        mouseY = e.clientY;
    }
});

canvas.addEventListener('mousedown', (e) => {
    if (gameRunning && myPlayer && !e.target.closest('#mobileControls') && !e.target.closest('#abilities')) {
        socket.emit('boost', true);
    }
});

canvas.addEventListener('mouseup', () => {
    if (gameRunning && myPlayer) {
        socket.emit('boost', false);
    }
});

// Touch handling for mobile - improved tracking
canvas.addEventListener('touchstart', (e) => {
    // Don't handle touch if it's on UI elements with pointer-events
    if (e.target.closest('#mobileControls') || e.target.closest('#leaderboard') || e.target.closest('#abilities')) {
        return;
    }
    const touch = e.touches[0];
    mouseX = touch.clientX;
    mouseY = touch.clientY;
    lastTouchX = touch.clientX;
    lastTouchY = touch.clientY;
    touchActive = true;
    touchStartTime = Date.now();
    
    if (gameRunning && myPlayer) {
        socket.emit('boost', true);
    }
}, { passive: false, capture: true });

canvas.addEventListener('touchmove', (e) => {
    if (e.target.closest('#mobileControls') || e.target.closest('#leaderboard') || e.target.closest('#abilities')) {
        return;
    }
    e.preventDefault();
    const touch = e.touches[0];
    mouseX = touch.clientX;
    mouseY = touch.clientY;
    lastTouchX = touch.clientX;
    lastTouchY = touch.clientY;
}, { passive: false, capture: true });

canvas.addEventListener('touchend', (e) => {
    if (e.target.closest('#mobileControls') || e.target.closest('#leaderboard') || e.target.closest('#abilities')) {
        return;
    }
    touchActive = false;
    if (gameRunning && myPlayer) {
        socket.emit('boost', false);
    }
});

canvas.addEventListener('touchcancel', (e) => {
    touchActive = false;
    if (gameRunning && myPlayer) {
        socket.emit('boost', false);
    }
});

document.addEventListener('keydown', (e) => {
    keys[e.key.toLowerCase()] = true;
    
    if (e.code === 'Space' && gameRunning && myPlayer) {
        socket.emit('boost', true);
    }
});

document.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false;
    
    if (e.code === 'Space' && gameRunning && myPlayer) {
        socket.emit('boost', false);
    }
});

// Send input to server - optimized with throttling
const INPUT_INTERVAL = 1000 / 30; // 30 updates per second

setInterval(() => {
    if (gameRunning && myPlayer) {
        let targetX, targetY;
        
        // Keyboard control with WASD/Arrow keys
        const speed = 100;
        let keyboardActive = false;
        
        if (keys['arrowup'] || keys['w']) {
            targetY = myPlayer.y - speed;
            keyboardActive = true;
        }
        if (keys['arrowdown'] || keys['s']) {
            targetY = myPlayer.y + speed;
            keyboardActive = true;
        }
        if (keys['arrowleft'] || keys['a']) {
            targetX = myPlayer.x - speed;
            keyboardActive = true;
        }
        if (keys['arrowright'] || keys['d']) {
            targetX = myPlayer.x + speed;
            keyboardActive = true;
        }
        
        // Mouse/touch takes priority for direction when not using keyboard
        if (!keyboardActive && (mouseX !== 0 || mouseY !== 0)) {
            targetX = camera.x + mouseX;
            targetY = camera.y + mouseY;
        }
        
        // Only send input if we have valid targets
        if (targetX !== undefined || targetY !== undefined) {
            socket.emit('input', {
                x: targetX !== undefined ? targetX : myPlayer.x,
                y: targetY !== undefined ? targetY : myPlayer.y,
                boost: keys[' '] || false
            });
        } else if (touchActive) {
            // If touch is active but no movement, still send current position
            socket.emit('input', {
                x: camera.x + mouseX,
                y: camera.y + mouseY,
                boost: false
            });
        }
    }
}, INPUT_INTERVAL);

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

// Main game loop with FPS throttling
function gameLoop(timestamp) {
    // Throttle to target FPS
    if (timestamp - lastRenderTime < FRAME_INTERVAL) {
        requestAnimationFrame(gameLoop);
        return;
    }
    lastRenderTime = timestamp;
    
    // Clear canvas
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    if (gameRunning) {
        // Draw background
        drawGrid();
        drawCenterZone();
        
        // Draw food (optimized: only visible items)
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
        
        // Draw players (optimized: only visible)
        Object.values(players).forEach(player => {
            const screenX = player.x - camera.x;
            const screenY = player.y - camera.y;
            
            // Only draw if visible
            if (screenX > -100 && screenX < canvas.width + 100 && 
                screenY > -100 && screenY < canvas.height + 100) {
                
                // Draw crown for #1 player
                if (player.crown) {
                    ctx.font = '30px Arial';
                    ctx.fillText('👑', screenX - 15, screenY - player.radius - 20);
                }
                
                // Draw player
                drawShape(ctx, player.skin || 'circle', screenX, screenY, player.radius, player.color);
                
                // Draw name
                ctx.fillStyle = '#fff';
                ctx.font = '14px Arial';
                ctx.textAlign = 'center';
                ctx.fillText(player.name || 'Anonymous', screenX, screenY - player.radius - 10);
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

// Start game loop with timestamp
gameLoop(0);

console.log('run.io client loaded - optimized for mobile and performance');
