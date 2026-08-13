export interface Vec2 {
  readonly x: number;
  readonly z: number;
}

export const EPSILON = 1e-7;

export function vec2(x = 0, z = 0): Vec2 {
  return { x, z };
}

export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, z: a.z + b.z };
}

export function subtract(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, z: a.z - b.z };
}

export function scale(value: Vec2, amount: number): Vec2 {
  return { x: value.x * amount, z: value.z * amount };
}

export function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.z * b.z;
}

export function length(value: Vec2): number {
  return Math.hypot(value.x, value.z);
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function normalize(value: Vec2, fallback: Vec2 = { x: 0, z: 1 }): Vec2 {
  const magnitude = length(value);
  if (magnitude <= EPSILON) return { ...fallback };
  return { x: value.x / magnitude, z: value.z / magnitude };
}

export function lerp(a: Vec2, b: Vec2, ratio: number): Vec2 {
  return {
    x: a.x + (b.x - a.x) * ratio,
    z: a.z + (b.z - a.z) * ratio,
  };
}

export function rotate(value: Vec2, radians: number): Vec2 {
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    x: value.x * cosine - value.z * sine,
    z: value.x * sine + value.z * cosine,
  };
}

export function reflect(value: Vec2, normal: Vec2): Vec2 {
  const projection = 2 * dot(value, normal);
  return normalize({
    x: value.x - projection * normal.x,
    z: value.z - projection * normal.z,
  });
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

export function distanceSquaredToSegment(point: Vec2, start: Vec2, end: Vec2): number {
  const segment = subtract(end, start);
  const denominator = Math.max(EPSILON, dot(segment, segment));
  const ratio = clamp01(dot(subtract(point, start), segment) / denominator);
  const closest = add(start, scale(segment, ratio));
  const offset = subtract(point, closest);
  return dot(offset, offset);
}

export function stableHash32(value: string, initial = 0x811c9dc5): number {
  let hash = initial >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function seededUnit(seed: number): () => number {
  let state = Math.trunc(seed) >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}
