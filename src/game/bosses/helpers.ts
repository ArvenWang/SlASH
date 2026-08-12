import type { EntityId } from "../../core/ids";
import { copyVec2, type Vec2 } from "../../core/math/vec2";
import { enemyDefinitions } from "../../content/enemies/definitions";
import { createArmorPartStates } from "../combat/armor";
import type { ArmorPartState, EnemyState, GameState } from "../domain/types";
import { createEnemyTacticalState } from "../enemies/enemy-attack-system";
import { emitGameEvent } from "../events/event-buffer";
import type { BossActionPhase, BossRuntimeState } from "./types";

export function spawnBossAuxiliaryEnemy(
  state: GameState,
  input: {
    readonly id: EntityId;
    readonly definitionId: string;
    readonly position: Vec2;
    readonly facing: Vec2;
    readonly countTowardEncounterTotal?: boolean;
  },
): EnemyState {
  const existing = state.enemies.find((enemy) => enemy.id === input.id);
  if (existing) return existing;
  const definition = enemyDefinitions.get(input.definitionId);
  const enemy: EnemyState = {
    id: input.id,
    definitionId: definition.id,
    position: copyVec2(input.position),
    facing: copyVec2(input.facing),
    radius: definition.radius,
    speed: definition.baseMoveSpeed,
    alive: true,
    state: "active",
    spawnedAtMs: state.elapsedMs,
    killedAtMs: null,
    armorParts: createArmorPartStates(definition.armorProfileId),
    staggerRemainingMs: 0,
    tactical: createEnemyTacticalState(input.id, definition.attackProfile),
  };
  state.enemies.push(enemy);
  if (input.countTowardEncounterTotal) state.combat.totalEnemies += 1;
  return enemy;
}

export function findBossEntity(state: GameState, runtime: BossRuntimeState): EnemyState | null {
  return state.enemies.find((enemy) => enemy.id === runtime.entityId) ?? null;
}

export function enterBossActionPhase(
  state: GameState,
  runtime: BossRuntimeState,
  actionPhase: BossActionPhase,
  durationMs: number,
  target: Vec2 | null = runtime.lockedTarget,
): void {
  const wasCoreExposed = runtime.coreExposed;
  runtime.actionPhase = actionPhase;
  runtime.phaseElapsedMs = 0;
  runtime.phaseDurationMs = Math.max(0, durationMs);
  runtime.lockedTarget = target ? copyVec2(target) : null;
  runtime.coreExposed = actionPhase === "vulnerable";
  if (wasCoreExposed && !runtime.coreExposed) {
    emitGameEvent(state, {
      type: "boss-core-window",
      bossDefinitionId: runtime.definitionId,
      exposed: false,
      durationMs: 0,
    });
  }
  emitGameEvent(state, {
    type: "boss-action-phase-changed",
    bossDefinitionId: runtime.definitionId,
    phaseId: runtime.phaseId,
    actionPhase,
    durationMs: runtime.phaseDurationMs,
    target: runtime.lockedTarget ? copyVec2(runtime.lockedTarget) : null,
  });
  if (actionPhase === "vulnerable") {
    emitGameEvent(state, {
      type: "boss-core-window",
      bossDefinitionId: runtime.definitionId,
      exposed: true,
      durationMs: runtime.phaseDurationMs,
    });
  }
}

export function beginBossPhase(
  state: GameState,
  runtime: BossRuntimeState,
  phaseId: string,
  phaseIndex: number,
  objectiveTarget: number,
): void {
  runtime.phaseId = phaseId;
  runtime.phaseIndex = phaseIndex;
  runtime.objectiveCurrent = 0;
  runtime.objectiveTarget = objectiveTarget;
  emitGameEvent(state, {
    type: "boss-phase-started",
    bossDefinitionId: runtime.definitionId,
    phaseId,
    phaseIndex,
    objectiveTarget,
  });
}

export function progressBossObjective(
  state: GameState,
  runtime: BossRuntimeState,
  nextValue: number,
  source: string,
): void {
  runtime.objectiveCurrent = Math.max(0, Math.min(runtime.objectiveTarget, nextValue));
  emitGameEvent(state, {
    type: "boss-objective-progress",
    bossDefinitionId: runtime.definitionId,
    phaseId: runtime.phaseId,
    objectiveCurrent: runtime.objectiveCurrent,
    objectiveTarget: runtime.objectiveTarget,
    source,
  });
}

export function emitBossBreak(
  state: GameState,
  runtime: BossRuntimeState,
  position: Vec2,
): void {
  runtime.breakCount += 1;
  emitGameEvent(state, {
    type: "boss-break",
    bossDefinitionId: runtime.definitionId,
    phaseId: runtime.phaseId,
    breakIndex: runtime.breakCount,
    objectiveCurrent: runtime.objectiveCurrent,
    objectiveTarget: runtime.objectiveTarget,
    position: copyVec2(position),
  });
  changeBossEnergy(state, 20, `boss-break:${runtime.definitionId}:${runtime.breakCount}`);
}

export function breakBossArmorPart(
  state: GameState,
  enemy: EnemyState,
  armorPart: ArmorPartState,
  contactRegion: "front" | "left" | "right" | "rear",
): boolean {
  const dash = state.player.dash;
  if (!dash || !armorPart.intact) return false;
  armorPart.intact = false;
  armorPart.brokenAtMs = state.elapsedMs;
  dash.armorBreakCount += 1;
  if (dash.armorBreakCount <= 3) changeBossEnergy(state, 4, `boss-armor-break:${enemy.id}`);
  emitGameEvent(state, {
    type: "armor-broken",
    enemyId: enemy.id,
    armorPartId: armorPart.id,
    attackId: dash.abilityId,
    position: copyVec2(enemy.position),
    contactRegion,
  });
  return true;
}

export function resetArmor(enemy: EnemyState): void {
  for (const part of enemy.armorParts) {
    part.intact = true;
    part.brokenAtMs = null;
  }
}

export function clearArmor(enemy: EnemyState): void {
  for (const part of enemy.armorParts) {
    part.intact = false;
    part.brokenAtMs ??= 0;
  }
}

export function completeBossRuntime(state: GameState, runtime: BossRuntimeState): void {
  if (runtime.completed) return;
  runtime.completed = true;
  runtime.actionPhase = "complete";
  runtime.phaseElapsedMs = 0;
  runtime.phaseDurationMs = 0;
  runtime.coreExposed = false;
  for (const enemy of state.enemies) {
    const definition = enemyDefinitions.get(enemy.definitionId);
    if (!enemy.alive || (!definition.tags.includes("boss") && !isOwnedSupport(runtime, enemy.id))) continue;
    enemy.alive = false;
    enemy.state = "dead";
    enemy.killedAtMs = state.elapsedMs;
  }
  state.projectiles = state.projectiles.filter((projectile) => projectile.faction === "player");
  state.obstacles = state.obstacles.filter((obstacle) => obstacle.sourceId !== runtime.entityId);
  state.hazards = state.hazards.filter((hazard) => hazard.sourceId !== runtime.entityId);
  emitGameEvent(state, {
    type: "boss-victory",
    bossDefinitionId: runtime.definitionId,
    breakCount: runtime.breakCount,
    durationMs: state.elapsedMs - runtime.startedAtMs,
  });
}

export function changeBossEnergy(state: GameState, delta: number, source: string): void {
  const before = state.player.ultimateEnergy;
  const after = Math.max(0, Math.min(100, before + delta));
  if (before === after) return;
  state.player.ultimateEnergy = after;
  emitGameEvent(state, { type: "ultimate-energy-changed", before, after, source });
}

export function setBossEnergy(state: GameState, value: number, source: string): void {
  changeBossEnergy(state, Math.max(0, Math.min(100, value)) - state.player.ultimateEnergy, source);
}

export function normalizedDirection(from: Vec2, to: Vec2, fallback: Vec2): Vec2 {
  const x = to.x - from.x;
  const z = to.z - from.z;
  const length = Math.hypot(x, z);
  return length <= 1e-8 ? copyVec2(fallback) : { x: x / length, z: z / length };
}

export function rotateFacingToward(enemy: EnemyState, target: Vec2, radiansPerSecond: number, deltaMs: number): void {
  const desired = normalizedDirection(enemy.position, target, enemy.facing);
  const currentAngle = Math.atan2(enemy.facing.z, enemy.facing.x);
  const desiredAngle = Math.atan2(desired.z, desired.x);
  let delta = desiredAngle - currentAngle;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  const maximum = Math.max(0, radiansPerSecond * Math.max(0, deltaMs) / 1000);
  const next = currentAngle + Math.max(-maximum, Math.min(maximum, delta));
  enemy.facing = { x: Math.cos(next), z: Math.sin(next) };
}

function isOwnedSupport(runtime: BossRuntimeState, entityId: string): boolean {
  if (runtime.mechanics.kind === "siege-choir") return runtime.mechanics.turretEntityIds.includes(entityId);
  if (runtime.mechanics.kind === "mirror-regent") return runtime.mechanics.cloneEntityIds.includes(entityId);
  if (runtime.mechanics.kind === "last-conductor") return runtime.mechanics.barrageSupportEntityIds.includes(entityId);
  return false;
}
