export type EntityId = string;
export type EventId = string;
export type LevelId = string;
export type EncounterId = string;
export type EnemyDefinitionId = string;
export type AbilityId = string;
export type UpgradeId = string;
export type ProjectileDefinitionId = string;
export type ObstacleDefinitionId = string;
export type HazardDefinitionId = string;
export type CharacterPresentationId = string;
export type CharacterProviderId = string;
export type AnimationSetId = string;
export type VfxProfileId = string;
export type AudioProfileId = string;
export type EnvironmentPresentationId = string;
export type LightingProfileId = string;
export type PostFxProfileId = string;
export type DeathProfileId = string;
export type CameraProfileId = string;
export type RunDefinitionId = string;
export type ActDefinitionId = string;
export type RouteNodeId = string;
export type EncounterTemplateId = string;
export type BossDefinitionId = string;

export function createEnemyEntityId(levelIndex: number, ordinal: number): EntityId {
  return `s${levelIndex + 1}-enemy-${String(ordinal).padStart(2, "0")}`;
}
