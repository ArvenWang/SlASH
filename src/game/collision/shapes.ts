import { squaredDistance, type Vec2 } from "../../core/math/vec2";

const EPSILON = 1e-8;

export interface CircleShape {
  readonly kind: "circle";
  readonly center: Vec2;
  readonly radius: number;
}

export interface SegmentShape {
  readonly kind: "segment";
  readonly start: Vec2;
  readonly end: Vec2;
}

export interface AabbShape {
  readonly kind: "aabb";
  readonly min: Vec2;
  readonly max: Vec2;
}

export interface ObbShape {
  readonly kind: "obb";
  readonly center: Vec2;
  readonly halfExtents: Vec2;
  readonly rotationRadians: number;
}

export interface PolygonShape {
  readonly kind: "polygon";
  /** Ordered vertices of one convex polygon; concave geometry is decomposed by content tooling. */
  readonly points: readonly Vec2[];
}

export type CollisionShape = CircleShape | SegmentShape | AabbShape | ObbShape | PolygonShape;

export function distanceSquaredPointToSegment(
  point: Vec2,
  segmentStart: Vec2,
  segmentEnd: Vec2,
): number {
  const segmentX = segmentEnd.x - segmentStart.x;
  const segmentZ = segmentEnd.z - segmentStart.z;
  const lengthSquared = segmentX * segmentX + segmentZ * segmentZ;
  if (lengthSquared <= EPSILON) return squaredDistance(point, segmentStart);

  const projection = Math.min(
    1,
    Math.max(
      0,
      ((point.x - segmentStart.x) * segmentX + (point.z - segmentStart.z) * segmentZ)
        / lengthSquared,
    ),
  );
  const closest = {
    x: segmentStart.x + segmentX * projection,
    z: segmentStart.z + segmentZ * projection,
  };
  return squaredDistance(point, closest);
}

export function segmentIntersectsCircle(
  segmentStart: Vec2,
  segmentEnd: Vec2,
  circleCenter: Vec2,
  combinedRadius: number,
): boolean {
  const radius = Math.max(0, combinedRadius);
  return distanceSquaredPointToSegment(circleCenter, segmentStart, segmentEnd)
    <= radius * radius + EPSILON;
}

function orientation(a: Vec2, b: Vec2, c: Vec2): number {
  return (b.z - a.z) * (c.x - b.x) - (b.x - a.x) * (c.z - b.z);
}

function pointOnSegment(point: Vec2, start: Vec2, end: Vec2): boolean {
  return point.x <= Math.max(start.x, end.x) + EPSILON
    && point.x + EPSILON >= Math.min(start.x, end.x)
    && point.z <= Math.max(start.z, end.z) + EPSILON
    && point.z + EPSILON >= Math.min(start.z, end.z)
    && Math.abs(orientation(start, point, end)) <= EPSILON;
}

export function segmentsIntersect(aStart: Vec2, aEnd: Vec2, bStart: Vec2, bEnd: Vec2): boolean {
  const o1 = orientation(aStart, aEnd, bStart);
  const o2 = orientation(aStart, aEnd, bEnd);
  const o3 = orientation(bStart, bEnd, aStart);
  const o4 = orientation(bStart, bEnd, aEnd);
  if (((o1 > EPSILON && o2 < -EPSILON) || (o1 < -EPSILON && o2 > EPSILON))
    && ((o3 > EPSILON && o4 < -EPSILON) || (o3 < -EPSILON && o4 > EPSILON))) return true;
  return (Math.abs(o1) <= EPSILON && pointOnSegment(bStart, aStart, aEnd))
    || (Math.abs(o2) <= EPSILON && pointOnSegment(bEnd, aStart, aEnd))
    || (Math.abs(o3) <= EPSILON && pointOnSegment(aStart, bStart, bEnd))
    || (Math.abs(o4) <= EPSILON && pointOnSegment(aEnd, bStart, bEnd));
}

export function pointInPolygon(point: Vec2, polygon: readonly Vec2[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current, current += 1) {
    const a = polygon[current];
    const b = polygon[previous];
    if (!a || !b) continue;
    if (pointOnSegment(point, a, b)) return true;
    const crosses = (a.z > point.z) !== (b.z > point.z)
      && point.x < ((b.x - a.x) * (point.z - a.z)) / (b.z - a.z) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
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
  const corners: readonly Vec2[] = [
    { x: -shape.halfExtents.x, z: -shape.halfExtents.z },
    { x: shape.halfExtents.x, z: -shape.halfExtents.z },
    { x: shape.halfExtents.x, z: shape.halfExtents.z },
    { x: -shape.halfExtents.x, z: shape.halfExtents.z },
  ];
  return corners.map((point) => ({
    x: shape.center.x + point.x * cosine - point.z * sine,
    z: shape.center.z + point.x * sine + point.z * cosine,
  }));
}

function polygonEdges(points: readonly Vec2[]): Array<readonly [Vec2, Vec2]> {
  return points.map((point, index) => [point, points[(index + 1) % points.length] ?? point] as const);
}

function segmentIntersectsPolygon(start: Vec2, end: Vec2, points: readonly Vec2[]): boolean {
  if (pointInPolygon(start, points) || pointInPolygon(end, points)) return true;
  return polygonEdges(points).some(([edgeStart, edgeEnd]) => segmentsIntersect(start, end, edgeStart, edgeEnd));
}

function projectPolygon(points: readonly Vec2[], axis: Vec2): readonly [number, number] {
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    const projection = point.x * axis.x + point.z * axis.z;
    minimum = Math.min(minimum, projection);
    maximum = Math.max(maximum, projection);
  }
  return [minimum, maximum];
}

function polygonsIntersect(a: readonly Vec2[], b: readonly Vec2[]): boolean {
  if (a.length < 3 || b.length < 3) return false;
  const edges = [...polygonEdges(a), ...polygonEdges(b)];
  for (const [start, end] of edges) {
    const axis = { x: -(end.z - start.z), z: end.x - start.x };
    const length = Math.hypot(axis.x, axis.z);
    if (length <= EPSILON) continue;
    axis.x /= length;
    axis.z /= length;
    const [aMin, aMax] = projectPolygon(a, axis);
    const [bMin, bMax] = projectPolygon(b, axis);
    if (aMax < bMin - EPSILON || bMax < aMin - EPSILON) return false;
  }
  return true;
}

function circleIntersectsPolygon(circle: CircleShape, points: readonly Vec2[]): boolean {
  if (pointInPolygon(circle.center, points)) return true;
  return polygonEdges(points).some(([start, end]) => (
    segmentIntersectsCircle(start, end, circle.center, circle.radius)
  ));
}

function asPolygon(shape: AabbShape | ObbShape | PolygonShape): readonly Vec2[] {
  if (shape.kind === "aabb") return aabbPoints(shape);
  if (shape.kind === "obb") return obbPoints(shape);
  return shape.points;
}

function isPolygonal(shape: CollisionShape): shape is AabbShape | ObbShape | PolygonShape {
  return shape.kind === "aabb" || shape.kind === "obb" || shape.kind === "polygon";
}

export function shapesIntersect(a: CollisionShape, b: CollisionShape): boolean {
  if (a.kind === "circle" && b.kind === "circle") {
    const radius = Math.max(0, a.radius) + Math.max(0, b.radius);
    return squaredDistance(a.center, b.center) <= radius * radius + EPSILON;
  }
  if (a.kind === "segment" && b.kind === "segment") {
    return segmentsIntersect(a.start, a.end, b.start, b.end);
  }
  if (a.kind === "segment" && b.kind === "circle") {
    return segmentIntersectsCircle(a.start, a.end, b.center, b.radius);
  }
  if (a.kind === "circle" && b.kind === "segment") return shapesIntersect(b, a);
  if (a.kind === "circle" && isPolygonal(b)) return circleIntersectsPolygon(a, asPolygon(b));
  if (b.kind === "circle") return shapesIntersect(b, a);
  if (a.kind === "segment" && isPolygonal(b)) {
    return segmentIntersectsPolygon(a.start, a.end, asPolygon(b));
  }
  if (b.kind === "segment") return shapesIntersect(b, a);
  if (isPolygonal(a) && isPolygonal(b)) return polygonsIntersect(asPolygon(a), asPolygon(b));
  return false;
}
