// Network component for entities that need network synchronization
export interface NetworkComponent {
  clientId?: string; // Associated client connection ID
  needsSync: boolean; // Whether this entity needs network synchronization
  lastSyncTime: number; // Last time this entity was synchronized
}

export function createNetworkComponent(data: {
  clientId?: string;
  needsSync?: boolean;
}): NetworkComponent {
  return {
    clientId: data.clientId,
    needsSync: data.needsSync || false,
    lastSyncTime: Date.now()
  };
}
