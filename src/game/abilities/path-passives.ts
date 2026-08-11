import {
  CHARGED_DASH_ABILITY_ID,
  DASH_SLASH_ABILITY_ID,
} from "../../content/abilities/definitions";
import { enemyDefinitions } from "../../content/enemies/definitions";
import { copyVec2, squaredDistance, type Vec2 } from "../../core/math/vec2";
import { clampPointToArena } from "../collision/arena";
import { segmentIntersectsCircle } from "../collision/shapes";
import type {
  DashState,
  GameState,
  GravityPullState,
  UltimatePathSegment,
} from "../domain/types";
import { emitGameEvent } from "../events/event-buffer";
import { DASH_HIT_RADIUS } from "../rules/constants";
import { MIN_DASH_RECOVERY_MS } from "../rules/constants";

export const STORED_PATH_DURATION_MS = 2_500;
export const ECHO_SLASH_DELAY_MS = 400;
export const DOUBLE_ECHO_SLASH_DELAY_MS = 800;
export const GRAVITY_PULL_DURATION_MS = 350;
export const GRAVITY_PULL_MAX_DISTANCE = 0.6;
export const GRAVITY_PULL_INFLUENCE_SCALE = 1.3;
export const CROSS_MIN_DISTANCE_FROM_START = 1.5;
export const CROSS_OVERLAP_LATERAL_TOLERANCE = 0.25;
const CROSS_OVERLAP_ANGLE_SINE = Math.sin(5 * Math.PI / 180);

const EPSILON = 1e-8;

export function consumeKillMomentumRecovery(state: GameState, recoveryMs: number): number {
  if (!hasSkill(state, "skill-kill-momentum-v1") || state.player.killMomentumStacks <= 0) {
    return recoveryMs;
  }
  const stacks = Math.min(5, Math.max(0, state.player.killMomentumStacks));
  state.player.killMomentumStacks = 0;
  return Math.max(MIN_DASH_RECOVERY_MS, recoveryMs - stacks * 35);
}

export function prepareRegularDashPathEffects(state: GameState, dash: DashState): void {
  if (!isRegularDash(dash) || !hasSkill(state, "skill-cross-execution-v1")) return;
  if (state.combat.storedPath && state.combat.storedPath.remainingMs <= EPSILON) {
    state.combat.storedPath = null;
  }
  const stored = state.combat.storedPath;
  if (!stored) return;
  const intersection = firstPathIntersection(actualSegments(dash), stored.segments);
  if (!intersection) return;
  dash.pendingCross = {
    position: copyVec2(intersection.position),
    pathSegmentIndex: intersection.pathSegmentIndex,
    triggered: false,
  };
  state.combat.storedPath = null;
}

export function finalizeRegularDashPathEffects(state: GameState, dash: DashState): void {
  if (!isRegularDash(dash)) return;
  if (hasSkill(state, "skill-cross-execution-v1") && dash.pendingCross === null) {
    const segments = actualSegments(dash);
    state.combat.storedPath = {
      id: `stored-path:${state.tick}:${state.commandSequence}`,
      abilityId: dash.abilityId,
      segments,
      remainingMs: STORED_PATH_DURATION_MS,
    };
  }
  if (hasSkill(state, "skill-echo-slash-v1")) {
    schedulePathSlash(state, dash, ECHO_SLASH_DELAY_MS, "skill-echo-slash-v1", dash.hitRadius);
    if (hasSkill(state, "skill-double-echo-v1")) {
      schedulePathSlash(state, dash, DOUBLE_ECHO_SLASH_DELAY_MS, "skill-double-echo-v1", DASH_HIT_RADIUS);
    }
  }
  if (dash.abilityId === DASH_SLASH_ABILITY_ID && hasSkill(state, "skill-gravity-slash-v1")) {
    scheduleGravityPulls(state, dash);
  }
}

export function advancePathPassiveTimers(state: GameState, deltaMs: number): void {
  if (state.combat.storedPath) {
    state.combat.storedPath.remainingMs = Math.max(0, state.combat.storedPath.remainingMs - Math.max(0, deltaMs));
    if (state.combat.storedPath.remainingMs <= EPSILON) state.combat.storedPath = null;
  }
  advanceGravityPulls(state, deltaMs);
}

export function consumePendingCrossAlongSegment(
  dash: DashState,
  segmentStart: Vec2,
  segmentEnd: Vec2,
): Vec2 | null {
  const pending = dash.pendingCross;
  if (
    !pending ||
    pending.triggered ||
    pending.pathSegmentIndex !== dash.pathSegmentIndex ||
    !segmentIntersectsCircle(segmentStart, segmentEnd, pending.position, 0.04)
  ) return null;
  pending.triggered = true;
  return copyVec2(pending.position);
}

function schedulePathSlash(
  state: GameState,
  dash: DashState,
  delayMs: number,
  attackId: string,
  hitRadius: number,
): void {
  actualSegments(dash).forEach((segment, index) => {
    state.combat.scheduledSlashes.push({
      id: `${attackId}:${state.tick}:${index}:${state.eventSequence + 1}`,
      executeAtMs: state.elapsedMs + delayMs,
      remainingMs: delayMs,
      from: copyVec2(segment.from),
      to: copyVec2(segment.to),
      hitRadius,
      attackId,
    });
  });
}

function scheduleGravityPulls(state: GameState, dash: DashState): void {
  const lethalRadius = dash.hitRadius;
  const influenceRadius = lethalRadius * GRAVITY_PULL_INFLUENCE_SCALE;
  for (const enemy of state.enemies) {
    if (!enemy.alive || enemyDefinitions.get(enemy.definitionId).tags.includes("boss")) continue;
    const closest = closestPointOnPath(enemy.position, actualSegments(dash));
    if (!closest) continue;
    const distance = Math.sqrt(closest.distanceSquared);
    if (
      distance <= enemy.radius + lethalRadius + EPSILON ||
      distance > enemy.radius + influenceRadius + EPSILON
    ) continue;
    const pullDistance = Math.min(GRAVITY_PULL_MAX_DISTANCE, distance);
    const direction = distance <= EPSILON
      ? { x: 0, z: 0 }
      : {
          x: (closest.point.x - enemy.position.x) / distance,
          z: (closest.point.z - enemy.position.z) / distance,
        };
    const pull: GravityPullState = {
      enemyId: enemy.id,
      from: copyVec2(enemy.position),
      to: clampPointToArena({
        x: enemy.position.x + direction.x * pullDistance,
        z: enemy.position.z + direction.z * pullDistance,
      }, state.stage.arena, enemy.radius),
      durationMs: GRAVITY_PULL_DURATION_MS,
      elapsedMs: 0,
    };
    state.combat.gravityPulls = state.combat.gravityPulls.filter((candidate) => candidate.enemyId !== enemy.id);
    state.combat.gravityPulls.push(pull);
    enemy.staggerRemainingMs = Math.max(enemy.staggerRemainingMs, GRAVITY_PULL_DURATION_MS);
    emitGameEvent(state, {
      type: "gravity-pull-started",
      enemyId: enemy.id,
      from: copyVec2(pull.from),
      to: copyVec2(pull.to),
      durationMs: pull.durationMs,
    });
  }
}

function advanceGravityPulls(state: GameState, deltaMs: number): void {
  const survivors: GravityPullState[] = [];
  for (const pull of state.combat.gravityPulls) {
    const enemy = state.enemies.find((candidate) => candidate.id === pull.enemyId && candidate.alive);
    if (!enemy) continue;
    pull.elapsedMs = Math.min(pull.durationMs, pull.elapsedMs + Math.max(0, deltaMs));
    const progress = pull.durationMs <= EPSILON ? 1 : pull.elapsedMs / pull.durationMs;
    enemy.position = {
      x: pull.from.x + (pull.to.x - pull.from.x) * progress,
      z: pull.from.z + (pull.to.z - pull.from.z) * progress,
    };
    if (pull.elapsedMs + EPSILON < pull.durationMs) survivors.push(pull);
  }
  state.combat.gravityPulls = survivors;
}

function firstPathIntersection(
  current: readonly UltimatePathSegment[],
  stored: readonly UltimatePathSegment[],
): { position: Vec2; pathSegmentIndex: number } | null {
  for (let pathSegmentIndex = 0; pathSegmentIndex < current.length; pathSegmentIndex += 1) {
    const currentSegment = current[pathSegmentIndex];
    if (!currentSegment) continue;
    const segmentLength = Math.hypot(
      currentSegment.to.x - currentSegment.from.x,
      currentSegment.to.z - currentSegment.from.z,
    );
    const completedLength = current.slice(0, pathSegmentIndex).reduce((total, segment) => (
      total + Math.hypot(segment.to.x - segment.from.x, segment.to.z - segment.from.z)
    ), 0);
    const minimumT = segmentLength <= EPSILON
      ? 1
      : Math.max(0, (CROSS_MIN_DISTANCE_FROM_START - completedLength) / segmentLength);
    const candidates = stored
      .map((storedSegment) => pathIntersection(currentSegment, storedSegment, minimumT))
      .filter((candidate): candidate is { position: Vec2; t: number } => candidate !== null)
      .sort((first, second) => first.t - second.t);
    const first = candidates[0];
    if (first) return { position: first.position, pathSegmentIndex };
  }
  return null;
}

function pathIntersection(
  a: UltimatePathSegment,
  b: UltimatePathSegment,
  minimumT: number,
): { position: Vec2; t: number } | null {
  const r = { x: a.to.x - a.from.x, z: a.to.z - a.from.z };
  const s = { x: b.to.x - b.from.x, z: b.to.z - b.from.z };
  const denominator = r.x * s.z - r.z * s.x;
  const lengthProduct = Math.hypot(r.x, r.z) * Math.hypot(s.x, s.z);
  if (
    Math.abs(denominator) <= EPSILON ||
    (lengthProduct > EPSILON && Math.abs(denominator) / lengthProduct <= CROSS_OVERLAP_ANGLE_SINE)
  ) return collinearOverlapIntersection(a, b, minimumT);
  const offset = { x: b.from.x - a.from.x, z: b.from.z - a.from.z };
  const t = (offset.x * s.z - offset.z * s.x) / denominator;
  const u = (offset.x * r.z - offset.z * r.x) / denominator;
  if (t < Math.max(EPSILON, minimumT) || t >= 1 - EPSILON || u <= EPSILON || u >= 1 - EPSILON) return null;
  return { position: { x: a.from.x + r.x * t, z: a.from.z + r.z * t }, t };
}

function collinearOverlapIntersection(
  a: UltimatePathSegment,
  b: UltimatePathSegment,
  minimumT: number,
): { position: Vec2; t: number } | null {
  const direction = { x: a.to.x - a.from.x, z: a.to.z - a.from.z };
  const lengthSquared = direction.x * direction.x + direction.z * direction.z;
  if (lengthSquared <= EPSILON) return null;
  const lineLength = Math.sqrt(lengthSquared);
  const crossFrom = ((b.from.x - a.from.x) * direction.z - (b.from.z - a.from.z) * direction.x) / lineLength;
  const crossTo = ((b.to.x - a.from.x) * direction.z - (b.to.z - a.from.z) * direction.x) / lineLength;
  if (
    Math.abs(crossFrom) > CROSS_OVERLAP_LATERAL_TOLERANCE ||
    Math.abs(crossTo) > CROSS_OVERLAP_LATERAL_TOLERANCE
  ) return null;
  const project = (point: Vec2) => (
    ((point.x - a.from.x) * direction.x + (point.z - a.from.z) * direction.z) / lengthSquared
  );
  const first = project(b.from);
  const second = project(b.to);
  const overlapStart = Math.max(0, Math.min(first, second), minimumT, EPSILON);
  const overlapEnd = Math.min(1, Math.max(first, second));
  if (overlapStart >= overlapEnd - EPSILON || overlapStart >= 1 - EPSILON) return null;
  return {
    position: {
      x: a.from.x + direction.x * overlapStart,
      z: a.from.z + direction.z * overlapStart,
    },
    t: overlapStart,
  };
}

function closestPointOnPath(
  point: Vec2,
  segments: readonly UltimatePathSegment[],
): { point: Vec2; distanceSquared: number } | null {
  let best: { point: Vec2; distanceSquared: number } | null = null;
  for (const segment of segments) {
    const segmentX = segment.to.x - segment.from.x;
    const segmentZ = segment.to.z - segment.from.z;
    const lengthSquared = segmentX * segmentX + segmentZ * segmentZ;
    const ratio = lengthSquared <= EPSILON ? 0 : Math.min(1, Math.max(0, (
      (point.x - segment.from.x) * segmentX + (point.z - segment.from.z) * segmentZ
    ) / lengthSquared));
    const closest = {
      x: segment.from.x + segmentX * ratio,
      z: segment.from.z + segmentZ * ratio,
    };
    const distance = squaredDistance(point, closest);
    if (!best || distance < best.distanceSquared) best = { point: closest, distanceSquared: distance };
  }
  return best;
}

function actualSegments(dash: DashState): UltimatePathSegment[] {
  return dash.pathSegments.map((segment) => ({ from: copyVec2(segment.from), to: copyVec2(segment.to) }));
}

function isRegularDash(dash: DashState): boolean {
  return dash.abilityId === DASH_SLASH_ABILITY_ID || dash.abilityId === CHARGED_DASH_ABILITY_ID;
}

function hasSkill(state: GameState, skillId: string): boolean {
  return state.run.selectedUpgrades.includes(skillId);
}
