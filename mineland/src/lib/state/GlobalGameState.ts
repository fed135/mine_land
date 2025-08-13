import { Entity } from '../ecs/Entity';
import type { TileComponent } from '../components/TileComponent';
import type { PlayerComponent } from '../components/PlayerComponent';
import type { PositionComponent } from '../components/PositionComponent';

export interface SpawnPoint {
	x: number;
	y: number;
}

export interface GameInfo {
	startTime: number;
	ended: boolean;
	minesRemaining: number;
}

export interface FlagTokenAnimation {
	worldX: number;
	worldY: number;
	startTime: number;
	text: string;
}

/**
 * Global game state manager for performance-critical data and shared state.
 * This breaks pure ECS patterns but provides O(1) lookups and efficient rendering.
 */
export class GlobalGameState {
	// Performance-critical lookup maps
	private tileEntityMap = new Map<string, Entity>();
	private playerEntityMap = new Map<string, Entity>();
	private spawnPointSet = new Set<string>();

	// Cached tile data for rendering (updated from entities)
	private tileDataMap = new Map<string, TileComponent & PositionComponent>();
	private playerDataMap = new Map<string, PlayerComponent & PositionComponent>();

	// Game state
	public gameInfo: GameInfo = { startTime: 0, ended: false, minesRemaining: 0 };
	public spawnPoints: SpawnPoint[] = [];
	public currentPlayerId: string | null = null;

	// Animation state
	public flagTokenAnimations: FlagTokenAnimation[] = [];

	// Change tracking for performance
	private redrawFramesRemaining = 60;
	private needsUIUpdate = true;

	// Camera state
	private cameraX = 0;
	private cameraY = 0;
	private targetCameraX = 0;
	private targetCameraY = 0;

	/**
	 * Register a tile entity for global access
	 */
	registerTileEntity(entity: Entity, x: number, y: number): void {
		const key = `${x},${y}`;
		this.tileEntityMap.set(key, entity);
		this.updateTileCache(entity, x, y);
	}

	/**
	 * Unregister a tile entity
	 */
	unregisterTileEntity(x: number, y: number): void {
		const key = `${x},${y}`;
		this.tileEntityMap.delete(key);
		this.tileDataMap.delete(key);
	}

	/**
	 * Register a player entity for global access
	 */
	registerPlayerEntity(entity: Entity, playerId: string): void {
		this.playerEntityMap.set(playerId, entity);
		this.updatePlayerCache(entity, playerId);
	}

	/**
	 * Unregister a player entity
	 */
	unregisterPlayerEntity(playerId: string): void {
		this.playerEntityMap.delete(playerId);
		this.playerDataMap.delete(playerId);
	}

	/**
	 * Update cached tile data for rendering performance
	 */
	updateTileCache(entity: Entity, x: number, y: number): void {
		const key = `${x},${y}`;
		const tileComp = entity.getComponent<TileComponent>('tile');
		const posComp = entity.getComponent<PositionComponent>('position');

		if (tileComp && posComp) {
			this.tileDataMap.set(key, { ...tileComp, ...posComp });
		}
	}

	/**
	 * Update cached player data for rendering performance
	 */
	updatePlayerCache(entity: Entity, playerId: string): void {
		const playerComp = entity.getComponent<PlayerComponent>('player');
		const posComp = entity.getComponent<PositionComponent>('position');

		if (playerComp && posComp) {
			this.playerDataMap.set(playerId, { ...playerComp, ...posComp });
		}
	}

	/**
	 * Get tile entity by coordinates (O(1) lookup)
	 */
	getTileEntity(x: number, y: number): Entity | undefined {
		return this.tileEntityMap.get(`${x},${y}`);
	}

	/**
	 * Get player entity by ID (O(1) lookup)
	 */
	getPlayerEntity(playerId: string): Entity | undefined {
		return this.playerEntityMap.get(playerId);
	}

	/**
	 * Get cached tile data for rendering (O(1) lookup)
	 */
	getTileData(x: number, y: number): (TileComponent & PositionComponent) | undefined {
		return this.tileDataMap.get(`${x},${y}`);
	}

	/**
	 * Get cached player data for rendering (O(1) lookup)
	 */
	getPlayerData(playerId: string): (PlayerComponent & PositionComponent) | undefined {
		return this.playerDataMap.get(playerId);
	}

	/**
	 * Check if tile exists at coordinates (O(1) lookup)
	 */
	hasTile(x: number, y: number): boolean {
		return this.tileEntityMap.has(`${x},${y}`);
	}

	/**
	 * Check if position is a spawn point (O(1) lookup)
	 */
	isSpawnPoint(x: number, y: number): boolean {
		return this.spawnPointSet.has(`${x},${y}`);
	}

	/**
	 * Set spawn points and update internal set for fast lookup
	 */
	setSpawnPoints(spawnPoints: SpawnPoint[]): void {
		this.spawnPoints = spawnPoints;
		this.spawnPointSet.clear();
		for (const point of spawnPoints) {
			this.spawnPointSet.add(`${point.x},${point.y}`);
		}
	}

	/**
	 * Get all tile data for rendering (returns cached data)
	 */
	getAllTileData(): Map<string, TileComponent & PositionComponent> {
		return this.tileDataMap;
	}

	/**
	 * Get all player data for rendering (returns cached data)
	 */
	getAllPlayerData(): Map<string, PlayerComponent & PositionComponent> {
		return this.playerDataMap;
	}

	/**
	 * Get current player entity
	 */
	getCurrentPlayerEntity(): Entity | null {
		return this.currentPlayerId ? this.getPlayerEntity(this.currentPlayerId) || null : null;
	}

	/**
	 * Set current player ID
	 */
	setCurrentPlayer(playerId: string | null): void {
		this.currentPlayerId = playerId;
	}

	// Camera methods
	getCameraPosition(): { x: number, y: number } {
		return { x: this.cameraX, y: this.cameraY };
	}

	getTargetCameraPosition(): { x: number, y: number } {
		return { x: this.targetCameraX, y: this.targetCameraY };
	}

	setCameraPosition(x: number, y: number): void {
		this.cameraX = x;
		this.cameraY = y;
	}

	setTargetCameraPosition(x: number, y: number): void {
		this.targetCameraX = x;
		this.targetCameraY = y;
	}

	updateCamera(_deltaTime: number): boolean {
		const lerpFactor = 0.08;
		const oldCameraX = this.cameraX;
		const oldCameraY = this.cameraY;

		// Smooth camera interpolation
		this.cameraX += (this.targetCameraX - this.cameraX) * lerpFactor;
		this.cameraY += (this.targetCameraY - this.cameraY) * lerpFactor;

		// Check if camera moved enough to warrant redraw
		const cameraMovement = Math.abs(oldCameraX - this.cameraX) + Math.abs(oldCameraY - this.cameraY);
		const distanceToTarget = Math.abs(this.targetCameraX - this.cameraX) + Math.abs(this.targetCameraY - this.cameraY);

		const hasMoved = cameraMovement > 0.001 || distanceToTarget > 0.001;
		if (hasMoved) {
			this.markForRedraw();
		}

		return hasMoved;
	}

	// Change tracking methods
	markForRedraw(): void {
		this.redrawFramesRemaining = 60;
	}

	markForUIUpdate(): void {
		this.needsUIUpdate = true;
	}

	needsRedrawCheck(): boolean {
		return this.redrawFramesRemaining > 0;
	}

	needsUIUpdateCheck(): boolean {
		return this.needsUIUpdate;
	}

	clearRedrawFlag(): void {
		if (this.redrawFramesRemaining > 0) {
			this.redrawFramesRemaining--;
		}
	}

	clearUIUpdateFlag(): void {
		this.needsUIUpdate = false;
	}

	// Animation methods
	addFlagTokenAnimation(worldX: number, worldY: number, text: string): void {
		this.flagTokenAnimations.push({
			worldX,
			worldY,
			startTime: Date.now(),
			text
		});
	}

	updateFlagTokenAnimations(): void {
		const currentTime = Date.now();
		const ANIMATION_DURATION = 1000;

		this.flagTokenAnimations = this.flagTokenAnimations.filter(
			animation => currentTime - animation.startTime < ANIMATION_DURATION
		);
	}

	/**
	 * Clear all state (for cleanup)
	 */
	clear(): void {
		this.tileEntityMap.clear();
		this.playerEntityMap.clear();
		this.spawnPointSet.clear();
		this.tileDataMap.clear();
		this.playerDataMap.clear();
		this.flagTokenAnimations = [];
		this.spawnPoints = [];
		this.currentPlayerId = null;
		this.cameraX = 0;
		this.cameraY = 0;
		this.targetCameraX = 0;
		this.targetCameraY = 0;
	}
}
