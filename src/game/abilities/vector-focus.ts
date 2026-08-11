import { VECTOR_FOCUS_ABILITY_ID } from "../../content/abilities/definitions";
import { copyVec2, squaredDistance, type Vec2 } from "../../core/math/vec2";
import { clampPointToArena } from "../collision/arena";
import { segmentIntersectsCircle } from "../collision/shapes";
import { hasIntactArmor } from "../combat/armor";
import type { DashState, GameCommandResult, GameState, UltimatePathSegment } from "../domain/types";
import { emitGameEvent } from "../events/event-buffer";
import { DASH_HIT_RADIUS } from "../rules/constants";
import { getDashDurationMs } from "./dash-slash";

export const VECTOR_FOCUS_ENERGY_COST = 100;
export const VECTOR_FOCUS_BASE_POINTS = 3;
export const VECTOR_FOCUS_ADDITIONAL_POINTS = 4;
export const VECTOR_FOCUS_PLANNING_MS = 3_000;
export const VECTOR_FOCUS_TACTICAL_PLANNING_MS = 3_750;
export const VECTOR_FOCUS_WORLD_TIME_SCALE = 0.12;
export const VECTOR_FOCUS_MIN_SEGMENT_DISTANCE = 1;
export const VECTOR_ECHO_DELAY_MS = 400;
export const ULTIMATE_CROSS_RADIUS = 2.5;

const EPSILON = 1e-8;

export function startVectorFocus(state: GameState): GameCommandResult {
  if (
    state.stage.phase !== "playing" ||
    state.player.hp === 0 ||
    state.player.ultimateEnergy < VECTOR_FOCUS_ENERGY_COST ||
    state.player.dash !== null ||
    state.player.charge !== null ||
    state.player.ultimatePlanning !== null ||
    state.player.ultimateExecution !== null ||
    state.player.recoveryRemainingMs > EPSILON ||
    state.player.abilities.ultimate?.abilityId !== VECTOR_FOCUS_ABILITY_ID
  ) {
    return "ignored";
  }
  const requiredPointCount = hasSkill(state, "skill-additional-ultimate-slash-v1")
    ? VECTOR_FOCUS_ADDITIONAL_POINTS
    : VECTOR_FOCUS_BASE_POINTS;
  const durationMs = hasSkill(state, "skill-tactical-window-v1")
    ? VECTOR_FOCUS_TACTICAL_PLANNING_MS
    : VECTOR_FOCUS_PLANNING_MS;
  state.player.ultimatePlanning = {
    abilityId: VECTOR_FOCUS_ABILITY_ID,
    startedAtTick: state.tick,
    elapsedMs: 0,
    durationMs,
    requiredPointCount,
    worldTimeScale: VECTOR_FOCUS_WORLD_TIME_SCALE,
    points: [],
  };
  state.player.bufferedAbility = null;
  emitGameEvent(state, {
    type: "ultimate-planning-started",
    abilityId: VECTOR_FOCUS_ABILITY_ID,
    requiredPointCount,
    durationMs,
    worldTimeScale: VECTOR_FOCUS_WORLD_TIME_SCALE,
  });
  return "ultimate-planning-started";
}

export function addVectorFocusPoint(state: GameState, target: Vec2): GameCommandResult {
  const planning = state.player.ultimatePlanning;
  if (!planning || state.player.hp === 0) return "ignored";
  const point = clampPointToArena(target, state.stage.arena, state.player.radius);
  const previous = planning.points.at(-1) ?? state.player.position;
  if (squaredDistance(previous, point) < VECTOR_FOCUS_MIN_SEGMENT_DISTANCE ** 2) return "ignored";
  planning.points.push(copyVec2(point));
  emitGameEvent(state, {
    type: "ultimate-point-added",
    abilityId: planning.abilityId,
    pointIndex: planning.points.length - 1,
    point: copyVec2(point),
  });
  if (planning.points.length < planning.requiredPointCount) return "ultimate-point-added";

  const before = state.player.ultimateEnergy;
  state.player.ultimateEnergy = before - VECTOR_FOCUS_ENERGY_COST;
  emitGameEvent(state, {
    type: "ultimate-energy-changed",
    before,
    after: state.player.ultimateEnergy,
    source: "vector-focus-commit",
  });
  state.player.ultimatePlanning = null;
  state.player.ultimateExecution = {
    abilityId: VECTOR_FOCUS_ABILITY_ID,
    points: planning.points.map(copyVec2),
    segmentIndex: 0,
    killCount: 0,
    completedSegments: [],
    crossCascadeTriggered: false,
  };
  beginVectorFocusSegment(state);
  return "ultimate-executing";
}

export function cancelVectorFocus(state: GameState, reason = "input-cancelled"): GameCommandResult {
  const planning = state.player.ultimatePlanning;
  if (!planning) return "ignored";
  state.player.ultimatePlanning = null;
  emitGameEvent(state, {
    type: "ultimate-planning-cancelled",
    abilityId: planning.abilityId,
    reason,
  });
  return "ultimate-cancelled";
}

export function advanceVectorFocusPlanning(state: GameState, deltaMs: number): void {
  const planning = state.player.ultimatePlanning;
  if (!planning) return;
  planning.elapsedMs = Math.min(planning.durationMs, planning.elapsedMs + Math.max(0, deltaMs));
  if (planning.elapsedMs + EPSILON >= planning.durationMs) cancelVectorFocus(state, "planning-timeout");
}

/** Called after the shared Dash runtime reaches the current Vector endpoint. */
export function completeVectorFocusSegment(state: GameState, completedDash: DashState): void {
  const execution = state.player.ultimateExecution;
  if (!execution || completedDash.abilityId !== VECTOR_FOCUS_ABILITY_ID) return;
  const completedSegment = { from: copyVec2(completedDash.from), to: copyVec2(completedDash.to) };
  if (hasSkill(state, "skill-cross-cascade-v1") && !execution.crossCascadeTriggered) {
    const intersection = firstInternalIntersection(completedSegment, execution.completedSegments);
    if (intersection) {
      execution.crossCascadeTriggered = true;
      resolveUltimateCrossShock(state, intersection);
      emitGameEvent(state, {
        type: "ultimate-cross-triggered",
        abilityId: VECTOR_FOCUS_ABILITY_ID,
        position: copyVec2(intersection),
      });
    }
  }
  execution.completedSegments.push(completedSegment);
  if (execution.segmentIndex + 1 < execution.points.length) {
    execution.segmentIndex += 1;
    beginVectorFocusSegment(state);
    return;
  }

  const segmentCount = execution.completedSegments.length;
  const killCount = execution.killCount;
  if (hasSkill(state, "skill-vector-echo-v1")) {
    const finalSegment = execution.completedSegments.at(-1);
    if (finalSegment) {
      state.combat.scheduledSlashes.push({
        id: `vector-echo:${state.tick}:${state.eventSequence + 1}`,
        executeAtMs: state.elapsedMs + VECTOR_ECHO_DELAY_MS,
        from: copyVec2(finalSegment.from),
        to: copyVec2(finalSegment.to),
        hitRadius: DASH_HIT_RADIUS,
        attackId: "skill-vector-echo-v1",
      });
    }
  }
  if (hasSkill(state, "skill-residual-charge-v1") && killCount >= 3) {
    const before = state.player.ultimateEnergy;
    state.player.ultimateEnergy = 20;
    emitGameEvent(state, {
      type: "ultimate-energy-changed",
      before,
      after: 20,
      source: "residual-charge",
    });
  }
  state.player.ultimateExecution = null;
  state.player.recoveryRemainingMs = state.rules.recoveryMs;
  emitGameEvent(state, {
    type: "ultimate-ended",
    abilityId: VECTOR_FOCUS_ABILITY_ID,
    segmentCount,
    killCount,
    energyRemaining: state.player.ultimateEnergy,
  });
}

function beginVectorFocusSegment(state: GameState): void {
  const execution = state.player.ultimateExecution;
  if (!execution) return;
  const target = execution.points[execution.segmentIndex];
  if (!target) throw new Error(`Vector Focus is missing point ${execution.segmentIndex}.`);
  const from = copyVec2(state.player.position);
  const to = clampPointToArena(target, state.stage.arena, state.player.radius);
  const direction = normalizedDirection(from, to, state.player.facing);
  const durationMs = getDashDurationMs(from, to);
  state.player.facing = direction;
  state.player.dash = {
    abilityId: VECTOR_FOCUS_ABILITY_ID,
    from,
    to,
    durationMs,
    elapsedMs: 0,
    hitRadius: DASH_HIT_RADIUS,
    baseHitRadius: DASH_HIT_RADIUS,
    recoveryMs: 0,
    resolvedEnemyIds: [],
    armorBreakCount: 0,
    exposedKillCount: 0,
    rearExecutionCount: 0,
  };
  emitGameEvent(state, {
    type: "ultimate-segment-started",
    abilityId: VECTOR_FOCUS_ABILITY_ID,
    segmentIndex: execution.segmentIndex,
    from: copyVec2(from),
    to: copyVec2(to),
  });
  emitGameEvent(state, {
    type: "dash-started",
    abilityId: VECTOR_FOCUS_ABILITY_ID,
    sourceId: "player",
    from,
    to: copyVec2(to),
    direction: copyVec2(direction),
    durationMs,
    anticipatedHits: state.enemies
      .filter((enemy) => enemy.alive && segmentIntersectsCircle(from, to, enemy.position, DASH_HIT_RADIUS + enemy.radius))
      .map((enemy) => ({ entityId: enemy.id, position: copyVec2(enemy.position) })),
  });
}

function resolveUltimateCrossShock(state: GameState, position: Vec2): void {
  const execution = state.player.ultimateExecution;
  if (!execution) return;
  for (const enemy of state.enemies) {
    if (!enemy.alive || hasIntactArmor(enemy) || squaredDistance(enemy.position, position) > ULTIMATE_CROSS_RADIUS ** 2) continue;
    enemy.alive = false;
    enemy.state = "dead";
    enemy.killedAtMs = state.elapsedMs;
    state.combat.kills += 1;
    execution.killCount += 1;
    emitGameEvent(state, {
      type: "enemy-killed",
      enemyId: enemy.id,
      sourceId: "player",
      attackId: "skill-cross-cascade-v1",
      position: copyVec2(enemy.position),
      direction: copyVec2(state.player.facing),
    });
  }
}

function firstInternalIntersection(
  current: UltimatePathSegment,
  completed: readonly UltimatePathSegment[],
): Vec2 | null {
  for (const segment of completed) {
    const intersection = strictSegmentIntersection(current.from, current.to, segment.from, segment.to);
    if (intersection) return intersection;
  }
  return null;
}

function strictSegmentIntersection(a: Vec2, b: Vec2, c: Vec2, d: Vec2): Vec2 | null {
  const r = { x: b.x - a.x, z: b.z - a.z };
  const s = { x: d.x - c.x, z: d.z - c.z };
  const denominator = r.x * s.z - r.z * s.x;
  if (Math.abs(denominator) <= EPSILON) return null;
  const offset = { x: c.x - a.x, z: c.z - a.z };
  const t = (offset.x * s.z - offset.z * s.x) / denominator;
  const u = (offset.x * r.z - offset.z * r.x) / denominator;
  if (t <= EPSILON || t >= 1 - EPSILON || u <= EPSILON || u >= 1 - EPSILON) return null;
  return { x: a.x + r.x * t, z: a.z + r.z * t };
}

function normalizedDirection(from: Vec2, to: Vec2, fallback: Vec2): Vec2 {
  const x = to.x - from.x;
  const z = to.z - from.z;
  const length = Math.hypot(x, z);
  return length <= EPSILON ? copyVec2(fallback) : { x: x / length, z: z / length };
}

function hasSkill(state: GameState, skillId: string): boolean {
  return state.run.selectedUpgrades.includes(skillId);
}
