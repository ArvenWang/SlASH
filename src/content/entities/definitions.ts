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
  readonly tags: readonly string[];
  readonly presentationId: string;
}

export interface HazardDefinition {
  readonly id: HazardDefinitionId;
  readonly shape: CollisionShape;
  readonly tickIntervalMs: number;
  readonly tags: readonly string[];
  readonly presentationId: string;
}

/** Phase 2A establishes real domains without inventing production content. */
export const projectileDefinitions = new DefinitionRegistry<ProjectileDefinition>();
export const obstacleDefinitions = new DefinitionRegistry<ObstacleDefinition>();
export const hazardDefinitions = new DefinitionRegistry<HazardDefinition>();
