// Server-side game state integrity checks
import type { TileRegistry } from '../registries/TileRegistry.ts';
import type { PlayerRegistry } from '../registries/PlayerRegistry.ts';

export interface IntegrityViolation {
  type: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
  timestamp: number;
  data?: any;
}

export class IntegrityChecker {
  private violations: IntegrityViolation[] = [];

  // Check tile state consistency
  validateTileStates(tileRegistry: TileRegistry): IntegrityViolation[] {
    const violations: IntegrityViolation[] = [];
    const tiles = Array.from(tileRegistry.getAllTileData().values());

    // Limit validation to prevent stack overflow with large worlds
    const maxTilesToCheck = 10000; // Only check first 10k tiles for performance
    const tilesToCheck = tiles.slice(0, maxTilesToCheck);

    for (const tile of tilesToCheck) {
      // Check for invalid tile states
      if (!['hidden', 'revealed', 'flagged', 'exploded'].includes(tile.state)) {
        violations.push({
          type: 'invalid_tile_state',
          severity: 'high',
          description: `Invalid tile state: ${tile.state} at (${tile.x}, ${tile.y})`,
          timestamp: Date.now(),
          data: { x: tile.x, y: tile.y, state: tile.state }
        });
      }

      // Check for revealed tiles with impossible adjacent mine counts
      if (tile.state === 'revealed' && tile.adjacentMines !== undefined) {
        if (tile.adjacentMines < 0 || tile.adjacentMines > 8) {
          violations.push({
            type: 'invalid_adjacent_mines',
            severity: 'high',
            description: `Invalid adjacent mines count: ${tile.adjacentMines} at (${tile.x}, ${tile.y})`,
            timestamp: Date.now(),
            data: { x: tile.x, y: tile.y, adjacentMines: tile.adjacentMines }
          });
        }
      }

      // Check for exploded non-mine tiles
      if (tile.state === 'exploded' && !tile.isMine) {
        violations.push({
          type: 'exploded_non_mine',
          severity: 'high',
          description: `Non-mine tile exploded at (${tile.x}, ${tile.y})`,
          timestamp: Date.now(),
          data: { x: tile.x, y: tile.y }
        });
      }

      // Check for flagged tiles that are revealed
      if (tile.state === 'flagged' && tile.state === 'revealed') {
        violations.push({
          type: 'flagged_and_revealed',
          severity: 'medium',
          description: `Tile is both flagged and revealed at (${tile.x}, ${tile.y})`,
          timestamp: Date.now(),
          data: { x: tile.x, y: tile.y }
        });
      }
    }

    return violations;
  }

  // Check player state consistency
  validatePlayerStates(playerRegistry: PlayerRegistry): IntegrityViolation[] {
    const violations: IntegrityViolation[] = [];
    const players = Array.from(playerRegistry.getAllPlayerData().values());

    for (const player of players) {
      // Check for negative scores
      if (player.score < 0) {
        violations.push({
          type: 'negative_score',
          severity: 'medium',
          description: `Player has negative score: ${player.score}`,
          timestamp: Date.now(),
          data: { playerId: player.id, score: player.score }
        });
      }

      // Check for excessive flag counts
      if (player.flags < 0) {
        violations.push({
          type: 'negative_flags',
          severity: 'high',
          description: `Player has negative flag count: ${player.flags}`,
          timestamp: Date.now(),
          data: { playerId: player.id, flags: player.flags }
        });
      }

      // Check for players outside world bounds
      if (player.x < 0 || player.x >= 1000 || player.y < 0 || player.y >= 1000) {
        violations.push({
          type: 'player_out_of_bounds',
          severity: 'high',
          description: `Player outside world bounds at (${player.x}, ${player.y})`,
          timestamp: Date.now(),
          data: { playerId: player.id, x: player.x, y: player.y }
        });
      }
    }

    return violations;
  }

  // Check game state consistency
  validateGameState(tileRegistry: TileRegistry, playerRegistry: PlayerRegistry): IntegrityViolation[] {
    const violations: IntegrityViolation[] = [];

    // Check mine consistency
    const tileData = Array.from(tileRegistry.getAllTileData().values());
    const totalTiles = tileData.length;
    const mineTiles = tileData.filter(t => t.isMine).length;
    const expectedMines = Math.floor(totalTiles * 0.15); // 15% mine density

    if (Math.abs(mineTiles - expectedMines) > expectedMines * 0.1) { // Allow 10% variance
      violations.push({
        type: 'mine_count_inconsistency',
        severity: 'medium',
        description: `Mine count inconsistent: expected ~${expectedMines}, found ${mineTiles}`,
        timestamp: Date.now(),
        data: { expectedMines, actualMines: mineTiles }
      });
    }

    // Check flag consistency
    const flaggedTiles = tileData.filter(t => t.state === 'flagged').length;
    const playerData = Array.from(playerRegistry.getAllPlayerData().values());
    const totalPlayerFlags = playerData.reduce((sum, p) => sum + p.flags, 0);

    if (flaggedTiles !== totalPlayerFlags) {
      violations.push({
        type: 'flag_count_mismatch',
        severity: 'medium',
        description: `Flagged tiles (${flaggedTiles}) don't match total player flags (${totalPlayerFlags})`,
        timestamp: Date.now(),
        data: { flaggedTiles, totalPlayerFlags }
      });
    }

    return violations;
  }

  // Validate adjacent mine counts
  validateAdjacentMineCounts(tileRegistry: TileRegistry): IntegrityViolation[] {
    const violations: IntegrityViolation[] = [];
    const tiles = Array.from(tileRegistry.getAllTileData().values());

    // Limit validation to prevent performance issues
    const maxTilesToCheck = 1000; // Only check first 1k tiles for adjacent mine validation
    const tilesToCheck = tiles.slice(0, maxTilesToCheck);

    for (const tile of tilesToCheck) {
      if (tile.state === 'revealed' && !tile.isMine && tile.adjacentMines !== undefined) {
        // Count actual adjacent mines
        let actualAdjacentMines = 0;

        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            if (dx === 0 && dy === 0) {
              continue;
            }

            const neighborTile = tileRegistry.getTileData(tile.x + dx, tile.y + dy);
            if (neighborTile && neighborTile.isMine) {
              actualAdjacentMines++;
            }
          }
        }

        if (actualAdjacentMines !== tile.adjacentMines) {
          violations.push({
            type: 'incorrect_adjacent_mines',
            severity: 'high',
            description: `Incorrect adjacent mines: claimed ${tile.adjacentMines}, actual ${actualAdjacentMines} at (${tile.x}, ${tile.y})`,
            timestamp: Date.now(),
            data: {
              x: tile.x,
              y: tile.y,
              claimed: tile.adjacentMines,
              actual: actualAdjacentMines
            }
          });
        }
      }
    }

    return violations;
  }

  // Run comprehensive integrity check
  runFullIntegrityCheck(tileRegistry: TileRegistry, playerRegistry: PlayerRegistry): {
    violations: IntegrityViolation[];
    summary: {
      total: number;
      high: number;
      medium: number;
      low: number;
    };
  } {
    const allViolations = [
      ...this.validateTileStates(tileRegistry),
      ...this.validatePlayerStates(playerRegistry),
      ...this.validateGameState(tileRegistry, playerRegistry),
      ...this.validateAdjacentMineCounts(tileRegistry)
    ];

    const summary = {
      total: allViolations.length,
      high: allViolations.filter(v => v.severity === 'high').length,
      medium: allViolations.filter(v => v.severity === 'medium').length,
      low: allViolations.filter(v => v.severity === 'low').length
    };

    // Add violations to instance storage
    this.violations.push(...allViolations);

    // Log high severity violations immediately
    allViolations.filter(v => v.severity === 'high').forEach(violation => {
    });

    return { violations: allViolations, summary };
  }

  // Get all violations
  getAllViolations(): IntegrityViolation[] {
    return [...this.violations];
  }

  // Get violations by severity
  getViolationsBySeverity(severity: 'low' | 'medium' | 'high'): IntegrityViolation[] {
    return this.violations.filter(v => v.severity === severity);
  }

  // Clear old violations
  cleanup(): void {
    const oneHourAgo = Date.now() - 3600000;
    this.violations = this.violations.filter(v => v.timestamp > oneHourAgo);
  }

  // Reset all violations
  reset(): void {
    this.violations = [];
  }
}
