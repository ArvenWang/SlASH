import type { EnemyDefinitionId } from "../../core/ids";
import { DefinitionRegistry } from "../registry";
import {
  BASTION_TRIPLE_ARMOR_PROFILE_ID,
  FORTRESS_QUAD_ARMOR_PROFILE_ID,
  VANGUARD_FRONT_ARMOR_PROFILE_ID,
} from "./armor-definitions";

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
export const GUNNER_ENEMY_ID: EnemyDefinitionId = "enemy-gunner-v1";
export const LANCER_ENEMY_ID: EnemyDefinitionId = "enemy-lancer-v1";
export const CONSTRUCTOR_ENEMY_ID: EnemyDefinitionId = "enemy-constructor-v1";
export const MINE_LAYER_ENEMY_ID: EnemyDefinitionId = "enemy-minelayer-v1";
export const SNIPER_ENEMY_ID: EnemyDefinitionId = "enemy-sniper-v1";
export const VANGUARD_ENEMY_ID: EnemyDefinitionId = "enemy-vanguard-v1";
export const BASTION_ENEMY_ID: EnemyDefinitionId = "enemy-bastion-v1";
export const BLINK_STALKER_ENEMY_ID: EnemyDefinitionId = "enemy-blink-stalker-v1";
export const CONDUCTOR_ENEMY_ID: EnemyDefinitionId = "enemy-conductor-v1";
export const REDLINE_LANCER_ELITE_ID: EnemyDefinitionId = "elite-redline-lancer-v1";
export const TWIN_GUNNER_ELITE_ID: EnemyDefinitionId = "elite-twin-gunner-v1";
export const ARCHITECT_ELITE_ID: EnemyDefinitionId = "elite-architect-v1";
export const FORTRESS_ELITE_ID: EnemyDefinitionId = "elite-fortress-v1";

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
    attackProfile: "striker-thrust-v1",
    armorProfileId: null,
    energyReward: 6,
    tags: ["enemy", "standard", "humanoid", "melee", "act-1"],
  },
  {
    id: GUNNER_ENEMY_ID,
    archetype: "gunner",
    radius: 0.55,
    baseMoveSpeed: 2.2,
    turnSpeedRadiansPerSecond: 240 * Math.PI / 180,
    movementProfile: "keep-range",
    attackProfile: "gunner-round-v1",
    armorProfileId: null,
    energyReward: 6,
    tags: ["enemy", "standard", "humanoid", "ranged", "projectile", "act-1"],
  },
  {
    id: LANCER_ENEMY_ID,
    archetype: "lancer",
    radius: 0.58,
    baseMoveSpeed: 2.5,
    turnSpeedRadiansPerSecond: 210 * Math.PI / 180,
    movementProfile: "strafe-align",
    attackProfile: "lancer-charge-v1",
    armorProfileId: null,
    energyReward: 7,
    tags: ["enemy", "standard", "humanoid", "melee", "charge", "act-1"],
  },
  {
    id: CONSTRUCTOR_ENEMY_ID,
    archetype: "constructor",
    radius: 0.58,
    baseMoveSpeed: 2,
    turnSpeedRadiansPerSecond: 180 * Math.PI / 180,
    movementProfile: "retreat-range",
    attackProfile: "constructor-barrier-v1",
    armorProfileId: null,
    energyReward: 7,
    tags: ["enemy", "standard", "humanoid", "support", "obstacle", "act-2"],
  },
  {
    id: MINE_LAYER_ENEMY_ID,
    archetype: "mine-layer",
    radius: 0.55,
    baseMoveSpeed: 2.35,
    turnSpeedRadiansPerSecond: 220 * Math.PI / 180,
    movementProfile: "orbit",
    attackProfile: "mine-layer-drop-v1",
    armorProfileId: null,
    energyReward: 6,
    tags: ["enemy", "standard", "humanoid", "support", "hazard", "act-2"],
  },
  {
    id: SNIPER_ENEMY_ID,
    archetype: "sniper",
    radius: 0.52,
    baseMoveSpeed: 1.8,
    turnSpeedRadiansPerSecond: 160 * Math.PI / 180,
    movementProfile: "far-anchor",
    attackProfile: "sniper-round-v1",
    armorProfileId: null,
    energyReward: 8,
    tags: ["enemy", "standard", "humanoid", "ranged", "projectile", "sniper", "act-2"],
  },
  {
    id: VANGUARD_ENEMY_ID,
    archetype: "vanguard",
    radius: 0.62,
    baseMoveSpeed: 2.45,
    turnSpeedRadiansPerSecond: 60 * Math.PI / 180,
    movementProfile: "direct-chase",
    attackProfile: "vanguard-thrust-v1",
    armorProfileId: VANGUARD_FRONT_ARMOR_PROFILE_ID,
    energyReward: 8,
    tags: ["enemy", "standard", "humanoid", "melee", "armored", "act-3"],
  },
  {
    id: BASTION_ENEMY_ID,
    archetype: "bastion",
    radius: 0.72,
    baseMoveSpeed: 1.75,
    turnSpeedRadiansPerSecond: 38 * Math.PI / 180,
    movementProfile: "slow-chase",
    attackProfile: "bastion-sweep-v1",
    armorProfileId: BASTION_TRIPLE_ARMOR_PROFILE_ID,
    energyReward: 8,
    tags: ["enemy", "standard", "humanoid", "melee", "armored", "multi-armor", "act-3"],
  },
  {
    id: BLINK_STALKER_ENEMY_ID,
    archetype: "blink-stalker",
    radius: 0.52,
    baseMoveSpeed: 2.65,
    turnSpeedRadiansPerSecond: 300 * Math.PI / 180,
    movementProfile: "segmented-track",
    attackProfile: "blink-stalker-strike-v1",
    armorProfileId: null,
    energyReward: 8,
    tags: ["enemy", "standard", "humanoid", "melee", "blink", "act-3"],
  },
  {
    id: CONDUCTOR_ENEMY_ID,
    archetype: "conductor",
    radius: 0.58,
    baseMoveSpeed: 2.25,
    turnSpeedRadiansPerSecond: 200 * Math.PI / 180,
    movementProfile: "far-evade",
    attackProfile: "conductor-pulse-v1",
    armorProfileId: null,
    energyReward: 8,
    tags: ["enemy", "standard", "humanoid", "support", "buff", "act-4"],
  },
  {
    id: REDLINE_LANCER_ELITE_ID,
    archetype: "redline-lancer",
    radius: 0.62,
    baseMoveSpeed: 2.5,
    turnSpeedRadiansPerSecond: 220 * Math.PI / 180,
    movementProfile: "strafe-align",
    attackProfile: "elite-redline-charge-v1",
    armorProfileId: null,
    energyReward: 12,
    tags: ["enemy", "elite", "humanoid", "melee", "charge", "act-4"],
  },
  {
    id: TWIN_GUNNER_ELITE_ID,
    archetype: "twin-gunner",
    radius: 0.6,
    baseMoveSpeed: 2.15,
    turnSpeedRadiansPerSecond: 240 * Math.PI / 180,
    movementProfile: "keep-range",
    attackProfile: "elite-twin-volley-v1",
    armorProfileId: null,
    energyReward: 12,
    tags: ["enemy", "elite", "humanoid", "ranged", "projectile", "act-4"],
  },
  {
    id: ARCHITECT_ELITE_ID,
    archetype: "architect",
    radius: 0.64,
    baseMoveSpeed: 1.9,
    turnSpeedRadiansPerSecond: 180 * Math.PI / 180,
    movementProfile: "retreat-range",
    attackProfile: "elite-architect-barrier-v1",
    armorProfileId: null,
    energyReward: 12,
    tags: ["enemy", "elite", "humanoid", "support", "obstacle", "act-4"],
  },
  {
    id: FORTRESS_ELITE_ID,
    archetype: "fortress",
    radius: 0.78,
    baseMoveSpeed: 1.7,
    turnSpeedRadiansPerSecond: 34 * Math.PI / 180,
    movementProfile: "slow-chase",
    attackProfile: "elite-fortress-sweep-v1",
    armorProfileId: FORTRESS_QUAD_ARMOR_PROFILE_ID,
    energyReward: 12,
    tags: ["enemy", "elite", "humanoid", "melee", "armored", "multi-armor", "act-4"],
  },
]);
