export interface StateTransition<T> {
    from: T;
    to: T;
    condition?: () => boolean;
    action?: () => void;
}

export class StateMachine<T> {
	private currentState: T;
	private transitions: Map<T, StateTransition<T>[]> = new Map();
	private stateEnterCallbacks: Map<T, (() => void)[]> = new Map();
	private stateExitCallbacks: Map<T, (() => void)[]> = new Map();

	constructor(initialState: T) {
		this.currentState = initialState;
	}

	addTransition(transition: StateTransition<T>): void {
		if (!this.transitions.has(transition.from)) {
			this.transitions.set(transition.from, []);
		}
		const transitionList = this.transitions.get(transition.from);
		if (transitionList) {
			transitionList.push(transition);
		}
	}

	onStateEnter(state: T, callback: () => void): void {
		if (!this.stateEnterCallbacks.has(state)) {
			this.stateEnterCallbacks.set(state, []);
		}
		const callbacks = this.stateEnterCallbacks.get(state);
		if (callbacks) {
			callbacks.push(callback);
		}
	}

	onStateExit(state: T, callback: () => void): void {
		if (!this.stateExitCallbacks.has(state)) {
			this.stateExitCallbacks.set(state, []);
		}
		const callbacks = this.stateExitCallbacks.get(state);
		if (callbacks) {
			callbacks.push(callback);
		}
	}

	getCurrentState(): T {
		return this.currentState;
	}

	canTransitionTo(targetState: T): boolean {
		const transitions = this.transitions.get(this.currentState) || [];
		return transitions.some(t => t.to === targetState && (!t.condition || t.condition()));
	}

	transitionTo(targetState: T): boolean {
		const transitions = this.transitions.get(this.currentState) || [];
		const validTransition = transitions.find(t => t.to === targetState && (!t.condition || t.condition()));

		if (validTransition) {
			this.executeStateExit(this.currentState);
			this.currentState = targetState;
			validTransition.action?.();
			this.executeStateEnter(targetState);
			return true;
		}

		return false;
	}

	update(): void {
		const transitions = this.transitions.get(this.currentState) || [];
		for (const transition of transitions) {
			if (transition.condition && transition.condition()) {
				this.transitionTo(transition.to);
				break;
			}
		}
	}

	private executeStateEnter(state: T): void {
		const callbacks = this.stateEnterCallbacks.get(state) || [];
		callbacks.forEach(callback => callback());
	}

	private executeStateExit(state: T): void {
		const callbacks = this.stateExitCallbacks.get(state) || [];
		callbacks.forEach(callback => callback());
	}
}
