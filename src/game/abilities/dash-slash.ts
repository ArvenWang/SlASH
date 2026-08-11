import { DASH_SLASH_ABILITY_ID } from "../../content/abilities/definitions";
import { copyVec2, type Vec2 } from "../../core/math/vec2";
import { clampPointToArena } from "../collision/arena";
import { segmentIntersectsCircle } from "../collision/shapes";
import { applyDashModifiers } from "../combat/modifiers";
import type { GameState } from "../domain/types";
import { emitGameEvent } from "../events/event-buffer";
import {
  DASH_HIT_RADIUS,
} from "../rules/constants";
import { buildDashPathSegments, getDashDurationMs } from "./dash-motion";

const EPSILON = 1e-8;

export { getDashDurationMs } from "./dash-motion";

export function executeDashSlash(state: GameState, target: Vec2): void {
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
  const pathSegments = buildDashPathSegments(state, from, to).map((segment) => ({
    ...segment,
    durationMs: segment.durationMs * durationScale,
  }));
  const firstSegment = pathSegments[0];
  if (!firstSegment) return;
  state.player.facing = direction;
  state.player.dash = {
    abilityId: DASH_SLASH_ABILITY_ID,
    from: copyVec2(firstSegment.from),
    to: copyVec2(firstSegment.to),
    durationMs: firstSegment.durationMs,
    elapsedMs: 0,
    hitRadius: modified.hitRadius,
    baseHitRadius: modified.hitRadius,
    recoveryMs: modified.recoveryMs,
    resolvedEnemyIds: [],
    armorBreakCount: 0,
    exposedKillCount: 0,
    rearExecutionCount: 0,
    pathSegments,
    pathSegmentIndex: 0,
    reflectionsUsed: 0,
    projectilesReturnedThisDash: 0,
  };
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
