import { Entity } from './Entity';
import { System } from './System';

export class EntityManager {
	private entities: Map<number, Entity> = new Map();
	private systems: System[] = [];

	createEntity(): Entity {
		const entity = new Entity();
		this.entities.set(entity.id, entity);

		// Add entity to all systems
		this.systems.forEach(system => system.addEntity(entity));

		return entity;
	}

	getEntity(id: number): Entity | undefined {
		return this.entities.get(id);
	}

	destroyEntity(entity: Entity): void {
		// Remove entity from all systems
		this.systems.forEach(system => system.removeEntity(entity));

		// Clean up entity
		entity.destroy();
		this.entities.delete(entity.id);
	}

	addSystem(system: System): void {
		this.systems.push(system);

		// Add all existing entities to the new system
		this.entities.forEach(entity => system.addEntity(entity));
	}

	removeSystem(system: System): void {
		const index = this.systems.indexOf(system);
		if (index !== -1) {
			system.destroy();
			this.systems.splice(index, 1);
		}
	}

	update(deltaTime: number): void {
		this.systems.forEach(system => system.update(deltaTime));
	}

	getEntitiesWithComponents(...componentNames: string[]): Entity[] {
		return Array.from(this.entities.values()).filter(entity =>
			componentNames.every(name => entity.hasComponent(name))
		);
	}

	getAllEntities(): Entity[] {
		return Array.from(this.entities.values());
	}

	destroy(): void {
		// Destroy all systems
		this.systems.forEach(system => system.destroy());
		this.systems = [];

		// Destroy all entities
		this.entities.forEach(entity => entity.destroy());
		this.entities.clear();
	}
}
