import { isSupported } from "./config";
import type { Vec2 } from "./math";
import { add, clamp, distance, normalize, scale, subtract } from "./math";
import type { VerticalBodyState } from "./state";

export const PLAYER_HOVER_HEIGHT = 0.78;
export const ENEMY_HOVER_HEIGHT = 0.64;
export const BOSS_HOVER_HEIGHT = 1.05;
export const FALL_DEFEAT_HEIGHT = -5;

export interface HoverOptions {
  readonly targetHeight: number;
  readonly spring?: number;
  readonly damping?: number;
  readonly supportEnabled?: boolean;
}

export function advanceVerticalBody(
  body: VerticalBodyState,
  position: Vec2,
  deltaSeconds: number,
  options: HoverOptions,
): void {
  const supported = (options.supportEnabled ?? true) && isSupported(position);
  body.supported = supported;
  const spring = options.spring ?? 48;
  const damping = options.damping ?? 10.5;
  let acceleration = body.gravity;
  if (supported) {
    acceleration += -body.gravity
      + (options.targetHeight - body.height) * spring
      - body.verticalVelocity * damping;
  }
  body.verticalVelocity += acceleration * deltaSeconds;
  body.height += body.verticalVelocity * deltaSeconds;
  if (supported && options.targetHeight <= 0.05 && body.height <= 0) {
    body.height = 0;
    body.verticalVelocity = 0;
    body.grounded = true;
  } else {
    body.grounded = supported
      && Math.abs(body.height - options.targetHeight) < 0.02
      && Math.abs(body.verticalVelocity) < 0.08;
  }
}

export function launchBody(body: VerticalBodyState, verticalVelocity: number): void {
  body.verticalVelocity = Math.max(0, verticalVelocity);
  body.grounded = false;
}

export function moveToward(
  position: Vec2,
  target: Vec2,
  speed: number,
  deltaSeconds: number,
): { readonly position: Vec2; readonly facing: Vec2 } {
  const offset = subtract(target, position);
  const remaining = distance(position, target);
  if (remaining <= 1e-6) return { position: { ...position }, facing: { x: 0, z: 1 } };
  const facing = normalize(offset);
  const amount = Math.min(remaining, Math.max(0, speed) * deltaSeconds);
  return { position: add(position, scale(facing, amount)), facing };
}

export function steerToward(
  current: Vec2,
  desired: Vec2,
  maximumRadians: number,
): Vec2 {
  const fromAngle = Math.atan2(current.x, current.z);
  const toAngle = Math.atan2(desired.x, desired.z);
  let delta = toAngle - fromAngle;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  const angle = fromAngle + clamp(delta, -maximumRadians, maximumRadians);
  return { x: Math.sin(angle), z: Math.cos(angle) };
}

export function separateCircles(
  position: Vec2,
  radius: number,
  otherPosition: Vec2,
  otherRadius: number,
): Vec2 {
  const offset = subtract(position, otherPosition);
  const currentDistance = Math.hypot(offset.x, offset.z);
  const minimumDistance = radius + otherRadius;
  if (currentDistance >= minimumDistance || minimumDistance <= 0) return position;
  const direction = normalize(offset, { x: 1, z: 0 });
  return add(otherPosition, scale(direction, minimumDistance));
}
