import { describe, expect, test } from "vitest";
import {
  availableRouteNodes,
  completeCurrentRouteNode,
  createFullGameRunProgress,
  currentRouteNode,
  selectRouteNode,
} from "../src/game/run/run-system";

describe("full game run progress", () => {
  test("selects only reachable nodes and advances through every act to victory", () => {
    const progress = createFullGameRunProgress(20260812);
    expect(progress.phase).toBe("route-map");
    expect(progress.availableNodeIds).toHaveLength(2);
    expect(selectRouteNode(progress, "not-a-node")).toBe("ignored");

    let visited = 0;
    while (progress.phase !== "victory") {
      const available = availableRouteNodes(progress);
      expect(available.length).toBeGreaterThan(0);
      expect(selectRouteNode(progress, available[0]!.id)).toBe("selected");
      expect(currentRouteNode(progress)?.id).toBe(available[0]!.id);
      visited += 1;
      const result = completeCurrentRouteNode(progress);
      expect(result).not.toBe("ignored");
    }

    expect(visited).toBe(24);
    expect(progress.completedNodeIds).toHaveLength(24);
    expect(progress.actIndex).toBe(3);
    expect(progress.layerIndex).toBe(5);
    expect(progress.availableNodeIds).toEqual([]);
  });

  test("does not allow a second selection or completion outside encounter phase", () => {
    const progress = createFullGameRunProgress(1);
    const [first, second] = availableRouteNodes(progress);
    if (!first || !second) throw new Error("Expected two entry choices.");
    expect(completeCurrentRouteNode(progress)).toBe("ignored");
    expect(selectRouteNode(progress, first.id)).toBe("selected");
    expect(selectRouteNode(progress, second.id)).toBe("ignored");
    expect(completeCurrentRouteNode(progress)).toBe("layer-complete");
    expect(completeCurrentRouteNode(progress)).toBe("ignored");
  });

  test("is JSON-safe and deterministic", () => {
    const first = createFullGameRunProgress(42);
    const second = createFullGameRunProgress(42);
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
    expect(second).toEqual(first);
  });
});
