import { DefinitionRegistry } from "../registry";
import { FULL_GAME_SKILL_DEFINITIONS } from "./skill-tree";
import type { UpgradeDefinition } from "./types";

export type {
  DashModifierField,
  ModifierDefinition,
  ModifierOperation,
  SkillDefinition,
  SkillModule,
  SkillModuleRootDefinition,
  SkillPresentation,
  SkillTier,
  UpgradeDefinition,
  UpgradePresentation,
  UpgradeRarity,
} from "./types";

export const upgradeDefinitions = new DefinitionRegistry<UpgradeDefinition>(FULL_GAME_SKILL_DEFINITIONS);
