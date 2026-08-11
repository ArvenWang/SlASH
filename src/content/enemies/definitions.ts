import type { EnemyDefinitionId } from "../../core/ids";
import { DefinitionRegistry } from "../registry";
import { VANGUARD_FRONT_ARMOR_PROFILE_ID } from "./armor-definitions";

export interface EnemyDefinition {
  readonly id: EnemyDefinitionId;
  readonly archetype: string;
  readonly radius: number;
  readonly baseMoveSpeed: number;
  readonly turnSpeedRadiansPerSecond: number;
  readonly movementProfile: string;
  readonly attackProfile: string;
  readonly armorProfileId: string | null;
  readonly energyReward: number;
  readonly tags: readonly string[];
}

export const PHASE_ONE_GRUNT_ID: EnemyDefinitionId = "enemy-grunt-v1";
export const STRIKER_ENEMY_ID: EnemyDefinitionId = "enemy-striker-v1";
export const VANGUARD_ENEMY_ID: EnemyDefinitionId = "enemy-vanguard-v1";

export const enemyDefinitions = new DefinitionRegistry<EnemyDefinition>([
  {
    id: PHASE_ONE_GRUNT_ID,
    archetype: "grunt",
    radius: 0.55,
    baseMoveSpeed: 2.75,
    turnSpeedRadiansPerSecond: 720 * Math.PI / 180,
    movementProfile: "direct-chase",
    attackProfile: "contact-lethal",
    armorProfileId: null,
    energyReward: 4,
    tags: ["enemy", "humanoid", "melee"],
  },
  {
    id: STRIKER_ENEMY_ID,
    archetype: "striker",
    radius: 0.55,
    baseMoveSpeed: 2.75,
    turnSpeedRadiansPerSecond: 360 * Math.PI / 180,
    movementProfile: "direct-chase",
    attackProfile: "contact-lethal",
    armorProfileId: null,
    energyReward: 6,
    tags: ["enemy", "standard", "humanoid", "melee", "act-1"],
  },
  {
    id: VANGUARD_ENEMY_ID,
    archetype: "vanguard",
    radius: 0.62,
    baseMoveSpeed: 2.45,
    turnSpeedRadiansPerSecond: 60 * Math.PI / 180,
    movementProfile: "direct-chase",
    attackProfile: "contact-lethal",
    armorProfileId: VANGUARD_FRONT_ARMOR_PROFILE_ID,
    energyReward: 8,
    tags: ["enemy", "standard", "humanoid", "melee", "armored", "act-3"],
  },
]);
