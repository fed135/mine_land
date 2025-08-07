<script>
	import { onMount } from 'svelte';
	import { connect, routines } from 'kalm';
	import ws from '@kalm/ws';

	// Game constants
	const TILE_SIZE = 40;
	const SERVER_URL = 'ws://localhost:8080';

	// Game state
	let canvas = $state();
	let ctx = $state();
	let client = $state();
	let connected = $state(false);
	let gameState = $state({
		player: null,
		viewport: { tiles: [], players: [] },
		gameInfo: { startTime: 0, ended: false, minesRemaining: 0 }
	});

	// Input handling
	let keys = $state({});
	let lastMoveTime = 0;
	const MOVE_THROTTLE = 200; // ms between moves

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
			};
		}
	});

	function connectToServer() {
		try {
			client = connect({
				port: 8080,
				host: 'localhost',
				transport: ws(),
				routine: routines.tick({ hz: 60 })
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

			// Subscribe to server messages
			client.subscribe('welcome', (data) => {
				gameState.player = data.player;
				gameState.gameInfo = data.gameState;
				gameState.viewport = data.viewport;
			});

			client.subscribe('viewport-update', (data) => {
				gameState.viewport = data;
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
		} catch (error) {
			console.error('Failed to connect to server:', error);
		}
	}

	function sendPlayerAction(action, x, y) {
		if (client && connected) {
			client.write('player-action', { action, x, y });
		}
	}

	function setupEventListeners() {
		window.addEventListener('resize', resizeCanvas);
		window.addEventListener('keydown', handleKeyDown);
		window.addEventListener('keyup', handleKeyUp);
		canvas.addEventListener('click', handleCanvasClick);
		canvas.addEventListener('contextmenu', handleCanvasRightClick);
	}

	function handleKeyDown(event) {
		keys[event.code] = true;
		
		// Throttle movement
		const now = Date.now();
		if (now - lastMoveTime < MOVE_THROTTLE) return;
		
		if (!gameState.player || !gameState.player.alive) return;
		
		let newX = gameState.player.x;
		let newY = gameState.player.y;
		
		if (keys['KeyW'] || keys['ArrowUp']) newY -= 1;
		if (keys['KeyS'] || keys['ArrowDown']) newY += 1;
		if (keys['KeyA'] || keys['ArrowLeft']) newX -= 1;
		if (keys['KeyD'] || keys['ArrowRight']) newX += 1;
		
		if (newX !== gameState.player.x || newY !== gameState.player.y) {
			sendPlayerAction('move', newX, newY);
			lastMoveTime = now;
		}
	}

	function handleKeyUp(event) {
		keys[event.code] = false;
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

	function handleExplosion(explosionData) {
		// Visual explosion effect
		console.log('Explosion at', explosionData.x, explosionData.y);
		// Update affected tiles
		for (const affectedTile of explosionData.affectedTiles) {
			const tile = gameState.viewport.tiles.find(t => t.x === affectedTile.x && t.y === affectedTile.y);
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
		function render() {
			if (ctx && canvas) {
				renderGame();
			}
			requestAnimationFrame(render);
		}
		render();
	}

	function renderGame() {
		// Clear canvas
		ctx.fillStyle = '#2a2a2a';
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		
		if (!gameState.player) {
			// Show connection status
			ctx.fillStyle = connected ? '#00ff00' : '#ff0000';
			ctx.font = '24px Arial';
			ctx.textAlign = 'center';
			ctx.fillText(connected ? 'Connected to Mine Land' : 'Connecting...', canvas.width / 2, canvas.height / 2);
			return;
		}
		
		const centerX = canvas.width / 2;
		const centerY = canvas.height / 2;
		
		// Render tiles
		for (const tile of gameState.viewport.tiles) {
			const screenX = centerX + (tile.x - gameState.player.x) * TILE_SIZE;
			const screenY = centerY + (tile.y - gameState.player.y) * TILE_SIZE;
			
			renderTile(tile, screenX, screenY);
		}
		
		// Render players
		for (const player of gameState.viewport.players) {
			const screenX = centerX + (player.x - gameState.player.x) * TILE_SIZE;
			const screenY = centerY + (player.y - gameState.player.y) * TILE_SIZE;
			
			renderPlayer(player, screenX, screenY, player.id === gameState.player.id);
		}
		
		// Render UI
		renderUI();
	}

	function renderTile(tile, x, y) {
		// Tile background
		if (tile.revealed) {
			if (tile.type === 'mine') {
				ctx.fillStyle = '#ff4444';
			} else if (tile.type === 'explosion') {
				ctx.fillStyle = '#ff8800';
			} else if (tile.type === 'numbered') {
				ctx.fillStyle = '#dddddd';
			} else {
				ctx.fillStyle = '#ffffff';
			}
		} else {
			ctx.fillStyle = '#666666';
		}
		
		ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
		
		// Tile border
		ctx.strokeStyle = '#333333';
		ctx.lineWidth = 1;
		ctx.strokeRect(x, y, TILE_SIZE, TILE_SIZE);
		
		// Tile content
		ctx.fillStyle = '#000000';
		ctx.font = '16px Arial';
		ctx.textAlign = 'center';
		
		if (tile.flagged) {
			ctx.fillStyle = tile.type === 'mine' ? '#00ff00' : '#ff0000';
			ctx.fillText('🚩', x + TILE_SIZE / 2, y + TILE_SIZE / 2 + 6);
		} else if (tile.revealed) {
			if (tile.type === 'mine') {
				ctx.fillText('💣', x + TILE_SIZE / 2, y + TILE_SIZE / 2 + 6);
			} else if (tile.type === 'numbered' && tile.number > 0) {
				ctx.fillStyle = getNumberColor(tile.number);
				ctx.fillText(tile.number.toString(), x + TILE_SIZE / 2, y + TILE_SIZE / 2 + 6);
			}
		}
	}

	function renderPlayer(player, x, y, isCurrentPlayer) {
		const size = TILE_SIZE * 0.6;
		const offsetX = (TILE_SIZE - size) / 2;
		const offsetY = (TILE_SIZE - size) / 2;
		
		ctx.fillStyle = isCurrentPlayer ? '#00ff00' : '#0088ff';
		ctx.fillRect(x + offsetX, y + offsetY, size, size);
		
		// Player name
		ctx.fillStyle = '#ffffff';
		ctx.font = '12px Arial';
		ctx.textAlign = 'center';
		ctx.fillText(player.username, x + TILE_SIZE / 2, y - 5);
	}

	function renderUI() {
		// Game info panel
		const padding = 20;
		const panelHeight = 100;
		
		ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
		ctx.fillRect(0, 0, canvas.width, panelHeight);
		
		ctx.fillStyle = '#ffffff';
		ctx.font = '18px Arial';
		ctx.textAlign = 'left';
		
		if (gameState.player) {
			const elapsedTime = Math.floor((Date.now() - gameState.gameInfo.startTime) / 1000);
			ctx.fillText(`Score: ${gameState.player.score}`, padding, 30);
			ctx.fillText(`Flags: ${gameState.player.flags}`, padding, 55);
			ctx.fillText(`Time: ${elapsedTime}s`, padding, 80);
			
			ctx.textAlign = 'right';
			ctx.fillText(`Mines Remaining: ${gameState.gameInfo.minesRemaining}`, canvas.width - padding, 30);
			ctx.fillText(`Status: ${gameState.player.alive ? 'Alive' : 'Dead'}`, canvas.width - padding, 55);
		}
		
		// Instructions
		ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
		ctx.fillRect(0, canvas.height - 80, canvas.width, 80);
		
		ctx.fillStyle = '#ffffff';
		ctx.font = '14px Arial';
		ctx.textAlign = 'center';
		ctx.fillText('WASD/Arrow Keys: Move | Left Click: Flip Tile | Right Click: Flag/Unflag', canvas.width / 2, canvas.height - 45);
		ctx.fillText('Find and flag all mines to win!', canvas.width / 2, canvas.height - 20);
	}

	function getNumberColor(number) {
		const colors = ['#0000ff', '#008000', '#ff0000', '#000080', '#800000', '#008080', '#000000', '#808080'];
		return colors[number - 1] || '#000000';
	}
</script>

<canvas bind:this={canvas}></canvas>

<style>
	canvas {
		display: block;
		width: 100vw;
		height: 100vh;
		margin: 0;
		padding: 0;
		border: none;
		outline: none;
	}
</style>
