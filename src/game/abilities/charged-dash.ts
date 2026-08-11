import {
  CHARGED_DASH_ABILITY_ID,
} from "../../content/abilities/definitions";
import { copyVec2, type Vec2 } from "../../core/math/vec2";
import { clampPointToArena } from "../collision/arena";
import { segmentIntersectsCircle } from "../collision/shapes";
import type { ChargeState, GameCommandResult, GameState } from "../domain/types";
import { emitGameEvent } from "../events/event-buffer";
import { DASH_HIT_RADIUS, FIXED_STEP_MS } from "../rules/constants";
import { buildDashPathSegments } from "./dash-motion";
import { activateAbility } from "./ability-system";
import { CURVE_DRAG_MIN_DISTANCE, executeCurveDashSlash } from "./dash-slash";
import { consumeKillMomentumRecovery, prepareRegularDashPathEffects } from "./path-passives";

export const CHARGED_DASH_THRESHOLD_MS = 650;
export const QUICK_IGNITION_THRESHOLD_MS = 500;
export const CHARGED_DASH_EXTRA_RECOVERY_MS = 200;
export const CHARGE_TAP_MAX_MS = 180;
export const OVERDRIVE_HOLD_MS = 350;
export const ADAPTIVE_AIM_RATE_RADIANS_PER_SECOND = 120 * Math.PI / 180;
export const ADAPTIVE_AIM_TOTAL_RADIANS = 60 * Math.PI / 180;

const EPSILON = 1e-8;

export function beginChargedDash(state: GameState, target: Vec2): GameCommandResult {
  if (
    state.stage.phase !== "playing" ||
    state.player.hp === 0 ||
    state.player.dash !== null ||
    state.player.charge !== null ||
    state.player.ultimatePlanning !== null ||
    state.player.ultimateExecution !== null ||
    state.player.recoveryRemainingMs > EPSILON ||
    state.player.abilities.secondary?.abilityId !== CHARGED_DASH_ABILITY_ID
  ) {
    return "ignored";
  }
  const clampedTarget = clampPointToArena(target, state.stage.arena, state.player.radius);
  const direction = normalizedDirection(state.player.position, clampedTarget, state.player.facing);
  const predatorAvailable = hasSkill(state, "skill-predator-drive-v1") &&
    state.player.predatorDriveExpiresAtMs !== null &&
    state.player.predatorDriveExpiresAtMs + EPSILON >= state.elapsedMs;
  const baseThreshold = hasSkill(state, "skill-quick-ignition-v1")
    ? QUICK_IGNITION_THRESHOLD_MS
    : CHARGED_DASH_THRESHOLD_MS;
  const thresholdMs = predatorAvailable ? baseThreshold * 0.65 : baseThreshold;
  if (predatorAvailable) state.player.predatorDriveExpiresAtMs = null;
  state.player.charge = {
    abilityId: CHARGED_DASH_ABILITY_ID,
    startedAtTick: state.tick,
    heldMs: 0,
    thresholdMs,
    overholdLimitMs: hasSkill(state, "skill-overdrive-v1") ? OVERDRIVE_HOLD_MS : 0,
    initialTarget: copyVec2(clampedTarget),
    currentTarget: copyVec2(clampedTarget),
    direction,
    totalAimAdjustmentRadians: 0,
    lastAimUpdateTick: state.tick,
    consumedPredatorDrive: predatorAvailable,
    readyEventEmitted: false,
  };
  state.player.bufferedAbility = null;
  emitGameEvent(state, {
    type: "charge-started",
    abilityId: CHARGED_DASH_ABILITY_ID,
    sourceId: "player",
    thresholdMs,
    target: copyVec2(clampedTarget),
  });
  return "charge-started";
}

export function updateChargedDashTarget(state: GameState, target: Vec2): GameCommandResult {
  const charge = state.player.charge;
  if (!charge || state.player.hp === 0) return "ignored";
  const clampedTarget = clampPointToArena(target, state.stage.arena, state.player.radius);
  charge.currentTarget = copyVec2(clampedTarget);
  if (hasSkill(state, "skill-adaptive-aim-v1")) {
    const desired = normalizedDirection(state.player.position, clampedTarget, charge.direction);
    const elapsedTicks = Math.max(0, state.tick - charge.lastAimUpdateTick);
    const rateLimit = ADAPTIVE_AIM_RATE_RADIANS_PER_SECOND * (elapsedTicks * FIXED_STEP_MS / 1000);
    const remainingTotal = Math.max(0, ADAPTIVE_AIM_TOTAL_RADIANS - charge.totalAimAdjustmentRadians);
    const requestedDelta = signedAngleBetween(charge.direction, desired);
    const appliedDelta = clamp(requestedDelta, -Math.min(rateLimit, remainingTotal), Math.min(rateLimit, remainingTotal));
    charge.direction = rotateVector(charge.direction, appliedDelta);
    charge.totalAimAdjustmentRadians += Math.abs(appliedDelta);
  }
  charge.lastAimUpdateTick = state.tick;
  return "charge-updated";
}

export function advanceChargedDashHold(state: GameState, deltaMs: number): void {
  const charge = state.player.charge;
  if (!charge || state.player.hp === 0) return;
  charge.heldMs = Math.min(
    charge.thresholdMs + charge.overholdLimitMs,
    charge.heldMs + Math.max(0, deltaMs),
  );
  if (!charge.readyEventEmitted && charge.heldMs + EPSILON >= charge.thresholdMs) {
    charge.readyEventEmitted = true;
    emitGameEvent(state, {
      type: "charge-ready",
      abilityId: charge.abilityId,
      sourceId: "player",
      heldMs: charge.heldMs,
    });
  }
}

export function releaseChargedDash(state: GameState, target: Vec2): GameCommandResult {
  const charge = state.player.charge;
  if (!charge || state.player.hp === 0) return "ignored";
  updateChargedDashTarget(state, target);
  const heldMs = charge.heldMs;
  if (heldMs <= CHARGE_TAP_MAX_MS + EPSILON) {
    state.player.charge = null;
    if (
      hasSkill(state, "skill-curve-dash-v1") &&
      Math.hypot(
        charge.currentTarget.x - charge.initialTarget.x,
        charge.currentTarget.z - charge.initialTarget.z,
      ) >= CURVE_DRAG_MIN_DISTANCE
    ) {
      executeCurveDashSlash(state, charge.initialTarget, charge.currentTarget);
      return "started";
    }
    return activateAbility(state, "primary", target);
  }
  if (heldMs + EPSILON < charge.thresholdMs) {
    state.player.charge = null;
    emitGameEvent(state, {
      type: "charge-cancelled",
      abilityId: charge.abilityId,
      sourceId: "player",
      heldMs,
      reason: "released-before-full-charge",
    });
    return "charge-cancelled";
  }
  state.player.charge = null;
  executeChargedDash(state, charge);
  return "charged-released";
}

export function cancelChargedDash(state: GameState, reason = "input-cancelled"): GameCommandResult {
  const charge = state.player.charge;
  if (!charge) return "ignored";
  state.player.charge = null;
  emitGameEvent(state, {
    type: "charge-cancelled",
    abilityId: charge.abilityId,
    sourceId: "player",
    heldMs: charge.heldMs,
    reason,
  });
  return "charge-cancelled";
}

function executeChargedDash(state: GameState, charge: ChargeState): void {
  const from = copyVec2(state.player.position);
  const targetDistance = Math.hypot(
    charge.currentTarget.x - from.x,
    charge.currentTarget.z - from.z,
  );
  const requestedTo = clampPointToArena({
    x: from.x + charge.direction.x * targetDistance,
    z: from.z + charge.direction.z * targetDistance,
  }, state.stage.arena, state.player.radius);
  const overholdRatio = charge.overholdLimitMs <= 0
    ? 0
    : clamp((charge.heldMs - charge.thresholdMs) / charge.overholdLimitMs, 0, 1);
  const hitRadius = DASH_HIT_RADIUS * (1 + overholdRatio * 0.4);
  const pathSegments = buildDashPathSegments(state, from, requestedTo);
  const firstSegment = pathSegments[0];
  if (!firstSegment) return;
  const killMomentumConsumedStacks = hasSkill(state, "skill-kill-momentum-v1")
    ? Math.min(5, state.player.killMomentumStacks)
    : 0;
  state.player.facing = copyVec2(charge.direction);
  state.player.dash = {
    abilityId: CHARGED_DASH_ABILITY_ID,
    from: copyVec2(firstSegment.from),
    to: copyVec2(firstSegment.to),
    durationMs: firstSegment.durationMs,
    elapsedMs: 0,
    hitRadius,
    baseHitRadius: hitRadius,
    recoveryMs: consumeKillMomentumRecovery(state, state.rules.recoveryMs + CHARGED_DASH_EXTRA_RECOVERY_MS),
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
      hitRadius + enemy.radius,
    )))
    .map((enemy) => ({ entityId: enemy.id, position: copyVec2(enemy.position) }));
  emitGameEvent(state, {
    type: "dash-started",
    abilityId: CHARGED_DASH_ABILITY_ID,
    sourceId: "player",
    from: copyVec2(firstSegment.from),
    to: copyVec2(firstSegment.to),
    direction: copyVec2(charge.direction),
    durationMs: firstSegment.durationMs,
    anticipatedHits,
  });
}

function hasSkill(state: GameState, skillId: string): boolean {
  return state.run.selectedUpgrades.includes(skillId);
}

function normalizedDirection(from: Vec2, to: Vec2, fallback: Vec2): Vec2 {
  const x = to.x - from.x;
  const z = to.z - from.z;
  const length = Math.hypot(x, z);
  if (length <= EPSILON) return copyVec2(fallback);
  return { x: x / length, z: z / length };
}

function signedAngleBetween(from: Vec2, to: Vec2): number {
  return Math.atan2(from.x * to.z - from.z * to.x, from.x * to.x + from.z * to.z);
}

function rotateVector(vector: Vec2, radians: number): Vec2 {
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    x: vector.x * cosine - vector.z * sine,
    z: vector.x * sine + vector.z * cosine,
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function isChargedDashAbility(abilityId: string): boolean {
  return abilityId === CHARGED_DASH_ABILITY_ID;
}
