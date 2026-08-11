import type { EntityId } from "../../core/ids";
import type { EncounterDefinition, EncounterWave } from "../../content/levels/definitions";
import type {
  EncounterRuntimeState,
  EncounterSchedulerContext,
  EncounterSchedulerUpdate,
  EncounterWaveRuntimeState,
} from "./types";

export const DEFAULT_SPAWN_WARNING_MS = 750;
const TIME_EPSILON_MS = 1e-6;

export function createEncounterRuntime(
  definition: EncounterDefinition,
  startedAtTick: number,
  startedAtMs: number,
): EncounterRuntimeState {
  assertEncounterDefinition(definition);
  return {
    encounterId: definition.id,
    startedAtTick,
    startedAtMs,
    completed: false,
    waves: definition.waves.map((wave) => ({
      id: wave.id,
      status: "pending",
      warningStartedAtMs: null,
      activationAtMs: null,
      activatedAtTick: null,
      completedAtTick: null,
      spawnedEntityIds: [],
    })),
  };
}

export function updateEncounterScheduler(
  runtime: EncounterRuntimeState,
  definition: EncounterDefinition,
  context: EncounterSchedulerContext,
): EncounterSchedulerUpdate {
  assert(runtime.encounterId === definition.id, "runtime and definition encounter IDs differ");
  const warnedWaveIds: string[] = [];
  const activatedWaveIds: string[] = [];
  const completedWaveIds: string[] = [];

  for (const waveRuntime of runtime.waves) {
    if (waveRuntime.status !== "active" || waveRuntime.spawnedEntityIds.length === 0) continue;
    if (waveRuntime.spawnedEntityIds.some((id) => context.aliveEntityIds.has(id))) continue;
    waveRuntime.status = "completed";
    waveRuntime.completedAtTick = context.tick;
    completedWaveIds.push(waveRuntime.id);
  }

  for (let waveIndex = 0; waveIndex < definition.waves.length; waveIndex += 1) {
    const wave = definition.waves[waveIndex];
    const waveRuntime = runtime.waves[waveIndex];
    if (!wave || !waveRuntime || waveRuntime.status !== "pending") continue;
    if (!activationConditionMet(wave, waveIndex, runtime, context)) continue;
    const warningDurationMs = normalizedNonNegative(wave.warningDurationMs, DEFAULT_SPAWN_WARNING_MS);
    waveRuntime.status = "warning";
    waveRuntime.warningStartedAtMs = context.elapsedMs;
    waveRuntime.activationAtMs = context.elapsedMs + warningDurationMs;
    warnedWaveIds.push(wave.id);
  }

  for (const waveRuntime of runtime.waves) {
    if (
      waveRuntime.status !== "warning" ||
      waveRuntime.activationAtMs === null ||
      context.elapsedMs + TIME_EPSILON_MS < waveRuntime.activationAtMs
    ) {
      continue;
    }
    waveRuntime.status = "active";
    waveRuntime.activatedAtTick = context.tick;
    activatedWaveIds.push(waveRuntime.id);
  }

  runtime.completed = runtime.waves.every((wave) => wave.status === "completed");
  return {
    warnedWaveIds,
    activatedWaveIds,
    completedWaveIds,
    encounterCompleted: runtime.completed,
  };
}

export function recordWaveSpawnedEntities(
  runtime: EncounterRuntimeState,
  waveId: string,
  entityIds: readonly EntityId[],
): void {
  const wave = runtime.waves.find((candidate) => candidate.id === waveId);
  if (!wave) throw new Error(`Unknown encounter wave runtime: ${waveId}`);
  assert(wave.status === "active", `cannot record entities for ${waveId} while ${wave.status}`);
  const existingIds = new Set(runtime.waves.flatMap((candidate) => candidate.spawnedEntityIds));
  for (const entityId of entityIds) {
    assert(!existingIds.has(entityId), `entity ${entityId} is already assigned to an encounter wave`);
    existingIds.add(entityId);
  }
  wave.spawnedEntityIds = [...entityIds];
}

export function encounterWaveById(
  runtime: EncounterRuntimeState,
  waveId: string,
): EncounterWaveRuntimeState {
  const wave = runtime.waves.find((candidate) => candidate.id === waveId);
  if (!wave) throw new Error(`Unknown encounter wave runtime: ${waveId}`);
  return wave;
}

function activationConditionMet(
  wave: EncounterWave,
  waveIndex: number,
  runtime: EncounterRuntimeState,
  context: EncounterSchedulerContext,
): boolean {
  if (wave.activation === "immediate") return true;
  if (wave.activation === "timed") {
    return context.elapsedMs - runtime.startedAtMs >= normalizedNonNegative(wave.activationDelayMs, 0);
  }
  if (wave.activation === "after-previous-killed") {
    return waveIndex > 0 && runtime.waves[waveIndex - 1]?.status === "completed";
  }
  return wave.triggerId !== undefined && context.triggerIds.has(wave.triggerId);
}

function assertEncounterDefinition(definition: EncounterDefinition): void {
  assert(definition.waves.length > 0, `encounter ${definition.id} has no waves`);
  const ids = new Set<string>();
  definition.waves.forEach((wave, index) => {
    assert(!ids.has(wave.id), `duplicate wave id ${wave.id}`);
    ids.add(wave.id);
    assert(wave.spawns.length > 0, `wave ${wave.id} has no spawns`);
    if (wave.activation === "after-previous-killed") {
      assert(index > 0, `wave ${wave.id} cannot wait for a missing previous wave`);
    }
    if (wave.activation === "triggered") {
      assert(typeof wave.triggerId === "string" && wave.triggerId.length > 0, `wave ${wave.id} needs triggerId`);
    }
  });
}

function normalizedNonNegative(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? Math.max(0, value ?? fallback) : fallback;
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid encounter scheduler state: ${message}`);
}
