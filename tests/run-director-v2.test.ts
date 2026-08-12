import { describe, expect, test } from "vitest";
import type { RouteNodeKind } from "../src/content/runs/definitions";
import { autoSelectRunNode } from "../src/game/run/run-director";
import {
  completeCurrentRouteNode,
  createFullGameRunProgress,
  routeNodeById,
  selectRouteNode,
} from "../src/game/run/run-system";
import type { FullGameRunProgressState } from "../src/game/run/types";

describe("V2 background run director", () => {
  test("deterministically selects and submits one current supported node", () => {
    const first = progressAtLayer(20260813, 1);
    const repeat = cloneProgress(first);
    const reordered = cloneProgress(first);
    reordered.availableNodeIds.reverse();
    const legalChoices = [...first.availableNodeIds];

    const firstResult = autoSelectRunNode(first);
    const repeatResult = autoSelectRunNode(repeat);
    const reorderedResult = autoSelectRunNode(reordered);

    expect(firstResult.ok).toBe(true);
    expect(repeatResult).toEqual(firstResult);
    expect(reorderedResult).toEqual(firstResult);
    if (!firstResult.ok) throw new Error(`Expected a selection, received ${firstResult.reason}.`);
    expect(legalChoices).toContain(firstResult.node.id);
    expect(["combat", "elite", "challenge", "boss"]).toContain(firstResult.node.kind);
    expect(first.phase).toBe("encounter");
    expect(first.currentNodeId).toBe(firstResult.node.id);
    expect(first.availableNodeIds).toEqual([]);
  });

  test("avoids event and forge whenever a supported current choice exists", () => {
    const progress = findSafeLayerProgress((kinds) => (
      kinds.includes("event") && kinds.includes("challenge")
    ));

    const result = autoSelectRunNode(progress);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`Expected a challenge selection, received ${result.reason}.`);
    expect(result.node.kind).toBe("challenge");
    expect(progress.currentNodeId).toBe(result.node.id);
  });

  test("bypasses an event/forge-only layer and selects the next supported combat", () => {
    const progress = findSafeLayerProgress((kinds) => (
      kinds.includes("event") && kinds.includes("forge") && !kinds.includes("challenge")
    ));
    const result = autoSelectRunNode(progress);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`Expected an automatic bypass, received ${result.reason}.`);
    expect(["combat", "elite", "challenge", "boss"]).toContain(result.node.kind);
    expect(progress.layerIndex).toBe(3);
    expect(progress.currentNodeId).toBe(result.node.id);
  });

  test("reports invalid or unavailable route states explicitly", () => {
    const busy = createFullGameRunProgress(11);
    expect(autoSelectRunNode(busy).ok).toBe(true);
    expect(autoSelectRunNode(busy)).toMatchObject({ ok: false, reason: "not-ready" });

    const empty = createFullGameRunProgress(12);
    empty.availableNodeIds = [];
    expect(autoSelectRunNode(empty)).toEqual({
      ok: false,
      reason: "no-available-nodes",
      availableNodeIds: [],
      availableNodeKinds: [],
    });

    const malformed = createFullGameRunProgress(13);
    malformed.availableNodeIds = ["missing-route-node"];
    expect(autoSelectRunNode(malformed)).toEqual({
      ok: false,
      reason: "invalid-route-state",
      availableNodeIds: ["missing-route-node"],
      availableNodeKinds: [],
    });
  });
});

function progressAtLayer(seed: number, targetLayerIndex: number): FullGameRunProgressState {
  const progress = createFullGameRunProgress(seed);
  while (progress.layerIndex < targetLayerIndex) {
    const nodeId = progress.availableNodeIds[0];
    if (!nodeId) throw new Error(`Seed ${seed} has no route node at layer ${progress.layerIndex}.`);
    if (selectRouteNode(progress, nodeId) !== "selected") {
      throw new Error(`Could not select ${nodeId}.`);
    }
    if (completeCurrentRouteNode(progress) === "ignored") {
      throw new Error(`Could not complete ${nodeId}.`);
    }
  }
  return progress;
}

function findSafeLayerProgress(
  predicate: (kinds: readonly RouteNodeKind[]) => boolean,
): FullGameRunProgressState {
  for (let seed = 0; seed < 512; seed += 1) {
    const progress = progressAtLayer(seed, 2);
    const kinds = progress.availableNodeIds.map((nodeId) => routeNodeById(progress.route, nodeId).kind);
    if (predicate(kinds)) return progress;
  }
  throw new Error("Could not find a representative safe-layer route in 512 seeds.");
}

function cloneProgress(progress: FullGameRunProgressState): FullGameRunProgressState {
  return JSON.parse(JSON.stringify(progress)) as FullGameRunProgressState;
}
