import type { BossDefinitionId, EntityId } from "../../core/ids";
import type { Vec2 } from "../../core/math/vec2";

export type BossActionPhase =
  | "telegraph"
  | "active"
  | "recovery"
  | "vulnerable"
  | "objective"
  | "transition"
  | "complete";

export interface RailHoundMechanicsState {
  readonly kind: "rail-hound";
  chargeIndex: number;
  chargesThisCycle: number;
}

export interface SiegeChoirMechanicsState {
  readonly kind: "siege-choir";
  round: 1 | 2;
  armorBreaksThisRound: number;
  barrierCooldownMs: number;
  turretEntityIds: EntityId[];
}

export interface MirrorSlashRuntimeState {
  phase: "telegraph" | "active";
  elapsedMs: number;
  durationMs: number;
  readonly segments: Array<{ readonly from: Vec2; readonly to: Vec2 }>;
}

export interface MirrorRegentMechanicsState {
  readonly kind: "mirror-regent";
  cycle: number;
  readonly realEntityId: EntityId;
  cloneEntityIds: EntityId[];
  mirrorSlash: MirrorSlashRuntimeState | null;
  respawnDelayMs: number;
}

export interface BossObjectiveNodeState {
  readonly id: string;
  readonly position: Vec2;
  reached: boolean;
}

export interface LastConductorMechanicsState {
  readonly kind: "last-conductor";
  barrageSupportEntityIds: EntityId[];
  barrageShotCooldownMs: number;
  railPulseCooldownMs: number;
  railNodes: BossObjectiveNodeState[];
  armorBreakCount: number;
  finaleNodes: BossObjectiveNodeState[];
  finaleRefillCooldownMs: number;
  finaleAttemptActive: boolean;
  finaleAttemptInvalid: boolean;
}

export type BossMechanicsState =
  | RailHoundMechanicsState
  | SiegeChoirMechanicsState
  | MirrorRegentMechanicsState
  | LastConductorMechanicsState;

export interface BossRuntimeState {
  readonly definitionId: BossDefinitionId;
  readonly entityId: EntityId;
  readonly startedAtMs: number;
  phaseId: string;
  phaseIndex: number;
  actionPhase: BossActionPhase;
  phaseElapsedMs: number;
  phaseDurationMs: number;
  objectiveCurrent: number;
  objectiveTarget: number;
  breakCount: number;
  attackSequence: number;
  lockedTarget: Vec2 | null;
  lockedDirection: Vec2;
  coreExposed: boolean;
  completed: boolean;
  transitionCount: number;
  mechanics: BossMechanicsState;
}
