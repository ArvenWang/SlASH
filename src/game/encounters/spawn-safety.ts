import { enemyDefinitions, SNIPER_ENEMY_ID, CONSTRUCTOR_ENEMY_ID } from "../../content/enemies/definitions";
import { obstacleDefinitions } from "../../content/entities/definitions";
import type { SpawnDefinition } from "../../content/levels/definitions";
import type { FullGameEncounterDefinition } from "../../content/encounters/types";
import { squaredDistance, vec2, type Vec2 } from "../../core/math/vec2";
import { shapesIntersect, type CollisionShape } from "../collision/shapes";
import type { ArenaBounds, GameState } from "../domain/types";
import { hazardWorldShape, obstacleWorldShape, transformLocalShape } from "../entities/entity-shapes";

export const MIN_HOSTILE_SPAWN_DISTANCE = 5;
export const MIN_SPAWN_WARNING_MS = 750;
export const SAFE_LANDING_SIZE = 3;

export interface SpawnSafetyValidationResult {
  readonly ok: true;
  readonly checkedSpawnCount: number;
  readonly safeLandingCenters: readonly Vec2[];
}

const DEFAULT_ARENA: ArenaBounds = { minX: -20, maxX: 20, minZ: -12.5, maxZ: 12.5 };
const FALLBACK_POSITIONS: readonly Vec2[] = [
  vec2(-18, -10), vec2(-14, -10), vec2(-10, -10), vec2(-6, -10), vec2(6, -10), vec2(10, -10), vec2(14, -10), vec2(18, -10),
  vec2(-18, -6), vec2(-14, -6), vec2(-10, -6), vec2(-6, -6), vec2(6, -6), vec2(10, -6), vec2(14, -6), vec2(18, -6),
  vec2(-18, 0), vec2(-14, 0), vec2(-10, 0), vec2(-6, 0), vec2(6, 0), vec2(10, 0), vec2(14, 0), vec2(18, 0),
  vec2(-18, 6), vec2(-14, 6), vec2(-10, 6), vec2(-6, 6), vec2(6, 6), vec2(10, 6), vec2(14, 6), vec2(18, 6),
  vec2(-18, 10), vec2(-14, 10), vec2(-10, 10), vec2(-6, 10), vec2(6, 10), vec2(10, 10), vec2(14, 10), vec2(18, 10),
];

export function validateEncounterSpawnSafety(
  definition: FullGameEncounterDefinition,
  arena: ArenaBounds = DEFAULT_ARENA,
): SpawnSafetyValidationResult {
  const activeObstacleShapes = definition.initialObstacles
    .filter((spawn) => obstacleDefinitions.get(spawn.definitionId).activationDelayMs <= 0)
    .map((spawn) => transformLocalShape(
      obstacleDefinitions.get(spawn.definitionId).shape,
      spawn.position,
      spawn.rotationRadians ?? 0,
    ));
  const activeHazardShapes: CollisionShape[] = [];
  const safeLandingCenters = findSafeLandingCenters(arena, activeObstacleShapes, activeHazardShapes);
  assert(safeLandingCenters.length > 0, `${definition.id} has no 3m x 3m safe landing region`);

  let checkedSpawnCount = 0;
  const globalSpawnIds = new Set<string>();
  for (const wave of definition.waves) {
    assert((wave.warningDurationMs ?? 0) >= MIN_SPAWN_WARNING_MS, `${wave.id} warning is below ${MIN_SPAWN_WARNING_MS}ms`);
    const sniperCount = wave.spawns.filter((spawn) => spawn.enemyDefinitionId === SNIPER_ENEMY_ID).length;
    const constructorCount = wave.spawns.filter((spawn) => spawn.enemyDefinitionId === CONSTRUCTOR_ENEMY_ID).length;
    assert(sniperCount <= 2, `${wave.id} has ${sniperCount} Snipers`);
    assert(constructorCount <= 2, `${wave.id} has ${constructorCount} Constructors`);
    const waveCircles: CollisionShape[] = [];
    for (const spawn of wave.spawns) {
      assert(!globalSpawnIds.has(spawn.id), `${definition.id} repeats spawn id ${spawn.id}`);
      globalSpawnIds.add(spawn.id);
      const enemy = enemyDefinitions.get(spawn.enemyDefinitionId);
      const circle: CollisionShape = { kind: "circle", center: spawn.position, radius: enemy.radius };
      assert(pointInsideArena(spawn.position, enemy.radius, arena), `${spawn.id} is outside the arena`);
      assert(Math.hypot(spawn.position.x, spawn.position.z) >= MIN_HOSTILE_SPAWN_DISTANCE, `${spawn.id} is too close to the player spawn`);
      assert(!activeObstacleShapes.some((shape) => shapesIntersect(circle, shape)), `${spawn.id} overlaps an active obstacle`);
      assert(!activeHazardShapes.some((shape) => shapesIntersect(circle, shape)), `${spawn.id} overlaps an active hazard`);
      assert(!waveCircles.some((other) => shapesIntersect(circle, other)), `${spawn.id} overlaps another hostile in ${wave.id}`);
      waveCircles.push(circle);
      checkedSpawnCount += 1;
    }
  }
  return { ok: true, checkedSpawnCount, safeLandingCenters };
}

/** Resolves authored points against the player's actual location and currently
 * active geometry. It keeps the authored point when safe and otherwise picks
 * the nearest deterministic fallback; it never silently spawns on the player. */
export function resolveSafeEncounterSpawns(
  state: GameState,
  spawns: readonly SpawnDefinition[],
): Array<{ readonly spawn: SpawnDefinition; readonly position: Vec2 }> {
  const activeObstacleShapes = state.obstacles.filter((obstacle) => obstacle.active).map(obstacleWorldShape);
  const activeHazardShapes = state.hazards.filter((hazard) => hazard.active).map(hazardWorldShape);
  const occupied = state.enemies
    .filter((enemy) => enemy.alive)
    .map((enemy): CollisionShape => ({ kind: "circle", center: enemy.position, radius: enemy.radius }));
  const resolved: Array<{ spawn: SpawnDefinition; position: Vec2 }> = [];

  for (const spawn of spawns) {
    const enemy = enemyDefinitions.get(spawn.enemyDefinitionId);
    const candidates = [spawn.position, ...FALLBACK_POSITIONS]
      .filter((candidate, index, all) => all.findIndex((other) => other.x === candidate.x && other.z === candidate.z) === index)
      .sort((first, second) => {
        const distanceDifference = squaredDistance(first, spawn.position) - squaredDistance(second, spawn.position);
        return Math.abs(distanceDifference) > 1e-8
          ? distanceDifference
          : first.x - second.x || first.z - second.z;
      });
    const position = candidates.find((candidate) => isRuntimeSpawnSafe(
      candidate,
      enemy.radius,
      state,
      occupied,
      activeObstacleShapes,
      activeHazardShapes,
    ));
    if (!position) throw new Error(`No safe spawn position remains for ${spawn.id}.`);
    const copy = { x: position.x, z: position.z };
    resolved.push({ spawn, position: copy });
    occupied.push({ kind: "circle", center: copy, radius: enemy.radius });
  }

  assert(
    findSafeLandingCenters(state.stage.arena, activeObstacleShapes, activeHazardShapes).length > 0,
    "runtime wave has no 3m x 3m safe landing region",
  );
  return resolved;
}

export function findSafeLandingCenters(
  arena: ArenaBounds,
  activeObstacleShapes: readonly CollisionShape[],
  activeHazardShapes: readonly CollisionShape[],
): Vec2[] {
  const half = SAFE_LANDING_SIZE / 2;
  const candidates = [
    vec2(0, 0), vec2(-5, 0), vec2(5, 0), vec2(0, -5), vec2(0, 5),
    vec2(-10, -6), vec2(10, -6), vec2(-10, 6), vec2(10, 6),
  ];
  return candidates.filter((center) => {
    const square: CollisionShape = {
      kind: "aabb",
      min: { x: center.x - half, z: center.z - half },
      max: { x: center.x + half, z: center.z + half },
    };
    return pointInsideArena(center, Math.SQRT2 * half, arena) &&
      !activeObstacleShapes.some((shape) => shapesIntersect(square, shape)) &&
      !activeHazardShapes.some((shape) => shapesIntersect(square, shape));
  });
}

function isRuntimeSpawnSafe(
  position: Vec2,
  radius: number,
  state: GameState,
  occupied: readonly CollisionShape[],
  activeObstacleShapes: readonly CollisionShape[],
  activeHazardShapes: readonly CollisionShape[],
): boolean {
  if (!pointInsideArena(position, radius, state.stage.arena)) return false;
  if (squaredDistance(position, state.player.position) < MIN_HOSTILE_SPAWN_DISTANCE ** 2) return false;
  const circle: CollisionShape = { kind: "circle", center: position, radius };
  return !occupied.some((shape) => shapesIntersect(circle, shape)) &&
    !activeObstacleShapes.some((shape) => shapesIntersect(circle, shape)) &&
    !activeHazardShapes.some((shape) => shapesIntersect(circle, shape));
}

function pointInsideArena(position: Vec2, radius: number, arena: ArenaBounds): boolean {
  return position.x - radius >= arena.minX && position.x + radius <= arena.maxX &&
    position.z - radius >= arena.minZ && position.z + radius <= arena.maxZ;
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid encounter spawn safety: ${message}.`);
}
