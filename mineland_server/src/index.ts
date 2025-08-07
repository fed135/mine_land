import { listen, routines } from 'kalm';
import ws from '@kalm/ws';

interface Player {
  id: string;
  x: number;
  y: number;
  username?: string;
}

interface WelcomePayload {
  message: string;
  playerId: string;
  player: Player;
  currentPlayers: Player[];
}

interface PlayerUpdatePayload {
  x?: number;
  y?: number;
  username?: string;
}

interface ChatMessagePayload {
  message: string;
}

const players = new Map<string, Player>();

const server = listen({
  port: 8080,
  transport: ws(),
  routine: routines.tick({ hz: 60 }),
  host: '0.0.0.0',
});

server.on('connection', (client: any) => {
  console.log(`Client connected: ${client.id}`);
  
  const player: Player = {
    id: client.id,
    x: Math.random() * 800,
    y: Math.random() * 600,
    username: undefined
  };
  
  players.set(client.id, player);
  
  // Send welcome message and current game state
  const welcomePayload: WelcomePayload = {
    message: 'Welcome to Mine Land!',
    playerId: client.id,
    player: player,
    currentPlayers: Array.from(players.values())
  };
  client.write('welcome', welcomePayload);
  
  // Notify other clients about new player
  server.broadcast('player-joined', { player });
  
  // Handle player movement updates
  client.subscribe('player-update', (data: PlayerUpdatePayload) => {
    const player = players.get(client.id);
    if (player) {
      if (typeof data.x === 'number') player.x = data.x;
      if (typeof data.y === 'number') player.y = data.y;
      if (data.username) player.username = data.username;
      
      // Broadcast movement to all clients
      server.broadcast('player-moved', {
        playerId: client.id,
        x: player.x,
        y: player.y,
        username: player.username
      });
    }
  });
  
  // Handle chat messages
  client.subscribe('chat-message', (data: ChatMessagePayload) => {
    const player = players.get(client.id);
    if (player && data.message && typeof data.message === 'string') {
      server.broadcast('chat-message', {
        playerId: client.id,
        username: player.username || `Player ${client.id.substring(0, 8)}`,
        message: data.message.substring(0, 200), // Limit message length
        timestamp: Date.now()
      });
    }
  });
  
  // Handle ping for connection testing
  client.subscribe('ping', () => {
    client.write('pong', { timestamp: Date.now() });
  });
  
  // Handle client disconnect
  client.on('disconnect', () => {
    console.log(`Client disconnected: ${client.id}`);
    
    if (players.has(client.id)) {
      players.delete(client.id);
      
      // Notify other clients about player leaving
      server.broadcast('player-left', {
        playerId: client.id
      });
    }
  });
});

console.log('Starting Mine Land server on ws://localhost:8080');
console.log('Server configuration:');
console.log('- Transport: WebSocket');
console.log('- Tick rate: 60hz');
console.log('- Max players: Unlimited');

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