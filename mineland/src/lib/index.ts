// Export main game components for use in Svelte components
export { GameManager } from './GameManager';
export { GameStateType, ConnectionState, PlayerState, UIState } from './state/GameState';
export { GlobalGameState } from './state/GlobalGameState';
export { Entity } from './ecs/Entity';
export { EntityManager } from './ecs/EntityManager';
export { System } from './ecs/System';

// Export components
export { createPositionComponent } from './components/PositionComponent';
export { createPlayerComponent } from './components/PlayerComponent';
export { createTileComponent } from './components/TileComponent';
export { createRenderComponent } from './components/RenderComponent';
export { createAnimationComponent } from './components/AnimationComponent';

// Export systems
export { RenderSystem } from './systems/RenderSystem';
export { InputSystem } from './systems/InputSystem';
export { AnimationSystem } from './systems/AnimationSystem';
export { CameraSystem } from './systems/CameraSystem';

// Export state machine
export { StateMachine } from './state/StateMachine';
