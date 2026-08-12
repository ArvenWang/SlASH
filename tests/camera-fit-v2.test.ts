import { describe, expect, test } from "vitest";
import { GAMEPLAY_CAMERA_CONFIG, type CameraVector3 } from "../src/presentation/camera-config";
import {
  GAMEPLAY_VIEW_DIRECTION_V2,
  fitGameplayCameraV2,
  type CameraViewportSize,
  type GameplayCameraFitV2,
} from "../src/presentation/camera-fit-v2";

const ARENA = Object.freeze({
  minX: -20,
  maxX: 20,
  minZ: -12.5,
  maxZ: 12.5,
});

const VIEWPORTS: readonly CameraViewportSize[] = [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
  { width: 390, height: 844 },
];

describe("V2 adaptive perspective camera fit", () => {
  test.each(VIEWPORTS)(
    "covers the enlarged arena at $width x $height",
    (viewport) => {
      const fit = fitGameplayCameraV2(ARENA, viewport);
      const projectedCorners = projectArenaCorners(fit);

      expect(fit.aspect).toBeCloseTo(viewport.width / viewport.height, 12);
      expect(fit.far).toBeGreaterThanOrEqual(2200);
      const expectedScale = viewport.width < viewport.height ? 1.12 : 1.5;
      expect(fit.framedArenaScale).toBeGreaterThanOrEqual(expectedScale);
      expect(fit.framedArena.maxX - fit.framedArena.minX).toBeGreaterThanOrEqual(40 * expectedScale);
      expect(fit.framedArena.maxZ - fit.framedArena.minZ).toBeGreaterThanOrEqual(25 * expectedScale);
      for (const corner of projectedCorners) {
        expect(Math.abs(corner.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(corner.y)).toBeLessThanOrEqual(1);
        expect(corner.depth).toBeGreaterThan(fit.near);
        expect(corner.depth).toBeLessThan(fit.far);
      }
    },
  );

  test("preserves the current view direction and keeps at least a 1.5x-distance long shot", () => {
    const desktop = fitGameplayCameraV2(ARENA, { width: 1920, height: 1080 });
    const narrow = fitGameplayCameraV2(ARENA, { width: 390, height: 844 });
    const legacyDistance = distance(
      GAMEPLAY_CAMERA_CONFIG.position,
      GAMEPLAY_CAMERA_CONFIG.target,
    );

    expect(desktop.viewDirection).toEqual(GAMEPLAY_VIEW_DIRECTION_V2);
    expect(normalize(subtract(desktop.target, desktop.position))).toEqual(
      expect.arrayContaining(GAMEPLAY_VIEW_DIRECTION_V2.map((value) => expect.closeTo(value, 12))),
    );
    expect(desktop.distance).toBeGreaterThanOrEqual(legacyDistance * 1.5);
    expect(narrow.distance).toBeGreaterThan(desktop.distance);
    expect(narrow.fov).toBeGreaterThan(desktop.fov);
    expect(narrow.framedArenaScale).toBeCloseTo(1.12, 12);
    expect(desktop.target).toEqual([0, 0, 0]);
  });

  test("centers an offset arena without changing the oblique viewing angle", () => {
    const fit = fitGameplayCameraV2(
      { minX: 10, maxX: 50, minZ: -30, maxZ: -5 },
      { width: 1366, height: 768 },
    );

    expect(fit.target).toEqual([30, 0, -17.5]);
    expect(normalize(subtract(fit.target, fit.position))).toEqual(
      expect.arrayContaining(GAMEPLAY_VIEW_DIRECTION_V2.map((value) => expect.closeTo(value, 12))),
    );
    for (const corner of projectArenaCorners(fit)) {
      expect(Math.abs(corner.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(corner.y)).toBeLessThanOrEqual(1);
    }
  });

  test.each([
    { width: 0, height: 844 },
    { width: -1, height: 844 },
    { width: Number.NaN, height: 844 },
    { width: 390, height: 0 },
    { width: 390, height: Number.POSITIVE_INFINITY },
  ])("rejects invalid viewport dimensions: $width x $height", (viewport) => {
    expect(() => fitGameplayCameraV2(ARENA, viewport)).toThrow(RangeError);
  });
});

function projectArenaCorners(fit: GameplayCameraFitV2): readonly {
  x: number;
  y: number;
  depth: number;
}[] {
  const forward = normalize(subtract(fit.target, fit.position));
  const right = normalize(cross(forward, [0, 1, 0]));
  const cameraUp = normalize(cross(right, forward));
  const verticalTangent = Math.tan(fit.fov * Math.PI / 360);
  const horizontalTangent = verticalTangent * fit.aspect;
  const arena = fit.framedArena;
  const corners: readonly CameraVector3[] = [
    [arena.minX, 0, arena.minZ],
    [arena.minX, 0, arena.maxZ],
    [arena.maxX, 0, arena.minZ],
    [arena.maxX, 0, arena.maxZ],
  ];

  return corners.map((corner) => {
    const cameraOffset = subtract(corner, fit.position);
    const depth = dot(cameraOffset, forward);
    return {
      x: dot(cameraOffset, right) / (depth * horizontalTangent),
      y: dot(cameraOffset, cameraUp) / (depth * verticalTangent),
      depth,
    };
  });
}

function subtract(left: CameraVector3, right: CameraVector3): CameraVector3 {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function dot(left: CameraVector3, right: CameraVector3): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function cross(left: CameraVector3, right: CameraVector3): CameraVector3 {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function distance(left: CameraVector3, right: CameraVector3): number {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}

function normalize(vector: CameraVector3): CameraVector3 {
  const magnitude = Math.hypot(vector[0], vector[1], vector[2]);
  return [vector[0] / magnitude, vector[1] / magnitude, vector[2] / magnitude];
}
