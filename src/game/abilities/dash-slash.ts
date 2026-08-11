import { DASH_SLASH_ABILITY_ID } from "../../content/abilities/definitions";
import { copyVec2, squaredDistance, type Vec2 } from "../../core/math/vec2";
import { clampPointToArena } from "../collision/arena";
import { segmentIntersectsCircle } from "../collision/shapes";
import { applyDashModifiers } from "../combat/modifiers";
import type { GameState } from "../domain/types";
import { emitGameEvent } from "../events/event-buffer";
import {
  DASH_HIT_RADIUS,
  DASH_SPEED_UNITS_PER_SECOND,
  MAX_DASH_DURATION_MS,
  MIN_DASH_DURATION_MS,
} from "../rules/constants";

const EPSILON = 1e-8;

export function getDashDurationMs(from: Vec2, to: Vec2): number {
  const distance = Math.sqrt(squaredDistance(from, to));
  const duration = (distance / DASH_SPEED_UNITS_PER_SECOND) * 1000;
  return Math.min(MAX_DASH_DURATION_MS, Math.max(MIN_DASH_DURATION_MS, duration));
}

export function executeDashSlash(state: GameState, target: Vec2): void {
  const from = copyVec2(state.player.position);
  const requestedTo = clampPointToArena(target, state.stage.arena, state.player.radius);
  const directionX = requestedTo.x - from.x;
  const directionZ = requestedTo.z - from.z;
  const distance = Math.hypot(directionX, directionZ);
  const direction = distance > EPSILON
    ? { x: directionX / distance, z: directionZ / distance }
    : copyVec2(state.player.facing);
  const modified = applyDashModifiers(state, {
    distance,
    durationMs: getDashDurationMs(from, requestedTo),
    recoveryMs: state.rules.recoveryMs,
    hitRadius: DASH_HIT_RADIUS,
  });
  const to = modified.distance === distance || distance <= EPSILON
    ? requestedTo
    : clampPointToArena({
        x: from.x + direction.x * modified.distance,
        z: from.z + direction.z * modified.distance,
      }, state.stage.arena, state.player.radius);

  state.player.facing = direction;
  state.player.dash = {
    abilityId: DASH_SLASH_ABILITY_ID,
    from,
    to,
    durationMs: modified.durationMs,
    elapsedMs: 0,
    hitRadius: modified.hitRadius,
    baseHitRadius: modified.hitRadius,
    recoveryMs: modified.recoveryMs,
    resolvedEnemyIds: [],
    armorBreakCount: 0,
    exposedKillCount: 0,
    rearExecutionCount: 0,
  };
  state.player.recoveryRemainingMs = 0;
  state.player.bufferedAbility = null;
  const anticipatedHits = state.enemies
    .filter((enemy) => enemy.alive && segmentIntersectsCircle(
      from,
      to,
      enemy.position,
      modified.hitRadius + enemy.radius,
    ))
    .map((enemy) => ({ entityId: enemy.id, position: copyVec2(enemy.position) }));
  emitGameEvent(state, {
    type: "dash-started",
    abilityId: DASH_SLASH_ABILITY_ID,
    sourceId: "player",
    from,
    to: copyVec2(to),
    direction: copyVec2(direction),
    durationMs: modified.durationMs,
    anticipatedHits,
  });
}
