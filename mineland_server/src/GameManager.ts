import { EntityManager } from './ecs/EntityManager.ts';
import { Entity } from './ecs/Entity.ts';
import { createPositionComponent, type PositionComponent } from './components/PositionComponent.ts';
import { createTileComponent, type TileComponent, type TileType } from './components/TileComponent.ts';
import { createPlayerComponent, type PlayerComponent } from './components/PlayerComponent.ts';
import { createNetworkComponent } from './components/NetworkComponent.ts';
import { TileRegistry } from './registries/TileRegistry.ts';
import { PlayerRegistry } from './registries/PlayerRegistry.ts';
import { MovementSystem } from './systems/MovementSystem.ts';
import { GameLogicSystem } from './systems/GameLogicSystem.ts';
import { NetworkSystem } from './systems/NetworkSystem.ts';
import { SecurityManager, type SecurityConfig } from './security/SecurityManager.ts';

// Game constants
const WORLD_SIZE = 1000;
const SPAWN_POINTS = 10;
const MINE_COUNT = Math.floor(WORLD_SIZE * WORLD_SIZE * 0.075); // 7.5% mine density
const FLAG_TOKEN_COUNT = Math.floor(WORLD_SIZE * WORLD_SIZE * 0.02); // 2% flag token density

interface GameState {
  gameStartTime: number;
  gameEnded: boolean;
  spawnPoints: { x: number; y: number }[];
}

/**
 * GameManager - Coordinates all ECS systems and manages game state
 */
export class GameManager {
  private entityManager: EntityManager;
  private tileRegistry: TileRegistry;
  private playerRegistry: PlayerRegistry;
  
  private movementSystem: MovementSystem;
  private gameLogicSystem: GameLogicSystem;
  private networkSystem: NetworkSystem;
  private securityManager: SecurityManager;
  
  private gameState: GameState;
  private serverInstance: any;

  constructor(securityConfig?: SecurityConfig) {
    this.entityManager = new EntityManager();
    this.tileRegistry = new TileRegistry();
    this.playerRegistry = new PlayerRegistry();
    this.securityManager = new SecurityManager(securityConfig || {
      enableRateLimiting: true,
      enableBehaviorValidation: true,
      enableSessionSecurity: true,
      enableReplayProtection: true
    });
    
    this.movementSystem = new MovementSystem(this.tileRegistry, this.playerRegistry, WORLD_SIZE);
    this.gameLogicSystem = new GameLogicSystem(this.tileRegistry, this.playerRegistry, WORLD_SIZE);
    this.networkSystem = new NetworkSystem(this.tileRegistry, this.playerRegistry, WORLD_SIZE);
    
    // Register systems with entity manager
    this.entityManager.addSystem('movement', this.movementSystem);
    this.entityManager.addSystem('gameLogic', this.gameLogicSystem);
    this.entityManager.addSystem('network', this.networkSystem);
    
    // Set up explosion callbacks
    this.gameLogicSystem.onExplosion((data) => {
      this.handleExplosion(data);
    });
    
    this.gameState = {
      gameStartTime: Date.now(),
      gameEnded: false,
      spawnPoints: []
    };
    
    this.initializeWorld();
    
    // Security system initialized - no periodic integrity checks needed
  }

  setServerInstance(server: any): void {
    this.serverInstance = server;
    this.networkSystem.setServerInstance(server);
  }

  private initializeWorld(): void {
    this.gameState.spawnPoints = this.generateSpawnPoints();
    this.generateWorld();
    this.gameState.gameStartTime = Date.now();
    
    console.log(`World generated: ${WORLD_SIZE}x${WORLD_SIZE} with ${MINE_COUNT} mines and ${SPAWN_POINTS} spawn points`);
  }

  private generateSpawnPoints(): { x: number; y: number }[] {
    const spawnPoints: { x: number; y: number }[] = [];
    const gridSize = Math.ceil(Math.sqrt(SPAWN_POINTS));
    const margin = 50;

    for (let i = 0; i < SPAWN_POINTS; i++) {
      const gridX = i % gridSize;
      const gridY = Math.floor(i / gridSize);

      const x = margin + (gridX * (WORLD_SIZE - 2 * margin)) / (gridSize - 1);
      const y = margin + (gridY * (WORLD_SIZE - 2 * margin)) / (gridSize - 1);

      const clampedX = Math.max(margin, Math.min(WORLD_SIZE - margin - 1, x));
      const clampedY = Math.max(margin, Math.min(WORLD_SIZE - margin - 1, y));

      spawnPoints.push({
        x: Math.floor(clampedX),
        y: Math.floor(clampedY)
      });
    }

    return spawnPoints;
  }

  private isNearSpawnPoint(x: number, y: number): boolean {
    for (const spawn of this.gameState.spawnPoints) {
      const distance = Math.abs(x - spawn.x) + Math.abs(y - spawn.y); // Manhattan distance
      if (distance <= 2) {
        return true;
      }
    }
    return false;
  }

  private generateWorld(): void {
    // Create spawn point set for quick lookup
    const spawnSet = new Set(this.gameState.spawnPoints.map(s => `${s.x},${s.y}`));

    // Create and reveal spawn point tiles
    for (const spawn of this.gameState.spawnPoints) {
      this.createTileEntity({
        x: spawn.x,
        y: spawn.y,
        type: 'empty',
        revealed: true
      });
    }

    // Place mines randomly (avoiding spawn points and 2-tile radius)
    let minesPlaced = 0;
    while (minesPlaced < MINE_COUNT) {
      const x = Math.floor(Math.random() * WORLD_SIZE);
      const y = Math.floor(Math.random() * WORLD_SIZE);
      const key = `${x},${y}`;

      if (!spawnSet.has(key) && !this.isNearSpawnPoint(x, y) && !this.tileRegistry.hasTile(x, y)) {
        this.createTileEntity({
          x, y,
          type: 'mine',
          revealed: false
        });
        minesPlaced++;
      }
    }

    // Place flag tokens randomly (avoiding spawn points and mines)
    let flagTokensPlaced = 0;
    while (flagTokensPlaced < FLAG_TOKEN_COUNT) {
      const x = Math.floor(Math.random() * WORLD_SIZE);
      const y = Math.floor(Math.random() * WORLD_SIZE);
      const key = `${x},${y}`;

      if (!spawnSet.has(key) && !this.tileRegistry.hasTile(x, y)) {
        this.createTileEntity({
          x, y,
          type: 'flag_token',
          revealed: false
        });
        flagTokensPlaced++;
      }
    }

    // Calculate numbers for tiles that need them
    this.calculateNumbers();
    
    // Initialize mine count cache for performance
    this.gameLogicSystem.initializeMineCountsCache();
  }

  private calculateNumbers(): void {
    const toUpdate: { x: number; y: number; count: number }[] = [];

    // First pass: identify all positions that need numbered tiles
    for (let x = 0; x < WORLD_SIZE; x++) {
      for (let y = 0; y < WORLD_SIZE; y++) {
        // Skip if tile already exists
        if (this.tileRegistry.hasTile(x, y)) continue;
        
        // Skip spawn points
        const isSpawn = this.gameState.spawnPoints.some(s => s.x === x && s.y === y);
        if (isSpawn) continue;

        const mineCount = this.countAdjacentMines(x, y);
        if (mineCount > 0) {
          toUpdate.push({ x, y, count: mineCount });
        } else {
          // Create empty tile for areas with no adjacent mines
          this.createTileEntity({
            x, y,
            type: 'empty',
            revealed: false
          });
        }
      }
    }

    // Second pass: create numbered tiles
    for (const update of toUpdate) {
      this.createTileEntity({
        x: update.x,
        y: update.y,
        type: 'numbered',
        revealed: false,
        number: update.count
      });
    }
  }

  private countAdjacentMines(centerX: number, centerY: number): number {
    let count = 0;
    
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;

        const x = centerX + dx;
        const y = centerY + dy;

        if (x >= 0 && x < WORLD_SIZE && y >= 0 && y < WORLD_SIZE) {
          const tileData = this.tileRegistry.getTileData(x, y);
          if (tileData && tileData.type === 'mine') {
            count++;
          }
        }
      }
    }
    
    return count;
  }

  private createTileEntity(data: {
    x: number;
    y: number;
    type: TileType;
    revealed?: boolean;
    flagged?: boolean;
    number?: number;
  }): Entity {
    const entity = this.entityManager.createEntity();
    
    entity.addComponent('position', createPositionComponent(data.x, data.y));
    entity.addComponent('tile', createTileComponent({
      type: data.type,
      revealed: data.revealed || false,
      flagged: data.flagged || false,
      number: data.number
    }));
    
    // Register with tile registry
    this.tileRegistry.registerTile(entity, data.x, data.y);
    
    return entity;
  }

  // Player management
  createPlayerEntity(data: {
    id: string;
    username: string;
    clientId?: string;
    sessionId?: string;
    color?: string;
  }): Entity {
    const spawnPoint = this.getRandomSpawnPoint();
    const entity = this.entityManager.createEntity();
    
    entity.addComponent('position', createPositionComponent(spawnPoint.x, spawnPoint.y));
    entity.addComponent('player', createPlayerComponent({
      id: data.id,
      username: data.username,
      color: data.color,
      sessionId: data.sessionId
    }));
    entity.addComponent('network', createNetworkComponent({
      clientId: data.clientId,
      needsSync: true
    }));
    
    // Register with player registry
    this.playerRegistry.registerPlayer(entity, data.id, data.clientId, data.sessionId);
    
    return entity;
  }

  private getRandomSpawnPoint(): { x: number; y: number } {
    return this.gameState.spawnPoints[Math.floor(Math.random() * this.gameState.spawnPoints.length)];
  }

  // Game actions
  requestPlayerMovement(playerId: string, targetX: number, targetY: number, sessionId?: string | null, sessionToken?: string | null): boolean {
    const playerEntity = this.playerRegistry.getPlayerEntity(playerId);
    if (!playerEntity) return false;
    
    const posComp = playerEntity.getComponent('position') as PositionComponent;
    if (!posComp) return false;
    
    console.log(`GameManager: Movement request from ${playerId}: (${posComp.x},${posComp.y}) -> (${targetX},${targetY})`);
    
    // Basic movement validation (adjacent tiles only)
    const deltaX = Math.abs(targetX - posComp.x);
    const deltaY = Math.abs(targetY - posComp.y);
    if (deltaX > 1 || deltaY > 1) {
      console.warn(`Invalid movement: Player ${playerId} tried to move from (${posComp.x},${posComp.y}) to (${targetX},${targetY})`);
      return false;
    }
    
    // Enhanced security validation if session credentials provided
    if (sessionId && sessionToken) {
      const playerComp = playerEntity.getComponent('player') as PlayerComponent;
      const validation = this.securityManager.validatePlayerAction(
        playerId,
        sessionId,
        sessionToken,
        'move',
        { x: targetX, y: targetY },
        { x: posComp.x, y: posComp.y },
        playerComp?.alive
      );
      
      if (!validation.allowed) {
        console.warn(`Movement blocked for ${playerId}: ${validation.reason}`);
        return false;
      }
    }
    
    return this.movementSystem.requestMovement(playerId, targetX, targetY);
  }

  requestTileAction(playerId: string, x: number, y: number, action: 'flip' | 'flag' | 'unflag', sessionId?: string | null, sessionToken?: string | null): boolean {
    const playerEntity = this.playerRegistry.getPlayerEntity(playerId);
    if (!playerEntity) return false;
    
    const posComp = playerEntity.getComponent('position') as PositionComponent;
    if (!posComp) return false;
    
    const playerComp = playerEntity.getComponent('player') as PlayerComponent;
    
    // Basic validation (nearby tiles only)
    const deltaX = Math.abs(x - posComp.x);
    const deltaY = Math.abs(y - posComp.y);
    if (deltaX > 1 || deltaY > 1) {
      console.warn(`Invalid tile interaction: Player ${playerId} tried to interact with tile (${x},${y}) from (${posComp.x},${posComp.y})`);
      return false;
    }
    
    // Check if player is alive for non-spectator actions
    if (!playerComp?.alive && action !== 'move') {
      console.warn(`Dead player ${playerId} tried to perform action: ${action}`);
      return false;
    }
    
    // Enhanced security validation if session credentials provided
    if (sessionId && sessionToken) {
      const validation = this.securityManager.validatePlayerAction(
        playerId,
        sessionId,
        sessionToken,
        action,
        { x, y },
        { x: posComp.x, y: posComp.y },
        playerComp?.alive
      );
      
      if (!validation.allowed) {
        console.warn(`Tile action blocked for ${playerId}: ${validation.reason}`);
        if (validation.shouldDisconnect) {
          this.handleSecurityViolation(playerId, validation.reason!);
        }
        return false;
      }
    }
    
    return this.gameLogicSystem.requestTileAction(playerId, x, y, action);
  }

  private handleExplosion(data: any): void {
    
    // Broadcast explosion to all clients
    if (this.serverInstance) {
      this.serverInstance.broadcast('explosion', data);
      
      // Send individual death messages for each killed player
      if (data.killedPlayers && data.killedPlayers.length > 0) {
        for (const killedPlayerId of data.killedPlayers) {
          this.serverInstance.broadcast('player-death', {
            playerId: killedPlayerId,
            reason: 'Killed by explosion',
            delay: 1500 // Delay popup to show explosion first
          });
        }
      }
    }
    
    // Update leaderboard after explosion
    this.networkSystem.broadcastLeaderboardUpdate();
  }

  // Network methods
  getViewportForPlayer(playerId: string, viewportWidth?: number, viewportHeight?: number): any {
    return this.networkSystem.getViewportForPlayer(playerId, viewportWidth, viewportHeight);
  }

  sendViewportUpdate(playerId: string, clientId: string, viewportWidth?: number, viewportHeight?: number): void {
    this.networkSystem.sendViewportUpdate(playerId, clientId, viewportWidth, viewportHeight);
  }

  broadcastPlayerUpdate(playerId: string): void {
    this.networkSystem.broadcastPlayerUpdate(playerId);
  }

  broadcastLeaderboardUpdate(): void {
    this.networkSystem.broadcastLeaderboardUpdate();
  }

  // Game state queries
  getPlayerEntity(playerId: string): Entity | undefined {
    return this.playerRegistry.getPlayerEntity(playerId);
  }

  getPlayerEntityByClientId(clientId: string): Entity | undefined {
    return this.playerRegistry.getPlayerEntityByClientId(clientId);
  }

  getPlayerEntityBySessionId(sessionId: string): Entity | undefined {
    return this.playerRegistry.getPlayerEntityBySessionId(sessionId);
  }

  removePlayer(playerId: string): void {
    const entity = this.playerRegistry.getPlayerEntity(playerId);
    if (entity) {
      this.playerRegistry.unregisterPlayer(playerId);
      this.entityManager.destroyEntity(entity);
    }
  }

  checkGameEnd(): boolean {
    return this.gameLogicSystem.checkGameEnd();
  }

  getObfuscatedMineProgress(): number {
    return this.gameLogicSystem.getObfuscatedMineProgress();
  }

  getGameState(): GameState {
    return { ...this.gameState };
  }

  update(deltaTime: number): void {
    this.entityManager.update(deltaTime);
  }

  // Lightweight update for animations only  
  updateAnimations(): void {
    // Only update non-critical systems like animations
    // Removed heavy ECS system updates for performance
  }

  // Security methods
  createSecurePlayerSession(playerId: string, username: string, metadata?: any): { sessionId: string; sessionToken: string } {
    return this.securityManager.createPlayerSession(playerId, username, metadata);
  }

  validatePlayerSession(sessionId: string, sessionToken: string): { valid: boolean; playerId?: string; username?: string } {
    return this.securityManager.validateSession(sessionId, sessionToken);
  }

  getPlayerSecurityStatus(playerId: string) {
    return this.securityManager.getPlayerSecurityStatus(playerId);
  }

  getSecurityDashboard() {
    return this.securityManager.getSecurityDashboard();
  }

  banPlayer(playerId: string, reason: string): void {
    this.securityManager.banPlayer(playerId, reason);
    
    // Also remove player from game
    this.removePlayer(playerId);
    
    // Broadcast player removal
    if (this.serverInstance) {
      this.serverInstance.broadcast('player-banned', {
        playerId,
        reason,
        timestamp: Date.now()
      });
    }
  }

  unbanPlayer(playerId: string): boolean {
    return this.securityManager.unbanPlayer(playerId);
  }

  private handleSecurityViolation(playerId: string, reason: string): void {
    console.error(`Security violation by player ${playerId}: ${reason}`);
    
    // For now, just log. Could be extended to auto-ban or disconnect
    const playerStatus = this.securityManager.getPlayerSecurityStatus(playerId);
    if (playerStatus.riskScore > 70) {
      console.warn(`Player ${playerId} has high risk score: ${playerStatus.riskScore}`);
    }
  }


  destroy(): void {
    this.entityManager.clear();
    this.tileRegistry.clear();
    this.playerRegistry.clear();
  }

  // Security component access (for advanced usage)
  getSecurityManager(): SecurityManager {
    return this.securityManager;
  }
}