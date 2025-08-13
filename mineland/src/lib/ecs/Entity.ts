let nextEntityId = 1;

export class Entity {
	public readonly id: number;
	private components: Map<string, any> = new Map();

	constructor() {
		this.id = nextEntityId++;
	}

	addComponent<T>(componentName: string, component: T): void {
		this.components.set(componentName, component);
	}

	getComponent<T>(componentName: string): T | undefined {
		return this.components.get(componentName);
	}

	hasComponent(componentName: string): boolean {
		return this.components.has(componentName);
	}

	removeComponent(componentName: string): void {
		this.components.delete(componentName);
	}

	getAllComponents(): Map<string, any> {
		return new Map(this.components);
	}

	destroy(): void {
		this.components.clear();
	}
}
