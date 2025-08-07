// @ts-check
import { listen, routines } from 'kalm';
import ws from '@kalm/ws';

// Game constants
const WORLD_SIZE = 1000;
const SPAWN_POINTS = 10;
const VIEWPORT_RADIUS = 5;
const MINE_COUNT = Math.floor(WORLD_SIZE * WORLD_SIZE * 0.05); // 5% mine density

// Tile types
const TileType = {
  COVERED: 'covered',
  EMPTY: 'empty',
  NUMBERED: 'numbered',
  MINE: 'mine',
  FLAG: 'flag',
  EXPLOSION: 'explosion'
} as const;

type TileType = typeof TileType[keyof typeof TileType];

// Tile state
interface Tile {
  type: TileType;
  revealed: boolean;
  flagged: boolean;
  flaggedBy?: string;
  number?: number; // For numbered tiles (1-8)
  exploded?: boolean;
}

// Player state
interface Player {
  id: string;
  x: number;
  y: number;
  username: string;
  score: number;
  flags: number;
  alive: boolean;
  connected: boolean;
}

// Game state
interface GameState {
  world: Tile[][];
  spawnPoints: { x: number; y: number }[];
  players: Map<string, Player>;
  gameStartTime: number;
  gameEnded: boolean;
  minesRemaining: number;
}

// Message payloads
interface WelcomePayload {
  playerId: string;
  player: Player;
  gameState: {
    startTime: number;
    ended: boolean;
    minesRemaining: number;
  };
  viewport: {
    tiles: (Tile & { x: number; y: number })[];
    players: Player[];
  };
  spawnPoints: { x: number; y: number }[];
}

interface PlayerActionPayload {
  x: number;
  y: number;
  action: 'move' | 'flip' | 'flag' | 'unflag';
  viewportWidth?: number;
  viewportHeight?: number;
}

interface ViewportUpdatePayload {
  tiles: (Tile & { x: number; y: number })[];
  players: Player[];
}

// World generation functions
function generateSpawnPoints(): { x: number; y: number }[] {
  const spawnPoints: { x: number; y: number }[] = [];
  const spacing = Math.floor(WORLD_SIZE / Math.sqrt(SPAWN_POINTS));
  
  for (let i = 0; i < SPAWN_POINTS; i++) {
    const row = Math.floor(i / Math.sqrt(SPAWN_POINTS));
    const col = i % Math.ceil(Math.sqrt(SPAWN_POINTS));
    
    spawnPoints.push({
      x: Math.floor(col * spacing + spacing / 2),
      y: Math.floor(row * spacing + spacing / 2)
    });
  }
  
  return spawnPoints;
}

function generateWorld(spawnPoints: { x: number; y: number }[]): Tile[][] {
  // Initialize empty world
  const world: Tile[][] = [];
  for (let x = 0; x < WORLD_SIZE; x++) {
    world[x] = [];
    for (let y = 0; y < WORLD_SIZE; y++) {
      world[x][y] = {
        type: TileType.COVERED,
        revealed: false,
        flagged: false
      };
    }
  }
  
  // Reveal spawn points
  for (const spawn of spawnPoints) {
    if (spawn.x >= 0 && spawn.x < WORLD_SIZE && spawn.y >= 0 && spawn.y < WORLD_SIZE) {
      world[spawn.x][spawn.y] = {
        type: TileType.EMPTY,
        revealed: true,
        flagged: false
      };
    }
  }
  
  // Place mines randomly (avoiding spawn points)
  const spawnSet = new Set(spawnPoints.map(s => `${s.x},${s.y}`));
  let minesPlaced = 0;
  
  while (minesPlaced < MINE_COUNT) {
    const x = Math.floor(Math.random() * WORLD_SIZE);
    const y = Math.floor(Math.random() * WORLD_SIZE);
    const key = `${x},${y}`;
    
    if (!spawnSet.has(key) && world[x][y].type !== TileType.MINE) {
      world[x][y].type = TileType.MINE;
      minesPlaced++;
    }
  }
  
  // Calculate numbers for non-mine tiles
  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let y = 0; y < WORLD_SIZE; y++) {
      if (world[x][y].type !== TileType.MINE) {
        const mineCount = countAdjacentMines(world, x, y);
        if (mineCount > 0) {
          world[x][y].type = TileType.NUMBERED;
          world[x][y].number = mineCount;
        } else if (!spawnSet.has(`${x},${y}`)) {
          world[x][y].type = TileType.EMPTY;
        }
      }
    }
  }
  
  return world;
}

function countAdjacentMines(world: Tile[][], x: number, y: number): number {
  let count = 0;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < WORLD_SIZE && ny >= 0 && ny < WORLD_SIZE) {
        if (world[nx][ny].type === TileType.MINE) {
          count++;
        }
      }
    }
  }
  return count;
}

// Game state
const gameState: GameState = {
  world: [],
  spawnPoints: [],
  players: new Map<string, Player>(),
  gameStartTime: Date.now(),
  gameEnded: false,
  minesRemaining: MINE_COUNT
};

// Initialize world
function initializeGame() {
  gameState.spawnPoints = generateSpawnPoints();
  gameState.world = generateWorld(gameState.spawnPoints);
  gameState.gameStartTime = Date.now();
  gameState.minesRemaining = MINE_COUNT;
  console.log(`World generated: ${WORLD_SIZE}x${WORLD_SIZE} with ${MINE_COUNT} mines and ${SPAWN_POINTS} spawn points`);
}

// Viewport and tile management functions
function getViewport(playerX: number, playerY: number, viewportWidth?: number, viewportHeight?: number): (Tile & { x: number; y: number })[] {
  const tiles: (Tile & { x: number; y: number })[] = [];
  
  // Calculate dynamic viewport size based on client screen or use defaults
  const defaultTilesX = Math.min(50, 100); // Default viewport (full screen)
  const defaultTilesY = Math.min(40, 100);
  
  const tilesX = viewportWidth ? Math.min(viewportWidth, 100) : defaultTilesX;
  const tilesY = viewportHeight ? Math.min(viewportHeight, 100) : defaultTilesY;
  
  for (let x = playerX - tilesX; x <= playerX + tilesX; x++) {
    for (let y = playerY - tilesY; y <= playerY + tilesY; y++) {
      if (x >= 0 && x < WORLD_SIZE && y >= 0 && y < WORLD_SIZE) {
        tiles.push({ ...gameState.world[x][y], x, y });
      }
    }
  }
  
  return tiles;
}

function getPlayersInViewport(playerX: number, playerY: number, viewportWidth?: number, viewportHeight?: number): Player[] {
  const playersInView: Player[] = [];
  
  // Calculate dynamic viewport size based on client screen or use defaults
  // Default to reasonable viewport assuming standard screen sizes
  const defaultTilesX = Math.min(50, 100); // Full screen coverage
  const defaultTilesY = Math.min(40, 100); // Full screen coverage
  
  const tilesX = viewportWidth ? Math.min(viewportWidth, 100) : defaultTilesX;
  const tilesY = viewportHeight ? Math.min(viewportHeight, 100) : defaultTilesY;
  
  for (const player of gameState.players.values()) {
    if (Math.abs(player.x - playerX) <= tilesX && 
        Math.abs(player.y - playerY) <= tilesY) {
      playersInView.push(player);
    }
  }
  
  return playersInView;
}

function isAdjacent(x1: number, y1: number, x2: number, y2: number): boolean {
  return Math.abs(x1 - x2) <= 1 && Math.abs(y1 - y2) <= 1 && !(x1 === x2 && y1 === y2);
}

function isValidPosition(x: number, y: number): boolean {
  return x >= 0 && x < WORLD_SIZE && y >= 0 && y < WORLD_SIZE;
}

function isTileWalkable(x: number, y: number): boolean {
  if (!isValidPosition(x, y)) return false;
  const tile = gameState.world[x][y];
  return tile.revealed || tile.flagged;
}

function getRandomSpawnPoint(): { x: number; y: number } {
  return gameState.spawnPoints[Math.floor(Math.random() * gameState.spawnPoints.length)];
}

const server = listen({
  port: 8080,
  transport: ws(),
  routine: routines.tick({ hz: 60 }),
  host: '0.0.0.0',
});

// Game logic functions
function handleTileFlip(playerId: string, x: number, y: number): boolean {
  const player = gameState.players.get(playerId);
  if (!player || !player.alive || gameState.gameEnded) return false;
  
  if (!isValidPosition(x, y) || !isAdjacent(player.x, player.y, x, y)) return false;
  
  const tile = gameState.world[x][y];
  if (tile.revealed || tile.flagged) return false;
  
  // Reveal tile
  tile.revealed = true;
  player.score += 1;
  
  if (tile.type === TileType.MINE) {
    // Explosion!
    handleExplosion(x, y);
    return true;
  }
  
  return true;
}

function handleTileFlag(playerId: string, x: number, y: number): boolean {
  const player = gameState.players.get(playerId);
  if (!player || !player.alive || gameState.gameEnded || player.flags <= 0) return false;
  
  if (!isValidPosition(x, y) || !isAdjacent(player.x, player.y, x, y)) return false;
  
  const tile = gameState.world[x][y];
  if (tile.revealed || tile.flagged) return false;
  
  // Place flag
  tile.flagged = true;
  tile.flaggedBy = playerId;
  player.flags -= 1;
  
  if (tile.type === TileType.MINE) {
    player.score += 3; // Bonus for flagging mine
    gameState.minesRemaining -= 1;
  }
  
  return true;
}

function handleTileUnflag(playerId: string, x: number, y: number): boolean {
  const player = gameState.players.get(playerId);
  if (!player || !player.alive || gameState.gameEnded) return false;
  
  if (!isValidPosition(x, y) || !isAdjacent(player.x, player.y, x, y)) return false;
  
  const tile = gameState.world[x][y];
  if (!tile.flagged) return false;
  
  // Remove flag
  tile.flagged = false;
  player.flags += 1;
  
  if (tile.type === TileType.MINE) {
    gameState.minesRemaining += 1;
  }
  
  tile.flaggedBy = undefined;
  return true;
}

function handleExplosion(x: number, y: number) {
  const affectedTiles: { x: number; y: number }[] = [];
  const killedPlayers: string[] = [];
  
  // 3-tile radius explosion
  for (let dx = -3; dx <= 3; dx++) {
    for (let dy = -3; dy <= 3; dy++) {
      if (dx * dx + dy * dy <= 9) { // Circular radius
        const nx = x + dx;
        const ny = y + dy;
        
        if (isValidPosition(nx, ny)) {
          const tile = gameState.world[nx][ny];
          if (!tile.revealed) {
            tile.revealed = true;
            affectedTiles.push({ x: nx, y: ny });
            
            // Chain reactions
            if (tile.type === TileType.MINE && !tile.exploded) {
              tile.exploded = true;
              setTimeout(() => handleExplosion(nx, ny), 100);
            }
          }
        }
      }
    }
  }
  
  // Kill players in explosion radius
  for (const player of gameState.players.values()) {
    const dist = Math.sqrt((player.x - x) ** 2 + (player.y - y) ** 2);
    if (dist <= 3 && player.alive) {
      player.alive = false;
      killedPlayers.push(player.id);
    }
  }
  
  // Mark explosion site
  gameState.world[x][y].type = TileType.EXPLOSION;
  gameState.world[x][y].exploded = true;
  
  // Broadcast explosion
  server.broadcast('explosion', {
    x, y,
    affectedTiles,
    killedPlayers
  });
}

function checkGameEnd(): boolean {
  return gameState.minesRemaining <= 0;
}

// Initialize the game
initializeGame();

server.on('connection', (client: any) => {
  console.log(`Client connected: ${client.label}`);
  
  const spawnPoint = getRandomSpawnPoint();
  const player: Player = {
    id: client.label,
    x: spawnPoint.x,
    y: spawnPoint.y,
    username: `Player${client.label.substring(0, 6)}`,
    score: 0,
    flags: 3,
    alive: true,
    connected: true
  };
  
  gameState.players.set(client.label, player);
  
  // Send welcome message and current game state
  const welcomePayload: WelcomePayload = {
    playerId: client.label,
    player: player,
    gameState: {
      startTime: gameState.gameStartTime,
      ended: gameState.gameEnded,
      minesRemaining: gameState.minesRemaining
    },
    viewport: {
      tiles: getViewport(player.x, player.y),
      players: getPlayersInViewport(player.x, player.y)
    },
    spawnPoints: gameState.spawnPoints
  };
  client.write('welcome', welcomePayload);
  
  // Notify other clients about new player
  server.broadcast('player-joined', { player });
  
  // Handle player actions
  client.subscribe('player-action', (data: PlayerActionPayload) => {
    const player = gameState.players.get(client.label);
    if (!player || !player.alive || gameState.gameEnded) return;
    
    let actionSuccess = false;
    
    switch (data.action) {
      case 'move':
        if (isAdjacent(player.x, player.y, data.x, data.y) && isTileWalkable(data.x, data.y)) {
          player.x = data.x;
          player.y = data.y;
          actionSuccess = true;
        }
        break;
      case 'flip':
        actionSuccess = handleTileFlip(client.label, data.x, data.y);
        break;
      case 'flag':
        actionSuccess = handleTileFlag(client.label, data.x, data.y);
        break;
      case 'unflag':
        actionSuccess = handleTileUnflag(client.label, data.x, data.y);
        break;
    }
    
    if (actionSuccess) {
      // Send updated viewport to player
      const viewportUpdate: ViewportUpdatePayload = {
        tiles: getViewport(player.x, player.y, data.viewportWidth, data.viewportHeight),
        players: getPlayersInViewport(player.x, player.y, data.viewportWidth, data.viewportHeight)
      };
      client.write('viewport-update', viewportUpdate);
      
      // Broadcast player state changes
      server.broadcast('player-update', {
        player: player,
        action: data.action,
        x: data.x,
        y: data.y
      });
      
      // Check for game end
      if (checkGameEnd() && !gameState.gameEnded) {
        gameState.gameEnded = true;
        const leaderboard = Array.from(gameState.players.values())
          .filter(p => p.score > 0)
          .sort((a, b) => b.score - a.score);
        
        server.broadcast('game-end', { leaderboard });
      }
    }
  });
  
  // Handle client disconnect
  client.on('disconnect', () => {
    console.log(`Client disconnected: ${client.label}`);
    
    const player = gameState.players.get(client.label);
    if (player) {
      player.connected = false;
      server.broadcast('player-disconnected', { playerId: client.label });
    }
  });
});

console.log('Starting Mine Land server on ws://localhost:8080');
console.log('Server configuration:');
console.log('- Transport: WebSocket');
console.log('- Tick rate: 60hz');
console.log('- World size: 1000x1000');
console.log('- Mine count: ' + MINE_COUNT);
console.log('- Spawn points: ' + SPAWN_POINTS);
console.log('- Viewport radius: ' + VIEWPORT_RADIUS);

// Graceful shutdown handling
process.on('SIGINT', () => {
  console.log('\nShutting down Mine Land server...');
  server.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nReceived SIGTERM, shutting down Mine Land server...');
  server.stop();
  process.exit(0);
});