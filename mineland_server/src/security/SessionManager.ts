// Encrypted player session management
import crypto from 'crypto';

export interface SessionData {
  playerId: string;
  username: string;
  createdAt: number;
  lastActivity: number;
  ipAddress?: string;
  userAgent?: string;
}

export interface SecureSession {
  sessionId: string;
  token: string;
  data: SessionData;
  expiresAt: number;
}

export class SessionManager {
  private sessions = new Map<string, SecureSession>();
  private secretKey: string;
  private readonly SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours
  private readonly TOKEN_LENGTH = 32;

  constructor(secretKey?: string) {
    // Use provided secret key or generate a random one
    this.secretKey = secretKey || crypto.randomBytes(32).toString('hex');
  }

  // Create a new secure session
  createSession(playerId: string, username: string, metadata?: { ipAddress?: string; userAgent?: string }): SecureSession {
    const sessionId = this.generateSessionId();
    const now = Date.now();

    const sessionData: SessionData = {
      playerId,
      username,
      createdAt: now,
      lastActivity: now,
      ipAddress: metadata?.ipAddress,
      userAgent: metadata?.userAgent
    };

    const token = this.generateSecureToken(sessionId, sessionData);

    const session: SecureSession = {
      sessionId,
      token,
      data: sessionData,
      expiresAt: now + this.SESSION_DURATION
    };

    this.sessions.set(sessionId, session);

    console.log(JSON.stringify({
      message: 'Created secure session',
      playerId,
      username,
      sessionId: sessionId
    }));
    return session;
  }

  // Validate and retrieve session
  validateSession(sessionId: string, token: string): SessionData | null {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return null;
    }

    // Check if session is expired
    if (Date.now() > session.expiresAt) {
      this.sessions.delete(sessionId);
      return null;
    }

    // Validate token
    const expectedToken = this.generateSecureToken(sessionId, session.data);
    if (!this.constantTimeCompare(token, expectedToken)) {
      return null;
    }

    // Update last activity
    session.data.lastActivity = Date.now();

    return session.data;
  }

  // Refresh session (extend expiration)
  refreshSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return false;
    }

    if (Date.now() > session.expiresAt) {
      this.sessions.delete(sessionId);
      return false;
    }

    // Extend expiration
    session.expiresAt = Date.now() + this.SESSION_DURATION;
    session.data.lastActivity = Date.now();

    return true;
  }

  // Invalidate session
  invalidateSession(sessionId: string): boolean {
    const existed = this.sessions.has(sessionId);
    this.sessions.delete(sessionId);

    if (existed) {
    }

    return existed;
  }

  // Get session data without validation (for internal use)
  getSessionData(sessionId: string): SessionData | null {
    const session = this.sessions.get(sessionId);
    return session ? session.data : null;
  }

  // Generate cryptographically secure session ID
  private generateSessionId(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  // Generate secure token using HMAC
  private generateSecureToken(sessionId: string, sessionData: SessionData): string {
    const payload = JSON.stringify({
      sessionId,
      playerId: sessionData.playerId,
      username: sessionData.username,
      createdAt: sessionData.createdAt
    });

    const hmac = crypto.createHmac('sha256', this.secretKey);
    hmac.update(payload);
    return hmac.digest('hex');
  }

  // Constant-time string comparison to prevent timing attacks
  private constantTimeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }

    return result === 0;
  }

  // Get all active sessions for monitoring
  getActiveSessions(): Array<{
    sessionId: string;
    playerId: string;
    username: string;
    createdAt: number;
    lastActivity: number;
    expiresAt: number;
  }> {
    const now = Date.now();
    const activeSessions: Array<{
      sessionId: string;
      playerId: string;
      username: string;
      createdAt: number;
      lastActivity: number;
      expiresAt: number;
    }> = [];

    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.expiresAt > now) {
        activeSessions.push({
          sessionId,
          playerId: session.data.playerId,
          username: session.data.username,
          createdAt: session.data.createdAt,
          lastActivity: session.data.lastActivity,
          expiresAt: session.expiresAt
        });
      }
    }

    return activeSessions.sort((a, b) => b.lastActivity - a.lastActivity);
  }

  // Clean up expired sessions
  cleanupExpiredSessions(): number {
    const now = Date.now();
    const expiredSessions: string[] = [];

    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.expiresAt <= now) {
        expiredSessions.push(sessionId);
      }
    }

    expiredSessions.forEach(sessionId => {
      this.sessions.delete(sessionId);
    });

    if (expiredSessions.length > 0) {
    }

    return expiredSessions.length;
  }

  // Get session statistics
  getSessionStats(): {
    totalSessions: number;
    activeSessions: number;
    expiredSessions: number;
    } {
    const now = Date.now();
    let activeSessions = 0;
    let expiredSessions = 0;

    for (const session of this.sessions.values()) {
      if (session.expiresAt > now) {
        activeSessions++;
      } else {
        expiredSessions++;
      }
    }

    return {
      totalSessions: this.sessions.size,
      activeSessions,
      expiredSessions
    };
  }

  // Invalidate all sessions for a specific player
  invalidatePlayerSessions(playerId: string): number {
    let invalidatedCount = 0;
    const sessionsToRemove: string[] = [];

    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.data.playerId === playerId) {
        sessionsToRemove.push(sessionId);
        invalidatedCount++;
      }
    }

    sessionsToRemove.forEach(sessionId => {
      this.sessions.delete(sessionId);
    });

    if (invalidatedCount > 0) {
    }

    return invalidatedCount;
  }
}
