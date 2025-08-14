import { SecurityManager } from '../../security/SecurityManager';

describe('SecurityManager', () => {
  // No shared instance - each test suite will create its own

  describe('Session Management', () => {
    let securityManager: SecurityManager;

    beforeEach(() => {
      securityManager = new SecurityManager({
        enableRateLimiting: false,
        enableBehaviorValidation: false,
        enableSessionSecurity: true,
        enableReplayProtection: false
      });
    });

    afterEach(() => {
      securityManager.destroy();
    });

    test('should create valid player sessions', () => {
      const playerId = 'test-player';
      const username = 'TestUser';
      
      const session = securityManager.createPlayerSession(playerId, username);
      
      expect(session.sessionId).toBeDefined();
      expect(session.sessionToken).toBeDefined();
      expect(typeof session.sessionId).toBe('string');
      expect(typeof session.sessionToken).toBe('string');
      expect(session.sessionId.length).toBeGreaterThan(10);
      expect(session.sessionToken.length).toBeGreaterThan(10);
    });

    test('should validate correct sessions', () => {
      const playerId = 'test-player';
      const username = 'TestUser';
      
      const session = securityManager.createPlayerSession(playerId, username);
      const validation = securityManager.validateSession(session.sessionId, session.sessionToken);
      
      expect(validation.valid).toBe(true);
      expect(validation.playerId).toBe(playerId);
      expect(validation.username).toBe(username);
    });

    test('should reject invalid sessions', () => {
      const validation = securityManager.validateSession('invalid-session', 'invalid-token');
      
      expect(validation.valid).toBe(false);
      expect(validation.playerId).toBeUndefined();
      expect(validation.username).toBeUndefined();
    });

    test('should reject sessions with mismatched tokens', () => {
      const session1 = securityManager.createPlayerSession('player1', 'User1');
      const session2 = securityManager.createPlayerSession('player2', 'User2');
      
      const validation = securityManager.validateSession(session1.sessionId, session2.sessionToken);
      
      expect(validation.valid).toBe(false);
    });
  });

  describe('Player Action Validation', () => {
    let securityManager: SecurityManager;
    let playerId: string;
    let sessionId: string;
    let sessionToken: string;

    beforeEach(() => {
      // Create isolated SecurityManager instance for these tests
      securityManager = new SecurityManager({
        enableRateLimiting: false,
        enableBehaviorValidation: true,
        enableSessionSecurity: true,
        enableReplayProtection: false // Disabled to avoid duplicate action conflicts
      });
      
      playerId = `player_validation_test_${Math.round(Math.random() * 100000)}`;
      const session = securityManager.createPlayerSession(playerId, 'TestUser');
      sessionId = session.sessionId;
      sessionToken = session.sessionToken;
    });

    afterEach(() => {
      securityManager.destroy();
    });

    test('should validate legitimate player actions', () => {
      const validation = securityManager.validatePlayerAction(
        playerId,
        sessionId,
        sessionToken,
        'move',
        { x: 10, y: 10 },
        { x: 9, y: 10 },
        true
      );
      
      expect(validation.allowed).toBe(true);
      expect(validation.reason).toBeUndefined();
    });

    test('should block actions from dead players', () => {
      const validation = securityManager.validatePlayerAction(
        playerId,
        sessionId,
        sessionToken,
        'flip',
        { x: 10, y: 10 },
        { x: 9, y: 10 },
        false // player is dead
      );
      
      expect(validation.allowed).toBe(false);
      expect(validation.reason?.toLowerCase()).toContain('dead');
    });

    test('should detect suspicious rapid actions', () => {
      // Test the SecurityManager's rate limiting with minimal config
      const rateLimitOnlyManager = new SecurityManager({
        enableRateLimiting: true,
        enableBehaviorValidation: false,
        enableSessionSecurity: false,
        enableReplayProtection: false
      });
      
      try {
        // Test rapid flip actions (rate limit: 5 per second)
        // First 5 should be allowed
        for (let i = 0; i < 5; i++) {
          const validation = rateLimitOnlyManager.validatePlayerAction(
            playerId,
            null, // No session
            null, // No session token
            'flip',
            { x: i, y: 10 },
            { x: i - 1, y: 10 },
            true
          );
          expect(validation.allowed).toBe(true);
        }
        
        // 6th action should be rate limited
        const validation = rateLimitOnlyManager.validatePlayerAction(
          playerId,
          null, // No session
          null, // No session token
          'flip',
          { x: 5, y: 10 },
          { x: 4, y: 10 },
          true
        );
        
        expect(validation.allowed).toBe(false);
        expect(validation.reason).toContain('Rate limit exceeded');
      } finally {
        // Clean up the temporary SecurityManager instance
        rateLimitOnlyManager.destroy();
      }
    });

    // Replay protection test moved to separate isolated suite

    test('should validate movement distances', () => {
      // Valid adjacent movement
      const validMove = securityManager.validatePlayerAction(
        playerId,
        sessionId,
        sessionToken,
        'move',
        { x: 11, y: 10 },
        { x: 10, y: 10 },
        true
      );
      expect(validMove.allowed).toBe(true);
      
      // Invalid teleportation
      const invalidMove = securityManager.validatePlayerAction(
        playerId,
        sessionId,
        sessionToken,
        'move',
        { x: 100, y: 100 },
        { x: 10, y: 10 },
        true
      );
      expect(invalidMove.allowed).toBe(false);
    });

    test('should track player security metrics', () => {
      // Perform some actions to generate metrics
      securityManager.validatePlayerAction(playerId, sessionId, sessionToken, 'move', { x: 10, y: 10 }, { x: 9, y: 10 }, true);
      securityManager.validatePlayerAction(playerId, sessionId, sessionToken, 'flip', { x: 11, y: 10 }, { x: 10, y: 10 }, true);
      
      const status = securityManager.getPlayerSecurityStatus(playerId);
      
      expect(status.riskScore).toBeGreaterThanOrEqual(0);
      expect(status.riskScore).toBeLessThanOrEqual(100);
      expect(status.activeAlerts).toBeGreaterThanOrEqual(0);
      expect(status.recentViolations).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Replay Protection (Isolated)', () => {
    let securityManager: SecurityManager;
    let playerId: string;
    let sessionId: string;
    let sessionToken: string;

    beforeEach(() => {
      // Create isolated SecurityManager instance with replay protection enabled
      securityManager = new SecurityManager({
        enableRateLimiting: false,
        enableBehaviorValidation: false,
        enableSessionSecurity: true,
        enableReplayProtection: true // Only this feature enabled
      });
      
      playerId = `replay_test_player_${Math.round(Math.random() * 100000)}`;
      const session = securityManager.createPlayerSession(playerId, 'ReplayTestUser');
      sessionId = session.sessionId;
      sessionToken = session.sessionToken;
    });

    afterEach(() => {
      securityManager.destroy();
    });

    test('should detect replay and duplicate actions when replay protection enabled', () => {
      // First action should be allowed
      const validation1 = securityManager.validatePlayerAction(
        playerId,
        sessionId,
        sessionToken,
        'flip',
        { x: 20, y: 20 },
        { x: 19, y: 20 },
        true
      );
      
      expect(validation1.allowed).toBe(true);
      
      // Same action again should be caught as duplicate
      const validation2 = securityManager.validatePlayerAction(
        playerId,
        sessionId,
        sessionToken,
        'flip',
        { x: 20, y: 20 },
        { x: 19, y: 20 },
        true
      );
      expect(validation2.allowed).toBe(false);
      expect(validation2.reason).toContain('Duplicate action');
    });
  });

  describe('Player Management', () => {
    let securityManager: SecurityManager;

    beforeEach(() => {
      securityManager = new SecurityManager({
        enableRateLimiting: false,
        enableBehaviorValidation: false,
        enableSessionSecurity: false,
        enableReplayProtection: false
      });
    });

    afterEach(() => {
      securityManager.destroy();
    });

    test('should ban and unban players', () => {
      const playerId = 'test-player';
      const reason = 'Testing ban functionality';
      
      // Ban player
      securityManager.banPlayer(playerId, reason);
      
      const status = securityManager.getPlayerSecurityStatus(playerId);
      expect(status.banned).toBe(true);
      
      // Unban player
      const unbanned = securityManager.unbanPlayer(playerId);
      expect(unbanned).toBe(true);
      
      const statusAfterUnban = securityManager.getPlayerSecurityStatus(playerId);
      expect(statusAfterUnban.banned).toBe(false);
    });

    test('should handle banning non-existent players', () => {
      expect(() => {
        securityManager.banPlayer('non-existent-player', 'test');
      }).not.toThrow();
      
      // Player was banned successfully, so unbanning should return true
      const unbanned = securityManager.unbanPlayer('non-existent-player');
      expect(unbanned).toBe(true);
      
      // Now trying to unban again should return false (wasn't banned)
      const unbannedAgain = securityManager.unbanPlayer('non-existent-player');
      expect(unbannedAgain).toBe(false);
    });
  });

  describe('Security Dashboard', () => {
    let securityManager: SecurityManager;

    beforeEach(() => {
      securityManager = new SecurityManager({
        enableRateLimiting: true,
        enableBehaviorValidation: true,
        enableSessionSecurity: true,
        enableReplayProtection: false
      });
    });

    afterEach(() => {
      securityManager.destroy();
    });

    test('should provide comprehensive security metrics', () => {
      // Create some activity
      const session = securityManager.createPlayerSession('player1', 'User1');
      securityManager.validatePlayerAction('player1', session.sessionId, session.sessionToken, 'move', { x: 1, y: 1 }, { x: 0, y: 0 }, true);
      securityManager.banPlayer('player2', 'test ban');
      
      const dashboard = securityManager.getSecurityDashboard();
      
      expect(Array.isArray(dashboard.bannedPlayers)).toBe(true);
      expect(dashboard.bannedPlayers.length).toBeGreaterThanOrEqual(1);
      expect(dashboard.systemHealth).toBeDefined();
      expect(typeof dashboard.systemHealth.rateLimiter).toBe('boolean');
      expect(typeof dashboard.systemHealth.behaviorValidator).toBe('boolean');
      expect(typeof dashboard.systemHealth.sessionManager).toBe('boolean');
      expect(typeof dashboard.systemHealth.replayProtection).toBe('boolean');
    });
  });

  describe('Configuration Handling', () => {
    test('should handle disabled security features', () => {
      const disabledSecurityManager = new SecurityManager({
        enableRateLimiting: false,
        enableBehaviorValidation: false,
        enableSessionSecurity: false,
        enableReplayProtection: false
      });
      
      try {
        const session = disabledSecurityManager.createPlayerSession('config_test_player', 'User');
        
        // Should still allow basic validation but be more permissive
        const validation = disabledSecurityManager.validatePlayerAction(
          'config_test_player',
          session.sessionId,
          session.sessionToken,
          'move',
          { x: 100, y: 100 },
          { x: 0, y: 0 },
          true
        );
        
        // With disabled validation, this should be more permissive
        expect(validation).toBeDefined();
      } finally {
        disabledSecurityManager.destroy();
      }
    });
  });

  describe('Performance Characteristics', () => {
    let securityManager: SecurityManager;

    beforeEach(() => {
      securityManager = new SecurityManager({
        enableRateLimiting: false,
        enableBehaviorValidation: true,
        enableSessionSecurity: true,
        enableReplayProtection: false
      });
    });

    afterEach(() => {
      securityManager.destroy();
    });

    test('should handle high-frequency validations efficiently', () => {
      const playerId = `performance_test_player_${Math.round(Math.random() * 100000)}`;
      const session = securityManager.createPlayerSession(playerId, 'PerfUser');
      
      const startTime = performance.now();
      
      // Perform many validations
      for (let i = 0; i < 100; i++) {
        securityManager.validatePlayerAction(
          playerId,
          session.sessionId,
          session.sessionToken,
          'move',
          { x: i % 10, y: Math.floor(i / 10) },
          { x: (i - 1) % 10, y: Math.floor((i - 1) / 10) },
          true
        );
      }
      
      const duration = performance.now() - startTime;
      
      // Should complete 100 validations in reasonable time
      expect(duration).toBeLessThan(100); // 100ms for 100 validations
    });
  });
});