import { GlobalGameState } from '../../state/GlobalGameState';
import { Entity } from '../../ecs/Entity';
import { createPositionComponent } from '../../components/PositionComponent';
import { createPlayerComponent } from '../../components/PlayerComponent';
import { createTileComponent } from '../../components/TileComponent';

describe('GlobalGameState', () => {
  let globalState: GlobalGameState;

  beforeEach(() => {
    globalState = new GlobalGameState();
  });

  afterEach(() => {
    globalState.clear();
  });

  describe('Entity Registration', () => {
    test('should register and track tile entities', () => {
      const entity = new Entity();
      entity.addComponent('position', createPositionComponent(10, 20));
      entity.addComponent('tile', createTileComponent({ type: 'mine' }));

      globalState.registerTileEntity(entity, 10, 20);

      expect(globalState.getTileEntity(10, 20)).toBe(entity);
      expect(globalState.hasTile(10, 20)).toBe(true);
    });

    test('should register and track player entities', () => {
      const entity = new Entity();
      entity.addComponent('position', createPositionComponent(5, 15));
      entity.addComponent('player', createPlayerComponent({ 
        id: 'player1', 
        username: 'TestUser' 
      }));

      globalState.registerPlayerEntity(entity, 'player1');

      expect(globalState.getPlayerEntity('player1')).toBe(entity);
    });

    test('should unregister entities properly', () => {
      const tileEntity = new Entity();
      tileEntity.addComponent('position', createPositionComponent(10, 20));
      tileEntity.addComponent('tile', createTileComponent({ type: 'empty' }));

      const playerEntity = new Entity();
      playerEntity.addComponent('position', createPositionComponent(5, 15));
      playerEntity.addComponent('player', createPlayerComponent({ 
        id: 'player1', 
        username: 'TestUser' 
      }));

      globalState.registerTileEntity(tileEntity, 10, 20);
      globalState.registerPlayerEntity(playerEntity, 'player1');

      expect(globalState.hasTile(10, 20)).toBe(true);
      expect(globalState.getPlayerEntity('player1')).toBeDefined();

      globalState.unregisterTileEntity(10, 20);
      globalState.unregisterPlayerEntity('player1');

      expect(globalState.hasTile(10, 20)).toBe(false);
      expect(globalState.getPlayerEntity('player1')).toBeUndefined();
    });
  });

  describe('Cache Management', () => {
    test('should cache tile data for performance', () => {
      const entity = new Entity();
      entity.addComponent('position', createPositionComponent(25, 35));
      entity.addComponent('tile', createTileComponent({ 
        type: 'numbered',
        number: 3,
        revealed: true 
      }));

      globalState.registerTileEntity(entity, 25, 35);

      const cachedData = globalState.getTileData(25, 35);
      expect(cachedData).toBeDefined();
      expect(cachedData?.x).toBe(25);
      expect(cachedData?.y).toBe(35);
      expect(cachedData?.type).toBe('numbered');
      expect(cachedData?.number).toBe(3);
      expect(cachedData?.revealed).toBe(true);
    });

    test('should cache player data for performance', () => {
      const entity = new Entity();
      entity.addComponent('position', createPositionComponent(100, 200));
      entity.addComponent('player', createPlayerComponent({ 
        id: 'player1',
        username: 'TestUser',
        score: 150,
        flags: 3,
        alive: true
      }));

      globalState.registerPlayerEntity(entity, 'player1');

      const cachedData = globalState.getPlayerData('player1');
      expect(cachedData).toBeDefined();
      expect(cachedData?.x).toBe(100);
      expect(cachedData?.y).toBe(200);
      expect(cachedData?.id).toBe('player1');
      expect(cachedData?.username).toBe('TestUser');
      expect(cachedData?.score).toBe(150);
      expect(cachedData?.flags).toBe(3);
      expect(cachedData?.alive).toBe(true);
    });

    test('should update cached data when entities change', () => {
      const entity = new Entity();
      entity.addComponent('position', createPositionComponent(10, 10));
      entity.addComponent('player', createPlayerComponent({ 
        id: 'player1',
        username: 'TestUser',
        score: 100
      }));

      globalState.registerPlayerEntity(entity, 'player1');

      // Update the entity
      const playerComp = entity.getComponent('player');
      if (playerComp) {
        playerComp.score = 200;
      }

      const positionComp = entity.getComponent('position');
      if (positionComp) {
        positionComp.x = 20;
        positionComp.y = 30;
      }

      globalState.updatePlayerCache(entity, 'player1');

      const cachedData = globalState.getPlayerData('player1');
      expect(cachedData?.score).toBe(200);
      expect(cachedData?.x).toBe(20);
      expect(cachedData?.y).toBe(30);
    });
  });

  describe('Spawn Points', () => {
    test('should manage spawn points correctly', () => {
      const spawnPoints = [
        { x: 10, y: 10 },
        { x: 50, y: 50 },
        { x: 100, y: 100 }
      ];

      globalState.setSpawnPoints(spawnPoints);

      expect(globalState.spawnPoints).toEqual(spawnPoints);
      expect(globalState.isSpawnPoint(10, 10)).toBe(true);
      expect(globalState.isSpawnPoint(50, 50)).toBe(true);
      expect(globalState.isSpawnPoint(100, 100)).toBe(true);
      expect(globalState.isSpawnPoint(25, 25)).toBe(false);
    });

    test('should clear previous spawn points when setting new ones', () => {
      const firstSpawnPoints = [{ x: 10, y: 10 }];
      const secondSpawnPoints = [{ x: 20, y: 20 }];

      globalState.setSpawnPoints(firstSpawnPoints);
      expect(globalState.isSpawnPoint(10, 10)).toBe(true);

      globalState.setSpawnPoints(secondSpawnPoints);
      expect(globalState.isSpawnPoint(10, 10)).toBe(false);
      expect(globalState.isSpawnPoint(20, 20)).toBe(true);
    });
  });

  describe('Camera System', () => {
    test('should manage camera position', () => {
      const initialPos = globalState.getCameraPosition();
      expect(typeof initialPos.x).toBe('number');
      expect(typeof initialPos.y).toBe('number');

      globalState.setTargetCameraPosition(100, 200);
      
      // Camera should start moving towards target
      const updated = globalState.updateCamera(16.67);
      expect(typeof updated).toBe('boolean');

      const newPos = globalState.getCameraPosition();
      expect(typeof newPos.x).toBe('number');
      expect(typeof newPos.y).toBe('number');
    });

    test('should smoothly interpolate camera movement', () => {
      const startPos = globalState.getCameraPosition();
      globalState.setTargetCameraPosition(startPos.x + 100, startPos.y + 100);

      // Update multiple times to see smooth movement
      for (let i = 0; i < 10; i++) {
        globalState.updateCamera(16.67);
      }

      const endPos = globalState.getCameraPosition();
      
      // Camera should have moved toward target
      expect(endPos.x).not.toBe(startPos.x);
      expect(endPos.y).not.toBe(startPos.y);
    });
  });

  describe('Game Info', () => {
    test('should initialize with default game info', () => {
      expect(globalState.gameInfo.startTime).toBe(0);
      expect(globalState.gameInfo.ended).toBe(false);
      expect(globalState.gameInfo.minesRemaining).toBe(0);
    });

    test('should allow game info updates', () => {
      const now = Date.now();
      globalState.gameInfo.startTime = now;
      globalState.gameInfo.minesRemaining = 50;

      expect(globalState.gameInfo.startTime).toBe(now);
      expect(globalState.gameInfo.minesRemaining).toBe(50);
    });
  });

  describe('Current Player Management', () => {
    test('should track current player', () => {
      const entity = new Entity();
      entity.addComponent('position', createPositionComponent(0, 0));
      entity.addComponent('player', createPlayerComponent({ 
        id: 'current-player',
        username: 'CurrentUser'
      }));

      globalState.registerPlayerEntity(entity, 'current-player');
      globalState.setCurrentPlayer('current-player');

      expect(globalState.currentPlayerId).toBe('current-player');
      expect(globalState.getCurrentPlayerEntity()).toBe(entity);
    });

    test('should handle non-existent current player', () => {
      globalState.setCurrentPlayer('non-existent');
      expect(globalState.getCurrentPlayerEntity()).toBeNull();

      globalState.setCurrentPlayer(null);
      expect(globalState.getCurrentPlayerEntity()).toBeNull();
    });
  });

  describe('Change Tracking', () => {
    test('should track redraw requirements', () => {
      // Initially might need redraw
      globalState.markForRedraw();
      expect(globalState.needsRedrawCheck()).toBe(true);

      // Clear redraw flags
      for (let i = 0; i < 70; i++) { // More than the initial frames
        globalState.clearRedrawFlag();
      }
      expect(globalState.needsRedrawCheck()).toBe(false);
    });

    test('should track UI update requirements', () => {
      expect(globalState.needsUIUpdateCheck()).toBe(true); // Initially needs update

      globalState.clearUIUpdateFlag();
      expect(globalState.needsUIUpdateCheck()).toBe(false);

      globalState.markForUIUpdate();
      expect(globalState.needsUIUpdateCheck()).toBe(true);
    });
  });

  describe('Flag Token Animations', () => {
    test('should add and manage flag token animations', () => {
      expect(globalState.flagTokenAnimations.length).toBe(0);

      globalState.addFlagTokenAnimation(10, 20, '+1 Flag');
      
      expect(globalState.flagTokenAnimations.length).toBe(1);
      expect(globalState.flagTokenAnimations[0].worldX).toBe(10);
      expect(globalState.flagTokenAnimations[0].worldY).toBe(20);
      expect(globalState.flagTokenAnimations[0].text).toBe('+1 Flag');
      expect(globalState.flagTokenAnimations[0].startTime).toBeGreaterThan(0);
    });

    test('should clean up expired animations', () => {
      globalState.addFlagTokenAnimation(10, 20, '+1 Flag');
      
      // Mock an old animation by modifying startTime
      globalState.flagTokenAnimations[0].startTime = Date.now() - 2000; // 2 seconds ago
      
      globalState.updateFlagTokenAnimations();
      
      // Should be cleaned up (animations last 1 second)
      expect(globalState.flagTokenAnimations.length).toBe(0);
    });
  });

  describe('Data Retrieval', () => {
    test('should provide all tile data for rendering', () => {
      const entity1 = new Entity();
      entity1.addComponent('position', createPositionComponent(0, 0));
      entity1.addComponent('tile', createTileComponent({ type: 'mine' }));

      const entity2 = new Entity();
      entity2.addComponent('position', createPositionComponent(1, 1));
      entity2.addComponent('tile', createTileComponent({ type: 'empty' }));

      globalState.registerTileEntity(entity1, 0, 0);
      globalState.registerTileEntity(entity2, 1, 1);

      const allTileData = globalState.getAllTileData();
      expect(allTileData.size).toBe(2);
      expect(allTileData.has('0,0')).toBe(true);
      expect(allTileData.has('1,1')).toBe(true);
    });

    test('should provide all player data for rendering', () => {
      const entity1 = new Entity();
      entity1.addComponent('position', createPositionComponent(10, 10));
      entity1.addComponent('player', createPlayerComponent({ id: 'player1', username: 'User1' }));

      const entity2 = new Entity();
      entity2.addComponent('position', createPositionComponent(20, 20));
      entity2.addComponent('player', createPlayerComponent({ id: 'player2', username: 'User2' }));

      globalState.registerPlayerEntity(entity1, 'player1');
      globalState.registerPlayerEntity(entity2, 'player2');

      const allPlayerData = globalState.getAllPlayerData();
      expect(allPlayerData.size).toBe(2);
      expect(allPlayerData.has('player1')).toBe(true);
      expect(allPlayerData.has('player2')).toBe(true);
    });
  });

  describe('Cleanup', () => {
    test('should clear all state properly', () => {
      // Add some data
      const tileEntity = new Entity();
      tileEntity.addComponent('position', createPositionComponent(0, 0));
      tileEntity.addComponent('tile', createTileComponent({ type: 'mine' }));

      const playerEntity = new Entity();
      playerEntity.addComponent('position', createPositionComponent(5, 5));
      playerEntity.addComponent('player', createPlayerComponent({ id: 'player1', username: 'User1' }));

      globalState.registerTileEntity(tileEntity, 0, 0);
      globalState.registerPlayerEntity(playerEntity, 'player1');
      globalState.setSpawnPoints([{ x: 10, y: 10 }]);
      globalState.addFlagTokenAnimation(5, 5, '+1');

      // Verify data exists
      expect(globalState.hasTile(0, 0)).toBe(true);
      expect(globalState.getPlayerEntity('player1')).toBeDefined();
      expect(globalState.spawnPoints.length).toBe(1);
      expect(globalState.flagTokenAnimations.length).toBe(1);

      // Clear everything
      globalState.clear();

      // Verify everything is cleared
      expect(globalState.hasTile(0, 0)).toBe(false);
      expect(globalState.getPlayerEntity('player1')).toBeUndefined();
      expect(globalState.spawnPoints.length).toBe(0);
      expect(globalState.flagTokenAnimations.length).toBe(0);
      expect(globalState.getAllTileData().size).toBe(0);
      expect(globalState.getAllPlayerData().size).toBe(0);
    });
  });
});