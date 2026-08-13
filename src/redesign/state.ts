import type { BossArchetype, EncounterDefinition, EnemyArchetype, ObstacleArchetype } from "./run";
import type { CoreSkillBuild, CoreUpgradeId, RewardOffer } from "./skills";
import { createEmptyBuild } from "./skills";
import type { Vec2 } from "./math";
import { vec2 } from "./math";

export const FIXED_STEP_MS = 1000 / 120;
export const STATE_VERSION = 1 as const;

export type GamePhase = "title" | "combat" | "reward" | "victory" | "defeat";
export type PlayerAction = "ready" | "charging" | "dashing" | "recovering" | "ultimate-planning" | "dead";
export type DashKind = "basic" | "charged" | "ultimate" | "echo";
export type EnemyPhase = "idle" | "telegraph" | "active" | "recovery" | "airborne" | "dead";
export type BossActionPhase = "telegraph" | "active" | "recovery" | "vulnerable" | "defeated";

export interface VerticalBodyState {
  height: number;
  verticalVelocity: number;
  gravity: number;
  supported: boolean;
  grounded: boolean;
}

export interface PathSegmentState {
  readonly from: Vec2;
  readonly to: Vec2;
  readonly reflected: boolean;
  readonly reflectionPoint: Vec2 | null;
  readonly reflectionNormal: Vec2 | null;
}

export interface DashState {
  readonly id: number;
  readonly kind: DashKind;
  readonly segments: readonly PathSegmentState[];
  readonly hitRadius: number;
  readonly damage: number;
  readonly totalDurationMs: number;
  elapsedMs: number;
  resolvedEnemyIds: string[];
  bossContactResolved: boolean;
  killCount: number;
  readonly pendingCross: null | {
    readonly position: Vec2;
    readonly radius: number;
    triggered: boolean;
  };
}

export interface PlayerState extends VerticalBodyState {
  position: Vec2;
  facing: Vec2;
  aimTarget: Vec2;
  radius: number;
  hp: number;
  maximumHp: number;
  invulnerabilityMs: number;
  action: PlayerAction;
  actionElapsedMs: number;
  chargeStartedTick: number | null;
  chargeTarget: Vec2 | null;
  dash: DashState | null;
  recoveryMs: number;
  ultimateEnergy: number;
  ultimatePoints: Vec2[];
  ultimatePlanningMs: number;
}

export interface EnemyState extends VerticalBodyState {
  readonly id: string;
  readonly archetype: EnemyArchetype;
  position: Vec2;
  facing: Vec2;
  radius: number;
  alive: boolean;
  phase: EnemyPhase;
  phaseElapsedMs: number;
  phaseDurationMs: number;
  attackSequence: number;
  lockedTarget: Vec2 | null;
  angularVelocity: number;
  rotationRadians: number;
  splitGeneration: 0 | 1;
  deathElapsedMs: number;
}

export interface ProjectileState extends VerticalBodyState {
  readonly id: string;
  readonly sourceId: string;
  readonly kind: "pulse" | "radial" | "boss";
  position: Vec2;
  velocity: Vec2;
  radius: number;
  ageMs: number;
  lifetimeMs: number;
  alive: boolean;
}

export interface ObstacleState {
  readonly id: string;
  readonly archetype: ObstacleArchetype;
  readonly position: Vec2;
  readonly rotationRadians: number;
  pulsePhase: number;
}

export interface BossPartState extends VerticalBodyState {
  readonly id: string;
  readonly role: "armor" | "weapon" | "ring" | "decoy";
  localPosition: Vec2;
  alive: boolean;
  rotationRadians: number;
}

export interface BossState extends VerticalBodyState {
  readonly id: string;
  readonly archetype: BossArchetype;
  position: Vec2;
  facing: Vec2;
  radius: number;
  currentHp: number;
  maximumHp: number;
  vulnerable: boolean;
  actionPhase: BossActionPhase;
  actionElapsedMs: number;
  actionDurationMs: number;
  attackSequence: number;
  phaseIndex: number;
  lockedTarget: Vec2 | null;
  parts: BossPartState[];
  orbitRadians: number;
  hitFlashMs: number;
  shieldFlashMs: number;
  defeatedElapsedMs: number;
}

export interface ScheduledSlashState {
  readonly id: string;
  readonly executeAtMs: number;
  readonly segments: readonly PathSegmentState[];
  readonly hitRadius: number;
  readonly kind: "echo";
}

export interface StoredPathState {
  readonly segments: readonly PathSegmentState[];
  remainingMs: number;
}

export interface PendingSpawnState {
  readonly archetype: EnemyArchetype;
  readonly position: Vec2;
  readonly atMs: number;
  spawned: boolean;
}

export interface RunState {
  readonly seed: number;
  encounterIndex: number;
  encounterElapsedMs: number;
  clearElapsedMs: number;
  build: CoreSkillBuild;
  activeOffer: RewardOffer | null;
  selectedUpgradeIds: CoreUpgradeId[];
  completedEncounterIds: string[];
  totalKills: number;
  totalBossDamage: number;
}

export type GameEvent =
  | { readonly type: "run-started"; readonly seed: number }
  | { readonly type: "encounter-started"; readonly encounter: EncounterDefinition }
  | { readonly type: "dash-started"; readonly dash: DashState }
  | { readonly type: "dash-reflected"; readonly position: Vec2; readonly normal: Vec2 }
  | { readonly type: "enemy-killed"; readonly enemyId: string; readonly position: Vec2; readonly kind: DashKind }
  | { readonly type: "enemy-split"; readonly enemyId: string; readonly shardIds: readonly string[] }
  | { readonly type: "projectile-cut"; readonly projectileId: string; readonly position: Vec2 }
  | { readonly type: "player-hit"; readonly sourceId: string; readonly hp: number }
  | { readonly type: "player-defeated" }
  | { readonly type: "cross-triggered"; readonly position: Vec2; readonly radius: number }
  | { readonly type: "echo-triggered"; readonly segments: readonly PathSegmentState[]; readonly hitRadius: number }
  | { readonly type: "boss-hit"; readonly bossId: string; readonly damage: number; readonly hp: number; readonly maximumHp: number }
  | { readonly type: "boss-shielded"; readonly bossId: string; readonly position: Vec2 }
  | { readonly type: "boss-phase"; readonly bossId: string; readonly phaseIndex: number; readonly actionPhase: BossActionPhase }
  | { readonly type: "boss-part-broken"; readonly bossId: string; readonly partId: string; readonly position: Vec2 }
  | { readonly type: "boss-defeated"; readonly bossId: string }
  | { readonly type: "slam-impact"; readonly sourceId: string; readonly position: Vec2; readonly radius: number }
  | { readonly type: "reward-opened"; readonly offer: RewardOffer }
  | { readonly type: "reward-selected"; readonly upgradeId: CoreUpgradeId }
  | { readonly type: "victory" };

export interface GameState {
  readonly version: typeof STATE_VERSION;
  phase: GamePhase;
  tick: number;
  elapsedMs: number;
  accumulatorMs: number;
  entitySequence: number;
  dashSequence: number;
  player: PlayerState;
  enemies: EnemyState[];
  projectiles: ProjectileState[];
  obstacles: ObstacleState[];
  boss: BossState | null;
  pendingSpawns: PendingSpawnState[];
  scheduledSlashes: ScheduledSlashState[];
  storedPath: StoredPathState | null;
  run: RunState;
  events: GameEvent[];
}

export type GameCommand =
  | { readonly type: "start-run" }
  | { readonly type: "aim"; readonly target: Vec2 }
  | { readonly type: "begin-primary"; readonly target: Vec2 }
  | { readonly type: "release-primary"; readonly target: Vec2 }
  | { readonly type: "cancel-primary" }
  | { readonly type: "start-ultimate" }
  | { readonly type: "add-ultimate-point"; readonly target: Vec2 }
  | { readonly type: "cancel-ultimate" }
  | { readonly type: "select-upgrade"; readonly offerId: string; readonly upgradeId: CoreUpgradeId }
  | { readonly type: "restart-run" }
  | { readonly type: "return-title" };

export type GameCommandResult =
  | "run-started"
  | "charge-started"
  | "dash-started"
  | "charge-cancelled"
  | "ultimate-started"
  | "ultimate-point-added"
  | "ultimate-executing"
  | "ultimate-cancelled"
  | "upgrade-selected"
  | "run-restarted"
  | "returned-to-title"
  | "ignored";

export function createInitialState(seed: number): GameState {
  return {
    version: STATE_VERSION,
    phase: "title",
    tick: 0,
    elapsedMs: 0,
    accumulatorMs: 0,
    entitySequence: 0,
    dashSequence: 0,
    player: createPlayer(),
    enemies: [],
    projectiles: [],
    obstacles: [],
    boss: null,
    pendingSpawns: [],
    scheduledSlashes: [],
    storedPath: null,
    run: {
      seed: Math.trunc(seed) >>> 0,
      encounterIndex: 0,
      encounterElapsedMs: 0,
      clearElapsedMs: 0,
      build: createEmptyBuild(),
      activeOffer: null,
      selectedUpgradeIds: [],
      completedEncounterIds: [],
      totalKills: 0,
      totalBossDamage: 0,
    },
    events: [],
  };
}

export function createPlayer(): PlayerState {
  return {
    position: vec2(0, 0),
    facing: vec2(0, 1),
    aimTarget: vec2(0, 12),
    radius: 0.72,
    hp: 3,
    maximumHp: 3,
    invulnerabilityMs: 0,
    action: "ready",
    actionElapsedMs: 0,
    chargeStartedTick: null,
    chargeTarget: null,
    dash: null,
    recoveryMs: 0,
    ultimateEnergy: 0,
    ultimatePoints: [],
    ultimatePlanningMs: 0,
    height: 0.78,
    verticalVelocity: 0,
    gravity: -24,
    supported: true,
    grounded: false,
  };
}

export function nextEntityId(state: GameState, prefix: string): string {
  state.entitySequence += 1;
  return `${prefix}-${String(state.entitySequence).padStart(4, "0")}`;
}

export function emit(state: GameState, event: GameEvent): void {
  state.events.push(event);
}

export function drainEvents(state: GameState): GameEvent[] {
  const events = state.events;
  state.events = [];
  return events;
}
