import { System } from '../ecs/System.ts';
import { Entity } from '../ecs/Entity.ts';
import type { PositionComponent } from '../components/PositionComponent.ts';
import type { PlayerComponent } from '../components/PlayerComponent.ts';
import { TileRegistry } from '../registries/TileRegistry.ts';
import { PlayerRegistry } from '../registries/PlayerRegistry.ts';

export interface MovementRequest {
  playerId: string;
  targetX: number;
  targetY: number;
}

/**
 * MovementSystem - Handles player movement with validation
 */
export class MovementSystem extends System {
  private tileRegistry: TileRegistry;
  private playerRegistry: PlayerRegistry;
  private movementRequests: MovementRequest[] = [];
  private readonly WORLD_SIZE: number;

  constructor(tileRegistry: TileRegistry, playerRegistry: PlayerRegistry, worldSize: number) {
    super();
    this.tileRegistry = tileRegistry;
    this.playerRegistry = playerRegistry;
    this.WORLD_SIZE = worldSize;
  }

  protected shouldProcessEntity(entity: Entity): boolean {
    return entity.hasComponent('position') && entity.hasComponent('player');
  }

  requestMovement(playerId: string, targetX: number, targetY: number): boolean {
    const playerEntity = this.playerRegistry.getPlayerEntity(playerId);
    if (!playerEntity) {
      console.warn(`MovementSystem: Player ${playerId} not found`);
      return false;
    }

    const playerComp = playerEntity.getComponent<PlayerComponent>('player');
    const posComp = playerEntity.getComponent<PositionComponent>('position');

    if (!playerComp || !posComp) {
      console.warn(`MovementSystem: Player ${playerId} missing components`);
      return false;
    }

    // Security: Enhanced movement validation
    if (!this.isValidPosition(targetX, targetY)) {
      console.warn(`MovementSystem: Player ${playerId} attempted invalid position: ${targetX}, ${targetY}`);
      return false;
    }

    if (!this.isAdjacent(posComp.x, posComp.y, targetX, targetY)) {
      console.warn(`MovementSystem: Player ${playerId} attempted non-adjacent move: from ${posComp.x},${posComp.y} to ${targetX},${targetY}`);
      return false;
    }

    if (!this.isTileWalkable(targetX, targetY)) {
      console.warn(`MovementSystem: Player ${playerId} attempted move to non-walkable tile: ${targetX}, ${targetY}`);
      return false;
    }

    if (!playerComp.alive) {
      console.warn(`MovementSystem: Dead player ${playerId} attempted movement`);
      return false;
    }

    // Process movement immediately instead of queuing to avoid race conditions
    this.processMovement({ playerId, targetX, targetY });
    return true;
  }

  update(deltaTime: number): void {
    // Movement requests are now processed immediately for better responsiveness
    // No queuing needed
  }

  private processMovement(request: MovementRequest): void {
    const playerEntity = this.playerRegistry.getPlayerEntity(request.playerId);
    if (!playerEntity) {
      return;
    }

    const posComp = playerEntity.getComponent<PositionComponent>('position');
    if (!posComp) {
      return;
    }

    // Update position
    posComp.x = request.targetX;
    posComp.y = request.targetY;

    // Update player registry cache
    this.playerRegistry.updatePlayerCache(playerEntity, request.playerId);
  }

  private isValidPosition(x: number, y: number): boolean {
    return x >= 0 && x < this.WORLD_SIZE && y >= 0 && y < this.WORLD_SIZE;
  }

  private isAdjacent(x1: number, y1: number, x2: number, y2: number): boolean {
    const deltaX = Math.abs(x1 - x2);
    const deltaY = Math.abs(y1 - y2);
    
    // Only allow orthogonal movement (Game Rules: up, down, left, right only)
    return (deltaX === 1 && deltaY === 0) || (deltaX === 0 && deltaY === 1);
  }

  private isTileWalkable(x: number, y: number): boolean {
    if (!this.isValidPosition(x, y)) {
      return false;
    }

    const tileEntity = this.tileRegistry.getTileEntity(x, y);
    if (!tileEntity) {
      return true; // Empty space is walkable
    }

    const tileComp = tileEntity.getComponent('tile');
    if (!tileComp) {
      return true;
    }

    // Game Rules: Covered tiles are not walkable
    if (!tileComp.revealed && !tileComp.flagged) {
      return false; // Covered tiles (not revealed, not flagged) are not walkable
    }

    // Revealed mines are not walkable
    if (tileComp.revealed && tileComp.type === 'mine') {
      return false;
    }

    // Flagged tiles are walkable (according to game rules)
    // Revealed non-mine tiles are walkable
    return true;
  }
}
