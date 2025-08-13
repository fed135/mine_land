import { Entity } from './Entity';

export abstract class System {
	protected entities: Entity[] = [];

    abstract update(deltaTime: number): void;

    addEntity(entity: Entity): void {
    	if (!this.entities.includes(entity)) {
    		this.entities.push(entity);
    	}
    }

    removeEntity(entity: Entity): void {
    	const index = this.entities.indexOf(entity);
    	if (index !== -1) {
    		this.entities.splice(index, 1);
    	}
    }

    getEntitiesWithComponents(...componentNames: string[]): Entity[] {
    	return this.entities.filter(entity =>
    		componentNames.every(name => entity.hasComponent(name))
    	);
    }

    destroy(): void {
    	this.entities = [];
    }
}
