import { LAST_CONDUCTOR_BOSS_ID, type BossDefinition } from "../../content/bosses/definitions";
import { CHARGED_DASH_ABILITY_ID, VECTOR_FOCUS_ABILITY_ID } from "../../content/abilities/definitions";
import { STRIKER_ENEMY_ID } from "../../content/enemies/definitions";
import {
  ARC_RAIL_HAZARD_ID,
  BOSS_SHARD_PROJECTILE_ID,
  RAIL_GATE_OBSTACLE_ID,
} from "../../content/entities/definitions";
import { copyVec2 } from "../../core/math/vec2";
import { segmentIntersectsCircle } from "../collision/shapes";
import { resolveArmorContact } from "../combat/armor";
import type { DashState, EnemyState, GameState } from "../domain/types";
import { spawnHazard } from "../entities/hazard-system";
import { spawnObstacle } from "../entities/obstacle-system";
import { spawnProjectile } from "../entities/projectile-system";
import { emitGameEvent } from "../events/event-buffer";
import {
  beginBossPhase,
  breakBossArmorPart,
  clearArmor,
  completeBossRuntime,
  emitBossBreak,
  enterBossActionPhase,
  normalizedDirection,
  progressBossObjective,
  resetArmor,
  setBossEnergy,
  spawnBossAuxiliaryEnemy,
} from "./helpers";
import type { BossObjectiveNodeState, BossRuntimeState } from "./types";

const PHASE_TELEGRAPH_MS = [650, 1_400, 650, 600] as const;
const BARRAGE_SHOT_INTERVAL_MS = 1_250;
const RAIL_PULSE_INTERVAL_MS = 2_600;
const FINALE_REFILL_DELAY_MS = 350;
const OBJECTIVE_NODE_RADIUS = 1.55;
const EPSILON = 1e-6;

const RAIL_NODE_POSITIONS = [
  { x: -12, z: 7 },
  { x: 0, z: -7 },
  { x: 12, z: 7 },
] as const;

const FINALE_NODE_POSITIONS = [
  { x: -10, z: -2 },
  { x: 0, z: 8 },
  { x: 10, z: -2 },
] as const;

export function createLastConductorRuntime(
  state: GameState,
  definition: BossDefinition,
  entity: EnemyState,
): BossRuntimeState {
  const runtime: BossRuntimeState = {
    definitionId: LAST_CONDUCTOR_BOSS_ID,
    entityId: entity.id,
    startedAtMs: state.elapsedMs,
    phaseId: definition.phases[0]?.id ?? "barrage",
    phaseIndex: 0,
    actionPhase: "telegraph",
    phaseElapsedMs: 0,
    phaseDurationMs: PHASE_TELEGRAPH_MS[0],
    objectiveCurrent: 0,
    objectiveTarget: 3,
    breakCount: 0,
    attackSequence: 0,
    lockedTarget: null,
    lockedDirection: copyVec2(entity.facing),
    coreExposed: false,
    completed: false,
    transitionCount: 0,
    mechanics: {
      kind: "last-conductor",
      barrageSupportEntityIds: [],
      barrageShotCooldownMs: 700,
      railPulseCooldownMs: 0,
      railNodes: objectiveNodes("rail", RAIL_NODE_POSITIONS),
      armorBreakCount: 0,
      finaleNodes: objectiveNodes("finale", FINALE_NODE_POSITIONS),
      finaleRefillCooldownMs: 0,
      finaleAttemptActive: false,
      finaleAttemptInvalid: false,
    },
  };
  startPhase(state, runtime, entity, definition, 0);
  return runtime;
}

export function advanceLastConductor(
  state: GameState,
  runtime: BossRuntimeState,
  entity: EnemyState,
  definition: BossDefinition,
  deltaMs: number,
): void {
  if (runtime.completed || runtime.mechanics.kind !== "last-conductor") return;
  const safeDelta = Math.max(0, deltaMs);
  runtime.phaseElapsedMs += safeDelta;
  if (
    (runtime.actionPhase === "telegraph" || runtime.actionPhase === "transition") &&
    runtime.phaseElapsedMs + EPSILON >= runtime.phaseDurationMs
  ) {
    enterBossActionPhase(state, runtime, "objective", 0, null);
  }

  if (runtime.phaseIndex === 0) advanceBarrage(state, runtime, entity, safeDelta);
  else if (runtime.phaseIndex === 1) advanceRailGrid(state, runtime, entity, safeDelta);
  else if (runtime.phaseIndex === 3) advanceFinaleRefill(state, runtime, safeDelta);

  if (runtime.phaseIndex > 3) completeBossRuntime(state, runtime);
  if (runtime.phaseIndex < 0 || runtime.phaseIndex >= definition.phases.length) return;
}

export function resolveLastConductorDashContact(
  state: GameState,
  runtime: BossRuntimeState,
  entity: EnemyState,
  dash: DashState,
  segmentStart: { x: number; z: number },
  segmentEnd: { x: number; z: number },
  definition: BossDefinition,
): boolean {
  if (runtime.mechanics.kind !== "last-conductor" || entity.id !== runtime.entityId) return false;
  if (runtime.completed) return true;
  if (runtime.actionPhase === "telegraph" || runtime.actionPhase === "transition") return true;

  if (runtime.phaseIndex === 0) {
    if (!runtime.coreExposed) return true;
    progressBossObjective(state, runtime, 3, "barrage-core-hit");
    emitBossBreak(state, runtime, entity.position);
    startPhase(state, runtime, entity, definition, 1);
    return true;
  }

  if (runtime.phaseIndex === 2) {
    const contact = resolveArmorContact(
      entity,
      segmentStart,
      segmentEnd,
      undefined,
      entity.radius + dash.hitRadius,
    );
    if (contact.armorPart) {
      if (
        dash.abilityId === CHARGED_DASH_ABILITY_ID &&
        breakBossArmorPart(state, entity, contact.armorPart, contact.contactRegion)
      ) {
        runtime.mechanics.armorBreakCount += 1;
        progressBossObjective(state, runtime, runtime.mechanics.armorBreakCount, "armor-shell-break");
        if (runtime.mechanics.armorBreakCount >= 3) runtime.coreExposed = true;
      } else {
        emitGameEvent(state, {
          type: "armor-blocked",
          enemyId: entity.id,
          armorPartId: contact.armorPart.id,
          attackId: dash.abilityId,
          position: copyVec2(entity.position),
        });
      }
      return true;
    }
    if (runtime.coreExposed) {
      progressBossObjective(state, runtime, 4, "armor-shell-core-hit");
      emitBossBreak(state, runtime, entity.position);
      startPhase(state, runtime, entity, definition, 3);
      return true;
    }
    return true;
  }
  return true;
}

export function recordLastConductorDash(
  state: GameState,
  runtime: BossRuntimeState,
  entity: EnemyState,
  dash: DashState,
  definition: BossDefinition,
): void {
  if (runtime.completed || runtime.mechanics.kind !== "last-conductor") return;
  if (runtime.phaseIndex === 1 && runtime.actionPhase === "objective") {
    progressNodesAlongDash(state, runtime, runtime.mechanics.railNodes, dash, "rail-node");
    if (runtime.objectiveCurrent >= runtime.objectiveTarget) {
      emitBossBreak(state, runtime, entity.position);
      startPhase(state, runtime, entity, definition, 2);
    }
    return;
  }
  if (runtime.phaseIndex !== 3 || runtime.actionPhase !== "objective") return;
  if (dash.abilityId !== VECTOR_FOCUS_ABILITY_ID || runtime.mechanics.finaleAttemptInvalid) return;
  runtime.mechanics.finaleAttemptActive = true;
  const expected = runtime.mechanics.finaleNodes[runtime.objectiveCurrent];
  const touchedExpected = expected !== undefined && dash.pathSegments.some((segment) => (
    segmentIntersectsCircle(segment.from, segment.to, expected.position, OBJECTIVE_NODE_RADIUS)
  ));
  const touchedWrong = runtime.mechanics.finaleNodes.some((node, index) => (
    index !== runtime.objectiveCurrent &&
    !node.reached &&
    dash.pathSegments.some((segment) => segmentIntersectsCircle(
      segment.from,
      segment.to,
      node.position,
      OBJECTIVE_NODE_RADIUS,
    ))
  ));
  if (!touchedExpected || touchedWrong || !expected) {
    runtime.mechanics.finaleAttemptInvalid = true;
    runtime.mechanics.finaleRefillCooldownMs = FINALE_REFILL_DELAY_MS;
    return;
  }
  expected.reached = true;
  progressBossObjective(state, runtime, runtime.objectiveCurrent + 1, "vector-finale-node");
  if (runtime.objectiveCurrent >= runtime.objectiveTarget) {
    emitBossBreak(state, runtime, entity.position);
    completeBossRuntime(state, runtime);
  }
}

function startPhase(
  state: GameState,
  runtime: BossRuntimeState,
  entity: EnemyState,
  definition: BossDefinition,
  phaseIndex: number,
): void {
  if (runtime.mechanics.kind !== "last-conductor") return;
  clearPhaseEntities(state, runtime);
  const phase = definition.phases[phaseIndex];
  if (!phase) {
    completeBossRuntime(state, runtime);
    return;
  }
  runtime.transitionCount += phaseIndex === 0 ? 0 : 1;
  beginBossPhase(state, runtime, phase.id, phaseIndex, phase.objectiveTarget);
  runtime.coreExposed = false;
  enterBossActionPhase(state, runtime, phaseIndex === 0 ? "telegraph" : "transition", PHASE_TELEGRAPH_MS[phaseIndex]!, null);

  if (phaseIndex === 0) {
    clearArmor(entity);
    runtime.mechanics.barrageShotCooldownMs = 700;
    spawnBarrageSupports(state, runtime);
  } else if (phaseIndex === 1) {
    clearArmor(entity);
    runtime.mechanics.railNodes = objectiveNodes("rail", RAIL_NODE_POSITIONS);
    runtime.mechanics.railPulseCooldownMs = 0;
    spawnRailGates(state, runtime);
  } else if (phaseIndex === 2) {
    resetArmor(entity);
    runtime.mechanics.armorBreakCount = 0;
  } else {
    clearArmor(entity);
    runtime.mechanics.finaleNodes = objectiveNodes("finale", FINALE_NODE_POSITIONS);
    runtime.mechanics.finaleAttemptActive = false;
    runtime.mechanics.finaleAttemptInvalid = false;
    runtime.mechanics.finaleRefillCooldownMs = 0;
    setBossEnergy(state, 100, "last-conductor-vector-finale");
  }
}

function advanceBarrage(
  state: GameState,
  runtime: BossRuntimeState,
  entity: EnemyState,
  deltaMs: number,
): void {
  if (runtime.mechanics.kind !== "last-conductor") return;
  const defeated = runtime.mechanics.barrageSupportEntityIds.filter((id) => (
    !state.enemies.some((enemy) => enemy.id === id && enemy.alive)
  )).length;
  if (defeated > runtime.objectiveCurrent) progressBossObjective(state, runtime, defeated, "barrage-support-defeated");
  if (defeated >= 2 && !runtime.coreExposed) {
    runtime.coreExposed = true;
    enterBossActionPhase(state, runtime, "vulnerable", 60_000, null);
  }
  if (runtime.actionPhase !== "objective" && runtime.actionPhase !== "vulnerable") return;
  runtime.mechanics.barrageShotCooldownMs = Math.max(0, runtime.mechanics.barrageShotCooldownMs - deltaMs);
  if (runtime.mechanics.barrageShotCooldownMs > EPSILON) return;
  runtime.mechanics.barrageShotCooldownMs = BARRAGE_SHOT_INTERVAL_MS;
  runtime.attackSequence += 1;
  const center = normalizedDirection(entity.position, state.player.position, entity.facing);
  [-0.18, 0, 0.18].forEach((angle, index) => {
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    spawnProjectile(state, {
      id: `${runtime.entityId}:barrage-${runtime.attackSequence}:shot-${index}`,
      definitionId: BOSS_SHARD_PROJECTILE_ID,
      position: copyVec2(entity.position),
      direction: {
        x: center.x * cosine - center.z * sine,
        z: center.x * sine + center.z * cosine,
      },
      sourceId: runtime.entityId,
    });
  });
}

function advanceRailGrid(
  state: GameState,
  runtime: BossRuntimeState,
  _entity: EnemyState,
  deltaMs: number,
): void {
  if (runtime.mechanics.kind !== "last-conductor" || runtime.actionPhase !== "objective") return;
  runtime.mechanics.railPulseCooldownMs = Math.max(0, runtime.mechanics.railPulseCooldownMs - deltaMs);
  if (runtime.mechanics.railPulseCooldownMs > EPSILON) return;
  runtime.mechanics.railPulseCooldownMs = RAIL_PULSE_INTERVAL_MS;
  runtime.attackSequence += 1;
  spawnHazard(state, {
    id: `${runtime.entityId}:rail-pulse-${runtime.attackSequence}`,
    definitionId: ARC_RAIL_HAZARD_ID,
    position: { x: 0, z: runtime.attackSequence % 2 === 0 ? 3.5 : -3.5 },
    rotationRadians: runtime.attackSequence % 3 === 0 ? Math.PI / 2 : 0,
    sourceId: runtime.entityId,
  });
}

function advanceFinaleRefill(state: GameState, runtime: BossRuntimeState, deltaMs: number): void {
  if (runtime.mechanics.kind !== "last-conductor") return;
  const failedExecutionFinished = runtime.mechanics.finaleAttemptInvalid &&
    state.player.ultimateExecution === null &&
    state.player.ultimatePlanning === null &&
    state.player.dash === null;
  if (!failedExecutionFinished) return;
  runtime.mechanics.finaleRefillCooldownMs = Math.max(0, runtime.mechanics.finaleRefillCooldownMs - deltaMs);
  if (runtime.mechanics.finaleRefillCooldownMs > EPSILON) return;
  runtime.mechanics.finaleNodes.forEach((node) => { node.reached = false; });
  runtime.mechanics.finaleAttemptActive = false;
  runtime.mechanics.finaleAttemptInvalid = false;
  progressBossObjective(state, runtime, 0, "vector-finale-retry");
  setBossEnergy(state, 100, "last-conductor-vector-finale-retry");
}

function progressNodesAlongDash(
  state: GameState,
  runtime: BossRuntimeState,
  nodes: BossObjectiveNodeState[],
  dash: DashState,
  source: string,
): void {
  let expected = nodes[runtime.objectiveCurrent];
  while (expected && dash.pathSegments.some((segment) => segmentIntersectsCircle(
    segment.from,
    segment.to,
    expected!.position,
    OBJECTIVE_NODE_RADIUS,
  ))) {
    expected.reached = true;
    progressBossObjective(state, runtime, runtime.objectiveCurrent + 1, source);
    expected = nodes[runtime.objectiveCurrent];
  }
}

function spawnBarrageSupports(state: GameState, runtime: BossRuntimeState): void {
  if (runtime.mechanics.kind !== "last-conductor") return;
  const ids = [`${runtime.entityId}:barrage-left`, `${runtime.entityId}:barrage-right`];
  runtime.mechanics.barrageSupportEntityIds = ids;
  [{ x: -7, z: -3 }, { x: 7, z: -3 }].forEach((position, index) => {
    spawnBossAuxiliaryEnemy(state, {
      id: ids[index]!,
      definitionId: STRIKER_ENEMY_ID,
      position,
      facing: { x: 0, z: 1 },
      countTowardEncounterTotal: true,
    });
  });
}

function spawnRailGates(state: GameState, runtime: BossRuntimeState): void {
  [-14, 14].forEach((x, index) => {
    spawnObstacle(state, {
      id: `${runtime.entityId}:rail-gate-${index}`,
      definitionId: RAIL_GATE_OBSTACLE_ID,
      position: { x, z: 0 },
      rotationRadians: Math.PI / 2,
      velocity: { x: 0, z: index === 0 ? 1.8 : -1.8 },
      sourceId: runtime.entityId,
    });
  });
}

function clearPhaseEntities(state: GameState, runtime: BossRuntimeState): void {
  if (runtime.mechanics.kind !== "last-conductor") return;
  for (const id of runtime.mechanics.barrageSupportEntityIds) {
    const enemy = state.enemies.find((candidate) => candidate.id === id);
    if (!enemy?.alive) continue;
    enemy.alive = false;
    enemy.state = "dead";
    enemy.killedAtMs = state.elapsedMs;
  }
  runtime.mechanics.barrageSupportEntityIds = [];
  state.projectiles = state.projectiles.filter((projectile) => projectile.sourceId !== runtime.entityId);
  state.obstacles = state.obstacles.filter((obstacle) => obstacle.sourceId !== runtime.entityId);
  state.hazards = state.hazards.filter((hazard) => hazard.sourceId !== runtime.entityId);
}

function objectiveNodes(prefix: string, positions: readonly { x: number; z: number }[]): BossObjectiveNodeState[] {
  return positions.map((position, index) => ({
    id: `${prefix}-${index + 1}`,
    position: copyVec2(position),
    reached: false,
  }));
}
