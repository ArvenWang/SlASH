import type { EncounterId, EntityId } from "../../core/ids";

export type EncounterWaveStatus = "pending" | "warning" | "active" | "completed";

export interface EncounterWaveRuntimeState {
  readonly id: string;
  status: EncounterWaveStatus;
  warningStartedAtMs: number | null;
  activationAtMs: number | null;
  activatedAtTick: number | null;
  completedAtTick: number | null;
  spawnedEntityIds: EntityId[];
}

export interface EncounterRuntimeState {
  readonly encounterId: EncounterId;
  readonly startedAtTick: number;
  readonly startedAtMs: number;
  completed: boolean;
  waves: EncounterWaveRuntimeState[];
}

export interface EncounterSchedulerContext {
  readonly tick: number;
  readonly elapsedMs: number;
  readonly aliveEntityIds: ReadonlySet<EntityId>;
  readonly triggerIds: ReadonlySet<string>;
}

export interface EncounterSchedulerUpdate {
  readonly warnedWaveIds: string[];
  readonly activatedWaveIds: string[];
  readonly completedWaveIds: string[];
  readonly encounterCompleted: boolean;
}
