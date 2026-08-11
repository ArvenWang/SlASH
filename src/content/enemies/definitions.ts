import type { EnemyDefinitionId } from "../../core/ids";
import { DefinitionRegistry } from "../registry";

export interface EnemyPresentationReference {
  readonly characterId: string;
  readonly animationSetId: string;
  readonly vfxProfileId: string;
  readonly audioProfileId: string;
  readonly deathProfileId: string;
}

export interface EnemyDefinition {
  readonly id: EnemyDefinitionId;
  readonly archetype: string;
  readonly radius: number;
  readonly baseMoveSpeed: number;
  readonly movementProfile: string;
  readonly attackProfile: string;
  readonly tags: readonly string[];
  readonly presentation: EnemyPresentationReference;
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
    presentation: {
      characterId: "enemy-procedural-v5",
      animationSetId: "enemy-procedural-v5",
      vfxProfileId: "enemy-cut-humanoid-v1",
      audioProfileId: "enemy-cyber-grunt-v1",
      deathProfileId: "humanoid-soft-v1",
    },
  },
]);
