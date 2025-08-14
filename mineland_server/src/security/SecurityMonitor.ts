// Comprehensive security logging and monitoring system
import type { SuspiciousActivity } from './BehaviorValidator.ts';
import type { IntegrityViolation } from './IntegrityChecker.ts';
import type { ReplayAttempt } from './ReplayProtection.ts';

export interface SecurityEvent {
  id: string;
  type: 'rate_limit' | 'behavior' | 'integrity' | 'replay' | 'session' | 'general';
  severity: 'low' | 'medium' | 'high' | 'critical';
  playerId?: string;
  sessionId?: string;
  description: string;
  timestamp: number;
  data?: any;
  ipAddress?: string;
  userAgent?: string;
}

export interface SecurityAlert {
  id: string;
  playerId: string;
  alertType: string;
  severity: 'medium' | 'high' | 'critical';
  events: SecurityEvent[];
  firstOccurrence: number;
  lastOccurrence: number;
  count: number;
  resolved: boolean;
}

export class SecurityMonitor {
  private events: SecurityEvent[] = [];
  private alerts = new Map<string, SecurityAlert>();
  private playerScores = new Map<string, number>(); // Risk scores
  private readonly MAX_EVENTS = 10000;
  private readonly ALERT_THRESHOLDS = {
    low: 5,      // 5 low events = medium alert
    medium: 3,   // 3 medium events = high alert
    high: 2,     // 2 high events = critical alert
    critical: 1  // 1 critical event = critical alert
  };

  // Log a security event
  logEvent(event: Omit<SecurityEvent, 'id' | 'timestamp'>): void {
    const securityEvent: SecurityEvent = {
      ...event,
      id: this.generateEventId(),
      timestamp: Date.now()
    };

    this.events.push(securityEvent);

    // Trim events to stay within limit
    if (this.events.length > this.MAX_EVENTS) {
      this.events.splice(0, this.events.length - this.MAX_EVENTS);
    }

    // Update player risk score
    if (event.playerId) {
      this.updatePlayerRiskScore(event.playerId, event.severity);
    }

    // Check for alert conditions
    this.checkForAlerts(securityEvent);

    // Log to console based on severity
    this.logToConsole(securityEvent);
  }

  // Log rate limit violation
  logRateLimitViolation(playerId: string, actionType: string, metadata?: any): void {
    this.logEvent({
      type: 'rate_limit',
      severity: 'medium',
      playerId,
      description: `Rate limit exceeded for action: ${actionType}`,
      data: { actionType, ...metadata }
    });
  }

  // Log suspicious behavior
  logSuspiciousBehavior(activity: SuspiciousActivity): void {
    this.logEvent({
      type: 'behavior',
      severity: activity.severity,
      playerId: activity.playerId,
      description: activity.description,
      data: activity.data
    });
  }

  // Log integrity violation
  logIntegrityViolation(violation: IntegrityViolation, playerId?: string): void {
    this.logEvent({
      type: 'integrity',
      severity: violation.severity,
      playerId,
      description: violation.description,
      data: violation.data
    });
  }

  // Log replay attempt
  logReplayAttempt(replayInfo: ReplayAttempt): void {
    const severity = replayInfo.replayAttempts >= 5 ? 'high' :
      replayInfo.replayAttempts >= 3 ? 'medium' : 'low';

    this.logEvent({
      type: 'replay',
      severity,
      playerId: replayInfo.playerId,
      description: `Action replay detected (${replayInfo.replayAttempts} attempts)`,
      data: {
        replayAttempts: replayInfo.replayAttempts,
        actionType: replayInfo.originalAction.actionType
      }
    });
  }

  // Log session event
  logSessionEvent(
    eventType: 'created' | 'validated' | 'expired' | 'invalidated',
    sessionId: string,
    playerId?: string,
    metadata?: any
  ): void {
    const severity = eventType === 'invalidated' ? 'medium' : 'low';

    this.logEvent({
      type: 'session',
      severity,
      playerId,
      sessionId,
      description: `Session ${eventType}: ${sessionId}`,
      data: { eventType, ...metadata }
    });
  }

  // Update player risk score
  private updatePlayerRiskScore(playerId: string, severity: string): void {
    const currentScore = this.playerScores.get(playerId) || 0;
    const scoreIncrease = {
      low: 1,
      medium: 3,
      high: 8,
      critical: 20
    }[severity] || 0;

    const newScore = Math.min(currentScore + scoreIncrease, 100); // Cap at 100
    this.playerScores.set(playerId, newScore);

    // Log high risk players
    if (newScore >= 50 && currentScore < 50) {
    }
  }

  // Check for alert conditions
  private checkForAlerts(event: SecurityEvent): void {
    if (!event.playerId) {
      return;
    }

    const playerId = event.playerId;
    const alertKey = `${playerId}_${event.type}`;

    // Get recent events for this player and type
    const recentEvents = this.getRecentPlayerEvents(playerId, event.type, 300000); // 5 minutes

    // Count by severity
    const severityCounts = {
      low: recentEvents.filter(e => e.severity === 'low').length,
      medium: recentEvents.filter(e => e.severity === 'medium').length,
      high: recentEvents.filter(e => e.severity === 'high').length,
      critical: recentEvents.filter(e => e.severity === 'critical').length
    };

    // Determine alert severity
    let alertSeverity: 'medium' | 'high' | 'critical' | null = null;

    if (severityCounts.critical >= this.ALERT_THRESHOLDS.critical) {
      alertSeverity = 'critical';
    } else if (severityCounts.high >= this.ALERT_THRESHOLDS.high) {
      alertSeverity = 'critical';
    } else if (severityCounts.medium >= this.ALERT_THRESHOLDS.medium) {
      alertSeverity = 'high';
    } else if (severityCounts.low >= this.ALERT_THRESHOLDS.low) {
      alertSeverity = 'medium';
    }

    if (alertSeverity) {
      this.createOrUpdateAlert(alertKey, playerId, event.type, alertSeverity, recentEvents);
    }
  }

  // Create or update security alert
  private createOrUpdateAlert(
    alertKey: string,
    playerId: string,
    alertType: string,
    severity: 'medium' | 'high' | 'critical',
    events: SecurityEvent[]
  ): void {
    const existingAlert = this.alerts.get(alertKey);
    const now = Date.now();

    if (existingAlert && !existingAlert.resolved) {
      // Update existing alert
      existingAlert.events = events;
      existingAlert.lastOccurrence = now;
      existingAlert.count = events.length;
      existingAlert.severity = severity; // Update to highest severity
    } else {
      // Create new alert
      const newAlert: SecurityAlert = {
        id: this.generateEventId(),
        playerId,
        alertType,
        severity,
        events,
        firstOccurrence: events[0]?.timestamp || now,
        lastOccurrence: now,
        count: events.length,
        resolved: false
      };

      this.alerts.set(alertKey, newAlert);

    }
  }

  // Get recent events for a player
  private getRecentPlayerEvents(playerId: string, type?: string, timeWindow: number = 300000): SecurityEvent[] {
    const now = Date.now();
    return this.events.filter(event =>
      event.playerId === playerId &&
      now - event.timestamp < timeWindow &&
      (!type || event.type === type)
    ).sort((a, b) => b.timestamp - a.timestamp);
  }

  // Generate unique event ID
  private generateEventId(): string {
    return `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  // Log to console with appropriate formatting
  private logToConsole(event: SecurityEvent): void {
    // Security logging removed for APM/log management compatibility
  }

  // Get player risk score
  getPlayerRiskScore(playerId: string): number {
    return this.playerScores.get(playerId) || 0;
  }

  // Get high-risk players
  getHighRiskPlayers(threshold: number = 30): Array<{ playerId: string; riskScore: number }> {
    const highRiskPlayers: Array<{ playerId: string; riskScore: number }> = [];

    for (const [playerId, riskScore] of this.playerScores.entries()) {
      if (riskScore >= threshold) {
        highRiskPlayers.push({ playerId, riskScore });
      }
    }

    return highRiskPlayers.sort((a, b) => b.riskScore - a.riskScore);
  }

  // Get active alerts
  getActiveAlerts(): SecurityAlert[] {
    return Array.from(this.alerts.values())
      .filter(alert => !alert.resolved)
      .sort((a, b) => {
        // Sort by severity first, then by last occurrence
        const severityOrder = { critical: 3, high: 2, medium: 1 };
        const severityDiff = severityOrder[b.severity] - severityOrder[a.severity];
        return severityDiff !== 0 ? severityDiff : b.lastOccurrence - a.lastOccurrence;
      });
  }

  // Resolve alert
  resolveAlert(alertId: string): boolean {
    for (const alert of this.alerts.values()) {
      if (alert.id === alertId) {
        alert.resolved = true;
        return true;
      }
    }
    return false;
  }

  // Get security statistics
  getSecurityStats(): {
    totalEvents: number;
    recentEvents: number;
    eventsByType: Record<string, number>;
    eventsBySeverity: Record<string, number>;
    activeAlerts: number;
    highRiskPlayers: number;
    } {
    const now = Date.now();
    const recentEvents = this.events.filter(e => now - e.timestamp < 3600000); // Last hour

    const eventsByType: Record<string, number> = {};
    const eventsBySeverity: Record<string, number> = {};

    recentEvents.forEach(event => {
      eventsByType[event.type] = (eventsByType[event.type] || 0) + 1;
      eventsBySeverity[event.severity] = (eventsBySeverity[event.severity] || 0) + 1;
    });

    return {
      totalEvents: this.events.length,
      recentEvents: recentEvents.length,
      eventsByType,
      eventsBySeverity,
      activeAlerts: this.getActiveAlerts().length,
      highRiskPlayers: this.getHighRiskPlayers().length
    };
  }

  // Clean up old data
  cleanup(): void {
    const oneHourAgo = Date.now() - 3600000;
    const oneDayAgo = Date.now() - 86400000;

    // Remove old events (keep last hour + MAX_EVENTS limit)
    const recentEvents = this.events.filter(e => e.timestamp > oneHourAgo);
    this.events = recentEvents.slice(-this.MAX_EVENTS);

    // Clean up resolved alerts older than 24 hours
    for (const [key, alert] of this.alerts.entries()) {
      if (alert.resolved && alert.lastOccurrence < oneDayAgo) {
        this.alerts.delete(key);
      }
    }

    // Decay risk scores over time
    for (const [playerId, score] of this.playerScores.entries()) {
      const decayedScore = Math.max(0, score - 1); // Decay by 1 point
      if (decayedScore === 0) {
        this.playerScores.delete(playerId);
      } else {
        this.playerScores.set(playerId, decayedScore);
      }
    }
  }
}
