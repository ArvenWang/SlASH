import type { Vec2 } from "../../core/math/vec2";
import type { ArenaBounds } from "../domain/types";

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

export function clampPointToArena(target: Vec2, arena: ArenaBounds, margin = 0): Vec2 {
  const safeMargin = Math.max(0, finiteOr(margin, 0));
  const minX = Math.min(arena.maxX, arena.minX + safeMargin);
  const maxX = Math.max(arena.minX, arena.maxX - safeMargin);
  const minZ = Math.min(arena.maxZ, arena.minZ + safeMargin);
  const maxZ = Math.max(arena.minZ, arena.maxZ - safeMargin);
  const x = finiteOr(target.x, (arena.minX + arena.maxX) * 0.5);
  const z = finiteOr(target.z, (arena.minZ + arena.maxZ) * 0.5);
  return {
    x: Math.min(maxX, Math.max(minX, x)),
    z: Math.min(maxZ, Math.max(minZ, z)),
  };
}
