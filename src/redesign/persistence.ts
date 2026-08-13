import { REDESIGN_CONTENT_VERSION } from "./run";
import type { GameState } from "./state";
import { STATE_VERSION } from "./state";
import { stableHash32 } from "./math";
import { SKILL_POOL_VERSION, createRewardOffer, validateBuild } from "./skills";

export const SAVE_STORAGE_KEY = "project-slash:run:v2.1";
export const SAVE_BACKUP_PREFIX = "project-slash:run:v2.1:backup";
export const SAVE_SCHEMA_VERSION = 3 as const;

export interface SaveEnvelope {
  readonly schemaVersion: typeof SAVE_SCHEMA_VERSION;
  readonly contentVersion: typeof REDESIGN_CONTENT_VERSION;
  readonly skillPoolVersion: typeof SKILL_POOL_VERSION;
  readonly savedAt: string;
  readonly checksum: string;
  readonly state: GameState;
}

export type SaveLoadResult =
  | { readonly ok: true; readonly state: GameState; readonly savedAt: string }
  | { readonly ok: false; readonly reason: "missing" | "invalid-json" | "invalid-envelope" | "version-mismatch" | "checksum-mismatch" | "invalid-state"; readonly message: string; readonly raw: string | null };

export interface StoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function saveGame(storage: StoragePort, state: GameState): SaveEnvelope {
  const safeState = normalizedState(state);
  validateSavedState(safeState);
  const payload = {
    schemaVersion: SAVE_SCHEMA_VERSION,
    contentVersion: REDESIGN_CONTENT_VERSION,
    skillPoolVersion: SKILL_POOL_VERSION,
    savedAt: new Date().toISOString(),
    state: safeState,
  } as const;
  const envelope: SaveEnvelope = {
    ...payload,
    checksum: checksum(payload),
  };
  storage.setItem(SAVE_STORAGE_KEY, JSON.stringify(envelope));
  return envelope;
}

export function loadGame(storage: StoragePort): SaveLoadResult {
  const raw = storage.getItem(SAVE_STORAGE_KEY);
  if (raw === null) return failure("missing", "没有可继续的游戏。", null);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return failure("invalid-json", "本地存档已损坏，原文已保留。", raw);
  }
  if (!isRecord(parsed) || !isRecord(parsed.state)) {
    return failure("invalid-envelope", "本地存档结构无效，原文已保留。", raw);
  }
  if (
    parsed.schemaVersion !== SAVE_SCHEMA_VERSION
    || parsed.contentVersion !== REDESIGN_CONTENT_VERSION
    || parsed.skillPoolVersion !== SKILL_POOL_VERSION
  ) {
    return failure("version-mismatch", "本地存档来自旧版本，原文已保留。", raw);
  }
  const payload = {
    schemaVersion: parsed.schemaVersion,
    contentVersion: parsed.contentVersion,
    skillPoolVersion: parsed.skillPoolVersion,
    savedAt: parsed.savedAt,
    state: parsed.state,
  };
  if (typeof parsed.checksum !== "string" || parsed.checksum !== checksum(payload)) {
    return failure("checksum-mismatch", "本地存档校验失败，原文已保留。", raw);
  }
  try {
    validateSavedState(parsed.state);
  } catch {
    return failure("invalid-state", "本地存档状态无效，原文已保留。", raw);
  }
  return {
    ok: true,
    state: structuredClone(parsed.state as unknown as GameState),
    savedAt: String(parsed.savedAt),
  };
}

export function clearSave(storage: StoragePort): void {
  storage.removeItem(SAVE_STORAGE_KEY);
}

export function backupInvalidSave(storage: StoragePort, raw: string): string {
  const key = `${SAVE_BACKUP_PREFIX}:${new Date().toISOString()}`;
  storage.setItem(key, raw);
  storage.removeItem(SAVE_STORAGE_KEY);
  return key;
}

function normalizedState(state: GameState): GameState {
  const clone = structuredClone(state);
  clone.accumulatorMs = 0;
  clone.events = [];
  return clone;
}

function validateSavedState(value: unknown): asserts value is GameState {
  if (!isRecord(value) || value.version !== STATE_VERSION || typeof value.phase !== "string") {
    throw new Error("Invalid V2.1 state root.");
  }
  const state = value as unknown as GameState;
  if (!["combat", "reward"].includes(state.phase)) throw new Error("Only active runs can be continued.");
  if (!Number.isSafeInteger(state.run?.seed) || !Number.isInteger(state.run?.encounterIndex)) throw new Error("Invalid run state.");
  if (state.run.encounterIndex < 0 || state.run.encounterIndex > 8) throw new Error("Invalid encounter index.");
  if (!Array.isArray(state.run.completedEncounterIds) || !Array.isArray(state.run.selectedUpgradeIds)) throw new Error("Invalid run history.");
  validateBuild(state.run.build);
  if (state.run.selectedUpgradeIds.join("|") !== state.run.build.selectedUpgradeIds.join("|")) throw new Error("Build history mismatch.");
  if (!isRecord(state.player) || !Array.isArray(state.enemies) || !Array.isArray(state.projectiles) || !Array.isArray(state.obstacles)) {
    throw new Error("Invalid combat state.");
  }
  if (![state.player.moveInput?.x, state.player.moveInput?.z, state.player.moveVelocity?.x, state.player.moveVelocity?.z].every(Number.isFinite)) {
    throw new Error("Invalid player movement state.");
  }
  if (state.player.bufferedPrimary !== null && (
    !isRecord(state.player.bufferedPrimary)
    || ![state.player.bufferedPrimary.target?.x, state.player.bufferedPrimary.target?.z].every(Number.isFinite)
    || typeof state.player.bufferedPrimary.held !== "boolean"
  )) throw new Error("Invalid buffered primary input.");
  for (const body of [state.player, ...state.enemies, ...state.projectiles, ...(state.boss ? [state.boss, ...state.boss.parts] : [])]) {
    if (![body.height, body.verticalVelocity, body.gravity].every(Number.isFinite)
      || typeof body.supported !== "boolean" || typeof body.grounded !== "boolean") {
      throw new Error("Invalid vertical body state.");
    }
  }
  if (state.boss && (
    !Number.isInteger(state.boss.currentHp)
    || !Number.isInteger(state.boss.maximumHp)
    || state.boss.currentHp < 0
    || state.boss.currentHp > state.boss.maximumHp
    || state.boss.maximumHp <= 1
  )) throw new Error("Invalid Boss health.");
  if (state.phase === "reward" && (!state.run.activeOffer || state.run.activeOffer.rewardIndex !== state.run.selectedUpgradeIds.length)) {
    throw new Error("Invalid reward state.");
  }
  if (state.phase === "reward" && state.run.activeOffer) {
    const reconstructed = createRewardOffer(state.run.seed, state.run.activeOffer.rewardIndex, state.run.build);
    if (JSON.stringify(reconstructed) !== JSON.stringify(state.run.activeOffer)) throw new Error("Reward offer cannot be reconstructed.");
  }
}

function checksum(payload: unknown): string {
  return stableHash32(JSON.stringify(payload)).toString(16).padStart(8, "0");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function failure(
  reason: Exclude<SaveLoadResult, { ok: true }>["reason"],
  message: string,
  raw: string | null,
): SaveLoadResult {
  return { ok: false, reason, message, raw };
}
