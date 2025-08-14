import { UISystem } from '../../systems/UISystem';
import { GlobalGameState } from '../../state/GlobalGameState';

describe('UISystem', () => {
  let uiSystem: UISystem;
  let globalState: GlobalGameState;
  let mockElements: any;

  beforeEach(() => {
    globalState = new GlobalGameState();
    uiSystem = new UISystem(globalState);

    // Create mock DOM elements
    mockElements = {
      connectionStatusEl: document.createElement('div'),
      connectionTextEl: document.createElement('div'),
      playerScoreEl: document.createElement('div'),
      playerFlagsEl: document.createElement('div'),
      playerPositionEl: document.createElement('div'),
      timerDisplayEl: document.createElement('div'),
      minesRemainingEl: document.createElement('div'),
      playerStatusEl: document.createElement('div'),
      leaderboardElement: document.createElement('div')
    };

    uiSystem.setElements(mockElements);
  });

  afterEach(() => {
    globalState.clear();
  });

  describe('Initialization', () => {
    test('should initialize with empty state', () => {
      const newUISystem = new UISystem(globalState);
      expect(newUISystem).toBeInstanceOf(UISystem);
    });

    test('should accept UI elements configuration', () => {
      expect(() => {
        uiSystem.setElements(mockElements);
      }).not.toThrow();
    });
  });

  describe('Timer Updates', () => {
    test('should always update timer regardless of UI update flags', () => {
      // Set a start time
      globalState.gameInfo.startTime = Date.now() - 65000; // 65 seconds ago
      
      // Clear UI update flag to simulate no other UI updates needed
      globalState.clearUIUpdateFlag();
      expect(globalState.needsUIUpdateCheck()).toBe(false);

      uiSystem.update(16.67);

      // Timer should still be updated
      expect(mockElements.timerDisplayEl.textContent).toBeTruthy();
      expect(mockElements.timerDisplayEl.textContent).toMatch(/\d{2}:\d{2}/);
    });

    test('should format timer correctly', () => {
      const startTime = Date.now() - 125000; // 125 seconds ago (2:05)
      globalState.gameInfo.startTime = startTime;

      uiSystem.update(16.67);

      // Should show 02:05
      expect(mockElements.timerDisplayEl.textContent).toBe('02:05');
    });

    test('should handle zero start time gracefully', () => {
      globalState.gameInfo.startTime = 0;

      expect(() => {
        uiSystem.update(16.67);
      }).not.toThrow();
    });

    test('should update timer content only when changed', () => {
      globalState.gameInfo.startTime = Date.now() - 30000; // 30 seconds ago
      
      uiSystem.update(16.67);
      const firstContent = mockElements.timerDisplayEl.textContent;

      // Update again immediately (same second)
      uiSystem.update(16.67);
      const secondContent = mockElements.timerDisplayEl.textContent;

      expect(firstContent).toBe(secondContent);
    });
  });

  describe('Player Stats Updates', () => {
    test('should update player score when changed', () => {
      const mockPlayer = {
        id: 'test-player',
        username: 'TestUser',
        score: 150,
        flags: 3,
        x: 10,
        y: 20,
        alive: true
      };

      uiSystem.setCurrentPlayer(mockPlayer);
      globalState.markForUIUpdate();

      uiSystem.update(16.67);

      expect(mockElements.playerScoreEl.textContent).toBe('150');
      expect(mockElements.playerFlagsEl.textContent).toBe('3');
      expect(mockElements.playerPositionEl.textContent).toBe('10, 20');
    });

    test('should not update unchanged player stats', () => {
      const mockPlayer = {
        id: 'test-player',
        score: 100,
        flags: 2,
        x: 5,
        y: 15,
        alive: true
      };

      uiSystem.setCurrentPlayer(mockPlayer);
      globalState.markForUIUpdate();
      
      uiSystem.update(16.67);
      const firstScore = mockElements.playerScoreEl.textContent;

      // Update again with same data
      uiSystem.update(16.67);
      const secondScore = mockElements.playerScoreEl.textContent;

      expect(firstScore).toBe(secondScore);
      expect(firstScore).toBe('100');
    });

    test('should handle missing player data gracefully', () => {
      uiSystem.setCurrentPlayer(null);
      globalState.markForUIUpdate();

      expect(() => {
        uiSystem.update(16.67);
      }).not.toThrow();
    });
  });

  describe('Player Status Updates', () => {
    test('should show alive status correctly', () => {
      const mockPlayer = {
        id: 'test-player',
        alive: true
      };

      uiSystem.setCurrentPlayer(mockPlayer);
      globalState.markForUIUpdate();

      uiSystem.update(16.67);

      expect(mockElements.playerStatusEl.textContent).toBe('Alive');
      expect(mockElements.playerStatusEl.className).toBe('alive');
    });

    test('should show dead status correctly', () => {
      const mockPlayer = {
        id: 'test-player',
        alive: false
      };

      uiSystem.setCurrentPlayer(mockPlayer);
      globalState.markForUIUpdate();

      uiSystem.update(16.67);

      expect(mockElements.playerStatusEl.textContent).toBe('Dead');
      expect(mockElements.playerStatusEl.className).toBe('dead');
    });
  });

  describe('Game Info Updates', () => {
    test('should update mines remaining', () => {
      globalState.gameInfo.minesRemaining = 42;
      globalState.markForUIUpdate();

      uiSystem.update(16.67);

      expect(mockElements.minesRemainingEl.textContent).toBe('42');
    });

    test('should not update unchanged mines count', () => {
      globalState.gameInfo.minesRemaining = 25;
      globalState.markForUIUpdate();

      uiSystem.update(16.67);
      globalState.clearUIUpdateFlag(); // Clear the flag

      // Update again without changes
      uiSystem.update(16.67);

      // Should still show correct value
      expect(mockElements.minesRemainingEl.textContent).toBe('25');
    });
  });

  describe('Connection Status', () => {
    test('should update connection status when connected', () => {
      uiSystem.setConnectionStatus(true);

      expect(mockElements.connectionStatusEl.className).toBe('connected');
      expect(mockElements.connectionTextEl.textContent).toBe('Connected');
    });

    test('should update connection status when disconnected', () => {
      uiSystem.setConnectionStatus(false);

      expect(mockElements.connectionStatusEl.className).toBe('disconnected');
      expect(mockElements.connectionTextEl.textContent).toBe('Disconnected');
    });
  });

  describe('Leaderboard Updates', () => {
    test('should update leaderboard with player list', () => {
      const mockPlayers = [
        { id: 'player1', username: 'Alice', score: 200, flags: 5 },
        { id: 'player2', username: 'Bob', score: 150, flags: 3 },
        { id: 'player3', username: 'Charlie', score: 100, flags: 2 }
      ];

      uiSystem.setLeaderboardPlayers(mockPlayers);

      expect(mockElements.leaderboardElement.innerHTML).toContain('Alice');
      expect(mockElements.leaderboardElement.innerHTML).toContain('Bob');
      expect(mockElements.leaderboardElement.innerHTML).toContain('Charlie');
      expect(mockElements.leaderboardElement.innerHTML).toContain('200');
      expect(mockElements.leaderboardElement.innerHTML).toContain('150');
      expect(mockElements.leaderboardElement.innerHTML).toContain('100');
    });

    test('should sort leaderboard by score descending', () => {
      const mockPlayers = [
        { id: 'player1', username: 'Alice', score: 100, flags: 2 },
        { id: 'player2', username: 'Bob', score: 200, flags: 4 },
        { id: 'player3', username: 'Charlie', score: 150, flags: 3 }
      ];

      uiSystem.setLeaderboardPlayers(mockPlayers);

      const html = mockElements.leaderboardElement.innerHTML;
      const bobIndex = html.indexOf('Bob');
      const charlieIndex = html.indexOf('Charlie');
      const aliceIndex = html.indexOf('Alice');

      // Bob (200) should come first, then Charlie (150), then Alice (100)
      expect(bobIndex).toBeLessThan(charlieIndex);
      expect(charlieIndex).toBeLessThan(aliceIndex);
    });

    test('should highlight current player in leaderboard', () => {
      const mockPlayers = [
        { id: 'player1', username: 'Alice', score: 200, flags: 5 },
        { id: 'player2', username: 'Bob', score: 150, flags: 3 }
      ];

      const currentPlayer = { id: 'player1', username: 'Alice' };
      uiSystem.setCurrentPlayer(currentPlayer);
      uiSystem.setLeaderboardPlayers(mockPlayers);

      expect(mockElements.leaderboardElement.innerHTML).toContain('current-player');
    });

    test('should handle empty leaderboard', () => {
      uiSystem.setLeaderboardPlayers([]);

      expect(mockElements.leaderboardElement.innerHTML).toContain('No players connected');
    });
  });

  describe('Performance Optimization', () => {
    test('should skip updates when no UI update needed', () => {
      const mockPlayer = { id: 'player1', score: 100 };
      uiSystem.setCurrentPlayer(mockPlayer);
      
      globalState.clearUIUpdateFlag();
      
      // Mock element to track if textContent was set
      const scoreSpy = jest.spyOn(mockElements.playerScoreEl, 'textContent', 'set');
      
      uiSystem.update(16.67);
      
      // Timer should still update, but other UI elements should not
      expect(scoreSpy).not.toHaveBeenCalled();
    });

    test('should cache UI values to avoid unnecessary DOM updates', () => {
      const mockPlayer = { id: 'player1', score: 100, flags: 2 };
      uiSystem.setCurrentPlayer(mockPlayer);
      
      globalState.markForUIUpdate();
      uiSystem.update(16.67);
      globalState.clearUIUpdateFlag();
      
      const scoreSpy = jest.spyOn(mockElements.playerScoreEl, 'textContent', 'set');
      
      // Update again with same values
      globalState.markForUIUpdate();
      uiSystem.update(16.67);
      
      // Should not update DOM since values haven't changed
      expect(scoreSpy).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    test('should handle missing DOM elements gracefully', () => {
      const partialElements = {
        timerDisplayEl: mockElements.timerDisplayEl
        // Missing other elements
      };

      uiSystem.setElements(partialElements);
      
      expect(() => {
        uiSystem.update(16.67);
      }).not.toThrow();
    });

    test('should handle null/undefined values in player data', () => {
      const mockPlayer = {
        id: 'player1',
        score: null,
        flags: undefined,
        x: 0,
        y: 0,
        alive: true
      };

      uiSystem.setCurrentPlayer(mockPlayer);
      globalState.markForUIUpdate();

      expect(() => {
        uiSystem.update(16.67);
      }).not.toThrow();
    });
  });
});