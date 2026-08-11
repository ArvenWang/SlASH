import {
  enemyAttackProfiles,
  type EnemyAttackProfileDefinition,
} from "../../content/enemies/attack-definitions";
import { enemyDefinitions, type EnemyDefinition } from "../../content/enemies/definitions";
import {
  ARMED_MINE_HAZARD_ID,
  DEPLOYABLE_BARRIER_OBSTACLE_ID,
} from "../../content/entities/definitions";
import { copyVec2, squaredDistance, type Vec2 } from "../../core/math/vec2";
import { clampPointToArena } from "../collision/arena";
import type { EnemyState, EnemyTacticalState, GameState } from "../domain/types";
import { spawnHazard } from "../entities/hazard-system";
import { spawnObstacle } from "../entities/obstacle-system";
import { spawnProjectile } from "../entities/projectile-system";
import { emitGameEvent } from "../events/event-buffer";

const EPSILON = 1e-8;

export function createEnemyTacticalState(
  enemyId: string,
  attackProfileId: string,
): EnemyTacticalState | undefined {
  if (!enemyAttackProfiles.has(attackProfileId)) return undefined;
  const profile = enemyAttackProfiles.get(attackProfileId);
  const hash = stableEntityHash(enemyId);
  return {
    attackProfileId,
    attackPhase: "cooldown",
    phaseElapsedMs: 0,
    phaseDurationMs: Math.round(profile.cooldownMs * (0.35 + ((hash >>> 8) % 41) / 100)),
    attackSequence: 0,
    comboStep: 0,
    lockedTarget: null,
    lockedDirection: { x: 0, z: -1 },
    nextTelegraphMultiplier: 1,
    currentTelegraphMultiplier: 1,
    movementSign: (hash & 1) === 0 ? -1 : 1,
  };
}

export function ensureEnemyTacticalState(
  enemy: EnemyState,
  definition = enemyDefinitions.get(enemy.definitionId),
): EnemyTacticalState | undefined {
  if (enemy.tactical?.attackProfileId === definition.attackProfile) return enemy.tactical;
  const created = createEnemyTacticalState(enemy.id, definition.attackProfile);
  if (created) enemy.tactical = created;
  return created;
}

export function advanceEnemyAttacks(state: GameState, deltaMs: number): void {
  const safeDelta = Math.max(0, deltaMs);
  for (const enemy of state.enemies) {
    if (!enemy.alive) continue;
    const definition = enemyDefinitions.get(enemy.definitionId);
    const tactical = ensureEnemyTacticalState(enemy, definition);
    if (!tactical) continue;
    const profile = enemyAttackProfiles.get(tactical.attackProfileId);
    if (enemy.staggerRemainingMs > EPSILON) {
      if (tactical.attackPhase === "telegraph" || tactical.attackPhase === "active") {
        enterPhase(state, enemy, tactical, profile, "recovery", profile.recoveryMs);
      }
      continue;
    }
    tactical.phaseElapsedMs += safeDelta;
    if (tactical.attackPhase === "cooldown") {
      if (
        tactical.phaseElapsedMs + EPSILON < tactical.phaseDurationMs ||
        !targetInRange(state, enemy, profile) ||
        !lethalTelegraphSlotAvailable(state, enemy, definition)
      ) continue;
      beginTelegraph(state, enemy, tactical, profile, false);
    } else if (tactical.attackPhase === "telegraph") {
      if (tactical.phaseElapsedMs + EPSILON < tactical.phaseDurationMs) continue;
      enterPhase(state, enemy, tactical, profile, "active", profile.activeMs);
      performAttackAction(state, enemy, tactical, profile);
    } else if (tactical.attackPhase === "active") {
      if (tactical.phaseElapsedMs + EPSILON < tactical.phaseDurationMs) continue;
      if (profile.repeatTelegraphMs !== null && tactical.comboStep === 0) {
        tactical.comboStep = 1;
        beginTelegraph(state, enemy, tactical, profile, true);
      } else {
        enterPhase(state, enemy, tactical, profile, "recovery", profile.recoveryMs);
      }
    } else if (tactical.phaseElapsedMs + EPSILON >= tactical.phaseDurationMs) {
      tactical.comboStep = 0;
      tactical.lockedTarget = null;
      enterPhase(state, enemy, tactical, profile, "cooldown", profile.cooldownMs);
    }
  }
}

function lethalTelegraphSlotAvailable(
  state: GameState,
  enemy: EnemyState,
  definition: EnemyDefinition,
): boolean {
  if (!definition.tags.includes("charge") && !definition.tags.includes("blink")) return true;
  let activePressure = 0;
  for (const candidate of state.enemies) {
    if (!candidate.alive || candidate.id === enemy.id || !candidate.tactical) continue;
    const candidateDefinition = enemyDefinitions.get(candidate.definitionId);
    if (!candidateDefinition.tags.includes("charge") && !candidateDefinition.tags.includes("blink")) continue;
    if (candidate.tactical.attackPhase === "telegraph" || candidate.tactical.attackPhase === "active") {
      activePressure += 1;
    }
  }
  return activePressure < 3;
}

export function enemyAttackControlsMovement(
  state: GameState,
  enemy: EnemyState,
  definition: EnemyDefinition,
  deltaMs: number,
): boolean {
  const tactical = ensureEnemyTacticalState(enemy, definition);
  if (!tactical) return false;
  const profile = enemyAttackProfiles.get(tactical.attackProfileId);
  if (tactical.attackPhase === "cooldown") return false;
  if (tactical.attackPhase === "telegraph") {
    faceDirection(enemy, tactical.lockedDirection, definition.turnSpeedRadiansPerSecond, deltaMs);
    return true;
  }
  if (tactical.attackPhase === "active" && (
    profile.action === "melee-lunge" || profile.action === "blink-lunge"
  )) {
    faceDirection(enemy, tactical.lockedDirection, Number.POSITIVE_INFINITY, deltaMs);
    const seconds = Math.max(0, deltaMs) / 1000;
    enemy.position = clampPointToArena({
      x: enemy.position.x + tactical.lockedDirection.x * profile.activeMoveSpeed * seconds,
      z: enemy.position.z + tactical.lockedDirection.z * profile.activeMoveSpeed * seconds,
    }, state.stage.arena, enemy.radius);
  }
  return true;
}

export function isEnemyContactLethal(enemy: EnemyState): boolean {
  const tactical = enemy.tactical;
  if (!tactical || !enemyAttackProfiles.has(tactical.attackProfileId)) {
    return enemyDefinitions.get(enemy.definitionId).attackProfile === "contact-lethal";
  }
  const action = enemyAttackProfiles.get(tactical.attackProfileId).action;
  return tactical.attackPhase === "active" && (action === "melee-lunge" || action === "blink-lunge");
}

function beginTelegraph(
  state: GameState,
  enemy: EnemyState,
  tactical: EnemyTacticalState,
  profile: EnemyAttackProfileDefinition,
  repeated: boolean,
): void {
  tactical.attackSequence += 1;
  tactical.lockedTarget = predictedTarget(state, profile);
  tactical.lockedDirection = normalized({
    x: tactical.lockedTarget.x - enemy.position.x,
    z: tactical.lockedTarget.z - enemy.position.z,
  }, enemy.facing);
  tactical.currentTelegraphMultiplier = tactical.nextTelegraphMultiplier;
  tactical.nextTelegraphMultiplier = 1;
  const authored = repeated && profile.repeatTelegraphMs !== null
    ? profile.repeatTelegraphMs
    : profile.telegraphMs * tactical.currentTelegraphMultiplier;
  const duration = Math.max(profile.minimumTelegraphMs, Math.round(authored));
  enterPhase(state, enemy, tactical, profile, "telegraph", duration);
}

function enterPhase(
  state: GameState,
  enemy: EnemyState,
  tactical: EnemyTacticalState,
  profile: EnemyAttackProfileDefinition,
  phase: EnemyTacticalState["attackPhase"],
  durationMs: number,
): void {
  tactical.attackPhase = phase;
  tactical.phaseElapsedMs = 0;
  tactical.phaseDurationMs = Math.max(0, durationMs);
  emitGameEvent(state, {
    type: "enemy-attack-phase-changed",
    enemyId: enemy.id,
    attackProfileId: profile.id,
    phase,
    durationMs: tactical.phaseDurationMs,
    attackSequence: tactical.attackSequence,
    target: tactical.lockedTarget ? copyVec2(tactical.lockedTarget) : null,
    direction: copyVec2(tactical.lockedDirection),
  });
}

function performAttackAction(
  state: GameState,
  enemy: EnemyState,
  tactical: EnemyTacticalState,
  profile: EnemyAttackProfileDefinition,
): void {
  if (profile.action === "projectile-volley" && profile.projectileDefinitionId) {
    profile.volleyAnglesRadians.forEach((angle, index) => {
      spawnProjectile(state, {
        id: `${enemy.id}:attack-${String(tactical.attackSequence).padStart(3, "0")}:shot-${index + 1}`,
        definitionId: profile.projectileDefinitionId!,
        position: {
          x: enemy.position.x + tactical.lockedDirection.x * (enemy.radius + 0.25),
          z: enemy.position.z + tactical.lockedDirection.z * (enemy.radius + 0.25),
        },
        direction: rotated(tactical.lockedDirection, angle),
        sourceId: enemy.id,
      });
    });
  } else if (profile.action === "deploy-barrier") {
    deployBarriers(state, enemy, tactical, profile);
  } else if (profile.action === "deploy-mine") {
    const minePosition = clampPointToArena({
      x: enemy.position.x - tactical.lockedDirection.x * 0.8,
      z: enemy.position.z - tactical.lockedDirection.z * 0.8,
    }, state.stage.arena, 1.25);
    spawnHazard(state, {
      id: `${enemy.id}:attack-${String(tactical.attackSequence).padStart(3, "0")}:mine`,
      definitionId: ARMED_MINE_HAZARD_ID,
      position: minePosition,
      sourceId: enemy.id,
    });
  } else if (profile.action === "blink-lunge" && tactical.lockedTarget) {
    const from = copyVec2(enemy.position);
    enemy.position = clampPointToArena({
      x: tactical.lockedTarget.x - tactical.lockedDirection.x * 2.6,
      z: tactical.lockedTarget.z - tactical.lockedDirection.z * 2.6,
    }, state.stage.arena, enemy.radius);
    emitGameEvent(state, {
      type: "enemy-blinked",
      enemyId: enemy.id,
      from,
      to: copyVec2(enemy.position),
      target: copyVec2(tactical.lockedTarget),
    });
  } else if (profile.action === "support-pulse") {
    const affectedEnemyIds: string[] = [];
    for (const ally of state.enemies) {
      if (!ally.alive || ally.id === enemy.id || squaredDistance(ally.position, enemy.position) > 8 ** 2) continue;
      const allyTactical = ensureEnemyTacticalState(ally);
      if (!allyTactical || enemyAttackProfiles.get(allyTactical.attackProfileId).action === "support-pulse") continue;
      allyTactical.nextTelegraphMultiplier = Math.min(allyTactical.nextTelegraphMultiplier, 0.8);
      affectedEnemyIds.push(ally.id);
    }
    emitGameEvent(state, {
      type: "enemy-support-pulse",
      enemyId: enemy.id,
      affectedEnemyIds,
      telegraphMultiplier: 0.8,
    });
  }
}

function deployBarriers(
  state: GameState,
  enemy: EnemyState,
  tactical: EnemyTacticalState,
  profile: EnemyAttackProfileDefinition,
): void {
  const owned = state.obstacles.filter((obstacle) => (
    obstacle.sourceId === enemy.id && obstacle.definitionId === DEPLOYABLE_BARRIER_OBSTACLE_ID
  ));
  if (owned.length >= profile.deploymentCount) {
    if (profile.deploymentCount > 1) {
      const moving = owned.slice().sort((first, second) => first.spawnedAtMs - second.spawnedAtMs)[0];
      if (moving) {
        const perpendicular = { x: -tactical.lockedDirection.z, z: tactical.lockedDirection.x };
        moving.velocity = {
          x: perpendicular.x * 1.6 * tactical.movementSign,
          z: perpendicular.z * 1.6 * tactical.movementSign,
        };
      }
    }
    return;
  }
  const perpendicular = { x: -tactical.lockedDirection.z, z: tactical.lockedDirection.x };
  for (let index = owned.length; index < profile.deploymentCount; index += 1) {
    const offset = (index - (profile.deploymentCount - 1) / 2) * 4.2;
    let position = {
      x: enemy.position.x + tactical.lockedDirection.x * 3.6 + perpendicular.x * offset,
      z: enemy.position.z + tactical.lockedDirection.z * 3.6 + perpendicular.z * offset,
    };
    const playerDistance = Math.hypot(
      position.x - state.player.position.x,
      position.z - state.player.position.z,
    );
    if (playerDistance < 3.2) {
      position = {
        x: position.x - tactical.lockedDirection.x * (3.2 - playerDistance),
        z: position.z - tactical.lockedDirection.z * (3.2 - playerDistance),
      };
    }
    spawnObstacle(state, {
      id: `${enemy.id}:attack-${String(tactical.attackSequence).padStart(3, "0")}:barrier-${index + 1}`,
      definitionId: DEPLOYABLE_BARRIER_OBSTACLE_ID,
      position: clampPointToArena(position, state.stage.arena, 2.8),
      rotationRadians: Math.atan2(tactical.lockedDirection.z, tactical.lockedDirection.x) + Math.PI / 2,
      velocity: profile.deploymentCount > 1 && index === 0
        ? { x: perpendicular.x * 1.1 * tactical.movementSign, z: perpendicular.z * 1.1 * tactical.movementSign }
        : undefined,
      sourceId: enemy.id,
    });
  }
}

function predictedTarget(
  state: GameState,
  profile: EnemyAttackProfileDefinition,
): Vec2 {
  if (profile.action === "blink-lunge") {
    return clampPointToArena({
      x: state.player.position.x + state.player.facing.x * 2.8,
      z: state.player.position.z + state.player.facing.z * 2.8,
    }, state.stage.arena, state.player.radius);
  }
  return copyVec2(state.player.position);
}

function targetInRange(state: GameState, enemy: EnemyState, profile: EnemyAttackProfileDefinition): boolean {
  if (profile.action === "support-pulse") {
    return state.enemies.some((ally) => ally.alive && ally.id !== enemy.id && squaredDistance(ally.position, enemy.position) <= 8 ** 2);
  }
  const distance = Math.hypot(
    state.player.position.x - enemy.position.x,
    state.player.position.z - enemy.position.z,
  );
  return distance + EPSILON >= profile.minimumRange && distance <= profile.maximumRange + EPSILON;
}

function faceDirection(enemy: EnemyState, desired: Vec2, turnSpeed: number, deltaMs: number): void {
  const currentAngle = Math.atan2(enemy.facing.z, enemy.facing.x);
  const desiredAngle = Math.atan2(desired.z, desired.x);
  let delta = desiredAngle - currentAngle;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  const maximum = Number.isFinite(turnSpeed) ? Math.max(0, turnSpeed * Math.max(0, deltaMs) / 1000) : Math.PI * 2;
  const next = currentAngle + Math.max(-maximum, Math.min(maximum, delta));
  enemy.facing = { x: Math.cos(next), z: Math.sin(next) };
}

function normalized(value: Vec2, fallback: Vec2): Vec2 {
  const length = Math.hypot(value.x, value.z);
  if (length <= EPSILON) return copyVec2(fallback);
  return { x: value.x / length, z: value.z / length };
}

function rotated(direction: Vec2, angle: number): Vec2 {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return {
    x: direction.x * cosine - direction.z * sine,
    z: direction.x * sine + direction.z * cosine,
  };
}

function stableEntityHash(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
