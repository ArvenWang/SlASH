import {
  abilityDefinitions,
  type AbilityDefinition,
  type AbilitySlot,
} from "../../content/abilities/definitions";
import { DefinitionRegistry } from "../../content/registry";
import { copyVec2, type Vec2 } from "../../core/math/vec2";
import type { DashRequestResult, GameState } from "../domain/types";
import { executeDashSlash } from "./dash-slash";

const EPSILON = 1e-8;

export interface AbilityExecutionContext {
  readonly state: GameState;
  readonly definition: AbilityDefinition;
  readonly target: Vec2;
}

export interface AbilityExecution {
  readonly id: string;
  execute(context: AbilityExecutionContext): void;
}

export const abilityExecutions = new DefinitionRegistry<AbilityExecution>([
  {
    id: "dash-slash-v1",
    execute({ state, target }) {
      executeDashSlash(state, target);
    },
  },
]);

export function activateAbility(
  state: GameState,
  slot: AbilitySlot,
  target: Vec2,
): DashRequestResult {
  if (state.stage.phase !== "playing" || state.player.hp === 0) return "ignored";
  const runtime = state.player.abilities[slot];
  if (!runtime || runtime.cooldownRemainingMs > EPSILON) return "ignored";
  const definition = abilityDefinitions.get(runtime.abilityId);
  if (definition.slot !== slot || definition.activation !== "target-point") return "ignored";
  if (state.player.charge !== null || state.player.ultimatePlanning !== null || state.player.ultimateExecution !== null) return "ignored";

  const clampedTarget = clampTarget(state, target);
  if (state.player.dash === null && state.player.recoveryRemainingMs <= EPSILON) {
    abilityExecutions.get(definition.executionProfile).execute({ state, definition, target: clampedTarget });
    return "started";
  }
  state.player.bufferedAbility = { slot, target: clampedTarget };
  return "buffered";
}

function clampTarget(state: GameState, target: Vec2): Vec2 {
  return copyVec2({
    x: Number.isFinite(target.x) ? target.x : state.player.position.x,
    z: Number.isFinite(target.z) ? target.z : state.player.position.z,
  });
}
