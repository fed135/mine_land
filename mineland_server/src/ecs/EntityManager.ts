import { Entity } from './Entity.ts';
import { System } from './System.ts';

// EntityManager - Manages entities and systems
export class EntityManager {
  private entities = new Set<Entity>();
  private systems = new Map<string, System>();
  private entitiesToDestroy = new Set<Entity>();

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
    this.entitiesToDestroy.add(entity);
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

  update(deltaTime: number): void {
    // Clean up entities marked for destruction
    for (const entity of this.entitiesToDestroy) {
      this.entities.delete(entity);

      // Remove from all systems
      for (const system of this.systems.values()) {
        system.removeEntity(entity);
      }

      entity.destroy();
    }
    this.entitiesToDestroy.clear();

    // Update all active systems
    for (const system of this.systems.values()) {
      if (system.isActive()) {
        system.update(deltaTime);
      }
    }
  }

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
    this.entitiesToDestroy.clear();

    // Destroy all systems
    for (const system of this.systems.values()) {
      system.destroy();
    }
    this.systems.clear();
  }
}
