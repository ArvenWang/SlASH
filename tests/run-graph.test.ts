import { describe, expect, test } from "vitest";
import { FULL_GAME_RUN_DEFINITION } from "../src/content/runs/definitions";
import { generateRunRoute, validateRunRoute } from "../src/game/run/route-generator";

describe("full game deterministic route graph", () => {
  test("generates four acts with real branching, guaranteed rewards, and reachable bosses", () => {
    const graph = generateRunRoute(0x51a5_2026);
    const result = validateRunRoute(graph);

    expect(result).toEqual({
      ok: true,
      actCount: 4,
      nodeCount: 52,
      edgeCount: 88,
      guaranteedSkillRewards: 8,
      optionalEliteRewards: 8,
    });
    expect(FULL_GAME_RUN_DEFINITION.startingSkillPoints + result.guaranteedSkillRewards).toBe(10);
    expect(graph.acts.every((act) => act.layers.map((layer) => layer.length).join(",") === "2,3,2,3,2,1")).toBe(true);
    expect(graph.acts.every((act) => act.layers[2]?.some((node) => node.kind === "event"))).toBe(true);
    expect(graph.acts.every((act) => act.layers[1]?.filter((node) => node.kind === "elite").length === 1)).toBe(true);
    expect(graph.acts.every((act) => act.layers[3]?.filter((node) => node.kind === "elite").length === 1)).toBe(true);
  });

  test("repeats exactly for the same seed and changes authored choices across seeds", () => {
    const first = generateRunRoute(12345);
    const repeat = generateRunRoute(12345);
    const different = generateRunRoute(54321);

    expect(repeat).toEqual(first);
    expect(different).not.toEqual(first);
    expect(different.acts.map((act) => act.layers.map((layer) => layer.map((node) => node.kind)))).not.toEqual(
      first.acts.map((act) => act.layers.map((layer) => layer.map((node) => node.kind))),
    );
  });

  test("passes topology and reward invariants for 100 representative seeds", () => {
    const summaries = Array.from({ length: 100 }, (_, seed) => validateRunRoute(generateRunRoute(seed)));
    expect(summaries.every((summary) => (
      summary.actCount === 4 &&
      summary.nodeCount === 52 &&
      summary.guaranteedSkillRewards === 8 &&
      summary.optionalEliteRewards === 8
    ))).toBe(true);
  });

  test("keeps the final boss as a victory reward and earlier bosses as act clears", () => {
    const graph = generateRunRoute(77);
    expect(graph.acts.slice(0, -1).map((act) => act.layers.at(-1)?.[0]?.reward)).toEqual([
      "act-clear",
      "act-clear",
      "act-clear",
    ]);
    expect(graph.acts.at(-1)?.layers.at(-1)?.[0]?.reward).toBe("run-victory");
  });
});
