import { obstacleDefinitions } from "../../content/entities/definitions";
import { copyVec2, type Vec2 } from "../../core/math/vec2";
import { clampPointToArena } from "../collision/arena";
import { sweepCircleAgainstShape, type SweepHit } from "../collision/sweep";
import type {
  DashObstacleContactState,
  GameState,
  ObstacleState,
} from "../domain/types";
import { emitGameEvent } from "../events/event-buffer";
import { obstacleWorldShape } from "./entity-shapes";

export const MAX_ACTIVE_OBSTACLES = 8;
const EPSILON = 1e-6;

export interface SpawnObstacleInput {
  readonly id: string;
  readonly definitionId: string;
  readonly position: Vec2;
  readonly rotationRadians?: number;
  readonly velocity?: Vec2;
  readonly sourceId?: string;
}

export interface PlannedDashGeometrySegment {
  readonly from: Vec2;
  readonly to: Vec2;
  readonly reflectionAtEnd: DashObstacleContactState | null;
  readonly terminalImpact: DashObstacleContactState | null;
}

interface ObstacleSweepResult {
  readonly obstacle: ObstacleState;
  readonly hit: SweepHit;
}

export function spawnObstacle(state: GameState, input: SpawnObstacleInput): ObstacleState | null {
  if (state.obstacles.some((obstacle) => obstacle.id === input.id)) return null;
  if (state.obstacles.length >= MAX_ACTIVE_OBSTACLES) return null;
  const definition = obstacleDefinitions.get(input.definitionId);
  const activatesAtMs = state.elapsedMs + definition.activationDelayMs;
  const obstacle: ObstacleState = {
    id: input.id,
    definitionId: definition.id,
    position: copyVec2(input.position),
    rotationRadians: input.rotationRadians ?? 0,
    active: definition.activationDelayMs <= 0,
    spawnedAtMs: state.elapsedMs,
    activatesAtMs,
    expiresAtMs: definition.lifetimeMs === null ? null : activatesAtMs + definition.lifetimeMs,
    velocity: copyVec2(input.velocity ?? { x: 0, z: 0 }),
    sourceId: input.sourceId ?? "environment",
    ageMs: 0,
  };
  state.obstacles.push(obstacle);
  emitGameEvent(state, {
    type: "obstacle-spawned",
    obstacleId: obstacle.id,
    definitionId: obstacle.definitionId,
    position: copyVec2(obstacle.position),
    activatesAtMs,
  });
  if (obstacle.active) {
    emitGameEvent(state, { type: "obstacle-activated", obstacleId: obstacle.id, position: copyVec2(obstacle.position) });
  }
  return obstacle;
}

export function advanceObstacles(state: GameState, deltaMs: number): void {
  const survivors: ObstacleState[] = [];
  for (const obstacle of state.obstacles) {
    obstacle.ageMs += Math.max(0, deltaMs);
    const definition = obstacleDefinitions.get(obstacle.definitionId);
    if (!obstacle.active && obstacle.ageMs + EPSILON >= definition.activationDelayMs) {
      obstacle.active = true;
      emitGameEvent(state, { type: "obstacle-activated", obstacleId: obstacle.id, position: copyVec2(obstacle.position) });
    }
    if (
      definition.lifetimeMs !== null &&
      obstacle.ageMs + EPSILON >= definition.activationDelayMs + definition.lifetimeMs
    ) {
      obstacle.active = false;
      emitGameEvent(state, { type: "obstacle-expired", obstacleId: obstacle.id, position: copyVec2(obstacle.position) });
      continue;
    }
    if (obstacle.active && (Math.abs(obstacle.velocity.x) > EPSILON || Math.abs(obstacle.velocity.z) > EPSILON)) {
      const seconds = Math.max(0, deltaMs) / 1000;
      const requested = {
        x: obstacle.position.x + obstacle.velocity.x * seconds,
        z: obstacle.position.z + obstacle.velocity.z * seconds,
      };
      const clamped = clampPointToArena(requested, state.stage.arena);
      if (Math.abs(clamped.x - requested.x) > EPSILON) obstacle.velocity.x *= -1;
      if (Math.abs(clamped.z - requested.z) > EPSILON) obstacle.velocity.z *= -1;
      obstacle.position = clamped;
    }
    survivors.push(obstacle);
  }
  state.obstacles = survivors;
}

export function planDashGeometry(
  state: GameState,
  from: Vec2,
  requestedTo: Vec2,
): PlannedDashGeometrySegment[] {
  return planDashPolylineGeometry(state, [from, requestedTo]);
}

export function planDashPolylineGeometry(
  state: GameState,
  points: readonly Vec2[],
): PlannedDashGeometrySegment[] {
  if (points.length < 2) return [];
  const requestedSegments = points.slice(0, -1).map((from, index) => ({
    from,
    to: points[index + 1] ?? from,
  }));
  const totalDistance = requestedSegments.reduce((total, segment) => (
    total + Math.hypot(segment.to.x - segment.from.x, segment.to.z - segment.from.z)
  ), 0);
  const planned: PlannedDashGeometrySegment[] = [];
  let completedDistance = 0;
  let collision: ObstacleSweepResult | null = null;
  let collisionSegment: { from: Vec2; to: Vec2 } | null = null;
  for (const segment of requestedSegments) {
    const segmentDistance = Math.hypot(segment.to.x - segment.from.x, segment.to.z - segment.from.z);
    const hit = firstBlockingObstacle(state, segment.from, segment.to, state.player.radius);
    if (!hit) {
      planned.push(plainSegment(segment.from, segment.to));
      completedDistance += segmentDistance;
      continue;
    }
    collision = hit;
    collisionSegment = segment;
    completedDistance += segmentDistance * hit.hit.t;
    break;
  }
  if (!collision || !collisionSegment) return planned;

  const incoming = normalizedDirection(collisionSegment.from, collisionSegment.to, state.player.facing);
  const first = collision;
  const firstContact = contactState(first, incoming);
  const canReflect = state.run.selectedUpgrades.includes("skill-refraction-v1") &&
    obstacleDefinitions.get(first.obstacle.definitionId).tags.includes("reflectable");
  const remainingDistance = Math.max(0, totalDistance - completedDistance);
  if (!canReflect || remainingDistance <= 0.05) {
    planned.push({
      from: copyVec2(collisionSegment.from),
      to: copyVec2(first.hit.point),
      reflectionAtEnd: null,
      terminalImpact: firstContact,
    });
    return planned;
  }

  const dot = incoming.x * first.hit.normal.x + incoming.z * first.hit.normal.z;
  const reflected = normalizedDirection(
    { x: 0, z: 0 },
    {
      x: incoming.x - 2 * dot * first.hit.normal.x,
      z: incoming.z - 2 * dot * first.hit.normal.z,
    },
    { x: -incoming.x, z: -incoming.z },
  );
  const reflectedTarget = clampPointToArena({
    x: first.hit.point.x + reflected.x * remainingDistance,
    z: first.hit.point.z + reflected.z * remainingDistance,
  }, state.stage.arena, state.player.radius);
  const second = firstBlockingObstacle(
    state,
    first.hit.point,
    reflectedTarget,
    state.player.radius,
    first.obstacle.id,
  );
  const reflectedSegment = second
    ? {
        from: copyVec2(first.hit.point),
        to: copyVec2(second.hit.point),
        reflectionAtEnd: null,
        terminalImpact: contactState(second, reflected),
      }
    : plainSegment(first.hit.point, reflectedTarget);
  planned.push({
    from: copyVec2(collisionSegment.from),
    to: copyVec2(first.hit.point),
    reflectionAtEnd: firstContact,
    terminalImpact: null,
  });
  planned.push(reflectedSegment);
  return planned;
}

function firstBlockingObstacle(
  state: GameState,
  from: Vec2,
  to: Vec2,
  radius: number,
  ignoreStartingObstacleId?: string,
): ObstacleSweepResult | null {
  return state.obstacles
    .filter((obstacle) => obstacle.active && obstacleDefinitions.get(obstacle.definitionId).tags.includes("dash-blocking"))
    .map((obstacle) => ({ obstacle, hit: sweepCircleAgainstShape(from, to, radius, obstacleWorldShape(obstacle)) }))
    .filter((candidate): candidate is ObstacleSweepResult => (
      candidate.hit !== null &&
      !(candidate.obstacle.id === ignoreStartingObstacleId && candidate.hit.t <= EPSILON)
    ))
    .sort((first, second) => first.hit.t - second.hit.t || first.obstacle.id.localeCompare(second.obstacle.id))[0] ?? null;
}

function contactState(result: ObstacleSweepResult, incomingDirection: Vec2): DashObstacleContactState {
  return {
    obstacleId: result.obstacle.id,
    position: copyVec2(result.hit.point),
    normal: copyVec2(result.hit.normal),
    incomingDirection: copyVec2(incomingDirection),
  };
}

function plainSegment(from: Vec2, to: Vec2): PlannedDashGeometrySegment {
  return { from: copyVec2(from), to: copyVec2(to), reflectionAtEnd: null, terminalImpact: null };
}

function normalizedDirection(from: Vec2, to: Vec2, fallback: Vec2): Vec2 {
  const x = to.x - from.x;
  const z = to.z - from.z;
  const length = Math.hypot(x, z);
  if (length <= EPSILON) return copyVec2(fallback);
  return { x: x / length, z: z / length };
}
