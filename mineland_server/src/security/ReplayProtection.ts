// Action replay protection system
import crypto from 'crypto';

export interface ActionSignature {
  playerId: string;
  actionType: string;
  actionData: any;
  timestamp: number;
  hash: string;
}

export interface ReplayAttempt {
  playerId: string;
  originalAction: ActionSignature;
  replayAttempts: number;
  lastAttempt: number;
}

export class ReplayProtection {
  private actionHistory = new Map<string, ActionSignature>();
  private replayAttempts = new Map<string, ReplayAttempt>();
  private readonly HISTORY_DURATION = 300000; // 5 minutes
  private readonly MAX_REPLAY_ATTEMPTS = 3;

  // Generate unique hash for an action
  private generateActionHash(playerId: string, actionType: string, actionData: any, timestamp: number): string {
    const actionString = JSON.stringify({
      playerId,
      actionType,
      actionData,
      timestamp: Math.floor(timestamp / 1000) // Round to nearest second to prevent micro-timing abuse
    });

    return crypto.createHash('sha256').update(actionString).digest('hex');
  }

  // Check if action would be a replay (read-only, doesn't record)
  checkForReplay(playerId: string, actionType: string, actionData: any): {
    isReplay: boolean;
    signature?: ActionSignature;
  } {
    const now = Date.now();
    const hash = this.generateActionHash(playerId, actionType, actionData, now);

    // Check if we've seen this exact action before
    const existingAction = this.actionHistory.get(hash);

    if (existingAction) {
      // This is a potential replay
      const timeDiff = now - existingAction.timestamp;

      // If the action is within the suspicious timeframe (< 100ms), it's likely a replay
      if (timeDiff < 100) {
        return {
          isReplay: true,
          signature: existingAction
        };
      }
    }

    return { isReplay: false };
  }

  // Check if action is a replay (records action)
  isReplayAction(playerId: string, actionType: string, actionData: any): {
    isReplay: boolean;
    signature?: ActionSignature;
    replayInfo?: ReplayAttempt;
  } {
    const now = Date.now();
    const hash = this.generateActionHash(playerId, actionType, actionData, now);

    // Check if we've seen this exact action before
    const existingAction = this.actionHistory.get(hash);

    if (existingAction) {
      // This is a potential replay
      const timeDiff = now - existingAction.timestamp;

      // If the action is within the suspicious timeframe (< 100ms), it's likely a replay
      if (timeDiff < 100) {
        this.recordReplayAttempt(playerId, existingAction);

        return {
          isReplay: true,
          signature: existingAction,
          replayInfo: this.replayAttempts.get(playerId)
        };
      }

      // If it's been longer, update the existing action timestamp
      existingAction.timestamp = now;
    } else {
      // New action, record it
      const signature: ActionSignature = {
        playerId,
        actionType,
        actionData,
        timestamp: now,
        hash
      };

      this.actionHistory.set(hash, signature);
    }

    return { isReplay: false };
  }

  // Record replay attempt
  private recordReplayAttempt(playerId: string, originalAction: ActionSignature): void {
    const now = Date.now();
    const existingReplay = this.replayAttempts.get(playerId);

    if (existingReplay) {
      existingReplay.replayAttempts++;
      existingReplay.lastAttempt = now;
    } else {
      this.replayAttempts.set(playerId, {
        playerId,
        originalAction,
        replayAttempts: 1,
        lastAttempt: now
      });
    }

    const replayCount = existingReplay ? existingReplay.replayAttempts : 1;

  }

  // Check if player has excessive replay attempts
  hasExcessiveReplays(playerId: string): boolean {
    const replayInfo = this.replayAttempts.get(playerId);
    return replayInfo ? replayInfo.replayAttempts >= this.MAX_REPLAY_ATTEMPTS : false;
  }

  // Get player replay statistics
  getPlayerReplayStats(playerId: string): {
    totalReplays: number;
    lastReplayAttempt?: number;
    isExcessive: boolean;
  } {
    const replayInfo = this.replayAttempts.get(playerId);

    return {
      totalReplays: replayInfo ? replayInfo.replayAttempts : 0,
      lastReplayAttempt: replayInfo ? replayInfo.lastAttempt : undefined,
      isExcessive: this.hasExcessiveReplays(playerId)
    };
  }

  // Check for duplicate actions within a time window
  isDuplicateAction(
    playerId: string,
    actionType: string,
    actionData: any,
    timeWindow: number = 1000
  ): boolean {
    const now = Date.now();
    const recentActions: ActionSignature[] = [];

    // Find recent actions by this player
    for (const signature of this.actionHistory.values()) {
      if (signature.playerId === playerId &&
          signature.actionType === actionType &&
          now - signature.timestamp < timeWindow) {
        recentActions.push(signature);
      }
    }

    // Check if any recent action has the same data
    return recentActions.some(action => {
      return JSON.stringify(action.actionData) === JSON.stringify(actionData);
    });
  }

  // Validate action sequence (prevent impossible rapid sequences)
  validateActionSequence(playerId: string, actionType: string): {
    isValid: boolean;
    reason?: string;
  } {
    const now = Date.now();
    const playerActions: ActionSignature[] = [];

    // Get recent actions by this player
    for (const signature of this.actionHistory.values()) {
      if (signature.playerId === playerId && now - signature.timestamp < 5000) { // Last 5 seconds
        playerActions.push(signature);
      }
    }

    playerActions.sort((a, b) => a.timestamp - b.timestamp);

    // Check for impossible action sequences
    if (playerActions.length >= 10) { // More than 10 actions in 5 seconds
      const timeSpan = playerActions[playerActions.length - 1].timestamp - playerActions[0].timestamp;
      if (timeSpan < 1000) { // All within 1 second
        return {
          isValid: false,
          reason: `Too many actions in short timespan: ${playerActions.length} actions in ${timeSpan}ms`
        };
      }
    }

    // Check for alternating flag/unflag spam
    if (playerActions.length >= 6) {
      const lastSix = playerActions.slice(-6);
      const isAlternatingFlagSpam = lastSix.every((action, index) => {
        if (index === 0) {
          return true;
        }
        const prevAction = lastSix[index - 1];
        return (action.actionType === 'flag' && prevAction.actionType === 'unflag') ||
               (action.actionType === 'unflag' && prevAction.actionType === 'flag');
      });

      if (isAlternatingFlagSpam) {
        return {
          isValid: false,
          reason: 'Detected flag/unflag spam pattern'
        };
      }
    }

    return { isValid: true };
  }

  // Get all replay attempts for monitoring
  getAllReplayAttempts(): ReplayAttempt[] {
    return Array.from(this.replayAttempts.values())
      .sort((a, b) => b.lastAttempt - a.lastAttempt);
  }

  // Clean up old data
  cleanup(): void {
    const now = Date.now();
    const expiredHashes: string[] = [];
    const expiredPlayers: string[] = [];

    // Clean up action history
    for (const [hash, signature] of this.actionHistory.entries()) {
      if (now - signature.timestamp > this.HISTORY_DURATION) {
        expiredHashes.push(hash);
      }
    }

    expiredHashes.forEach(hash => {
      this.actionHistory.delete(hash);
    });

    // Clean up replay attempts (keep for longer for monitoring)
    for (const [playerId, replayInfo] of this.replayAttempts.entries()) {
      if (now - replayInfo.lastAttempt > this.HISTORY_DURATION * 2) { // 10 minutes
        expiredPlayers.push(playerId);
      }
    }

    expiredPlayers.forEach(playerId => {
      this.replayAttempts.delete(playerId);
    });

    if (expiredHashes.length > 0 || expiredPlayers.length > 0) {
    }
  }

  // Get system statistics
  getStats(): {
    totalActions: number;
    totalReplays: number;
    playersWithReplays: number;
    excessiveReplayPlayers: number;
    } {
    const totalActions = this.actionHistory.size;
    const replayAttempts = Array.from(this.replayAttempts.values());
    const totalReplays = replayAttempts.reduce((sum, replay) => sum + replay.replayAttempts, 0);
    const playersWithReplays = replayAttempts.length;
    const excessiveReplayPlayers = replayAttempts.filter(r => r.replayAttempts >= this.MAX_REPLAY_ATTEMPTS).length;

    return {
      totalActions,
      totalReplays,
      playersWithReplays,
      excessiveReplayPlayers
    };
  }

  // Reset player replay history (admin function)
  resetPlayerHistory(playerId: string): void {
    // Remove from replay attempts
    this.replayAttempts.delete(playerId);

    // Remove from action history
    const hashesToRemove: string[] = [];
    for (const [hash, signature] of this.actionHistory.entries()) {
      if (signature.playerId === playerId) {
        hashesToRemove.push(hash);
      }
    }

    hashesToRemove.forEach(hash => {
      this.actionHistory.delete(hash);
    });

  }
}
