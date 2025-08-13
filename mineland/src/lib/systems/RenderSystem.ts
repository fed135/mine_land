import { System } from '../ecs/System';
import { GlobalGameState } from '../state/GlobalGameState';
import type { PositionComponent } from '../components/PositionComponent';
import type { TileComponent } from '../components/TileComponent';
import type { PlayerComponent } from '../components/PlayerComponent';

interface SpriteData {
    x: number;
    y: number;
}

export class RenderSystem extends System {
	private globalState: GlobalGameState;
	private canvas: HTMLCanvasElement | null = null;
	private ctx: CanvasRenderingContext2D | null = null;
	private spritesheet: HTMLCanvasElement | null = null;
	private spritesheetCtx: CanvasRenderingContext2D | null = null;
	private spritesheetInitialized = false;

	// Performance optimization - cached rendering data
	private lastFrameRendered = false;

	private readonly TILE_SIZE = 48;
	private readonly SPRITESHEET_WIDTH = this.TILE_SIZE * 9; // 9 sprites wide
	private readonly SPRITESHEET_HEIGHT = this.TILE_SIZE * 2; // 2 sprites tall

	// Minesweeper colors
	private readonly COLORS = {
		COVERED: '#c0c0c0',
		REVEALED: '#ffffff',
		MINE: '#ff0000',
		EXPLOSION: '#ff4400',
		BORDER_LIGHT: '#ffffff',
		BORDER_DARK: '#808080',
		BORDER_DARKEST: '#404040',
		NUMBERS: [
			'#0000ff', // 1 - Blue
			'#008000', // 2 - Green
			'#ff0000', // 3 - Red
			'#000080', // 4 - Dark Blue
			'#800000', // 5 - Maroon
			'#008080', // 6 - Teal
			'#000000', // 7 - Black
			'#808080'  // 8 - Gray
		]
	};
	private readonly SPRITES: Record<string, SpriteData> = {
		covered: { x: 0, y: 0 },
		coveredClickable: { x: 48, y: 0 },
		revealed: { x: 96, y: 0 },
		explosion: { x: 144, y: 0 },
		mine: { x: 192, y: 0 },
		mineExploded: { x: 240, y: 0 },
		flagRed: { x: 288, y: 0 },
		flagGreen: { x: 336, y: 0 },
		spawn: { x: 384, y: 0 },
		flagToken: { x: 384, y: 48 },
		numbers: [
			null,
			{ x: 0, y: 48 },
			{ x: 48, y: 48 },
			{ x: 96, y: 48 },
			{ x: 144, y: 48 },
			{ x: 192, y: 48 },
			{ x: 240, y: 48 },
			{ x: 288, y: 48 },
			{ x: 336, y: 48 }
		]
	};

	constructor(globalState: GlobalGameState) {
		super();
		this.globalState = globalState;
	}

	setCanvas(canvas: HTMLCanvasElement): void {
		this.canvas = canvas;
		this.ctx = canvas.getContext('2d', { alpha: false });
		
		// Initialize spritesheet when canvas is set
		this.initializeSpritesheet();
	}

	getSpritesheet(): HTMLCanvasElement | null {
		return this.spritesheet;
	}

	private initializeSpritesheet(): void {
		if (this.spritesheetInitialized) {
			return;
		}

		// Create single spritesheet canvas
		this.spritesheet = document.createElement('canvas');
		this.spritesheet.width = this.SPRITESHEET_WIDTH;
		this.spritesheet.height = this.SPRITESHEET_HEIGHT;
		this.spritesheetCtx = this.spritesheet.getContext('2d');

		if (!this.spritesheetCtx) {
			console.error('Failed to get spritesheet context');
			return;
		}

		// Render all sprites to the spritesheet
		// Row 1: Basic tiles
		this.renderCoveredTileToCache(0, 0, false);
		this.renderCoveredTileToCache(this.TILE_SIZE, 0, true);
		this.renderRevealedTileToCache(this.TILE_SIZE * 2, 0);
		this.renderExplosionTileToCache(this.TILE_SIZE * 3, 0);
		this.renderMineTileToCache(this.TILE_SIZE * 4, 0, false);
		this.renderMineTileToCache(this.TILE_SIZE * 5, 0, true);
		this.renderFlagToCache(this.TILE_SIZE * 6, 0, false);
		this.renderFlagToCache(this.TILE_SIZE * 7, 0, true);
		this.renderSpawnEffectToCache(this.TILE_SIZE * 8, 0);

		// Row 2: Numbers 1-8 and flag token
		for (let i = 1; i <= 8; i++) {
			this.renderNumberTileToCache(this.TILE_SIZE * (i - 1), this.TILE_SIZE, i);
		}
		this.renderFlagTokenToCache(this.TILE_SIZE * 8, this.TILE_SIZE);

		this.spritesheetInitialized = true;
		console.log('Spritesheet initialized with', this.SPRITESHEET_WIDTH, 'x', this.SPRITESHEET_HEIGHT, 'pixels for optimized tile rendering');
	}

	update(_deltaTime: number): void {
		if (!this.canvas || !this.ctx || !this.spritesheet) {
			return;
		}

		// Only render if something changed (performance optimization)
		if (!this.globalState.needsRedrawCheck()) {
			return;
		}

		this.clearCanvas();
		this.renderGameWorld();
		this.renderFlagTokenAnimations();

		// Clear the redraw flag after successful render
		this.globalState.clearRedrawFlag();
		this.lastFrameRendered = true;
	}

	private clearCanvas(): void {
		if (!this.ctx || !this.canvas) {
			return;
		}

		this.ctx.fillStyle = '#c0c0c0';
		this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
	}

	/**
	 * High-performance rendering method that uses cached global state data
	 * instead of iterating through all entities every frame
	 */
	private renderGameWorld(): void {
		if (!this.canvas || !this.ctx) {
			return;
		}

		const cameraPos = this.globalState.getCameraPosition();
		const centerX = Math.floor(this.canvas.width / 2);
		const centerY = Math.floor(this.canvas.height / 2);

		// Calculate visible area bounds
		const tilesX = Math.min(Math.ceil(this.canvas.width / this.TILE_SIZE / 2) + 2, 100);
		const tilesY = Math.min(Math.ceil(this.canvas.height / this.TILE_SIZE / 2) + 2, 100);

		const cameraTileX = Math.floor(cameraPos.x);
		const cameraTileY = Math.floor(cameraPos.y);
		const cameraOffsetX = (cameraPos.x - cameraTileX) * this.TILE_SIZE;
		const cameraOffsetY = (cameraPos.y - cameraTileY) * this.TILE_SIZE;

		// Render background grid for empty areas
		this.renderBackgroundGrid(centerX, centerY, tilesX, tilesY, cameraTileX, cameraTileY, cameraOffsetX, cameraOffsetY);

		// Render tiles (layer 1)
		this.renderTiles(centerX, centerY, cameraPos);

		// Render players (layer 2)
		this.renderPlayers(centerX, centerY, cameraPos);

		// Render flags on top of everything
		this.renderFlags(centerX, centerY, cameraPos);
	}

	private renderBackgroundGrid(centerX: number, centerY: number, tilesX: number, tilesY: number,
		cameraTileX: number, cameraTileY: number, cameraOffsetX: number, cameraOffsetY: number): void {

		if (!this.ctx || !this.canvas) {
			return;
		}

		// Render grid background for empty areas using global state lookups
		for (let x = -tilesX; x <= tilesX; x++) {
			for (let y = -tilesY; y <= tilesY; y++) {
				const screenX = centerX + x * this.TILE_SIZE - Math.floor(cameraOffsetX);
				const screenY = centerY + y * this.TILE_SIZE - Math.floor(cameraOffsetY);

				if (screenX >= -this.TILE_SIZE && screenX < this.canvas.width &&
					screenY >= -this.TILE_SIZE && screenY < this.canvas.height) {

					const tileX = cameraTileX + x;
					const tileY = cameraTileY + y;

					// Fast O(1) lookup - no iteration needed
					if (!this.globalState.hasTile(tileX, tileY)) {
						// Render unknown/out-of-bounds tile
						this.ctx.drawImage(
							this.spritesheet!,
							this.SPRITES.covered.x, this.SPRITES.covered.y,
							this.TILE_SIZE, this.TILE_SIZE,
							screenX, screenY, this.TILE_SIZE, this.TILE_SIZE
						);
					}
				}
			}
		}
	}

	private renderTiles(centerX: number, centerY: number, cameraPos: { x: number, y: number }): void {
		if (!this.ctx || !this.canvas) {
			return;
		}

		// Use cached tile data from global state for performance
		const allTileData = this.globalState.getAllTileData();

		for (const [, tileData] of allTileData) {
			const screenX = centerX + (tileData.x - cameraPos.x) * this.TILE_SIZE;
			const screenY = centerY + (tileData.y - cameraPos.y) * this.TILE_SIZE;

			// Only render tiles that are visible on screen
			if (screenX >= -this.TILE_SIZE && screenX < this.canvas.width &&
				screenY >= -this.TILE_SIZE && screenY < this.canvas.height) {
				this.renderTileData(tileData, screenX, screenY);
			}
		}
	}

	private renderPlayers(centerX: number, centerY: number, cameraPos: { x: number, y: number }): void {
		if (!this.ctx || !this.canvas) {
			return;
		}

		// Use cached player data from global state for performance
		const allPlayerData = this.globalState.getAllPlayerData();

		for (const [, playerData] of allPlayerData) {
			// Skip disconnected players
			if (!playerData.connected) {
				continue;
			}

			const screenX = centerX + (playerData.x - cameraPos.x) * this.TILE_SIZE;
			const screenY = centerY + (playerData.y - cameraPos.y) * this.TILE_SIZE;

			// Only render players that are visible on screen
			if (screenX >= -this.TILE_SIZE && screenX < this.canvas.width &&
				screenY >= -this.TILE_SIZE && screenY < this.canvas.height) {
				this.renderPlayerData(playerData, screenX, screenY);
			}
		}
	}

	private renderFlags(centerX: number, centerY: number, cameraPos: { x: number, y: number }): void {
		if (!this.ctx || !this.canvas) {
			return;
		}

		// Render flags on top of everything using cached tile data
		const allTileData = this.globalState.getAllTileData();

		for (const [, tileData] of allTileData) {
			if (!tileData.flagged) {
				continue;
			}

			const screenX = centerX + (tileData.x - cameraPos.x) * this.TILE_SIZE;
			const screenY = centerY + (tileData.y - cameraPos.y) * this.TILE_SIZE;

			// Only render flags that are visible on screen
			if (screenX >= -this.TILE_SIZE && screenX < this.canvas.width &&
				screenY >= -this.TILE_SIZE && screenY < this.canvas.height) {

				const flagSprite = tileData.type === 'mine' ? this.SPRITES.flagGreen : this.SPRITES.flagRed;
				this.ctx.drawImage(
					this.spritesheet!,
					flagSprite.x, flagSprite.y, this.TILE_SIZE, this.TILE_SIZE,
					screenX, screenY, this.TILE_SIZE, this.TILE_SIZE
				);
			}
		}
	}

	private renderTileData(tileData: TileComponent & PositionComponent, x: number, y: number): void {
		if (!this.ctx || !this.spritesheet) {
			return;
		}

		let sprite: SpriteData;

		// Check if this is a spawn tile for special rendering
		const isSpawnTile = this.globalState.isSpawnPoint(tileData.x, tileData.y);

		if (tileData.revealed) {
			if (tileData.type === 'explosion') {
				sprite = this.SPRITES.explosion;
			} else if (tileData.type === 'mine') {
				sprite = tileData.exploded ? this.SPRITES.mineExploded : this.SPRITES.mine;
			} else if (tileData.type === 'numbered' && tileData.number && tileData.number > 0) {
				sprite = this.SPRITES.numbers[tileData.number] as SpriteData;
			} else if (tileData.type === 'flag_token') {
				sprite = this.SPRITES.flagToken;
			} else {
				sprite = this.SPRITES.revealed;
			}
		} else {
			// Check if tile is clickable (adjacent to current player)
			const currentPlayer = this.globalState.getCurrentPlayerEntity();
			const currentPlayerPos = currentPlayer?.getComponent<PositionComponent>('position');
			
			// Debug log for the first tile only
			if (tileData.x === 0 && tileData.y === 0) {
				console.log('Debug - Current player:', currentPlayer ? 'found' : 'not found');
				console.log('Debug - Current player pos:', currentPlayerPos);
				console.log('Debug - Current player ID:', this.globalState.currentPlayerId);
			}
			
			const isClickable = currentPlayerPos &&
				Math.abs(tileData.x - currentPlayerPos.x) <= 1 &&
				Math.abs(tileData.y - currentPlayerPos.y) <= 1 &&
				!(tileData.x === currentPlayerPos.x && tileData.y === currentPlayerPos.y);

			sprite = isClickable ? this.SPRITES.coveredClickable : this.SPRITES.covered;
		}

		// Render main tile sprite
		this.ctx.drawImage(
			this.spritesheet,
			sprite.x, sprite.y, this.TILE_SIZE, this.TILE_SIZE,
			x, y, this.TILE_SIZE, this.TILE_SIZE
		);

		// Render spawn effect overlay if this is a spawn point
		if (isSpawnTile && tileData.revealed) {
			this.ctx.drawImage(
				this.spritesheet,
				this.SPRITES.spawn.x, this.SPRITES.spawn.y, this.TILE_SIZE, this.TILE_SIZE,
				x, y, this.TILE_SIZE, this.TILE_SIZE
			);
		}
	}

	private renderPlayerData(playerData: PlayerComponent & PositionComponent, x: number, y: number): void {
		if (!this.ctx) {
			return;
		}

		const centerX = x + this.TILE_SIZE / 2;
		const centerY = y + this.TILE_SIZE / 2;
		const radius = this.TILE_SIZE * 0.35;

		const isCurrentPlayer = playerData.id === this.globalState.currentPlayerId;

		if (!playerData.alive) {
			// Render skull emoji for dead players
			this.ctx.font = `${this.TILE_SIZE * 0.6}px Arial`;
			this.ctx.textAlign = 'center';
			this.ctx.textBaseline = 'middle';
			this.ctx.fillText('💀', centerX, centerY);
		} else {
			// Player circle
			this.ctx.fillStyle = playerData.color;
			this.ctx.beginPath();
			this.ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
			this.ctx.fill();

			// Player border (different for current player)
			this.ctx.strokeStyle = isCurrentPlayer ? '#ff8800' : '#004488';
			this.ctx.lineWidth = 2;
			this.ctx.stroke();

			// Current player indicator
			if (isCurrentPlayer) {
				this.ctx.fillStyle = '#ffffff';
				this.ctx.beginPath();
				this.ctx.arc(centerX, centerY, radius * 0.3, 0, 2 * Math.PI);
				this.ctx.fill();
			}
		}

		// Player name with background
		this.ctx.font = '12px Arial';
		this.ctx.textAlign = 'center';
		this.ctx.textBaseline = 'middle';

		const nameY = y - 12;
		const textWidth = this.ctx.measureText(playerData.username).width;

		// Name background (red for dead players)
		this.ctx.fillStyle = playerData.alive ? 'rgba(0, 0, 0, 0.7)' : 'rgba(120, 0, 0, 0.7)';
		this.ctx.fillRect(centerX - textWidth / 2 - 2, nameY - 6, textWidth + 4, 12);

		// Name text (gray for dead players)
		this.ctx.fillStyle = playerData.alive ? '#ffffff' : '#cccccc';
		this.ctx.fillText(playerData.username, centerX, nameY);
	}

	private renderFlagTokenAnimations(): void {
		if (!this.ctx || !this.canvas) {
			return;
		}

		const cameraPos = this.globalState.getCameraPosition();
		const flagTokenAnimations = this.globalState.flagTokenAnimations;
		const currentTime = Date.now();
		const ANIMATION_DURATION = 1000;
		const FLOAT_HEIGHT = 50;

		for (const animation of flagTokenAnimations) {
			const elapsed = currentTime - animation.startTime;
			if (elapsed >= ANIMATION_DURATION) {
				continue;
			}

			// Calculate animation progress (0 to 1)
			const progress = elapsed / ANIMATION_DURATION;
			const easeOut = 1 - Math.pow(1 - progress, 3);

			// Convert world coordinates to screen coordinates
			const centerX = Math.floor(this.canvas.width / 2);
			const centerY = Math.floor(this.canvas.height / 2);
			const screenX = centerX + (animation.worldX - cameraPos.x) * this.TILE_SIZE + this.TILE_SIZE / 2;
			const screenY = centerY + (animation.worldY - cameraPos.y) * this.TILE_SIZE + this.TILE_SIZE / 2;

			// Calculate position (float up)
			const animY = screenY - (FLOAT_HEIGHT * easeOut);
			const alpha = 1 - progress;

			// Only render if on screen
			if (screenX >= -50 && screenX < this.canvas.width + 50 &&
				animY >= -50 && animY < this.canvas.height + 50) {

				this.ctx.save();
				this.ctx.globalAlpha = alpha;

				// Render floating token icon in first half
				if (progress < 0.5) {
					const tokenSize = 20 * (1 - progress * 2);
					const tokenAlpha = 1 - progress * 2;

					this.ctx.globalAlpha = tokenAlpha;
					this.ctx.fillStyle = '#ffd700';
					this.ctx.strokeStyle = '#b8860b';
					this.ctx.lineWidth = 2;

					this.ctx.beginPath();
					this.ctx.arc(screenX, animY + 15, tokenSize / 2, 0, 2 * Math.PI);
					this.ctx.fill();
					this.ctx.stroke();

					// Small flag icon in the token
					if (tokenSize > 8) {
						const flagSize = tokenSize * 0.4;
						const flagX = screenX - flagSize / 4;
						const flagY = animY + 15;

						this.ctx.strokeStyle = '#654321';
						this.ctx.lineWidth = 1;
						this.ctx.beginPath();
						this.ctx.moveTo(flagX, flagY - flagSize / 2);
						this.ctx.lineTo(flagX, flagY + flagSize / 2);
						this.ctx.stroke();

						this.ctx.fillStyle = '#ff0000';
						this.ctx.beginPath();
						this.ctx.moveTo(flagX, flagY - flagSize / 2);
						this.ctx.lineTo(flagX + flagSize / 2, flagY - flagSize / 4);
						this.ctx.lineTo(flagX, flagY);
						this.ctx.closePath();
						this.ctx.fill();
					}
				}

				// Render floating text in second half
				if (progress > 0.3) {
					const textAlpha = Math.min(1, (progress - 0.3) / 0.2) * alpha;
					this.ctx.globalAlpha = textAlpha;
					this.ctx.fillStyle = '#ffd700';
					this.ctx.strokeStyle = '#000000';
					this.ctx.lineWidth = 2;
					this.ctx.font = 'bold 16px Arial';
					this.ctx.textAlign = 'center';
					this.ctx.textBaseline = 'middle';

					this.ctx.strokeText(animation.text, screenX, animY - 10);
					this.ctx.fillText(animation.text, screenX, animY - 10);
				}

				this.ctx.restore();
			}
		}
	}

	// Sprite cache rendering methods
	private renderCoveredTileToCache(x: number, y: number, isClickable = false): void {
		if (!this.spritesheetCtx) return;

		// Main tile color - lighter if clickable
		if (isClickable) {
			this.spritesheetCtx.fillStyle = '#d4d4d4'; // Slightly lighter than COLORS.COVERED
		} else {
			this.spritesheetCtx.fillStyle = this.COLORS.COVERED;
		}
		this.spritesheetCtx.fillRect(x, y, this.TILE_SIZE, this.TILE_SIZE);

		// Classic minesweeper 3D effect
		// Top and left highlights
		this.spritesheetCtx.strokeStyle = this.COLORS.BORDER_LIGHT;
		this.spritesheetCtx.lineWidth = 2;
		this.spritesheetCtx.beginPath();
		this.spritesheetCtx.moveTo(x, y + this.TILE_SIZE);
		this.spritesheetCtx.lineTo(x, y);
		this.spritesheetCtx.lineTo(x + this.TILE_SIZE, y);
		this.spritesheetCtx.stroke();

		// Bottom and right shadows
		this.spritesheetCtx.strokeStyle = this.COLORS.BORDER_DARK;
		this.spritesheetCtx.lineWidth = 2;
		this.spritesheetCtx.beginPath();
		this.spritesheetCtx.moveTo(x + this.TILE_SIZE, y);
		this.spritesheetCtx.lineTo(x + this.TILE_SIZE, y + this.TILE_SIZE);
		this.spritesheetCtx.lineTo(x, y + this.TILE_SIZE);
		this.spritesheetCtx.stroke();

		// Darker inner shadow
		this.spritesheetCtx.strokeStyle = this.COLORS.BORDER_DARKEST;
		this.spritesheetCtx.lineWidth = 1;
		this.spritesheetCtx.beginPath();
		this.spritesheetCtx.moveTo(x + this.TILE_SIZE - 1, y + 1);
		this.spritesheetCtx.lineTo(x + this.TILE_SIZE - 1, y + this.TILE_SIZE - 1);
		this.spritesheetCtx.lineTo(x + 1, y + this.TILE_SIZE - 1);
		this.spritesheetCtx.stroke();
	}

	private renderRevealedTileToCache(x: number, y: number): void {
		if (!this.spritesheetCtx) return;

		this.spritesheetCtx.fillStyle = this.COLORS.REVEALED;
		this.spritesheetCtx.fillRect(x, y, this.TILE_SIZE, this.TILE_SIZE);

		// Simple border for revealed tiles
		this.spritesheetCtx.strokeStyle = this.COLORS.BORDER_DARK;
		this.spritesheetCtx.lineWidth = 1;
		this.spritesheetCtx.strokeRect(x, y, this.TILE_SIZE, this.TILE_SIZE);
	}

	private renderExplosionTileToCache(x: number, y: number): void {
		if (!this.spritesheetCtx) return;

		this.spritesheetCtx.fillStyle = this.COLORS.EXPLOSION;
		this.spritesheetCtx.fillRect(x, y, this.TILE_SIZE, this.TILE_SIZE);

		// Simple border for explosion tiles
		this.spritesheetCtx.strokeStyle = this.COLORS.BORDER_DARK;
		this.spritesheetCtx.lineWidth = 1;
		this.spritesheetCtx.strokeRect(x, y, this.TILE_SIZE, this.TILE_SIZE);
	}

	private renderNumberTileToCache(x: number, y: number, number: number): void {
		if (!this.spritesheetCtx) return;

		// Start with revealed tile base
		this.renderRevealedTileToCache(x, y);

		// Add number
		this.spritesheetCtx.fillStyle = this.COLORS.NUMBERS[number - 1] || '#000000';
		this.spritesheetCtx.font = 'bold 24px Arial';
		this.spritesheetCtx.textAlign = 'center';
		this.spritesheetCtx.textBaseline = 'middle';
		this.spritesheetCtx.fillText(number.toString(), x + Math.floor(this.TILE_SIZE / 2), y + Math.floor(this.TILE_SIZE / 2));
	}

	private renderMineTileToCache(x: number, y: number, exploded = false): void {
		if (!this.spritesheetCtx) return;

		// Start with revealed tile base
		if (exploded) {
			this.renderExplosionTileToCache(x, y);
		} else {
			this.renderRevealedTileToCache(x, y);
		}

		const centerX = x + Math.floor(this.TILE_SIZE / 2);
		const centerY = y + Math.floor(this.TILE_SIZE / 2);
		const mineRadius = Math.floor(this.TILE_SIZE / 4);

		// Mine body (black circle)
		this.spritesheetCtx.fillStyle = '#000000';
		this.spritesheetCtx.beginPath();
		this.spritesheetCtx.arc(centerX, centerY, mineRadius, 0, 2 * Math.PI);
		this.spritesheetCtx.fill();

		// Mine spikes (8 lines radiating out)
		this.spritesheetCtx.strokeStyle = '#000000';
		this.spritesheetCtx.lineWidth = 2;
		const spikeLength = mineRadius + 4;

		for (let i = 0; i < 8; i++) {
			const angle = (i * Math.PI) / 4;
			const startX = centerX + Math.cos(angle) * (mineRadius - 2);
			const startY = centerY + Math.sin(angle) * (mineRadius - 2);
			const endX = centerX + Math.cos(angle) * spikeLength;
			const endY = centerY + Math.sin(angle) * spikeLength;

			this.spritesheetCtx.beginPath();
			this.spritesheetCtx.moveTo(startX, startY);
			this.spritesheetCtx.lineTo(endX, endY);
			this.spritesheetCtx.stroke();
		}

		// Highlight for 3D effect
		this.spritesheetCtx.fillStyle = '#ffffff';
		this.spritesheetCtx.beginPath();
		this.spritesheetCtx.arc(centerX - 3, centerY - 3, 2, 0, 2 * Math.PI);
		this.spritesheetCtx.fill();
	}

	private renderFlagToCache(x: number, y: number, isCorrect = false): void {
		if (!this.spritesheetCtx) return;

		const centerX = x + Math.floor(this.TILE_SIZE / 2);
		const centerY = y + Math.floor(this.TILE_SIZE / 2);
		const poleHeight = Math.floor(this.TILE_SIZE * 0.7);
		const flagWidth = Math.floor(this.TILE_SIZE * 0.4);
		const flagHeight = Math.floor(this.TILE_SIZE * 0.25);

		// Flag pole
		this.spritesheetCtx.strokeStyle = '#654321';
		this.spritesheetCtx.lineWidth = 3;
		this.spritesheetCtx.beginPath();
		this.spritesheetCtx.moveTo(centerX - 8, centerY + 12);
		this.spritesheetCtx.lineTo(centerX - 8, centerY - poleHeight / 2 + 12);
		this.spritesheetCtx.stroke();

		// Flag (green if correct, red if not)
		this.spritesheetCtx.fillStyle = isCorrect ? '#00cc00' : '#ff0000';
		this.spritesheetCtx.beginPath();
		this.spritesheetCtx.moveTo(centerX - 8, centerY - poleHeight / 2 + 12);
		this.spritesheetCtx.lineTo(centerX - 8 + flagWidth, centerY - poleHeight / 2 + flagHeight / 2 + 12);
		this.spritesheetCtx.lineTo(centerX - 8, centerY - poleHeight / 2 + flagHeight + 12);
		this.spritesheetCtx.closePath();
		this.spritesheetCtx.fill();

		// Flag border
		this.spritesheetCtx.strokeStyle = '#000000';
		this.spritesheetCtx.lineWidth = 1;
		this.spritesheetCtx.stroke();
	}

	private renderSpawnEffectToCache(x: number, y: number): void {
		if (!this.spritesheetCtx) return;

		const centerX = x + Math.floor(this.TILE_SIZE / 2);
		const centerY = y + Math.floor(this.TILE_SIZE / 2);
		const radius = Math.floor(this.TILE_SIZE / 3);

		// Semi-transparent green circle
		this.spritesheetCtx.fillStyle = 'rgba(0, 200, 0, 0.5)';
		this.spritesheetCtx.beginPath();
		this.spritesheetCtx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
		this.spritesheetCtx.fill();

		// Green border
		this.spritesheetCtx.strokeStyle = '#00cc00';
		this.spritesheetCtx.lineWidth = 2;
		this.spritesheetCtx.stroke();
	}

	private renderFlagTokenToCache(x: number, y: number): void {
		if (!this.spritesheetCtx) return;

		const centerX = x + Math.floor(this.TILE_SIZE / 2);
		const centerY = y + Math.floor(this.TILE_SIZE / 2);
		const radius = Math.floor(this.TILE_SIZE / 3);

		// Gold circle
		this.spritesheetCtx.fillStyle = '#ffd700';
		this.spritesheetCtx.beginPath();
		this.spritesheetCtx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
		this.spritesheetCtx.fill();

		// Dark gold border
		this.spritesheetCtx.strokeStyle = '#b8860b';
		this.spritesheetCtx.lineWidth = 2;
		this.spritesheetCtx.stroke();

		// Small flag icon in the center
		const flagSize = radius * 0.6;
		const flagX = centerX - flagSize / 4;
		const flagY = centerY;

		// Flag pole
		this.spritesheetCtx.strokeStyle = '#654321';
		this.spritesheetCtx.lineWidth = 1;
		this.spritesheetCtx.beginPath();
		this.spritesheetCtx.moveTo(flagX, flagY - flagSize / 2);
		this.spritesheetCtx.lineTo(flagX, flagY + flagSize / 2);
		this.spritesheetCtx.stroke();

		// Flag
		this.spritesheetCtx.fillStyle = '#ff0000';
		this.spritesheetCtx.beginPath();
		this.spritesheetCtx.moveTo(flagX, flagY - flagSize / 2);
		this.spritesheetCtx.lineTo(flagX + flagSize / 2, flagY - flagSize / 4);
		this.spritesheetCtx.lineTo(flagX, flagY);
		this.spritesheetCtx.closePath();
		this.spritesheetCtx.fill();
	}
}
