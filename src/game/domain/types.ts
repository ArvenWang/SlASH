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

export type GamePhase = "playing" | "dead" | "stage-cleared" | "game-complete";
export type EnemyRuntimeMode = "active" | "dead";

export interface DashState {
  abilityId: AbilityId;
  from: Vec2;
  to: Vec2;
  durationMs: number;
  elapsedMs: number;
  hitRadius: number;
  recoveryMs: number;
  execution: "standard" | "route-segment";
  segmentIndex: number;
  killCount: number;
}

export type ActiveAbilityState =
  | {
      abilityId: AbilityId;
      phase: "target-selection";
      targets: Vec2[];
      elapsedMs: number;
      timeoutMs: number;
      targetCount: number;
      worldTimeScale: number;
    }
  | {
      abilityId: AbilityId;
      phase: "route-execution";
      route: Vec2[];
      segmentIndex: number;
      worldTimeScale: number;
    };

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
  activeAbility: ActiveAbilityState | null;
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
      execution: "standard" | "route-segment";
      segmentIndex: number;
      anticipatedHits: Array<{ entityId: EntityId; position: Vec2 }>;
    }
  | {
      type: "enemy-killed";
      enemyId: EntityId;
      sourceId: EntityId;
      attackId: AbilityId;
      execution: "standard" | "route-segment";
      segmentIndex: number;
      position: Vec2;
      direction: Vec2;
    }
  | {
      type: "dash-ended";
      abilityId: AbilityId;
      sourceId: EntityId;
      execution: "standard" | "route-segment";
      segmentIndex: number;
      killCount: number;
      energyGain: number;
      position: Vec2;
    }
  | { type: "ability-selection-started"; abilityId: AbilityId; timeoutMs: number; targetCount: number }
  | { type: "ability-target-added"; abilityId: AbilityId; target: Vec2; index: number }
  | { type: "ability-cancelled"; abilityId: AbilityId; reason: "input" | "timeout" | "death" }
  | { type: "ability-route-started"; abilityId: AbilityId; route: Vec2[] }
  | { type: "ability-route-ended"; abilityId: AbilityId; position: Vec2 }
  | { type: "player-died"; enemyId: EntityId; position: Vec2 }
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
  | { type: "activate-ability"; slot: AbilitySlot; target?: Vec2 }
  | { type: "submit-ability-target"; target: Vec2 }
  | { type: "cancel-active-ability" }
  | { type: "restart-stage" }
  | { type: "advance-stage" };

export type GameCommandResult =
  | DashRequestResult
  | "target-added"
  | "triggered"
  | "cancelled"
  | "restarted"
  | "advanced"
  | "ignored";

export interface GameCommandDispatchResult {
  sequence: number;
  result: GameCommandResult;
}

export type DashRequestResult = "started" | "buffered" | "ignored";
export type PlayerAction = "ready" | "dashing" | "targeting" | "route-dashing" | "recovering" | "dead";

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
  activeAbility:
    | {
        id: AbilityId;
        phase: "target-selection";
        targets: Vec2[];
        elapsedMs: number;
        timeoutMs: number;
        targetCount: number;
        worldTimeScale: number;
      }
    | {
        id: AbilityId;
        phase: "route-execution";
        route: Vec2[];
        segmentIndex: number;
        worldTimeScale: number;
      }
    | null;
  bufferedTarget: Vec2 | null;
  abilities: Record<AbilitySlot, {
    id: AbilityId;
    cooldownMs: number;
    resource?: { id: string; current: number; maximum: number };
  } | null>;
  kills: number;
  enemyCount: number;
  aliveEnemies: Array<{ id: string; x: number; z: number }>;
  projectiles: Array<{ id: EntityId; definitionId: ProjectileDefinitionId; x: number; z: number }>;
  obstacles: Array<{ id: EntityId; definitionId: ObstacleDefinitionId; x: number; z: number }>;
  hazards: Array<{ id: EntityId; definitionId: HazardDefinitionId; x: number; z: number }>;
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
  resource?: {
    id: string;
    current: number;
    maximum: number;
  };
}
