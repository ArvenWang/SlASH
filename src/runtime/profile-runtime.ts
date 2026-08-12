import { bossDefinitions } from "../content/bosses/definitions";
import { enemyDefinitions } from "../content/enemies/definitions";
import type { GameEvent, GameState } from "../game/domain/types";
import {
  PROFILE_CORRUPT_BACKUP_PREFIX,
  PROFILE_STORAGE_KEY,
  ProfileSaveError,
  createDefaultProfile,
  restoreProfile,
  serializeProfile,
} from "../game/profile/profile-save";
import type { PlayerProfile, ProfileSettings } from "../game/profile/types";

export interface ProfileStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type ProfileRuntimeStatus =
  | { readonly kind: "ready" }
  | { readonly kind: "error"; readonly message: string; readonly rawPreserved: true };

export interface ProfileRuntime {
  profile(): Readonly<PlayerProfile>;
  status(): ProfileRuntimeStatus;
  observe(state: GameState, events: readonly GameEvent[]): void;
  updateSettings(patch: Partial<ProfileSettings>): { readonly ok: true } | { readonly ok: false; readonly message: string };
  rebuildCorruptProfile(): { readonly ok: true; readonly backupKey: string | null } | { readonly ok: false; readonly message: string };
}

export function createProfileRuntime(
  storage: ProfileStorage,
  now: () => Date = () => new Date(),
): ProfileRuntime {
  let raw: string | null = null;
  let state = createDefaultProfile(now().toISOString());
  let error: string | null = null;
  try {
    raw = storage.getItem(PROFILE_STORAGE_KEY);
    if (raw === null) storage.setItem(PROFILE_STORAGE_KEY, serializeProfile(state));
    else state = restoreProfile(raw);
  } catch (caught) {
    error = profileErrorMessage(caught);
  }

  function persist(): boolean {
    if (error !== null) return false;
    state.updatedAtIso = now().toISOString();
    try {
      storage.setItem(PROFILE_STORAGE_KEY, serializeProfile(state));
      return true;
    } catch (caught) {
      error = profileErrorMessage(caught);
      return false;
    }
  }

  function observe(game: GameState, events: readonly GameEvent[]): void {
    if (error !== null) return;
    let changed = events.some((event) => event.type === "campaign-started")
      ? false
      : ensureCurrentRunJournal(game);
    for (const enemy of game.enemies) {
      if (!enemyDefinitions.has(enemy.definitionId)) continue;
      changed = addUnique(state.discoveries.enemyDefinitionIds, enemy.definitionId) || changed;
    }
    const activeBoss = game.run.fullGame?.activeBoss;
    if (activeBoss && bossDefinitions.has(activeBoss.definitionId)) {
      changed = addUnique(state.discoveries.bossDefinitionIds, activeBoss.definitionId) || changed;
      changed = addUnique(state.unlocks.bossPracticeIds, activeBoss.definitionId) || changed;
    }
    const committed = game.run.fullGame?.skills.committedSkillIds ?? [];
    const journal = state.activeRun;
    if (journal) {
      for (const skillId of committed) {
        if (addUnique(journal.selectedSkillIds, skillId)) {
          increment(state.statistics.skillSelectionsById, skillId);
          changed = true;
        }
      }
    }

    for (const event of events) {
      if (event.type === "campaign-started") {
        state.statistics.runSerial += 1;
        state.statistics.runsStarted += 1;
        state.activeRun = {
          serial: state.statistics.runSerial,
          seed: event.seed,
          mode: event.protocolMode,
          threatLevel: event.threatLevel,
          selectedSkillIds: [],
          selectedRouteNodeIds: [],
        };
        changed = true;
      } else if (event.type === "route-node-started") {
        changed = addUnique(state.discoveries.encounterDefinitionIds, event.encounterId) || changed;
        if (state.activeRun && addUnique(state.activeRun.selectedRouteNodeIds, event.nodeId)) {
          increment(state.statistics.routeSelectionsByNodeId, event.nodeId);
          changed = true;
        }
      } else if (event.type === "player-died") {
        if (game.run.fullGame?.practiceBossDefinitionId === null) {
          state.statistics.playerDeaths += 1;
          increment(state.statistics.failureSources, failureSource(game, event.enemyId));
          const bossId = game.run.fullGame?.activeBoss?.definitionId;
          if (bossId && bossDefinitions.has(bossId)) increment(state.statistics.bossDeathsById, bossId);
          changed = true;
        }
      } else if (event.type === "boss-victory") {
        if (game.run.fullGame?.practiceBossDefinitionId === null) {
          increment(state.statistics.bossVictoriesById, event.bossDefinitionId);
        }
        addUnique(state.discoveries.bossDefinitionIds, event.bossDefinitionId);
        changed = true;
        changed = addUnique(state.unlocks.bossPracticeIds, event.bossDefinitionId) || changed;
      } else if (event.type === "campaign-victory") {
        const protocol = game.run.fullGame?.protocol;
        const mode = protocol?.mode ?? state.activeRun?.mode ?? "standard";
        state.statistics.clears[mode] += 1;
        const best = state.statistics.bestClearTimeMs[mode];
        if (best === null || game.elapsedMs < best) state.statistics.bestClearTimeMs[mode] = game.elapsedMs;
        if (mode === "standard") state.unlocks.maximumThreatLevel = 5;
        if (mode === "threat") {
          state.statistics.highestThreatCleared = Math.max(
            state.statistics.highestThreatCleared,
            protocol?.threatLevel ?? state.activeRun?.threatLevel ?? 0,
          );
        }
        state.activeRun = null;
        changed = true;
      } else if (event.type === "campaign-returned-to-title") {
        if (event.fromPhase === "defeat" && state.activeRun !== null) state.statistics.runsDefeated += 1;
        state.activeRun = null;
        changed = true;
      } else if (event.type === "campaign-abandoned") {
        state.statistics.runsAbandoned += 1;
        state.activeRun = null;
        changed = true;
      }
    }
    if (changed) persist();
  }

  function ensureCurrentRunJournal(game: GameState): boolean {
    const campaign = game.run.fullGame;
    if (!campaign || campaign.phase === "title" || campaign.practiceBossDefinitionId !== null || state.activeRun) return false;
    state.statistics.runSerial += 1;
    state.statistics.runsStarted += 1;
    state.activeRun = {
      serial: state.statistics.runSerial,
      seed: game.run.seed,
      mode: campaign.protocol.mode,
      threatLevel: campaign.protocol.threatLevel,
      selectedSkillIds: [],
      selectedRouteNodeIds: [...campaign.routeProgress.completedNodeIds],
    };
    return true;
  }

  return {
    profile: () => state,
    status: () => error === null
      ? { kind: "ready" }
      : { kind: "error", message: error, rawPreserved: true },
    observe,
    updateSettings(patch) {
      if (error !== null) return { ok: false, message: error };
      const next = { ...state.settings, ...patch };
      if (
        typeof next.audioEnabled !== "boolean" ||
        (next.qualityMode !== "high" && next.qualityMode !== "compatibility") ||
        typeof next.reducedMotion !== "boolean" ||
        typeof next.highContrast !== "boolean"
      ) return { ok: false, message: "设置值无效，未写入档案。" };
      state.settings = next;
      return persist() ? { ok: true } : { ok: false, message: error ?? "设置写入失败。" };
    },
    rebuildCorruptProfile() {
      if (error === null) return { ok: true, backupKey: null };
      try {
        const backupKey = raw === null
          ? null
          : `${PROFILE_CORRUPT_BACKUP_PREFIX}${now().toISOString()}`;
        if (backupKey && raw !== null) storage.setItem(backupKey, raw);
        state = createDefaultProfile(now().toISOString());
        error = null;
        storage.setItem(PROFILE_STORAGE_KEY, serializeProfile(state));
        raw = serializeProfile(state);
        return { ok: true, backupKey };
      } catch (caught) {
        error = profileErrorMessage(caught);
        return { ok: false, message: error };
      }
    },
  };
}

function failureSource(game: GameState, sourceId: string): string {
  const enemy = game.enemies.find((candidate) => candidate.id === sourceId);
  if (enemy) return `enemy:${enemy.definitionId}`;
  const projectile = game.projectiles.find((candidate) => candidate.id === sourceId);
  if (projectile) return `projectile:${projectile.definitionId}`;
  const hazard = game.hazards.find((candidate) => candidate.id === sourceId);
  if (hazard) return `hazard:${hazard.definitionId}`;
  const boss = game.run.fullGame?.activeBoss;
  if (boss && sourceId.startsWith(boss.entityId)) return `boss:${boss.definitionId}`;
  return `source:${sourceId}`;
}

function addUnique(values: string[], value: string): boolean {
  if (values.includes(value)) return false;
  values.push(value);
  values.sort();
  return true;
}

function increment(record: Record<string, number>, id: string): void {
  record[id] = (record[id] ?? 0) + 1;
}

function profileErrorMessage(error: unknown): string {
  if (error instanceof ProfileSaveError) return error.message;
  return `本地档案操作失败：${error instanceof Error ? error.message : String(error)}`;
}
