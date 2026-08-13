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
export const VISUAL_PLATFORM_SIZE = Object.freeze({ width: 96, depth: 64 });
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
