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
  recoveryMs: number;
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
  recoveryRemainingMs: number;
  bufferedAbility: BufferedAbilityCommand | null;
  abilities: Record<AbilitySlot, AbilityRuntimeState | null>;
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
}

export interface ProjectileState {
  id: EntityId;
  definitionId: ProjectileDefinitionId;
  position: Vec2;
  velocity: Vec2;
  radius: number;
  alive: boolean;
  spawnedAtMs: number;
}

export interface ObstacleState {
  id: EntityId;
  definitionId: ObstacleDefinitionId;
  position: Vec2;
  rotationRadians: number;
  active: boolean;
}

export interface HazardState {
  id: EntityId;
  definitionId: HazardDefinitionId;
  position: Vec2;
  active: boolean;
  spawnedAtMs: number;
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
  | { type: "player-died"; enemyId: EntityId; position: Vec2 }
  | { type: "campaign-started"; seed: number }
  | { type: "route-node-started"; nodeId: string; encounterId: EncounterId }
  | { type: "encounter-wave-warning"; encounterId: EncounterId; waveId: string; activationAtMs: number }
  | { type: "encounter-wave-started"; encounterId: EncounterId; waveId: string; enemyIds: EntityId[] }
  | { type: "encounter-wave-completed"; encounterId: EncounterId; waveId: string }
  | { type: "skill-points-granted"; amount: number; total: number; source: string }
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
  | { type: "acknowledge-reward" };

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
  | "ignored";

export interface GameCommandDispatchResult {
  sequence: number;
  result: GameCommandResult;
}

export type DashRequestResult = "started" | "buffered" | "ignored";
export type PlayerAction = "ready" | "dashing" | "recovering" | "dead";

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
  projectiles: Array<{ id: EntityId; definitionId: ProjectileDefinitionId; x: number; z: number }>;
  obstacles: Array<{ id: EntityId; definitionId: ObstacleDefinitionId; x: number; z: number }>;
  hazards: Array<{ id: EntityId; definitionId: HazardDefinitionId; x: number; z: number }>;
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
