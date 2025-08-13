// Player component for player entities
export interface PlayerComponent {
  id: string;
  username: string;
  score: number;
  flags: number;
  alive: boolean;
  connected: boolean;
  color?: string;
  sessionId?: string;
}

export function createPlayerComponent(data: {
  id: string;
  username: string;
  score?: number;
  flags?: number;
  alive?: boolean;
  connected?: boolean;
  color?: string;
  sessionId?: string;
}): PlayerComponent {
  return {
    id: data.id,
    username: data.username,
    score: data.score || 0,
    flags: data.flags || 10, // Default starting flags
    alive: data.alive !== false, // Default to alive unless explicitly false
    connected: data.connected !== false, // Default to connected unless explicitly false
    color: data.color,
    sessionId: data.sessionId
  };
}
