import type { AbilityId } from "../../core/ids";
import { DefinitionRegistry } from "../registry";

export type AbilitySlot = "primary" | "secondary" | "special" | "ultimate";
export type AbilityActivationType = "target-point" | "instant";
export type AbilityTag = "movement" | "melee" | "invulnerable" | "ultimate" | "route" | "test";

export interface AbilityResourceDefinition {
  readonly id: string;
  readonly initial: number;
  readonly maximum: number;
}

export interface AbilityDefinition {
  readonly id: AbilityId;
  readonly slot: AbilitySlot;
  readonly activation: AbilityActivationType;
  readonly cooldownMs: number;
  readonly energyCost: number;
  readonly tags: readonly AbilityTag[];
  readonly executionProfile: string;
  readonly completionProfile?: string;
  readonly resource?: AbilityResourceDefinition;
}

export const DASH_SLASH_ABILITY_ID: AbilityId = "dash-slash";
export const VECTOR_FOCUS_ABILITY_ID: AbilityId = "vector-focus";

export const VECTOR_FOCUS_CONFIG = Object.freeze({
  energyMaximum: 100,
  worldTimeScale: 0.12,
  selectionMs: 3_000,
  targetCount: 3,
  minimumTargetDistance: 1,
  routeSpeedUnitsPerSecond: 650,
  minimumSegmentDurationMs: 48,
  maximumSegmentDurationMs: 75,
  recoveryMs: 180,
});

export const abilityDefinitions = new DefinitionRegistry<AbilityDefinition>([
  {
    id: DASH_SLASH_ABILITY_ID,
    slot: "primary",
    activation: "target-point",
    cooldownMs: 0,
    energyCost: 0,
    tags: ["movement", "melee", "invulnerable"],
    executionProfile: "dash-slash-v1",
    completionProfile: "dash-multikill-focus-charge-v1",
  },
  {
    id: VECTOR_FOCUS_ABILITY_ID,
    slot: "ultimate",
    activation: "instant",
    cooldownMs: 0,
    energyCost: VECTOR_FOCUS_CONFIG.energyMaximum,
    tags: ["movement", "melee", "invulnerable", "ultimate", "route"],
    executionProfile: "vector-focus-v1",
    resource: {
      id: "vector-focus-energy",
      initial: 0,
      maximum: VECTOR_FOCUS_CONFIG.energyMaximum,
    },
  },
]);
