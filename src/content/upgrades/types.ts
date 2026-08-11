import type { UpgradeId } from "../../core/ids";

export type UpgradeRarity = "debug" | "common" | "rare" | "legendary";
export type DashModifierField = "distance" | "durationMs" | "recoveryMs" | "hitRadius";
export type ModifierOperation = "add" | "multiply" | "clamp-min" | "clamp-max";
export type SkillModule = "basic" | "charged" | "ultimate" | "shared";
export type SkillTier = 1 | 2 | 3;

export interface ModifierDefinition {
  readonly hook: "before-dash";
  readonly field: DashModifierField;
  readonly operation: ModifierOperation;
  readonly value: number;
}

export interface UpgradePresentation {
  readonly name: string;
  readonly description: string;
}

export interface SkillPresentation extends UpgradePresentation {
  readonly code: string;
  readonly nameZh: string;
  readonly nameEn: string;
  readonly effect: string;
  readonly trigger: string;
  readonly limit: string;
  readonly prerequisite: string;
}

export interface UpgradeDefinition {
  readonly id: UpgradeId;
  readonly rarity: UpgradeRarity;
  readonly tags: readonly string[];
  readonly modifiers: readonly ModifierDefinition[];
  readonly presentation: UpgradePresentation;
}

export interface SkillDefinition extends UpgradeDefinition {
  readonly rarity: "common" | "rare" | "legendary";
  readonly cost: 1;
  readonly module: SkillModule;
  readonly tier: SkillTier;
  readonly branchId: string;
  readonly prerequisites: readonly UpgradeId[];
  readonly hookIds: readonly string[];
  readonly presentation: SkillPresentation;
}

export interface SkillModuleRootDefinition {
  readonly id: string;
  readonly module: SkillModule;
  readonly nameZh: string;
  readonly nameEn: string;
  readonly description: string;
}
