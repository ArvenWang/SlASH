import type { UpgradeId } from "../../core/ids";
import { DefinitionRegistry } from "../registry";

export type UpgradeRarity = "debug" | "common" | "rare" | "legendary";
export type DashModifierField = "distance" | "durationMs" | "recoveryMs" | "hitRadius";
export type ModifierOperation = "add" | "multiply" | "clamp-min" | "clamp-max";

export interface ModifierDefinition {
  readonly hook: "before-dash";
  readonly field: DashModifierField;
  readonly operation: ModifierOperation;
  readonly value: number;
}

export interface UpgradeDefinition {
  readonly id: UpgradeId;
  readonly rarity: UpgradeRarity;
  readonly tags: readonly string[];
  readonly modifiers: readonly ModifierDefinition[];
  readonly presentation: {
    readonly name: string;
    readonly description: string;
  };
}

export const upgradeDefinitions = new DefinitionRegistry<UpgradeDefinition>();
