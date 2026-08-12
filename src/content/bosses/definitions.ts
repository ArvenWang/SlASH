import type { BossDefinitionId, EncounterTemplateId, EnemyDefinitionId } from "../../core/ids";
import { copyVec2, vec2, type Vec2 } from "../../core/math/vec2";
import {
  LAST_CONDUCTOR_BOSS_ENEMY_ID,
  MIRROR_REGENT_BOSS_ENEMY_ID,
  RAIL_HOUND_BOSS_ENEMY_ID,
  SIEGE_CHOIR_BOSS_ENEMY_ID,
} from "../enemies/definitions";
import { DefinitionRegistry } from "../registry";
import type { FullGameEncounterDefinition } from "../encounters/types";

export interface BossPhaseDefinition {
  readonly id: string;
  readonly title: string;
  readonly objective: string;
  readonly objectiveTarget: number;
  readonly telegraphMinimumMs: number;
}

export interface BossDefinition {
  readonly id: BossDefinitionId;
  readonly actIndex: number;
  readonly encounterId: EncounterTemplateId;
  readonly enemyDefinitionId: EnemyDefinitionId;
  readonly title: string;
  readonly summary: string;
  readonly tags: readonly string[];
  readonly spawnPosition: Vec2;
  readonly phases: readonly BossPhaseDefinition[];
  readonly threatPreview: {
    readonly maximumConcurrentHostiles: number;
    readonly armorPartCount: number;
    readonly projectileSourceCount: number;
    readonly obstacleSourceCount: number;
    readonly hazardSourceCount: number;
  };
}

export const RAIL_HOUND_BOSS_ID: BossDefinitionId = "boss-rail-hound-v1";
export const SIEGE_CHOIR_BOSS_ID: BossDefinitionId = "boss-siege-choir-v1";
export const MIRROR_REGENT_BOSS_ID: BossDefinitionId = "boss-mirror-regent-v1";
export const LAST_CONDUCTOR_BOSS_ID: BossDefinitionId = "boss-last-conductor-v1";

export const BOSS_DEFINITIONS: readonly BossDefinition[] = [
  {
    id: RAIL_HOUND_BOSS_ID,
    actIndex: 0,
    encounterId: "encounter-boss-rail-hound-v1",
    enemyDefinitionId: RAIL_HOUND_BOSS_ENEMY_ID,
    title: "RAIL HOUND / 轨道猎犬",
    summary: "读取 800ms 冲锋锁定线，在 1.5s 的侧核 Recovery 窗口命中核心；完成 3 次 Core Break。",
    tags: ["BOSS", "CHARGE", "CORE WINDOW", "3 BREAKS"],
    spawnPosition: vec2(0, -8),
    phases: [
      { id: "single-charge", title: "SINGLE CHARGE", objective: "躲开单段冲锋并命中侧核", objectiveTarget: 1, telegraphMinimumMs: 800 },
      { id: "double-charge", title: "DOUBLE CHARGE", objective: "读取二段再锁定冲锋并命中侧核", objectiveTarget: 2, telegraphMinimumMs: 800 },
    ],
    threatPreview: { maximumConcurrentHostiles: 1, armorPartCount: 0, projectileSourceCount: 0, obstacleSourceCount: 0, hazardSourceCount: 0 },
  },
  {
    id: SIEGE_CHOIR_BOSS_ID,
    actIndex: 1,
    encounterId: "encounter-boss-siege-choir-v1",
    enemyDefinitionId: SIEGE_CHOIR_BOSS_ENEMY_ID,
    title: "SIEGE CHOIR / 围城合唱体",
    summary: "两座炮台与 Barrier 维持弹幕；Charged 卸掉任意 2 块独立 Coverage 后，利用 1.5s 背核窗口完成 2 个阶段。",
    tags: ["BOSS", "ARMOR", "PROJECTILE", "OBSTACLE", "2 ROUNDS"],
    spawnPosition: vec2(0, -6),
    phases: [
      { id: "choir-round-1", title: "CHOIR I", objective: "卸掉 2 块甲并命中暴露背核", objectiveTarget: 1, telegraphMinimumMs: 600 },
      { id: "choir-round-2", title: "CHOIR II", objective: "重复破阵并处决核心", objectiveTarget: 1, telegraphMinimumMs: 600 },
    ],
    threatPreview: { maximumConcurrentHostiles: 3, armorPartCount: 3, projectileSourceCount: 2, obstacleSourceCount: 1, hazardSourceCount: 0 },
  },
  {
    id: MIRROR_REGENT_BOSS_ID,
    actIndex: 2,
    encounterId: "encounter-boss-mirror-regent-v1",
    enemyDefinitionId: MIRROR_REGENT_BOSS_ENEMY_ID,
    title: "MIRROR REGENT / 镜像执政官",
    summary: "在 1 个真实体与 3 个镜像中读取节拍差异；旧 Dash Path 会提前 800ms 显示并回放为致命 Mirror Slash。命中真实体 3 次。",
    tags: ["BOSS", "CLONES", "RECORDED PATH", "3 TRUE HITS"],
    spawnPosition: vec2(0, -8),
    phases: [
      { id: "mirror-cycle", title: "MIRROR CYCLE", objective: "换位躲开路径回放并命中真实体", objectiveTarget: 3, telegraphMinimumMs: 800 },
    ],
    threatPreview: { maximumConcurrentHostiles: 4, armorPartCount: 0, projectileSourceCount: 0, obstacleSourceCount: 0, hazardSourceCount: 1 },
  },
  {
    id: LAST_CONDUCTOR_BOSS_ID,
    actIndex: 3,
    encounterId: "encounter-boss-last-conductor-v1",
    enemyDefinitionId: LAST_CONDUCTOR_BOSS_ENEMY_ID,
    title: "THE LAST CONDUCTOR / 末班指挥者",
    summary: "依次完成 Barrage、Rail Grid、Armor Shell 与 Vector Finale；最终阶段强制补满 Energy，并按顺序穿过 3 个空间核心。",
    tags: ["FINAL BOSS", "PROJECTILE", "RAIL", "ARMOR", "VECTOR FOCUS"],
    spawnPosition: vec2(0, -7),
    phases: [
      { id: "barrage", title: "BARRAGE", objective: "击杀 2 名支援并穿过核心", objectiveTarget: 3, telegraphMinimumMs: 650 },
      { id: "rail-grid", title: "RAIL GRID", objective: "依序抵达 3 个安全节点", objectiveTarget: 3, telegraphMinimumMs: 1_400 },
      { id: "armor-shell", title: "ARMOR SHELL", objective: "卸掉任意 3 块甲并命中核心", objectiveTarget: 4, telegraphMinimumMs: 650 },
      { id: "vector-finale", title: "VECTOR FINALE", objective: "用 Vector Focus 依序穿过 3 个空间核心", objectiveTarget: 3, telegraphMinimumMs: 600 },
    ],
    threatPreview: { maximumConcurrentHostiles: 3, armorPartCount: 4, projectileSourceCount: 1, obstacleSourceCount: 2, hazardSourceCount: 2 },
  },
];

export const bossDefinitions = new DefinitionRegistry<BossDefinition>(BOSS_DEFINITIONS);

export const FULL_GAME_BOSS_ENCOUNTERS: readonly FullGameEncounterDefinition[] = BOSS_DEFINITIONS.map(
  (boss): FullGameEncounterDefinition => ({
    id: boss.encounterId,
    actIndex: boss.actIndex,
    category: "boss",
    title: boss.title,
    summary: boss.summary,
    designTags: boss.tags,
    environmentId: [
      "transit-cathedral-arrival-v1",
      "transit-cathedral-forge-v1",
      "transit-cathedral-archive-v1",
      "transit-cathedral-redline-v1",
    ][boss.actIndex]!,
    lightingProfileId: [
      "arrival-yard-cold-rain-v1",
      "compression-forge-amber-rail-v1",
      "mirror-archive-white-red-v1",
      "redline-cathedral-storm-v1",
    ][boss.actIndex]!,
    presentationId: `encounter-${boss.id}-presentation-v1`,
    completionRule: "all-hostiles-defeated",
    enemyMoveSpeed: 2.75,
    waves: [{
      id: `${boss.encounterId}:wave-boss`,
      activation: "immediate",
      warningDurationMs: 750,
      spawns: [{
        id: "boss-core",
        enemyDefinitionId: boss.enemyDefinitionId,
        position: copyVec2(boss.spawnPosition),
        facing: vec2(0, 1),
      }],
    }],
    initialObstacles: [],
    initialHazards: [],
    challenge: null,
  }),
);

export function bossDefinitionForAct(actIndex: number): BossDefinition {
  const definition = BOSS_DEFINITIONS[actIndex];
  if (!definition) throw new Error(`Missing Boss Definition for Act ${actIndex + 1}.`);
  return definition;
}

export function bossDefinitionForEncounter(encounterId: string): BossDefinition {
  const definition = BOSS_DEFINITIONS.find((candidate) => candidate.encounterId === encounterId);
  if (!definition) throw new Error(`Unknown Boss Encounter: ${encounterId}`);
  return definition;
}
