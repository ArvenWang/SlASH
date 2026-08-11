import { armorProfileDefinitions } from "../../content/enemies/armor-definitions";
import { enemyDefinitions } from "../../content/enemies/definitions";
import type { Vec2 } from "../../core/math/vec2";
import type { ArmorPartState, EnemyState } from "../domain/types";

const EPSILON = 1e-8;

export interface ArmorContactResult {
  readonly contactAngleRadians: number;
  readonly contactRegion: "front" | "left" | "right" | "rear";
  readonly isRearContact: boolean;
  readonly armorPart: ArmorPartState | null;
}

export function createArmorPartStates(armorProfileId: string | null): ArmorPartState[] {
  if (armorProfileId === null) return [];
  return armorProfileDefinitions.get(armorProfileId).parts.map((part) => ({
    id: part.id,
    intact: true,
    brokenAtMs: null,
  }));
}

export function resolveArmorContact(
  enemy: EnemyState,
  segmentStart: Vec2,
  segmentEnd: Vec2,
  armorProfileIdOverride?: string | null,
  contactRadius = enemy.radius,
): ArmorContactResult {
  const directionX = segmentEnd.x - segmentStart.x;
  const directionZ = segmentEnd.z - segmentStart.z;
  const directionLength = Math.hypot(directionX, directionZ);
  const direction = directionLength > EPSILON
    ? { x: directionX / directionLength, z: directionZ / directionLength }
    : { x: -enemy.facing.x, z: -enemy.facing.z };
  const contactPoint = firstCircleContactPoint(
    enemy.position,
    segmentStart,
    segmentEnd,
    Math.max(enemy.radius, contactRadius),
  );
  let contactNormalX = contactPoint.x - enemy.position.x;
  let contactNormalZ = contactPoint.z - enemy.position.z;
  const normalLength = Math.hypot(contactNormalX, contactNormalZ);
  if (normalLength > EPSILON) {
    contactNormalX /= normalLength;
    contactNormalZ /= normalLength;
  } else {
    contactNormalX = -direction.x;
    contactNormalZ = -direction.z;
  }
  const facingLength = Math.max(EPSILON, Math.hypot(enemy.facing.x, enemy.facing.z));
  const facingX = enemy.facing.x / facingLength;
  const facingZ = enemy.facing.z / facingLength;
  const dot = clamp(facingX * contactNormalX + facingZ * contactNormalZ, -1, 1);
  const cross = facingX * contactNormalZ - facingZ * contactNormalX;
  const contactAngleRadians = Math.atan2(cross, dot);
  const absoluteAngle = Math.abs(contactAngleRadians);
  const contactRegion = absoluteAngle <= Math.PI / 4
    ? "front"
    : absoluteAngle >= Math.PI * 3 / 4
      ? "rear"
      : contactAngleRadians < 0 ? "left" : "right";

  const definition = enemyDefinitions.get(enemy.definitionId);
  const armorProfileId = armorProfileIdOverride === undefined
    ? definition.armorProfileId
    : armorProfileIdOverride;
  const profile = armorProfileId === null
    ? null
    : armorProfileDefinitions.get(armorProfileId);
  let armorPart: ArmorPartState | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const partDefinition of profile?.parts ?? []) {
    const runtime = enemy.armorParts.find((part) => part.id === partDefinition.id);
    if (!runtime?.intact) continue;
    const delta = Math.abs(shortestAngleDelta(contactAngleRadians, partDefinition.centerAngleRadians));
    if (delta <= partDefinition.coverageArcRadians / 2 + EPSILON && delta < bestDelta) {
      armorPart = runtime;
      bestDelta = delta;
    }
  }
  return {
    contactAngleRadians,
    contactRegion,
    isRearContact: absoluteAngle >= Math.PI * 3 / 4,
    armorPart,
  };
}

export function hasIntactArmor(enemy: EnemyState): boolean {
  return enemy.armorParts.some((part) => part.intact);
}

function closestPointOnSegment(point: Vec2, start: Vec2, end: Vec2): Vec2 {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared <= EPSILON) return { x: start.x, z: start.z };
  const ratio = clamp(((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSquared, 0, 1);
  return { x: start.x + dx * ratio, z: start.z + dz * ratio };
}

function firstCircleContactPoint(center: Vec2, start: Vec2, end: Vec2, radius: number): Vec2 {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const offsetX = start.x - center.x;
  const offsetZ = start.z - center.z;
  const a = dx * dx + dz * dz;
  if (a <= EPSILON) return { x: start.x, z: start.z };
  const b = 2 * (offsetX * dx + offsetZ * dz);
  const c = offsetX * offsetX + offsetZ * offsetZ - radius * radius;
  const discriminant = b * b - 4 * a * c;
  if (discriminant >= 0) {
    const root = Math.sqrt(discriminant);
    const entry = (-b - root) / (2 * a);
    if (entry >= 0 && entry <= 1) {
      return { x: start.x + dx * entry, z: start.z + dz * entry };
    }
  }
  return closestPointOnSegment(center, start, end);
}

function shortestAngleDelta(from: number, to: number): number {
  let delta = from - to;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
