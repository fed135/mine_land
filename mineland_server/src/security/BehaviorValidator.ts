// Client behavior validation and anomaly detection
export interface SuspiciousActivity {
  playerId: string;
  activityType: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
  timestamp: number;
  data?: any;
}

export class BehaviorValidator {
  private suspiciousActivities: SuspiciousActivity[] = [];
  private playerLastPositions = new Map<string, { x: number; y: number; timestamp: number }>();

  // Validate movement request
  validateMovement(playerId: string, fromX: number, fromY: number, toX: number, toY: number): boolean {
    // Check for teleportation (non-adjacent movement)
    const deltaX = Math.abs(toX - fromX);
    const deltaY = Math.abs(toY - fromY);
    
    if (deltaX > 1 || deltaY > 1) {
      this.recordSuspiciousActivity({
        playerId,
        activityType: 'invalid_movement',
        severity: 'high',
        description: `Player attempted teleportation from (${fromX},${fromY}) to (${toX},${toY})`,
        timestamp: Date.now(),
        data: { fromX, fromY, toX, toY }
      });
      return false;
    }

    // Check for rapid movement
    const lastPosition = this.playerLastPositions.get(playerId);
    if (lastPosition) {
      const timeDelta = Date.now() - lastPosition.timestamp;
      if (timeDelta < 50) { // Less than 50ms between moves
        this.recordSuspiciousActivity({
          playerId,
          activityType: 'rapid_movement',
          severity: 'medium',
          description: `Player moving too rapidly: ${timeDelta}ms between moves`,
          timestamp: Date.now(),
          data: { timeDelta }
        });
        return false;
      }
    }

    // Update last position
    this.playerLastPositions.set(playerId, { x: toX, y: toY, timestamp: Date.now() });
    return true;
  }

  // Validate tile interaction
  validateTileInteraction(playerId: string, playerX: number, playerY: number, tileX: number, tileY: number): boolean {
    // Check if tile is adjacent to player
    const deltaX = Math.abs(tileX - playerX);
    const deltaY = Math.abs(tileY - playerY);
    
    if (deltaX > 1 || deltaY > 1) {
      this.recordSuspiciousActivity({
        playerId,
        activityType: 'remote_interaction',
        severity: 'high',
        description: `Player attempted to interact with distant tile at (${tileX},${tileY}) from (${playerX},${playerY})`,
        timestamp: Date.now(),
        data: { playerX, playerY, tileX, tileY }
      });
      return false;
    }

    return true;
  }

  // Validate action consistency
  validateActionConsistency(playerId: string, action: string, data: any): boolean {
    // Check for impossible flag counts
    if (action === 'flag' || action === 'unflag') {
      // Additional validation can be added here
      return true;
    }

    // Check for flip on already revealed tiles
    if (action === 'flip' && data.tileState === 'revealed') {
      this.recordSuspiciousActivity({
        playerId,
        activityType: 'invalid_action',
        severity: 'low',
        description: `Player attempted to flip already revealed tile`,
        timestamp: Date.now(),
        data: { action, tileState: data.tileState }
      });
      return false;
    }

    return true;
  }

  // Check for suspicious patterns
  analyzeBehaviorPatterns(playerId: string): string[] {
    const warnings: string[] = [];
    const playerActivities = this.suspiciousActivities
      .filter(activity => activity.playerId === playerId)
      .filter(activity => Date.now() - activity.timestamp < 300000); // Last 5 minutes

    // High frequency of suspicious activities
    if (playerActivities.length > 10) {
      warnings.push(`High frequency of suspicious activities: ${playerActivities.length} in 5 minutes`);
    }

    // Multiple high-severity violations
    const highSeverityCount = playerActivities.filter(a => a.severity === 'high').length;
    if (highSeverityCount > 3) {
      warnings.push(`Multiple high-severity violations: ${highSeverityCount}`);
    }

    return warnings;
  }

  // Record suspicious activity
  private recordSuspiciousActivity(activity: SuspiciousActivity): void {
    this.suspiciousActivities.push(activity);
    
    // Log immediately for high severity
    if (activity.severity === 'high') {
      console.warn(`🚨 HIGH SECURITY ALERT: ${activity.description}`, {
        playerId: activity.playerId,
        data: activity.data
      });
    }

    // Keep only recent activities (last hour)
    const oneHourAgo = Date.now() - 3600000;
    this.suspiciousActivities = this.suspiciousActivities.filter(a => a.timestamp > oneHourAgo);
  }

  // Get suspicious activities for monitoring
  getSuspiciousActivities(playerId?: string, severity?: string): SuspiciousActivity[] {
    let activities = this.suspiciousActivities;
    
    if (playerId) {
      activities = activities.filter(a => a.playerId === playerId);
    }
    
    if (severity) {
      activities = activities.filter(a => a.severity === severity);
    }
    
    return activities.sort((a, b) => b.timestamp - a.timestamp);
  }

  // Clean up old data
  cleanup(): void {
    const oneHourAgo = Date.now() - 3600000;
    const fiveMinutesAgo = Date.now() - 300000;
    
    // Clean up suspicious activities
    this.suspiciousActivities = this.suspiciousActivities.filter(a => a.timestamp > oneHourAgo);
    
    // Clean up position data
    for (const [playerId, position] of this.playerLastPositions.entries()) {
      if (position.timestamp < fiveMinutesAgo) {
        this.playerLastPositions.delete(playerId);
      }
    }
  }

  // Get player behavior summary
  getPlayerBehaviorSummary(playerId: string): {
    totalViolations: number;
    severityBreakdown: Record<string, number>;
    recentWarnings: string[];
  } {
    const activities = this.getSuspiciousActivities(playerId);
    const severityBreakdown: Record<string, number> = {
      low: 0,
      medium: 0,
      high: 0
    };

    activities.forEach(activity => {
      severityBreakdown[activity.severity]++;
    });

    return {
      totalViolations: activities.length,
      severityBreakdown,
      recentWarnings: this.analyzeBehaviorPatterns(playerId)
    };
  }
}