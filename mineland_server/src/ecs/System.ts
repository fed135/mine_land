import { Entity } from './Entity.ts';

// Base System class
export abstract class System {
  protected entities = new Set<Entity>();
  protected active = true;

  update(deltaTime: number): void {
    // Default empty implementation - override if needed for periodic processing
  }

  addEntity(entity: Entity): void {
    if (this.shouldProcessEntity(entity)) {
      this.entities.add(entity);
      this.onEntityAdded(entity);
    }
  }

  removeEntity(entity: Entity): void {
    if (this.entities.has(entity)) {
      this.entities.delete(entity);
      this.onEntityRemoved(entity);
    }
  }

  protected shouldProcessEntity(entity: Entity): boolean {
    // Override in subclasses to define component requirements
    return true;
  }

  protected onEntityAdded(entity: Entity): void {
    // Override in subclasses for entity addition logic
  }

  protected onEntityRemoved(entity: Entity): void {
    // Override in subclasses for entity removal logic
  }

  getEntities(): Set<Entity> {
    return new Set(this.entities);
  }

  isActive(): boolean {
    return this.active;
  }

  setActive(active: boolean): void {
    this.active = active;
  }

  destroy(): void {
    this.entities.clear();
    this.active = false;
  }
}
