import { System } from '../ecs/System';
import { Entity } from '../ecs/Entity';
import { GlobalGameState } from '../state/GlobalGameState';
import type { AnimationComponent } from '../components/AnimationComponent';
import type { RenderComponent } from '../components/RenderComponent';

export class AnimationSystem extends System {
	private globalState: GlobalGameState;

	constructor(globalState: GlobalGameState) {
		super();
		this.globalState = globalState;
	}
	update(deltaTime: number): void {
		const animatedEntities = this.getEntitiesWithComponents('animation');

		for (const entity of animatedEntities) {
			this.updateAnimation(entity, deltaTime);
		}
	}

	private updateAnimation(entity: Entity, deltaTime: number): void {
		const animation = entity.getComponent<AnimationComponent>('animation');
		if (!animation) {
			return;
		}

		if (!animation.playing || animation.frames.length === 0) {
			return;
		}

		animation.elapsed += deltaTime;
		const currentFrame = animation.frames[animation.currentFrame];

		if (animation.elapsed >= currentFrame.duration) {
			animation.elapsed = 0;
			animation.currentFrame++;

			if (animation.currentFrame >= animation.frames.length) {
				if (animation.loop) {
					animation.currentFrame = 0;
				} else {
					animation.playing = false;
					animation.currentFrame = animation.frames.length - 1;
					this.onAnimationComplete(entity);
				}
			}

			this.applyFrameToRender(entity, animation);
			// Mark for redraw when animation frame changes
			this.globalState.markForRedraw();
		}
	}

	private applyFrameToRender(entity: Entity, animation: AnimationComponent): void {
		if (!entity.hasComponent('render')) {
			return;
		}

		const render = entity.getComponent<RenderComponent>('render');
		if (!render) {
			return;
		}
		const frame = animation.frames[animation.currentFrame];

		if (frame.sprite) {
			render.sprite = frame.sprite;
		}
	}

	private onAnimationComplete(_entity: Entity): void {
		// Hook for animation completion events
		// Could emit events or trigger state changes
	}

	playAnimation(entity: Entity): void {
		const animation = entity.getComponent<AnimationComponent>('animation');
		if (animation) {
			animation.playing = true;
			animation.currentFrame = 0;
			animation.elapsed = 0;
		}
	}

	stopAnimation(entity: Entity): void {
		const animation = entity.getComponent<AnimationComponent>('animation');
		if (animation) {
			animation.playing = false;
		}
	}

	resetAnimation(entity: Entity): void {
		const animation = entity.getComponent<AnimationComponent>('animation');
		if (animation) {
			animation.currentFrame = 0;
			animation.elapsed = 0;
			animation.playing = false;
		}
	}
}
