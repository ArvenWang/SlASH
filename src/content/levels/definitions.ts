import type { EncounterId, EnemyDefinitionId, LevelId } from "../../core/ids";
import { copyVec2, vec2, type Vec2 } from "../../core/math/vec2";
import type { ArenaBounds } from "../../game/domain/types";
import { PHASE_ONE_GRUNT_ID } from "../enemies/definitions";
import { DefinitionRegistry } from "../registry";

export type WaveActivation = "immediate" | "timed" | "after-previous-killed" | "triggered";
export type CompletionRule = "all-hostiles-defeated";

export interface SpawnDefinition {
  readonly id: string;
  readonly enemyDefinitionId: EnemyDefinitionId;
  readonly position: Vec2;
  readonly delayMs?: number;
  readonly facing?: Vec2;
  readonly spawnPresentation?: string;
}

export interface EncounterWave {
  readonly id: string;
  readonly activation: WaveActivation;
  readonly activationDelayMs?: number;
  readonly triggerId?: string;
  readonly warningDurationMs?: number;
  readonly spawns: readonly SpawnDefinition[];
}

export interface EncounterDefinition {
  readonly id: EncounterId;
  readonly waves: readonly EncounterWave[];
  readonly completionRule: CompletionRule;
  /** Phase 1 stages author exact speed here so migration cannot alter pacing. */
  readonly enemyMoveSpeed: number;
}

export interface LevelDefinition {
  readonly id: LevelId;
  readonly name: string;
  readonly index: number;
  readonly environmentId: string;
  readonly arena: ArenaBounds;
  readonly playerSpawn: Vec2;
  readonly encounters: readonly EncounterDefinition[];
  readonly staticObjects: readonly string[];
  readonly gameplaySurfaces: readonly string[];
  readonly lightingProfileId: string;
  readonly presentation: {
    readonly title: string;
  };
}

const ARENA: ArenaBounds = {
  minX: -20,
  maxX: 20,
  minZ: -12.5,
  maxZ: 12.5,
};

const STAGE_ONE_SPAWNS: readonly Vec2[] = [
  vec2(-17, 0), vec2(-11, 0), vec2(11, 0), vec2(17, 0),
  vec2(0, -10.5), vec2(0, 10.5), vec2(-14.5, -8.5), vec2(14.5, 8.5),
];

const STAGE_TWO_SPAWNS: readonly Vec2[] = [
  vec2(-18, -6), vec2(-13, -6), vec2(-18, 6), vec2(-13, 6),
  vec2(13, -6), vec2(18, -6), vec2(13, 6), vec2(18, 6),
  vec2(-7, -10.5), vec2(7, -10.5), vec2(-7, 10.5), vec2(7, 10.5),
];

const STAGE_THREE_SPAWNS: readonly Vec2[] = [
  vec2(-18, -8), vec2(-13, -8), vec2(-8, -8), vec2(8, -8), vec2(13, -8), vec2(18, -8),
  vec2(-18, 0), vec2(-12, 0), vec2(12, 0), vec2(18, 0),
  vec2(-18, 8), vec2(-13, 8), vec2(-8, 8), vec2(8, 8), vec2(13, 8), vec2(18, 8),
  vec2(0, -11), vec2(0, 11),
];

function createImmediateEncounter(
  id: EncounterId,
  enemyMoveSpeed: number,
  positions: readonly Vec2[],
): EncounterDefinition {
  return {
    id,
    enemyMoveSpeed,
    completionRule: "all-hostiles-defeated",
    waves: [
      {
        id: `${id}:wave:01`,
        activation: "immediate",
        spawns: positions.map((position, index) => ({
          id: `${id}:spawn:${String(index + 1).padStart(2, "0")}`,
          enemyDefinitionId: PHASE_ONE_GRUNT_ID,
          position: copyVec2(position),
        })),
      },
    ],
  };
}

export const LEVEL_DEFINITIONS: readonly LevelDefinition[] = [
  {
    id: "stage-01-arrival",
    name: "ARRIVAL",
    index: 0,
    environmentId: "transit-cathedral-v1",
    arena: { ...ARENA },
    playerSpawn: vec2(0, 0),
    encounters: [createImmediateEncounter("encounter-arrival-v1", 2.75, STAGE_ONE_SPAWNS)],
    staticObjects: [],
    gameplaySurfaces: [],
    lightingProfileId: "transit-cathedral-night-rain",
    presentation: { title: "ARRIVAL" },
  },
  {
    id: "stage-02-compression",
    name: "COMPRESSION",
    index: 1,
    environmentId: "transit-cathedral-v1",
    arena: { ...ARENA },
    playerSpawn: vec2(0, 0),
    encounters: [createImmediateEncounter("encounter-compression-v1", 3.15, STAGE_TWO_SPAWNS)],
    staticObjects: [],
    gameplaySurfaces: [],
    lightingProfileId: "transit-cathedral-night-rain",
    presentation: { title: "COMPRESSION" },
  },
  {
    id: "stage-03-redline",
    name: "REDLINE",
    index: 2,
    environmentId: "transit-cathedral-v1",
    arena: { ...ARENA },
    playerSpawn: vec2(0, 0),
    encounters: [createImmediateEncounter("encounter-redline-v1", 3.55, STAGE_THREE_SPAWNS)],
    staticObjects: [],
    gameplaySurfaces: [],
    lightingProfileId: "transit-cathedral-night-rain",
    presentation: { title: "REDLINE" },
  },
];

export const levelDefinitions = new DefinitionRegistry<LevelDefinition>(LEVEL_DEFINITIONS);

export function levelByIndex(index: number): LevelDefinition {
  const level = LEVEL_DEFINITIONS[index];
  if (!level) throw new RangeError(`Level index ${index} is invalid; expected 0-${LEVEL_DEFINITIONS.length - 1}.`);
  return level;
}
