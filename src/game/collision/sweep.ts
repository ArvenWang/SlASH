import { copyVec2, squaredDistance, type Vec2 } from "../../core/math/vec2";
import type {
  AabbShape,
  CircleShape,
  CollisionShape,
  ObbShape,
  PolygonShape,
  SegmentShape,
} from "./shapes";
import { pointInPolygon, shapesIntersect } from "./shapes";

const EPSILON = 1e-8;

export interface SweepHit {
  readonly t: number;
  readonly point: Vec2;
  /** Unit vector pointing from the obstacle toward the moving circle. */
  readonly normal: Vec2;
}

export function sweepCircleAgainstShape(
  start: Vec2,
  end: Vec2,
  radius: number,
  shape: CollisionShape,
): SweepHit | null {
  const safeRadius = Math.max(0, radius);
  if (shape.kind === "circle") return sweepPointAgainstCircle(start, end, shape.center, shape.radius + safeRadius);
  const polygon = shapeAsPolygon(shape);
  if (polygon) return sweepCircleAgainstPolygon(start, end, safeRadius, polygon);
  if (shape.kind === "segment") return sweepCircleAgainstSegment(start, end, safeRadius, shape);
  return null;
}

function sweepPointAgainstCircle(start: Vec2, end: Vec2, center: Vec2, radius: number): SweepHit | null {
  const delta = { x: end.x - start.x, z: end.z - start.z };
  const offset = { x: start.x - center.x, z: start.z - center.z };
  const a = dot(delta, delta);
  const radiusSquared = radius * radius;
  if (dot(offset, offset) <= radiusSquared + EPSILON) {
    return { t: 0, point: copyVec2(start), normal: normalized(offset, opposite(delta)) };
  }
  if (a <= EPSILON) return null;
  const b = 2 * dot(offset, delta);
  const c = dot(offset, offset) - radiusSquared;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < -EPSILON) return null;
  const root = Math.sqrt(Math.max(0, discriminant));
  const t = (-b - root) / (2 * a);
  if (t < -EPSILON || t > 1 + EPSILON) return null;
  const clampedT = clamp01(t);
  const point = interpolate(start, end, clampedT);
  return { t: clampedT, point, normal: normalized(subtract(point, center), opposite(delta)) };
}

function sweepCircleAgainstSegment(
  start: Vec2,
  end: Vec2,
  radius: number,
  segment: SegmentShape,
): SweepHit | null {
  return earliestCandidate([
    ...edgeLineCandidates(start, end, radius, segment.start, segment.end),
    sweepPointAgainstCircle(start, end, segment.start, radius),
    sweepPointAgainstCircle(start, end, segment.end, radius),
  ]);
}

function sweepCircleAgainstPolygon(
  start: Vec2,
  end: Vec2,
  radius: number,
  points: readonly Vec2[],
): SweepHit | null {
  if (points.length < 3) return null;
  const startCircle: CircleShape = { kind: "circle", center: start, radius };
  const polygon: PolygonShape = { kind: "polygon", points };
  if (pointInPolygon(start, points) || shapesIntersect(startCircle, polygon)) {
    const fallback = opposite({ x: end.x - start.x, z: end.z - start.z });
    return { t: 0, point: copyVec2(start), normal: nearestBoundaryNormal(start, points, fallback) };
  }

  const candidates: Array<SweepHit | null> = [];
  for (let index = 0; index < points.length; index += 1) {
    const edgeStart = points[index];
    const edgeEnd = points[(index + 1) % points.length];
    if (!edgeStart || !edgeEnd) continue;
    candidates.push(...edgeLineCandidates(start, end, radius, edgeStart, edgeEnd));
    candidates.push(sweepPointAgainstCircle(start, end, edgeStart, radius));
  }
  return earliestCandidate(candidates.filter((candidate) => {
    if (!candidate) return false;
    const contactCircle: CircleShape = { kind: "circle", center: candidate.point, radius: radius + 1e-6 };
    return shapesIntersect(contactCircle, polygon);
  }));
}

function edgeLineCandidates(
  start: Vec2,
  end: Vec2,
  radius: number,
  edgeStart: Vec2,
  edgeEnd: Vec2,
): Array<SweepHit | null> {
  const edge = subtract(edgeEnd, edgeStart);
  const edgeLength = Math.hypot(edge.x, edge.z);
  if (edgeLength <= EPSILON) return [];
  const tangent = { x: edge.x / edgeLength, z: edge.z / edgeLength };
  const normal = { x: -tangent.z, z: tangent.x };
  const motion = subtract(end, start);
  const startDistance = dot(subtract(start, edgeStart), normal);
  const motionNormal = dot(motion, normal);
  if (Math.abs(motionNormal) <= EPSILON) return [];
  return [-1, 1].map((side) => {
    const t = (side * radius - startDistance) / motionNormal;
    if (t < -EPSILON || t > 1 + EPSILON) return null;
    const clampedT = clamp01(t);
    const point = interpolate(start, end, clampedT);
    const along = dot(subtract(point, edgeStart), tangent);
    if (along < -EPSILON || along > edgeLength + EPSILON) return null;
    return {
      t: clampedT,
      point,
      normal: { x: normal.x * side, z: normal.z * side },
    };
  });
}

function nearestBoundaryNormal(point: Vec2, polygon: readonly Vec2[], fallback: Vec2): Vec2 {
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestNormal = normalized(fallback, { x: 1, z: 0 });
  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index];
    const end = polygon[(index + 1) % polygon.length];
    if (!start || !end) continue;
    const closest = closestPointOnSegment(point, start, end);
    const distance = squaredDistance(point, closest);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestNormal = normalized(subtract(point, closest), fallback);
    }
  }
  return bestNormal;
}

function closestPointOnSegment(point: Vec2, start: Vec2, end: Vec2): Vec2 {
  const edge = subtract(end, start);
  const lengthSquared = dot(edge, edge);
  if (lengthSquared <= EPSILON) return copyVec2(start);
  const t = clamp01(dot(subtract(point, start), edge) / lengthSquared);
  return interpolate(start, end, t);
}

function shapeAsPolygon(shape: CollisionShape): readonly Vec2[] | null {
  if (shape.kind === "polygon") return shape.points;
  if (shape.kind === "aabb") return aabbPoints(shape);
  if (shape.kind === "obb") return obbPoints(shape);
  return null;
}

function aabbPoints(shape: AabbShape): readonly Vec2[] {
  return [
    { x: shape.min.x, z: shape.min.z },
    { x: shape.max.x, z: shape.min.z },
    { x: shape.max.x, z: shape.max.z },
    { x: shape.min.x, z: shape.max.z },
  ];
}

function obbPoints(shape: ObbShape): readonly Vec2[] {
  const cosine = Math.cos(shape.rotationRadians);
  const sine = Math.sin(shape.rotationRadians);
  return [
    { x: -shape.halfExtents.x, z: -shape.halfExtents.z },
    { x: shape.halfExtents.x, z: -shape.halfExtents.z },
    { x: shape.halfExtents.x, z: shape.halfExtents.z },
    { x: -shape.halfExtents.x, z: shape.halfExtents.z },
  ].map((point) => ({
    x: shape.center.x + point.x * cosine - point.z * sine,
    z: shape.center.z + point.x * sine + point.z * cosine,
  }));
}

function earliestCandidate(candidates: readonly (SweepHit | null)[]): SweepHit | null {
  return candidates
    .filter((candidate): candidate is SweepHit => candidate !== null)
    .sort((a, b) => a.t - b.t)[0] ?? null;
}

function interpolate(start: Vec2, end: Vec2, t: number): Vec2 {
  return { x: start.x + (end.x - start.x) * t, z: start.z + (end.z - start.z) * t };
}

function subtract(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, z: a.z - b.z };
}

function opposite(value: Vec2): Vec2 {
  return { x: -value.x, z: -value.z };
}

function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.z * b.z;
}

function normalized(value: Vec2, fallback: Vec2): Vec2 {
  const length = Math.hypot(value.x, value.z);
  if (length <= EPSILON) {
    const fallbackLength = Math.hypot(fallback.x, fallback.z);
    return fallbackLength <= EPSILON ? { x: 1, z: 0 } : { x: fallback.x / fallbackLength, z: fallback.z / fallbackLength };
  }
  return { x: value.x / length, z: value.z / length };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
