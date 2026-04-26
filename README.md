# 🎮 run.io - Multiplayer Battle Arena

A fast-paced multiplayer web game where you eat, grow, and dominate the arena!

## 🚀 Features

### Core Gameplay
- **Multi-control support** - Play with Mouse, Touch, or Keyboard (WASD/Arrow keys)
- **Eat to grow** - Consume food pellets to increase your size
- **Player vs Player** - Eat smaller players, avoid larger ones
- **Dynamic camera** - Smooth camera following your player
- **Boost mechanic** - Hold mouse click, touch, or Spacebar to speed up

### Unique Elements
- **🏆 Live Leaderboard** - Real-time top 10 rankings updated instantly
- **👑 Crown System** - #1 player wears a golden crown on their head
- **⚠️ High Loot Center Zone** - Dangerous central area with glowing rare food
- **🎨 Full Customization** - Choose from 10 vibrant colors and 4 unique shapes
- **📊 Tiered Food System**:
  - 🟢 Common (Green) - Basic food worth 1 point
  - 🌿 Uncommon (Light Green) - Worth 3 points
  - 🟠 Rare (Orange) - Worth 8 points  
  - 🔴 Epic (Red) - Worth 20 points
  - ✨ Legendary (Pink) - Worth 50 points (glows!)
- **🗺️ Minimap** - Tactical overview showing all players and food
- **📱 Mobile Optimized** - Full touch support with boost button

### Technical Excellence
- **60 FPS game loop** - Ultra-smooth gameplay
- **Optimized rendering** - Only visible objects drawn, efficient network usage
- **Real-time multiplayer** - Powered by Socket.IO with low latency
- **Responsive design** - Perfect on desktop, tablet, and mobile
- **Cross-platform controls** - Seamless switching between input methods

## 🎯 How to Play

1. **Start the Server**
   ```bash
   npm start
   ```

2. **Open in Browser**
   Navigate to `http://localhost:3000`

3. **Customize Your Player**
   - Enter your nickname (max 15 characters)
   - Choose your favorite color from 10 options
   - Pick your shape: Circle, Square, Triangle, or Star
   - Click PLAY NOW

4. **Controls**
   - **Mouse**: Move cursor to direct, hold click to boost
   - **Touch**: Drag to move, auto-boost while touching
   - **Keyboard**: WASD or Arrow keys to move, Spacebar to boost
   - **Mobile**: Use the BOOST button for speed burst

5. **Gameplay Tips**
   - Eat food to grow larger and faster
   - Avoid players bigger than you (they can eat you!)
   - Hunt smaller players to steal their score
   - Venture to the glowing center zone for rare food (high risk, high reward)
   - Reach #1 on the leaderboard to earn the golden crown 👑
   - Use boost strategically to escape or chase

## 🛠️ Tech Stack

- **Backend**: Node.js, Express, Socket.IO
- **Frontend**: HTML5 Canvas, Vanilla JavaScript, CSS3
- **Features**: 
  - Real-time WebSocket communication
  - Dynamic zoom camera system
  - Precise collision detection
  - Score-based growth mechanics
  - Player elimination and instant respawning
  - Bot AI for solo practice

## ⚙️ Configuration

Edit `server.js` to customize:
- Map size (default: 3000x3000 units)
- Center zone radius (default: 400)
- Food count and spawn rates
- Bot count for practice
- Player speed and growth formulas
- Available colors and skins

## 🎮 Game Mechanics

### Growth System
- Starting radius: 20 units
- Growth formula: Exponential scaling based on score
- Speed decreases as you grow (smaller = faster)
- Boost gives 50% speed boost at cost of control

### Combat Rules
- Must be 10% larger to consume another player
- Eaten players lose all progress and respawn
- Attacker gains 50% of victim's score
- Bots respawn after 3 seconds

### Center Zone
- 400-unit radius around map center (marked with golden glow)
- 30% chance for Epic food, 20% for Rare food
- Hot zone for intense PvP encounters
- Visible on minimap for tactical planning

### Visual Feedback
- Crown appears above #1 player's head
- Legendary food has glowing effect
- Player names and scores displayed
- Smooth animations and transitions

## 🌐 Multiplayer

- Supports unlimited concurrent players
- Real-time position updates at 60 FPS
- Automatic leaderboard updates
- Death messages show who eliminated you
- Players sorted by size in rendering

## 📱 Mobile Support

- Full touch screen optimization
- Prevents accidental zooming/scrolling
- Dedicated boost button for mobile
- Responsive UI adapts to any screen
- Minimaps and HUD scale properly

Enjoy the battle! 🎉
