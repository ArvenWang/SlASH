import {
  VECTOR_FOCUS_ABILITY_ID,
  VECTOR_FOCUS_CONFIG,
  abilityDefinitions,
} from "../../content/abilities/definitions";
import { copyVec2, squaredDistance, type Vec2 } from "../../core/math/vec2";
import { clampPointToArena } from "../collision/arena";
import { segmentIntersectsCircle } from "../collision/shapes";
import type { GameState } from "../domain/types";
import { emitGameEvent } from "../events/event-buffer";
import { DASH_HIT_RADIUS } from "../rules/constants";
import {
  addAbilityResource,
  getAbilityResource,
  setAbilityResource,
  spendAbilityResource,
} from "./resource-system";

const EPSILON = 1e-8;

export type AbilityTargetResult = "target-added" | "triggered" | "ignored";

export function getVectorFocusEnergy(state: GameState): number {
  return getAbilityResource(state, "ultimate")?.current ?? 0;
}

export function setVectorFocusEnergy(state: GameState, value: number): number {
  return setAbilityResource(state, "ultimate", value);
}

export function getVectorFocusEnergyGain(killCount: number): number {
  const count = Math.max(0, Math.floor(Number.isFinite(killCount) ? killCount : 0));
  return Math.min(VECTOR_FOCUS_CONFIG.energyMaximum, count * 14 + count * (count - 1) * 2);
}

export function grantVectorFocusEnergy(state: GameState, killCount: number): number {
  return addAbilityResource(state, "ultimate", getVectorFocusEnergyGain(killCount));
}

export function isVectorFocusReady(state: GameState): boolean {
  const runtime = state.player.abilities.ultimate;
  const definition = runtime ? abilityDefinitions.get(runtime.abilityId) : null;
  return runtime?.abilityId === VECTOR_FOCUS_ABILITY_ID
    && (runtime.resource?.current ?? 0) + EPSILON >= (definition?.energyCost ?? Number.POSITIVE_INFINITY);
}

export function isSelectingAbilityTarget(state: GameState): boolean {
  return state.player.activeAbility?.phase === "target-selection";
}

export function beginVectorFocus(state: GameState): boolean {
  if (
    state.stage.phase !== "playing"
    || state.player.hp === 0
    || !isVectorFocusReady(state)
    || state.player.activeAbility !== null
    || state.player.dash !== null
    || state.player.recoveryRemainingMs > EPSILON
  ) return false;

  state.player.activeAbility = {
    abilityId: VECTOR_FOCUS_ABILITY_ID,
    phase: "target-selection",
    targets: [],
    elapsedMs: 0,
    timeoutMs: VECTOR_FOCUS_CONFIG.selectionMs,
    targetCount: VECTOR_FOCUS_CONFIG.targetCount,
    worldTimeScale: VECTOR_FOCUS_CONFIG.worldTimeScale,
  };
  state.player.bufferedAbility = null;
  emitGameEvent(state, {
    type: "ability-selection-started",
    abilityId: VECTOR_FOCUS_ABILITY_ID,
    timeoutMs: VECTOR_FOCUS_CONFIG.selectionMs,
    targetCount: VECTOR_FOCUS_CONFIG.targetCount,
  });
  return true;
}

export function cancelActiveAbility(
  state: GameState,
  reason: "input" | "timeout" | "death" = "input",
): boolean {
  const active = state.player.activeAbility;
  if (active?.phase !== "target-selection") return false;
  state.player.activeAbility = null;
  emitGameEvent(state, {
    type: "ability-cancelled",
    abilityId: active.abilityId,
    reason,
  });
  return true;
}

export function submitActiveAbilityTarget(state: GameState, target: Vec2): AbilityTargetResult {
  const active = state.player.activeAbility;
  if (
    state.stage.phase !== "playing"
    || state.player.hp === 0
    || active?.phase !== "target-selection"
    || active.abilityId !== VECTOR_FOCUS_ABILITY_ID
  ) return "ignored";

  const nextTarget = clampPointToArena(target, state.stage.arena, state.player.radius);
  const previous = active.targets.at(-1) ?? state.player.position;
  if (squaredDistance(previous, nextTarget) < VECTOR_FOCUS_CONFIG.minimumTargetDistance ** 2) {
    return "ignored";
  }

  active.targets.push(copyVec2(nextTarget));
  emitGameEvent(state, {
    type: "ability-target-added",
    abilityId: active.abilityId,
    target: copyVec2(nextTarget),
    index: active.targets.length - 1,
  });
  if (active.targets.length < active.targetCount) return "target-added";

  const definition = abilityDefinitions.get(active.abilityId);
  if (!spendAbilityResource(state, "ultimate", definition.energyCost)) return "ignored";
  const route = active.targets.map(copyVec2);
  state.player.activeAbility = {
    abilityId: active.abilityId,
    phase: "route-execution",
    route,
    segmentIndex: 0,
    worldTimeScale: active.worldTimeScale,
  };
  emitGameEvent(state, {
    type: "ability-route-started",
    abilityId: active.abilityId,
    route: route.map(copyVec2),
  });
  startNextVectorFocusSegment(state);
  return "triggered";
}

export function advanceActiveAbilitySelection(state: GameState, deltaMs: number): void {
  const active = state.player.activeAbility;
  if (active?.phase !== "target-selection") return;
  active.elapsedMs += deltaMs;
  if (active.elapsedMs + EPSILON >= active.timeoutMs) cancelActiveAbility(state, "timeout");
}

export function getAbilityWorldTimeScale(state: GameState): number {
  return state.player.activeAbility?.worldTimeScale ?? 1;
}

export function completeVectorFocusSegment(state: GameState): void {
  const active = state.player.activeAbility;
  if (active?.phase !== "route-execution") return;
  active.segmentIndex += 1;
  startNextVectorFocusSegment(state);
}

function getVectorFocusSegmentDurationMs(from: Vec2, to: Vec2): number {
  const distance = Math.sqrt(squaredDistance(from, to));
  const duration = (distance / VECTOR_FOCUS_CONFIG.routeSpeedUnitsPerSecond) * 1_000;
  return Math.min(
    VECTOR_FOCUS_CONFIG.maximumSegmentDurationMs,
    Math.max(VECTOR_FOCUS_CONFIG.minimumSegmentDurationMs, duration),
  );
}

function startNextVectorFocusSegment(state: GameState): void {
  const active = state.player.activeAbility;
  if (active?.phase !== "route-execution") return;
  const requestedTarget = active.route[active.segmentIndex];
  if (!requestedTarget) {
    const abilityId = active.abilityId;
    state.player.activeAbility = null;
    state.player.recoveryRemainingMs = VECTOR_FOCUS_CONFIG.recoveryMs;
    emitGameEvent(state, {
      type: "ability-route-ended",
      abilityId,
      position: copyVec2(state.player.position),
    });
    return;
  }

  const from = copyVec2(state.player.position);
  const to = clampPointToArena(requestedTarget, state.stage.arena, state.player.radius);
  const directionX = to.x - from.x;
  const directionZ = to.z - from.z;
  const distance = Math.hypot(directionX, directionZ);
  const direction = distance > EPSILON
    ? { x: directionX / distance, z: directionZ / distance }
    : copyVec2(state.player.facing);
  const durationMs = getVectorFocusSegmentDurationMs(from, to);
  state.player.facing = direction;
  state.player.dash = {
    abilityId: active.abilityId,
    from,
    to: copyVec2(to),
    durationMs,
    elapsedMs: 0,
    hitRadius: DASH_HIT_RADIUS,
    recoveryMs: VECTOR_FOCUS_CONFIG.recoveryMs,
    execution: "route-segment",
    segmentIndex: active.segmentIndex,
    killCount: 0,
  };
  state.player.recoveryRemainingMs = 0;
  state.player.bufferedAbility = null;
  const anticipatedHits = state.enemies
    .filter((enemy) => enemy.alive && segmentIntersectsCircle(
      from,
      to,
      enemy.position,
      DASH_HIT_RADIUS + enemy.radius,
    ))
    .map((enemy) => ({ entityId: enemy.id, position: copyVec2(enemy.position) }));
  emitGameEvent(state, {
    type: "dash-started",
    abilityId: active.abilityId,
    sourceId: "player",
    from,
    to: copyVec2(to),
    direction: copyVec2(direction),
    durationMs,
    execution: "route-segment",
    segmentIndex: active.segmentIndex,
    anticipatedHits,
  });
}
