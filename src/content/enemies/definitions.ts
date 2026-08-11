import type { EnemyDefinitionId } from "../../core/ids";
import { DefinitionRegistry } from "../registry";

export interface EnemyDefinition {
  readonly id: EnemyDefinitionId;
  readonly archetype: string;
  readonly radius: number;
  readonly baseMoveSpeed: number;
  readonly movementProfile: string;
  readonly attackProfile: string;
  readonly tags: readonly string[];
}

export const PHASE_ONE_GRUNT_ID: EnemyDefinitionId = "enemy-grunt-v1";

export const enemyDefinitions = new DefinitionRegistry<EnemyDefinition>([
  {
    id: PHASE_ONE_GRUNT_ID,
    archetype: "grunt",
    radius: 0.55,
    baseMoveSpeed: 2.75,
    movementProfile: "direct-chase",
    attackProfile: "contact-lethal",
    tags: ["enemy", "humanoid", "melee"],
  },
]);
