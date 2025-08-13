// Position component for entities with x,y coordinates
export interface PositionComponent {
  x: number;
  y: number;
}

export function createPositionComponent(x: number, y: number): PositionComponent {
  return { x, y };
}
