import type { Vec2 } from "../../core/math/vec2";
import { hazardDefinitions, obstacleDefinitions } from "../../content/entities/definitions";
import type { CollisionShape } from "../collision/shapes";
import type { HazardState, ObstacleState } from "../domain/types";

export function obstacleWorldShape(obstacle: ObstacleState): CollisionShape {
  return transformLocalShape(
    obstacleDefinitions.get(obstacle.definitionId).shape,
    obstacle.position,
    obstacle.rotationRadians,
  );
}

export function hazardWorldShape(hazard: HazardState): CollisionShape {
  return transformLocalShape(
    hazardDefinitions.get(hazard.definitionId).shape,
    hazard.position,
    hazard.rotationRadians,
  );
}

export function transformLocalShape(
  shape: CollisionShape,
  position: Vec2,
  rotationRadians: number,
): CollisionShape {
  if (shape.kind === "circle") {
    return { ...shape, center: transformPoint(shape.center, position, rotationRadians) };
  }
  if (shape.kind === "segment") {
    return {
      ...shape,
      start: transformPoint(shape.start, position, rotationRadians),
      end: transformPoint(shape.end, position, rotationRadians),
    };
  }
  if (shape.kind === "aabb") {
    const center = {
      x: (shape.min.x + shape.max.x) * 0.5,
      z: (shape.min.z + shape.max.z) * 0.5,
    };
    const halfExtents = {
      x: Math.abs(shape.max.x - shape.min.x) * 0.5,
      z: Math.abs(shape.max.z - shape.min.z) * 0.5,
    };
    if (Math.abs(rotationRadians) <= 1e-8) {
      const transformedCenter = transformPoint(center, position, 0);
      return {
        kind: "aabb",
        min: { x: transformedCenter.x - halfExtents.x, z: transformedCenter.z - halfExtents.z },
        max: { x: transformedCenter.x + halfExtents.x, z: transformedCenter.z + halfExtents.z },
      };
    }
    return {
      kind: "obb",
      center: transformPoint(center, position, rotationRadians),
      halfExtents,
      rotationRadians,
    };
  }
  if (shape.kind === "obb") {
    return {
      ...shape,
      center: transformPoint(shape.center, position, rotationRadians),
      rotationRadians: shape.rotationRadians + rotationRadians,
    };
  }
  return {
    ...shape,
    points: shape.points.map((point) => transformPoint(point, position, rotationRadians)),
  };
}

function transformPoint(point: Vec2, translation: Vec2, radians: number): Vec2 {
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    x: translation.x + point.x * cosine - point.z * sine,
    z: translation.z + point.x * sine + point.z * cosine,
  };
}
