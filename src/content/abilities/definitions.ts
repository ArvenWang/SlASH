import type { AbilityId } from "../../core/ids";
import { DefinitionRegistry } from "../registry";

export type AbilitySlot = "primary" | "secondary" | "special" | "ultimate";
export type AbilityActivationType = "target-point" | "instant";
export type AbilityTag = "movement" | "melee" | "invulnerable" | "test";

export interface AbilityDefinition {
  readonly id: AbilityId;
  readonly slot: AbilitySlot;
  readonly activation: AbilityActivationType;
  readonly cooldownMs: number;
  readonly energyCost: number;
  readonly tags: readonly AbilityTag[];
  readonly executionProfile: string;
}

export const DASH_SLASH_ABILITY_ID: AbilityId = "dash-slash";

export const abilityDefinitions = new DefinitionRegistry<AbilityDefinition>([
  {
    id: DASH_SLASH_ABILITY_ID,
    slot: "primary",
    activation: "target-point",
    cooldownMs: 0,
    energyCost: 0,
    tags: ["movement", "melee", "invulnerable"],
    executionProfile: "dash-slash-v1",
  },
]);
