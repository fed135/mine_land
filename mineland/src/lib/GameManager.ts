import { EntityManager } from './ecs/EntityManager';
import { Entity } from './ecs/Entity';
import { StateMachine } from './state/StateMachine';
import { GameStateType, ConnectionState, PlayerState, UIState } from './state/GameState';
import { GlobalGameState } from './state/GlobalGameState';

import { RenderSystem } from './systems/RenderSystem';
import { InputSystem } from './systems/InputSystem';
import type { InputEvent } from './systems/InputSystem';
import { AnimationSystem } from './systems/AnimationSystem';
import { CameraSystem } from './systems/CameraSystem';
import { NetworkSystem } from './systems/NetworkSystem';
import type { NetworkConfig } from './systems/NetworkSystem';
import { UISystem } from './systems/UISystem';
import type { UIElements } from './systems/UISystem';

import { createPositionComponent } from './components/PositionComponent';
import { createPlayerComponent } from './components/PlayerComponent';
import { createTileComponent } from './components/TileComponent';
import type { TileType } from './components/TileComponent';
import { createRenderComponent } from './components/RenderComponent';

export class GameManager {
	private entityManager: EntityManager;
	private globalState: GlobalGameState;

	private renderSystem: RenderSystem;
	private inputSystem: InputSystem;
	private animationSystem: AnimationSystem;
	private cameraSystem: CameraSystem;
	private networkSystem: NetworkSystem;
	private uiSystem: UISystem;

	private gameStateMachine: StateMachine<GameStateType>;
	private connectionStateMachine: StateMachine<ConnectionState>;
	private playerStateMachine: StateMachine<PlayerState>;
	private uiStateMachine: StateMachine<UIState>;

	private onNetworkAction: ((event: InputEvent) => void) | null = null;

	constructor() {
		this.entityManager = new EntityManager();
		this.globalState = new GlobalGameState();
		this.initializeSystems();
		this.initializeStateMachines();
	}

	private initializeSystems(): void {
		this.renderSystem = new RenderSystem(this.globalState);
		this.inputSystem = new InputSystem(this.globalState);
		this.animationSystem = new AnimationSystem(this.globalState);
		this.cameraSystem = new CameraSystem(this.globalState);
		this.networkSystem = new NetworkSystem(this.globalState, this);
		this.uiSystem = new UISystem(this.globalState);

		this.entityManager.addSystem(this.renderSystem);
		this.entityManager.addSystem(this.inputSystem);
		this.entityManager.addSystem(this.animationSystem);
		this.entityManager.addSystem(this.cameraSystem);
		this.entityManager.addSystem(this.uiSystem);

		// Set up network system callback to send actions
		this.inputSystem.setInputCallback((event: InputEvent) => {
			this.networkSystem.sendPlayerAction(event.action, event.x, event.y);
		});
	}

	private initializeStateMachines(): void {
		// Game State Machine
		this.gameStateMachine = new StateMachine<GameStateType>(GameStateType.WELCOME_SCREEN);
		this.setupGameStateTransitions();

		// Connection State Machine
		this.connectionStateMachine = new StateMachine<ConnectionState>(ConnectionState.DISCONNECTED);
		this.setupConnectionStateTransitions();

		// Player State Machine
		this.playerStateMachine = new StateMachine<PlayerState>(PlayerState.SPAWNING);
		this.setupPlayerStateTransitions();

		// UI State Machine
		this.uiStateMachine = new StateMachine<UIState>(UIState.WELCOME);
		this.setupUIStateTransitions();
	}

	private setupGameStateTransitions(): void {
		this.gameStateMachine.addTransition({
			from: GameStateType.WELCOME_SCREEN,
			to: GameStateType.CONNECTING
		});

		this.gameStateMachine.addTransition({
			from: GameStateType.CONNECTING,
			to: GameStateType.PLAYING,
			condition: () => this.connectionStateMachine.getCurrentState() === ConnectionState.CONNECTED
		});

		this.gameStateMachine.addTransition({
			from: GameStateType.PLAYING,
			to: GameStateType.DEAD,
			condition: () => this.playerStateMachine.getCurrentState() === PlayerState.DEAD
		});

		this.gameStateMachine.addTransition({
			from: GameStateType.DEAD,
			to: GameStateType.GAME_OVER
		});
	}

	private setupConnectionStateTransitions(): void {
		this.connectionStateMachine.addTransition({
			from: ConnectionState.DISCONNECTED,
			to: ConnectionState.CONNECTING
		});

		this.connectionStateMachine.addTransition({
			from: ConnectionState.CONNECTING,
			to: ConnectionState.CONNECTED
		});

		this.connectionStateMachine.addTransition({
			from: ConnectionState.CONNECTED,
			to: ConnectionState.RECONNECTING
		});

		this.connectionStateMachine.addTransition({
			from: ConnectionState.RECONNECTING,
			to: ConnectionState.CONNECTED
		});
	}

	private setupPlayerStateTransitions(): void {
		this.playerStateMachine.addTransition({
			from: PlayerState.SPAWNING,
			to: PlayerState.ALIVE
		});

		this.playerStateMachine.addTransition({
			from: PlayerState.ALIVE,
			to: PlayerState.DEAD
		});

		this.playerStateMachine.addTransition({
			from: PlayerState.DEAD,
			to: PlayerState.SPECTATING
		});
	}

	private setupUIStateTransitions(): void {
		this.uiStateMachine.addTransition({
			from: UIState.WELCOME,
			to: UIState.HUD,
			condition: () => this.gameStateMachine.getCurrentState() === GameStateType.PLAYING
		});

		this.uiStateMachine.addTransition({
			from: UIState.HUD,
			to: UIState.DEATH_POPUP,
			condition: () => this.gameStateMachine.getCurrentState() === GameStateType.DEAD
		});

		this.uiStateMachine.addTransition({
			from: UIState.DEATH_POPUP,
			to: UIState.GAME_OVER_SCREEN,
			condition: () => this.gameStateMachine.getCurrentState() === GameStateType.GAME_OVER
		});
	}

	// Public API methods
	setCanvas(canvas: HTMLCanvasElement): void {
		this.renderSystem.setCanvas(canvas);
		this.inputSystem.setCanvas(canvas);
	}

	getSpritesheet(): HTMLCanvasElement | null {
		return this.renderSystem.getSpritesheet();
	}

	// Network system methods
	connectToServer(config: NetworkConfig): void {
		this.networkSystem.connect(config);
	}

	isConnected(): boolean {
		return this.networkSystem.isConnected();
	}

	requestRespawn(): void {
		this.networkSystem.requestRespawn();
	}

	// UI system methods
	setUIElements(elements: UIElements): void {
		this.uiSystem.setElements(elements);
	}

	setCurrentPlayer(player: any): void {
		this.uiSystem.setCurrentPlayer(player);
		this.globalState.setCurrentPlayer(player.id);
	}

	setLeaderboardPlayers(players: any[]): void {
		this.uiSystem.setLeaderboardPlayers(players);
	}

	setUICallbacks(callbacks: {
		onConnectionChange?: (connected: boolean) => void;
		onPlayerUpdate?: (player: any) => void;
	}): void {
		if (callbacks.onConnectionChange) {
			this.networkSystem.setConnectionCallback(callbacks.onConnectionChange);
		}
		if (callbacks.onPlayerUpdate) {
			this.networkSystem.setPlayerUpdateCallback(callbacks.onPlayerUpdate);
		}
	}

	update(deltaTime: number): void {
		// Update state machines
		this.gameStateMachine.update();
		this.connectionStateMachine.update();
		this.playerStateMachine.update();
		this.uiStateMachine.update();

		// Update global state (camera, animations, etc.)
		this.globalState.updateCamera(deltaTime);
		this.globalState.updateFlagTokenAnimations();

		// Update entity systems
		this.entityManager.update(deltaTime);
	}

	// Entity creation methods
	createPlayer(data: {
        id: string;
        username: string;
        x: number;
        y: number;
        color?: string;
        score?: number;
        flags?: number;
        alive?: boolean;
        connected?: boolean;
    }): Entity {
		const entity = this.entityManager.createEntity();

		entity.addComponent('position', createPositionComponent(data.x, data.y));
		entity.addComponent('player', createPlayerComponent(data));
		entity.addComponent('render', createRenderComponent({ layer: 2 }));

		// Register with global state for performance lookups
		this.globalState.registerPlayerEntity(entity, data.id);

		return entity;
	}

	createTile(data: {
        x: number;
        y: number;
        type: TileType;
        revealed?: boolean;
        flagged?: boolean;
        number?: number;
    }): Entity {
		// Check if tile already exists - if so, update it instead
		const existingTile = this.globalState.getTileEntity(data.x, data.y);
		if (existingTile) {
			return this.updateTile(data.x, data.y, data);
		}

		// Create new tile entity
		const entity = this.entityManager.createEntity();

		entity.addComponent('position', createPositionComponent(data.x, data.y));
		entity.addComponent('tile', createTileComponent(data));
		entity.addComponent('render', createRenderComponent({ layer: 1 }));

		// Register with global state for performance lookups
		this.globalState.registerTileEntity(entity, data.x, data.y);
		this.globalState.markForRedraw();

		return entity;
	}

	updateTile(x: number, y: number, updates: {
        type?: TileType;
        revealed?: boolean;
        flagged?: boolean;
        number?: number;
    }): Entity | null {
		const entity = this.globalState.getTileEntity(x, y);
		if (!entity) {
			return null;
		}

		// Update tile component
		const tileComponent = entity.getComponent('tile');
		if (tileComponent && updates) {
			if (updates.type !== undefined) tileComponent.type = updates.type;
			if (updates.revealed !== undefined) tileComponent.revealed = updates.revealed;
			if (updates.flagged !== undefined) tileComponent.flagged = updates.flagged;
			if (updates.number !== undefined) tileComponent.number = updates.number;

			// Update global state cache
			this.globalState.updateTileCache(entity, x, y);
			this.globalState.markForRedraw();
		}

		return entity;
	}

	// State management
	transitionGameState(state: GameStateType): boolean {
		return this.gameStateMachine.transitionTo(state);
	}

	transitionConnectionState(state: ConnectionState): boolean {
		return this.connectionStateMachine.transitionTo(state);
	}

	transitionPlayerState(state: PlayerState): boolean {
		return this.playerStateMachine.transitionTo(state);
	}

	// Getters for current states
	getGameState(): GameStateType {
		return this.gameStateMachine.getCurrentState();
	}

	getConnectionState(): ConnectionState {
		return this.connectionStateMachine.getCurrentState();
	}

	getPlayerState(): PlayerState {
		return this.playerStateMachine.getCurrentState();
	}

	getUIState(): UIState {
		return this.uiStateMachine.getCurrentState();
	}

	getCameraPosition(): { x: number, y: number } {
		return this.globalState.getCameraPosition();
	}

	// Player management
	updatePlayer(playerId: string, updates: Partial<{
        x: number;
        y: number;
        score: number;
        flags: number;
        alive: boolean;
        connected: boolean;
    }>): void {
		const entity = this.globalState.getPlayerEntity(playerId);
		if (!entity) {
			return;
		}

		let needsUpdate = false;

		// Update position
		if (updates.x !== undefined || updates.y !== undefined) {
			const position = entity.getComponent('position');
			if (position) {
				if (updates.x !== undefined) {
					position.x = updates.x;
				}
				if (updates.y !== undefined) {
					position.y = updates.y;
				}
				needsUpdate = true;
			}
		}

		// Update player data
		const player = entity.getComponent('player');
		if (player) {
			if (updates.score !== undefined) {
				player.score = updates.score;
			}
			if (updates.flags !== undefined) {
				player.flags = updates.flags;
			}
			if (updates.alive !== undefined) {
				player.alive = updates.alive;
			}
			if (updates.connected !== undefined) {
				player.connected = updates.connected;
			}
			needsUpdate = true;
		}

		// Update global state cache
		if (needsUpdate) {
			this.globalState.updatePlayerCache(entity, playerId);
			this.globalState.markForRedraw();
			this.globalState.markForUIUpdate();

			// Update camera target if this is the current player
			if (playerId === this.globalState.currentPlayerId && (updates.x !== undefined || updates.y !== undefined)) {
				this.globalState.setTargetCameraPosition(updates.x || 0, updates.y || 0);
				
				// Clear pending movement when current player position is updated
				this.inputSystem.clearPendingMovement();
			}
		}
	}

	removePlayer(playerId: string): void {
		const entity = this.globalState.getPlayerEntity(playerId);
		if (entity) {
			this.entityManager.destroyEntity(entity);
			this.globalState.unregisterPlayerEntity(playerId);
			this.globalState.markForRedraw();
		}
	}

	// Global state access methods
	getGlobalState(): GlobalGameState {
		return this.globalState;
	}

	setSpawnPoints(spawnPoints: Array<{ x: number, y: number }>): void {
		this.globalState.setSpawnPoints(spawnPoints);
		this.globalState.markForRedraw();
	}

	addFlagTokenAnimation(worldX: number, worldY: number, text: string): void {
		this.globalState.addFlagTokenAnimation(worldX, worldY, text);
	}

	updateTileFromEntity(entity: Entity): void {
		const position = entity.getComponent('position');
		if (position) {
			this.globalState.updateTileCache(entity, position.x, position.y);
			this.globalState.markForRedraw();
		}
	}

	// Cleanup
	destroy(): void {
		this.networkSystem.destroy();
		this.entityManager.destroy();
		this.globalState.clear();
	}
}
