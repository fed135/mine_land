import { System } from '../ecs/System.ts';
import { Entity } from '../ecs/Entity.ts';
import type { PositionComponent } from '../components/PositionComponent.ts';
import type { PlayerComponent } from '../components/PlayerComponent.ts';
import type { TileComponent } from '../components/TileComponent.ts';
import type { NetworkComponent } from '../components/NetworkComponent.ts';
import { TileRegistry } from '../registries/TileRegistry.ts';
import { PlayerRegistry } from '../registries/PlayerRegistry.ts';

/**
 * NetworkSystem - Handles network synchronization and viewport management
 */
export class NetworkSystem extends System {
  private tileRegistry: TileRegistry;
  private playerRegistry: PlayerRegistry;
  private serverInstance: any; // Kalm server instance
  private readonly WORLD_SIZE: number;

  constructor(tileRegistry: TileRegistry, playerRegistry: PlayerRegistry, worldSize: number) {
    super();
    this.tileRegistry = tileRegistry;
    this.playerRegistry = playerRegistry;
    this.WORLD_SIZE = worldSize;
  }

  protected shouldProcessEntity(entity: Entity): boolean {
    return entity.hasComponent('network');
  }

  setServerInstance(server: any): void {
    this.serverInstance = server;
  }

  // No update method needed - networking is handled immediately via direct broadcasts

  private syncPlayerToNetwork(entity: Entity): void {
    const playerComp = entity.getComponent<PlayerComponent>('player');
    const posComp = entity.getComponent<PositionComponent>('position');
    const networkComp = entity.getComponent<NetworkComponent>('network');

    if (playerComp && posComp && networkComp && this.serverInstance) {
      // Broadcast player update to all clients
      this.serverInstance.broadcast('player-update', {
        player: {
          id: playerComp.id,
          username: playerComp.username,
          x: posComp.x,
          y: posComp.y,
          score: playerComp.score,
          flags: playerComp.flags,
          alive: playerComp.alive,
          connected: playerComp.connected,
          color: playerComp.color
        }
      });
    }
  }

  // Security: Sanitize tile data for client transmission
  sanitizeTileForClient(tileData: TileComponent & PositionComponent, playerId: string): (TileComponent & PositionComponent) | null {
    const playerEntity = this.playerRegistry.getPlayerEntity(playerId);
    if (!playerEntity) {
      return null;
    }

    const playerPos = playerEntity.getComponent<PositionComponent>('position');
    if (!playerPos) {
      return null;
    }

    // Check if tile should be visible to client
    const isRevealed = tileData.revealed;
    const isFlagged = tileData.flagged;
    const isAdjacentToPlayer = Math.abs(tileData.x - playerPos.x) <= 1 && Math.abs(tileData.y - playerPos.y) <= 1;

    // Only send tiles that are revealed, flagged, or adjacent to player (for movement validation)
    if (!isRevealed && !isFlagged && !isAdjacentToPlayer) {
      return null; // Don't send this tile to client
    }

    // Create sanitized copy
    const sanitizedTile: TileComponent & PositionComponent = {
      x: tileData.x,
      y: tileData.y,
      revealed: tileData.revealed,
      flagged: tileData.flagged,
      flaggedBy: tileData.flaggedBy,
      // Security: Hide sensitive information for unrevealed tiles
      type: isRevealed ? tileData.type : 'covered',
      number: isRevealed ? tileData.number : undefined,
      exploded: isRevealed ? tileData.exploded : undefined
    };

    return sanitizedTile;
  }

  // Get viewport data for a specific player
  getViewportForPlayer(playerId: string, viewportWidth?: number, viewportHeight?: number): any {
    const playerEntity = this.playerRegistry.getPlayerEntity(playerId);
    if (!playerEntity) {
      return { tiles: [], players: [] };
    }

    const playerPos = playerEntity.getComponent<PositionComponent>('position');
    if (!playerPos) {
      return { tiles: [], players: [] };
    }

    // Calculate viewport bounds
    const defaultTilesX = Math.min(50, 100);
    const defaultTilesY = Math.min(40, 100);
    const tilesX = viewportWidth ? Math.min(viewportWidth, 100) : defaultTilesX;
    const tilesY = viewportHeight ? Math.min(viewportHeight, 100) : defaultTilesY;

    // Get sanitized tiles
    const tiles: any[] = [];
    for (let x = playerPos.x - tilesX; x <= playerPos.x + tilesX; x++) {
      for (let y = playerPos.y - tilesY; y <= playerPos.y + tilesY; y++) {
        if (x >= 0 && x < this.WORLD_SIZE && y >= 0 && y < this.WORLD_SIZE) {
          const tileData = this.tileRegistry.getTileData(x, y);
          if (tileData) {
            const sanitizedTile = this.sanitizeTileForClient(tileData, playerId);
            if (sanitizedTile) {
              tiles.push(sanitizedTile);
            }
          }
        }
      }
    }

    // Get players in viewport
    const playersInView = this.playerRegistry.getPlayersInViewport(playerPos.x, playerPos.y, tilesX, tilesY);
    const players = playersInView.map(playerEntity => {
      const pComp = playerEntity.getComponent<PlayerComponent>('player');
      const pPos = playerEntity.getComponent<PositionComponent>('position');

      return {
        id: pComp?.id,
        username: pComp?.username,
        x: pPos?.x,
        y: pPos?.y,
        score: pComp?.score,
        flags: pComp?.flags,
        alive: pComp?.alive,
        connected: pComp?.connected,
        color: pComp?.color
      };
    }).filter(player => player.id && player.connected);

    return { tiles, players };
  }

  // Send viewport update to specific player
  sendViewportUpdate(playerId: string, clientId: string, viewportWidth?: number, viewportHeight?: number): void {
    if (!this.serverInstance) {
      return;
    }

    const viewport = this.getViewportForPlayer(playerId, viewportWidth, viewportHeight);

    // Broadcast viewport update with player-specific targeting
    // The client will filter this based on their playerId
    this.serverInstance.broadcast('viewport-update', {
      targetPlayerId: playerId,
      ...viewport
    });
  }

  // Broadcast player state change
  broadcastPlayerUpdate(playerId: string): void {
    const playerEntity = this.playerRegistry.getPlayerEntity(playerId);
    if (!playerEntity || !this.serverInstance) {
      return;
    }

    const playerComp = playerEntity.getComponent<PlayerComponent>('player');
    const posComp = playerEntity.getComponent<PositionComponent>('position');

    if (playerComp && posComp) {
      this.serverInstance.broadcast('player-update', {
        player: {
          id: playerComp.id,
          username: playerComp.username,
          x: posComp.x,
          y: posComp.y,
          score: playerComp.score,
          flags: playerComp.flags,
          alive: playerComp.alive,
          connected: playerComp.connected,
          color: playerComp.color
        }
      });
    }
  }

  // Broadcast leaderboard update
  broadcastLeaderboardUpdate(): void {
    if (!this.serverInstance) {
      return;
    }

    const players = Array.from(this.playerRegistry.getAllPlayerData().values())
      .filter(player => player.connected && player.score > 0)
      .map(player => ({
        id: player.id,
        username: player.username,
        score: player.score,
        flags: player.flags,
        alive: player.alive,
        color: player.color
      }));

    this.serverInstance.broadcast('leaderboard-update', { players });
  }
}
