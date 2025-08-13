export interface RenderComponent {
    visible: boolean;
    layer: number;
    color?: string;
    sprite?: string;
    width?: number;
    height?: number;
}

export function createRenderComponent(data: {
    visible?: boolean;
    layer?: number;
    color?: string;
    sprite?: string;
    width?: number;
    height?: number;
}): RenderComponent {
	return {
		visible: data.visible ?? true,
		layer: data.layer || 0,
		color: data.color,
		sprite: data.sprite,
		width: data.width,
		height: data.height
	};
}
