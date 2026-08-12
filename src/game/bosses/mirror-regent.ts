import { MIRROR_REGENT_BOSS_ID, type BossDefinition } from "../../content/bosses/definitions";
import { MIRROR_REGENT_BOSS_ENEMY_ID } from "../../content/enemies/definitions";
import { copyVec2 } from "../../core/math/vec2";
import { segmentIntersectsCircle } from "../collision/shapes";
import type { DashState, EnemyState, GameState, UltimatePathSegment } from "../domain/types";
import { emitGameEvent } from "../events/event-buffer";
import {
  beginBossPhase,
  completeBossRuntime,
  emitBossBreak,
  enterBossActionPhase,
  progressBossObjective,
  spawnBossAuxiliaryEnemy,
} from "./helpers";
import type { BossRuntimeState } from "./types";
import {
  bossThreatVariationEnabled,
  telegraphDurationScale,
} from "../difficulty/protocol-system";

export const MIRROR_SLASH_TELEGRAPH_MS = 800;
const MIRROR_SLASH_ACTIVE_MS = 150;
const MIRROR_SLASH_RECOVERY_MS = 450;
const MIRROR_HIT_TRANSITION_MS = 550;
const MIRROR_SLASH_RADIUS = 0.72;
const EPSILON = 1e-6;

const FORMATION_POSITIONS = [
  { x: -8, z: -5 },
  { x: 8, z: -5 },
  { x: -8, z: 6 },
  { x: 8, z: 6 },
] as const;

const THREAT_FORMATION_POSITIONS = [
  { x: -9, z: -5 },
  { x: 9, z: -5 },
  { x: -9, z: 6 },
  { x: 9, z: 6 },
  { x: 0, z: 0 },
] as const;

export function createMirrorRegentRuntime(
  state: GameState,
  definition: BossDefinition,
  entity: EnemyState,
): BossRuntimeState {
  const runtime: BossRuntimeState = {
    definitionId: MIRROR_REGENT_BOSS_ID,
    entityId: entity.id,
    startedAtMs: state.elapsedMs,
    phaseId: definition.phases[0]?.id ?? "mirror-cycle",
    phaseIndex: 0,
    actionPhase: "objective",
    phaseElapsedMs: 0,
    phaseDurationMs: 0,
    objectiveCurrent: 0,
    objectiveTarget: 3,
    breakCount: 0,
    attackSequence: 0,
    lockedTarget: null,
    lockedDirection: copyVec2(entity.facing),
    coreExposed: true,
    completed: false,
    transitionCount: 0,
    mechanics: {
      kind: "mirror-regent",
      cycle: 0,
      realEntityId: entity.id,
      cloneEntityIds: [],
      mirrorSlash: null,
      respawnDelayMs: 0,
    },
  };
  beginBossPhase(state, runtime, runtime.phaseId, 0, 3);
  enterBossActionPhase(state, runtime, "objective", 0, null);
  runtime.coreExposed = true;
  placeMirrorFormation(state, runtime, entity);
  return runtime;
}

export function advanceMirrorRegent(
  state: GameState,
  runtime: BossRuntimeState,
  entity: EnemyState,
  deltaMs: number,
): string | null {
  if (runtime.completed || runtime.mechanics.kind !== "mirror-regent") return null;
  const safeDelta = Math.max(0, deltaMs);
  runtime.phaseElapsedMs += safeDelta;

  if (runtime.actionPhase === "transition") {
    if (runtime.phaseElapsedMs + EPSILON >= runtime.phaseDurationMs) {
      runtime.mechanics.cycle += 1;
      placeMirrorFormation(state, runtime, entity);
      enterBossActionPhase(state, runtime, "objective", 0, null);
      runtime.coreExposed = true;
    }
    return null;
  }

  const slash = runtime.mechanics.mirrorSlash;
  if (slash) {
    slash.elapsedMs += safeDelta;
    if (slash.phase === "telegraph" && slash.elapsedMs + EPSILON >= slash.durationMs) {
      slash.phase = "active";
      slash.elapsedMs = 0;
      slash.durationMs = MIRROR_SLASH_ACTIVE_MS;
      enterBossActionPhase(state, runtime, "active", MIRROR_SLASH_ACTIVE_MS, null);
      emitMirrorSlashEvent(state, runtime, "active", slash.segments, MIRROR_SLASH_ACTIVE_MS);
    } else if (slash.phase === "active") {
      if (
        state.player.dash === null &&
        slash.segments.some((segment) => segmentIntersectsCircle(
          segment.from,
          segment.to,
          state.player.position,
          state.player.radius + MIRROR_SLASH_RADIUS,
        ))
      ) return `${runtime.entityId}:mirror-slash`;
      if (slash.elapsedMs + EPSILON >= slash.durationMs) {
        emitMirrorSlashEvent(state, runtime, "expired", slash.segments, 0);
        runtime.mechanics.mirrorSlash = null;
        enterBossActionPhase(state, runtime, "recovery", MIRROR_SLASH_RECOVERY_MS, null);
      }
    }
    return null;
  }

  if (runtime.actionPhase === "recovery" && runtime.phaseElapsedMs + EPSILON >= runtime.phaseDurationMs) {
    enterBossActionPhase(state, runtime, "objective", 0, null);
    runtime.coreExposed = true;
  }
  return null;
}

export function resolveMirrorRegentDashContact(
  state: GameState,
  runtime: BossRuntimeState,
  entity: EnemyState,
  _dash: DashState,
): boolean {
  if (runtime.mechanics.kind !== "mirror-regent") return false;
  if (entity.id !== runtime.entityId && !runtime.mechanics.cloneEntityIds.includes(entity.id)) return false;
  if (runtime.completed) return true;
  if (entity.id !== runtime.mechanics.realEntityId) {
    entity.alive = false;
    entity.state = "dead";
    entity.killedAtMs = state.elapsedMs;
    emitGameEvent(state, {
      type: "boss-clone-state",
      bossDefinitionId: runtime.definitionId,
      entityId: entity.id,
      isReal: false,
      active: false,
    });
    return true;
  }
  if (runtime.actionPhase !== "objective" && runtime.actionPhase !== "recovery") return true;

  progressBossObjective(state, runtime, runtime.objectiveCurrent + 1, "true-body-hit");
  emitBossBreak(state, runtime, entity.position);
  if (runtime.objectiveCurrent >= runtime.objectiveTarget) {
    completeBossRuntime(state, runtime);
    return true;
  }
  dismissClones(state, runtime);
  runtime.mechanics.mirrorSlash = null;
  runtime.coreExposed = false;
  runtime.transitionCount += 1;
  enterBossActionPhase(state, runtime, "transition", MIRROR_HIT_TRANSITION_MS, null);
  return true;
}

export function recordMirrorRegentDash(
  state: GameState,
  runtime: BossRuntimeState,
  dash: DashState,
): void {
  if (
    runtime.completed ||
    runtime.mechanics.kind !== "mirror-regent" ||
    runtime.actionPhase !== "objective" ||
    runtime.mechanics.mirrorSlash !== null ||
    dash.resolvedEnemyIds.includes(runtime.mechanics.realEntityId)
  ) return;
  const segments = dash.pathSegments.map((segment) => ({
    from: copyVec2(segment.from),
    to: copyVec2(segment.to),
  }));
  if (segments.length === 0) return;
  const telegraphDurationMs = MIRROR_SLASH_TELEGRAPH_MS * telegraphDurationScale(state);
  runtime.mechanics.mirrorSlash = {
    phase: "telegraph",
    elapsedMs: 0,
    durationMs: telegraphDurationMs,
    segments,
  };
  runtime.attackSequence += 1;
  enterBossActionPhase(state, runtime, "telegraph", MIRROR_SLASH_TELEGRAPH_MS, null);
  emitMirrorSlashEvent(state, runtime, "telegraph", segments, telegraphDurationMs);
}

function placeMirrorFormation(state: GameState, runtime: BossRuntimeState, entity: EnemyState): void {
  if (runtime.mechanics.kind !== "mirror-regent") return;
  dismissClones(state, runtime);
  const positions = bossThreatVariationEnabled(state)
    ? THREAT_FORMATION_POSITIONS
    : FORMATION_POSITIONS;
  const realSlot = runtime.mechanics.cycle % positions.length;
  entity.position = copyVec2(positions[realSlot]!);
  entity.alive = true;
  entity.state = "active";
  entity.killedAtMs = null;
  emitGameEvent(state, {
    type: "boss-clone-state",
    bossDefinitionId: runtime.definitionId,
    entityId: entity.id,
    isReal: true,
    active: true,
  });
  const cloneIds: string[] = [];
  positions.forEach((position, slot) => {
    if (slot === realSlot) return;
    const id = `${runtime.entityId}:cycle-${runtime.mechanics.kind === "mirror-regent" ? runtime.mechanics.cycle : 0}:clone-${slot}`;
    cloneIds.push(id);
    spawnBossAuxiliaryEnemy(state, {
      id,
      definitionId: MIRROR_REGENT_BOSS_ENEMY_ID,
      position,
      facing: { x: 0, z: -1 },
    });
    emitGameEvent(state, {
      type: "boss-clone-state",
      bossDefinitionId: runtime.definitionId,
      entityId: id,
      isReal: false,
      active: true,
    });
  });
  runtime.mechanics.cloneEntityIds = cloneIds;
}

function dismissClones(state: GameState, runtime: BossRuntimeState): void {
  if (runtime.mechanics.kind !== "mirror-regent") return;
  for (const cloneId of runtime.mechanics.cloneEntityIds) {
    const clone = state.enemies.find((enemy) => enemy.id === cloneId);
    if (!clone?.alive) continue;
    clone.alive = false;
    clone.state = "dead";
    clone.killedAtMs = state.elapsedMs;
    emitGameEvent(state, {
      type: "boss-clone-state",
      bossDefinitionId: runtime.definitionId,
      entityId: clone.id,
      isReal: false,
      active: false,
    });
  }
}

function emitMirrorSlashEvent(
  state: GameState,
  runtime: BossRuntimeState,
  phase: "telegraph" | "active" | "expired",
  segments: readonly UltimatePathSegment[],
  durationMs: number,
): void {
  emitGameEvent(state, {
    type: "boss-mirror-slash",
    bossDefinitionId: runtime.definitionId,
    phase,
    segments: segments.map((segment) => ({ from: copyVec2(segment.from), to: copyVec2(segment.to) })),
    durationMs,
  });
}
