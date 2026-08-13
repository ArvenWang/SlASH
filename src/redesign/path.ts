import type { ObstacleArchetype } from "./run";
import type { CoreSkillBuild } from "./skills";
import { refractionDistanceMultiplier, wideSlashMultiplier } from "./skills";
import type { ObstacleState, PathSegmentState } from "./state";
import type { Vec2 } from "./math";
import {
  EPSILON,
  add,
  distance,
  dot,
  normalize,
  reflect,
  rotate,
  scale,
  subtract,
} from "./math";

export const BASE_DASH_HIT_RADIUS = 0.95;
export const BASIC_DASH_DISTANCE = 16;
export const CHARGED_DASH_DISTANCE = 28;
export const ULTIMATE_DASH_DISTANCE = 30;

export interface PlannedDashPath {
  readonly segments: readonly PathSegmentState[];
  readonly hitRadius: number;
  readonly totalLength: number;
  readonly terminalBlocked: boolean;
}

interface ObstacleHit {
  readonly obstacle: ObstacleState;
  readonly t: number;
  readonly point: Vec2;
  readonly normal: Vec2;
}

export function planDashPath(
  from: Vec2,
  requestedTarget: Vec2,
  maximumDistance: number,
  playerRadius: number,
  build: CoreSkillBuild,
  obstacles: readonly ObstacleState[],
): PlannedDashPath {
  const requestedOffset = subtract(requestedTarget, from);
  const requestedDistance = Math.min(maximumDistance, Math.max(0.01, Math.hypot(requestedOffset.x, requestedOffset.z)));
  const direction = normalize(requestedOffset);
  const target = add(from, scale(direction, requestedDistance));
  const first = firstObstacleHit(from, target, playerRadius, obstacles);
  const hitRadius = BASE_DASH_HIT_RADIUS * wideSlashMultiplier(build);
  if (!first) {
    return {
      segments: [segment(from, target, false)],
      hitRadius,
      totalLength: requestedDistance,
      terminalBlocked: false,
    };
  }

  const firstLength = distance(from, first.point);
  const refractionScale = first.obstacle.archetype === "reflector"
    ? refractionDistanceMultiplier(build)
    : 0;
  const remaining = Math.max(0, requestedDistance - firstLength) * refractionScale;
  if (remaining <= 0.05) {
    return {
      segments: [segment(from, first.point, false)],
      hitRadius,
      totalLength: firstLength,
      terminalBlocked: true,
    };
  }

  const reflectedDirection = reflect(direction, first.normal);
  const reflectedTarget = add(first.point, scale(reflectedDirection, remaining));
  const second = firstObstacleHit(first.point, reflectedTarget, playerRadius, obstacles, first.obstacle.id);
  const secondTarget = second?.point ?? reflectedTarget;
  const firstSegment: PathSegmentState = {
    from: { ...from },
    to: { ...first.point },
    reflected: false,
    reflectionPoint: { ...first.point },
    reflectionNormal: { ...first.normal },
  };
  const secondSegment = segment(first.point, secondTarget, true);
  return {
    segments: [firstSegment, secondSegment],
    hitRadius,
    totalLength: firstLength + distance(first.point, secondTarget),
    terminalBlocked: second !== null,
  };
}

export function pointAlongPath(segments: readonly PathSegmentState[], distanceAlong: number): Vec2 {
  let remaining = Math.max(0, distanceAlong);
  for (const segmentState of segments) {
    const segmentLength = distance(segmentState.from, segmentState.to);
    if (remaining <= segmentLength || segmentLength <= EPSILON) {
      const ratio = segmentLength <= EPSILON ? 1 : remaining / segmentLength;
      return {
        x: segmentState.from.x + (segmentState.to.x - segmentState.from.x) * ratio,
        z: segmentState.from.z + (segmentState.to.z - segmentState.from.z) * ratio,
      };
    }
    remaining -= segmentLength;
  }
  return { ...(segments.at(-1)?.to ?? { x: 0, z: 0 }) };
}

export function firstPathIntersection(
  current: readonly PathSegmentState[],
  stored: readonly PathSegmentState[],
): Vec2 | null {
  for (const a of current) {
    for (const b of stored) {
      const intersection = segmentIntersection(a.from, a.to, b.from, b.to);
      if (intersection && distance(intersection, a.from) > 1.2) return intersection;
    }
  }
  return null;
}

export function obstacleRadius(archetype: ObstacleArchetype): number {
  if (archetype === "pillar") return 1.8;
  if (archetype === "reflector") return 1.65;
  return 1.45;
}

function firstObstacleHit(
  from: Vec2,
  to: Vec2,
  playerRadius: number,
  obstacles: readonly ObstacleState[],
  ignoredId: string | null = null,
): ObstacleHit | null {
  return obstacles
    .filter((obstacle) => obstacle.id !== ignoredId && obstacle.archetype !== "hazard-prism")
    .map((obstacle) => obstacle.archetype === "reflector"
      ? hitOrientedReflector(from, to, playerRadius, obstacle)
      : hitCircle(from, to, playerRadius + obstacleRadius(obstacle.archetype), obstacle))
    .filter((hit): hit is ObstacleHit => hit !== null && hit.t > 0.002)
    .sort((left, right) => left.t - right.t)[0] ?? null;
}

function hitCircle(
  from: Vec2,
  to: Vec2,
  radius: number,
  obstacle: ObstacleState,
): ObstacleHit | null {
  const direction = subtract(to, from);
  const offset = subtract(from, obstacle.position);
  const a = dot(direction, direction);
  const b = 2 * dot(offset, direction);
  const c = dot(offset, offset) - radius * radius;
  const discriminant = b * b - 4 * a * c;
  if (a <= EPSILON || discriminant < 0) return null;
  const root = Math.sqrt(discriminant);
  const candidates = [(-b - root) / (2 * a), (-b + root) / (2 * a)]
    .filter((value) => value >= 0 && value <= 1)
    .sort((left, right) => left - right);
  const t = candidates[0];
  if (t === undefined) return null;
  const point = add(from, scale(direction, t));
  return { obstacle, t, point, normal: normalize(subtract(point, obstacle.position)) };
}

function hitOrientedReflector(
  from: Vec2,
  to: Vec2,
  playerRadius: number,
  obstacle: ObstacleState,
): ObstacleHit | null {
  const inverseRotation = -obstacle.rotationRadians;
  const localFrom = rotate(subtract(from, obstacle.position), inverseRotation);
  const localTo = rotate(subtract(to, obstacle.position), inverseRotation);
  const direction = subtract(localTo, localFrom);
  const halfWidth = 1.9 + playerRadius;
  const halfDepth = 0.48 + playerRadius;
  let minimumT = 0;
  let maximumT = 1;
  let localNormal: Vec2 = { x: 0, z: 0 };
  for (const axis of ["x", "z"] as const) {
    const origin = localFrom[axis];
    const delta = direction[axis];
    const halfExtent = axis === "x" ? halfWidth : halfDepth;
    if (Math.abs(delta) <= EPSILON) {
      if (origin < -halfExtent || origin > halfExtent) return null;
      continue;
    }
    const first = (-halfExtent - origin) / delta;
    const second = (halfExtent - origin) / delta;
    const enter = Math.min(first, second);
    const exit = Math.max(first, second);
    if (enter > minimumT) {
      minimumT = enter;
      const sign = first < second ? -1 : 1;
      localNormal = axis === "x" ? { x: sign, z: 0 } : { x: 0, z: sign };
    }
    maximumT = Math.min(maximumT, exit);
    if (minimumT > maximumT) return null;
  }
  if (minimumT < 0 || minimumT > 1) return null;
  const point = add(from, scale(subtract(to, from), minimumT));
  return {
    obstacle,
    t: minimumT,
    point,
    normal: normalize(rotate(localNormal, obstacle.rotationRadians)),
  };
}

function segment(from: Vec2, to: Vec2, reflected: boolean): PathSegmentState {
  return {
    from: { ...from },
    to: { ...to },
    reflected,
    reflectionPoint: null,
    reflectionNormal: null,
  };
}

function segmentIntersection(a: Vec2, b: Vec2, c: Vec2, d: Vec2): Vec2 | null {
  const r = subtract(b, a);
  const s = subtract(d, c);
  const denominator = r.x * s.z - r.z * s.x;
  if (Math.abs(denominator) <= EPSILON) return null;
  const offset = subtract(c, a);
  const t = (offset.x * s.z - offset.z * s.x) / denominator;
  const u = (offset.x * r.z - offset.z * r.x) / denominator;
  if (t <= 0.001 || t >= 0.999 || u <= 0.001 || u >= 0.999) return null;
  return add(a, scale(r, t));
}
