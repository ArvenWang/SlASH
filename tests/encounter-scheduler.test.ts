import { describe, expect, test } from "vitest";
import type { EncounterDefinition } from "../src/content/levels/definitions";
import {
  createEncounterRuntime,
  encounterWaveById,
  recordWaveSpawnedEntities,
  updateEncounterScheduler,
} from "../src/game/encounters/encounter-system";

const encounter: EncounterDefinition = {
  id: "encounter-scheduler-acceptance-v1",
  completionRule: "all-hostiles-defeated",
  enemyMoveSpeed: 0,
  waves: [
    {
      id: "wave-immediate",
      activation: "immediate",
      warningDurationMs: 100,
      spawns: [{ id: "spawn-1", enemyDefinitionId: "enemy-grunt-v1", position: { x: 0, z: 0 } }],
    },
    {
      id: "wave-timed",
      activation: "timed",
      activationDelayMs: 300,
      warningDurationMs: 50,
      spawns: [{ id: "spawn-2", enemyDefinitionId: "enemy-grunt-v1", position: { x: 1, z: 0 } }],
    },
    {
      id: "wave-after-kill",
      activation: "after-previous-killed",
      warningDurationMs: 0,
      spawns: [{ id: "spawn-3", enemyDefinitionId: "enemy-grunt-v1", position: { x: 2, z: 0 } }],
    },
    {
      id: "wave-triggered",
      activation: "triggered",
      triggerId: "open-final-wave",
      warningDurationMs: 0,
      spawns: [{ id: "spawn-4", enemyDefinitionId: "enemy-grunt-v1", position: { x: 3, z: 0 } }],
    },
  ],
};

function context(tick: number, elapsedMs: number, alive: string[] = [], triggers: string[] = []) {
  return {
    tick,
    elapsedMs,
    aliveEntityIds: new Set(alive),
    triggerIds: new Set(triggers),
  };
}

describe("encounter scheduler", () => {
  test("runs immediate, timed, after-kill, and triggered waves through warning and completion", () => {
    const runtime = createEncounterRuntime(encounter, 0, 0);

    expect(updateEncounterScheduler(runtime, encounter, context(0, 0))).toEqual({
      warnedWaveIds: ["wave-immediate"],
      activatedWaveIds: [],
      completedWaveIds: [],
      encounterCompleted: false,
    });
    expect(updateEncounterScheduler(runtime, encounter, context(12, 100)).activatedWaveIds).toEqual(["wave-immediate"]);
    recordWaveSpawnedEntities(runtime, "wave-immediate", ["enemy-1"]);

    const atTimedCondition = updateEncounterScheduler(runtime, encounter, context(36, 300, []));
    expect(atTimedCondition.completedWaveIds).toEqual(["wave-immediate"]);
    expect(atTimedCondition.warnedWaveIds).toEqual(["wave-timed"]);
    expect(updateEncounterScheduler(runtime, encounter, context(42, 350)).activatedWaveIds).toEqual(["wave-timed"]);
    recordWaveSpawnedEntities(runtime, "wave-timed", ["enemy-2"]);

    const afterTimedKill = updateEncounterScheduler(runtime, encounter, context(44, 367, []));
    expect(afterTimedKill.completedWaveIds).toEqual(["wave-timed"]);
    expect(afterTimedKill.warnedWaveIds).toEqual(["wave-after-kill"]);
    expect(afterTimedKill.activatedWaveIds).toEqual(["wave-after-kill"]);
    recordWaveSpawnedEntities(runtime, "wave-after-kill", ["enemy-3"]);

    const afterThirdKill = updateEncounterScheduler(runtime, encounter, context(45, 375, [], ["open-final-wave"]));
    expect(afterThirdKill.completedWaveIds).toEqual(["wave-after-kill"]);
    expect(afterThirdKill.warnedWaveIds).toEqual(["wave-triggered"]);
    expect(afterThirdKill.activatedWaveIds).toEqual(["wave-triggered"]);
    recordWaveSpawnedEntities(runtime, "wave-triggered", ["enemy-4"]);

    const final = updateEncounterScheduler(runtime, encounter, context(46, 383));
    expect(final.completedWaveIds).toEqual(["wave-triggered"]);
    expect(final.encounterCompleted).toBe(true);
    expect(runtime.completed).toBe(true);
    expect(runtime.waves.every((wave) => wave.status === "completed")).toBe(true);
  });

  test("does not activate a triggered wave without its stable trigger", () => {
    const runtime = createEncounterRuntime(encounter, 0, 0);
    updateEncounterScheduler(runtime, encounter, context(0, 0));
    expect(encounterWaveById(runtime, "wave-triggered").status).toBe("pending");
    updateEncounterScheduler(runtime, encounter, context(120, 1_000, [], ["different-trigger"]));
    expect(encounterWaveById(runtime, "wave-triggered").status).toBe("pending");
  });

  test("rejects duplicate entity ownership and invalid triggered definitions", () => {
    const runtime = createEncounterRuntime(encounter, 0, 0);
    updateEncounterScheduler(runtime, encounter, context(0, 0));
    updateEncounterScheduler(runtime, encounter, context(12, 100));
    recordWaveSpawnedEntities(runtime, "wave-immediate", ["enemy-1"]);

    updateEncounterScheduler(runtime, encounter, context(36, 300, ["enemy-1"]));
    updateEncounterScheduler(runtime, encounter, context(42, 350, ["enemy-1"]));
    expect(() => recordWaveSpawnedEntities(runtime, "wave-timed", ["enemy-1"])).toThrow(/already assigned/);

    expect(() => createEncounterRuntime({
      ...encounter,
      id: "invalid-trigger",
      waves: [{ ...encounter.waves[3]!, triggerId: undefined }],
    }, 0, 0)).toThrow(/needs triggerId/);
  });

  test("is JSON-safe", () => {
    const runtime = createEncounterRuntime(encounter, 10, 100);
    expect(JSON.parse(JSON.stringify(runtime))).toEqual(runtime);
  });
});
