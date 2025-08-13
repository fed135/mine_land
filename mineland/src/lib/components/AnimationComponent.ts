export interface AnimationFrame {
    duration: number;
    sprite?: string;
    offsetX?: number;
    offsetY?: number;
    scale?: number;
    alpha?: number;
}

export interface AnimationComponent {
    frames: AnimationFrame[];
    currentFrame: number;
    elapsed: number;
    loop: boolean;
    playing: boolean;
}

export function createAnimationComponent(data: {
    frames: AnimationFrame[];
    loop?: boolean;
    playing?: boolean;
}): AnimationComponent {
	return {
		frames: data.frames,
		currentFrame: 0,
		elapsed: 0,
		loop: data.loop ?? false,
		playing: data.playing ?? true
	};
}
