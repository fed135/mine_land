import { System } from '../ecs/System';
import { Entity } from '../ecs/Entity';
import { GlobalGameState } from '../state/GlobalGameState';
import type { PositionComponent } from '../components/PositionComponent';
import type { PlayerComponent } from '../components/PlayerComponent';

export type InputAction = 'move' | 'flip' | 'flag' | 'unflag';

export interface InputEvent {
    action: InputAction;
    x?: number;
    y?: number;
}

export class InputSystem extends System {
	private globalState: GlobalGameState;
	private pressedKeys = new Set<string>();
	private canvas: HTMLCanvasElement | null = null;
	private canvasRect: DOMRect | null = null;
	private lastMouseX = 0;
	private lastMouseY = 0;
	private onInputCallback: ((event: InputEvent) => void) | null = null;
	private lastMovementTime = 0;
	private pendingMovement = false;

	private readonly TILE_SIZE = 48;
	private readonly MOVEMENT_COOLDOWN = 150; // 150ms cooldown between movements

	constructor(globalState: GlobalGameState) {
		super();
		this.globalState = globalState;
	}

	setCanvas(canvas: HTMLCanvasElement): void {
		this.canvas = canvas;
		this.updateCanvasRect();
		this.setupEventListeners();
	}

	setInputCallback(callback: (event: InputEvent) => void): void {
		this.onInputCallback = callback;
	}

	update(_deltaTime: number): void {
		// Input system processes events immediately, no continuous updates needed
	}

	private setupEventListeners(): void {
		if (!this.canvas) {
			return;
		}

		window.addEventListener('keydown', this.handleKeyDown.bind(this));
		window.addEventListener('keyup', this.handleKeyUp.bind(this));
		window.addEventListener('resize', this.updateCanvasRect.bind(this));

		this.canvas.addEventListener('click', this.handleClick.bind(this));
		this.canvas.addEventListener('contextmenu', this.handleRightClick.bind(this));
		this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
	}

	private updateCanvasRect(): void {
		if (this.canvas) {
			this.canvasRect = this.canvas.getBoundingClientRect();
		}
	}

	private handleKeyDown(event: KeyboardEvent): void {
		// Only process movement keys
		if (!['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'].includes(event.code)) {
			return;
		}

		// Prevent movement if already pending or within cooldown
		const currentTime = Date.now();
		if (this.pendingMovement || currentTime - this.lastMovementTime < this.MOVEMENT_COOLDOWN) {
			return;
		}

		if (this.pressedKeys.has(event.code)) {
			return;
		}

		this.pressedKeys.add(event.code);

		// Process movement immediately when key is pressed
		this.processMovement();
	}

	private processMovement(): void {
		const currentPlayer = this.getCurrentPlayer();
		const playerComponent = currentPlayer?.getComponent<PlayerComponent>('player');
		if (!currentPlayer || !playerComponent?.alive) {
			return;
		}

		const position = currentPlayer.getComponent<PositionComponent>('position');
		if (!position) {
			return;
		}
		
		let newX = position.x;
		let newY = position.y;

		// Process single-direction movement only (Game Rules: up, down, left, right only)
		// Priority order: vertical first, then horizontal
		if (this.pressedKeys.has('KeyW') || this.pressedKeys.has('ArrowUp')) {
			newY -= 1;
		} else if (this.pressedKeys.has('KeyS') || this.pressedKeys.has('ArrowDown')) {
			newY += 1;
		} else if (this.pressedKeys.has('KeyA') || this.pressedKeys.has('ArrowLeft')) {
			newX -= 1;
		} else if (this.pressedKeys.has('KeyD') || this.pressedKeys.has('ArrowRight')) {
			newX += 1;
		}

		if (newX !== position.x || newY !== position.y) {
			// Client-side movement validation
			if (this.isValidMovement(position.x, position.y, newX, newY)) {
				this.lastMovementTime = Date.now();
				this.pendingMovement = true;
				this.emitInput({ action: 'move', x: newX, y: newY });
				
				// Clear pending movement after a timeout as fallback
				setTimeout(() => {
					this.pendingMovement = false;
				}, 500);
			}
		}
	}

	private handleKeyUp(event: KeyboardEvent): void {
		this.pressedKeys.delete(event.code);
	}

	private handleClick(event: MouseEvent): void {
		const currentPlayer = this.getCurrentPlayer();
		const playerComponent = currentPlayer?.getComponent<PlayerComponent>('player');
		if (!currentPlayer || !playerComponent?.alive) {
			return; // Dead players can't interact with tiles
		}

		const tilePos = this.getClickedTile(event);
		if (tilePos.x !== null && tilePos.y !== null) {
			// Client-side tile interaction validation
			if (this.isValidTileInteraction(playerComponent, tilePos.x, tilePos.y)) {
				this.emitInput({ action: 'flip', x: tilePos.x, y: tilePos.y });
			}
		}
	}

	private handleRightClick(event: MouseEvent): void {
		event.preventDefault();
		const currentPlayer = this.getCurrentPlayer();
		const playerComponent = currentPlayer?.getComponent<PlayerComponent>('player');
		if (!currentPlayer || !playerComponent?.alive) {
			return; // Dead players can't interact with tiles
		}

		const tilePos = this.getClickedTile(event);
		if (tilePos.x !== null && tilePos.y !== null) {
			// Client-side flag validation
			if (this.isValidFlagAction(playerComponent, tilePos.x, tilePos.y)) {
				this.emitInput({ action: 'flag', x: tilePos.x, y: tilePos.y });
			}
		}
	}

	private handleMouseMove(event: MouseEvent): void {
		if (this.canvasRect) {
			this.lastMouseX = event.clientX - this.canvasRect.left;
			this.lastMouseY = event.clientY - this.canvasRect.top;
		}
	}

	private getClickedTile(event: MouseEvent): { x: number | null, y: number | null } {
		const currentPlayer = this.getCurrentPlayer();
		if (!currentPlayer || !this.canvasRect || !this.canvas) {
			return { x: null, y: null };
		}

		const clickX = event.clientX - this.canvasRect.left;
		const clickY = event.clientY - this.canvasRect.top;

		const centerX = Math.floor(this.canvas.width / 2);
		const centerY = Math.floor(this.canvas.height / 2);

		const position = currentPlayer.getComponent<PositionComponent>('position');
		if (!position) {
			return { x: null, y: null };
		}
		const tileX = Math.floor((clickX - centerX) / this.TILE_SIZE + position.x);
		const tileY = Math.floor((clickY - centerY) / this.TILE_SIZE + position.y);

		return { x: tileX, y: tileY };
	}

	private getCurrentPlayer(): Entity | null {
		return this.globalState.getCurrentPlayerEntity();
	}

	setCurrentPlayer(_playerId: string): void {
		// This method can be called to set which player is the current player
		// for input handling purposes
	}

	// Clear pending movement when position updates are received
	clearPendingMovement(): void {
		this.pendingMovement = false;
	}

	private emitInput(event: InputEvent): void {
		// Ensure rendering continues when user provides input
		this.globalState.markForRedraw();
		
		if (this.onInputCallback) {
			this.onInputCallback(event);
		}
	}

	// Client-side validation methods to prevent unnecessary network traffic
	private isValidMovement(fromX: number, fromY: number, toX: number, toY: number): boolean {
		// Check if movement is orthogonal (Game Rules: up, down, left, right only)
		const deltaX = Math.abs(toX - fromX);
		const deltaY = Math.abs(toY - fromY);
		
		// Only allow single step in cardinal directions (no diagonals)
		if ((deltaX === 1 && deltaY === 0) || (deltaX === 0 && deltaY === 1)) {
			// Valid orthogonal movement
		} else {
			return false; // Invalid movement direction or distance
		}
		
		// Critical: Check if target tile is walkable (Game Rules: covered tiles are not walkable)
		const tileData = this.globalState.getTileData(toX, toY);
		if (tileData) {
			// Tile exists - check walkability rules
			if (!tileData.revealed && !tileData.flagged) {
				return false; // Covered tiles (not revealed, not flagged) are not walkable
			}
			
			// Revealed mines are not walkable
			if (tileData.revealed && tileData.type === 'mine') {
				return false;
			}
		}
		// If no tile data, assume empty space which is walkable
		
		return true;
	}

	private isValidTileInteraction(playerComponent: any, tileX: number, tileY: number): boolean {
		// Check if tile is adjacent to player
		const deltaX = Math.abs(tileX - playerComponent.x);
		const deltaY = Math.abs(tileY - playerComponent.y);
		
		if (deltaX > 1 || deltaY > 1) {
			return false; // Can only interact with adjacent tiles
		}
		
		// Check if tile exists and is not already revealed
		const tileData = this.globalState.getTileData(tileX, tileY);
		if (!tileData) {
			return false; // Tile doesn't exist in current view
		}
		
		if (tileData.revealed) {
			return false; // Can't flip already revealed tiles
		}
		
		if (tileData.flagged) {
			return false; // Can't flip flagged tiles
		}
		
		return true;
	}

	private isValidFlagAction(playerComponent: any, tileX: number, tileY: number): boolean {
		// Check if player has flags available
		if (playerComponent.flags <= 0) {
			return false; // No flags remaining
		}
		
		// Check if tile is adjacent to player
		const deltaX = Math.abs(tileX - playerComponent.x);
		const deltaY = Math.abs(tileY - playerComponent.y);
		
		if (deltaX > 1 || deltaY > 1) {
			return false; // Can only flag adjacent tiles
		}
		
		// Check if tile exists and can be flagged
		const tileData = this.globalState.getTileData(tileX, tileY);
		if (!tileData) {
			return false; // Tile doesn't exist in current view
		}
		
		if (tileData.revealed) {
			return false; // Can't flag revealed tiles
		}
		
		if (tileData.flagged) {
			return false; // Already flagged
		}
		
		return true;
	}

	destroy(): void {
		super.destroy();

		window.removeEventListener('keydown', this.handleKeyDown.bind(this));
		window.removeEventListener('keyup', this.handleKeyUp.bind(this));
		window.removeEventListener('resize', this.updateCanvasRect.bind(this));

		if (this.canvas) {
			this.canvas.removeEventListener('click', this.handleClick.bind(this));
			this.canvas.removeEventListener('contextmenu', this.handleRightClick.bind(this));
			this.canvas.removeEventListener('mousemove', this.handleMouseMove.bind(this));
		}
	}
}
