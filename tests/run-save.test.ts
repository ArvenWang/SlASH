import { describe, expect, test } from "vitest";
import {
  createFullGameGame,
  dispatchGameCommand,
  getGameSnapshot,
} from "../src/game/game";
import { completeCampaignEncounter } from "../src/game/campaign/campaign-system";
import type { GameState } from "../src/game/domain/types";
import {
  RUN_SAVE_CONTENT_VERSION,
  RUN_SAVE_LEGACY_STORAGE_KEYS,
  RUN_SAVE_SCHEMA_VERSION,
  RUN_SAVE_STORAGE_KEY,
  RunSaveError,
  createRunSave,
  inspectRunSave,
  restoreRunSave,
} from "../src/game/save/run-save";
import { completeCurrentRouteNode } from "../src/game/run/run-system";
import { stableHash } from "../src/game/serialization/stable";
import { createRunSaveRuntime } from "../src/runtime/run-save-runtime";

describe("V2 safe Run Save", () => {
  test("roundtrips the title safe node without combat state", () => {
    const state = createFullGameGame(7401);
    expect(dispatchGameCommand(state, {
      type: "configure-run-protocol",
      mode: "threat",
      threatLevel: 4,
    }).result).toBe("protocol-configured");

    const serialized = createRunSave(state);
    const restored = restoreRunSave(serialized);

    expect(getGameSnapshot(restored)).toEqual(getGameSnapshot(state));
    expect(restored.run.fullGame?.phase).toBe("title");
    expect(restored.enemies).toEqual([]);
    expect(restored.projectiles).toEqual([]);
    expect(restored.obstacles).toEqual([]);
    expect(restored.hazards).toEqual([]);
    expect(restored.lastEvents).toEqual([]);
    expect(createRunSave(restored)).toBe(serialized);
    expect(inspectRunSave(serialized)).toMatchObject({
      seed: 7401,
      phase: "title",
      actNumber: 1,
      layerNumber: 1,
      completedNodeCount: 0,
      committedSkillCount: 0,
      protocolMode: "threat",
      threatLevel: 4,
    });
  });

  test("preserves and reconstructs the complete three-candidate upgrade choice", () => {
    const state = createUpgradeChoiceState(8128);
    const originalDraft = state.run.fullGame?.activeRewardDraft;
    if (!originalDraft) throw new Error("Missing V2 reward draft.");

    const serialized = createRunSave(state);
    const restored = restoreRunSave(serialized);
    const restoredDraft = restored.run.fullGame?.activeRewardDraft;

    expect(restored.run.fullGame?.phase).toBe("upgrade-choice");
    expect(restored.stage.phase).toBe("upgrade-choice");
    expect(restoredDraft).toEqual(originalDraft);
    expect(restoredDraft?.candidateSkillIds).toHaveLength(3);
    expect(new Set(restoredDraft?.candidateSkillIds).size).toBe(3);
    expect(restoredDraft?.selectedSkillId).toBeNull();
    expect(restored.run.fullGame?.routeProgress).toEqual(state.run.fullGame?.routeProgress);
    expect(restored.run.fullGame?.pendingReward).toEqual(state.run.fullGame?.pendingReward);
    expect(createRunSave(restored)).toBe(serialized);
  });

  test("roundtrips the victory safe node", () => {
    const state = createVictoryState(9231);
    const serialized = createRunSave(state);
    const restored = restoreRunSave(serialized);

    expect(restored.run.fullGame?.phase).toBe("victory");
    expect(restored.stage.phase).toBe("victory");
    expect(restored.run.fullGame?.routeProgress.phase).toBe("victory");
    expect(restored.run.fullGame?.activeRewardDraft).toBeNull();
    expect(createRunSave(restored)).toBe(serialized);
  });

  test("rejects combat and does not serialize an in-progress encounter", () => {
    const state = createFullGameGame(9);
    expect(dispatchGameCommand(state, { type: "start-full-game-run" }).result).toBe("run-started");
    expect(state.run.fullGame?.phase).toBe("combat");
    expect(state.stage.phase).toBe("playing");

    expect(() => createRunSave(state)).toThrowError(RunSaveError);
    expectRunSaveCreationError(state, "unsafe-phase");
  });

  test("refuses unknown versions, corruption, and invalid V2 reward state with explicit codes", () => {
    const state = createUpgradeChoiceState(12);
    const valid = JSON.parse(createRunSave(state));

    const schema = structuredClone(valid);
    schema.schemaVersion = 999;
    expectSaveError(JSON.stringify(schema), "unsupported-schema");

    const content = structuredClone(valid);
    content.contentVersion = "full-game-v1";
    expectSaveError(JSON.stringify(content), "unsupported-content");

    const corrupt = structuredClone(valid);
    corrupt.state.run.seed += 1;
    expectSaveError(JSON.stringify(corrupt), "checksum-mismatch");

    const incompleteDraft = structuredClone(valid);
    incompleteDraft.state.run.fullGame.activeRewardDraft.candidateSkillIds.pop();
    refreshChecksum(incompleteDraft);
    expectSaveError(JSON.stringify(incompleteDraft), "invalid-state");

    const unreconstructableDraft = structuredClone(valid);
    unreconstructableDraft.state.run.fullGame.activeRewardDraft.offerId = "stale-offer";
    refreshChecksum(unreconstructableDraft);
    expectSaveError(JSON.stringify(unreconstructableDraft), "invalid-state");

    const invalidProtocol = structuredClone(valid);
    invalidProtocol.state.run.fullGame.protocol.mode = "assist";
    invalidProtocol.state.run.fullGame.protocol.leaderboardEligible = true;
    refreshChecksum(invalidProtocol);
    expectSaveError(JSON.stringify(invalidProtocol), "invalid-state");
    expectSaveError("{not-json", "invalid-json");
  });

  test.each(RUN_SAVE_LEGACY_STORAGE_KEYS)(
    "keeps incompatible legacy storage %s byte-for-byte",
    (legacyKey) => {
      const legacyRaw = JSON.stringify({
        schemaVersion: legacyKey.endsWith(":v2") ? 2 : 1,
        contentVersion: "full-game-v1",
        state: { legacy: true },
        checksum: "legacy-checksum",
      });
      const values = new Map<string, string>([[legacyKey, legacyRaw]]);
      const runtime = createRunSaveRuntime(mapStorage(values));

      expect(runtime.status()).toMatchObject({
        kind: "error",
        message: expect.stringMatching(/不受支持|不兼容/),
      });
      expect(runtime.restore()).toMatchObject({
        ok: false,
        message: expect.stringMatching(/不受支持|不兼容/),
      });
      expect(values.get(legacyKey)).toBe(legacyRaw);
      expect(values.has(RUN_SAVE_STORAGE_KEY)).toBe(false);
    },
  );

  test("keeps invalid current storage intact instead of silently clearing it", () => {
    const raw = "{broken";
    const values = new Map<string, string>([[RUN_SAVE_STORAGE_KEY, raw]]);
    const runtime = createRunSaveRuntime(mapStorage(values));

    expect(runtime.status()).toMatchObject({ kind: "error" });
    expect(runtime.restore()).toMatchObject({ ok: false });
    expect(values.get(RUN_SAVE_STORAGE_KEY)).toBe(raw);
  });

  test("survives 100 deterministic title and upgrade-choice roundtrips", () => {
    for (let seed = 0; seed < 100; seed += 1) {
      const titleState = createFullGameGame(seed);
      const titleSerialized = createRunSave(titleState);
      expect(createRunSave(restoreRunSave(titleSerialized))).toBe(titleSerialized);

      const choiceState = createUpgradeChoiceState(seed);
      const originalDraft = choiceState.run.fullGame?.activeRewardDraft;
      const choiceSerialized = createRunSave(choiceState);
      const restored = restoreRunSave(choiceSerialized);
      expect(restored.run.fullGame?.activeRewardDraft).toEqual(originalDraft);
      expect(createRunSave(restored)).toBe(choiceSerialized);
    }
  });
});

function createUpgradeChoiceState(seed: number): GameState {
  const state = createFullGameGame(seed);
  expect(dispatchGameCommand(state, { type: "start-full-game-run" }).result).toBe("run-started");
  const campaign = state.run.fullGame;
  if (!campaign?.encounterRuntime) throw new Error("Missing directed encounter.");
  campaign.encounterRuntime.completed = true;
  state.enemies = [];
  state.player.dash = null;
  state.player.charge = null;
  state.player.ultimatePlanning = null;
  state.player.ultimateExecution = null;

  // The public command loop normally reaches this transition after clearing all
  // encounter waves. This focused save test marks that same scheduler fact.
  expect(completeCampaignEncounter(state)).toBe(true);
  expect(campaign.phase).toBe("upgrade-choice");
  return state;
}

function createVictoryState(seed: number): GameState {
  const state = createFullGameGame(seed);
  const campaign = state.run.fullGame;
  if (!campaign) throw new Error("Missing campaign.");
  const finalAct = campaign.routeProgress.route.acts.at(-1);
  if (!finalAct) throw new Error("Missing final Act.");
  const finalBoss = finalAct.layers.at(-1)?.find((node) => node.kind === "boss");
  if (!finalBoss) throw new Error("Missing final Boss node.");

  campaign.routeProgress.phase = "encounter";
  campaign.routeProgress.actIndex = finalAct.actIndex;
  campaign.routeProgress.layerIndex = finalBoss.layerIndex;
  campaign.routeProgress.currentNodeId = finalBoss.id;
  campaign.routeProgress.availableNodeIds = [];
  expect(completeCurrentRouteNode(campaign.routeProgress)).toBe("run-complete");
  campaign.phase = "victory";
  campaign.pendingReward = null;
  campaign.activeRewardDraft = null;
  state.stage.phase = "victory";
  return state;
}

function refreshChecksum(envelope: Record<string, any>): void {
  envelope.checksum = stableHash({
    schemaVersion: RUN_SAVE_SCHEMA_VERSION,
    contentVersion: RUN_SAVE_CONTENT_VERSION,
    state: envelope.state,
  });
}

function mapStorage(values: Map<string, string>) {
  return {
    getItem(key: string) { return values.get(key) ?? null; },
    setItem(key: string, value: string) { values.set(key, value); },
  };
}

function expectRunSaveCreationError(state: GameState, code: string): void {
  try {
    createRunSave(state);
    throw new Error(`Expected Run Save creation error ${code}.`);
  } catch (error) {
    expect(error).toBeInstanceOf(RunSaveError);
    expect(error).toMatchObject({ code });
  }
}

function expectSaveError(serialized: string, code: string): void {
  try {
    restoreRunSave(serialized);
    throw new Error(`Expected Run Save error ${code}.`);
  } catch (error) {
    expect(error).toBeInstanceOf(RunSaveError);
    expect(error).toMatchObject({ code });
  }
}
