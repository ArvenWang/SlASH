import type { Vec2 } from "./math";
import { vec2 } from "./math";
import { PLAYABLE_ARENA } from "./config";

export const REDESIGN_CONTENT_VERSION = "slash-v2.1-content-1" as const;
export const CHAPTER_COUNT = 3 as const;
export const ENCOUNTERS_PER_CHAPTER = 3 as const;
export const STANDARD_RUN_ENCOUNTER_COUNT = 9 as const;
export const STANDARD_RUN_REWARD_COUNT = 8 as const;

export type EnemyArchetype =
  | "chaser"
  | "shooter"
  | "spinner"
  | "splitter"
  | "splitter-shard"
  | "slammer";

export type ObstacleArchetype = "pillar" | "reflector" | "hazard-prism";
export type BossArchetype = "prism-hound" | "cube-fortress" | "singularity-crown";

export interface EnemySpawnDefinition {
  readonly archetype: EnemyArchetype;
  readonly position: Vec2;
  readonly delayMs?: number;
}

export interface ObstacleSpawnDefinition {
  readonly archetype: ObstacleArchetype;
  readonly position: Vec2;
  readonly rotationRadians?: number;
}

export interface EncounterDefinition {
  readonly id: string;
  readonly index: number;
  readonly chapter: 1 | 2 | 3;
  readonly chapterEncounter: 1 | 2 | 3;
  readonly title: string;
  readonly kind: "encounter" | "boss";
  readonly enemies: readonly EnemySpawnDefinition[];
  readonly obstacles: readonly ObstacleSpawnDefinition[];
  readonly boss: BossArchetype | null;
}

const P = (x: number, z: number): Vec2 => vec2(x, z);

export const STANDARD_RUN: readonly EncounterDefinition[] = [
  {
    id: "chapter-1-pursuit",
    index: 0,
    chapter: 1,
    chapterEncounter: 1,
    title: "追击",
    kind: "encounter",
    enemies: [
      { archetype: "chaser", position: P(-24, -14) },
      { archetype: "chaser", position: P(24, -14) },
      { archetype: "chaser", position: P(-24, 14), delayMs: 700 },
      { archetype: "chaser", position: P(24, 14), delayMs: 700 },
    ],
    obstacles: [],
    boss: null,
  },
  {
    id: "chapter-1-forward-pulse",
    index: 1,
    chapter: 1,
    chapterEncounter: 2,
    title: "脉冲",
    kind: "encounter",
    enemies: [
      { archetype: "shooter", position: P(-25, -15) },
      { archetype: "shooter", position: P(25, 15) },
      { archetype: "chaser", position: P(20, -15) },
      { archetype: "chaser", position: P(-20, 15), delayMs: 800 },
    ],
    obstacles: [
      { archetype: "pillar", position: P(-9, 0) },
      { archetype: "reflector", position: P(10, 0), rotationRadians: Math.PI * 0.25 },
    ],
    boss: null,
  },
  {
    id: "chapter-1-prism-hound",
    index: 2,
    chapter: 1,
    chapterEncounter: 3,
    title: "棱镜猎犬",
    kind: "boss",
    enemies: [],
    obstacles: [
      { archetype: "pillar", position: P(-14, 10) },
      { archetype: "pillar", position: P(14, -10) },
    ],
    boss: "prism-hound",
  },
  {
    id: "chapter-2-rotation",
    index: 3,
    chapter: 2,
    chapterEncounter: 1,
    title: "旋转",
    kind: "encounter",
    enemies: [
      { archetype: "spinner", position: P(-23, 0) },
      { archetype: "spinner", position: P(23, 0) },
      { archetype: "chaser", position: P(0, -16) },
      { archetype: "chaser", position: P(0, 16), delayMs: 900 },
    ],
    obstacles: [{ archetype: "reflector", position: P(0, 0), rotationRadians: Math.PI * 0.5 }],
    boss: null,
  },
  {
    id: "chapter-2-division",
    index: 4,
    chapter: 2,
    chapterEncounter: 2,
    title: "分裂",
    kind: "encounter",
    enemies: [
      { archetype: "splitter", position: P(-23, -14) },
      { archetype: "splitter", position: P(23, 14) },
      { archetype: "shooter", position: P(24, -15) },
      { archetype: "shooter", position: P(-24, 15), delayMs: 850 },
    ],
    obstacles: [
      { archetype: "reflector", position: P(-8, 2), rotationRadians: Math.PI * 0.22 },
      { archetype: "reflector", position: P(9, -2), rotationRadians: -Math.PI * 0.22 },
    ],
    boss: null,
  },
  {
    id: "chapter-2-cube-fortress",
    index: 5,
    chapter: 2,
    chapterEncounter: 3,
    title: "魔方堡垒",
    kind: "boss",
    enemies: [],
    obstacles: [
      { archetype: "reflector", position: P(-17, 0), rotationRadians: Math.PI * 0.5 },
      { archetype: "reflector", position: P(17, 0), rotationRadians: Math.PI * 0.5 },
    ],
    boss: "cube-fortress",
  },
  {
    id: "chapter-3-impact",
    index: 6,
    chapter: 3,
    chapterEncounter: 1,
    title: "坠击",
    kind: "encounter",
    enemies: [
      { archetype: "slammer", position: P(-22, -13) },
      { archetype: "slammer", position: P(22, 13), delayMs: 650 },
      { archetype: "shooter", position: P(24, -15) },
      { archetype: "shooter", position: P(-24, 15), delayMs: 900 },
    ],
    obstacles: [
      { archetype: "hazard-prism", position: P(-10, 6) },
      { archetype: "hazard-prism", position: P(10, -6) },
    ],
    boss: null,
  },
  {
    id: "chapter-3-convergence",
    index: 7,
    chapter: 3,
    chapterEncounter: 2,
    title: "汇聚",
    kind: "encounter",
    enemies: [
      { archetype: "chaser", position: P(-25, -15) },
      { archetype: "shooter", position: P(25, -15) },
      { archetype: "spinner", position: P(-24, 14), delayMs: 450 },
      { archetype: "splitter", position: P(24, 14), delayMs: 700 },
      { archetype: "slammer", position: P(0, 16), delayMs: 1_000 },
    ],
    obstacles: [
      { archetype: "pillar", position: P(0, -8) },
      { archetype: "reflector", position: P(0, 7), rotationRadians: Math.PI * 0.25 },
    ],
    boss: null,
  },
  {
    id: "chapter-3-singularity-crown",
    index: 8,
    chapter: 3,
    chapterEncounter: 3,
    title: "奇点王冠",
    kind: "boss",
    enemies: [],
    obstacles: [
      { archetype: "hazard-prism", position: P(-18, -10) },
      { archetype: "hazard-prism", position: P(18, -10) },
      { archetype: "reflector", position: P(0, 13), rotationRadians: Math.PI * 0.5 },
    ],
    boss: "singularity-crown",
  },
] as const;

export function encounterAt(index: number): EncounterDefinition {
  const definition = STANDARD_RUN[index];
  if (!definition) throw new Error(`Unknown V2.1 encounter index: ${index}`);
  return definition;
}

export function validateStandardRun(): void {
  if (STANDARD_RUN.length !== STANDARD_RUN_ENCOUNTER_COUNT) {
    throw new Error(`V2.1 run must contain ${STANDARD_RUN_ENCOUNTER_COUNT} encounters.`);
  }
  const ids = new Set<string>();
  for (let index = 0; index < STANDARD_RUN.length; index += 1) {
    const definition = STANDARD_RUN[index]!;
    if (definition.index !== index || ids.has(definition.id)) throw new Error(`Invalid encounter at index ${index}.`);
    ids.add(definition.id);
    const expectedChapter = Math.floor(index / ENCOUNTERS_PER_CHAPTER) + 1;
    const expectedChapterEncounter = index % ENCOUNTERS_PER_CHAPTER + 1;
    if (definition.chapter !== expectedChapter || definition.chapterEncounter !== expectedChapterEncounter) {
      throw new Error(`Encounter ${definition.id} is in the wrong chapter slot.`);
    }
    const shouldBeBoss = definition.chapterEncounter === ENCOUNTERS_PER_CHAPTER;
    if (shouldBeBoss !== (definition.kind === "boss") || shouldBeBoss !== (definition.boss !== null)) {
      throw new Error(`Encounter ${definition.id} has an invalid boss boundary.`);
    }
  }
  if (STANDARD_RUN.filter((definition) => definition.kind === "boss").length !== CHAPTER_COUNT) {
    throw new Error(`V2.1 run must contain ${CHAPTER_COUNT} bosses.`);
  }
  const regularSpawns = STANDARD_RUN.flatMap((definition) => definition.enemies.map((spawn) => spawn.position));
  if (regularSpawns.some((position) => (
    position.x <= PLAYABLE_ARENA.minX || position.x >= PLAYABLE_ARENA.maxX
    || position.z <= PLAYABLE_ARENA.minZ || position.z >= PLAYABLE_ARENA.maxZ
  ))) {
    throw new Error("V2.1 encounter spawn lies outside the enlarged Gameplay Arena.");
  }
  const minX = Math.min(...regularSpawns.map((position) => position.x));
  const maxX = Math.max(...regularSpawns.map((position) => position.x));
  const minZ = Math.min(...regularSpawns.map((position) => position.z));
  const maxZ = Math.max(...regularSpawns.map((position) => position.z));
  if (maxX - minX < 44.8 || maxZ - minZ < 28) {
    throw new Error("V2.1 encounters do not use at least 70% of the enlarged Arena.");
  }
}

validateStandardRun();
