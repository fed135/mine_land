<script>
	import { onMount } from 'svelte';
	import { connect, routines } from 'kalm';
	import ws from '@kalm/ws';

	let fps = 0;
	let netUp = 0;
	let netDown = 0;

	// Game constants
	const TILE_SIZE = 48;

	// Minesweeper colors
	const COLORS = {
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

	// Game state - non-reactive for performance
	let canvas;
	let ctx;
	let client;
	let connected = false;
	const gameState = {
		viewport: { tiles: [], players: [] },
		gameInfo: { startTime: 0, ended: false, minesRemaining: 0 },
		spawnPoints: []
	};

	// Separate reactive variables to prevent unnecessary updates
	let currentPlayer = null;
	let leaderboardPlayers = [];
	let lastLeaderboardHash = '';
	let leaderboardElement;

	// Welcome screen state
	let showWelcomeScreen = true;
	let playerName = '';
	let playerColor = '#0088ff';
	let sessionId = null;

	// Death popup state
	let showDeathPopup = false;

	// Camera state for smooth movement
	let cameraX = 0;
	let cameraY = 0;
	let targetCameraX = 0;
	let targetCameraY = 0;

	// HTML UI element references
	let connectionStatusEl;
	let connectionTextEl;
	let playerScoreEl;
	let playerFlagsEl;
	let playerPositionEl;
	let timerDisplayEl;
	let minesRemainingEl;
	let playerStatusEl;

	// Hover canvas layer
	let hoverCanvas;
	let hoverCtx;

	// Render flags for change detection
	let gameNeedsRedraw = true;
	let uiNeedsUpdate = true;

	// Cached UI values to detect changes
	const lastUIValues = {
		score: null,
		flags: null,
		position: null,
		mines: null,
		status: null,
		timer: null,
		connected: null
	};

	// Single spritesheet for all cached tiles
	let spritesheet = null;
	let spritesheetCtx = null;
	let tileCacheInitialized = false;

	// Flag token pickup animations
	let flagTokenAnimations = [];
	const ANIMATION_DURATION = 1000; // 1 second
	const FLOAT_HEIGHT = 50; // pixels to float up

	// Sprite positions on the spritesheet (x, y coordinates)
	const SPRITES = {
		covered: { x: 0, y: 0 },
		coveredClickable: { x: TILE_SIZE, y: 0 },
		revealed: { x: TILE_SIZE * 2, y: 0 },
		explosion: { x: TILE_SIZE * 3, y: 0 },
		mine: { x: TILE_SIZE * 4, y: 0 },
		mineExploded: { x: TILE_SIZE * 5, y: 0 },
		flagRed: { x: TILE_SIZE * 6, y: 0 },
		flagGreen: { x: TILE_SIZE * 7, y: 0 },
		spawn: { x: TILE_SIZE * 8, y: 0 },
		flagToken: { x: TILE_SIZE * 8, y: TILE_SIZE }, // Flag token sprite
		numbers: [
			null, // Index 0 unused
			{ x: 0, y: TILE_SIZE }, // Number 1
			{ x: TILE_SIZE, y: TILE_SIZE }, // Number 2
			{ x: TILE_SIZE * 2, y: TILE_SIZE }, // Number 3
			{ x: TILE_SIZE * 3, y: TILE_SIZE }, // Number 4
			{ x: TILE_SIZE * 4, y: TILE_SIZE }, // Number 5
			{ x: TILE_SIZE * 5, y: TILE_SIZE }, // Number 6
			{ x: TILE_SIZE * 6, y: TILE_SIZE }, // Number 7
			{ x: TILE_SIZE * 7, y: TILE_SIZE }  // Number 8
		]
	};

	// Spritesheet dimensions
	const SPRITESHEET_WIDTH = TILE_SIZE * 9; // 9 sprites wide
	const SPRITESHEET_HEIGHT = TILE_SIZE * 2; // 2 sprites tall

	// Input handling
	const pressedKeys = new Set();
	let lastMouseX = 0;
	let lastMouseY = 0;
	let lastHoveredTileX = null;
	let lastHoveredTileY = null;

	// Cached canvas rect to avoid repeated getBoundingClientRect calls
	let canvasRect = null;

	onMount(function onMountHandler() {
		canvas = document.getElementById('canvas');
		hoverCanvas = document.getElementById('hover-canvas');
		leaderboardElement = document.getElementById('leaderboard-content');

		// Get HTML UI element references
		connectionStatusEl = document.getElementById('connection-status');
		connectionTextEl = document.getElementById('connection-text');
		playerScoreEl = document.getElementById('player-score');
		playerFlagsEl = document.getElementById('player-flags');
		playerPositionEl = document.getElementById('player-position');
		timerDisplayEl = document.getElementById('timer-display');
		minesRemainingEl = document.getElementById('mines-remaining');
		playerStatusEl = document.getElementById('player-status');

		// Load player preferences from localStorage
		loadPlayerPreferences();

		// If we have a session ID, try to reconnect directly
		if (sessionId && playerName.trim()) {
			showWelcomeScreen = false;
			connectToServer();
		}

		if (canvas && hoverCanvas) {
			ctx = canvas.getContext('2d', { alpha: false });
			hoverCtx = hoverCanvas.getContext('2d', { alpha: true });
			resizeCanvas();
			updateCanvasRect();
			initializeTileCache();
			setupEventListeners();
			startRenderLoop();

			return function onDismount() {
				if (client) {
					client.destroy();
				}
				window.removeEventListener('resize', resizeCanvas);
				window.removeEventListener('keydown', handleKeyDown);
				window.removeEventListener('keyup', handleKeyUp);
				canvas.removeEventListener('click', handleCanvasClick);
				canvas.removeEventListener('contextmenu', handleCanvasRightClick);
				canvas.removeEventListener('mousemove', handleMouseMove);
			};
		}
	});

	function connectToServer() {
		try {
			client = connect({
				port: 8080,
				host: 'localhost',
				transport: ws(),
				routine: routines.realtime()
			});

			client.on('connect', function socketConnected() {
				connected = true;
				console.log('Connected to Mine Land server');
				markUIForUpdate();

				// Send player preferences to server with session ID for reconnection
				const hue = parseInt(playerColor) || 200;
				const hslColor = `hsl(${hue}, 70%, 50%)`;
				client.write('player-preferences', {
					name: playerName,
					color: hslColor,
					sessionId: sessionId
				});
			});

			client.on('disconnect', function socketDisconnected() {
				connected = false;
				console.log('Disconnected from server');
				markUIForUpdate();
				// Attempt reconnection after 2 seconds
				setTimeout(connectToServer, 2000);
			});

			client.on('error', function socketError(error) {
				console.error('Kalm client error:', error);
			});

			client.on('frame', function socketFrame(body) {
				console.log(body);
				netDown++;
			});

			// Subscribe to server messages
			client.subscribe('welcome', function welcomeHandler(data) {
				currentPlayer = data.player;
				gameState.gameInfo = data.gameState;
				gameState.viewport = data.viewport;
				gameState.spawnPoints = data.spawnPoints || [];
				leaderboardPlayers = data.viewport.players || [];
				updateLeaderboard();

				// Initialize camera position to player position (no easing on first load)
				if (currentPlayer) {
					cameraX = currentPlayer.x;
					cameraY = currentPlayer.y;
					targetCameraX = currentPlayer.x;
					targetCameraY = currentPlayer.y;
				}

				// Show death popup if player is dead on welcome/reconnect
				if (currentPlayer && !currentPlayer.alive) {
					showDeathPopup = true;
				}

				// Mark for redraw/update
				markGameForRedraw();
				markUIForUpdate();
			});

			client.subscribe('viewport-update', function viewportUpdateHandler(data) {
				// Check for flag token pickups before updating viewport
				if (gameState.viewport.tiles && currentPlayer) {
					const oldTiles = new Map();
					gameState.viewport.tiles.forEach(tile => {
						oldTiles.set(`${tile.x},${tile.y}`, tile);
					});

					data.tiles.forEach(newTile => {
						const key = `${newTile.x},${newTile.y}`;
						const oldTile = oldTiles.get(key);

						// Detect flag token pickup: was flag_token, now something else and revealed
						if (oldTile &&
							oldTile.type === 'flag_token' &&
							newTile.type !== 'flag_token' &&
							newTile.revealed) {

							// Create pickup animation (store world coordinates)
							flagTokenAnimations.push({
								worldX: newTile.x,
								worldY: newTile.y,
								startTime: Date.now(),
								text: '+2 FLAGS'
							});
						}
					});
				}

				gameState.viewport = data;
				// Update our player position from the viewport data
				const ourPlayer = data.players.find(p => p.id === currentPlayer?.id);
				if (ourPlayer && currentPlayer) {
					currentPlayer.x = ourPlayer.x;
					currentPlayer.y = ourPlayer.y;
				}
				markGameForRedraw();
				markUIForUpdate();
			});

			client.subscribe('player-update', function playerUpdateHandler(data) {
				// Update players in viewport
				const updatedPlayer = data.player;
				gameState.viewport.players = gameState.viewport.players.map(p =>
					p.id === updatedPlayer.id ? updatedPlayer : p
				);

				// If this update is for the current player, update currentPlayer object too
				if (currentPlayer && updatedPlayer.id === currentPlayer.id) {
					currentPlayer.score = updatedPlayer.score;
					currentPlayer.flags = updatedPlayer.flags;
					currentPlayer.alive = updatedPlayer.alive;
					currentPlayer.x = updatedPlayer.x;
					currentPlayer.y = updatedPlayer.y;
					markUIForUpdate();
				}

				markGameForRedraw();
			});

			client.subscribe('player-joined', function playerJoinedHandler(data) {
				if (!gameState.viewport.players.find(p => p.id === data.player.id)) {
					gameState.viewport.players.push(data.player);
				}
				markGameForRedraw();
			});

			client.subscribe('explosion', function explosionHandler(data) {
				handleExplosion(data);

				// Check if current player was killed in the explosion
				if (currentPlayer && data.killedPlayers && data.killedPlayers.includes(currentPlayer.id)) {
					currentPlayer.alive = false;
					// Add slight delay before showing death popup
					setTimeout(() => {
						showDeathPopup = true;
					}, 1000);
				}
				markGameForRedraw();
				markUIForUpdate();
			});

			client.subscribe('game-end', function gameEndHandler(data) {
				gameState.gameInfo.ended = true;
				showDeathPopup = false; // Hide death popup when game ends
				alert('Game Over! Final Leaderboard: ' +
					data.leaderboard.map((p, i) => `${i + 1}. ${p.username}: ${p.score}`).join('\n'));
			});

			client.subscribe('player-disconnected', function playerDisconnectedHandler(data) {
				gameState.viewport.players = gameState.viewport.players.filter(p => p.id !== data.playerId);
				markGameForRedraw();
			});

			client.subscribe('leaderboard-update', function leaderboardUpdateHandler(data) {
				leaderboardPlayers = data.players;
				updateLeaderboard();
				markUIForUpdate();
			});

			client.subscribe('session-assigned', function sessionAssignedHandler(data) {
				if (data.sessionId) {
					sessionId = data.sessionId;
					savePlayerPreferences(); // Save the new session ID
				}
			});
		} catch (error) {
			console.error('Failed to connect to server:', error);
		}
	}

	function sendPlayerAction(action, x, y) {
		if (client && connected) {
			// Calculate viewport dimensions in tiles (full screen coverage)
			const viewportTilesX = Math.ceil(canvas.width / TILE_SIZE);
			const viewportTilesY = Math.ceil(canvas.height / TILE_SIZE);

			netUp++;

			client.write('player-action', {
				action,
				x,
				y,
				viewportWidth: Math.min(viewportTilesX, 100),
				viewportHeight: Math.min(viewportTilesY, 100)
			});
		}
	}

	function setupEventListeners() {
		window.addEventListener('resize', resizeCanvas);
		window.addEventListener('keydown', handleKeyDown);
		window.addEventListener('keyup', handleKeyUp);
		canvas.addEventListener('click', handleCanvasClick);
		canvas.addEventListener('contextmenu', handleCanvasRightClick);
		canvas.addEventListener('mousemove', handleMouseMove);
	}

	function handleKeyDown(event) {
		// Prevent repeated events when key is held down
		if (pressedKeys.has(event.code)) {
			return;
		}
		pressedKeys.add(event.code);

		if (!currentPlayer || !currentPlayer.alive) {
			return;
		}

		let newX = currentPlayer.x;
		let newY = currentPlayer.y;

		// Only process the specific key that was pressed
		if (event.code === 'KeyW' || event.code === 'ArrowUp') {
			newY -= 1;
		}
		if (event.code === 'KeyS' || event.code === 'ArrowDown') {
			newY += 1;
		}
		if (event.code === 'KeyA' || event.code === 'ArrowLeft') {
			newX -= 1;
		}
		if (event.code === 'KeyD' || event.code === 'ArrowRight') {
			newX += 1;
		}

		if (newX !== currentPlayer.x || newY !== currentPlayer.y) {
			sendPlayerAction('move', newX, newY);
		}
	}

	function handleKeyUp(event) {
		pressedKeys.delete(event.code);
	}

	function handleMouseMove(event) {
		// Use cached rect instead of calling getBoundingClientRect every time
		if (canvasRect) {
			lastMouseX = event.clientX - canvasRect.left;
			lastMouseY = event.clientY - canvasRect.top;
		}
	}

	function handleCanvasClick(event) {
		const { x, y } = getClickedTile(event);
		if (x !== null && y !== null) {
			sendPlayerAction('flip', x, y);
		}
	}

	function handleCanvasRightClick(event) {
		event.preventDefault();
		const { x, y } = getClickedTile(event);
		if (x !== null && y !== null) {
			// Check if tile is already flagged to decide unflag vs flag
			// Note: This uses a quick lookup during event handling, separate from render performance
			const tile = gameState.viewport.tiles.find(t => t.x === x && t.y === y);
			const action = tile && tile.flagged ? 'unflag' : 'flag';
			sendPlayerAction(action, x, y);
		}
	}

	function getClickedTile(event) {
		if (!currentPlayer || !canvasRect) {
			return { x: null, y: null };
		}

		const clickX = event.clientX - canvasRect.left;
		const clickY = event.clientY - canvasRect.top;

		const centerX = Math.floor(canvas.width / 2);
		const centerY = Math.floor(canvas.height / 2);

		const tileX = Math.floor((clickX - centerX) / TILE_SIZE + cameraX);
		const tileY = Math.floor((clickY - centerY) / TILE_SIZE + cameraY);

		return { x: tileX, y: tileY };
	}

	function getHoveredTile(mouseX, mouseY) {
		if (!currentPlayer) {
			return { x: null, y: null };
		}

		const centerX = Math.floor(canvas.width / 2);
		const centerY = Math.floor(canvas.height / 2);

		const tileX = Math.floor((mouseX - centerX) / TILE_SIZE + cameraX);
		const tileY = Math.floor((mouseY - centerY) / TILE_SIZE + cameraY);

		return { x: tileX, y: tileY };
	}

	function handleExplosion(explosionData) {
		// Visual explosion effect
		console.log('Explosion at', explosionData.x, explosionData.y);
		// Update affected tiles
		// Create temporary lookup for this explosion update
		const explosionTileMap = new Map();
		for (const tile of gameState.viewport.tiles) {
			explosionTileMap.set(`${tile.x},${tile.y}`, tile);
		}

		for (const affectedTile of explosionData.affectedTiles) {
			const tile = explosionTileMap.get(`${affectedTile.x},${affectedTile.y}`);
			if (tile) {
				tile.revealed = true;
			}
		}
	}

	function updateCanvasRect() {
		if (canvas) {
			canvasRect = canvas.getBoundingClientRect();
		}
	}

	function resizeCanvas() {
		if (canvas) {
			canvas.width = window.innerWidth;
			canvas.height = window.innerHeight;
		}
		if (hoverCanvas) {
			hoverCanvas.width = window.innerWidth;
			hoverCanvas.height = window.innerHeight;
		}
		// Update cached rect after resize
		updateCanvasRect();
		// Mark game for redraw after resize
		gameNeedsRedraw = true;
	}

	function initializeTileCache() {
		if (tileCacheInitialized) {
			return;
		}

		// Create single spritesheet canvas
		spritesheet = document.createElement('canvas');
		spritesheet.width = SPRITESHEET_WIDTH;
		spritesheet.height = SPRITESHEET_HEIGHT;
		spritesheetCtx = spritesheet.getContext('2d');

		// Render all sprites to the spritesheet
		// Row 1: Basic tiles
		renderCoveredTileToCache(spritesheetCtx, SPRITES.covered.x, SPRITES.covered.y, false);
		renderCoveredTileToCache(spritesheetCtx, SPRITES.coveredClickable.x, SPRITES.coveredClickable.y, true);
		renderRevealedTileToCache(spritesheetCtx, SPRITES.revealed.x, SPRITES.revealed.y);
		renderExplosionTileToCache(spritesheetCtx, SPRITES.explosion.x, SPRITES.explosion.y);
		renderMineTileToCache(spritesheetCtx, SPRITES.mine.x, SPRITES.mine.y, false);
		renderMineTileToCache(spritesheetCtx, SPRITES.mineExploded.x, SPRITES.mineExploded.y, true);
		renderFlagToCache(spritesheetCtx, SPRITES.flagRed.x, SPRITES.flagRed.y, false);
		renderFlagToCache(spritesheetCtx, SPRITES.flagGreen.x, SPRITES.flagGreen.y, true);
		renderSpawnEffectToCache(spritesheetCtx, SPRITES.spawn.x, SPRITES.spawn.y);

		// Row 2: Numbers 1-8 and flag token
		for (let i = 1; i <= 8; i++) {
			renderNumberTileToCache(spritesheetCtx, SPRITES.numbers[i].x, SPRITES.numbers[i].y, i);
		}
		renderFlagTokenToCache(spritesheetCtx, SPRITES.flagToken.x, SPRITES.flagToken.y);

		tileCacheInitialized = true;
		console.log('Spritesheet initialized with', SPRITESHEET_WIDTH, 'x', SPRITESHEET_HEIGHT, 'pixels for optimized tile rendering');
	}

	function lerp(start, end, factor) {
		return start + (end - start) * factor;
	}

	function updateCamera() {
		if (currentPlayer) {
			// Set target camera position to player position
			targetCameraX = currentPlayer.x;
			targetCameraY = currentPlayer.y;

			// Smooth camera interpolation with easing (adjust 0.08 for faster/slower camera)
			const lerpFactor = 0.08;
			const oldCameraX = cameraX;
			const oldCameraY = cameraY;
			cameraX = lerp(cameraX, targetCameraX, lerpFactor);
			cameraY = lerp(cameraY, targetCameraY, lerpFactor);

			// Check if camera is still moving or very close to target
			const distanceToTargetX = Math.abs(targetCameraX - cameraX);
			const distanceToTargetY = Math.abs(targetCameraY - cameraY);
			const cameraMovement = Math.abs(oldCameraX - cameraX) + Math.abs(oldCameraY - cameraY);

			// Mark for redraw if camera moved OR if we're close to target but not exactly there
			if (cameraMovement > 0.001 || distanceToTargetX > 0.001 || distanceToTargetY > 0.001) {
				gameNeedsRedraw = true;
				// Camera movement affects hover position calculation, so invalidate hover
				lastHoveredTileX = null;
				lastHoveredTileY = null;
			}
		}
	}

	function markGameForRedraw() {
		gameNeedsRedraw = true;
	}

	function markUIForUpdate() {
		uiNeedsUpdate = true;
	}

	function updateUI() {
		if (!uiNeedsUpdate) {
			return;
		} // Skip if no UI changes needed

		// Update connection status
		if (!currentPlayer) {
			const connectionStatus = connected ? 'Connected to Mine Land' : 'Connecting...';
			if (lastUIValues.connected !== connectionStatus) {
				if (connectionStatusEl) {
					connectionStatusEl.style.display = 'block';
					if (connectionTextEl) {
						connectionTextEl.textContent = connectionStatus;
						connectionTextEl.style.color = connected ? '#008000' : '#800000';
					}
				}
				lastUIValues.connected = connectionStatus;
			}
			uiNeedsUpdate = false;
			return;
		} else {
			if (lastUIValues.connected !== null) {
				if (connectionStatusEl) {
					connectionStatusEl.style.display = 'none';
				}
				lastUIValues.connected = null;
			}
		}

		// Update player info only if changed
		if (lastUIValues.score !== currentPlayer.score) {
			if (playerScoreEl) {
				playerScoreEl.textContent = currentPlayer.score;
			}
			lastUIValues.score = currentPlayer.score;
		}

		if (lastUIValues.flags !== currentPlayer.flags) {
			if (playerFlagsEl) {
				playerFlagsEl.textContent = currentPlayer.flags;
			}
			lastUIValues.flags = currentPlayer.flags;
		}

		const position = `(${currentPlayer.x}, ${currentPlayer.y})`;
		if (lastUIValues.position !== position) {
			if (playerPositionEl) {
				playerPositionEl.textContent = position;
			}
			lastUIValues.position = position;
		}

		// Update game info only if changed
		if (lastUIValues.mines !== gameState.gameInfo.minesRemaining) {
			if (minesRemainingEl) {
				minesRemainingEl.textContent = gameState.gameInfo.minesRemaining;
			}
			lastUIValues.mines = gameState.gameInfo.minesRemaining;
		}

		// Update player status only if changed
		const status = currentPlayer.alive ? 'ALIVE' : 'DEAD';
		if (lastUIValues.status !== status) {
			if (playerStatusEl) {
				playerStatusEl.textContent = status;
				playerStatusEl.className = currentPlayer.alive ? 'alive' : 'dead';
			}
			lastUIValues.status = status;
		}

		uiNeedsUpdate = false; // Reset flag after update
	}

	function updateTimer() {
		// Update timer every frame (time-based updates should be continuous)
		if (timerDisplayEl && gameState.gameInfo.startTime > 0) {
			const elapsedTime = Math.floor((Date.now() - gameState.gameInfo.startTime) / 1000);
			const minutes = Math.floor(elapsedTime / 60);
			const secs = elapsedTime % 60;
			const timeString = `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
			if (lastUIValues.timer !== timeString) {
				timerDisplayEl.textContent = timeString;
				lastUIValues.timer = timeString;
			}
		}
	}

	function startRenderLoop() {
		setInterval(calcFPS, 1000);
		setInterval(updateTimer, 300); // Update timer every 300ms
		function render() {
			if (ctx && canvas && hoverCtx && hoverCanvas) {
				updateCamera();
				updateUI();

				// Only redraw game if something changed
				if (gameNeedsRedraw) {
					renderGame();
					gameNeedsRedraw = false;
				}

				// Always render hover (60fps) since mouse moves frequently
				renderHover();
			}
			//requestAnimationFrame(render);
			setTimeout(render, 17);
		}
		render();
	}

	function calcFPS() {
		console.log('FPS: ', fps, 'NET-UP:', netUp, 'NET DOWN:', netDown, tileCacheInitialized ? '(Spritesheet)' : '(No cache)');
		fps = 0;
		netUp = 0;
		netDown = 0;
	}

	function updateLeaderboard() {
		if (!leaderboardElement || !leaderboardPlayers) {
			return;
		}

		// Create a hash of the leaderboard data to check for changes
		const sortedPlayers = leaderboardPlayers
			.filter(p => p.score > 0)
			.sort((a, b) => b.score - a.score)
			.slice(0, 10);

		const leaderboardHash = JSON.stringify(sortedPlayers.map(p => ({
			id: p.id,
			username: p.username,
			score: p.score,
			alive: p.alive
		}))) + (currentPlayer?.id || '');

		// Only update DOM if data has changed
		if (leaderboardHash === lastLeaderboardHash) {
			return;
		}
		lastLeaderboardHash = leaderboardHash;

		let html = '';

		if (sortedPlayers.length === 0) {
			html = '<div class="no-scores">No scores yet</div>';
		} else {
			sortedPlayers.forEach((player, index) => {
				const isCurrentPlayer = player.id === currentPlayer?.id;
				const currentPlayerClass = isCurrentPlayer ? ' current-player' : '';
				const deadStatus = !player.alive ? ' 💀' : '';

				html += `
					<div class="leaderboard-entry${currentPlayerClass}">
						<span class="rank">#${index + 1}</span>
						<span class="name">${player.username}${deadStatus}</span>
						<span class="score">${player.score}</span>
					</div>
				`;
			});
		}

		leaderboardElement.innerHTML = html;
	}

	function loadPlayerPreferences() {
		try {
			const savedName = localStorage.getItem('mineland-player-name');
			const savedColor = localStorage.getItem('mineland-player-color');
			const savedSessionId = localStorage.getItem('mineland-session-id');

			if (savedName) {
				playerName = savedName;
			}

			if (savedColor) {
				playerColor = savedColor;
			}

			if (savedSessionId) {
				sessionId = savedSessionId;
			}
		} catch (error) {
			console.log('Could not load player preferences from localStorage:', error);
		}
	}

	function savePlayerPreferences() {
		try {
			localStorage.setItem('mineland-player-name', playerName);
			localStorage.setItem('mineland-player-color', playerColor);
			if (sessionId) {
				localStorage.setItem('mineland-session-id', sessionId);
			}
		} catch (error) {
			console.log('Could not save player preferences to localStorage:', error);
		}
	}

	function startGame() {
		if (!playerName.trim()) {
			return;
		}

		// Save preferences
		savePlayerPreferences();

		// Hide welcome screen
		showWelcomeScreen = false;

		// Connect to server with player preferences
		connectToServer();
	}

	function renderGame() {
		fps++;

		// Create global tile lookup for performance (O(1) instead of O(n) finds)
		const tileMap = new Map();
		const tileSet = new Set();
		for (const tile of gameState.viewport.tiles) {
			const key = `${tile.x},${tile.y}`;
			tileMap.set(key, tile);
			tileSet.add(key);
		}

		// Create spawn point lookup for performance
		const spawnSet = new Set(gameState.spawnPoints.map(sp => `${sp.x},${sp.y}`));

		// Clear canvas with minesweeper gray background
		ctx.fillStyle = COLORS.COVERED;
		ctx.fillRect(0, 0, canvas.width, canvas.height);

		if (!currentPlayer) {
			return;
		}

		const centerX = Math.floor(canvas.width / 2);
		const centerY = Math.floor(canvas.height / 2);

		// Calculate visible area bounds - match server viewport calculation
		const tilesX = Math.min(Math.ceil(canvas.width / TILE_SIZE / 2) + 2, 100);
		const tilesY = Math.min(Math.ceil(canvas.height / TILE_SIZE / 2) + 2, 100);

		// Use camera position for smooth movement
		const cameraTileX = Math.floor(cameraX);
		const cameraTileY = Math.floor(cameraY);
		const cameraOffsetX = (cameraX - cameraTileX) * TILE_SIZE;
		const cameraOffsetY = (cameraY - cameraTileY) * TILE_SIZE;

		// Render grid background for empty areas
		for (let x = -tilesX; x <= tilesX; x++) {
			for (let y = -tilesY; y <= tilesY; y++) {
				const screenX = centerX + x * TILE_SIZE - Math.floor(cameraOffsetX);
				const screenY = centerY + y * TILE_SIZE - Math.floor(cameraOffsetY);

				if (screenX >= -TILE_SIZE && screenX < canvas.width &&
					screenY >= -TILE_SIZE && screenY < canvas.height) {

					// Check if we have a tile at this position (fast O(1) lookup)
					const tileX = cameraTileX + x;
					const tileY = cameraTileY + y;
					const hasTile = tileSet.has(`${tileX},${tileY}`);

					if (!hasTile) {
						// Render unknown/out-of-bounds tile (never clickable) using spritesheet
						ctx.drawImage(spritesheet, SPRITES.covered.x, SPRITES.covered.y, TILE_SIZE, TILE_SIZE, screenX, screenY, TILE_SIZE, TILE_SIZE);
					}
				}
			}
		}

		// Render actual game tiles (without flags)
		for (const tile of gameState.viewport.tiles) {
			const screenX = centerX + (tile.x - cameraX) * TILE_SIZE;
			const screenY = centerY + (tile.y - cameraY) * TILE_SIZE;

			// Only render tiles that are visible on screen
			if (screenX >= -TILE_SIZE && screenX < canvas.width &&
				screenY >= -TILE_SIZE && screenY < canvas.height) {
				renderTileWithoutFlagCached(tile, screenX, screenY, spawnSet);
			}
		}

		// Render players on top of tiles (skip disconnected players)
		for (const player of gameState.viewport.players) {
			if (!player.connected) {
				continue;
			}

			const screenX = centerX + (player.x - cameraX) * TILE_SIZE;
			const screenY = centerY + (player.y - cameraY) * TILE_SIZE;

			// Only render players that are visible on screen
			if (screenX >= -TILE_SIZE && screenX < canvas.width &&
				screenY >= -TILE_SIZE && screenY < canvas.height) {
				renderPlayer(player, screenX, screenY, player.id === currentPlayer.id);
			}
		}

		// Render flags on top of everything
		for (const tile of gameState.viewport.tiles) {
			if (tile.flagged) {
				const screenX = centerX + (tile.x - cameraX) * TILE_SIZE;
				const screenY = centerY + (tile.y - cameraY) * TILE_SIZE;

				// Only render flags that are visible on screen
				if (screenX >= -TILE_SIZE && screenX < canvas.width &&
					screenY >= -TILE_SIZE && screenY < canvas.height) {
					// Use spritesheet for flags
					const flagSprite = tile.type === 'mine' ? SPRITES.flagGreen : SPRITES.flagRed;
					ctx.drawImage(spritesheet, flagSprite.x, flagSprite.y, TILE_SIZE, TILE_SIZE, screenX, screenY, TILE_SIZE, TILE_SIZE);
				}
			}
		}

		// Render flag token pickup animations
		renderFlagTokenAnimations();

		// UI is now handled by HTML elements in updateUI()
		// Hover rendering moved to separate renderHover() function
	}

	function renderHover() {
		if (!currentPlayer) {
			return;
		}

		const centerX = Math.floor(hoverCanvas.width / 2);
		const centerY = Math.floor(hoverCanvas.height / 2);

		// Calculate hovered tile from current mouse position
		const hoveredTile = getHoveredTile(lastMouseX, lastMouseY);

		// Only redraw hover canvas if hovered tile changed
		if (hoveredTile.x !== lastHoveredTileX || hoveredTile.y !== lastHoveredTileY) {
			// Clear hover canvas
			hoverCtx.clearRect(0, 0, hoverCanvas.width, hoverCanvas.height);

			// Update tracked hover position
			lastHoveredTileX = hoveredTile.x;
			lastHoveredTileY = hoveredTile.y;

			// Render new hover outline if valid tile
			if (hoveredTile.x !== null && hoveredTile.y !== null) {
				const screenX = centerX + (hoveredTile.x - cameraX) * TILE_SIZE;
				const screenY = centerY + (hoveredTile.y - cameraY) * TILE_SIZE;

				// Only render hover outline if tile is visible on screen
				if (screenX >= -TILE_SIZE && screenX < hoverCanvas.width &&
					screenY >= -TILE_SIZE && screenY < hoverCanvas.height) {
					renderHoverOutline(screenX, screenY, hoverCtx);
				}
			}
		}
	}

	function renderTileWithoutFlagCached(tile, x, y, spawnSet) {
		// Check if this is a spawn tile (fast O(1) lookup)
		const isSpawnTile = spawnSet && spawnSet.has(`${tile.x},${tile.y}`);

		// Check if this tile is clickable (adjacent to player)
		const isClickable = currentPlayer &&
			Math.abs(tile.x - currentPlayer.x) <= 1 &&
			Math.abs(tile.y - currentPlayer.y) <= 1 &&
			!(tile.x === currentPlayer.x && tile.y === currentPlayer.y);

		if (tile.revealed) {
			// Use spritesheet for revealed content
			let sprite;
			if (tile.type === 'explosion') {
				sprite = SPRITES.explosion;
			} else if (tile.type === 'mine') {
				sprite = tile.exploded ? SPRITES.mineExploded : SPRITES.mine;
			} else if (tile.type === 'numbered' && tile.number > 0 && SPRITES.numbers[tile.number]) {
				sprite = SPRITES.numbers[tile.number];
			} else if (tile.type === 'flag_token') {
				sprite = SPRITES.flagToken;
			} else {
				// Empty revealed tile
				sprite = SPRITES.revealed;
			}
			ctx.drawImage(spritesheet, sprite.x, sprite.y, TILE_SIZE, TILE_SIZE, x, y, TILE_SIZE, TILE_SIZE);

			// Spawn tile visual effect - overlay the spawn effect from spritesheet
			if (isSpawnTile) {
				ctx.drawImage(spritesheet, SPRITES.spawn.x, SPRITES.spawn.y, TILE_SIZE, TILE_SIZE, x, y, TILE_SIZE, TILE_SIZE);
			}
		} else {
			// Covered tile - use spritesheet versions
			const sprite = isClickable ? SPRITES.coveredClickable : SPRITES.covered;
			ctx.drawImage(spritesheet, sprite.x, sprite.y, TILE_SIZE, TILE_SIZE, x, y, TILE_SIZE, TILE_SIZE);
		}
		// No flag rendering - flags are rendered separately on top
	}

	function renderFlagTokenAnimations() {
		const currentTime = Date.now();

		// Remove expired animations and render active ones
		flagTokenAnimations = flagTokenAnimations.filter(animation => {
			const elapsed = currentTime - animation.startTime;
			if (elapsed >= ANIMATION_DURATION) {
				return false; // Remove expired animation
			}

			// Calculate animation progress (0 to 1)
			const progress = elapsed / ANIMATION_DURATION;
			const easeOut = 1 - Math.pow(1 - progress, 3); // Cubic ease-out

			// Convert world coordinates to screen coordinates
			const screenX = animation.worldX * TILE_SIZE - cameraX + TILE_SIZE / 2;
			const screenY = animation.worldY * TILE_SIZE - cameraY + TILE_SIZE / 2;

			// Calculate position (float up)
			const animY = screenY - (FLOAT_HEIGHT * easeOut);

			// Calculate alpha (fade out)
			const alpha = 1 - progress;

			// Only render if on screen
			if (screenX >= -50 && screenX < canvas.width + 50 &&
				animY >= -50 && animY < canvas.height + 50) {

				ctx.save();
				ctx.globalAlpha = alpha;

				// Render small floating token icon in first half of animation
				if (progress < 0.5) {
					const tokenSize = 20 * (1 - progress * 2); // Shrink from 20px to 0
					const tokenAlpha = 1 - progress * 2; // Fade out faster than text

					ctx.globalAlpha = tokenAlpha;
					ctx.fillStyle = '#ffd700';
					ctx.strokeStyle = '#b8860b';
					ctx.lineWidth = 2;

					// Draw small golden circle
					ctx.beginPath();
					ctx.arc(screenX, animY + 15, tokenSize / 2, 0, 2 * Math.PI);
					ctx.fill();
					ctx.stroke();

					// Small flag icon in the token
					if (tokenSize > 8) {
						const flagSize = tokenSize * 0.4;
						const flagX = screenX - flagSize / 4;
						const flagY = animY + 15;

						ctx.strokeStyle = '#654321';
						ctx.lineWidth = 1;
						ctx.beginPath();
						ctx.moveTo(flagX, flagY - flagSize / 2);
						ctx.lineTo(flagX, flagY + flagSize / 2);
						ctx.stroke();

						ctx.fillStyle = '#ff0000';
						ctx.beginPath();
						ctx.moveTo(flagX, flagY - flagSize / 2);
						ctx.lineTo(flagX + flagSize / 2, flagY - flagSize / 4);
						ctx.lineTo(flagX, flagY);
						ctx.closePath();
						ctx.fill();
					}
				}

				// Render the floating text (appears in second half)
				if (progress > 0.3) {
					const textAlpha = Math.min(1, (progress - 0.3) / 0.2) * alpha;
					ctx.globalAlpha = textAlpha;
					ctx.fillStyle = '#ffd700'; // Gold color
					ctx.strokeStyle = '#000000';
					ctx.lineWidth = 2;
					ctx.font = 'bold 16px Arial';
					ctx.textAlign = 'center';
					ctx.textBaseline = 'middle';

					// Draw text outline
					ctx.strokeText(animation.text, screenX, animY - 10);
					// Draw text fill
					ctx.fillText(animation.text, screenX, animY - 10);
				}

				ctx.restore();
			}

			return true; // Keep active animation
		});
	}

	function renderHoverOutline(x, y, context = ctx) {
		// Bright blue outline for hovered tile
		context.strokeStyle = '#0066ff';
		context.lineWidth = 3;
		context.strokeRect(x, y, TILE_SIZE, TILE_SIZE);
	}

	function renderPlayer(player, x, y, isCurrentPlayer) {
		const centerX = x + Math.floor(TILE_SIZE / 2);
		const centerY = y + Math.floor(TILE_SIZE / 2);
		const radius = Math.floor(TILE_SIZE * 0.35);

		if (!player.alive) {
			// Render skull emoji for dead players (smaller to fit inside tile)
			ctx.font = `${Math.floor(TILE_SIZE * 0.6)}px Arial`;
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText('💀', centerX, centerY);
		} else {
			// Player circle with custom color
			let displayColor = '#0088ff'; // Default blue
			if (isCurrentPlayer) {
				// Convert HSL playerColor to hex for current player
				const hue = parseInt(playerColor) || 200; // Default to blue hue if invalid
				displayColor = `hsl(${hue}, 70%, 50%)`;
			} else if (player.color) {
				// Use other player's color if available
				displayColor = player.color;
			}

			ctx.fillStyle = displayColor;
			ctx.beginPath();
			ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
			ctx.fill();

			// Player border (darker version of player color)
			ctx.strokeStyle = isCurrentPlayer ? '#ff8800' : '#004488';
			ctx.lineWidth = 2;
			ctx.stroke();

			// Player indicator (arrow or dot)
			if (isCurrentPlayer) {
				// Current player gets a small white center dot
				ctx.fillStyle = '#ffffff';
				ctx.beginPath();
				ctx.arc(centerX, centerY, Math.floor(radius * 0.3), 0, 2 * Math.PI);
				ctx.fill();
			}
		}

		// Player name with background
		ctx.font = '12px Arial';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';

		const nameY = y - 12;
		const textWidth = ctx.measureText(player.username).width;

		// Name background (red for dead players)
		ctx.fillStyle = player.alive ? 'rgba(0, 0, 0, 0.7)' : 'rgba(120, 0, 0, 0.7)';
		ctx.fillRect(centerX - Math.floor(textWidth / 2) - 2, nameY - 6, textWidth + 4, 12);

		// Name text (gray for dead players)
		ctx.fillStyle = player.alive ? '#ffffff' : '#cccccc';
		ctx.fillText(player.username, centerX, nameY);
	}

	// Cache rendering functions - these render to offscreen canvases
	function renderCoveredTileToCache(cacheCtx, x, y, isClickable = false) {
		// Main tile color - lighter if clickable
		if (isClickable) {
			cacheCtx.fillStyle = '#d4d4d4'; // Slightly lighter than COLORS.COVERED (#c0c0c0)
		} else {
			cacheCtx.fillStyle = COLORS.COVERED;
		}
		cacheCtx.fillRect(x, y, TILE_SIZE, TILE_SIZE);

		// Classic minesweeper 3D effect
		// Top and left highlights
		cacheCtx.strokeStyle = COLORS.BORDER_LIGHT;
		cacheCtx.lineWidth = 2;
		cacheCtx.beginPath();
		cacheCtx.moveTo(x, y + TILE_SIZE);
		cacheCtx.lineTo(x, y);
		cacheCtx.lineTo(x + TILE_SIZE, y);
		cacheCtx.stroke();

		// Bottom and right shadows
		cacheCtx.strokeStyle = COLORS.BORDER_DARK;
		cacheCtx.lineWidth = 2;
		cacheCtx.beginPath();
		cacheCtx.moveTo(x + TILE_SIZE, y);
		cacheCtx.lineTo(x + TILE_SIZE, y + TILE_SIZE);
		cacheCtx.lineTo(x, y + TILE_SIZE);
		cacheCtx.stroke();

		// Darker inner shadow
		cacheCtx.strokeStyle = COLORS.BORDER_DARKEST;
		cacheCtx.lineWidth = 1;
		cacheCtx.beginPath();
		cacheCtx.moveTo(x + TILE_SIZE - 1, y + 1);
		cacheCtx.lineTo(x + TILE_SIZE - 1, y + TILE_SIZE - 1);
		cacheCtx.lineTo(x + 1, y + TILE_SIZE - 1);
		cacheCtx.stroke();
	}

	function renderRevealedTileToCache(cacheCtx, x, y) {
		cacheCtx.fillStyle = COLORS.REVEALED;
		cacheCtx.fillRect(x, y, TILE_SIZE, TILE_SIZE);

		// Simple border for revealed tiles
		cacheCtx.strokeStyle = COLORS.BORDER_DARK;
		cacheCtx.lineWidth = 1;
		cacheCtx.strokeRect(x, y, TILE_SIZE, TILE_SIZE);
	}

	function renderExplosionTileToCache(cacheCtx, x, y) {
		cacheCtx.fillStyle = COLORS.EXPLOSION;
		cacheCtx.fillRect(x, y, TILE_SIZE, TILE_SIZE);

		// Simple border for explosion tiles
		cacheCtx.strokeStyle = COLORS.BORDER_DARK;
		cacheCtx.lineWidth = 1;
		cacheCtx.strokeRect(x, y, TILE_SIZE, TILE_SIZE);
	}

	function renderNumberTileToCache(cacheCtx, x, y, number) {
		// Start with revealed tile base
		renderRevealedTileToCache(cacheCtx, x, y);

		// Add number
		cacheCtx.fillStyle = COLORS.NUMBERS[number - 1] || '#000000';
		cacheCtx.font = 'bold 24px Arial';
		cacheCtx.textAlign = 'center';
		cacheCtx.textBaseline = 'middle';
		cacheCtx.fillText(number.toString(), x + Math.floor(TILE_SIZE / 2), y + Math.floor(TILE_SIZE / 2));
	}

	function renderMineTileToCache(cacheCtx, x, y, exploded = false) {
		// Start with revealed tile base
		if (exploded) {
			renderExplosionTileToCache(cacheCtx, x, y);
		} else {
			renderRevealedTileToCache(cacheCtx, x, y);
		}

		const centerX = x + Math.floor(TILE_SIZE / 2);
		const centerY = y + Math.floor(TILE_SIZE / 2);
		const radius = Math.floor(TILE_SIZE * 0.25);

		// Mine body (black circle)
		cacheCtx.fillStyle = exploded ? COLORS.MINE : '#000000';
		cacheCtx.beginPath();
		cacheCtx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
		cacheCtx.fill();

		// Mine spikes
		cacheCtx.strokeStyle = exploded ? COLORS.MINE : '#000000';
		cacheCtx.lineWidth = 2;
		const spikeLength = Math.floor(radius * 0.6);

		// 8 spikes around the mine
		for (let i = 0; i < 8; i++) {
			const angle = (i * Math.PI) / 4;
			const startX = Math.floor(centerX + Math.cos(angle) * radius);
			const startY = Math.floor(centerY + Math.sin(angle) * radius);
			const endX = Math.floor(centerX + Math.cos(angle) * (radius + spikeLength));
			const endY = Math.floor(centerY + Math.sin(angle) * (radius + spikeLength));

			cacheCtx.beginPath();
			cacheCtx.moveTo(startX, startY);
			cacheCtx.lineTo(endX, endY);
			cacheCtx.stroke();
		}

		// Highlight on mine
		if (!exploded) {
			cacheCtx.fillStyle = '#ffffff';
			cacheCtx.beginPath();
			cacheCtx.arc(centerX - Math.floor(radius * 0.3), centerY - Math.floor(radius * 0.3), Math.floor(radius * 0.2), 0, 2 * Math.PI);
			cacheCtx.fill();
		}
	}

	function renderFlagToCache(cacheCtx, x, y, isCorrect = false) {
		const flagX = x + Math.floor(TILE_SIZE / 2);
		const flagY = y + Math.floor(TILE_SIZE / 2);
		const flagWidth = Math.floor(TILE_SIZE * 0.4);
		const flagHeight = Math.floor(TILE_SIZE * 0.25);

		// Flag pole
		cacheCtx.strokeStyle = '#654321';
		cacheCtx.lineWidth = 2;
		cacheCtx.beginPath();
		cacheCtx.moveTo(flagX - Math.floor(flagWidth / 2), flagY - flagHeight);
		cacheCtx.lineTo(flagX - Math.floor(flagWidth / 2), flagY + flagHeight);
		cacheCtx.stroke();

		// Flag cloth
		cacheCtx.fillStyle = isCorrect ? '#00aa00' : '#ff0000';
		cacheCtx.beginPath();
		cacheCtx.moveTo(flagX - Math.floor(flagWidth / 2), flagY - flagHeight);
		cacheCtx.lineTo(flagX + Math.floor(flagWidth / 2), flagY - Math.floor(flagHeight / 2));
		cacheCtx.lineTo(flagX - Math.floor(flagWidth / 2), flagY);
		cacheCtx.closePath();
		cacheCtx.fill();

		// Flag outline
		cacheCtx.strokeStyle = '#000000';
		cacheCtx.lineWidth = 1;
		cacheCtx.stroke();
	}

	function renderSpawnEffectToCache(cacheCtx, x, y) {
		const centerX = x + Math.floor(TILE_SIZE / 2);
		const centerY = y + Math.floor(TILE_SIZE / 2);
		const radius = Math.floor(TILE_SIZE * 0.3);

		// Create dotted blue circle
		cacheCtx.strokeStyle = '#0088ff';
		cacheCtx.lineWidth = 2;
		cacheCtx.setLineDash([4, 4]); // Dotted pattern
		cacheCtx.beginPath();
		cacheCtx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
		cacheCtx.stroke();
		cacheCtx.setLineDash([]); // Reset line dash
	}

	function renderFlagTokenToCache(cacheCtx, x, y) {
		const centerX = x + TILE_SIZE / 2;
		const centerY = y + TILE_SIZE / 2;
		const tokenSize = TILE_SIZE * 0.6;

		// Flag token background (golden circle)
		cacheCtx.fillStyle = '#ffd700'; // Gold color
		cacheCtx.beginPath();
		cacheCtx.arc(centerX, centerY, tokenSize / 2, 0, 2 * Math.PI);
		cacheCtx.fill();

		// Border
		cacheCtx.strokeStyle = '#b8860b'; // Dark goldenrod
		cacheCtx.lineWidth = 2;
		cacheCtx.stroke();

		// Small flag icon in center
		const flagSize = tokenSize * 0.4;
		const flagX = centerX - flagSize / 4;
		const flagY = centerY;

		// Flag pole
		cacheCtx.strokeStyle = '#654321';
		cacheCtx.lineWidth = 2;
		cacheCtx.beginPath();
		cacheCtx.moveTo(flagX, flagY - flagSize / 2);
		cacheCtx.lineTo(flagX, flagY + flagSize / 2);
		cacheCtx.stroke();

		// Flag cloth (smaller)
		cacheCtx.fillStyle = '#ff0000';
		cacheCtx.beginPath();
		cacheCtx.moveTo(flagX, flagY - flagSize / 2);
		cacheCtx.lineTo(flagX + flagSize / 2, flagY - flagSize / 4);
		cacheCtx.lineTo(flagX, flagY);
		cacheCtx.closePath();
		cacheCtx.fill();

		// Small flag outline
		cacheCtx.strokeStyle = '#000000';
		cacheCtx.lineWidth = 1;
		cacheCtx.stroke();
	}
</script>

<div class="game-container">
	<canvas id="canvas"></canvas>
	<canvas id="hover-canvas"></canvas>

	<!-- Welcome Screen -->
	<div id="welcome-screen" class="welcome-screen" style:display="{showWelcomeScreen ? 'flex' : 'none'}">
		<div class="welcome-panel">
			<h1>🎮 Mine Land</h1>
			<p>Welcome to Mine Land! Choose your player settings to get started.</p>

			<div class="settings-group">
				<label for="player-name">Player Name:</label>
				<input id="player-name" type="text" bind:value={playerName} placeholder="Enter your name" maxlength="12" />
			</div>

			<div class="settings-group">
				<label for="player-color">Player Color:</label>
				<div class="color-slider-container">
					<input id="player-color" type="range" min="0" max="360" bind:value={playerColor} class="color-slider" />
					<div class="color-preview" style:background-color="hsl({playerColor}, 70%, 50%)"></div>
				</div>
			</div>

			<button class="start-button" on:click={startGame} disabled={!playerName.trim()}>
				Start Playing
			</button>
		</div>
	</div>

	<!-- Death Notification Popup -->
	<div id="death-popup" class="death-popup" style:display="{showDeathPopup ? 'flex' : 'none'}">
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
		width: 40px;
		height: 40px;
		border: 2px inset #c0c0c0;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.start-button {
		width: 100%;
		padding: 12px 24px;
		background: #c0c0c0;
		border: 3px outset #c0c0c0;
		color: #000;
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
</style>
