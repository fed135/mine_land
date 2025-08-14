import { RateLimiter } from '../../security/RateLimiter';

describe('RateLimiter', () => {
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    rateLimiter = new RateLimiter();
  });

  describe('Rate Limiting', () => {
    test('should allow actions under the limit', () => {
      const playerId = 'test-player';
      
      // Should allow first 5 flip actions
      for (let i = 0; i < 5; i++) {
        const allowed = rateLimiter.isAllowed(playerId, 'flip', { x: i, y: 0 });
        expect(allowed).toBe(true);
      }
    });

    test('should block actions over the flip limit', () => {
      const playerId = 'test-player';
      
      // Allow first 5 flip actions (limit is 5 per second)
      for (let i = 0; i < 5; i++) {
        const allowed = rateLimiter.isAllowed(playerId, 'flip', { x: i, y: 0 });
        expect(allowed).toBe(true);
      }
      
      // 6th action should be blocked
      const sixthAction = rateLimiter.isAllowed(playerId, 'flip', { x: 5, y: 0 });
      expect(sixthAction).toBe(false);
    });

    test('should track different action types separately', () => {
      const playerId = 'test-player';
      
      // Fill up flip actions (limit: 5)
      for (let i = 0; i < 5; i++) {
        expect(rateLimiter.isAllowed(playerId, 'flip', { x: i, y: 0 })).toBe(true);
      }
      
      // Flip should be blocked
      expect(rateLimiter.isAllowed(playerId, 'flip', { x: 5, y: 0 })).toBe(false);
      
      // But move should still be allowed (limit: 10)
      expect(rateLimiter.isAllowed(playerId, 'move', { x: 0, y: 1 })).toBe(true);
    });

    test('should enforce general rate limit', () => {
      const playerId = 'test-player';
      
      // Use only move actions to avoid hitting the specific flip limit (5)
      // Move limit is 10, so we can do 10 moves + 10 other actions to test general limit (20)
      for (let i = 0; i < 10; i++) {
        const allowed = rateLimiter.isAllowed(playerId, 'move', { x: i, y: 0 });
        expect(allowed).toBe(true);
      }
      
      for (let i = 0; i < 5; i++) {
        const allowed = rateLimiter.isAllowed(playerId, 'flip', { x: i, y: 1 });
        expect(allowed).toBe(true);
      }
      
      for (let i = 0; i < 5; i++) {
        const allowed = rateLimiter.isAllowed(playerId, 'flag', { x: i, y: 2 });
        expect(allowed).toBe(true);
      }
      
      // Now we've used 20 actions total. 21st should be blocked by general rate limit
      const overLimit = rateLimiter.isAllowed(playerId, 'move', { x: 20, y: 0 });
      expect(overLimit).toBe(false);
    });

    test('should track multiple players separately', () => {
      const player1 = 'player-1';
      const player2 = 'player-2';
      
      // Fill up player1's flip actions
      for (let i = 0; i < 5; i++) {
        expect(rateLimiter.isAllowed(player1, 'flip', { x: i, y: 0 })).toBe(true);
      }
      
      // Player1 should be blocked
      expect(rateLimiter.isAllowed(player1, 'flip', { x: 5, y: 0 })).toBe(false);
      
      // But player2 should still be allowed
      expect(rateLimiter.isAllowed(player2, 'flip', { x: 0, y: 0 })).toBe(true);
    });
  });

  describe('Statistics', () => {
    test('should provide player statistics', () => {
      const playerId = 'test-player';
      
      // Perform some actions
      rateLimiter.isAllowed(playerId, 'flip', { x: 0, y: 0 });
      rateLimiter.isAllowed(playerId, 'move', { x: 1, y: 0 });
      rateLimiter.isAllowed(playerId, 'flip', { x: 2, y: 0 });
      
      const stats = rateLimiter.getPlayerStats(playerId);
      
      expect(stats.totalActions).toBe(3);
      expect(stats.recentActions).toBe(3);
      expect(stats.actionBreakdown.flip).toBe(2);
      expect(stats.actionBreakdown.move).toBe(1);
    });
  });

  describe('Cleanup', () => {
    test('should reset player data', () => {
      const playerId = 'test-player';
      
      // Perform some actions
      rateLimiter.isAllowed(playerId, 'flip', { x: 0, y: 0 });
      
      let stats = rateLimiter.getPlayerStats(playerId);
      expect(stats.totalActions).toBe(1);
      
      // Reset player
      rateLimiter.resetPlayer(playerId);
      
      stats = rateLimiter.getPlayerStats(playerId);
      expect(stats.totalActions).toBe(0);
    });
  });
});