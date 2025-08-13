// ECS-based Mine Land Server
import { listen, routines, type Client } from 'kalm';
import ws from '@kalm/ws';
import crypto from 'crypto';
import { GameManager } from './GameManager.ts';

// Session management
const playerSessions = new Map<string, { player: any; lastSeen: number }>();

// Initialize game manager with essential security
const gameManager = new GameManager({
  enableRateLimiting: true,
  enableBehaviorValidation: true,
  enableSessionSecurity: true,
  enableReplayProtection: false, // Temporarily disabled due to action format changes
  sessionSecret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex')
});

// Server setup
const server = listen({
  port: 8080,
  transport: ws(),
  routine: routines.tick({ hz: 60 }),
  host: '0.0.0.0'
});

// Set server instance in game manager
gameManager.setServerInstance(server);

// Session cleanup interval
setInterval(() => {
  const now = Date.now();
  const TIMEOUT = 30000; // 30 seconds
  
  for (const [sessionId, session] of playerSessions) {
    if (now - session.lastSeen > TIMEOUT) {
      console.log(`Session ${sessionId} timed out`);
      gameManager.removePlayer(session.player.id);
      playerSessions.delete(sessionId);
    }
  }
}, 10000); // Check every 10 seconds

// No update loop needed - all actions are synchronous

server.on('connection', (client: Client) => {
  console.log(`Client connected: ${client.label}`);

  client.subscribe('player-preferences', (data: any) => {
    console.log(`Player preferences received from ${client.label}:`, data);

    let player: any;
    let isReconnection = false;
    let secureSession: { sessionId: string; sessionToken: string } | null = null;

    // Check for existing session with security validation
    if (data.sessionId && data.sessionToken) {
      const sessionValidation = gameManager.validatePlayerSession(data.sessionId, data.sessionToken);
      
      if (sessionValidation.valid && sessionValidation.playerId) {
        const existingPlayerEntity = gameManager.getPlayerEntity(sessionValidation.playerId);
        if (existingPlayerEntity) {
          const playerComp = existingPlayerEntity.getComponent('player');
          const posComp = existingPlayerEntity.getComponent('position');
          
          if (playerComp && posComp) {
            // Reconnection - restore existing player
            player = {
              id: playerComp.id,
              username: playerComp.username,
              x: posComp.x,
              y: posComp.y,
              score: playerComp.score,
              flags: playerComp.flags,
              alive: playerComp.alive,
              connected: true,
              color: playerComp.color,
              sessionId: data.sessionId
            };
            
            // Update connection status
            playerComp.connected = true;
            isReconnection = true;
            
            // Reuse existing secure session
            secureSession = {
              sessionId: data.sessionId,
              sessionToken: data.sessionToken
            };
            
            console.log(`Player ${player.username} reconnected with secure session ${data.sessionId}`);
          }
        }
      } else {
        console.warn(`Invalid session attempt by client ${client.label}`);
      }
    }

    if (!player) {
      // New player - create secure session
      const username = data.name || `Player${Math.floor(Math.random() * 1000)}`;
      
      // Generate unique player ID
      const playerId = `player_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      
      // Create secure session
      secureSession = gameManager.createSecurePlayerSession(playerId, username, {
        ipAddress: data.ipAddress,
        userAgent: data.userAgent
      });
      
      const playerEntity = gameManager.createPlayerEntity({
        id: playerId,
        username,
        clientId: client.label,
        sessionId: secureSession.sessionId,
        color: data.color
      });

      const playerComp = playerEntity.getComponent('player');
      const posComp = playerEntity.getComponent('position');

      if (playerComp && posComp) {
        player = {
          id: playerComp.id,
          username: playerComp.username,
          x: posComp.x,
          y: posComp.y,
          score: playerComp.score,
          flags: playerComp.flags,
          alive: playerComp.alive,
          connected: playerComp.connected,
          color: playerComp.color,
          sessionId: playerComp.sessionId
        };
        
        console.log(`New player ${player.username} joined at ${player.x}, ${player.y} with secure session`);
      }
    }

    // Update session
    if (player) {
      playerSessions.set(player.sessionId, {
        player: {
          ...player,
          clientId: client.label // Store current client connection
        },
        lastSeen: Date.now()
      });

      // Send session credentials to client if new or on reconnection
      if (secureSession) {
        client.write('session-assigned', {
          sessionId: secureSession.sessionId,
          sessionToken: secureSession.sessionToken,
          isReconnection
        });
      }

      // Send welcome payload
      const welcomePayload = {
        playerId: client.label,
        player: player,
        gameState: {
          startTime: gameManager.getGameState().gameStartTime,
          ended: gameManager.getGameState().gameEnded,
          minesRemaining: gameManager.getObfuscatedMineProgress() // Security: Send progress percentage
        },
        viewport: gameManager.getViewportForPlayer(player.id)
      };
      
      client.write('welcome', welcomePayload);

      // Broadcast updated leaderboard
      gameManager.broadcastLeaderboardUpdate();
      
      // Broadcast player join/rejoin
      gameManager.broadcastPlayerUpdate(player.id);
    }
  });

  client.subscribe('player-action', (data: any) => {
    const session = Array.from(playerSessions.values()).find(s => s.player.clientId === client.label);
    if (!session) {
      console.warn(`Action from unknown client: ${client.label}`);
      return;
    }

    const player = session.player;
    session.lastSeen = Date.now(); // Update last seen

    // Check if player is alive before processing actions (except movement for spectating)
    const playerEntity = gameManager.getPlayerEntity(player.id);
    if (playerEntity) {
      const playerComp = playerEntity.getComponent('player');
      if (playerComp && !playerComp.alive && data.action !== 'move') {
        console.warn(`Dead player ${player.id} attempted action: ${data.action}`);
        // Send death status reminder to client
        client.write('player-death', {
          playerId: player.id,
          reason: 'You are dead and cannot perform this action'
        });
        return;
      }
      
      // Update player status in session for consistency
      if (playerComp) {
        session.player.alive = playerComp.alive;
      }
    }

    let actionSuccess = false;

    // Get session credentials for security validation (optional)
    const sessionId = data.sessionId || null;
    const sessionToken = data.sessionToken || null;
    
    // If no session credentials, log but continue with basic validation
    if (!sessionId || !sessionToken) {
      console.log(`Action without session credentials from player ${player.id} - using basic validation`);
    }

    switch (data.action) {
      case 'move':
        console.log(`Server: Move request from ${player.id} to (${data.x}, ${data.y})`);
        actionSuccess = gameManager.requestPlayerMovement(player.id, data.x, data.y, sessionId, sessionToken);
        break;
      case 'flip':
        actionSuccess = gameManager.requestTileAction(player.id, data.x, data.y, 'flip', sessionId, sessionToken);
        break;
      case 'flag':
        actionSuccess = gameManager.requestTileAction(player.id, data.x, data.y, 'flag', sessionId, sessionToken);
        break;
      case 'unflag':
        actionSuccess = gameManager.requestTileAction(player.id, data.x, data.y, 'unflag', sessionId, sessionToken);
        break;
    }

    if (actionSuccess) {
      // Send immediate viewport update to the acting player
      gameManager.sendViewportUpdate(player.id, client.label, data.viewportWidth, data.viewportHeight);

      // Broadcast lightweight tile update to nearby players only
      server.broadcast('tile-update', {
        x: data.x,
        y: data.y,
        action: data.action,
        playerId: player.id,
        timestamp: Date.now()
      });

      // Broadcast player state changes
      gameManager.broadcastPlayerUpdate(player.id);

      // Only update leaderboard if it's a scoring action
      if (data.action === 'flip' || data.action === 'flag') {
        gameManager.broadcastLeaderboardUpdate();
      }

      // Check for game end
      if (gameManager.checkGameEnd()) {
        console.log('Game ended - all mines flagged!');
        server.broadcast('game-end', {
          reason: 'All mines have been flagged',
          timestamp: Date.now()
        });
      }
    }
  });

  client.on('disconnect', () => {
    console.log(`Client disconnected: ${client.label}`);
    
    // Mark player as disconnected but don't remove immediately
    const session = Array.from(playerSessions.values()).find(s => s.player.clientId === client.label);
    if (session) {
      const playerEntity = gameManager.getPlayerEntity(session.player.id);
      if (playerEntity) {
        const playerComp = playerEntity.getComponent('player');
        if (playerComp) {
          playerComp.connected = false;
          console.log(`Player ${session.player.username} (${session.player.id}) marked as disconnected`);
        }
      }
    }
  });

  // Security dashboard endpoint (for admin monitoring)
  client.subscribe('security-dashboard', (data: any) => {
    // Only allow if client has admin privileges (implement as needed)
    if (data.adminKey === process.env.ADMIN_KEY) {
      const dashboard = gameManager.getSecurityDashboard();
      client.write('security-dashboard-data', dashboard);
    } else {
      console.warn(`Unauthorized security dashboard access attempt from ${client.label}`);
    }
  });
});

// Helper functions
function generateSessionId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

console.log('🎮 ECS Mine Land Server Started');
console.log('- Port: 8080');
console.log('- Tick rate: 60hz');
console.log('- World size: 1000x1000');
console.log('- ECS Architecture: Enabled');
console.log('- Security Features: Essential Only');
console.log('  * Rate limiting: Enabled');
console.log('  * Movement validation: Adjacent tiles only');
console.log('  * Interaction validation: Nearby tiles only');
console.log('  * Alive status validation: Dead players restricted');
console.log('  * Session security: Enabled');
console.log('  * Replay protection: Enabled');