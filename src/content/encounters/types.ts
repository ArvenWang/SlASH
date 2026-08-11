import type { EncounterTemplateId, HazardDefinitionId, ObstacleDefinitionId } from "../../core/ids";
import type { Vec2 } from "../../core/math/vec2";
import type { RunResourceId } from "../events/definitions";
import type { EncounterDefinition } from "../levels/definitions";

export type FullGameEncounterCategory = "standard" | "elite" | "challenge" | "boss";

export interface EncounterObstacleSpawnDefinition {
  readonly id: string;
  readonly definitionId: ObstacleDefinitionId;
  readonly position: Vec2;
  readonly rotationRadians?: number;
  readonly velocity?: Vec2;
}

export interface EncounterHazardSpawnDefinition {
  readonly id: string;
  readonly definitionId: HazardDefinitionId;
  readonly position: Vec2;
  readonly rotationRadians?: number;
}

export type ChallengeRuleKind =
  | "clean-line"
  | "projectile-cuts"
  | "charged-multi-break"
  | "no-ultimate";

export interface ChallengeRuleDefinition {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly kind: ChallengeRuleKind;
  /** Target count for projectile cuts / armor breaks. Other rules use 1. */
  readonly target: number;
  readonly timeLimitMs: number | null;
  readonly reward: {
    readonly resourceId: RunResourceId;
    readonly amount: number;
    readonly maximum: number;
    readonly summary: string;
  };
}

export interface FullGameEncounterDefinition extends EncounterDefinition {
  readonly id: EncounterTemplateId;
  readonly actIndex: number;
  readonly category: FullGameEncounterCategory;
  readonly title: string;
  readonly summary: string;
  /** Authored identity tags. Runtime threat tags are derived from actual content. */
  readonly designTags: readonly string[];
  readonly environmentId: string;
  readonly lightingProfileId: string;
  readonly presentationId: string;
  readonly initialObstacles: readonly EncounterObstacleSpawnDefinition[];
  readonly initialHazards: readonly EncounterHazardSpawnDefinition[];
  readonly challenge: ChallengeRuleDefinition | null;
}

export interface EncounterPressureSummary {
  readonly enemyPressure: number;
  readonly environmentPressure: number;
  readonly totalPressure: number;
}

