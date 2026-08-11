import type { AbilityId } from "../../core/ids";
import { DefinitionRegistry } from "../registry";

export type AbilitySlot = "primary" | "secondary" | "special" | "ultimate";
export type AbilityActivationType = "target-point" | "hold-target-point" | "multi-point-plan" | "instant";
export type AbilityTag = "movement" | "melee" | "invulnerable" | "armor-break" | "ultimate" | "test";

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
export const CHARGED_DASH_ABILITY_ID: AbilityId = "charged-dash";
export const VECTOR_FOCUS_ABILITY_ID: AbilityId = "vector-focus";

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
  {
    id: CHARGED_DASH_ABILITY_ID,
    slot: "secondary",
    activation: "hold-target-point",
    cooldownMs: 0,
    energyCost: 0,
    tags: ["movement", "melee", "invulnerable", "armor-break"],
    executionProfile: "charged-dash-v1",
  },
  {
    id: VECTOR_FOCUS_ABILITY_ID,
    slot: "ultimate",
    activation: "multi-point-plan",
    cooldownMs: 0,
    energyCost: 100,
    tags: ["movement", "melee", "invulnerable", "ultimate"],
    executionProfile: "vector-focus-v1",
  },
]);
