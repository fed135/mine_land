import { Entity } from './Entity.ts';
import { System } from './System.ts';

// EntityManager - Manages entities and systems
export class EntityManager {
  private entities = new Set<Entity>();
  private systems = new Map<string, System>();

  createEntity(): Entity {
    const entity = new Entity();
    this.entities.add(entity);

    // Add to relevant systems
    for (const system of this.systems.values()) {
      system.addEntity(entity);
    }

    return entity;
  }

  destroyEntity(entity: Entity): void {
    // Immediate destruction - no deferred processing needed for server
    this.entities.delete(entity);

    // Remove from all systems
    for (const system of this.systems.values()) {
      system.removeEntity(entity);
    }

    entity.destroy();
  }

  addSystem(name: string, system: System): void {
    this.systems.set(name, system);

    // Add all existing entities to the new system
    for (const entity of this.entities) {
      system.addEntity(entity);
    }
  }

  getSystem<T extends System>(name: string): T | undefined {
    return this.systems.get(name) as T;
  }

  removeSystem(name: string): void {
    const system = this.systems.get(name);
    if (system) {
      system.destroy();
      this.systems.delete(name);
    }
  }

  // Re-evaluate entity for all systems (call when components change)
  reevaluateEntity(entity: Entity): void {
    for (const system of this.systems.values()) {
      const currentlyInSystem = system.getEntities().has(entity);
      const shouldBeInSystem = system['shouldProcessEntity'](entity);

      if (shouldBeInSystem && !currentlyInSystem) {
        system.addEntity(entity);
      } else if (!shouldBeInSystem && currentlyInSystem) {
        system.removeEntity(entity);
      }
    }
  }

  // No update method needed - server processes all actions synchronously via WebSocket events

  getEntities(): Set<Entity> {
    return new Set(this.entities);
  }

  getEntityCount(): number {
    return this.entities.size;
  }

  clear(): void {
    // Destroy all entities
    for (const entity of this.entities) {
      entity.destroy();
    }
    this.entities.clear();

    // Destroy all systems
    for (const system of this.systems.values()) {
      system.destroy();
    }
    this.systems.clear();
  }
}
