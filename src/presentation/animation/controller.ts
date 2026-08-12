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
  readonly clipVariants?: Readonly<Record<string, string>>;
  readonly fadeInMs: number;
  readonly fadeOutMs: number;
  readonly timeScale: number;
  readonly loop: "repeat" | "once";
  readonly priority: number;
  readonly sourceProgressRange?: readonly [number, number];
  readonly variantSourceProgressRanges?: Readonly<Record<string, readonly [number, number]>>;
  readonly speedScaleFromInput?: boolean;
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
  readonly variant?: string | null;
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
  readonly activeVariant: string | null;
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
  readonly timeOffsetSeconds?: number;
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
  const actions = new Map<string, THREE.AnimationAction>();
  const actionKey = (state: CharacterAnimationState, variant: string | null) => `${state}:${variant ?? "default"}`;
  if (mixer) {
    for (const [state, definition] of Object.entries(options.animationSet.states) as Array<
      [CharacterAnimationState, AnimationStateDefinition]
    >) {
      const candidates = [
        [null, definition.clip] as const,
        ...Object.entries(definition.clipVariants ?? {}),
      ];
      for (const [variant, clipName] of candidates) {
        if (!clipName) continue;
        const clip = clipByName.get(normalizedName(clipName));
        if (clip) actions.set(actionKey(state, variant), mixer.clipAction(clip));
      }
    }
  }

  let activeState: CharacterAnimationState = "idle";
  let previousState: CharacterAnimationState | null = null;
  let stateAgeSeconds = 0;
  let transitionAgeSeconds = Number.POSITIVE_INFINITY;
  let transitionDurationSeconds = 0;
  let activeAction: THREE.AnimationAction | null = null;
  let activeVariant: string | null = null;
  let disposed = false;

  function activateClip(nextState: CharacterAnimationState, nextVariant: string | null, fadeOutMs = 0): void {
    const definition = options.animationSet.states[nextState];
    const nextAction = actions.get(actionKey(nextState, nextVariant))
      ?? actions.get(actionKey(nextState, null))
      ?? null;
    if (activeAction && activeAction !== nextAction) {
      activeAction.fadeOut(fadeOutMs / 1000);
    }
    if (nextAction && nextAction !== activeAction) {
      nextAction.enabled = true;
      nextAction.reset();
      nextAction.time = THREE.MathUtils.euclideanModulo(
        options.timeOffsetSeconds ?? 0,
        Math.max(0.0001, nextAction.getClip().duration),
      );
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

  function transitionTo(nextState: CharacterAnimationState, nextVariant: string | null): void {
    if (nextState === activeState && nextVariant === activeVariant) return;
    const currentPriority = options.animationSet.states[activeState].priority;
    const nextPriority = options.animationSet.states[nextState].priority;
    if (activeState === "death" && nextState !== "death") return;
    if (activeState === "hit" && stateAgeSeconds < 0.06 && nextPriority < currentPriority) return;
    previousState = activeState;
    const previousDefinition = options.animationSet.states[activeState];
    const nextDefinition = options.animationSet.states[nextState];
    activeState = nextState;
    activeVariant = nextVariant;
    stateAgeSeconds = 0;
    transitionAgeSeconds = 0;
    transitionDurationSeconds = Math.max(previousDefinition.fadeOutMs, nextDefinition.fadeInMs) / 1000;
    activateClip(nextState, nextVariant, previousDefinition.fadeOutMs);
  }

  activateClip(activeState, activeVariant);

  return {
    update(input) {
      if (disposed) throw new Error("CharacterAnimationController is disposed.");
      transitionTo(input.state, input.variant ?? null);
      const dt = Math.max(0, input.deltaSeconds);
      stateAgeSeconds += dt;
      transitionAgeSeconds += dt;
      if (activeAction && options.animationSet.states[activeState].speedScaleFromInput) {
        const speed = THREE.MathUtils.clamp(input.speedNormalized ?? 1, 0.15, 1.5);
        activeAction.setEffectiveTimeScale(options.animationSet.states[activeState].timeScale * speed);
      }
      mixer?.update(dt);
      const stateDefinition = options.animationSet.states[activeState];
      const sourceRange = (activeVariant ? stateDefinition.variantSourceProgressRanges?.[activeVariant] : undefined)
        ?? stateDefinition.sourceProgressRange;
      if (mixer && activeAction && sourceRange && input.sourceProgress !== null && input.sourceProgress !== undefined) {
        const [start, end] = sourceRange;
        const normalized = THREE.MathUtils.clamp((input.sourceProgress - start) / Math.max(0.0001, end - start), 0, 1);
        activeAction.time = activeAction.getClip().duration * normalized;
        activeAction.paused = true;
        mixer.update(0);
      } else if (activeAction) {
        activeAction.paused = false;
      }
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
      activeVariant = null;
      previousState = null;
      stateAgeSeconds = 0;
      transitionAgeSeconds = Number.POSITIVE_INFINITY;
      transitionDurationSeconds = 0;
      activeAction = null;
      activateClip(activeState, activeVariant);
    },
    snapshot() {
      return {
        state: activeState,
        previousState,
        stateAgeSeconds,
        transitionProgress: transitionDurationSeconds <= 0
          ? 1
          : THREE.MathUtils.clamp(transitionAgeSeconds / transitionDurationSeconds, 0, 1),
        activeClip: activeAction?.getClip().name ?? null,
        activeVariant,
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
