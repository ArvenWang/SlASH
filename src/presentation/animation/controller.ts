import * as THREE from "three";

export type CharacterAnimationState =
  | "idle"
  | "anticipation"
  | "action"
  | "arrival"
  | "recovery"
  | "hit"
  | "death";

export interface AnimationStateDefinition {
  readonly clip: string | null;
  readonly fadeInMs: number;
  readonly fadeOutMs: number;
  readonly timeScale: number;
  readonly loop: "repeat" | "once";
  readonly priority: number;
}

export interface AnimationSetDefinition {
  readonly id: string;
  readonly controllerId: string;
  readonly states: Readonly<Record<CharacterAnimationState, AnimationStateDefinition>>;
}

export interface CharacterAnimationInput {
  readonly state: CharacterAnimationState;
  readonly timeSeconds: number;
  readonly deltaSeconds: number;
  readonly sourceProgress?: number | null;
  readonly turn?: number;
  readonly distanceMoved?: number;
  readonly speedNormalized?: number;
  readonly threat?: number;
  readonly hitAgeSeconds?: number | null;
}

export interface CharacterAnimationFrame extends CharacterAnimationInput {
  readonly activeState: CharacterAnimationState;
  readonly previousState: CharacterAnimationState | null;
  readonly stateAgeSeconds: number;
  readonly transitionProgress: number;
}

export interface ProceduralAnimationDriver {
  update(frame: CharacterAnimationFrame): void;
  reset(): void;
  dispose?(): void;
}

export interface CharacterAnimationSnapshot {
  readonly state: CharacterAnimationState;
  readonly previousState: CharacterAnimationState | null;
  readonly stateAgeSeconds: number;
  readonly transitionProgress: number;
  readonly activeClip: string | null;
  readonly mixerActive: boolean;
}

export interface CharacterAnimationController {
  update(input: CharacterAnimationInput): void;
  reset(state?: CharacterAnimationState): void;
  snapshot(): CharacterAnimationSnapshot;
  dispose(): void;
}

export interface CharacterAnimationControllerOptions {
  readonly root: THREE.Object3D;
  readonly animationSet: AnimationSetDefinition;
  readonly clips?: readonly THREE.AnimationClip[];
  readonly proceduralDriver?: ProceduralAnimationDriver;
  readonly createMixer?: boolean;
}

function normalizedName(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

export function createCharacterAnimationController(
  options: CharacterAnimationControllerOptions,
): CharacterAnimationController {
  const clips = options.clips ?? [];
  const clipByName = new Map(clips.map((clip) => [normalizedName(clip.name), clip]));
  const mixer = options.createMixer || clips.length > 0
    ? new THREE.AnimationMixer(options.root)
    : null;
  const actions = new Map<CharacterAnimationState, THREE.AnimationAction>();
  if (mixer) {
    for (const [state, definition] of Object.entries(options.animationSet.states) as Array<
      [CharacterAnimationState, AnimationStateDefinition]
    >) {
      if (!definition.clip) continue;
      const clip = clipByName.get(normalizedName(definition.clip));
      if (clip) actions.set(state, mixer.clipAction(clip));
    }
  }

  let activeState: CharacterAnimationState = "idle";
  let previousState: CharacterAnimationState | null = null;
  let stateAgeSeconds = 0;
  let transitionAgeSeconds = Number.POSITIVE_INFINITY;
  let transitionDurationSeconds = 0;
  let activeAction: THREE.AnimationAction | null = null;
  let disposed = false;

  function activateClip(nextState: CharacterAnimationState, fadeOutMs = 0): void {
    const definition = options.animationSet.states[nextState];
    const nextAction = actions.get(nextState) ?? null;
    if (activeAction && activeAction !== nextAction) {
      activeAction.fadeOut(fadeOutMs / 1000);
    }
    if (nextAction && nextAction !== activeAction) {
      nextAction.enabled = true;
      nextAction.reset();
      nextAction.setEffectiveTimeScale(definition.timeScale);
      nextAction.setLoop(
        definition.loop === "repeat" ? THREE.LoopRepeat : THREE.LoopOnce,
        definition.loop === "repeat" ? Number.POSITIVE_INFINITY : 1,
      );
      nextAction.clampWhenFinished = definition.loop === "once";
      nextAction.fadeIn(definition.fadeInMs / 1000).play();
    }
    activeAction = nextAction;
  }

  function transitionTo(nextState: CharacterAnimationState): void {
    if (nextState === activeState) return;
    const currentPriority = options.animationSet.states[activeState].priority;
    const nextPriority = options.animationSet.states[nextState].priority;
    if (activeState === "death" && nextState !== "death") return;
    if (activeState === "hit" && stateAgeSeconds < 0.06 && nextPriority < currentPriority) return;
    previousState = activeState;
    const previousDefinition = options.animationSet.states[activeState];
    const nextDefinition = options.animationSet.states[nextState];
    activeState = nextState;
    stateAgeSeconds = 0;
    transitionAgeSeconds = 0;
    transitionDurationSeconds = Math.max(previousDefinition.fadeOutMs, nextDefinition.fadeInMs) / 1000;
    activateClip(nextState, previousDefinition.fadeOutMs);
  }

  activateClip(activeState);

  return {
    update(input) {
      if (disposed) throw new Error("CharacterAnimationController is disposed.");
      transitionTo(input.state);
      const dt = Math.max(0, input.deltaSeconds);
      stateAgeSeconds += dt;
      transitionAgeSeconds += dt;
      mixer?.update(dt);
      options.proceduralDriver?.update({
        ...input,
        activeState,
        previousState,
        stateAgeSeconds,
        transitionProgress: transitionDurationSeconds <= 0
          ? 1
          : THREE.MathUtils.clamp(transitionAgeSeconds / transitionDurationSeconds, 0, 1),
      });
    },
    reset(state = "idle") {
      if (disposed) return;
      mixer?.stopAllAction();
      options.proceduralDriver?.reset();
      activeState = state;
      previousState = null;
      stateAgeSeconds = 0;
      transitionAgeSeconds = Number.POSITIVE_INFINITY;
      transitionDurationSeconds = 0;
      activeAction = null;
      activateClip(activeState);
    },
    snapshot() {
      return {
        state: activeState,
        previousState,
        stateAgeSeconds,
        transitionProgress: transitionDurationSeconds <= 0
          ? 1
          : THREE.MathUtils.clamp(transitionAgeSeconds / transitionDurationSeconds, 0, 1),
        activeClip: options.animationSet.states[activeState].clip,
        mixerActive: mixer !== null,
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      mixer?.stopAllAction();
      mixer?.uncacheRoot(options.root);
      options.proceduralDriver?.dispose?.();
      actions.clear();
    },
  };
}
