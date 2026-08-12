import {
  abilityDefinitions,
  type AbilityDefinition,
  type AbilitySlot,
} from "../../content/abilities/definitions";
import { DefinitionRegistry } from "../../content/registry";
import { copyVec2, type Vec2 } from "../../core/math/vec2";
import type { DashRequestResult, GameState } from "../domain/types";
import { executeDashSlash } from "./dash-slash";
import { beginVectorFocus, grantVectorFocusEnergy } from "./vector-focus";

const EPSILON = 1e-8;

export interface AbilityExecutionContext {
  readonly state: GameState;
  readonly definition: AbilityDefinition;
  readonly target: Vec2;
}

export interface AbilityExecution {
  readonly id: string;
  execute(context: AbilityExecutionContext): void | boolean;
}

export interface AbilityCompletionContext {
  readonly state: GameState;
  readonly definition: AbilityDefinition;
  readonly killCount: number;
}

export interface AbilityCompletionExecution {
  readonly id: string;
  execute(context: AbilityCompletionContext): number;
}

export const abilityExecutions = new DefinitionRegistry<AbilityExecution>([
  {
    id: "dash-slash-v1",
    execute({ state, target }) {
      executeDashSlash(state, target);
    },
  },
  {
    id: "vector-focus-v1",
    execute({ state }) {
      return beginVectorFocus(state);
    },
  },
]);

export const abilityCompletionExecutions = new DefinitionRegistry<AbilityCompletionExecution>([
  {
    id: "dash-multikill-focus-charge-v1",
    execute({ state, killCount }) {
      return grantVectorFocusEnergy(state, killCount);
    },
  },
]);

export function activateAbility(
  state: GameState,
  slot: AbilitySlot,
  target?: Vec2,
): DashRequestResult {
  if (state.stage.phase !== "playing" || state.player.hp === 0) return "ignored";
  if (state.player.activeAbility !== null) return "ignored";
  const runtime = state.player.abilities[slot];
  if (!runtime || runtime.cooldownRemainingMs > EPSILON) return "ignored";
  const definition = abilityDefinitions.get(runtime.abilityId);
  if (definition.slot !== slot) return "ignored";
  if (definition.activation === "target-point" && target === undefined) return "ignored";

  const clampedTarget = clampTarget(state, target ?? state.player.position);
  if (state.player.dash === null && state.player.recoveryRemainingMs <= EPSILON) {
    const executed = abilityExecutions.get(definition.executionProfile).execute({
      state,
      definition,
      target: clampedTarget,
    });
    if (executed === false) return "ignored";
    return "started";
  }
  if (definition.activation === "instant") return "ignored";
  state.player.bufferedAbility = { slot, target: clampedTarget };
  return "buffered";
}

export function applyAbilityCompletion(
  state: GameState,
  abilityId: string,
  killCount: number,
): number {
  const definition = abilityDefinitions.get(abilityId);
  if (!definition.completionProfile) return 0;
  return abilityCompletionExecutions.get(definition.completionProfile).execute({
    state,
    definition,
    killCount,
  });
}

function clampTarget(state: GameState, target: Vec2): Vec2 {
  return copyVec2({
    x: Number.isFinite(target.x) ? target.x : state.player.position.x,
    z: Number.isFinite(target.z) ? target.z : state.player.position.z,
  });
}
