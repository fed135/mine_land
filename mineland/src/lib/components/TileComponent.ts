export type TileType = 'empty' | 'numbered' | 'mine' | 'explosion' | 'flag_token';

export interface TileComponent {
    type: TileType;
    revealed: boolean;
    flagged: boolean;
    exploded: boolean;
    number?: number;
}

export function createTileComponent(data: {
    type: TileType;
    revealed?: boolean;
    flagged?: boolean;
    exploded?: boolean;
    number?: number;
}): TileComponent {
	return {
		type: data.type,
		revealed: data.revealed || false,
		flagged: data.flagged || false,
		exploded: data.exploded || false,
		number: data.number
	};
}
