import { System } from '../ecs/System';
import { GlobalGameState } from '../state/GlobalGameState';
import type { PositionComponent } from '../components/PositionComponent';

/**
 * Camera system that delegates to GlobalGameState for performance.
 * Camera logic is now handled in GlobalGameState.updateCamera() to avoid ECS overhead.
 */
export class CameraSystem extends System {
	private globalState: GlobalGameState;

	constructor(globalState: GlobalGameState) {
		super();
		this.globalState = globalState;
	}

	update(_deltaTime: number): void {
		// Update camera target based on current player position
		this.updateCameraTarget();
		// Camera movement is now handled in GlobalGameState.updateCamera()
	}

	private updateCameraTarget(): void {
		const currentPlayer = this.globalState.getCurrentPlayerEntity();
		if (currentPlayer) {
			const position = currentPlayer.getComponent<PositionComponent>('position');
			if (position) {
				this.globalState.setTargetCameraPosition(position.x, position.y);
			}
		}
	}

	// Delegate methods to global state
	getCameraPosition(): { x: number, y: number } {
		return this.globalState.getCameraPosition();
	}

	setCameraPosition(x: number, y: number): void {
		this.globalState.setCameraPosition(x, y);
		this.globalState.setTargetCameraPosition(x, y);
	}
}
