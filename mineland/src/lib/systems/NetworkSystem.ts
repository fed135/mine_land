import { System } from '../ecs/System';
import { GlobalGameState } from '../state/GlobalGameState';
import { GameManager } from '../GameManager';
import { connect, routines } from 'kalm';
import ws from '@kalm/ws';

export interface NetworkConfig {
	host: string;
	port: number;
	playerName: string;
	playerColor: string;
	sessionId: string | null;
}

export class NetworkSystem extends System {
	private globalState: GlobalGameState;
	private gameManager: GameManager;
	private client: any = null;
	private connected = false;
	private config: NetworkConfig | null = null;

	// UI callback for updating connection status
	private onConnectionChange: ((connected: boolean) => void) | null = null;
	private onPlayerUpdate: ((player: any) => void) | null = null;

	constructor(globalState: GlobalGameState, gameManager: GameManager) {
		super();
		this.globalState = globalState;
		this.gameManager = gameManager;
	}

	setConnectionCallback(callback: (connected: boolean) => void): void {
		this.onConnectionChange = callback;
	}

	setPlayerUpdateCallback(callback: (player: any) => void): void {
		this.onPlayerUpdate = callback;
	}

	connect(config: NetworkConfig): void {
		this.config = config;
		this.attemptConnection();
	}

	private attemptConnection(): void {
		if (!this.config) return;

		try {
			this.client = connect({
				port: this.config.port,
				host: this.config.host,
				transport: ws(),
				routine: routines.realtime()
			});

			this.setupEventHandlers();
		} catch (error) {
			console.error('Failed to connect to server:', error);
		}
	}

	private setupEventHandlers(): void {
		if (!this.client || !this.config) return;

		this.client.on('connect', () => {
			this.connected = true;
			console.log('Connected to Mine Land server');
			this.globalState.markForUIUpdate();
			this.gameManager.transitionConnectionState(1); // Connected

			if (this.onConnectionChange) {
				this.onConnectionChange(true);
			}

			// Send player preferences to server
			const hue = parseInt(this.config!.playerColor) || 200;
			const hslColor = `hsl(${hue}, 70%, 50%)`;
			this.client.write('player-preferences', {
				name: this.config!.playerName,
				color: hslColor,
				sessionId: this.config!.sessionId,
				sessionToken: localStorage.getItem('mineland_session_token')
			});
		});

		this.client.on('disconnect', () => {
			this.connected = false;
			console.log('Disconnected from server');
			this.globalState.markForUIUpdate();
			this.gameManager.transitionConnectionState(0); // Disconnected

			if (this.onConnectionChange) {
				this.onConnectionChange(false);
			}

			// Attempt reconnection after 2 seconds
			setTimeout(() => this.attemptConnection(), 2000);
		});

		this.client.on('error', (error: any) => {
			console.error('Kalm client error:', error);
		});

		// Game event handlers
		this.setupGameEventHandlers();
	}

	private setupGameEventHandlers(): void {
		// Handle initial game state (welcome message)
		this.client.subscribe('welcome', (data: any) => {
			this.handleWelcome(data);
		});

		// Handle viewport updates (tiles and players)
		this.client.subscribe('viewport-update', (data: any) => {
			this.handleViewportUpdate(data);
		});

		// Handle player updates
		this.client.subscribe('player-update', (data: any) => {
			this.handlePlayerUpdate(data);
		});

		// Handle explosions
		this.client.subscribe('explosion', (data: any) => {
			this.handleExplosion(data);
		});

		// Handle game end
		this.client.subscribe('game-end', (data: any) => {
			this.handleGameEnd(data);
		});

		// Handle player death (server-controlled)
		this.client.subscribe('player-death', (data: any) => {
			this.handlePlayerDeath(data);
		});

		// Handle session assignment
		this.client.subscribe('session-assigned', (data: any) => {
			this.handleSessionAssigned(data);
		});

		// Handle leaderboard updates
		this.client.subscribe('leaderboard-update', (data: any) => {
			this.handleLeaderboardUpdate(data);
		});

		// Handle individual tile updates (performance optimization)
		this.client.subscribe('tile-update', (data: any) => {
			this.handleTileUpdate(data);
		});
	}

	private handleWelcome(data: any): void {
		// Set current player from welcome message
		if (data.player) {
			this.gameManager.createPlayer(data.player);
			
			// Set current player in global state using actual player ID
			this.globalState.setCurrentPlayer(data.player.id);
			
			// Initialize camera position (no easing on first load)
			this.globalState.setCameraPosition(data.player.x, data.player.y);
			this.globalState.setTargetCameraPosition(data.player.x, data.player.y);
			
			// Check if player is dead on welcome/reconnect and show death popup
			if (!data.player.alive) {
				this.gameManager.transitionPlayerState(2); // DEAD
				this.gameManager.transitionGameState(3); // DEAD
			}
			
			// Notify UI callback with actual player data
			if (this.onPlayerUpdate) {
				this.onPlayerUpdate(data.player);
			}
		}

		// Update game info
		if (data.gameState) {
			this.globalState.gameInfo = {
				startTime: data.gameState.startTime,
				ended: data.gameState.ended,
				minesRemaining: data.gameState.minesRemaining
			};
		}

		// Update spawn points (removed for security - spawn effects shown via tile data)
		// Spawn points are no longer sent from server to prevent cheating

		// Handle initial viewport
		if (data.viewport) {
			this.handleViewportData(data.viewport);
		}

		this.globalState.markForRedraw();
		this.globalState.markForUIUpdate();
	}

	private handleViewportUpdate(data: any): void {
		
		// Update game state if provided (includes mines remaining)
		if (data.gameState) {
			if (data.gameState.minesRemaining !== undefined) {
				this.globalState.gameInfo.minesRemaining = data.gameState.minesRemaining;
			}
			if (data.gameState.ended !== undefined) {
				this.globalState.gameInfo.ended = data.gameState.ended;
			}
		}

		this.handleViewportData(data);
		this.globalState.markForRedraw();
		this.globalState.markForUIUpdate();
	}

	private handleViewportData(viewport: any): void {
		// Update tiles
		if (viewport.tiles) {
			for (const tile of viewport.tiles) {
				this.gameManager.createTile(tile);
			}
		}

		// Update other players
		if (viewport.players) {
			for (const player of viewport.players) {
				// Skip current player (already handled in welcome)
				if (player.id === this.globalState.currentPlayerId) {
					continue;
				}

				const existingPlayer = this.globalState.getPlayerEntity(player.id);
				if (existingPlayer) {
					this.gameManager.updatePlayer(player.id, player);
				} else {
					this.gameManager.createPlayer(player);
				}
			}
		}
	}

	private handlePlayerUpdate(data: any): void {
		const updatedPlayer = data.player;

		// Update game state if provided (includes mines remaining)
		if (data.gameState) {
			if (data.gameState.minesRemaining !== undefined) {
				this.globalState.gameInfo.minesRemaining = data.gameState.minesRemaining;
			}
			if (data.gameState.ended !== undefined) {
				this.globalState.gameInfo.ended = data.gameState.ended;
			}
		}

		// Check if this is the current player  
		const currentPlayerId = this.globalState.currentPlayerId;
		
		if (currentPlayerId && updatedPlayer.id === currentPlayerId) {
			// Update current player using actual ID
			this.gameManager.updatePlayer(updatedPlayer.id, updatedPlayer);
			
			// Always notify UI callback for current player updates
			if (this.onPlayerUpdate) {
				this.onPlayerUpdate(updatedPlayer);
			}
			
			// Update camera position
			this.globalState.setTargetCameraPosition(updatedPlayer.x, updatedPlayer.y);
		} else {
			// Update other player
			this.gameManager.updatePlayer(updatedPlayer.id, updatedPlayer);
		}

		this.globalState.markForUIUpdate();
	}

	private handleSessionAssigned(data: any): void {
		if (data.sessionId && this.config) {
			this.config.sessionId = data.sessionId;
			// Save to localStorage if available
			try {
				localStorage.setItem('mineland_session_id', data.sessionId);
				if (data.sessionToken) {
					localStorage.setItem('mineland_session_token', data.sessionToken);
				}
			} catch (e) {
				console.warn('Failed to save session credentials:', e);
			}
		}
	}

	private handleLeaderboardUpdate(data: any): void {
		// Pass leaderboard data to GameManager to update UI
		if (data.players) {
			this.gameManager.setLeaderboardPlayers(data.players);
		} else {
			console.warn('Leaderboard update missing players data');
		}
	}

	private handleTileUpdate(data: any): void {
		// Handle lightweight tile updates from other players' actions
		if (data.x !== undefined && data.y !== undefined) {
			// Request fresh viewport data that includes the updated tile
			const currentPlayerId = this.globalState.currentPlayerId;
			if (currentPlayerId) {
				const currentPlayer = this.globalState.getPlayerEntity(currentPlayerId);
				const playerData = currentPlayer?.getComponent('player');
				
				// Only update if we're close enough to see the change
				if (playerData) {
					const distance = Math.abs(data.x - playerData.x) + Math.abs(data.y - playerData.y);
					if (distance <= 50) { // Within reasonable view distance
						// Trigger a viewport refresh to get updated tile data
						this.globalState.markForRedraw();
					}
				}
			}
		}
	}

	private handlePlayerDeath(data: any): void {
		// Update player state
		if (data.playerId) {
			// Update the player in the game state
			this.gameManager.updatePlayer(data.playerId, { alive: false });
			
			// Check if the death message is for the current player
			const currentPlayerId = this.globalState.currentPlayerId;
			
			if (currentPlayerId && data.playerId === currentPlayerId) {
				this.gameManager.transitionPlayerState(2); // DEAD
				this.gameManager.transitionGameState(3); // DEAD
				
				// Get updated player data and call onPlayerUpdate immediately
				const currentPlayer = this.globalState.getPlayerEntity(currentPlayerId);
				const currentPlayerData = currentPlayer?.getComponent('player');
				
				if (currentPlayerData && this.onPlayerUpdate) {
					this.onPlayerUpdate({ 
						...currentPlayerData, 
						alive: false
					});
				}
			}
		}
	}

	private handleGameEnd(data: any): void {
		this.globalState.gameInfo.ended = true;
		this.gameManager.transitionGameState(3); // GAME_OVER
		this.globalState.markForUIUpdate();
	}

	private handleExplosion(explosionData: any): void {
		console.log('Explosion at', explosionData.x, explosionData.y);

		// Update affected tiles through the ECS system
		for (const affectedTile of explosionData.affectedTiles) {
			const tileEntity = this.globalState.getTileEntity(affectedTile.x, affectedTile.y);
			if (tileEntity) {
				const tileComponent = tileEntity.getComponent('tile');
				if (tileComponent) {
					Object.assign(tileComponent, affectedTile);
					this.gameManager.updateTileFromEntity(tileEntity);
				}
			} else {
				this.gameManager.createTile(affectedTile);
			}
		}

		this.globalState.markForRedraw();
	}


	// Public methods for sending actions
	sendPlayerAction(action: string, x?: number, y?: number): void {
		if (!this.client || !this.connected) return;

		// Send only core action data - metadata handled separately
		const actionData = { 
			action, 
			x, 
			y,
			// Session credentials for security validation
			sessionId: this.config?.sessionId,
			sessionToken: localStorage.getItem('mineland_session_token'),
			// Viewport data for server-side updates
			viewportWidth: window.innerWidth || 800,
			viewportHeight: window.innerHeight || 600
		};
		
		this.client.write('player-action', actionData);
		
		// Trigger immediate rendering for responsive feedback
		this.globalState.markForRedraw();
	}


	requestRespawn(): void {
		if (!this.client || !this.connected) return;

		this.client.write('request-respawn', {});
	}

	// Helper methods
	isConnected(): boolean {
		return this.connected;
	}

	update(_deltaTime: number): void {
		// NetworkSystem is event-driven, no regular updates needed
	}

	destroy(): void {
		if (this.client) {
			this.client.destroy();
			this.client = null;
		}
		this.connected = false;
	}
}