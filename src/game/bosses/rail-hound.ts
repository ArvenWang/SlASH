import { RAIL_HOUND_BOSS_ID, type BossDefinition } from "../../content/bosses/definitions";
import { copyVec2 } from "../../core/math/vec2";
import { clampPointToArena } from "../collision/arena";
import { segmentIntersectsCircle } from "../collision/shapes";
import { resolveArmorContact } from "../combat/armor";
import type { DashState, EnemyState, GameState } from "../domain/types";
import {
  beginBossPhase,
  completeBossRuntime,
  emitBossBreak,
  enterBossActionPhase,
  normalizedDirection,
  progressBossObjective,
} from "./helpers";
import type { BossRuntimeState } from "./types";
import { bossThreatVariationEnabled } from "../difficulty/protocol-system";

export const RAIL_HOUND_TELEGRAPH_MS = 800;
export const RAIL_HOUND_CORE_WINDOW_MS = 1_500;
const RAIL_HOUND_CHARGE_MS = 450;
const RAIL_HOUND_TRANSITION_MS = 350;
const RAIL_HOUND_CHARGE_SPEED = 30;
const EPSILON = 1e-6;

export function createRailHoundRuntime(
  state: GameState,
  definition: BossDefinition,
  entity: EnemyState,
): BossRuntimeState {
  const runtime: BossRuntimeState = {
    definitionId: RAIL_HOUND_BOSS_ID,
    entityId: entity.id,
    startedAtMs: state.elapsedMs,
    phaseId: definition.phases[0]?.id ?? "single-charge",
    phaseIndex: 0,
    actionPhase: "telegraph",
    phaseElapsedMs: 0,
    phaseDurationMs: RAIL_HOUND_TELEGRAPH_MS,
    objectiveCurrent: 0,
    objectiveTarget: 1,
    breakCount: 0,
    attackSequence: 0,
    lockedTarget: copyVec2(state.player.position),
    lockedDirection: normalizedDirection(entity.position, state.player.position, entity.facing),
    coreExposed: false,
    completed: false,
    transitionCount: 0,
    mechanics: {
      kind: "rail-hound",
      chargeIndex: 0,
      chargesThisCycle: railChargeCount(state, 0),
    },
  };
  entity.facing = copyVec2(runtime.lockedDirection);
  beginBossPhase(state, runtime, runtime.phaseId, 0, 1);
  beginTelegraph(state, runtime, entity);
  return runtime;
}

export function advanceRailHound(
  state: GameState,
  runtime: BossRuntimeState,
  entity: EnemyState,
  deltaMs: number,
): string | null {
  if (runtime.completed || runtime.mechanics.kind !== "rail-hound") return null;
  const safeDelta = Math.max(0, deltaMs);
  runtime.phaseElapsedMs += safeDelta;

  if (runtime.actionPhase === "active") {
    const previous = copyVec2(entity.position);
    const seconds = safeDelta / 1_000;
    entity.position = clampPointToArena({
      x: entity.position.x + runtime.lockedDirection.x * RAIL_HOUND_CHARGE_SPEED * seconds,
      z: entity.position.z + runtime.lockedDirection.z * RAIL_HOUND_CHARGE_SPEED * seconds,
    // The recovery core must remain approachable from both sides. Keeping the
    // charge endpoint inside a five-unit inset prevents a wall from deleting
    // one half of the authored side-core window.
    }, state.stage.arena, entity.radius + 5);
    if (
      state.player.dash === null &&
      segmentIntersectsCircle(previous, entity.position, state.player.position, entity.radius + state.player.radius)
    ) return entity.id;
  }

  if (runtime.phaseElapsedMs + EPSILON < runtime.phaseDurationMs) return null;
  if (runtime.actionPhase === "telegraph") {
    enterBossActionPhase(state, runtime, "active", RAIL_HOUND_CHARGE_MS, runtime.lockedTarget);
  } else if (runtime.actionPhase === "active") {
    runtime.mechanics.chargeIndex += 1;
    if (runtime.mechanics.chargeIndex < runtime.mechanics.chargesThisCycle) {
      beginTelegraph(state, runtime, entity);
    } else {
      enterBossActionPhase(state, runtime, "vulnerable", RAIL_HOUND_CORE_WINDOW_MS, null);
    }
  } else if (runtime.actionPhase === "vulnerable") {
    enterBossActionPhase(state, runtime, "transition", RAIL_HOUND_TRANSITION_MS, null);
  } else if (runtime.actionPhase === "transition" || runtime.actionPhase === "recovery") {
    beginTelegraph(state, runtime, entity);
  }
  return null;
}

export function resolveRailHoundDashContact(
  state: GameState,
  runtime: BossRuntimeState,
  entity: EnemyState,
  dash: DashState,
  segmentStart: { x: number; z: number },
  segmentEnd: { x: number; z: number },
): boolean {
  if (runtime.mechanics.kind !== "rail-hound" || entity.id !== runtime.entityId) return false;
  if (runtime.completed || runtime.actionPhase !== "vulnerable") return true;
  const contact = resolveArmorContact(
    entity,
    segmentStart,
    segmentEnd,
    null,
    entity.radius + dash.hitRadius,
  );
  if (contact.contactRegion !== "left" && contact.contactRegion !== "right") return true;

  progressBossObjective(state, runtime, runtime.objectiveCurrent + 1, "core-hit");
  emitBossBreak(state, runtime, entity.position);
  if (runtime.breakCount >= 3) {
    completeBossRuntime(state, runtime);
    return true;
  }
  runtime.transitionCount += 1;
  runtime.mechanics.chargeIndex = 0;
  runtime.mechanics.chargesThisCycle = railChargeCount(state, runtime.breakCount);
  if (runtime.breakCount === 1) {
    beginBossPhase(state, runtime, "double-charge", 1, 2);
  }
  enterBossActionPhase(state, runtime, "transition", RAIL_HOUND_TRANSITION_MS, null);
  return true;
}

function railChargeCount(state: GameState, breakCount: number): number {
  const base = breakCount >= 1 ? 2 : 1;
  return base + (bossThreatVariationEnabled(state) ? 1 : 0);
}

function beginTelegraph(state: GameState, runtime: BossRuntimeState, entity: EnemyState): void {
  if (runtime.mechanics.kind !== "rail-hound") return;
  runtime.attackSequence += 1;
  runtime.lockedTarget = copyVec2(state.player.position);
  runtime.lockedDirection = normalizedDirection(entity.position, state.player.position, entity.facing);
  entity.facing = copyVec2(runtime.lockedDirection);
  enterBossActionPhase(state, runtime, "telegraph", RAIL_HOUND_TELEGRAPH_MS, runtime.lockedTarget);
}
