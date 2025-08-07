<script>
	import { onMount } from 'svelte';
	import { connect, routines } from 'kalm';
	import ws from '@kalm/ws';

	let fps = 0;
	let net = 0;
	let renderCats = {};

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
	let gameState = {
		player: null,
		viewport: { tiles: [], players: [] },
		gameInfo: { startTime: 0, ended: false, minesRemaining: 0 },
		spawnPoints: [],
		allPlayers: []
	};

	// Input handling
	let pressedKeys = new Set();
	let lastMouseX = 0;
	let lastMouseY = 0;
	

	onMount(() => {
		if (canvas) {
			ctx = canvas.getContext('2d');
			resizeCanvas();
			connectToServer();
			setupEventListeners();
			startRenderLoop();
			
			return () => {
				if (client) client.disconnect();
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
			
			client.on('connect', () => {
				connected = true;
				console.log('Connected to Mine Land server');
			});
			
			client.on('disconnect', () => {
				connected = false;
				console.log('Disconnected from server');
				// Attempt reconnection after 2 seconds
				setTimeout(connectToServer, 2000);
			});
			
			client.on('error', (error) => {
				console.error('Kalm client error:', error);
			});

			client.on('frame', (body) => {
				console.log(body);
				net++;
			});

			// Subscribe to server messages
			client.subscribe('welcome', (data) => {
				gameState.player = data.player;
				gameState.gameInfo = data.gameState;
				gameState.viewport = data.viewport;
				gameState.spawnPoints = data.spawnPoints || [];
				gameState.allPlayers = data.viewport.players || [];
			});

			client.subscribe('viewport-update', (data) => {
				gameState.viewport = data;
				// Update our player position from the viewport data
				const ourPlayer = data.players.find(p => p.id === gameState.player?.id);
				if (ourPlayer && gameState.player) {
					gameState.player.x = ourPlayer.x;
					gameState.player.y = ourPlayer.y;
				}
			});

			client.subscribe('player-update', (data) => {
				// Update other players in viewport
				const updatedPlayer = data.player;
				gameState.viewport.players = gameState.viewport.players.map(p => 
					p.id === updatedPlayer.id ? updatedPlayer : p
				);
			});

			client.subscribe('player-joined', (data) => {
				if (!gameState.viewport.players.find(p => p.id === data.player.id)) {
					gameState.viewport.players.push(data.player);
				}
			});

			client.subscribe('explosion', (data) => {
				handleExplosion(data);
			});

			client.subscribe('game-end', (data) => {
				gameState.gameInfo.ended = true;
				alert('Game Over! Final Leaderboard: ' + 
					data.leaderboard.map((p, i) => `${i + 1}. ${p.username}: ${p.score}`).join('\n'));
			});

			client.subscribe('player-disconnected', (data) => {
				gameState.viewport.players = gameState.viewport.players.filter(p => p.id !== data.playerId);
			});

			client.subscribe('leaderboard-update', (data) => {
				gameState.allPlayers = data.players;
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
		if (pressedKeys.has(event.code)) return;
		pressedKeys.add(event.code);
		
		if (!gameState.player || !gameState.player.alive) return;
		
		let newX = gameState.player.x;
		let newY = gameState.player.y;
		
		// Only process the specific key that was pressed
		if (event.code === 'KeyW' || event.code === 'ArrowUp') newY -= 1;
		if (event.code === 'KeyS' || event.code === 'ArrowDown') newY += 1;
		if (event.code === 'KeyA' || event.code === 'ArrowLeft') newX -= 1;
		if (event.code === 'KeyD' || event.code === 'ArrowRight') newX += 1;
		
		if (newX !== gameState.player.x || newY !== gameState.player.y) {
			sendPlayerAction('move', newX, newY);
		}
	}

	function handleKeyUp(event) {
		pressedKeys.delete(event.code);
	}
	
	function handleMouseMove(event) {
		// Just store raw mouse coordinates, calculate tile in render loop
		const rect = canvas.getBoundingClientRect();
		lastMouseX = event.clientX - rect.left;
		lastMouseY = event.clientY - rect.top;
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
		if (!gameState.player) return { x: null, y: null };
		
		const rect = canvas.getBoundingClientRect();
		const clickX = event.clientX - rect.left;
		const clickY = event.clientY - rect.top;
		
		const centerX = canvas.width / 2;
		const centerY = canvas.height / 2;
		
		const tileX = Math.floor((clickX - centerX) / TILE_SIZE + gameState.player.x);
		const tileY = Math.floor((clickY - centerY) / TILE_SIZE + gameState.player.y);
		
		return { x: tileX, y: tileY };
	}
	
	function getHoveredTile(mouseX, mouseY) {
		if (!gameState.player) return { x: null, y: null };
		
		const centerX = canvas.width / 2;
		const centerY = canvas.height / 2;
		
		const tileX = Math.floor((mouseX - centerX) / TILE_SIZE + gameState.player.x);
		const tileY = Math.floor((mouseY - centerY) / TILE_SIZE + gameState.player.y);
		
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

	function resizeCanvas() {
		if (canvas) {
			canvas.width = window.innerWidth;
			canvas.height = window.innerHeight;
		}
	}

	function startRenderLoop() {
		setInterval(calcFPS, 1000);
		function render() {
			if (ctx && canvas) {
				renderGame();
			}
			requestAnimationFrame(render);
		}
		render();
	}

	function calcFPS() {
		console.log('FPS: ', fps, 'NET:', net);
		fps = 0;
		net = 0;
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
		
		if (!gameState.player) {
			// Show connection status with minesweeper styling
			const statusText = connected ? 'Connected to Mine Land' : 'Connecting...';
			
			// Background panel
			const panelWidth = 400;
			const panelHeight = 80;
			const panelX = (canvas.width - panelWidth) / 2;
			const panelY = (canvas.height - panelHeight) / 2;
			
			// Panel background
			ctx.fillStyle = COLORS.COVERED;
			ctx.fillRect(panelX, panelY, panelWidth, panelHeight);
			
			// Panel borders (3D effect)
			ctx.strokeStyle = COLORS.BORDER_DARK;
			ctx.lineWidth = 2;
			ctx.strokeRect(panelX, panelY, panelWidth, panelHeight);
			
			// Status text
			ctx.fillStyle = connected ? '#008000' : '#800000';
			ctx.font = 'bold 24px Arial';
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText(statusText, canvas.width / 2, canvas.height / 2);
			return;
		}
		
		const centerX = canvas.width / 2;
		const centerY = canvas.height / 2;
		
		// Calculate visible area bounds - match server viewport calculation
		const tilesX = Math.min(Math.ceil(canvas.width / TILE_SIZE / 2) + 2, 100);
		const tilesY = Math.min(Math.ceil(canvas.height / TILE_SIZE / 2) + 2, 100);
		
		// Render grid background for empty areas
		for (let x = -tilesX; x <= tilesX; x++) {
			for (let y = -tilesY; y <= tilesY; y++) {
				const screenX = centerX + x * TILE_SIZE;
				const screenY = centerY + y * TILE_SIZE;
				
				if (screenX >= -TILE_SIZE && screenX < canvas.width && 
					screenY >= -TILE_SIZE && screenY < canvas.height) {
					
					// Check if we have a tile at this position (fast O(1) lookup)
					const tileX = gameState.player.x + x;
					const tileY = gameState.player.y + y;
					const hasTile = tileSet.has(`${tileX},${tileY}`);
					
					if (!hasTile) {
						// Render unknown/out-of-bounds tile (never clickable)
						renderCoveredTile(screenX, screenY, false);
					}
				}
			}
		}
		
		// Render actual game tiles (without flags)
		for (const tile of gameState.viewport.tiles) {
			const screenX = centerX + (tile.x - gameState.player.x) * TILE_SIZE;
			const screenY = centerY + (tile.y - gameState.player.y) * TILE_SIZE;
			
			// Only render tiles that are visible on screen
			if (screenX >= -TILE_SIZE && screenX < canvas.width && 
				screenY >= -TILE_SIZE && screenY < canvas.height) {
				renderTileWithoutFlag(tile, screenX, screenY, spawnSet);
			}
		}
		
		// Render players on top of tiles
		for (const player of gameState.viewport.players) {
			const screenX = centerX + (player.x - gameState.player.x) * TILE_SIZE;
			const screenY = centerY + (player.y - gameState.player.y) * TILE_SIZE;
			
			// Only render players that are visible on screen
			if (screenX >= -TILE_SIZE && screenX < canvas.width && 
				screenY >= -TILE_SIZE && screenY < canvas.height) {
				renderPlayer(player, screenX, screenY, player.id === gameState.player.id);
			}
		}
		
		// Render flags on top of everything
		for (const tile of gameState.viewport.tiles) {
			if (tile.flagged) {
				const screenX = centerX + (tile.x - gameState.player.x) * TILE_SIZE;
				const screenY = centerY + (tile.y - gameState.player.y) * TILE_SIZE;
				
				// Only render flags that are visible on screen
				if (screenX >= -TILE_SIZE && screenX < canvas.width && 
					screenY >= -TILE_SIZE && screenY < canvas.height) {
					renderFlag(screenX, screenY, tile.type === 'mine');
				}
			}
		}
		
		// Calculate and render hover outline on top of everything (integrated in render loop)
		const hoveredTile = getHoveredTile(lastMouseX, lastMouseY);
		if (hoveredTile.x !== null && hoveredTile.y !== null && gameState.player) {
			const screenX = centerX + (hoveredTile.x - gameState.player.x) * TILE_SIZE;
			const screenY = centerY + (hoveredTile.y - gameState.player.y) * TILE_SIZE;
			
			// Only render hover outline if tile is visible on screen
			if (screenX >= -TILE_SIZE && screenX < canvas.width && 
				screenY >= -TILE_SIZE && screenY < canvas.height) {
				renderHoverOutline(screenX, screenY);
			}
		}
		
		// Render UI
		renderUI();
	}

	function renderTile(tile, x, y) {
		// Check if this is a spawn tile
		const isSpawnTile = gameState.spawnPoints.some(sp => sp.x === tile.x && sp.y === tile.y);
		
		if (tile.revealed) {
			// Revealed tile - flat appearance like original minesweeper
			if (tile.type === 'explosion') {
				ctx.fillStyle = COLORS.EXPLOSION;
			} else {
				ctx.fillStyle = COLORS.REVEALED;
			}
			ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
			
			// Simple border for revealed tiles
			ctx.strokeStyle = COLORS.BORDER_DARK;
			ctx.lineWidth = 1;
			ctx.strokeRect(x, y, TILE_SIZE, TILE_SIZE);
			
			// Content for revealed tiles
			if (tile.type === 'mine') {
				renderMine(x, y, tile.exploded);
			} else if (tile.type === 'numbered' && tile.number > 0) {
				renderNumber(x, y, tile.number);
			}
			
			// Spawn tile visual effect - dotted blue circle
			if (isSpawnTile) {
				renderSpawnEffect(x, y);
			}
		} else {
			// Covered tile - classic 3D raised appearance
			renderCoveredTile(x, y);
		}
		
		// Flag overlay (can be on covered or revealed tiles)
		if (tile.flagged) {
			renderFlag(x, y, tile.type === 'mine');
		}
	}
	
	function renderTileWithoutFlag(tile, x, y, spawnSet) {
		// Check if this is a spawn tile (fast O(1) lookup)
		const isSpawnTile = spawnSet && spawnSet.has(`${tile.x},${tile.y}`);
		
		// Check if this tile is clickable (adjacent to player)
		const isClickable = gameState.player && 
			Math.abs(tile.x - gameState.player.x) <= 1 && 
			Math.abs(tile.y - gameState.player.y) <= 1 &&
			!(tile.x === gameState.player.x && tile.y === gameState.player.y);
		
		if (tile.revealed) {
			// Revealed tile - flat appearance like original minesweeper
			if (tile.type === 'explosion') {
				ctx.fillStyle = COLORS.EXPLOSION;
			} else {
				ctx.fillStyle = COLORS.REVEALED;
			}
			ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
			
			// Simple border for revealed tiles
			ctx.strokeStyle = COLORS.BORDER_DARK;
			ctx.lineWidth = 1;
			ctx.strokeRect(x, y, TILE_SIZE, TILE_SIZE);
			
			// Content for revealed tiles
			if (tile.type === 'mine') {
				renderMine(x, y, tile.exploded);
			} else if (tile.type === 'numbered' && tile.number > 0) {
				renderNumber(x, y, tile.number);
			}
			
			// Spawn tile visual effect - dotted blue circle
			if (isSpawnTile) {
				renderSpawnEffect(x, y);
			}
		} else {
			// Covered tile - classic 3D raised appearance with clickable highlight
			renderCoveredTile(x, y, isClickable);
		}
		// No flag rendering - flags are rendered separately on top
	}
	
	function renderCoveredTile(x, y, isClickable = false) {
		// Main tile color - lighter if clickable
		if (isClickable) {
			ctx.fillStyle = '#d4d4d4'; // Slightly lighter than COLORS.COVERED (#c0c0c0)
		} else {
			ctx.fillStyle = COLORS.COVERED;
		}
		ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
		
		// Classic minesweeper 3D effect
		// Top and left highlights
		ctx.strokeStyle = COLORS.BORDER_LIGHT;
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.moveTo(x, y + TILE_SIZE);
		ctx.lineTo(x, y);
		ctx.lineTo(x + TILE_SIZE, y);
		ctx.stroke();
		
		// Bottom and right shadows
		ctx.strokeStyle = COLORS.BORDER_DARK;
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.moveTo(x + TILE_SIZE, y);
		ctx.lineTo(x + TILE_SIZE, y + TILE_SIZE);
		ctx.lineTo(x, y + TILE_SIZE);
		ctx.stroke();
		
		// Darker inner shadow
		ctx.strokeStyle = COLORS.BORDER_DARKEST;
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.moveTo(x + TILE_SIZE - 1, y + 1);
		ctx.lineTo(x + TILE_SIZE - 1, y + TILE_SIZE - 1);
		ctx.lineTo(x + 1, y + TILE_SIZE - 1);
		ctx.stroke();
	}
	
	function renderMine(x, y, exploded = false) {
		const centerX = x + TILE_SIZE / 2;
		const centerY = y + TILE_SIZE / 2;
		const radius = TILE_SIZE * 0.25;
		
		// Mine body (black circle)
		ctx.fillStyle = exploded ? COLORS.MINE : '#000000';
		ctx.beginPath();
		ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
		ctx.fill();
		
		// Mine spikes
		ctx.strokeStyle = exploded ? COLORS.MINE : '#000000';
		ctx.lineWidth = 2;
		const spikeLength = radius * 0.6;
		
		// 8 spikes around the mine
		for (let i = 0; i < 8; i++) {
			const angle = (i * Math.PI) / 4;
			const startX = centerX + Math.cos(angle) * radius;
			const startY = centerY + Math.sin(angle) * radius;
			const endX = centerX + Math.cos(angle) * (radius + spikeLength);
			const endY = centerY + Math.sin(angle) * (radius + spikeLength);
			
			ctx.beginPath();
			ctx.moveTo(startX, startY);
			ctx.lineTo(endX, endY);
			ctx.stroke();
		}
		
		// Highlight on mine
		if (!exploded) {
			ctx.fillStyle = '#ffffff';
			ctx.beginPath();
			ctx.arc(centerX - radius * 0.3, centerY - radius * 0.3, radius * 0.2, 0, 2 * Math.PI);
			ctx.fill();
		}
	}
	
	function renderNumber(x, y, number) {
		ctx.fillStyle = COLORS.NUMBERS[number - 1] || '#000000';
		ctx.font = 'bold 24px Arial';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText(number.toString(), x + TILE_SIZE / 2, y + TILE_SIZE / 2);
	}
	
	function renderFlag(x, y, isCorrect = false) {
		const flagX = x + TILE_SIZE / 2;
		const flagY = y + TILE_SIZE / 2;
		const flagWidth = TILE_SIZE * 0.4;
		const flagHeight = TILE_SIZE * 0.25;
		
		// Flag pole
		ctx.strokeStyle = '#654321';
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.moveTo(flagX - flagWidth / 2, flagY - flagHeight);
		ctx.lineTo(flagX - flagWidth / 2, flagY + flagHeight);
		ctx.stroke();
		
		// Flag cloth
		ctx.fillStyle = isCorrect ? '#00aa00' : '#ff0000';
		ctx.beginPath();
		ctx.moveTo(flagX - flagWidth / 2, flagY - flagHeight);
		ctx.lineTo(flagX + flagWidth / 2, flagY - flagHeight / 2);
		ctx.lineTo(flagX - flagWidth / 2, flagY);
		ctx.closePath();
		ctx.fill();
		
		// Flag outline
		ctx.strokeStyle = '#000000';
		ctx.lineWidth = 1;
		ctx.stroke();
	}
	
	function renderSpawnEffect(x, y) {
		const centerX = x + TILE_SIZE / 2;
		const centerY = y + TILE_SIZE / 2;
		const radius = TILE_SIZE * 0.3;
		
		// Create dotted blue circle
		ctx.strokeStyle = '#0088ff';
		ctx.lineWidth = 2;
		ctx.setLineDash([4, 4]); // Dotted pattern
		ctx.beginPath();
		ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
		ctx.stroke();
		ctx.setLineDash([]); // Reset line dash
	}
	
	function renderHoverOutline(x, y) {
		// Bright blue outline for hovered tile
		ctx.strokeStyle = '#0066ff';
		ctx.lineWidth = 3;
		ctx.strokeRect(x, y, TILE_SIZE, TILE_SIZE);
	}

	function renderPlayer(player, x, y, isCurrentPlayer) {
		const centerX = x + TILE_SIZE / 2;
		const centerY = y + TILE_SIZE / 2;
		const radius = TILE_SIZE * 0.35;
		
		// Player circle with border
		ctx.fillStyle = isCurrentPlayer ? '#ffff00' : '#0088ff';
		ctx.beginPath();
		ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
		ctx.fill();
		
		// Player border
		ctx.strokeStyle = isCurrentPlayer ? '#ff8800' : '#004488';
		ctx.lineWidth = 2;
		ctx.stroke();
		
		// Player indicator (arrow or dot)
		if (isCurrentPlayer) {
			// Current player gets a small white center dot
			ctx.fillStyle = '#ffffff';
			ctx.beginPath();
			ctx.arc(centerX, centerY, radius * 0.3, 0, 2 * Math.PI);
			ctx.fill();
		}
		
		// Player name with background
		ctx.font = '12px Arial';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		
		const nameY = y - 12;
		const textWidth = ctx.measureText(player.username).width;
		
		// Name background
		ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
		ctx.fillRect(centerX - textWidth / 2 - 2, nameY - 6, textWidth + 4, 12);
		
		// Name text
		ctx.fillStyle = '#ffffff';
		ctx.fillText(player.username, centerX, nameY);
	}

	function renderUI() {
		// Top game info panel with minesweeper style
		const padding = 20;
		const panelHeight = 90;
		
		// Panel background with 3D border
		ctx.fillStyle = COLORS.COVERED;
		ctx.fillRect(0, 0, canvas.width, panelHeight);
		
		// 3D panel border
		ctx.strokeStyle = COLORS.BORDER_DARK;
		ctx.lineWidth = 2;
		ctx.strokeRect(0, 0, canvas.width, panelHeight);
		
		// Inner highlight
		ctx.strokeStyle = COLORS.BORDER_LIGHT;
		ctx.lineWidth = 1;
		ctx.strokeRect(2, 2, canvas.width - 4, panelHeight - 4);
		
		if (gameState.player) {
			ctx.fillStyle = '#000000';
			ctx.font = 'bold 16px Arial';
			ctx.textAlign = 'left';
			
			const elapsedTime = Math.floor((Date.now() - gameState.gameInfo.startTime) / 1000);
			
			// Left side info
			ctx.fillText(`Score: ${gameState.player.score}`, padding, 28);
			ctx.fillText(`Flags: ${gameState.player.flags}`, padding, 50);
			ctx.fillText(`Position: (${gameState.player.x}, ${gameState.player.y})`, padding, 72);
			
			// Center - 7-segment style timer
			render7SegmentTimer(elapsedTime, canvas.width / 2, 45);
			
			// Right side info
			ctx.textAlign = 'right';
			ctx.fillText(`Mines: ${gameState.gameInfo.minesRemaining}`, canvas.width - padding, 28);
			
			const statusColor = gameState.player.alive ? '#008000' : '#ff0000';
			ctx.fillStyle = statusColor;
			ctx.fillText(`${gameState.player.alive ? 'ALIVE' : 'DEAD'}`, canvas.width - padding, 50);
		}
		
		// Bottom instruction panel
		const bottomPanelHeight = 70;
		const bottomPanelY = canvas.height - bottomPanelHeight;
		
		// Panel background
		ctx.fillStyle = COLORS.COVERED;
		ctx.fillRect(0, bottomPanelY, canvas.width, bottomPanelHeight);
		
		// Panel border
		ctx.strokeStyle = COLORS.BORDER_DARK;
		ctx.lineWidth = 2;
		ctx.strokeRect(0, bottomPanelY, canvas.width, bottomPanelHeight);
		
		// Instructions
		ctx.fillStyle = '#000000';
		ctx.font = 'bold 12px Arial';
		ctx.textAlign = 'center';
		ctx.fillText('WASD/Arrow Keys: Move | Left Click: Flip Tile | Right Click: Flag/Unflag', canvas.width / 2, bottomPanelY + 25);
		ctx.fillText('Find and flag all mines to win! Yellow player is you.', canvas.width / 2, bottomPanelY + 45);
	}
	
	function render7SegmentTimer(seconds, centerX, centerY) {
		// Convert seconds to MM:SS format
		const minutes = Math.floor(seconds / 60);
		const secs = seconds % 60;
		const timeString = `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
		
		// 7-segment display dimensions
		const digitWidth = 20;
		const digitHeight = 30;
		const segmentThickness = 4;
		const digitSpacing = 5;
		const colonWidth = 8;
		const padding = 8;
		
		// Calculate total width for centering
		const totalWidth = (digitWidth * 4) + (digitSpacing * 3) + colonWidth;
		let currentX = centerX - totalWidth / 2;
		
		// Draw dark grey background box
		const boxWidth = totalWidth + (padding * 2);
		const boxHeight = digitHeight + (padding * 2);
		const boxX = centerX - boxWidth / 2;
		const boxY = centerY - boxHeight / 2;
		
		ctx.fillStyle = '#404040';
		ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
		
		// Draw inset border
		ctx.strokeStyle = '#202020';
		ctx.lineWidth = 1;
		ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);
		
		// Render each character
		for (let i = 0; i < timeString.length; i++) {
			const char = timeString[i];
			if (char === ':') {
				render7SegmentColon(currentX, centerY);
				currentX += colonWidth + digitSpacing;
			} else {
				render7SegmentDigit(parseInt(char), currentX, centerY, digitWidth, digitHeight, segmentThickness);
				currentX += digitWidth + digitSpacing;
			}
		}
	}
	
	function render7SegmentDigit(digit, x, y, width, height, thickness) {
		// 7-segment patterns for digits 0-9
		const patterns = [
			[1,1,1,1,1,1,0], // 0
			[0,1,1,0,0,0,0], // 1
			[1,1,0,1,1,0,1], // 2
			[1,1,1,1,0,0,1], // 3
			[0,1,1,0,0,1,1], // 4
			[1,0,1,1,0,1,1], // 5
			[1,0,1,1,1,1,1], // 6
			[1,1,1,0,0,0,0], // 7
			[1,1,1,1,1,1,1], // 8
			[1,1,1,1,0,1,1]  // 9
		];
		
		const pattern = patterns[digit] || [0,0,0,0,0,0,0];
		const segments = [
			// [x1, y1, x2, y2] for each segment
			[x, y - height/2, x + width, y - height/2], // top
			[x + width, y - height/2, x + width, y], // top right
			[x + width, y, x + width, y + height/2], // bottom right
			[x, y + height/2, x + width, y + height/2], // bottom
			[x, y, x, y + height/2], // bottom left
			[x, y - height/2, x, y], // top left
			[x, y, x + width, y] // middle
		];
		
		for (let i = 0; i < 7; i++) {
			const [x1, y1, x2, y2] = segments[i];
			
			// Dark grey background for all segments
			ctx.strokeStyle = '#404040';
			ctx.lineWidth = thickness;
			ctx.beginPath();
			ctx.moveTo(x1, y1);
			ctx.lineTo(x2, y2);
			ctx.stroke();
			
			// Red overlay for active segments
			if (pattern[i]) {
				ctx.strokeStyle = '#ff0000';
				ctx.lineWidth = thickness;
				ctx.beginPath();
				ctx.moveTo(x1, y1);
				ctx.lineTo(x2, y2);
				ctx.stroke();
			}
		}
	}
	
	function render7SegmentColon(x, y) {
		// Draw two dots for the colon
		ctx.fillStyle = '#ff0000';
		ctx.beginPath();
		ctx.arc(x + 2, y - 8, 2, 0, 2 * Math.PI);
		ctx.fill();
		ctx.beginPath();
		ctx.arc(x + 2, y + 8, 2, 0, 2 * Math.PI);
		ctx.fill();
	}
</script>

<div class="game-container">
	<canvas bind:this={canvas}></canvas>
	
	<div class="leaderboard">
		<h3>Leaderboard</h3>
		<div class="leaderboard-content">
			{#if gameState.allPlayers.length > 0}
				{@const sortedPlayers = gameState.allPlayers
					.filter(p => p.score > 0)
					.sort((a, b) => b.score - a.score)}
				{#each sortedPlayers.slice(0, 10) as player, index}
					<div class="leaderboard-entry" class:current-player={player.id === gameState.player?.id}>
						<span class="rank">#{index + 1}</span>
						<span class="name">{player.username}</span>
						<span class="score">{player.score}</span>
						{#if !player.alive}
							<span class="status dead">💀</span>
						{/if}
					</div>
				{/each}
				{#if sortedPlayers.length === 0}
					<div class="no-scores">No scores yet</div>
				{/if}
			{:else}
				<div class="loading">Loading...</div>
			{/if}
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
	}
	
	.leaderboard {
		position: absolute;
		top: 20px;
		right: 20px;
		width: 250px;
		background: rgba(192, 192, 192, 0.95);
		border: 2px solid #808080;
		border-radius: 4px;
		font-family: Arial, sans-serif;
		font-size: 14px;
		box-shadow: 2px 2px 8px rgba(0, 0, 0, 0.3);
		z-index: 1000;
	}
	
	.leaderboard h3 {
		margin: 0;
		padding: 10px;
		background: #c0c0c0;
		border-bottom: 1px solid #808080;
		text-align: center;
		font-weight: bold;
		color: #000;
	}
	
	.leaderboard-content {
		padding: 10px;
		max-height: 400px;
		overflow-y: auto;
	}
	
	.leaderboard-entry {
		display: flex;
		align-items: center;
		padding: 6px 8px;
		margin-bottom: 4px;
		background: #ffffff;
		border: 1px solid #c0c0c0;
		border-radius: 2px;
	}
	
	.leaderboard-entry.current-player {
		background: #ffff99;
		border-color: #ffaa00;
		font-weight: bold;
	}
	
	.rank {
		font-weight: bold;
		min-width: 30px;
		color: #0066cc;
	}
	
	.name {
		flex-grow: 1;
		margin-left: 8px;
		color: #000;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	
	.score {
		font-weight: bold;
		color: #008000;
		margin-left: 8px;
	}
	
	.status.dead {
		margin-left: 4px;
		font-size: 12px;
	}
	
	.no-scores, .loading {
		text-align: center;
		color: #666;
		padding: 20px;
		font-style: italic;
	}
</style>
