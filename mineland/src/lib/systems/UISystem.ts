import { System } from '../ecs/System';
import { GlobalGameState } from '../state/GlobalGameState';

export interface UIElements {
	connectionStatusEl?: HTMLElement;
	connectionTextEl?: HTMLElement;
	playerScoreEl?: HTMLElement;
	playerFlagsEl?: HTMLElement;
	playerPositionEl?: HTMLElement;
	timerDisplayEl?: HTMLElement;
	minesRemainingEl?: HTMLElement;
	playerStatusEl?: HTMLElement;
	leaderboardElement?: HTMLElement;
}

export class UISystem extends System {
	private globalState: GlobalGameState;
	private elements: UIElements = {};
	
	// Cached UI values to detect changes
	private lastUIValues = {
		score: null as number | null,
		flags: null as number | null,
		position: null as string | null,
		mines: null as number | null,
		status: null as string | null,
		timer: null as string | null,
		connected: null as boolean | null
	};

	// UI state
	private currentPlayer: any = null;
	private leaderboardPlayers: any[] = [];
	private lastLeaderboardHash = '';

	constructor(globalState: GlobalGameState) {
		super();
		this.globalState = globalState;
	}

	setElements(elements: UIElements): void {
		this.elements = elements;
	}

	setCurrentPlayer(player: any): void {
		this.currentPlayer = player;
		this.globalState.markForUIUpdate();
	}

	setLeaderboardPlayers(players: any[]): void {
		console.log('UISystem: Setting leaderboard players:', players);
		this.leaderboardPlayers = players;
		this.updateLeaderboard();
	}

	setConnectionStatus(connected: boolean): void {
		this.lastUIValues.connected = connected;
		this.updateConnectionStatus(connected);
	}

	update(_deltaTime: number): void {
		// Always update timer regardless of UI update check
		this.updateTimer();

		if (!this.globalState.needsUIUpdateCheck()) {
			return;
		}

		this.updatePlayerStats();
		this.updateGameInfo();
		this.updatePlayerStatus();

		this.globalState.clearUIUpdateFlag();
	}

	private updatePlayerStats(): void {
		if (!this.currentPlayer) return;

		// Update score
		if (this.elements.playerScoreEl && this.lastUIValues.score !== this.currentPlayer.score) {
			this.elements.playerScoreEl.textContent = this.currentPlayer.score.toString();
			this.lastUIValues.score = this.currentPlayer.score;
		}

		// Update flags
		if (this.elements.playerFlagsEl && this.lastUIValues.flags !== this.currentPlayer.flags) {
			this.elements.playerFlagsEl.textContent = this.currentPlayer.flags.toString();
			this.lastUIValues.flags = this.currentPlayer.flags;
		}

		// Update position
		if (this.elements.playerPositionEl && this.currentPlayer.x !== undefined && this.currentPlayer.y !== undefined) {
			const positionText = `${this.currentPlayer.x}, ${this.currentPlayer.y}`;
			if (this.lastUIValues.position !== positionText) {
				this.elements.playerPositionEl.textContent = positionText;
				this.lastUIValues.position = positionText;
			}
		}
	}

	private updateGameInfo(): void {
		// Update mines remaining
		if (this.elements.minesRemainingEl && this.lastUIValues.mines !== this.globalState.gameInfo.minesRemaining) {
			console.log('Updating mines remaining UI:', this.globalState.gameInfo.minesRemaining);
			this.elements.minesRemainingEl.textContent = this.globalState.gameInfo.minesRemaining.toString();
			this.lastUIValues.mines = this.globalState.gameInfo.minesRemaining;
		}
	}

	private updateTimer(): void {
		if (!this.elements.timerDisplayEl || this.globalState.gameInfo.startTime === 0) {
			return;
		}

		const elapsed = Math.floor((Date.now() - this.globalState.gameInfo.startTime) / 1000);
		const minutes = Math.floor(elapsed / 60);
		const seconds = elapsed % 60;
		const timerText = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

		if (this.lastUIValues.timer !== timerText) {
			this.elements.timerDisplayEl.textContent = timerText;
			this.lastUIValues.timer = timerText;
		}
	}

	private updatePlayerStatus(): void {
		if (!this.elements.playerStatusEl || !this.currentPlayer) {
			return;
		}

		const statusText = this.currentPlayer.alive ? 'Alive' : 'Dead';
		if (this.lastUIValues.status !== statusText) {
			this.elements.playerStatusEl.textContent = statusText;
			this.elements.playerStatusEl.className = this.currentPlayer.alive ? 'alive' : 'dead';
			this.lastUIValues.status = statusText;
		}
	}

	private updateConnectionStatus(connected: boolean): void {
		if (this.elements.connectionStatusEl) {
			this.elements.connectionStatusEl.className = connected ? 'connected' : 'disconnected';
		}

		if (this.elements.connectionTextEl) {
			this.elements.connectionTextEl.textContent = connected ? 'Connected' : 'Disconnected';
		}
	}

	private updateLeaderboard(): void {
		console.log('UISystem: updateLeaderboard called, players:', this.leaderboardPlayers);
		if (!this.elements.leaderboardElement) {
			console.warn('UISystem: leaderboardElement not found');
			return;
		}

		// Create a hash of the leaderboard to detect changes
		const leaderboardHash = this.leaderboardPlayers
			.map(p => `${p.id}-${p.username}-${p.score}-${p.flags}`)
			.join('|');

		if (leaderboardHash === this.lastLeaderboardHash) {
			return; // No changes
		}

		this.lastLeaderboardHash = leaderboardHash;

		if (this.leaderboardPlayers.length === 0) {
			this.elements.leaderboardElement.innerHTML = '<div class="no-scores">No players connected</div>';
			return;
		}

		// Sort players by score descending
		const sortedPlayers = [...this.leaderboardPlayers].sort((a, b) => b.score - a.score);

		let html = '';
		for (let i = 0; i < sortedPlayers.length; i++) {
			const player = sortedPlayers[i];
			const isCurrentPlayer = this.currentPlayer && player.id === this.currentPlayer.id;
			const rank = i + 1;

			html += `
				<div class="leaderboard-entry ${isCurrentPlayer ? 'current-player' : ''}">
					<div class="rank">${rank}</div>
					<div class="name" title="${player.username}">${player.username}</div>
					<div class="score">${player.score}</div>
				</div>
			`;
		}

		this.elements.leaderboardElement.innerHTML = html;
	}

	// Public methods for UI interactions
	showWelcomeScreen(show: boolean, callback?: () => void): void {
		// This would be handled by the parent component's reactive state
		if (callback) callback();
	}

	showDeathPopup(show: boolean, callback?: () => void): void {
		// This would be handled by the parent component's reactive state
		if (callback) callback();
	}

	// Helper methods for performance tracking
	updatePerformanceStats(fps: number, netUp: number, netDown: number): void {
		// Update performance display if elements exist
		const fpsEl = document.getElementById('fps-display');
		const netUpEl = document.getElementById('net-up');
		const netDownEl = document.getElementById('net-down');

		if (fpsEl) fpsEl.textContent = fps.toString();
		if (netUpEl) netUpEl.textContent = netUp.toString();
		if (netDownEl) netDownEl.textContent = netDown.toString();
	}
}