// Rate limiting system for player actions
export interface RateLimitConfig {
  windowMs: number;  // Time window in milliseconds
  maxActions: number; // Maximum actions allowed in window
}

export interface ActionRecord {
  timestamp: number;
  action: string;
  data?: any;
}

export class RateLimiter {
  private playerActions = new Map<string, ActionRecord[]>();
  private configs = new Map<string, RateLimitConfig>();

  constructor() {
    // Default rate limits
    this.setRateLimit('move', { windowMs: 1000, maxActions: 10 }); // 10 moves per second
    this.setRateLimit('flip', { windowMs: 1000, maxActions: 5 });  // 5 flips per second
    this.setRateLimit('flag', { windowMs: 1000, maxActions: 5 });  // 5 flags per second
    this.setRateLimit('unflag', { windowMs: 1000, maxActions: 5 }); // 5 unflags per second
    this.setRateLimit('general', { windowMs: 1000, maxActions: 20 }); // 20 total actions per second
  }

  setRateLimit(actionType: string, config: RateLimitConfig): void {
    this.configs.set(actionType, config);
  }

  isAllowed(playerId: string, actionType: string, actionData?: any): boolean {
    const now = Date.now();
    
    // Get or create player action history
    if (!this.playerActions.has(playerId)) {
      this.playerActions.set(playerId, []);
    }
    
    const playerHistory = this.playerActions.get(playerId)!;
    
    // Check specific action type limit
    const specificConfig = this.configs.get(actionType);
    if (specificConfig && !this.checkLimit(playerHistory, actionType, specificConfig, now)) {
      console.warn(`Rate limit exceeded for player ${playerId}, action: ${actionType}`);
      return false;
    }
    
    // Check general rate limit
    const generalConfig = this.configs.get('general')!;
    if (!this.checkLimit(playerHistory, 'any', generalConfig, now)) {
      console.warn(`General rate limit exceeded for player ${playerId}`);
      return false;
    }
    
    // Record the action
    playerHistory.push({
      timestamp: now,
      action: actionType,
      data: actionData
    });
    
    return true;
  }

  private checkLimit(
    history: ActionRecord[], 
    actionType: string, 
    config: RateLimitConfig, 
    now: number
  ): boolean {
    // Remove old actions outside the window
    const windowStart = now - config.windowMs;
    const recentActions = history.filter(record => {
      const isInWindow = record.timestamp >= windowStart;
      const matchesType = actionType === 'any' || record.action === actionType;
      return isInWindow && matchesType;
    });
    
    // Update history to only keep recent actions
    if (actionType === 'any') {
      history.splice(0, history.length);
      history.push(...history.filter(r => r.timestamp >= windowStart));
    }
    
    return recentActions.length < config.maxActions;
  }

  // Get player action statistics for monitoring
  getPlayerStats(playerId: string): {
    totalActions: number;
    recentActions: number;
    actionBreakdown: Record<string, number>;
  } {
    const history = this.playerActions.get(playerId) || [];
    const now = Date.now();
    const recentWindow = now - 60000; // Last minute
    
    const recentActions = history.filter(r => r.timestamp >= recentWindow);
    const actionBreakdown: Record<string, number> = {};
    
    recentActions.forEach(record => {
      actionBreakdown[record.action] = (actionBreakdown[record.action] || 0) + 1;
    });
    
    return {
      totalActions: history.length,
      recentActions: recentActions.length,
      actionBreakdown
    };
  }

  // Clean up old data periodically
  cleanup(): void {
    const now = Date.now();
    const maxAge = 300000; // 5 minutes
    
    for (const [playerId, history] of this.playerActions.entries()) {
      const validActions = history.filter(r => now - r.timestamp < maxAge);
      
      if (validActions.length === 0) {
        this.playerActions.delete(playerId);
      } else {
        this.playerActions.set(playerId, validActions);
      }
    }
  }

  // Reset player limits (useful for testing or admin actions)
  resetPlayer(playerId: string): void {
    this.playerActions.delete(playerId);
  }
}