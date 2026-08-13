import type { Vec2 } from "./math";

export interface ArenaBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export const PLAYABLE_ARENA: ArenaBounds = Object.freeze({
  minX: -32,
  maxX: 32,
  minZ: -20,
  maxZ: 20,
});

export const PLAYABLE_ARENA_SIZE = Object.freeze({ width: 64, depth: 40 });
export const VISUAL_PLATFORM_SIZE = Object.freeze({ width: 768, depth: 512 });
export const ARENA_SAFE_MARGIN = 2.2;

export const BOSS_MAXIMUM_HP = Object.freeze({
  "prism-hound": 8,
  "cube-fortress": 12,
  "singularity-crown": 16,
});

export const BOSS_DASH_DAMAGE = Object.freeze({
  basic: 1,
  charged: 2,
  ultimate: 1,
});

export function isSupported(position: Vec2, margin = 0): boolean {
  return position.x >= PLAYABLE_ARENA.minX + margin
    && position.x <= PLAYABLE_ARENA.maxX - margin
    && position.z >= PLAYABLE_ARENA.minZ + margin
    && position.z <= PLAYABLE_ARENA.maxZ - margin;
}

export function clampToSupportedArena(position: Vec2, margin = ARENA_SAFE_MARGIN): Vec2 {
  return {
    x: Math.max(PLAYABLE_ARENA.minX + margin, Math.min(PLAYABLE_ARENA.maxX - margin, position.x)),
    z: Math.max(PLAYABLE_ARENA.minZ + margin, Math.min(PLAYABLE_ARENA.maxZ - margin, position.z)),
  };
}

export function clipTargetToSupportedArena(from: Vec2, target: Vec2, margin = 0): Vec2 {
  const minX = PLAYABLE_ARENA.minX + margin;
  const maxX = PLAYABLE_ARENA.maxX - margin;
  const minZ = PLAYABLE_ARENA.minZ + margin;
  const maxZ = PLAYABLE_ARENA.maxZ - margin;
  if (!isSupported(from, margin)) return clampToSupportedArena(target, margin);
  const offsetX = target.x - from.x;
  const offsetZ = target.z - from.z;
  let ratio = 1;
  if (offsetX > 0) ratio = Math.min(ratio, (maxX - from.x) / offsetX);
  else if (offsetX < 0) ratio = Math.min(ratio, (minX - from.x) / offsetX);
  if (offsetZ > 0) ratio = Math.min(ratio, (maxZ - from.z) / offsetZ);
  else if (offsetZ < 0) ratio = Math.min(ratio, (minZ - from.z) / offsetZ);
  const safeRatio = Math.max(0, Math.min(1, ratio));
  return {
    x: Math.max(minX, Math.min(maxX, from.x + offsetX * safeRatio)),
    z: Math.max(minZ, Math.min(maxZ, from.z + offsetZ * safeRatio)),
  };
}
