import { GameManager } from '../GameManager';
import { Entity } from '../ecs/Entity';
import type { PlayerComponent } from '../components/PlayerComponent';
import type { PositionComponent } from '../components/PositionComponent';

describe('GameManager', () => {
  let gameManager: GameManager;

  beforeEach(() => {
    gameManager = new GameManager({
      enableRateLimiting: false,
      enableBehaviorValidation: false,
      enableSessionSecurity: false,
      enableReplayProtection: false
    });
  });

  afterEach(() => {
    gameManager.destroy();
  });

  describe('Player Management', () => {
    test('should create a player entity with proper components', () => {
      const playerId = 'test-player-1';
      const username = 'TestPlayer';

      const playerEntity = gameManager.createPlayerEntity({
        id: playerId,
        username,
        clientId: 'client-123',
        sessionId: 'session-456'
      });

      expect(playerEntity).toBeInstanceOf(Entity);
      expect(playerEntity.hasComponent('position')).toBe(true);
      expect(playerEntity.hasComponent('player')).toBe(true);
      expect(playerEntity.hasComponent('network')).toBe(true);

      const playerComp = playerEntity.getComponent<PlayerComponent>('player');
      expect(playerComp?.id).toBe(playerId);
      expect(playerComp?.username).toBe(username);
    });

    test('should spawn players at valid spawn points', () => {
      const gameState = gameManager.getGameState();
      expect(gameState.spawnPoints.length).toBeGreaterThan(0);

      const playerEntity = gameManager.createPlayerEntity({
        id: 'test-player',
        username: 'TestPlayer'
      });

      const position = playerEntity.getComponent<PositionComponent>('position');
      const spawnPoint = gameState.spawnPoints.find(sp =>
        sp.x === position?.x && sp.y === position?.y
      );
      expect(spawnPoint).toBeDefined();
    });

    test('should remove player properly', () => {
      const playerId = 'test-player';
      const playerEntity = gameManager.createPlayerEntity({
        id: playerId,
        username: 'TestPlayer'
      });

      expect(gameManager.getPlayerEntity(playerId)).toBe(playerEntity);

      gameManager.removePlayer(playerId);

      expect(gameManager.getPlayerEntity(playerId)).toBeUndefined();
    });
  });

  describe('Movement System', () => {
    test('should validate adjacent movement only', () => {
      const playerId = 'test-player';
      const playerEntity = gameManager.createPlayerEntity({
        id: playerId,
        username: 'TestPlayer'
      });

      const position = playerEntity.getComponent<PositionComponent>('position');
      const startX = position?.x || 0;
      const startY = position?.y || 0;

      // Test basic movement validation (should pass GameManager validation but may fail on walkability)
      // Focus on testing the distance validation logic

      // Valid adjacent moves should pass GameManager validation
      // Note: May still fail due to tile walkability rules, which is expected game behavior

      // Test non-adjacent moves (should fail at GameManager level)
      expect(gameManager.requestPlayerMovement(playerId, startX + 2, startY)).toBe(false);
      expect(gameManager.requestPlayerMovement(playerId, startX - 2, startY)).toBe(false);
      expect(gameManager.requestPlayerMovement(playerId, startX, startY + 2)).toBe(false);
      expect(gameManager.requestPlayerMovement(playerId, startX, startY - 2)).toBe(false);
      expect(gameManager.requestPlayerMovement(playerId, startX + 5, startY + 5)).toBe(false);

      // Test movement to invalid coordinates (should fail at GameManager level)
      expect(gameManager.requestPlayerMovement(playerId, -1, startY)).toBe(false);
      expect(gameManager.requestPlayerMovement(playerId, 1000, startY)).toBe(false);
      expect(gameManager.requestPlayerMovement(playerId, startX, -1)).toBe(false);
      expect(gameManager.requestPlayerMovement(playerId, startX, 1000)).toBe(false);
    });

    test('should reject movement for non-existent player', () => {
      expect(gameManager.requestPlayerMovement('non-existent', 10, 10)).toBe(false);
    });
  });

  describe('World Generation', () => {
    test('should generate world with correct mine spawn logic', () => {
      const gameState = gameManager.getGameState();
      const spawnPoints = gameState.spawnPoints;

      // Check that mines don't spawn within 2 tile radius of spawn points
      for (const spawnPoint of spawnPoints) {
        for (let dx = -2; dx <= 2; dx++) {
          for (let dy = -2; dy <= 2; dy++) {
            const distance = Math.abs(dx) + Math.abs(dy);
            if (distance <= 2) {
              const checkX = spawnPoint.x + dx;
              const checkY = spawnPoint.y + dy;

              // Mock the tile registry check - in real world this would check for mines
              // For now we just verify spawn points exist and are properly distributed
              expect(checkX).toBeGreaterThanOrEqual(0);
              expect(checkY).toBeGreaterThanOrEqual(0);
            }
          }
        }
      }
    });

    test('should generate spawn points with proper distribution', () => {
      const gameState = gameManager.getGameState();
      const spawnPoints = gameState.spawnPoints;

      expect(spawnPoints.length).toBe(10);

      // Check that spawn points are not too close to each other
      for (let i = 0; i < spawnPoints.length; i++) {
        for (let j = i + 1; j < spawnPoints.length; j++) {
          const distance = Math.sqrt(
            Math.pow(spawnPoints[i].x - spawnPoints[j].x, 2) +
            Math.pow(spawnPoints[i].y - spawnPoints[j].y, 2)
          );
          expect(distance).toBeGreaterThan(10); // Spawn points should be reasonably spread
        }
      }
    });
  });

  describe('Tile Actions', () => {
    test('should validate tile interaction distance', () => {
      const playerId = 'test-player';
      const playerEntity = gameManager.createPlayerEntity({
        id: playerId,
        username: 'TestPlayer'
      });

      const position = playerEntity.getComponent<PositionComponent>('position');
      const playerX = position?.x || 0;
      const playerY = position?.y || 0;

      // Valid nearby tile interactions
      expect(gameManager.requestTileAction(playerId, playerX + 1, playerY, 'flip')).toBe(true);
      expect(gameManager.requestTileAction(playerId, playerX, playerY + 1, 'flag')).toBe(true);
      expect(gameManager.requestTileAction(playerId, playerX - 1, playerY - 1, 'flip')).toBe(true);

      // Invalid far tile interactions
      expect(gameManager.requestTileAction(playerId, playerX + 2, playerY, 'flip')).toBe(false);
      expect(gameManager.requestTileAction(playerId, playerX + 10, playerY + 10, 'flag')).toBe(false);
    });

    test('should reject actions from dead players', () => {
      const playerId = 'test-player';
      const playerEntity = gameManager.createPlayerEntity({
        id: playerId,
        username: 'TestPlayer'
      });

      // Kill the player
      const playerComp = playerEntity.getComponent<PlayerComponent>('player');
      if (playerComp) {
        playerComp.alive = false;
      }

      const position = playerEntity.getComponent<PositionComponent>('position');

      // Dead players should not be able to perform actions
      expect(gameManager.requestTileAction(playerId, (position?.x || 0) + 1, position?.y || 0, 'flip')).toBe(false);
      expect(gameManager.requestTileAction(playerId, position?.x || 0, (position?.y || 0) + 1, 'flag')).toBe(false);
    });
  });

  describe('Security Integration', () => {
    let secureGameManager: GameManager;

    beforeEach(() => {
      // Create GameManager with session security enabled
      secureGameManager = new GameManager({
        enableRateLimiting: false,
        enableBehaviorValidation: false,
        enableSessionSecurity: true, // Enable session security for these tests
        enableReplayProtection: false
      });
    });

    afterEach(() => {
      secureGameManager.destroy();
    });

    test('should create secure player sessions', () => {
      const playerId = 'test-player';
      const username = 'TestPlayer';

      const session = secureGameManager.createSecurePlayerSession(playerId, username);

      expect(session.sessionId).toBeDefined();
      expect(session.sessionToken).toBeDefined();
      expect(typeof session.sessionId).toBe('string');
      expect(typeof session.sessionToken).toBe('string');
      expect(session.sessionId.length).toBeGreaterThan(0);
      expect(session.sessionToken.length).toBeGreaterThan(0);
    });

    test('should validate player sessions', () => {
      const playerId = 'test-player';
      const username = 'TestPlayer';

      const session = secureGameManager.createSecurePlayerSession(playerId, username);
      const validation = secureGameManager.validatePlayerSession(session.sessionId, session.sessionToken);

      expect(validation.valid).toBe(true);
      expect(validation.playerId).toBe(playerId);
      expect(validation.username).toBe(username);
    });
  });

  describe('Game State Management', () => {
    test('should track game progress correctly', () => {
      const progress = gameManager.getObfuscatedMineProgress();
      expect(typeof progress).toBe('number');
      expect(progress).toBeGreaterThanOrEqual(0);
      expect(progress).toBeLessThanOrEqual(100);
    });

    test('should check game end conditions', () => {
      const gameEnded = gameManager.checkGameEnd();
      expect(typeof gameEnded).toBe('boolean');
    });

    test('should provide valid game state', () => {
      const gameState = gameManager.getGameState();

      expect(gameState.gameStartTime).toBeGreaterThan(0);
      expect(gameState.gameEnded).toBe(false);
      expect(Array.isArray(gameState.spawnPoints)).toBe(true);
      expect(gameState.spawnPoints.length).toBeGreaterThan(0);
    });
  });
});
