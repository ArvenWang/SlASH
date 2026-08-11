import {
  projectileDefinitions,
  type ProjectileDefinition,
} from "../../content/entities/definitions";
import { copyVec2, type Vec2 } from "../../core/math/vec2";
import { segmentIntersectsCircle } from "../collision/shapes";
import type {
  AbilityId,
  EntityId,
} from "../../core/ids";
import type { EnemyState, GameState, ProjectileState } from "../domain/types";
import { emitGameEvent } from "../events/event-buffer";

export const MAX_ACTIVE_PROJECTILES = 32;
export const MAX_RETURNED_PROJECTILES_PER_DASH = 8;
export const PROJECTILE_RETURN_SPEED_MULTIPLIER = 1.25;
const EPSILON = 1e-8;

export interface SpawnProjectileInput {
  readonly id: EntityId;
  readonly definitionId: string;
  readonly position: Vec2;
  readonly direction: Vec2;
  readonly sourceId: EntityId;
  readonly faction?: "enemy" | "player";
}

export interface ReturnedProjectileImpact {
  readonly projectileId: EntityId;
  readonly enemyId: EntityId;
  readonly attackId: AbilityId;
  readonly from: Vec2;
  readonly to: Vec2;
  readonly radius: number;
}

export interface ProjectileAdvanceResult {
  readonly playerHitBy: EntityId | null;
  readonly returnedImpacts: ReturnedProjectileImpact[];
}

export function spawnProjectile(state: GameState, input: SpawnProjectileInput): ProjectileState | null {
  if (state.projectiles.some((projectile) => projectile.id === input.id)) return null;
  if (state.projectiles.filter((projectile) => projectile.alive).length >= MAX_ACTIVE_PROJECTILES) return null;
  const definition = projectileDefinitions.get(input.definitionId);
  const direction = normalized(input.direction, { x: 1, z: 0 });
  const projectile: ProjectileState = {
    id: input.id,
    definitionId: definition.id,
    position: copyVec2(input.position),
    velocity: { x: direction.x * definition.speed, z: direction.z * definition.speed },
    radius: definition.radius,
    alive: true,
    spawnedAtMs: state.elapsedMs,
    sourceId: input.sourceId,
    faction: input.faction ?? "enemy",
    reflectedAtMs: null,
    ageMs: 0,
    returnTargetId: null,
    reflectedByAbilityId: null,
  };
  state.projectiles.push(projectile);
  emitGameEvent(state, {
    type: "projectile-spawned",
    projectileId: projectile.id,
    definitionId: projectile.definitionId,
    sourceId: projectile.sourceId,
    position: copyVec2(projectile.position),
  });
  return projectile;
}

export function resolveProjectilesAlongDashSegment(
  state: GameState,
  segmentStart: Vec2,
  segmentEnd: Vec2,
): void {
  const dash = state.player.dash;
  if (!dash) return;
  const returnAttackId = projectileReturnAttackId(state, dash.abilityId);
  for (const projectile of state.projectiles) {
    if (!projectile.alive || projectile.faction !== "enemy") continue;
    const definition = projectileDefinitions.get(projectile.definitionId);
    if (!definition.tags.includes("slashable")) continue;
    if (!segmentIntersectsCircle(
      segmentStart,
      segmentEnd,
      projectile.position,
      dash.hitRadius + projectile.radius,
    )) continue;

    const canReturn = returnAttackId !== null &&
      definition.tags.includes("returnable") &&
      dash.projectilesReturnedThisDash < MAX_RETURNED_PROJECTILES_PER_DASH;
    if (canReturn) {
      reflectProjectileTowardSource(state, projectile, definition, returnAttackId);
      dash.projectilesReturnedThisDash += 1;
      continue;
    }
    destroyProjectile(state, projectile, dash.abilityId);
  }
}

export function advanceProjectiles(state: GameState, deltaMs: number): ProjectileAdvanceResult {
  const returnedImpacts: ReturnedProjectileImpact[] = [];
  let playerHitBy: EntityId | null = null;
  const survivors: ProjectileState[] = [];
  const seconds = Math.max(0, deltaMs) / 1000;
  for (const projectile of state.projectiles) {
    if (!projectile.alive) continue;
    const definition = projectileDefinitions.get(projectile.definitionId);
    projectile.ageMs += Math.max(0, deltaMs);
    if (projectile.ageMs + EPSILON >= definition.lifetimeMs) {
      destroyProjectile(state, projectile, "projectile-lifetime-v1");
      continue;
    }
    const previous = copyVec2(projectile.position);
    projectile.position.x += projectile.velocity.x * seconds;
    projectile.position.z += projectile.velocity.z * seconds;
    if (outsideArena(state, projectile)) {
      destroyProjectile(state, projectile, "projectile-arena-exit-v1");
      continue;
    }

    if (projectile.faction === "enemy") {
      if (segmentIntersectsCircle(previous, projectile.position, state.player.position, state.player.radius + projectile.radius)) {
        projectile.alive = false;
        if (state.player.dash !== null) {
          emitProjectileDestroyed(state, projectile, state.player.dash.abilityId);
        } else {
          playerHitBy ??= projectile.id;
          emitGameEvent(state, {
            type: "projectile-hit",
            projectileId: projectile.id,
            targetId: "player",
            faction: projectile.faction,
            position: copyVec2(projectile.position),
          });
        }
      }
    } else {
      const target = returnedProjectileTarget(state, projectile);
      if (target && segmentIntersectsCircle(previous, projectile.position, target.position, target.radius + projectile.radius)) {
        projectile.alive = false;
        returnedImpacts.push({
          projectileId: projectile.id,
          enemyId: target.id,
          attackId: projectile.reflectedByAbilityId ?? "skill-projectile-reversal-v1",
          from: previous,
          to: copyVec2(projectile.position),
          radius: projectile.radius,
        });
        emitGameEvent(state, {
          type: "projectile-hit",
          projectileId: projectile.id,
          targetId: target.id,
          faction: projectile.faction,
          position: copyVec2(projectile.position),
        });
      }
    }
    if (projectile.alive) survivors.push(projectile);
  }
  state.projectiles = survivors;
  return { playerHitBy, returnedImpacts };
}

function reflectProjectileTowardSource(
  state: GameState,
  projectile: ProjectileState,
  definition: ProjectileDefinition,
  attackId: AbilityId,
): void {
  const source = state.enemies.find((enemy) => enemy.id === projectile.sourceId && enemy.alive);
  const fallback = { x: -projectile.velocity.x, z: -projectile.velocity.z };
  const direction = source
    ? normalized({ x: source.position.x - projectile.position.x, z: source.position.z - projectile.position.z }, fallback)
    : normalized(fallback, { x: 1, z: 0 });
  const speed = definition.speed * PROJECTILE_RETURN_SPEED_MULTIPLIER;
  projectile.velocity = { x: direction.x * speed, z: direction.z * speed };
  projectile.faction = "player";
  projectile.reflectedAtMs = state.elapsedMs;
  projectile.returnTargetId = source?.id ?? null;
  projectile.reflectedByAbilityId = attackId;
  emitGameEvent(state, {
    type: "projectile-reflected",
    projectileId: projectile.id,
    attackId,
    sourceId: projectile.sourceId,
    position: copyVec2(projectile.position),
    velocity: copyVec2(projectile.velocity),
  });
}

function outsideArena(state: GameState, projectile: ProjectileState): boolean {
  return projectile.position.x < state.stage.arena.minX - projectile.radius ||
    projectile.position.x > state.stage.arena.maxX + projectile.radius ||
    projectile.position.z < state.stage.arena.minZ - projectile.radius ||
    projectile.position.z > state.stage.arena.maxZ + projectile.radius;
}

function destroyProjectile(state: GameState, projectile: ProjectileState, attackId: AbilityId): void {
  projectile.alive = false;
  emitProjectileDestroyed(state, projectile, attackId);
}

function emitProjectileDestroyed(state: GameState, projectile: ProjectileState, attackId: AbilityId): void {
  emitGameEvent(state, {
    type: "projectile-destroyed",
    projectileId: projectile.id,
    attackId,
    sourceId: projectile.sourceId,
    position: copyVec2(projectile.position),
    direction: normalized(projectile.velocity, { x: 1, z: 0 }),
  });
}

function returnedProjectileTarget(state: GameState, projectile: ProjectileState): EnemyState | null {
  if (!projectile.returnTargetId) return null;
  return state.enemies.find((enemy) => enemy.id === projectile.returnTargetId && enemy.alive) ?? null;
}

function projectileReturnAttackId(state: GameState, dashAbilityId: AbilityId): AbilityId | null {
  if (
    dashAbilityId === "dash-slash" &&
    state.run.selectedUpgrades.includes("skill-projectile-reversal-v1")
  ) return "skill-projectile-reversal-v1";
  if (
    dashAbilityId === "vector-focus" &&
    state.run.selectedUpgrades.includes("skill-projectile-return-v1")
  ) return "skill-projectile-return-v1";
  return null;
}

function normalized(value: Vec2, fallback: Vec2): Vec2 {
  const length = Math.hypot(value.x, value.z);
  if (length <= EPSILON) {
    const fallbackLength = Math.hypot(fallback.x, fallback.z);
    return fallbackLength <= EPSILON ? { x: 1, z: 0 } : { x: fallback.x / fallbackLength, z: fallback.z / fallbackLength };
  }
  return { x: value.x / length, z: value.z / length };
}
