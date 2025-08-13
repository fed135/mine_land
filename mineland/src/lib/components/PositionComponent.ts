export interface PositionComponent {
    x: number;
    y: number;
}

export function createPositionComponent(x: number, y: number): PositionComponent {
	return { x, y };
}
