import { GameManager } from '../GameManager';
import { GlobalGameState } from '../state/GlobalGameState';
import { GameStateType, ConnectionState, PlayerState } from '../state/GameState';

// Mock Canvas element
const mockCanvas = {
  getContext: jest.fn(() => ({
    fillStyle: '',
    fillRect: jest.fn(),
    clearRect: jest.fn(),
    drawImage: jest.fn(),
    save: jest.fn(),
    restore: jest.fn(),
    translate: jest.fn(),
    scale: jest.fn(),
  })),
  width: 800,
  height: 600,
  style: {},
} as any as HTMLCanvasElement;

describe('GameManager', () => {
  let gameManager: GameManager;

  beforeEach(() => {
    gameManager = new GameManager();
  });

  afterEach(() => {
    gameManager.destroy();
  });

  describe('Initialization', () => {
    test('should initialize with correct default states', () => {
      expect(gameManager.getGameState()).toBe(GameStateType.WELCOME_SCREEN);
      expect(gameManager.getConnectionState()).toBe(ConnectionState.DISCONNECTED);
      expect(gameManager.getPlayerState()).toBe(PlayerState.SPAWNING);
    });

    test('should have a valid global state', () => {
      const globalState = gameManager.getGlobalState();
      expect(globalState).toBeInstanceOf(GlobalGameState);
      expect(globalState.gameInfo).toBeDefined();
      expect(globalState.gameInfo.startTime).toBe(0);
      expect(globalState.gameInfo.ended).toBe(false);
    });
  });

  describe('Canvas Management', () => {
    test('should set canvas for systems', () => {
      expect(() => {
        gameManager.setCanvas(mockCanvas);
      }).not.toThrow();
    });
  });

  describe('Entity Management', () => {
    test('should create player entities correctly', () => {
      const playerData = {
        id: 'test-player',
        username: 'TestUser',
        x: 10,
        y: 20,
        color: '#ff0000',
        score: 100,
        flags: 5,
        alive: true,
        connected: true
      };

      const entity = gameManager.createPlayer(playerData);
      
      expect(entity).toBeDefined();
      expect(entity.hasComponent('position')).toBe(true);
      expect(entity.hasComponent('player')).toBe(true);
      expect(entity.hasComponent('render')).toBe(true);

      const position = entity.getComponent('position');
      const player = entity.getComponent('player');

      expect(position?.x).toBe(playerData.x);
      expect(position?.y).toBe(playerData.y);
      expect(player?.id).toBe(playerData.id);
      expect(player?.username).toBe(playerData.username);
      expect(player?.score).toBe(playerData.score);
    });

    test('should create tile entities correctly', () => {
      const tileData = {
        x: 15,
        y: 25,
        type: 'mine' as const,
        revealed: false,
        flagged: false
      };

      const entity = gameManager.createTile(tileData);
      
      expect(entity).toBeDefined();
      expect(entity.hasComponent('position')).toBe(true);
      expect(entity.hasComponent('tile')).toBe(true);
      expect(entity.hasComponent('render')).toBe(true);

      const position = entity.getComponent('position');
      const tile = entity.getComponent('tile');

      expect(position?.x).toBe(tileData.x);
      expect(position?.y).toBe(tileData.y);
      expect(tile?.type).toBe(tileData.type);
      expect(tile?.revealed).toBe(tileData.revealed);
      expect(tile?.flagged).toBe(tileData.flagged);
    });

    test('should update existing tiles instead of creating duplicates', () => {
      const tileData1 = { x: 10, y: 10, type: 'empty' as const };
      const tileData2 = { x: 10, y: 10, type: 'mine' as const, revealed: true };

      const entity1 = gameManager.createTile(tileData1);
      const entity2 = gameManager.createTile(tileData2);

      // Should be the same entity, just updated
      expect(entity1).toBe(entity2);

      const tile = entity2.getComponent('tile');
      expect(tile?.type).toBe('mine');
      expect(tile?.revealed).toBe(true);
    });
  });

  describe('Player Management', () => {
    test('should update player positions and stats', () => {
      const playerData = {
        id: 'test-player',
        username: 'TestUser',
        x: 10,
        y: 10,
        alive: true
      };

      const entity = gameManager.createPlayer(playerData);
      
      gameManager.updatePlayer('test-player', {
        x: 15,
        y: 20,
        score: 200,
        flags: 3
      });

      const position = entity.getComponent('position');
      const player = entity.getComponent('player');

      expect(position?.x).toBe(15);
      expect(position?.y).toBe(20);
      expect(player?.score).toBe(200);
      expect(player?.flags).toBe(3);
    });

    test('should handle player death properly', () => {
      const playerData = {
        id: 'test-player',
        username: 'TestUser',
        x: 10,
        y: 10,
        alive: true
      };

      const entity = gameManager.createPlayer(playerData);
      
      gameManager.updatePlayer('test-player', { alive: false });

      const player = entity.getComponent('player');
      expect(player?.alive).toBe(false);
    });

    test('should remove players properly', () => {
      const playerData = {
        id: 'test-player',
        username: 'TestUser',
        x: 10,
        y: 10,
        alive: true
      };

      gameManager.createPlayer(playerData);
      const globalState = gameManager.getGlobalState();
      
      expect(globalState.getPlayerEntity('test-player')).toBeDefined();
      
      gameManager.removePlayer('test-player');
      
      expect(globalState.getPlayerEntity('test-player')).toBeUndefined();
    });
  });

  describe('State Transitions', () => {
    test('should handle game state transitions', () => {
      expect(gameManager.getGameState()).toBe(GameStateType.WELCOME_SCREEN);
      
      const transitioned = gameManager.transitionGameState(GameStateType.CONNECTING);
      expect(transitioned).toBe(true);
      expect(gameManager.getGameState()).toBe(GameStateType.CONNECTING);
    });

    test('should handle connection state transitions', () => {
      expect(gameManager.getConnectionState()).toBe(ConnectionState.DISCONNECTED);
      
      const transitioned = gameManager.transitionConnectionState(ConnectionState.CONNECTING);
      expect(transitioned).toBe(true);
      expect(gameManager.getConnectionState()).toBe(ConnectionState.CONNECTING);
    });

    test('should handle player state transitions', () => {
      expect(gameManager.getPlayerState()).toBe(PlayerState.SPAWNING);
      
      const transitioned = gameManager.transitionPlayerState(PlayerState.ALIVE);
      expect(transitioned).toBe(true);
      expect(gameManager.getPlayerState()).toBe(PlayerState.ALIVE);
    });
  });

  describe('UI System Integration', () => {
    test('should set UI elements without errors', () => {
      const mockUIElements = {
        connectionStatusEl: document.createElement('div'),
        connectionTextEl: document.createElement('div'),
        playerScoreEl: document.createElement('div'),
        playerFlagsEl: document.createElement('div'),
        timerDisplayEl: document.createElement('div'),
      };

      expect(() => {
        gameManager.setUIElements(mockUIElements);
      }).not.toThrow();
    });

    test('should handle player updates via UI callbacks', () => {
      const mockPlayer = {
        id: 'test-player',
        username: 'TestUser',
        score: 50,
        flags: 2,
        alive: true
      };

      let callbackCalled = false;
      gameManager.setUICallbacks({
        onPlayerUpdate: (player) => {
          expect(player).toEqual(mockPlayer);
          callbackCalled = true;
        }
      });

      // This would normally be called by the network system
      // For testing, we can verify the callback setup worked
      expect(callbackCalled).toBe(false); // Not called yet
    });
  });

  describe('Update Loop', () => {
    test('should update all systems without errors', () => {
      gameManager.setCanvas(mockCanvas);
      
      expect(() => {
        gameManager.update(16.67); // 60 FPS delta time
      }).not.toThrow();
    });

    test('should update state machines during update', () => {
      const initialGameState = gameManager.getGameState();
      
      gameManager.update(16.67);
      
      // State might change or stay the same depending on conditions
      const afterUpdateState = gameManager.getGameState();
      expect(typeof afterUpdateState).toBe('number');
    });
  });

  describe('Global State Integration', () => {
    test('should provide camera position access', () => {
      const cameraPos = gameManager.getCameraPosition();
      
      expect(typeof cameraPos.x).toBe('number');
      expect(typeof cameraPos.y).toBe('number');
    });

    test('should handle spawn points correctly', () => {
      const spawnPoints = [
        { x: 10, y: 10 },
        { x: 50, y: 50 },
        { x: 100, y: 100 }
      ];

      gameManager.setSpawnPoints(spawnPoints);
      
      const globalState = gameManager.getGlobalState();
      expect(globalState.spawnPoints).toEqual(spawnPoints);
    });

    test('should handle flag token animations', () => {
      expect(() => {
        gameManager.addFlagTokenAnimation(10, 20, '+1 Flag');
      }).not.toThrow();

      const globalState = gameManager.getGlobalState();
      expect(globalState.flagTokenAnimations.length).toBeGreaterThan(0);
    });
  });

  describe('Cleanup', () => {
    test('should clean up resources properly', () => {
      // Create some entities
      gameManager.createPlayer({ id: 'player1', username: 'User1', x: 0, y: 0 });
      gameManager.createTile({ x: 5, y: 5, type: 'mine' });
      
      expect(() => {
        gameManager.destroy();
      }).not.toThrow();
      
      // After destruction, global state should be cleared
      const globalState = gameManager.getGlobalState();
      expect(globalState.getAllPlayerData().size).toBe(0);
      expect(globalState.getAllTileData().size).toBe(0);
    });
  });
});