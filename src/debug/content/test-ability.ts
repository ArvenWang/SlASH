import type { AbilityDefinition } from "../../content/abilities/definitions";
import { abilityDefinitions } from "../../content/abilities/definitions";
import { abilityExecutions } from "../../game/abilities/ability-system";

export const DEBUG_TEST_ABILITY: AbilityDefinition = {
  id: "debug-target-blink",
  slot: "secondary",
  activation: "target-point",
  cooldownMs: 0,
  energyCost: 0,
  tags: ["movement", "test"],
  executionProfile: "debug-target-blink-v1",
};

export function registerDebugTestAbility(): void {
  if (!abilityDefinitions.has(DEBUG_TEST_ABILITY.id)) abilityDefinitions.register(DEBUG_TEST_ABILITY);
  if (!abilityExecutions.has(DEBUG_TEST_ABILITY.executionProfile)) {
    abilityExecutions.register({
      id: DEBUG_TEST_ABILITY.executionProfile,
      execute({ state, target }) {
        state.player.position = { x: target.x, z: target.z };
        state.player.facing = { x: 1, z: 0 };
      },
    });
  }
}
