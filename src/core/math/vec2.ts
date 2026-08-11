export interface Vec2 {
  x: number;
  z: number;
}

export function vec2(x: number, z: number): Vec2 {
  return { x, z };
}

export function copyVec2(value: Vec2): Vec2 {
  return { x: value.x, z: value.z };
}

export function squaredDistance(a: Vec2, b: Vec2): number {
  const x = a.x - b.x;
  const z = a.z - b.z;
  return x * x + z * z;
}
