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

export function createEnemyEntityId(levelIndex: number, ordinal: number): EntityId {
  return `s${levelIndex + 1}-enemy-${String(ordinal).padStart(2, "0")}`;
}
