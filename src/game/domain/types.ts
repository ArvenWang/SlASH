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
import type { RunProtocolMode } from "../../content/protocols/definitions";

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
export type EnemyAttackPhase = "cooldown" | "telegraph" | "active" | "recovery";

export interface EnemyTacticalState {
  readonly attackProfileId: string;
  attackPhase: EnemyAttackPhase;
  phaseElapsedMs: number;
  phaseDurationMs: number;
  attackSequence: number;
  comboStep: number;
  lockedTarget: Vec2 | null;
  lockedDirection: Vec2;
  nextTelegraphMultiplier: number;
  currentTelegraphMultiplier: number;
  movementSign: -1 | 1;
}

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
  tactical?: EnemyTacticalState;
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
  | {
      type: "enemy-attack-phase-changed";
      enemyId: EntityId;
      attackProfileId: string;
      phase: EnemyAttackPhase;
      durationMs: number;
      attackSequence: number;
      target: Vec2 | null;
      direction: Vec2;
    }
  | { type: "enemy-blinked"; enemyId: EntityId; from: Vec2; to: Vec2; target: Vec2 }
  | { type: "enemy-support-pulse"; enemyId: EntityId; affectedEnemyIds: EntityId[]; telegraphMultiplier: number }
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
  | { type: "campaign-started"; seed: number; protocolMode: RunProtocolMode; threatLevel: number }
  | { type: "route-node-started"; nodeId: string; encounterId: EncounterId }
  | { type: "encounter-wave-warning"; encounterId: EncounterId; waveId: string; activationAtMs: number }
  | { type: "encounter-wave-started"; encounterId: EncounterId; waveId: string; enemyIds: EntityId[] }
  | { type: "encounter-wave-completed"; encounterId: EncounterId; waveId: string }
  | { type: "challenge-resolved"; challengeDefinitionId: string; status: "succeeded" | "failed"; rewardResourceId: string; rewardAmount: number }
  | { type: "boss-phase-started"; bossDefinitionId: string; phaseId: string; phaseIndex: number; objectiveTarget: number }
  | { type: "boss-action-phase-changed"; bossDefinitionId: string; phaseId: string; actionPhase: string; durationMs: number; target: Vec2 | null }
  | { type: "boss-core-window"; bossDefinitionId: string; exposed: boolean; durationMs: number }
  | { type: "boss-break"; bossDefinitionId: string; phaseId: string; breakIndex: number; objectiveCurrent: number; objectiveTarget: number; position: Vec2 }
  | { type: "boss-objective-progress"; bossDefinitionId: string; phaseId: string; objectiveCurrent: number; objectiveTarget: number; source: string }
  | { type: "boss-clone-state"; bossDefinitionId: string; entityId: EntityId; isReal: boolean; active: boolean }
  | { type: "boss-mirror-slash"; bossDefinitionId: string; phase: "telegraph" | "active" | "expired"; segments: UltimatePathSegment[]; durationMs: number }
  | { type: "boss-victory"; bossDefinitionId: string; breakCount: number; durationMs: number }
  | { type: "skill-points-granted"; amount: number; total: number; source: string }
  | { type: "event-choice-resolved"; nodeId: string; eventDefinitionId: string; choiceId: string; resourceChanges: Array<{ resourceId: string; before: number; after: number }> }
  | { type: "forge-token-used"; nodeId: string; remainingTokens: number; moveLimit: number }
  | { type: "forge-completed"; nodeId: string; movedSkillIds: UpgradeId[] }
  | { type: "route-node-completed"; nodeId: string; result: string }
  | { type: "campaign-victory"; seed: number }
  | { type: "campaign-returned-to-title"; fromPhase: "victory" | "reward" | "defeat" }
  | { type: "campaign-abandoned"; fromPhase: string }
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
  | { type: "configure-run-protocol"; mode: RunProtocolMode; threatLevel?: number }
  | { type: "abandon-run" }
  | { type: "start-boss-practice"; bossDefinitionId: string }
  | { type: "return-to-title" }
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
  | "protocol-configured"
  | "run-abandoned"
  | "boss-practice-started"
  | "returned-to-title"
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
    enemyTactics: Array<{
      enemyId: EntityId;
      attackProfileId: string;
      phase: EnemyAttackPhase;
      remainingMs: number;
      sequence: number;
      target: Vec2 | null;
      comboStep: number;
      nextTelegraphMultiplier: number;
    }>;
  };
  campaign: null | {
    phase: string;
    protocol: {
      mode: RunProtocolMode;
      threatLevel: number;
      assistRebootsRemaining: number;
      leaderboardEligible: boolean;
    };
    runMetrics: {
      durationMs: number;
      kills: number;
      armorBreaks: number;
      projectileCuts: number;
      bossBreaks: number;
      deathSourceId: string | null;
      deathSourceLabel: string | null;
    };
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
    challenge: null | {
      definitionId: string;
      status: string;
      elapsedMs: number;
      projectileCuts: number;
      obstacleImpacts: number;
      maximumChargedArmorBreaks: number;
      ultimateExecuted: boolean;
      failureReason: string | null;
    };
    boss: null | {
      definitionId: string;
      entityId: EntityId;
      phaseId: string;
      phaseIndex: number;
      actionPhase: string;
      actionRemainingMs: number;
      lockedDirection: Vec2;
      lockedTarget: Vec2 | null;
      objectiveCurrent: number;
      objectiveTarget: number;
      breakCount: number;
      attackSequence: number;
      coreExposed: boolean;
      completed: boolean;
      mechanic: string;
      details: {
        chargeIndex: number | null;
        chargesThisCycle: number | null;
        round: number | null;
        armorBreaks: number | null;
        realEntityId: EntityId | null;
        cloneEntityIds: EntityId[];
        supportEntityIds: EntityId[];
        mirrorSlash: null | {
          phase: "telegraph" | "active";
          remainingMs: number;
          segments: UltimatePathSegment[];
        };
        objectiveNodes: Array<{ id: string; position: Vec2; reached: boolean }>;
        finaleAttemptInvalid: boolean;
      };
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
