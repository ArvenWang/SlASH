import { SIEGE_CHOIR_BOSS_ID, type BossDefinition } from "../../content/bosses/definitions";
import { CHARGED_DASH_ABILITY_ID } from "../../content/abilities/definitions";
import { GUNNER_ENEMY_ID } from "../../content/enemies/definitions";
import { DEPLOYABLE_BARRIER_OBSTACLE_ID } from "../../content/entities/definitions";
import { copyVec2 } from "../../core/math/vec2";
import { resolveArmorContact } from "../combat/armor";
import type { DashState, EnemyState, GameState } from "../domain/types";
import { spawnObstacle } from "../entities/obstacle-system";
import { emitGameEvent } from "../events/event-buffer";
import {
  beginBossPhase,
  breakBossArmorPart,
  completeBossRuntime,
  emitBossBreak,
  enterBossActionPhase,
  progressBossObjective,
  resetArmor,
  spawnBossAuxiliaryEnemy,
} from "./helpers";
import type { BossRuntimeState } from "./types";

export const SIEGE_CHOIR_CORE_WINDOW_MS = 1_500;
const SIEGE_CHOIR_TRANSITION_MS = 600;
const SIEGE_CHOIR_BARRIER_INTERVAL_MS = 6_500;
const EPSILON = 1e-6;

export function createSiegeChoirRuntime(
  state: GameState,
  definition: BossDefinition,
  entity: EnemyState,
): BossRuntimeState {
  const runtime: BossRuntimeState = {
    definitionId: SIEGE_CHOIR_BOSS_ID,
    entityId: entity.id,
    startedAtMs: state.elapsedMs,
    phaseId: definition.phases[0]?.id ?? "choir-round-1",
    phaseIndex: 0,
    actionPhase: "objective",
    phaseElapsedMs: 0,
    phaseDurationMs: 0,
    objectiveCurrent: 0,
    objectiveTarget: 1,
    breakCount: 0,
    attackSequence: 0,
    lockedTarget: null,
    lockedDirection: copyVec2(entity.facing),
    coreExposed: false,
    completed: false,
    transitionCount: 0,
    mechanics: {
      kind: "siege-choir",
      round: 1,
      armorBreaksThisRound: 0,
      barrierCooldownMs: 1_200,
      turretEntityIds: [],
    },
  };
  beginBossPhase(state, runtime, runtime.phaseId, 0, 1);
  enterBossActionPhase(state, runtime, "objective", 0, null);
  spawnTurrets(state, runtime);
  return runtime;
}

export function advanceSiegeChoir(
  state: GameState,
  runtime: BossRuntimeState,
  entity: EnemyState,
  deltaMs: number,
): void {
  if (runtime.completed || runtime.mechanics.kind !== "siege-choir") return;
  const safeDelta = Math.max(0, deltaMs);
  runtime.phaseElapsedMs += safeDelta;
  runtime.mechanics.barrierCooldownMs = Math.max(0, runtime.mechanics.barrierCooldownMs - safeDelta);
  if (runtime.mechanics.barrierCooldownMs <= EPSILON) {
    spawnChoirBarrier(state, runtime, entity);
    runtime.mechanics.barrierCooldownMs = SIEGE_CHOIR_BARRIER_INTERVAL_MS;
  }

  if (runtime.actionPhase === "vulnerable" && runtime.phaseElapsedMs + EPSILON >= runtime.phaseDurationMs) {
    resetArmor(entity);
    runtime.mechanics.armorBreaksThisRound = 0;
    enterBossActionPhase(state, runtime, "objective", 0, null);
  } else if (runtime.actionPhase === "transition" && runtime.phaseElapsedMs + EPSILON >= runtime.phaseDurationMs) {
    resetArmor(entity);
    runtime.mechanics.armorBreaksThisRound = 0;
    spawnTurrets(state, runtime);
    enterBossActionPhase(state, runtime, "objective", 0, null);
  }
}

export function resolveSiegeChoirDashContact(
  state: GameState,
  runtime: BossRuntimeState,
  entity: EnemyState,
  dash: DashState,
  segmentStart: { x: number; z: number },
  segmentEnd: { x: number; z: number },
): boolean {
  if (runtime.mechanics.kind !== "siege-choir" || entity.id !== runtime.entityId) return false;
  if (runtime.completed) return true;
  const contact = resolveArmorContact(
    entity,
    segmentStart,
    segmentEnd,
    undefined,
    entity.radius + dash.hitRadius,
  );

  if (runtime.actionPhase === "vulnerable" && contact.isRearContact) {
    progressBossObjective(state, runtime, 1, "rear-core-hit");
    emitBossBreak(state, runtime, entity.position);
    if (runtime.mechanics.round === 2) {
      completeBossRuntime(state, runtime);
      return true;
    }
    runtime.mechanics.round = 2;
    runtime.transitionCount += 1;
    beginBossPhase(state, runtime, "choir-round-2", 1, 1);
    enterBossActionPhase(state, runtime, "transition", SIEGE_CHOIR_TRANSITION_MS, null);
    return true;
  }

  if (contact.armorPart) {
    if (dash.abilityId === CHARGED_DASH_ABILITY_ID && breakBossArmorPart(
      state,
      entity,
      contact.armorPart,
      contact.contactRegion,
    )) {
      runtime.mechanics.armorBreaksThisRound += 1;
      emitGameEvent(state, {
        type: "boss-objective-progress",
        bossDefinitionId: runtime.definitionId,
        phaseId: runtime.phaseId,
        objectiveCurrent: runtime.mechanics.armorBreaksThisRound,
        objectiveTarget: 2,
        source: "armor-coverage-broken",
      });
      if (runtime.mechanics.armorBreaksThisRound >= 2) {
        enterBossActionPhase(state, runtime, "vulnerable", SIEGE_CHOIR_CORE_WINDOW_MS, null);
      }
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

  emitGameEvent(state, {
    type: "armor-blocked",
    enemyId: entity.id,
    armorPartId: "sealed-rear-core",
    attackId: dash.abilityId,
    position: copyVec2(entity.position),
  });
  return true;
}

function spawnTurrets(state: GameState, runtime: BossRuntimeState): void {
  if (runtime.mechanics.kind !== "siege-choir") return;
  const round = runtime.mechanics.round;
  const ids = [`${runtime.entityId}:round-${round}:turret-left`, `${runtime.entityId}:round-${round}:turret-right`];
  const positions = [{ x: -8, z: -5 }, { x: 8, z: -5 }];
  runtime.mechanics.turretEntityIds = ids;
  ids.forEach((id, index) => spawnBossAuxiliaryEnemy(state, {
    id,
    definitionId: GUNNER_ENEMY_ID,
    position: positions[index]!,
    facing: { x: 0, z: 1 },
    countTowardEncounterTotal: true,
  }));
}

function spawnChoirBarrier(state: GameState, runtime: BossRuntimeState, entity: EnemyState): void {
  const activeBarrier = state.obstacles.some((obstacle) => (
    obstacle.sourceId === runtime.entityId && obstacle.active
  ));
  if (activeBarrier) return;
  runtime.attackSequence += 1;
  spawnObstacle(state, {
    id: `${runtime.entityId}:barrier-${runtime.attackSequence}`,
    definitionId: DEPLOYABLE_BARRIER_OBSTACLE_ID,
    position: { x: entity.position.x, z: entity.position.z + 3.8 },
    rotationRadians: 0,
    sourceId: runtime.entityId,
  });
}
