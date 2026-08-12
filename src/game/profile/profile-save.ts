import { BOSS_DEFINITIONS } from "../../content/bosses/definitions";
import { enemyDefinitions } from "../../content/enemies/definitions";
import { fullGameEncounterDefinitions } from "../../content/encounters/definitions";
import { FULL_GAME_SKILL_DEFINITIONS } from "../../content/upgrades/skill-tree";
import { stableHash } from "../serialization/stable";
import type { PlayerProfile, ProfileSettings } from "./types";

export const PROFILE_SCHEMA_VERSION = 1 as const;
export const PROFILE_CONTENT_VERSION = "full-game-v1" as const;
export const PROFILE_STORAGE_KEY = "project-slash:profile:v1" as const;
export const PROFILE_CORRUPT_BACKUP_PREFIX = "project-slash:profile:corrupt-backup:" as const;

export type ProfileFailureCode =
  | "invalid-json"
  | "invalid-envelope"
  | "unsupported-schema"
  | "unsupported-content"
  | "checksum-mismatch"
  | "invalid-profile";

export class ProfileSaveError extends Error {
  readonly code: ProfileFailureCode;

  constructor(code: ProfileFailureCode, message: string) {
    super(message);
    this.name = "ProfileSaveError";
    this.code = code;
  }
}

export interface ProfileEnvelope {
  readonly schemaVersion: typeof PROFILE_SCHEMA_VERSION;
  readonly contentVersion: typeof PROFILE_CONTENT_VERSION;
  readonly profile: PlayerProfile;
  readonly checksum: string;
}

export const DEFAULT_PROFILE_SETTINGS: Readonly<ProfileSettings> = {
  audioEnabled: true,
  qualityMode: "high",
  reducedMotion: false,
  highContrast: false,
};

export function createDefaultProfile(nowIso = new Date().toISOString()): PlayerProfile {
  return {
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
    discoveries: {
      enemyDefinitionIds: [],
      encounterDefinitionIds: [],
      bossDefinitionIds: [],
    },
    unlocks: {
      bossPracticeIds: [],
      maximumThreatLevel: 0,
    },
    statistics: {
      runSerial: 0,
      runsStarted: 0,
      runsDefeated: 0,
      runsAbandoned: 0,
      playerDeaths: 0,
      clears: { standard: 0, assist: 0, threat: 0 },
      bestClearTimeMs: { standard: null, assist: null, threat: null },
      highestThreatCleared: 0,
      bossVictoriesById: {},
      bossDeathsById: {},
      failureSources: {},
      skillSelectionsById: {},
      routeSelectionsByNodeId: {},
    },
    settings: { ...DEFAULT_PROFILE_SETTINGS },
    activeRun: null,
  };
}

export function serializeProfile(profile: PlayerProfile): string {
  validateProfile(profile);
  const body = {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    contentVersion: PROFILE_CONTENT_VERSION,
    profile: structuredClone(profile),
  } as const;
  const envelope: ProfileEnvelope = { ...body, checksum: stableHash(body) };
  return JSON.stringify(envelope);
}

export function restoreProfile(serialized: string): PlayerProfile {
  const envelope = parseEnvelope(serialized);
  if (envelope.schemaVersion !== PROFILE_SCHEMA_VERSION) {
    throw new ProfileSaveError(
      "unsupported-schema",
      `档案结构版本 ${String(envelope.schemaVersion)} 不受支持；原始档案已保留。`,
    );
  }
  if (envelope.contentVersion !== PROFILE_CONTENT_VERSION) {
    throw new ProfileSaveError(
      "unsupported-content",
      `档案内容版本 ${String(envelope.contentVersion)} 与当前版本不兼容；原始档案已保留。`,
    );
  }
  const body = {
    schemaVersion: envelope.schemaVersion,
    contentVersion: envelope.contentVersion,
    profile: envelope.profile,
  };
  if (typeof envelope.checksum !== "string" || stableHash(body) !== envelope.checksum) {
    throw new ProfileSaveError("checksum-mismatch", "档案校验失败；原始档案已保留，需由玩家明确重建。 ");
  }
  validateProfile(envelope.profile);
  return structuredClone(envelope.profile);
}

export function validateProfile(value: unknown): asserts value is PlayerProfile {
  if (!isRecord(value)) throw invalidProfile("档案主体不是对象");
  const profile = value as unknown as PlayerProfile;
  if (
    typeof profile.createdAtIso !== "string" ||
    typeof profile.updatedAtIso !== "string" ||
    !isRecord(profile.discoveries) ||
    !isRecord(profile.unlocks) ||
    !isRecord(profile.statistics) ||
    !isRecord(profile.settings)
  ) throw invalidProfile("缺少核心字段");

  const knownEnemyIds = new Set(enemyDefinitions.list().map((definition) => definition.id));
  const knownEncounterIds = new Set(fullGameEncounterDefinitions.list().map((definition) => definition.id));
  const knownBossIds = new Set(BOSS_DEFINITIONS.map((definition) => definition.id));
  const knownSkillIds = new Set(FULL_GAME_SKILL_DEFINITIONS.map((definition) => definition.id));
  assertUniqueKnownIds(profile.discoveries.enemyDefinitionIds, knownEnemyIds, "Enemy Discovery");
  assertUniqueKnownIds(profile.discoveries.encounterDefinitionIds, knownEncounterIds, "Encounter Discovery");
  assertUniqueKnownIds(profile.discoveries.bossDefinitionIds, knownBossIds, "Boss Discovery");
  assertUniqueKnownIds(profile.unlocks.bossPracticeIds, knownBossIds, "Boss Practice");
  if (!Number.isInteger(profile.unlocks.maximumThreatLevel) || profile.unlocks.maximumThreatLevel < 0 || profile.unlocks.maximumThreatLevel > 5) {
    throw invalidProfile("Threat 解锁等级无效");
  }
  if (
    typeof profile.settings.audioEnabled !== "boolean" ||
    (profile.settings.qualityMode !== "high" && profile.settings.qualityMode !== "compatibility") ||
    typeof profile.settings.reducedMotion !== "boolean" ||
    typeof profile.settings.highContrast !== "boolean"
  ) throw invalidProfile("Settings 无效");

  const statistics = profile.statistics;
  for (const key of ["runSerial", "runsStarted", "runsDefeated", "runsAbandoned", "playerDeaths", "highestThreatCleared"] as const) {
    if (!isNonNegativeInteger(statistics[key])) throw invalidProfile(`统计 ${key} 无效`);
  }
  if (statistics.highestThreatCleared > 5) throw invalidProfile("最高 Threat 记录无效");
  for (const mode of ["standard", "assist", "threat"] as const) {
    if (!isNonNegativeInteger(statistics.clears?.[mode])) throw invalidProfile(`${mode} Clear 统计无效`);
    const best = statistics.bestClearTimeMs?.[mode];
    if (best !== null && (!Number.isFinite(best) || best < 0)) throw invalidProfile(`${mode} Best Time 无效`);
  }
  validateCounterRecord(statistics.bossVictoriesById, knownBossIds, "Boss Victory");
  validateCounterRecord(statistics.bossDeathsById, knownBossIds, "Boss Death");
  validateCounterRecord(statistics.skillSelectionsById, knownSkillIds, "Skill Selection");
  validateCounterRecord(statistics.failureSources, null, "Failure Source");
  validateCounterRecord(statistics.routeSelectionsByNodeId, null, "Route Selection");

  if (profile.activeRun !== null) {
    const run = profile.activeRun;
    if (
      !isRecord(run) ||
      !isNonNegativeInteger(run.serial) ||
      !Number.isSafeInteger(run.seed) ||
      (run.mode !== "standard" && run.mode !== "assist" && run.mode !== "threat") ||
      !isNonNegativeInteger(run.threatLevel) ||
      run.threatLevel > 5
    ) throw invalidProfile("Active Run Journal 无效");
    assertUniqueKnownIds(run.selectedSkillIds, knownSkillIds, "Active Run Skill");
    assertUniqueKnownIds(run.selectedRouteNodeIds, null, "Active Run Route");
  }
}

function parseEnvelope(serialized: string): Record<string, unknown> & Partial<ProfileEnvelope> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new ProfileSaveError("invalid-json", "档案不是有效 JSON；原始档案已保留。");
  }
  if (!isRecord(parsed)) throw new ProfileSaveError("invalid-envelope", "档案外层结构无效；原始档案已保留。");
  return parsed as Record<string, unknown> & Partial<ProfileEnvelope>;
}

function validateCounterRecord(
  value: unknown,
  knownIds: ReadonlySet<string> | null,
  label: string,
): void {
  if (!isRecord(value)) throw invalidProfile(`${label} 不是计数表`);
  for (const [id, count] of Object.entries(value)) {
    if (!id || (knownIds && !knownIds.has(id)) || !isNonNegativeInteger(count)) {
      throw invalidProfile(`${label} 条目无效：${id}`);
    }
  }
}

function assertUniqueKnownIds(
  value: unknown,
  knownIds: ReadonlySet<string> | null,
  label: string,
): asserts value is string[] {
  if (
    !Array.isArray(value) ||
    !value.every((id) => typeof id === "string" && id.length > 0 && (!knownIds || knownIds.has(id))) ||
    new Set(value).size !== value.length
  ) throw invalidProfile(`${label} 列表无效`);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function invalidProfile(detail: string): ProfileSaveError {
  return new ProfileSaveError("invalid-profile", `档案状态无效：${detail}；原始档案已保留。`);
}
