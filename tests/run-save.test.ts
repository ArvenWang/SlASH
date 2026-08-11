import { describe, expect, test } from "vitest";
import {
  createCampaignEventValidationGame,
  createCampaignForgeValidationGame,
  createFullGameGame,
  dispatchGameCommand,
  getGameSnapshot,
} from "../src/game/game";
import {
  RUN_SAVE_CONTENT_VERSION,
  RUN_SAVE_SCHEMA_VERSION,
  RUN_SAVE_STORAGE_KEY,
  RunSaveError,
  createRunSave,
  inspectRunSave,
  restoreRunSave,
} from "../src/game/save/run-save";
import { stableHash } from "../src/game/serialization/stable";
import { createRunSaveRuntime } from "../src/runtime/run-save-runtime";

describe("safe Run Save", () => {
  test("roundtrips route, draft allocation, resources, and observable state", () => {
    const state = createFullGameGame(7401);
    expect(dispatchGameCommand(state, { type: "start-full-game-run" }).result).toBe("run-started");
    const nodeId = state.run.fullGame?.routeProgress.availableNodeIds[0];
    if (!nodeId) throw new Error("Missing route node.");
    dispatchGameCommand(state, { type: "preview-route-node", nodeId });
    dispatchGameCommand(state, { type: "preview-skill-purchase", skillId: "skill-wide-slash-v1" });
    state.run.acquiredResources.intel = 2;
    state.run.acquiredResources["reroute-token"] = 1;

    const serialized = createRunSave(state);
    const restored = restoreRunSave(serialized);
    expect(getGameSnapshot(restored)).toEqual(getGameSnapshot(state));
    expect(restored.run.fullGame?.provisionalRouteNodeId).toBe(nodeId);
    expect(restored.run.fullGame?.skills.draftAddedSkillIds).toEqual(["skill-wide-slash-v1"]);
    expect(restored.run.acquiredResources).toEqual(state.run.acquiredResources);
    expect(restored.lastEvents).toEqual([]);
    expect(createRunSave(restored)).toBe(serialized);
    expect(inspectRunSave(serialized)).toMatchObject({
      seed: 7401,
      phase: "planning",
      actNumber: 1,
      layerNumber: 1,
      committedSkillCount: 0,
    });
  });

  test("preserves Event, Forge, and Reward safe-node state without combat entities", () => {
    const eventState = createCampaignEventValidationGame();
    const eventSave = restoreRunSave(createRunSave(eventState));
    expect(eventSave.stage.phase).toBe("event");
    expect(eventSave.run.fullGame?.activeEventDefinitionId).toBeTruthy();

    const choiceId = eventState.run.fullGame?.activeEventDefinitionId === "event-broken-switch-v1"
      ? "switch-reroute"
      : null;
    if (!choiceId) throw new Error("Validation Event fixture changed unexpectedly.");
    dispatchGameCommand(eventState, { type: "resolve-event-choice", choiceId });
    const rewardSave = restoreRunSave(createRunSave(eventState));
    expect(rewardSave.stage.phase).toBe("reward");
    expect(rewardSave.run.acquiredResources["reroute-token"]).toBe(1);
    expect(rewardSave.run.fullGame?.eventHistory).toHaveLength(1);

    const forgeState = createCampaignForgeValidationGame();
    dispatchGameCommand(forgeState, { type: "preview-skill-refund", skillId: "skill-wide-slash-v1" });
    dispatchGameCommand(forgeState, { type: "use-forge-token" });
    const forgeSave = restoreRunSave(createRunSave(forgeState));
    expect(forgeSave.stage.phase).toBe("forge");
    expect(forgeSave.run.fullGame?.skills.draftRemovedSkillIds).toEqual([
      "skill-wide-slash-v1",
      "skill-gravity-slash-v1",
    ]);
    expect(forgeSave.run.fullGame?.skills.forgeMoveLimit).toBe(3);
    expect(forgeSave.run.acquiredResources["reroute-token"]).toBe(0);
    expect(forgeSave.enemies).toEqual([]);
  });

  test("rejects combat and does not serialize an in-progress encounter", () => {
    const state = createFullGameGame(9);
    dispatchGameCommand(state, { type: "start-full-game-run" });
    const nodeId = state.run.fullGame?.routeProgress.availableNodeIds[0];
    if (!nodeId) throw new Error("Missing route node.");
    dispatchGameCommand(state, { type: "preview-route-node", nodeId });
    dispatchGameCommand(state, { type: "confirm-planning" });
    expect(() => createRunSave(state)).toThrowError(RunSaveError);
    try {
      createRunSave(state);
    } catch (error) {
      expect(error).toMatchObject({ code: "unsafe-phase" });
    }
  });

  test("refuses unknown versions, corruption, and invalid skill state with explicit codes", () => {
    const state = createFullGameGame(12);
    dispatchGameCommand(state, { type: "start-full-game-run" });
    const valid = JSON.parse(createRunSave(state));

    const schema = structuredClone(valid);
    schema.schemaVersion = 999;
    expectSaveError(JSON.stringify(schema), "unsupported-schema");

    const content = structuredClone(valid);
    content.contentVersion = "future-content";
    expectSaveError(JSON.stringify(content), "unsupported-content");

    const corrupt = structuredClone(valid);
    corrupt.state.run.seed += 1;
    expectSaveError(JSON.stringify(corrupt), "checksum-mismatch");

    const invalidState = structuredClone(valid);
    invalidState.state.run.fullGame.skills.committedSkillIds = ["skill-does-not-exist"];
    invalidState.state.run.selectedUpgrades = ["skill-does-not-exist"];
    invalidState.checksum = stableHash({
      schemaVersion: RUN_SAVE_SCHEMA_VERSION,
      contentVersion: RUN_SAVE_CONTENT_VERSION,
      state: invalidState.state,
    });
    expectSaveError(JSON.stringify(invalidState), "invalid-state");
    expectSaveError("{not-json", "invalid-json");
  });

  test("keeps invalid raw storage intact instead of silently clearing it", () => {
    const values = new Map<string, string>([[RUN_SAVE_STORAGE_KEY, "{broken"]]);
    const storage = {
      getItem(key: string) { return values.get(key) ?? null; },
      setItem(key: string, value: string) { values.set(key, value); },
    };
    const runtime = createRunSaveRuntime(storage);
    expect(runtime.status()).toMatchObject({ kind: "error" });
    expect(runtime.restore()).toMatchObject({ ok: false });
    expect(values.get(RUN_SAVE_STORAGE_KEY)).toBe("{broken");
  });

  test("survives 1,000 deterministic safe-node roundtrips", () => {
    for (let seed = 0; seed < 1_000; seed += 1) {
      const state = createFullGameGame(seed);
      dispatchGameCommand(state, { type: "start-full-game-run" });
      const available = state.run.fullGame?.routeProgress.availableNodeIds;
      const nodeId = available?.[seed % available.length];
      if (!nodeId) throw new Error(`Missing route node for seed ${seed}.`);
      dispatchGameCommand(state, { type: "preview-route-node", nodeId });
      if (seed % 2 === 0) {
        dispatchGameCommand(state, { type: "preview-skill-purchase", skillId: "skill-wide-slash-v1" });
      }
      state.run.acquiredResources.intel = seed % 4;
      const serialized = createRunSave(state);
      const restored = restoreRunSave(serialized);
      expect(createRunSave(restored)).toBe(serialized);
    }
  });
});

function expectSaveError(serialized: string, code: string): void {
  try {
    restoreRunSave(serialized);
    throw new Error(`Expected Run Save error ${code}.`);
  } catch (error) {
    expect(error).toBeInstanceOf(RunSaveError);
    expect(error).toMatchObject({ code });
  }
}
