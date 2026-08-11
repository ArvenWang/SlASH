import type {
  HazardDefinitionId,
  ObstacleDefinitionId,
  ProjectileDefinitionId,
} from "../../core/ids";
import type { CollisionShape } from "../../game/collision/shapes";
import { DefinitionRegistry } from "../registry";

export interface ProjectileDefinition {
  readonly id: ProjectileDefinitionId;
  readonly radius: number;
  readonly speed: number;
  readonly lifetimeMs: number;
  readonly tags: readonly string[];
  readonly presentationId: string;
}

export interface ObstacleDefinition {
  readonly id: ObstacleDefinitionId;
  readonly shape: CollisionShape;
  readonly activationDelayMs: number;
  readonly lifetimeMs: number | null;
  readonly tags: readonly string[];
  readonly presentationId: string;
}

export interface HazardDefinition {
  readonly id: HazardDefinitionId;
  readonly shape: CollisionShape;
  readonly lifecycle: "triggered-mine" | "timed-zone";
  readonly telegraphMs: number;
  readonly activeMs: number;
  readonly triggerDelayMs: number;
  readonly triggerRadius: number;
  readonly tickIntervalMs: number;
  readonly tags: readonly string[];
  readonly presentationId: string;
}

export const STANDARD_ROUND_PROJECTILE_ID: ProjectileDefinitionId = "projectile-standard-round-v1";
export const SNIPER_ROUND_PROJECTILE_ID: ProjectileDefinitionId = "projectile-sniper-round-v1";
export const BOSS_SHARD_PROJECTILE_ID: ProjectileDefinitionId = "projectile-boss-shard-v1";

export const STATIC_REFLECTOR_OBSTACLE_ID: ObstacleDefinitionId = "obstacle-static-reflector-v1";
export const DEPLOYABLE_BARRIER_OBSTACLE_ID: ObstacleDefinitionId = "obstacle-deployable-barrier-v1";
export const ANCHOR_PILLAR_OBSTACLE_ID: ObstacleDefinitionId = "obstacle-anchor-pillar-v1";
export const RAIL_GATE_OBSTACLE_ID: ObstacleDefinitionId = "obstacle-rail-gate-v1";

export const ARMED_MINE_HAZARD_ID: HazardDefinitionId = "hazard-armed-mine-v1";
export const ARC_RAIL_HAZARD_ID: HazardDefinitionId = "hazard-arc-rail-v1";

export const projectileDefinitions = new DefinitionRegistry<ProjectileDefinition>([
  { id: STANDARD_ROUND_PROJECTILE_ID, radius: 0.18, speed: 11, lifetimeMs: 4_000, tags: ["hostile", "slashable", "returnable", "standard"], presentationId: "projectile-standard-round-presentation-v1" },
  { id: SNIPER_ROUND_PROJECTILE_ID, radius: 0.11, speed: 24, lifetimeMs: 2_200, tags: ["hostile", "slashable", "sniper", "not-returnable"], presentationId: "projectile-sniper-round-presentation-v1" },
  { id: BOSS_SHARD_PROJECTILE_ID, radius: 0.24, speed: 14, lifetimeMs: 5_000, tags: ["hostile", "slashable", "boss", "not-returnable"], presentationId: "projectile-boss-shard-presentation-v1" },
]);

export const obstacleDefinitions = new DefinitionRegistry<ObstacleDefinition>([
  {
    id: STATIC_REFLECTOR_OBSTACLE_ID,
    shape: { kind: "obb", center: { x: 0, z: 0 }, halfExtents: { x: 0.45, z: 3.8 }, rotationRadians: 0 },
    activationDelayMs: 0,
    lifetimeMs: null,
    tags: ["dash-blocking", "reflectable", "static"],
    presentationId: "obstacle-static-reflector-presentation-v1",
  },
  {
    id: DEPLOYABLE_BARRIER_OBSTACLE_ID,
    shape: { kind: "obb", center: { x: 0, z: 0 }, halfExtents: { x: 2.5, z: 0.35 }, rotationRadians: 0 },
    activationDelayMs: 900,
    lifetimeMs: 7_000,
    tags: ["dash-blocking", "reflectable", "deployable"],
    presentationId: "obstacle-deployable-barrier-presentation-v1",
  },
  {
    id: ANCHOR_PILLAR_OBSTACLE_ID,
    shape: { kind: "circle", center: { x: 0, z: 0 }, radius: 1.15 },
    activationDelayMs: 0,
    lifetimeMs: null,
    tags: ["dash-blocking", "reflectable", "static"],
    presentationId: "obstacle-anchor-pillar-presentation-v1",
  },
  {
    id: RAIL_GATE_OBSTACLE_ID,
    shape: { kind: "obb", center: { x: 0, z: 0 }, halfExtents: { x: 3.2, z: 0.42 }, rotationRadians: 0 },
    activationDelayMs: 0,
    lifetimeMs: null,
    tags: ["dash-blocking", "reflectable", "moving"],
    presentationId: "obstacle-rail-gate-presentation-v1",
  },
]);

export const hazardDefinitions = new DefinitionRegistry<HazardDefinition>([
  {
    id: ARMED_MINE_HAZARD_ID,
    shape: { kind: "circle", center: { x: 0, z: 0 }, radius: 2.4 },
    lifecycle: "triggered-mine",
    telegraphMs: 1_000,
    activeMs: 120,
    triggerDelayMs: 550,
    triggerRadius: 1.2,
    tickIntervalMs: 0,
    tags: ["lethal", "mine", "dash-safe"],
    presentationId: "hazard-armed-mine-presentation-v1",
  },
  {
    id: ARC_RAIL_HAZARD_ID,
    shape: { kind: "obb", center: { x: 0, z: 0 }, halfExtents: { x: 10, z: 1.1 }, rotationRadians: 0 },
    lifecycle: "timed-zone",
    telegraphMs: 1_400,
    activeMs: 600,
    triggerDelayMs: 0,
    triggerRadius: 0,
    tickIntervalMs: 0,
    tags: ["lethal", "rail", "dash-safe"],
    presentationId: "hazard-arc-rail-presentation-v1",
  },
]);
