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
  from: Vec2;
  to: Vec2;
  durationMs: number;
  elapsedMs: number;
}

export interface PlayerState {
  position: Vec2;
  facing: Vec2;
  radius: number;
  hp: 0 | 1;
  dash: DashState | null;
  recoveryRemainingMs: number;
  bufferedDashTarget: Vec2 | null;
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

export type GameEvent =
  | { type: "stage-started"; atMs: number; stageIndex: number }
  | { type: "stage-restarted"; atMs: number; stageIndex: number; attempt: number }
  | { type: "dash-started"; atMs: number; from: Vec2; to: Vec2; durationMs: number }
  | { type: "enemy-killed"; atMs: number; enemyId: string; position: Vec2 }
  | { type: "dash-ended"; atMs: number; position: Vec2 }
  | { type: "player-died"; atMs: number; enemyId: string; position: Vec2 }
  | { type: "stage-cleared" | "game-complete"; atMs: number; stageIndex: number };

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
  lastEvents: GameEvent[];
}

export interface GameInput {
  dashTarget?: Vec2;
  restart?: boolean;
  advanceStage?: boolean;
}

export type DashRequestResult = "started" | "buffered" | "ignored";
export type PlayerAction = "ready" | "dashing" | "recovering" | "dead";

export interface GameSnapshot {
  stage: { index: number; number: number; count: number; id: string; name: string };
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
  kills: number;
  enemyCount: number;
  aliveEnemies: Array<{ id: string; x: number; z: number }>;
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
