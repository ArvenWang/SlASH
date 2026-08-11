import type {
  AbilityId,
  EncounterId,
  EnemyDefinitionId,
  EntityId,
  HazardDefinitionId,
  LevelId,
  ObstacleDefinitionId,
  ProjectileDefinitionId,
  UpgradeId,
} from "../../core/ids";
import type { Vec2 } from "../../core/math/vec2";
import type { SeededRandomState } from "../../core/random/seeded-random";
import type { AbilitySlot } from "../../content/abilities/definitions";
import type { FullGameCampaignState } from "../campaign/types";

export type { Vec2 } from "../../core/math/vec2";

export interface ArenaBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Compatibility view retained for Phase 1 tools. New content uses LevelDefinition. */
export interface StageDefinition {
  id: string;
  name: string;
  index: number;
  enemyCount: number;
  enemySpeed: number;
  arena: ArenaBounds;
  playerSpawn: Vec2;
  enemySpawns: Vec2[];
}

export type GamePhase =
  | "title"
  | "planning"
  | "event"
  | "forge"
  | "playing"
  | "reward"
  | "dead"
  | "stage-cleared"
  | "game-complete"
  | "victory";
export type EnemyRuntimeMode = "active" | "dead";

export interface DashState {
  abilityId: AbilityId;
  from: Vec2;
  to: Vec2;
  durationMs: number;
  elapsedMs: number;
  hitRadius: number;
  baseHitRadius: number;
  recoveryMs: number;
  resolvedEnemyIds: EntityId[];
  armorBreakCount: number;
  exposedKillCount: number;
  rearExecutionCount: number;
  pathSegments: DashPathSegmentState[];
  pathSegmentIndex: number;
  reflectionsUsed: number;
  projectilesReturnedThisDash: number;
  killCount: number;
  refractionSecondLegKills: number;
  pendingCross: PendingCrossState | null;
  killMomentumConsumedStacks: number;
}

export interface PendingCrossState {
  readonly position: Vec2;
  readonly pathSegmentIndex: number;
  triggered: boolean;
}

export interface DashObstacleContactState {
  readonly obstacleId: EntityId;
  readonly position: Vec2;
  readonly normal: Vec2;
  readonly incomingDirection: Vec2;
}

export interface DashPathSegmentState {
  readonly from: Vec2;
  readonly to: Vec2;
  readonly durationMs: number;
  readonly reflectionAtEnd: DashObstacleContactState | null;
  readonly terminalImpact: DashObstacleContactState | null;
}

export interface ChargeState {
  abilityId: AbilityId;
  startedAtTick: number;
  heldMs: number;
  thresholdMs: number;
  overholdLimitMs: number;
  initialTarget: Vec2;
  currentTarget: Vec2;
  direction: Vec2;
  totalAimAdjustmentRadians: number;
  lastAimUpdateTick: number;
  consumedPredatorDrive: boolean;
  readyEventEmitted: boolean;
}

export interface UltimatePlanningState {
  abilityId: AbilityId;
  startedAtTick: number;
  elapsedMs: number;
  durationMs: number;
  requiredPointCount: number;
  worldTimeScale: number;
  points: Vec2[];
}

export interface UltimatePathSegment {
  readonly from: Vec2;
  readonly to: Vec2;
}

export interface UltimateExecutionState {
  abilityId: AbilityId;
  points: Vec2[];
  segmentIndex: number;
  killCount: number;
  completedSegments: UltimatePathSegment[];
  crossCascadeTriggered: boolean;
}

export interface BufferedAbilityCommand {
  slot: AbilitySlot;
  target: Vec2;
}

export interface PlayerState {
  position: Vec2;
  facing: Vec2;
  radius: number;
  hp: 0 | 1;
  dash: DashState | null;
  charge: ChargeState | null;
  recoveryRemainingMs: number;
  bufferedAbility: BufferedAbilityCommand | null;
  abilities: Record<AbilitySlot, AbilityRuntimeState | null>;
  ultimateEnergy: number;
  predatorDriveExpiresAtMs: number | null;
  killMomentumStacks: number;
  ultimatePlanning: UltimatePlanningState | null;
  ultimateExecution: UltimateExecutionState | null;
}

export interface ArmorPartState {
  readonly id: string;
  intact: boolean;
  brokenAtMs: number | null;
}

export interface EnemyState {
  id: EntityId;
  definitionId: EnemyDefinitionId;
  position: Vec2;
  facing: Vec2;
  radius: number;
  speed: number;
  alive: boolean;
  state: EnemyRuntimeMode;
  spawnedAtMs: number;
  killedAtMs: number | null;
  armorParts: ArmorPartState[];
  staggerRemainingMs: number;
}

export interface ProjectileState {
  id: EntityId;
  definitionId: ProjectileDefinitionId;
  position: Vec2;
  velocity: Vec2;
  radius: number;
  alive: boolean;
  spawnedAtMs: number;
  sourceId: EntityId;
  faction: "enemy" | "player";
  reflectedAtMs: number | null;
  ageMs: number;
  returnTargetId: EntityId | null;
  reflectedByAbilityId: AbilityId | null;
}

export interface ObstacleState {
  id: EntityId;
  definitionId: ObstacleDefinitionId;
  position: Vec2;
  rotationRadians: number;
  active: boolean;
  spawnedAtMs: number;
  activatesAtMs: number;
  expiresAtMs: number | null;
  velocity: Vec2;
  sourceId: EntityId;
  ageMs: number;
}

export type HazardRuntimePhase = "telegraph" | "armed" | "triggered" | "active" | "expired";

export interface HazardState {
  id: EntityId;
  definitionId: HazardDefinitionId;
  position: Vec2;
  active: boolean;
  spawnedAtMs: number;
  rotationRadians: number;
  phase: HazardRuntimePhase;
  phaseStartedAtMs: number;
  triggeredAtMs: number | null;
  sourceId: EntityId;
  ageMs: number;
  phaseElapsedMs: number;
}

export interface RunState {
  seed: number;
  tick: number;
  random: SeededRandomState;
  selectedUpgrades: UpgradeId[];
  acquiredResources: Record<string, number>;
  fullGame: FullGameCampaignState | null;
}

export interface StageRuntimeState {
  index: number;
  levelId: LevelId;
  name: string;
  phase: GamePhase;
  attempt: number;
  arena: ArenaBounds;
  encounterId: EncounterId;
}

export interface CombatRuntimeState {
  kills: number;
  totalEnemies: number;
  scheduledSlashes: ScheduledSlashState[];
  storedPath: StoredPathState | null;
  gravityPulls: GravityPullState[];
}

export interface StoredPathState {
  readonly id: string;
  readonly abilityId: AbilityId;
  readonly segments: UltimatePathSegment[];
  remainingMs: number;
}

export interface GravityPullState {
  readonly enemyId: EntityId;
  readonly from: Vec2;
  readonly to: Vec2;
  readonly durationMs: number;
  elapsedMs: number;
}

export interface ScheduledSlashState {
  readonly id: string;
  readonly executeAtMs: number;
  readonly from: Vec2;
  readonly to: Vec2;
  readonly hitRadius: number;
  readonly attackId: AbilityId;
  remainingMs: number;
}

export interface BaseGameEvent {
  id: string;
  tick: number;
  sequence: number;
  atMs: number;
}

export type GameEventPayload =
  | { type: "stage-started"; stageIndex: number; levelId: LevelId }
  | { type: "stage-restarted"; stageIndex: number; levelId: LevelId; attempt: number }
  | {
      type: "dash-started";
      abilityId: AbilityId;
      sourceId: EntityId;
      from: Vec2;
      to: Vec2;
      direction: Vec2;
      durationMs: number;
      anticipatedHits: Array<{ entityId: EntityId; position: Vec2 }>;
    }
  | { type: "enemy-killed"; enemyId: EntityId; sourceId: EntityId; attackId: AbilityId; position: Vec2; direction: Vec2 }
  | { type: "dash-ended"; abilityId: AbilityId; sourceId: EntityId; position: Vec2 }
  | { type: "charge-started"; abilityId: AbilityId; sourceId: EntityId; thresholdMs: number; target: Vec2 }
  | { type: "charge-ready"; abilityId: AbilityId; sourceId: EntityId; heldMs: number }
  | { type: "charge-cancelled"; abilityId: AbilityId; sourceId: EntityId; heldMs: number; reason: string }
  | { type: "armor-broken"; enemyId: EntityId; armorPartId: string; attackId: AbilityId; position: Vec2; contactRegion: string }
  | { type: "armor-blocked"; enemyId: EntityId; armorPartId: string; attackId: AbilityId; position: Vec2 }
  | { type: "rear-execution"; enemyId: EntityId; attackId: AbilityId; position: Vec2 }
  | { type: "ultimate-energy-changed"; before: number; after: number; source: string }
  | { type: "ultimate-planning-started"; abilityId: AbilityId; requiredPointCount: number; durationMs: number; worldTimeScale: number }
  | { type: "ultimate-point-added"; abilityId: AbilityId; pointIndex: number; point: Vec2 }
  | { type: "ultimate-planning-cancelled"; abilityId: AbilityId; reason: string }
  | { type: "ultimate-segment-started"; abilityId: AbilityId; segmentIndex: number; from: Vec2; to: Vec2 }
  | { type: "ultimate-cross-triggered"; abilityId: AbilityId; position: Vec2 }
  | { type: "ultimate-ended"; abilityId: AbilityId; segmentCount: number; killCount: number; energyRemaining: number }
  | { type: "scheduled-slash-triggered"; attackId: AbilityId; from: Vec2; to: Vec2 }
  | { type: "cross-execution-triggered"; position: Vec2; killedCount: number; purgedProjectileCount: number; interruptedEnemyCount: number }
  | { type: "impact-burst-triggered"; position: Vec2; killedCount: number }
  | { type: "gravity-pull-started"; enemyId: EntityId; from: Vec2; to: Vec2; durationMs: number }
  | { type: "projectile-spawned"; projectileId: EntityId; definitionId: ProjectileDefinitionId; sourceId: EntityId; position: Vec2 }
  | { type: "projectile-destroyed"; projectileId: EntityId; attackId: AbilityId; sourceId: EntityId; position: Vec2; direction: Vec2 }
  | { type: "projectile-reflected"; projectileId: EntityId; attackId: AbilityId; sourceId: EntityId; position: Vec2; velocity: Vec2 }
  | { type: "projectile-hit"; projectileId: EntityId; targetId: EntityId; faction: "enemy" | "player"; position: Vec2 }
  | { type: "obstacle-spawned"; obstacleId: EntityId; definitionId: ObstacleDefinitionId; position: Vec2; activatesAtMs: number }
  | { type: "obstacle-activated"; obstacleId: EntityId; position: Vec2 }
  | { type: "obstacle-expired"; obstacleId: EntityId; position: Vec2 }
  | { type: "dash-obstacle-impact"; abilityId: AbilityId; obstacleId: EntityId; position: Vec2; normal: Vec2 }
  | { type: "dash-reflected"; abilityId: AbilityId; obstacleId: EntityId; position: Vec2; normal: Vec2; from: Vec2; to: Vec2 }
  | { type: "dash-path-segment-started"; abilityId: AbilityId; segmentIndex: number; from: Vec2; to: Vec2 }
  | { type: "hazard-spawned"; hazardId: EntityId; definitionId: HazardDefinitionId; position: Vec2 }
  | { type: "hazard-phase-changed"; hazardId: EntityId; phase: HazardRuntimePhase; position: Vec2 }
  | { type: "hazard-triggered"; hazardId: EntityId; position: Vec2; activatesAtMs: number }
  | { type: "player-died"; enemyId: EntityId; position: Vec2 }
  | { type: "campaign-started"; seed: number }
  | { type: "route-node-started"; nodeId: string; encounterId: EncounterId }
  | { type: "encounter-wave-warning"; encounterId: EncounterId; waveId: string; activationAtMs: number }
  | { type: "encounter-wave-started"; encounterId: EncounterId; waveId: string; enemyIds: EntityId[] }
  | { type: "encounter-wave-completed"; encounterId: EncounterId; waveId: string }
  | { type: "skill-points-granted"; amount: number; total: number; source: string }
  | { type: "event-choice-resolved"; nodeId: string; eventDefinitionId: string; choiceId: string; resourceChanges: Array<{ resourceId: string; before: number; after: number }> }
  | { type: "forge-token-used"; nodeId: string; remainingTokens: number; moveLimit: number }
  | { type: "forge-completed"; nodeId: string; movedSkillIds: UpgradeId[] }
  | { type: "route-node-completed"; nodeId: string; result: string }
  | { type: "campaign-victory"; seed: number }
  | { type: "stage-cleared" | "game-complete"; stageIndex: number; levelId: LevelId };

type WithEventBase<TPayload> = TPayload extends unknown ? TPayload & BaseGameEvent : never;
export type GameEvent = WithEventBase<GameEventPayload>;

export interface GameRules {
  recoveryMs: number;
}

export interface GameState {
  version: 2;
  run: RunState;
  stage: StageRuntimeState;
  player: PlayerState;
  enemies: EnemyState[];
  projectiles: ProjectileState[];
  obstacles: ObstacleState[];
  hazards: HazardState[];
  combat: CombatRuntimeState;
  tick: number;
  elapsedMs: number;
  accumulatorMs: number;
  rules: GameRules;
  eventSequence: number;
  commandSequence: number;
  lastEvents: GameEvent[];
}

export interface GameInput {
  dashTarget?: Vec2;
  restart?: boolean;
  advanceStage?: boolean;
}

export type GameCommand =
  | { type: "activate-ability"; slot: AbilitySlot; target: Vec2 }
  | { type: "restart-stage" }
  | { type: "advance-stage" }
  | { type: "start-full-game-run" }
  | { type: "preview-route-node"; nodeId: string }
  | { type: "preview-skill-purchase"; skillId: UpgradeId }
  | { type: "preview-skill-refund"; skillId: UpgradeId }
  | { type: "discard-skill-draft" }
  | { type: "confirm-planning" }
  | { type: "acknowledge-reward" }
  | { type: "resolve-event-choice"; choiceId: string }
  | { type: "use-forge-token" }
  | { type: "confirm-forge" }
  | { type: "begin-charge"; target: Vec2 }
  | { type: "update-charge-target"; target: Vec2 }
  | { type: "release-charge"; target: Vec2 }
  | { type: "cancel-charge" }
  | { type: "start-ultimate" }
  | { type: "add-ultimate-point"; target: Vec2 }
  | { type: "cancel-ultimate" };

export type GameCommandResult =
  | DashRequestResult
  | "restarted"
  | "advanced"
  | "run-started"
  | "route-previewed"
  | "skill-drafted"
  | "skill-refunded"
  | "draft-discarded"
  | "planning-confirmed"
  | "reward-acknowledged"
  | "event-resolved"
  | "forge-token-used"
  | "forge-confirmed"
  | "charge-started"
  | "charge-updated"
  | "charge-cancelled"
  | "charged-released"
  | "ultimate-planning-started"
  | "ultimate-point-added"
  | "ultimate-executing"
  | "ultimate-cancelled"
  | "ignored";

export interface GameCommandDispatchResult {
  sequence: number;
  result: GameCommandResult;
}

export type DashRequestResult = "started" | "buffered" | "ignored";
export type PlayerAction = "ready" | "planning" | "charging" | "dashing" | "recovering" | "dead";

export interface GameSnapshot {
  stage: { index: number; number: number; count: number; id: string; name: string };
  encounter: { id: EncounterId };
  run: { tick: number; seed: number; selectedUpgrades: UpgradeId[] };
  phase: GamePhase;
  attempt: number;
  tick: number;
  timeMs: number;
  rules: GameRules;
  arena: ArenaBounds;
  player: {
    x: number;
    z: number;
    hp: 0 | 1;
    action: PlayerAction;
    invulnerable: boolean;
    recoveryMs: number;
    facingX: number;
    facingZ: number;
  };
  dash: {
    fromX: number;
    fromZ: number;
    toX: number;
    toZ: number;
    progress: number;
    durationMs: number;
  } | null;
  bufferedTarget: Vec2 | null;
  abilities: Record<AbilitySlot, { id: AbilityId; cooldownMs: number } | null>;
  kills: number;
  enemyCount: number;
  aliveEnemies: Array<{ id: string; x: number; z: number }>;
  projectiles: Array<{ id: EntityId; definitionId: ProjectileDefinitionId; x: number; z: number; faction: "enemy" | "player"; alive: boolean }>;
  obstacles: Array<{ id: EntityId; definitionId: ObstacleDefinitionId; x: number; z: number; active: boolean }>;
  hazards: Array<{ id: EntityId; definitionId: HazardDefinitionId; x: number; z: number; phase: HazardRuntimePhase; active: boolean }>;
  modules: {
    activeDashAbilityId: AbilityId | null;
    charge: null | {
      heldMs: number;
      thresholdMs: number;
      progress: number;
      overholdProgress: number;
      directionX: number;
      directionZ: number;
    };
    ultimateEnergy: number;
    predatorDriveRemainingMs: number;
    killMomentumStacks: number;
    armoredEnemies: Array<{
      id: EntityId;
      armorParts: Array<{ id: string; intact: boolean }>;
      staggerMs: number;
    }>;
    ultimate: null | {
      phase: "planning" | "executing";
      elapsedMs: number;
      durationMs: number;
      requiredPointCount: number;
      points: Vec2[];
      segmentIndex: number;
      killCount: number;
    };
    scheduledSlashes: Array<{ id: string; executeAtMs: number; attackId: AbilityId }>;
    storedPath: null | { id: string; abilityId: AbilityId; remainingMs: number; segmentCount: number };
    gravityPulls: Array<{ enemyId: EntityId; remainingMs: number }>;
  };
  campaign: null | {
    phase: string;
    actIndex: number;
    layerIndex: number;
    currentNodeId: string | null;
    provisionalRouteNodeId: string | null;
    availableNodes: Array<{ id: string; kind: string; reward: string }>;
    completedNodeIds: string[];
    skillPoints: { earned: number; spent: number; unspent: number };
    committedSkillIds: UpgradeId[];
    draftAddedSkillIds: UpgradeId[];
    draftRemovedSkillIds: UpgradeId[];
    activeEventDefinitionId: string | null;
    eventHistoryCount: number;
    resources: {
      nextCombatEnergy: number;
      rerouteTokens: number;
      intel: number;
    };
    forge: {
      movesUsed: number;
      moveLimit: number;
      tokensSpentThisVisit: number;
    };
    encounter: null | {
      id: EncounterId;
      completed: boolean;
      waves: Array<{ id: string; status: string; spawnedEnemyIds: EntityId[] }>;
    };
  };
}

export interface GameplaySelfCheckResult {
  ok: true;
  checks: string[];
}

export interface GameplayAcceptanceCase {
  name: string;
  passed: true;
  details: Record<string, number | string | boolean | number[]>;
}

export interface GameplayAcceptanceCheckResult {
  ok: true;
  fixedStepHz: number;
  cases: GameplayAcceptanceCase[];
}

export interface AbilityRuntimeState {
  abilityId: AbilityId;
  cooldownRemainingMs: number;
  charges?: number;
}
