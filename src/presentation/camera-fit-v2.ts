import type { ArenaBounds } from "../game/domain/types";
import {
  GAMEPLAY_CAMERA_CONFIG,
  type CameraVector3,
} from "./camera-config";

export interface CameraViewportSize {
  readonly width: number;
  readonly height: number;
}

export interface GameplayCameraFitV2 {
  readonly position: CameraVector3;
  readonly target: CameraVector3;
  readonly fov: number;
  readonly aspect: number;
  readonly near: number;
  readonly far: number;
  readonly distance: number;
  readonly viewDirection: CameraVector3;
  readonly framedArena: ArenaBounds;
  readonly framedArenaScale: number;
}

type MutableVector3 = [x: number, y: number, z: number];

const WORLD_UP: CameraVector3 = [0, 1, 0];
const LANDSCAPE_FRAMED_ARENA_SCALE = 1.5;
const PORTRAIT_FRAMED_ARENA_SCALE = 1.12;
const MINIMUM_DISTANCE_SCALE = 1.5;
const EDGE_PADDING_SCALE = 1.02;
const PORTRAIT_FOV = 42;

const LEGACY_VIEW_OFFSET = subtract(
  GAMEPLAY_CAMERA_CONFIG.target,
  GAMEPLAY_CAMERA_CONFIG.position,
);

/** Normalized camera-to-target direction retained from the production camera. */
export const GAMEPLAY_VIEW_DIRECTION_V2: CameraVector3 = Object.freeze(
  normalize(LEGACY_VIEW_OFFSET),
);

/**
 * Computes a perspective-camera fit without reading the DOM or mutating Three.js state.
 *
 * Integration:
 * - call after reading the current Arena bounds and renderer viewport size;
 * - assign `fov`, `aspect`, `near`, `far`, and `position` to the PerspectiveCamera;
 * - call `camera.lookAt(...fit.target)` and then `camera.updateProjectionMatrix()`.
 */
export function fitGameplayCameraV2(
  arena: ArenaBounds,
  viewport: CameraViewportSize,
): GameplayCameraFitV2 {
  validateArena(arena);
  validateViewport(viewport);

  const aspect = viewport.width / viewport.height;
  const target: CameraVector3 = [
    (arena.minX + arena.maxX) / 2,
    0,
    (arena.minZ + arena.maxZ) / 2,
  ];
  const framedArenaScale = aspect < 0.75
    ? PORTRAIT_FRAMED_ARENA_SCALE
    : LANDSCAPE_FRAMED_ARENA_SCALE;
  const framedArena = scaleArenaAroundCenter(arena, framedArenaScale);
  const fov = aspect < 0.75 ? PORTRAIT_FOV : GAMEPLAY_CAMERA_CONFIG.fov;
  const verticalTangent = Math.tan(degreesToRadians(fov) / 2);
  const horizontalTangent = verticalTangent * aspect;
  const right = normalize(cross(GAMEPLAY_VIEW_DIRECTION_V2, WORLD_UP));
  const cameraUp = normalize(cross(right, GAMEPLAY_VIEW_DIRECTION_V2));

  const requiredFitDistance = arenaCorners(framedArena).reduce((required, corner) => {
    const targetOffset: CameraVector3 = [
      corner[0] - target[0],
      0,
      corner[2] - target[2],
    ];
    const forwardOffset = dot(targetOffset, GAMEPLAY_VIEW_DIRECTION_V2);
    const horizontalDistance = Math.abs(dot(targetOffset, right));
    const verticalDistance = Math.abs(dot(targetOffset, cameraUp));
    return Math.max(
      required,
      horizontalDistance / horizontalTangent - forwardOffset,
      verticalDistance / verticalTangent - forwardOffset,
    );
  }, 0);

  const legacyDistance = length(LEGACY_VIEW_OFFSET);
  const distance = Math.max(
    requiredFitDistance,
    legacyDistance * MINIMUM_DISTANCE_SCALE,
  ) * EDGE_PADDING_SCALE;
  const position: CameraVector3 = [
    target[0] - GAMEPLAY_VIEW_DIRECTION_V2[0] * distance,
    target[1] - GAMEPLAY_VIEW_DIRECTION_V2[1] * distance,
    target[2] - GAMEPLAY_VIEW_DIRECTION_V2[2] * distance,
  ];
  const framedDiagonal = Math.hypot(
    framedArena.maxX - framedArena.minX,
    framedArena.maxZ - framedArena.minZ,
  );
  // The clean visual deck deliberately extends far beyond Gameplay bounds so
  // its horizon can cover any aspect ratio. Keep enough depth for that deck;
  // the older 260-unit far plane visibly clipped it on portrait viewports.
  const far = Math.max(
    GAMEPLAY_CAMERA_CONFIG.far,
    2200,
    Math.ceil((distance + framedDiagonal) * 3),
  );

  return Object.freeze({
    position: Object.freeze(position),
    target: Object.freeze(target),
    fov,
    aspect,
    near: GAMEPLAY_CAMERA_CONFIG.near,
    far,
    distance,
    viewDirection: GAMEPLAY_VIEW_DIRECTION_V2,
    framedArena: Object.freeze(framedArena),
    framedArenaScale,
  });
}

function validateViewport(viewport: CameraViewportSize): void {
  if (!Number.isFinite(viewport.width) || viewport.width <= 0) {
    throw new RangeError("Viewport width must be a finite number greater than zero.");
  }
  if (!Number.isFinite(viewport.height) || viewport.height <= 0) {
    throw new RangeError("Viewport height must be a finite number greater than zero.");
  }
}

function validateArena(arena: ArenaBounds): void {
  const values = [arena.minX, arena.maxX, arena.minZ, arena.maxZ];
  if (!values.every(Number.isFinite)) {
    throw new RangeError("Arena bounds must contain only finite numbers.");
  }
  if (arena.maxX <= arena.minX || arena.maxZ <= arena.minZ) {
    throw new RangeError("Arena bounds must have positive width and depth.");
  }
}

function scaleArenaAroundCenter(arena: ArenaBounds, scale: number): ArenaBounds {
  const centerX = (arena.minX + arena.maxX) / 2;
  const centerZ = (arena.minZ + arena.maxZ) / 2;
  const halfWidth = ((arena.maxX - arena.minX) * scale) / 2;
  const halfDepth = ((arena.maxZ - arena.minZ) * scale) / 2;
  return {
    minX: centerX - halfWidth,
    maxX: centerX + halfWidth,
    minZ: centerZ - halfDepth,
    maxZ: centerZ + halfDepth,
  };
}

function arenaCorners(arena: ArenaBounds): readonly CameraVector3[] {
  return [
    [arena.minX, 0, arena.minZ],
    [arena.minX, 0, arena.maxZ],
    [arena.maxX, 0, arena.minZ],
    [arena.maxX, 0, arena.maxZ],
  ];
}

function degreesToRadians(value: number): number {
  return value * Math.PI / 180;
}

function subtract(left: CameraVector3, right: CameraVector3): MutableVector3 {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function dot(left: CameraVector3, right: CameraVector3): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function cross(left: CameraVector3, right: CameraVector3): MutableVector3 {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function length(vector: CameraVector3): number {
  return Math.hypot(vector[0], vector[1], vector[2]);
}

function normalize(vector: CameraVector3): MutableVector3 {
  const magnitude = length(vector);
  if (magnitude === 0) throw new RangeError("Camera direction cannot have zero length.");
  return [vector[0] / magnitude, vector[1] / magnitude, vector[2] / magnitude];
}
