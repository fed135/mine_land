import { Entity } from '../ecs/Entity.ts';
import type { PositionComponent } from '../components/PositionComponent.ts';
import type { TileComponent } from '../components/TileComponent.ts';

/**
 * Global tile registry for O(1) tile lookups by position
 * Maintains performance while using ECS architecture
 */
export class TileRegistry {
  private tileEntityMap = new Map<string, Entity>(); // "x,y" -> Entity
  private tileDataCache = new Map<string, TileComponent & PositionComponent>(); // Cached tile data for rendering

  registerTile(entity: Entity, x: number, y: number): void {
    const key = `${x},${y}`;

    // Remove existing tile at this position
    const existingEntity = this.tileEntityMap.get(key);
    if (existingEntity && existingEntity !== entity) {
      this.unregisterTile(x, y);
    }

    this.tileEntityMap.set(key, entity);
    this.updateTileCache(entity, x, y);
  }

  unregisterTile(x: number, y: number): void {
    const key = `${x},${y}`;
    this.tileEntityMap.delete(key);
    this.tileDataCache.delete(key);
  }

  getTileEntity(x: number, y: number): Entity | undefined {
    return this.tileEntityMap.get(`${x},${y}`);
  }

  getTileData(x: number, y: number): (TileComponent & PositionComponent) | undefined {
    return this.tileDataCache.get(`${x},${y}`);
  }

  hasTile(x: number, y: number): boolean {
    return this.tileEntityMap.has(`${x},${y}`);
  }

  updateTileCache(entity: Entity, x: number, y: number): void {
    const key = `${x},${y}`;
    const tileComp = entity.getComponent<TileComponent>('tile');
    const posComp = entity.getComponent<PositionComponent>('position');

    if (tileComp && posComp) {
      this.tileDataCache.set(key, { ...tileComp, ...posComp });
    }
  }

  getAllTileEntities(): Map<string, Entity> {
    return new Map(this.tileEntityMap);
  }

  getAllTileData(): Map<string, TileComponent & PositionComponent> {
    return new Map(this.tileDataCache);
  }

  getTileCount(): number {
    return this.tileEntityMap.size;
  }

  clear(): void {
    this.tileEntityMap.clear();
    this.tileDataCache.clear();
  }

  // Performance utility: Get tiles in a region
  getTilesInRegion(minX: number, minY: number, maxX: number, maxY: number): Entity[] {
    const tilesInRegion: Entity[] = [];

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        const tile = this.getTileEntity(x, y);
        if (tile) {
          tilesInRegion.push(tile);
        }
      }
    }

    return tilesInRegion;
  }
}
