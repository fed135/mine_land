import { Entity } from '../ecs/Entity.ts';
import type { PositionComponent } from '../components/PositionComponent.ts';
import type { PlayerComponent } from '../components/PlayerComponent.ts';

/**
 * Global player registry for O(1) player lookups
 * Maintains performance while using ECS architecture
 */
export class PlayerRegistry {
  private playerEntityMap = new Map<string, Entity>(); // playerId -> Entity
  private playerDataCache = new Map<string, PlayerComponent & PositionComponent>(); // Cached player data
  private clientIdMap = new Map<string, string>(); // clientId -> playerId
  private sessionIdMap = new Map<string, string>(); // sessionId -> playerId

  registerPlayer(entity: Entity, playerId: string, clientId?: string, sessionId?: string): void {
    // Remove existing mappings if they exist
    this.unregisterPlayer(playerId);

    this.playerEntityMap.set(playerId, entity);

    if (clientId) {
      this.clientIdMap.set(clientId, playerId);
    }

    if (sessionId) {
      this.sessionIdMap.set(sessionId, playerId);
    }

    this.updatePlayerCache(entity, playerId);
  }

  unregisterPlayer(playerId: string): void {
    const entity = this.playerEntityMap.get(playerId);
    if (entity) {
      const playerComp = entity.getComponent<PlayerComponent>('player');

      // Clean up all mappings
      this.playerEntityMap.delete(playerId);
      this.playerDataCache.delete(playerId);

      // Clean up reverse mappings
      for (const [clientId, pId] of this.clientIdMap.entries()) {
        if (pId === playerId) {
          this.clientIdMap.delete(clientId);
        }
      }

      for (const [sessionId, pId] of this.sessionIdMap.entries()) {
        if (pId === playerId) {
          this.sessionIdMap.delete(sessionId);
        }
      }
    }
  }

  getPlayerEntity(playerId: string): Entity | undefined {
    return this.playerEntityMap.get(playerId);
  }

  getPlayerEntityByClientId(clientId: string): Entity | undefined {
    const playerId = this.clientIdMap.get(clientId);
    return playerId ? this.getPlayerEntity(playerId) : undefined;
  }

  getPlayerEntityBySessionId(sessionId: string): Entity | undefined {
    const playerId = this.sessionIdMap.get(sessionId);
    return playerId ? this.getPlayerEntity(playerId) : undefined;
  }

  getPlayerData(playerId: string): (PlayerComponent & PositionComponent) | undefined {
    return this.playerDataCache.get(playerId);
  }

  updatePlayerCache(entity: Entity, playerId: string): void {
    const playerComp = entity.getComponent<PlayerComponent>('player');
    const posComp = entity.getComponent<PositionComponent>('position');

    if (playerComp && posComp) {
      this.playerDataCache.set(playerId, { ...playerComp, ...posComp });
    }
  }

  getAllPlayerEntities(): Map<string, Entity> {
    return new Map(this.playerEntityMap);
  }

  getAllPlayerData(): Map<string, PlayerComponent & PositionComponent> {
    return new Map(this.playerDataCache);
  }

  getConnectedPlayers(): Entity[] {
    const connectedPlayers: Entity[] = [];

    for (const entity of this.playerEntityMap.values()) {
      const playerComp = entity.getComponent<PlayerComponent>('player');
      if (playerComp && playerComp.connected) {
        connectedPlayers.push(entity);
      }
    }

    return connectedPlayers;
  }

  getAlivePlayers(): Entity[] {
    const alivePlayers: Entity[] = [];

    for (const entity of this.playerEntityMap.values()) {
      const playerComp = entity.getComponent<PlayerComponent>('player');
      if (playerComp && playerComp.alive) {
        alivePlayers.push(entity);
      }
    }

    return alivePlayers;
  }

  getPlayerCount(): number {
    return this.playerEntityMap.size;
  }

  clear(): void {
    this.playerEntityMap.clear();
    this.playerDataCache.clear();
    this.clientIdMap.clear();
    this.sessionIdMap.clear();
  }

  // Performance utility: Get players in viewport
  getPlayersInViewport(centerX: number, centerY: number, tilesX: number, tilesY: number): Entity[] {
    const playersInView: Entity[] = [];

    for (const entity of this.playerEntityMap.values()) {
      const posComp = entity.getComponent<PositionComponent>('position');
      if (posComp) {
        const dx = Math.abs(posComp.x - centerX);
        const dy = Math.abs(posComp.y - centerY);

        if (dx <= tilesX && dy <= tilesY) {
          playersInView.push(entity);
        }
      }
    }

    return playersInView;
  }
}
