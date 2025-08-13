// ECS Entity - Container for components
export class Entity {
  private static nextId = 1;

  public readonly id: number;
  private components = new Map<string, any>();
  private active = true;

  constructor() {
    this.id = Entity.nextId++;
  }

  addComponent<T>(name: string, component: T): void {
    this.components.set(name, component);
  }

  getComponent<T>(name: string): T | undefined {
    return this.components.get(name) as T;
  }

  hasComponent(name: string): boolean {
    return this.components.has(name);
  }

  removeComponent(name: string): void {
    this.components.delete(name);
  }

  getComponents(): Map<string, any> {
    return new Map(this.components);
  }

  isActive(): boolean {
    return this.active;
  }

  setActive(active: boolean): void {
    this.active = active;
  }

  destroy(): void {
    this.components.clear();
    this.active = false;
  }
}
