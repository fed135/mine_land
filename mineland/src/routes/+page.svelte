<script>
	import { onMount } from 'svelte';
	import { GameManager } from '$lib/index';

	// Game manager and state
	let gameManager;
	let globalState;

	// UI state
	let currentPlayer = null;
	let connected = false;
	let showWelcomeScreen = true;
	let playerName = '';
	let playerColor = '#0088ff';
	let sessionId = null;

	// Canvas references
	let hoverCtx;
	
	// Cached canvas rect
	let canvasRect = null;

	// Hover state for showing clickable tiles
	let lastMouseX = 0;
	let lastMouseY = 0;
	let lastHoveredTileX = null;
	let lastHoveredTileY = null;

	onMount(function onMountHandler() {
		// Initialize game manager and ECS
		gameManager = new GameManager();
		globalState = gameManager.getGlobalState();

		// Load player preferences
		loadPlayerPreferences();

		// If we have a session, try to reconnect
		if (sessionId && playerName.trim()) {
			showWelcomeScreen = false;
			connectToGame();
		}

		const canvas = document.getElementById('canvas');
		const hoverCanvas = document.getElementById('hover-canvas');
		
		if (canvas && hoverCanvas) {
			// Initialize canvases
			hoverCtx = hoverCanvas.getContext('2d', { alpha: true });
			resizeCanvas();
			updateCanvasRect();

			// Set up game manager
			gameManager.setCanvas(canvas);
			gameManager.setUIElements({
				connectionStatusEl: document.getElementById('connection-status'),
				connectionTextEl: document.getElementById('connection-text'),
				playerScoreEl: document.getElementById('player-score'),
				playerFlagsEl: document.getElementById('player-flags'),
				playerPositionEl: document.getElementById('player-position'),
				timerDisplayEl: document.getElementById('timer-display'),
				minesRemainingEl: document.getElementById('mines-remaining'),
				playerStatusEl: document.getElementById('player-status'),
				leaderboardElement: document.getElementById('leaderboard-content')
			});

			// Set up UI callbacks
			gameManager.setUICallbacks({
				onConnectionChange: (isConnected) => {
					connected = isConnected;
					
					// Hide connection status when connected
					const connectionStatus = document.getElementById('connection-status');
					if (connectionStatus) {
						connectionStatus.style.display = isConnected ? 'none' : 'flex';
					}
				},
				onPlayerUpdate: (player) => {
					// Set current player if we don't have one yet (first connection)
					if (!currentPlayer) {
						currentPlayer = player;
						gameManager.setCurrentPlayer(currentPlayer);
						
						// Show death popup immediately if player is dead on welcome/reconnect
						if (!player.alive) {
							const deathPopup = document.getElementById('death-popup');
							if (deathPopup) {
								deathPopup.style.display = 'flex';
							}
						}
					}
					// Update existing current player (use actual player ID)
					else if (currentPlayer && player.id === currentPlayer.id) {
						currentPlayer = { ...currentPlayer, ...player };
						gameManager.setCurrentPlayer(currentPlayer);

						// Handle death popup - only for server-controlled death messages or reconnections
						if (!player.alive) {
							const deathPopup = document.getElementById('death-popup');
							if (deathPopup) {
								deathPopup.style.display = 'flex';
							}
						}
					}
				}
			});

			setupEventListeners();
			startRenderLoop();
			startHoverLoop();

			return function onDismount() {
				if (gameManager) {
					gameManager.destroy();
				}
				window.removeEventListener('resize', resizeCanvas);
				window.removeEventListener('mousemove', handleMouseMove);
			};
		}
	});

	function loadPlayerPreferences() {
		try {
			const savedName = localStorage.getItem('mineland_player_name');
			const savedColor = localStorage.getItem('mineland_player_color');
			const savedSessionId = localStorage.getItem('mineland_session_id');

			if (savedName) playerName = savedName;
			if (savedColor) playerColor = savedColor;
			if (savedSessionId) sessionId = savedSessionId;
		} catch (e) {
			console.warn('Failed to load player preferences:', e);
		}
	}

	function savePlayerPreferences() {
		try {
			localStorage.setItem('mineland_player_name', playerName);
			localStorage.setItem('mineland_player_color', playerColor);
			if (sessionId) {
				localStorage.setItem('mineland_session_id', sessionId);
			}
		} catch (e) {
			console.warn('Failed to save player preferences:', e);
		}
	}

	function startGame() {
		if (!playerName.trim()) return;

		savePlayerPreferences();
		connectToGame();
	}

	function connectToGame() {
		if (!playerName.trim()) return;

		// Show connection status
		const connectionStatus = document.getElementById('connection-status');
		if (connectionStatus) {
			connectionStatus.style.display = 'flex';
		}

		gameManager.connectToServer({
			host: 'localhost',
			port: 8080,
			playerName: playerName.trim(),
			playerColor,
			sessionId
		});
		
		showWelcomeScreen = false;
		gameManager.transitionGameState(1); // CONNECTING
	}

	function resizeCanvas() {
		const canvas = document.getElementById('canvas');
		const hoverCanvas = document.getElementById('hover-canvas');
		if (!canvas || !hoverCanvas) return;

		canvas.width = window.innerWidth;
		canvas.height = window.innerHeight;
		hoverCanvas.width = window.innerWidth;
		hoverCanvas.height = window.innerHeight;
		
		updateCanvasRect();
		globalState?.markForRedraw();
	}

	function updateCanvasRect() {
		const canvas = document.getElementById('canvas');
		if (canvas) {
			canvasRect = canvas.getBoundingClientRect();
		}
	}

	function setupEventListeners() {
		window.addEventListener('resize', resizeCanvas);
		window.addEventListener('mousemove', handleMouseMove);
	}

	function handleMouseMove(event) {
		if (!canvasRect) return;

		lastMouseX = event.clientX - canvasRect.left;
		lastMouseY = event.clientY - canvasRect.top;
	}

	function startRenderLoop() {
		function render() {
			if (gameManager) {
				// Update game manager (handles all ECS systems)
				gameManager.update(17); // ~60 FPS delta time
			}
			requestAnimationFrame(render);
		}
		requestAnimationFrame(render);
	}

	function startHoverLoop() {
		function updateHover() {
			// Update hover effect every 17ms (60 FPS) regardless of game render state
			const hoverCanvas = document.getElementById('hover-canvas');
			if (hoverCtx && hoverCanvas && globalState && canvasRect) {
				hoverCtx.clearRect(0, 0, hoverCanvas.width, hoverCanvas.height);

				// Show hover effect for any tile on screen
				const cameraPos = globalState.getCameraPosition();
				const centerX = Math.floor(hoverCanvas.width / 2);
				const centerY = Math.floor(hoverCanvas.height / 2);
				const TILE_SIZE = 48;

				const worldX = cameraPos.x + (lastMouseX - centerX) / TILE_SIZE;
				const worldY = cameraPos.y + (lastMouseY - centerY) / TILE_SIZE;
				const tileX = Math.floor(worldX);
				const tileY = Math.floor(worldY);

				// Show hover highlight on any valid tile position
				if (tileX >= 0 && tileY >= 0) {
					// Show light blue hover highlight
					const screenX = centerX + (tileX - cameraPos.x) * TILE_SIZE;
					const screenY = centerY + (tileY - cameraPos.y) * TILE_SIZE;

					hoverCtx.strokeStyle = '#00ccff';
					hoverCtx.lineWidth = 2;
					hoverCtx.strokeRect(screenX, screenY, TILE_SIZE, TILE_SIZE);

					lastHoveredTileX = tileX;
					lastHoveredTileY = tileY;
				}
			}
			setTimeout(updateHover, 17); // Force 60 FPS hover updates
		}
		updateHover();
	}
</script>

<div class="game-container">
	<!-- Welcome Screen -->
	<div id="welcome-screen" class="welcome-screen" style:display="{showWelcomeScreen ? 'flex' : 'none'}">
		<div class="welcome-panel">
			<h1>🎮 Mine Land</h1>
			<p>Welcome to Mine Land! Choose your player settings to get started.</p>

			<div class="settings-group">
				<label for="player-name">Player Name:</label>
				<input id="player-name" type="text" value={playerName} on:input={e => playerName = e.target.value} placeholder="Enter your name" maxlength="12" />
			</div>

			<div class="settings-group">
				<label for="player-color">Player Color:</label>
				<div class="color-slider-container">
					<input id="player-color" type="range" min="0" max="360" value={playerColor} on:input={e => playerColor = e.target.value} class="color-slider" />
					<div class="color-preview" style:background-color="hsl({playerColor}, 70%, 50%)"></div>
				</div>
			</div>

			<button class="start-button" on:click={startGame} disabled={!playerName.trim()}>
				Start Playing
			</button>
		</div>
	</div>

	<!-- Death Notification Popup -->
	<div id="death-popup" class="death-popup" style="display: none;">
		<div class="death-panel">
			<h2>💀 You Died!</h2>
			<p>You have been eliminated from the match.</p>
			<p>You can watch the remaining players but cannot take any actions.</p>
			<p><strong>Wait for the current match to finish to play again.</strong></p>
			<div class="death-info">
				<p>• Your final score: <strong>{currentPlayer?.score || 0}</strong></p>
				<p>• You can still see the leaderboard and watch other players</p>
				<p>• The game will end when all mines are flagged or detonated</p>
			</div>
		</div>
	</div>

	<!-- Game Info Panels -->
	<div id="connection-status" class="connection-status" style:display="none">
		<div class="connection-panel">
			<span id="connection-text">Connecting...</span>
		</div>
	</div>

	<div id="top-info-panel" class="top-info-panel">
		<div class="info-left">
			<div class="info-item">Score: <span id="player-score">0</span></div>
			<div class="info-item">Flags: <span id="player-flags">0</span></div>
			<div class="info-item">Position: <span id="player-position">(0, 0)</span></div>
		</div>

		<div class="info-center">
			<div id="timer-display" class="timer-display">00:00</div>
		</div>

		<div class="info-right">
			<div class="info-item">Mines: <span id="mines-remaining">0</span></div>
			<div class="info-item">Status: <span id="player-status">CONNECTING</span></div>
		</div>
	</div>

	<div id="bottom-info-panel" class="bottom-info-panel">
		<div class="instructions">
			<div>WASD/Arrow Keys: Move | Left Click: Flip Tile | Right Click: Flag</div>
			<div>Find and flag all mines to win!</div>
		</div>
	</div>

	<div class="leaderboard">
		<h3>Leaderboard</h3>
		<div id="leaderboard-content" class="leaderboard-content">
			<div class="loading">Loading...</div>
		</div>
	</div>

	<canvas id="canvas"></canvas>
	<canvas id="hover-canvas"></canvas>
</div>

<style>
	.game-container {
		position: relative;
		width: 100vw;
		height: 100vh;
		margin: 0;
		padding: 0;
	}

	canvas {
		display: block;
		width: 100vw;
		height: 100vh;
		margin: 0;
		padding: 0;
		border: none;
		outline: none;
		transform: translate3d(0,0,0);
	}

	#hover-canvas {
		position: absolute;
		top: 0;
		left: 0;
		pointer-events: none;
		z-index: 500;
	}

	/* Welcome Screen Styles */
	.welcome-screen {
		position: absolute;
		top: 0;
		left: 0;
		width: 100vw;
		height: 100vh;
		background: rgba(192, 192, 192, 0.98);
		justify-content: center;
		align-items: center;
		z-index: 2000;
		font-family: Arial, sans-serif;
	}

	.welcome-panel {
		background: #c0c0c0;
		border: 4px outset #c0c0c0;
		border-radius: 8px;
		padding: 40px;
		width: 400px;
		text-align: center;
		box-shadow: 4px 4px 12px rgba(0, 0, 0, 0.5);
	}

	.welcome-panel h1 {
		margin: 0 0 10px 0;
		color: #000;
		font-size: 28px;
		font-weight: bold;
		text-shadow: 1px 1px 2px rgba(255, 255, 255, 0.8);
	}

	.welcome-panel p {
		margin: 0 0 30px 0;
		color: #333;
		font-size: 14px;
	}

	.settings-group {
		margin-bottom: 25px;
		text-align: left;
	}

	.settings-group label {
		display: block;
		margin-bottom: 6px;
		color: #000;
		font-weight: bold;
		font-size: 14px;
	}

	.settings-group input[type="text"] {
		width: 100%;
		padding: 8px;
		border: 2px inset #c0c0c0;
		background: #ffffff;
		font-size: 14px;
		font-family: Arial, sans-serif;
		box-sizing: border-box;
	}

	.settings-group input[type="text"]:focus {
		outline: none;
		background: #ffffcc;
		border-color: #0066cc;
	}

	.color-slider-container {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.color-slider {
		flex-grow: 1;
		height: 24px;
		border: 2px inset #c0c0c0;
		background: #ffffff;
		border-radius: 4px;
		appearance: none;
	}

	.color-slider::-webkit-slider-thumb {
		appearance: none;
		width: 20px;
		height: 20px;
		background: #c0c0c0;
		border: 2px outset #c0c0c0;
		border-radius: 2px;
		cursor: pointer;
	}

	.color-slider::-moz-range-thumb {
		width: 18px;
		height: 18px;
		background: #c0c0c0;
		border: 2px outset #c0c0c0;
		border-radius: 2px;
		cursor: pointer;
	}

	.color-preview {
		width: 32px;
		height: 24px;
		border: 2px inset #c0c0c0;
		border-radius: 4px;
		flex-shrink: 0;
	}

	.start-button {
		background: #c0c0c0;
		border: 4px outset #c0c0c0;
		color: #000;
		padding: 10px 24px;
		font-size: 16px;
		font-weight: bold;
		font-family: Arial, sans-serif;
		cursor: pointer;
		border-radius: 4px;
		margin-top: 10px;
	}

	.start-button:hover:not(:disabled) {
		background: #d0d0d0;
		border-color: #d0d0d0;
	}

	.start-button:active:not(:disabled) {
		border-style: inset;
		background: #b0b0b0;
		border-color: #b0b0b0;
	}

	.start-button:disabled {
		background: #a0a0a0;
		border-color: #a0a0a0;
		color: #666;
		cursor: not-allowed;
	}

	/* Death Popup Styles */
	.death-popup {
		position: absolute;
		top: 0;
		left: 0;
		width: 100vw;
		height: 100vh;
		background: rgba(0, 0, 0, 0.3);
		justify-content: center;
		align-items: center;
		z-index: 2500;
		font-family: Arial, sans-serif;
	}

	.death-panel {
		background: #c0c0c0;
		border: 4px outset #c0c0c0;
		border-radius: 8px;
		padding: 30px;
		width: 450px;
		text-align: center;
		box-shadow: 4px 4px 12px rgba(0, 0, 0, 0.7);
		animation: deathPopupSlide 0.3s ease-out;
	}

	@keyframes deathPopupSlide {
		from {
			transform: translateY(-50px);
			opacity: 0;
		}
		to {
			transform: translateY(0);
			opacity: 1;
		}
	}

	.death-panel h2 {
		margin: 0 0 15px 0;
		color: #800000;
		font-size: 24px;
		font-weight: bold;
		text-shadow: 1px 1px 2px rgba(255, 255, 255, 0.8);
	}

	.death-panel p {
		margin: 0 0 15px 0;
		color: #000;
		font-size: 14px;
		line-height: 1.4;
	}

	.death-panel p strong {
		color: #800000;
		font-weight: bold;
	}

	.death-info {
		background: rgba(255, 255, 255, 0.8);
		border: 2px inset #c0c0c0;
		border-radius: 4px;
		padding: 15px;
		margin-top: 20px;
		text-align: left;
	}

	.death-info p {
		margin: 8px 0;
		font-size: 13px;
		color: #333;
	}

	.death-info p strong {
		color: #006600;
	}

	/* Game Info Panel Styles */
	.connection-status {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		z-index: 1500;
	}

	.connection-panel {
		background: #c0c0c0;
		border: 2px outset #c0c0c0;
		padding: 20px 40px;
		border-radius: 4px;
		font-family: Arial, sans-serif;
		font-size: 18px;
		font-weight: bold;
		text-align: center;
		box-shadow: 2px 2px 8px rgba(0, 0, 0, 0.3);
	}

	.top-info-panel {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 90px;
		background: #c0c0c0;
		border-bottom: 2px solid #808080;
		display: flex;
		align-items: center;
		font-family: Arial, sans-serif;
		font-size: 16px;
		font-weight: bold;
		color: #000;
		z-index: 1000;
	}

	.info-left {
		flex: 1;
		padding: 0 20px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.info-center {
		flex: 0 0 auto;
		display: flex;
		justify-content: center;
		align-items: center;
	}

	.info-right {
		flex: 1;
		padding: 0 20px;
		display: flex;
		flex-direction: column;
		gap: 4px;
		text-align: right;
	}

	.info-item {
		margin: 2px 0;
	}

	.timer-display {
		background: #404040;
		border: 1px inset #404040;
		padding: 8px 16px;
		border-radius: 4px;
		font-family: 'Seven Segment', monospace;
		font-size: 28px;
		font-weight: 700;
		color: #ff0000;
		width: 120px;
		text-align: center;
		letter-spacing: 2px;
		box-sizing: border-box;
		font-variant-numeric: tabular-nums;
	}

	.bottom-info-panel {
		position: absolute;
		bottom: 0;
		left: 0;
		width: 100%;
		height: 70px;
		background: #c0c0c0;
		border-top: 2px solid #808080;
		display: flex;
		align-items: center;
		justify-content: center;
		font-family: Arial, sans-serif;
		font-size: 12px;
		font-weight: bold;
		color: #000;
		z-index: 1000;
	}

	.instructions {
		text-align: center;
		line-height: 1.6;
	}

	/* Leaderboard Styles */
	.leaderboard {
		position: absolute;
		top: 100px;
		right: 10px;
		width: 200px;
		background: #c0c0c0;
		border: 2px outset #c0c0c0;
		border-radius: 4px;
		font-family: Arial, sans-serif;
		font-size: 12px;
		z-index: 1000;
	}

	.leaderboard h3 {
		background: #b0b0b0;
		margin: 0;
		padding: 8px 12px;
		border-bottom: 1px solid #808080;
		font-size: 12px;
		font-weight: bold;
		text-align: center;
	}

	.leaderboard-content {
		max-height: 300px;
		overflow-y: auto;
		padding: 5px 0;
	}

	.loading {
		padding: 20px;
		text-align: center;
		color: #666;
		font-style: italic;
	}

	:global(body) {
		margin: 0;
		padding: 0;
		overflow: hidden;
		background-color: #c0c0c0;
	}
</style>