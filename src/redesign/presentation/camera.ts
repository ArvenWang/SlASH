import type { ArenaBounds } from "../config";
import { PLAYABLE_ARENA } from "../config";
import type { Vec2 } from "../math";
import { clamp } from "../math";

export interface CameraFrame {
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
  readonly fov: number;
  readonly near: number;
  readonly far: number;
  readonly aspect: number;
  readonly framedBounds: ArenaBounds;
}

const OFFSET_DIRECTION = normalize3([0.48, 0.53, 0.7]);
const WORLD_UP = [0, 1, 0] as const;

export function computeCameraFrame(
  width: number,
  height: number,
  focus: Vec2,
): CameraFrame {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const aspect = safeWidth / safeHeight;
  const portrait = aspect < 0.72;
  const fov = portrait ? 46 : 38;
  const framedBounds = followBounds(focus, portrait);
  const target = [
    (framedBounds.minX + framedBounds.maxX) * 0.5,
    0,
    (framedBounds.minZ + framedBounds.maxZ) * 0.5,
  ] as const;
  const forward = scale3(OFFSET_DIRECTION, -1);
  const right = normalize3(cross3(forward, WORLD_UP));
  const cameraUp = normalize3(cross3(right, forward));
  const verticalTangent = Math.tan(fov * Math.PI / 360);
  const horizontalTangent = verticalTangent * aspect;
  const distance = corners(framedBounds).reduce((required, corner) => {
    const offset = [corner[0] - target[0], 0, corner[2] - target[2]] as const;
    const forwardOffset = dot3(offset, forward);
    const horizontal = Math.abs(dot3(offset, right));
    const vertical = Math.abs(dot3(offset, cameraUp));
    return Math.max(
      required,
      horizontal / horizontalTangent - forwardOffset,
      vertical / verticalTangent - forwardOffset,
    );
  }, 0) * 1.035;
  const position = [
    target[0] + OFFSET_DIRECTION[0] * distance,
    target[1] + OFFSET_DIRECTION[1] * distance,
    target[2] + OFFSET_DIRECTION[2] * distance,
  ] as const;
  return {
    position,
    target,
    fov,
    near: 0.1,
    far: 420,
    aspect,
    framedBounds,
  };
}

function followBounds(focus: Vec2, portrait: boolean): ArenaBounds {
  const halfWidth = portrait ? 22 : 34;
  const halfDepth = portrait ? 16 : 21;
  const centerX = clamp(focus.x, PLAYABLE_ARENA.minX + halfWidth, PLAYABLE_ARENA.maxX - halfWidth);
  const centerZ = clamp(focus.z, PLAYABLE_ARENA.minZ + halfDepth, PLAYABLE_ARENA.maxZ - halfDepth);
  return {
    minX: centerX - halfWidth,
    maxX: centerX + halfWidth,
    minZ: centerZ - halfDepth,
    maxZ: centerZ + halfDepth,
  };
}

function corners(bounds: ArenaBounds): readonly (readonly [number, number, number])[] {
  return [
    [bounds.minX, 0, bounds.minZ],
    [bounds.minX, 0, bounds.maxZ],
    [bounds.maxX, 0, bounds.minZ],
    [bounds.maxX, 0, bounds.maxZ],
  ];
}

function dot3(a: readonly number[], b: readonly number[]): number {
  return a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
}

function cross3(a: readonly number[], b: readonly number[]): [number, number, number] {
  return [
    a[1]! * b[2]! - a[2]! * b[1]!,
    a[2]! * b[0]! - a[0]! * b[2]!,
    a[0]! * b[1]! - a[1]! * b[0]!,
  ];
}

function scale3(value: readonly number[], amount: number): [number, number, number] {
  return [value[0]! * amount, value[1]! * amount, value[2]! * amount];
}

function normalize3(value: readonly number[]): [number, number, number] {
  const magnitude = Math.hypot(value[0]!, value[1]!, value[2]!);
  return [value[0]! / magnitude, value[1]! / magnitude, value[2]! / magnitude];
}
