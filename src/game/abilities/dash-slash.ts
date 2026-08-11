import { DASH_SLASH_ABILITY_ID } from "../../content/abilities/definitions";
import { copyVec2, type Vec2 } from "../../core/math/vec2";
import { clampPointToArena } from "../collision/arena";
import { segmentIntersectsCircle } from "../collision/shapes";
import { planDashPolylineGeometry } from "../entities/obstacle-system";
import { applyDashModifiers } from "../combat/modifiers";
import type { GameState } from "../domain/types";
import { emitGameEvent } from "../events/event-buffer";
import {
  DASH_HIT_RADIUS,
} from "../rules/constants";
import { buildDashPathSegments, buildTimedSegments, getDashDurationMs } from "./dash-motion";
import { consumeKillMomentumRecovery, prepareRegularDashPathEffects } from "./path-passives";

const EPSILON = 1e-8;

export { getDashDurationMs } from "./dash-motion";

export const CURVE_DRAG_MIN_DISTANCE = 0.8;
export const CURVE_MAX_TURN_RADIANS = 65 * Math.PI / 180;
const CURVE_SEGMENT_COUNT = 10;

export function executeDashSlash(state: GameState, target: Vec2): void {
  executeBasicDash(state, target, null);
}

export function executeCurveDashSlash(state: GameState, endpoint: Vec2, dragControl: Vec2): void {
  executeBasicDash(state, endpoint, dragControl);
}

function executeBasicDash(state: GameState, target: Vec2, dragControl: Vec2 | null): void {
  const from = copyVec2(state.player.position);
  const requestedTo = clampPointToArena(target, state.stage.arena, state.player.radius);
  const directionX = requestedTo.x - from.x;
  const directionZ = requestedTo.z - from.z;
  const distance = Math.hypot(directionX, directionZ);
  const direction = distance > EPSILON
    ? { x: directionX / distance, z: directionZ / distance }
    : copyVec2(state.player.facing);
  const baseDurationMs = getDashDurationMs(from, requestedTo);
  const modified = applyDashModifiers(state, {
    distance,
    durationMs: baseDurationMs,
    recoveryMs: state.rules.recoveryMs,
    hitRadius: DASH_HIT_RADIUS,
  });
  const to = modified.distance === distance || distance <= EPSILON
    ? requestedTo
    : clampPointToArena({
        x: from.x + direction.x * modified.distance,
        z: from.z + direction.z * modified.distance,
      }, state.stage.arena, state.player.radius);

  const durationScale = baseDurationMs <= EPSILON ? 1 : modified.durationMs / baseDurationMs;
  const pathSegments = (dragControl && state.run.selectedUpgrades.includes("skill-curve-dash-v1")
    ? buildTimedSegments(planDashPolylineGeometry(state, curveDashPathPoints(from, to, dragControl)))
    : buildDashPathSegments(state, from, to)).map((segment) => ({
    ...segment,
    durationMs: segment.durationMs * durationScale,
  }));
  const firstSegment = pathSegments[0];
  if (!firstSegment) return;
  const killMomentumConsumedStacks = state.run.selectedUpgrades.includes("skill-kill-momentum-v1")
    ? Math.min(5, state.player.killMomentumStacks)
    : 0;
  state.player.facing = direction;
  state.player.dash = {
    abilityId: DASH_SLASH_ABILITY_ID,
    from: copyVec2(firstSegment.from),
    to: copyVec2(firstSegment.to),
    durationMs: firstSegment.durationMs,
    elapsedMs: 0,
    hitRadius: modified.hitRadius,
    baseHitRadius: modified.hitRadius,
    recoveryMs: consumeKillMomentumRecovery(state, modified.recoveryMs),
    resolvedEnemyIds: [],
    armorBreakCount: 0,
    exposedKillCount: 0,
    rearExecutionCount: 0,
    pathSegments,
    pathSegmentIndex: 0,
    reflectionsUsed: 0,
    projectilesReturnedThisDash: 0,
    killCount: 0,
    refractionSecondLegKills: 0,
    pendingCross: null,
    killMomentumConsumedStacks,
  };
  prepareRegularDashPathEffects(state, state.player.dash);
  state.player.recoveryRemainingMs = 0;
  state.player.bufferedAbility = null;
  const anticipatedHits = state.enemies
    .filter((enemy) => enemy.alive && pathSegments.some((segment) => segmentIntersectsCircle(
      segment.from,
      segment.to,
      enemy.position,
      modified.hitRadius + enemy.radius,
    )))
    .map((enemy) => ({ entityId: enemy.id, position: copyVec2(enemy.position) }));
  emitGameEvent(state, {
    type: "dash-started",
    abilityId: DASH_SLASH_ABILITY_ID,
    sourceId: "player",
    from: copyVec2(firstSegment.from),
    to: copyVec2(firstSegment.to),
    direction: copyVec2(direction),
    durationMs: firstSegment.durationMs,
    anticipatedHits,
  });
}

export function curveDashPathPoints(from: Vec2, to: Vec2, requestedControl: Vec2): Vec2[] {
  const control = constrainedCurveControl(from, to, requestedControl);
  const points: Vec2[] = [];
  for (let index = 0; index <= CURVE_SEGMENT_COUNT; index += 1) {
    const t = index / CURVE_SEGMENT_COUNT;
    const inverse = 1 - t;
    points.push({
      x: inverse * inverse * from.x + 2 * inverse * t * control.x + t * t * to.x,
      z: inverse * inverse * from.z + 2 * inverse * t * control.z + t * t * to.z,
    });
  }
  return points;
}

function constrainedCurveControl(from: Vec2, to: Vec2, requested: Vec2): Vec2 {
  const chord = { x: to.x - from.x, z: to.z - from.z };
  const length = Math.hypot(chord.x, chord.z);
  if (length <= EPSILON) return copyVec2(from);
  const tangent = { x: chord.x / length, z: chord.z / length };
  const normal = { x: -tangent.z, z: tangent.x };
  const midpoint = { x: (from.x + to.x) * 0.5, z: (from.z + to.z) * 0.5 };
  const requestedOffset = (requested.x - midpoint.x) * normal.x + (requested.z - midpoint.z) * normal.z;
  const maximumOffset = length * 0.5 * Math.tan(CURVE_MAX_TURN_RADIANS * 0.5);
  const offset = Math.min(maximumOffset, Math.max(-maximumOffset, requestedOffset));
  return { x: midpoint.x + normal.x * offset, z: midpoint.z + normal.z * offset };
}
