// Tile component for game tiles
export type TileType = 'covered' | 'empty' | 'numbered' | 'mine' | 'flag_token' | 'explosion';

export interface TileComponent {
  type: TileType;
  revealed: boolean;
  flagged: boolean;
  flaggedBy?: string;
  number?: number; // For numbered tiles (1-8)
  exploded?: boolean;
}

export function createTileComponent(data: {
  type: TileType;
  revealed?: boolean;
  flagged?: boolean;
  flaggedBy?: string;
  number?: number;
  exploded?: boolean;
}): TileComponent {
  return {
    type: data.type,
    revealed: data.revealed || false,
    flagged: data.flagged || false,
    flaggedBy: data.flaggedBy,
    number: data.number,
    exploded: data.exploded || false
  };
}
