import { describe, expect, test } from "vitest";
import {
  distanceSquaredPointToSegment,
  pointInPolygon,
  segmentIntersectsCircle,
  segmentsIntersect,
  shapesIntersect,
  type CollisionShape,
} from "../src/game/collision/shapes";

describe("collision shape foundation", () => {
  test("preserves the swept dash segment-circle rule", () => {
    expect(distanceSquaredPointToSegment({ x: 2, z: 1 }, { x: 0, z: 0 }, { x: 4, z: 0 })).toBe(1);
    expect(segmentIntersectsCircle({ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 2, z: 0.9 }, 1)).toBe(true);
    expect(segmentIntersectsCircle({ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 2, z: 1.1 }, 1)).toBe(false);
  });

  test("handles segment intersection including touching endpoints", () => {
    expect(segmentsIntersect({ x: 0, z: 0 }, { x: 2, z: 2 }, { x: 0, z: 2 }, { x: 2, z: 0 })).toBe(true);
    expect(segmentsIntersect({ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 1, z: 0 }, { x: 2, z: 0 })).toBe(true);
    expect(segmentsIntersect({ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 2, z: 0 }, { x: 3, z: 0 })).toBe(false);
  });

  test("supports AABB, OBB and polygon overlap", () => {
    const aabb: CollisionShape = { kind: "aabb", min: { x: -1, z: -1 }, max: { x: 1, z: 1 } };
    const obb: CollisionShape = {
      kind: "obb",
      center: { x: 1.4, z: 0 },
      halfExtents: { x: 0.7, z: 0.3 },
      rotationRadians: Math.PI / 4,
    };
    const polygon: CollisionShape = {
      kind: "polygon",
      points: [{ x: 4, z: -1 }, { x: 6, z: 0 }, { x: 4, z: 1 }],
    };
    expect(shapesIntersect(aabb, obb)).toBe(true);
    expect(shapesIntersect(aabb, polygon)).toBe(false);
    expect(pointInPolygon({ x: 5, z: 0 }, polygon.points)).toBe(true);
  });

  test("supports circle and segment against authored geometry", () => {
    const wall: CollisionShape = {
      kind: "polygon",
      points: [{ x: 2, z: -1 }, { x: 3, z: -1 }, { x: 3, z: 1 }, { x: 2, z: 1 }],
    };
    expect(shapesIntersect({ kind: "circle", center: { x: 1.6, z: 0 }, radius: 0.5 }, wall)).toBe(true);
    expect(shapesIntersect({ kind: "circle", center: { x: 1.4, z: 0 }, radius: 0.5 }, wall)).toBe(false);
    expect(shapesIntersect({ kind: "segment", start: { x: 0, z: 0 }, end: { x: 4, z: 0 } }, wall)).toBe(true);
  });
});
