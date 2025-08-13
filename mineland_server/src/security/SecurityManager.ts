// Unified security manager coordinating all security systems
import { RateLimiter } from './RateLimiter.ts';
import { BehaviorValidator } from './BehaviorValidator.ts';
import { SessionManager } from './SessionManager.ts';
import { ReplayProtection } from './ReplayProtection.ts';
import { SecurityMonitor } from './SecurityMonitor.ts';

export interface SecurityConfig {
  enableRateLimiting: boolean;
  enableBehaviorValidation: boolean;
  enableSessionSecurity: boolean;
  enableReplayProtection: boolean;
  sessionSecret?: string;
}

export interface ActionValidationResult {
  allowed: boolean;
  reason?: string;
  severity?: 'low' | 'medium' | 'high';
  shouldDisconnect?: boolean;
}

export interface PlayerSecurityStatus {
  playerId: string;
  riskScore: number;
  activeAlerts: number;
  recentViolations: number;
  sessionValid: boolean;
  banned: boolean;
}

export class SecurityManager {
  private rateLimiter: RateLimiter;
  private behaviorValidator: BehaviorValidator;
  private sessionManager: SessionManager;
  private replayProtection: ReplayProtection;
  private securityMonitor: SecurityMonitor;
  private config: SecurityConfig;
  private bannedPlayers = new Set<string>();

  constructor(config: SecurityConfig = {
    enableRateLimiting: true,
    enableBehaviorValidation: true,
    enableSessionSecurity: true,
    enableReplayProtection: false  // Temporarily disabled due to action format changes
  }) {
    this.config = config;
    
    // Initialize security components
    this.rateLimiter = new RateLimiter();
    this.behaviorValidator = new BehaviorValidator();
    this.sessionManager = new SessionManager(config.sessionSecret);
    this.replayProtection = new ReplayProtection();
    this.securityMonitor = new SecurityMonitor();

    // Set up cleanup intervals
    this.setupCleanupTasks();
    
    console.log('🛡️  Security Manager initialized with:', {
      rateLimiting: config.enableRateLimiting,
      behaviorValidation: config.enableBehaviorValidation,
      sessionSecurity: config.enableSessionSecurity,
      replayProtection: config.enableReplayProtection
    });
  }

  // Validate player action through all security layers
  validatePlayerAction(
    playerId: string,
    sessionId: string,
    sessionToken: string,
    actionType: string,
    actionData: any,
    playerPosition?: { x: number; y: number },
    playerAlive?: boolean
  ): ActionValidationResult {
    // Check if player is banned
    if (this.bannedPlayers.has(playerId)) {
      return {
        allowed: false,
        reason: 'Player is banned',
        severity: 'high',
        shouldDisconnect: true
      };
    }

    // Check if player is alive (except for movement which might be spectating)
    if (playerAlive === false && actionType !== 'move') {
      return {
        allowed: false,
        reason: 'Dead players cannot perform this action',
        severity: 'low'
      };
    }

    // 1. Session validation
    if (this.config.enableSessionSecurity) {
      const sessionData = this.sessionManager.validateSession(sessionId, sessionToken);
      if (!sessionData) {
        this.securityMonitor.logEvent({
          type: 'session',
          severity: 'high',
          playerId,
          sessionId,
          description: 'Invalid session token for action'
        });
        return {
          allowed: false,
          reason: 'Invalid session',
          severity: 'high',
          shouldDisconnect: true
        };
      }
      
      if (sessionData.playerId !== playerId) {
        this.securityMonitor.logEvent({
          type: 'session',
          severity: 'critical',
          playerId,
          sessionId,
          description: 'Session player ID mismatch'
        });
        return {
          allowed: false,
          reason: 'Session player mismatch',
          severity: 'high',
          shouldDisconnect: true
        };
      }
    }

    // 2. Rate limiting
    if (this.config.enableRateLimiting) {
      if (!this.rateLimiter.isAllowed(playerId, actionType, actionData)) {
        this.securityMonitor.logRateLimitViolation(playerId, actionType, actionData);
        return {
          allowed: false,
          reason: 'Rate limit exceeded',
          severity: 'medium'
        };
      }
    }

    // 3. Replay protection
    if (this.config.enableReplayProtection) {
      const replayCheck = this.replayProtection.isReplayAction(playerId, actionType, actionData);
      if (replayCheck.isReplay) {
        this.securityMonitor.logReplayAttempt(replayCheck.replayInfo!);
        return {
          allowed: false,
          reason: 'Action replay detected',
          severity: 'medium'
        };
      }

      // Check for duplicate actions
      if (this.replayProtection.isDuplicateAction(playerId, actionType, actionData)) {
        this.securityMonitor.logEvent({
          type: 'replay',
          severity: 'low',
          playerId,
          description: 'Duplicate action detected'
        });
        return {
          allowed: false,
          reason: 'Duplicate action',
          severity: 'low'
        };
      }

      // Validate action sequence
      const sequenceCheck = this.replayProtection.validateActionSequence(playerId, actionType);
      if (!sequenceCheck.isValid) {
        this.securityMonitor.logEvent({
          type: 'replay',
          severity: 'high',
          playerId,
          description: `Invalid action sequence: ${sequenceCheck.reason}`
        });
        return {
          allowed: false,
          reason: sequenceCheck.reason,
          severity: 'high'
        };
      }
    }

    // 4. Basic behavior validation
    if (this.config.enableBehaviorValidation && playerPosition) {
      // Validate movement (adjacent only)
      if (actionType === 'move') {
        const deltaX = Math.abs(actionData.x - playerPosition.x);
        const deltaY = Math.abs(actionData.y - playerPosition.y);
        if (deltaX > 1 || deltaY > 1) {
          console.warn(`Invalid movement: Player ${playerId} tried to move from (${playerPosition.x},${playerPosition.y}) to (${actionData.x},${actionData.y})`);
          return {
            allowed: false,
            reason: 'Can only move to adjacent tiles',
            severity: 'high'
          };
        }
      }

      // Validate tile interactions (adjacent only)
      if (['flip', 'flag', 'unflag'].includes(actionType)) {
        const deltaX = Math.abs(actionData.x - playerPosition.x);
        const deltaY = Math.abs(actionData.y - playerPosition.y);
        if (deltaX > 1 || deltaY > 1) {
          console.warn(`Invalid tile interaction: Player ${playerId} tried to interact with tile (${actionData.x},${actionData.y}) from (${playerPosition.x},${playerPosition.y})`);
          return {
            allowed: false,
            reason: 'Can only interact with nearby tiles',
            severity: 'high'
          };
        }
      }
    }

    return { allowed: true };
  }

  // Validate movement specifically
  validateMovement(playerId: string, fromX: number, fromY: number, toX: number, toY: number): ActionValidationResult {
    if (!this.config.enableBehaviorValidation) {
      return { allowed: true };
    }

    if (this.behaviorValidator.validateMovement(playerId, fromX, fromY, toX, toY)) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: 'Invalid movement pattern',
      severity: 'high'
    };
  }


  // Create secure session for player
  createPlayerSession(playerId: string, username: string, metadata?: any): {
    sessionId: string;
    sessionToken: string;
  } {
    if (!this.config.enableSessionSecurity) {
      // Return dummy session for backwards compatibility
      return {
        sessionId: `insecure_${playerId}`,
        sessionToken: 'insecure'
      };
    }

    const session = this.sessionManager.createSession(playerId, username, metadata);
    
    console.log(`Created secure session for player ${username} (${playerId})`);
    
    return {
      sessionId: session.sessionId,
      sessionToken: session.token
    };
  }

  // Validate session
  validateSession(sessionId: string, sessionToken: string): {
    valid: boolean;
    playerId?: string;
    username?: string;
  } {
    if (!this.config.enableSessionSecurity) {
      return { valid: true }; // Always valid if security disabled
    }

    const sessionData = this.sessionManager.validateSession(sessionId, sessionToken);
    
    if (sessionData) {
      return {
        valid: true,
        playerId: sessionData.playerId,
        username: sessionData.username
      };
    }

    return { valid: false };
  }

  // Get player security status (simplified)
  getPlayerSecurityStatus(playerId: string): PlayerSecurityStatus {
    return {
      playerId,
      riskScore: 0,
      activeAlerts: 0,
      recentViolations: 0,
      sessionValid: true,
      banned: this.bannedPlayers.has(playerId)
    };
  }

  // Ban player
  banPlayer(playerId: string, reason: string): void {
    this.bannedPlayers.add(playerId);
    
    // Invalidate all sessions for this player
    if (this.config.enableSessionSecurity) {
      this.sessionManager.invalidatePlayerSessions(playerId);
    }
    
    console.error(`🚫 PLAYER BANNED: ${playerId} - ${reason}`);
  }

  // Unban player
  unbanPlayer(playerId: string): boolean {
    const wasBanned = this.bannedPlayers.has(playerId);
    this.bannedPlayers.delete(playerId);
    
    if (wasBanned) {
      this.securityMonitor.logEvent({
        type: 'general',
        severity: 'medium',
        playerId,
        description: 'Player unbanned'
      });
      
      console.log(`✅ PLAYER UNBANNED: ${playerId}`);
    }
    
    return wasBanned;
  }

  // Get security dashboard data (simplified)
  getSecurityDashboard(): {
    bannedPlayers: string[];
    systemHealth: {
      rateLimiter: boolean;
      behaviorValidator: boolean;
      sessionManager: boolean;
      replayProtection: boolean;
    };
  } {
    return {
      bannedPlayers: Array.from(this.bannedPlayers),
      systemHealth: {
        rateLimiter: this.config.enableRateLimiting,
        behaviorValidator: this.config.enableBehaviorValidation,
        sessionManager: this.config.enableSessionSecurity,
        replayProtection: this.config.enableReplayProtection
      }
    };
  }

  // Setup cleanup tasks
  private setupCleanupTasks(): void {
    // Run cleanup every 5 minutes
    setInterval(() => {
      this.rateLimiter.cleanup();
      this.sessionManager.cleanupExpiredSessions();
      this.replayProtection.cleanup();
    }, 300000); // 5 minutes

    console.log('🧹 Security cleanup tasks scheduled (5 minute intervals)');
  }

  // Get component instances (for advanced usage)
  getComponents() {
    return {
      rateLimiter: this.rateLimiter,
      behaviorValidator: this.behaviorValidator,
      sessionManager: this.sessionManager,
      replayProtection: this.replayProtection
    };
  }
}