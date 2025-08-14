import { System } from '../ecs/System.ts';
import { Entity } from '../ecs/Entity.ts';
import type { PositionComponent } from '../components/PositionComponent.ts';
import type { PlayerComponent } from '../components/PlayerComponent.ts';
import type { TileComponent } from '../components/TileComponent.ts';
import { TileRegistry } from '../registries/TileRegistry.ts';
import { PlayerRegistry } from '../registries/PlayerRegistry.ts';

export interface TileActionRequest {
  playerId: string;
  x: number;
  y: number;
  action: 'flip' | 'flag' | 'unflag';
}

/**
 * GameLogicSystem - Handles game logic like tile flipping, flagging, and explosions
 */
export class GameLogicSystem extends System {
  private tileRegistry: TileRegistry;
  private playerRegistry: PlayerRegistry;
  private explosionCallbacks: ((data: any) => void)[] = [];
  private readonly WORLD_SIZE: number;

  // Performance cache for mine counts
  private totalMines: number = 0;
  private flaggedMines: number = 0;
  private mineCountsInitialized: boolean = false;

  constructor(tileRegistry: TileRegistry, playerRegistry: PlayerRegistry, worldSize: number) {
    super();
    this.tileRegistry = tileRegistry;
    this.playerRegistry = playerRegistry;
    this.WORLD_SIZE = worldSize;
  }

  protected shouldProcessEntity(entity: Entity): boolean {
    return entity.hasComponent('tile') && entity.hasComponent('position');
  }

  requestTileAction(playerId: string, x: number, y: number, action: 'flip' | 'flag' | 'unflag'): boolean {
    const playerEntity = this.playerRegistry.getPlayerEntity(playerId);
    if (!playerEntity) {
      console.log(JSON.stringify({
        message: 'Player not found',
        playerId
      }));
      return false;
    }

    const playerComp = playerEntity.getComponent<PlayerComponent>('player');
    const playerPos = playerEntity.getComponent<PositionComponent>('position');

    if (!playerComp || !playerPos) {
      console.log(JSON.stringify({
        message: 'Player missing components',
        playerId
      }));
      return false;
    }

    // Security: Enhanced interaction validation
    if (!this.isValidPosition(x, y)) {
      console.log(JSON.stringify({
        message: 'Invalid position attempted',
        playerId,
        action,
        x,
        y
      }));
      return false;
    }

    if (!this.isAdjacent(playerPos.x, playerPos.y, x, y)) {
      console.log(JSON.stringify({
        message: 'Non-adjacent interaction attempted',
        playerId,
        action,
        playerX: playerPos.x,
        playerY: playerPos.y,
        tileX: x,
        tileY: y
      }));
      return false;
    }

    if (!playerComp.alive) {
      console.log(JSON.stringify({
        message: 'Dead player attempted action',
        playerId,
        action
      }));
      return false;
    }

    // Additional validation for flagging
    if (action === 'flag' && playerComp.flags <= 0) {
      console.log(JSON.stringify({
        message: 'Flag attempt with no flags remaining',
        playerId
      }));
      return false;
    }

    // Process action immediately instead of queuing
    this.processTileAction({ playerId, x, y, action });
    return true;
  }

  onExplosion(callback: (data: any) => void): void {
    this.explosionCallbacks.push(callback);
  }

  // No update method needed - tile actions are processed immediately via requestTileAction()

  private processTileAction(request: TileActionRequest): void {
    switch (request.action) {
      case 'flip':
        this.handleTileFlip(request.playerId, request.x, request.y);
        break;
      case 'flag':
        this.handleTileFlag(request.playerId, request.x, request.y);
        break;
      case 'unflag':
        this.handleTileUnflag(request.playerId, request.x, request.y);
        break;
    }
  }

  private handleTileFlip(playerId: string, x: number, y: number): void {
    const tileEntity = this.tileRegistry.getTileEntity(x, y);
    if (!tileEntity) {
      return;
    }

    const tileComp = tileEntity.getComponent<TileComponent>('tile');
    if (!tileComp || tileComp.revealed || tileComp.flagged) {
      return;
    }

    const playerEntity = this.playerRegistry.getPlayerEntity(playerId);
    if (!playerEntity) {
      return;
    }

    const playerComp = playerEntity.getComponent<PlayerComponent>('player');
    if (!playerComp) {
      return;
    }

    // Reveal the tile
    tileComp.revealed = true;

    // Update caches
    this.tileRegistry.updateTileCache(tileEntity, x, y);

    // Handle mine explosion
    if (tileComp.type === 'mine') {
      const explosionData = this.handleExplosion(x, y, playerEntity);

      // Trigger explosion callbacks
      for (const callback of this.explosionCallbacks) {
        callback(explosionData);
      }
    } else if (tileComp.type === 'flag_token') {
      // Award flag token
      playerComp.flags += 1;
      playerComp.score += 1;
      this.playerRegistry.updatePlayerCache(playerEntity, playerId);
    } else if (tileComp.type === 'empty') {
      // Mine Land rule: Only reveal the clicked tile, no auto-reveal
      // The clicked tile is already revealed above
    }

    // Award points for revealing tiles
    if (tileComp.type !== 'mine') {
      playerComp.score += 1;
      this.playerRegistry.updatePlayerCache(playerEntity, playerId);
    }
  }

  private handleTileFlag(playerId: string, x: number, y: number): void {
    const tileEntity = this.tileRegistry.getTileEntity(x, y);
    if (!tileEntity) {
      return;
    }

    const tileComp = tileEntity.getComponent<TileComponent>('tile');
    if (!tileComp || tileComp.revealed || tileComp.flagged) {
      return;
    }

    const playerEntity = this.playerRegistry.getPlayerEntity(playerId);
    if (!playerEntity) {
      return;
    }

    const playerComp = playerEntity.getComponent<PlayerComponent>('player');
    if (!playerComp || playerComp.flags <= 0) {
      return;
    }

    // Place flag
    tileComp.flagged = true;
    tileComp.flaggedBy = playerId;
    playerComp.flags -= 1;

    // Update mine count cache
    if (tileComp.type === 'mine') {
      this.flaggedMines++;
      playerComp.score += 3;
    }

    // Update caches
    this.tileRegistry.updateTileCache(tileEntity, x, y);
    this.playerRegistry.updatePlayerCache(playerEntity, playerId);
  }

  private handleTileUnflag(playerId: string, x: number, y: number): void {
    // Flags cannot be removed once placed - game rule
    console.log(JSON.stringify({
      message: 'Unflag attempt blocked',
      playerId,
      x,
      y,
      reason: 'Flags cannot be removed once placed'
    }));
  }

  private handleExplosion(x: number, y: number, playerEntity: Entity): any {
    const affectedTiles: any[] = [];
    const killedPlayers: string[] = [];

    // Kill the player who triggered the mine
    const playerComp = playerEntity.getComponent<PlayerComponent>('player');
    if (playerComp && playerComp.alive) {
      playerComp.alive = false;
      killedPlayers.push(playerComp.id);
      this.playerRegistry.updatePlayerCache(playerEntity, playerComp.id);
    }

    // Create explosion effect and kill players in circular radius of 2 tiles
    const explosionRadius = 2;

    for (let dx = -explosionRadius; dx <= explosionRadius; dx++) {
      for (let dy = -explosionRadius; dy <= explosionRadius; dy++) {
        const explosionX = x + dx;
        const explosionY = y + dy;

        // Calculate distance from center - use circular radius
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance > explosionRadius) {
          continue; // Skip tiles outside circular radius
        }

        if (this.isValidPosition(explosionX, explosionY)) {
          // Create visual explosion effect
          const explosionTileEntity = this.tileRegistry.getTileEntity(explosionX, explosionY);
          if (explosionTileEntity) {
            const explosionTileComp = explosionTileEntity.getComponent<TileComponent>('tile');
            if (explosionTileComp) {
              // Keep the center tile as a mine for visual, others become explosions
              const isCenterTile = (explosionX === x && explosionY === y);
              if (!isCenterTile) {
                explosionTileComp.type = 'explosion';
              }
              explosionTileComp.revealed = true;
              explosionTileComp.exploded = true;
              this.tileRegistry.updateTileCache(explosionTileEntity, explosionX, explosionY);

              affectedTiles.push({
                x: explosionX,
                y: explosionY,
                type: isCenterTile ? 'mine' : 'explosion',
                revealed: true,
                exploded: true
              });
            }
          }

          // Check for players at this explosion position (circular area)
          for (const otherPlayerEntity of this.playerRegistry.getAlivePlayers()) {
            const otherPlayerPos = otherPlayerEntity.getComponent<PositionComponent>('position');
            const otherPlayerComp = otherPlayerEntity.getComponent<PlayerComponent>('player');

            if (otherPlayerPos && otherPlayerComp && otherPlayerComp.alive) {
              // Kill players in the circular explosion area
              if (otherPlayerPos.x === explosionX && otherPlayerPos.y === explosionY) {
                otherPlayerComp.alive = false;
                killedPlayers.push(otherPlayerComp.id);
                this.playerRegistry.updatePlayerCache(otherPlayerEntity, otherPlayerComp.id);
              }
            }
          }
        }
      }
    }

    // Trigger explosion callbacks
    const explosionData = {
      x,
      y,
      affectedTiles,
      killedPlayers
    };

    return explosionData;
  }

  private isValidPosition(x: number, y: number): boolean {
    return x >= 0 && x < this.WORLD_SIZE && y >= 0 && y < this.WORLD_SIZE;
  }

  private isAdjacent(x1: number, y1: number, x2: number, y2: number): boolean {
    const deltaX = Math.abs(x1 - x2);
    const deltaY = Math.abs(y1 - y2);

    // Allow both orthogonal and diagonal for tile interactions (as per game rules line 23)
    return deltaX <= 1 && deltaY <= 1 && !(deltaX === 0 && deltaY === 0);
  }

  // Initialize mine counts cache (called once during world generation)
  initializeMineCountsCache(): void {
    if (this.mineCountsInitialized) {
      return;
    }

    this.totalMines = 0;
    this.flaggedMines = 0;

    for (const [, tileData] of this.tileRegistry.getAllTileData()) {
      if (tileData.type === 'mine') {
        this.totalMines++;
        if (tileData.flagged) {
          this.flaggedMines++;
        }
      }
    }

    this.mineCountsInitialized = true;
  }

  // Game state queries - now using cached values
  checkGameEnd(): boolean {
    if (!this.mineCountsInitialized) {
      this.initializeMineCountsCache();
    }
    return this.totalMines - this.flaggedMines <= 0;
  }

  getObfuscatedMineProgress(): number {
    if (!this.mineCountsInitialized) {
      this.initializeMineCountsCache();
    }
    return this.totalMines > 0 ? Math.floor((this.flaggedMines / this.totalMines) * 100) : 0;
  }
}
