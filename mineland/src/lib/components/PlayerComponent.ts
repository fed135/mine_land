export interface PlayerComponent {
    id: string;
    username: string;
    color: string;
    score: number;
    flags: number;
    alive: boolean;
    connected: boolean;
    sessionId?: string;
}

export function createPlayerComponent(data: {
    id: string;
    username: string;
    color?: string;
    score?: number;
    flags?: number;
    alive?: boolean;
    connected?: boolean;
    sessionId?: string;
}): PlayerComponent {
	return {
		id: data.id,
		username: data.username,
		color: data.color || '#0088ff',
		score: data.score || 0,
		flags: data.flags || 3,
		alive: data.alive ?? true,
		connected: data.connected ?? true,
		sessionId: data.sessionId
	};
}
