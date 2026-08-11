import { describe, expect, test } from "vitest";
import { createGameRuntime } from "../src/runtime/game-runtime";

describe("game runtime boundary", () => {
  test("keeps one stable state reference while loading authored stages", () => {
    const runtime = createGameRuntime(0);
    const retainedReference = runtime.state;
    runtime.loadStage(2);
    expect(runtime.state).toBe(retainedReference);
    expect(runtime.state.stage.index).toBe(2);
    expect(runtime.state.enemies).toHaveLength(18);
  });

  test("advances gameplay and returns only explicitly drained events", () => {
    const runtime = createGameRuntime(0);
    runtime.drainEvents();
    const dispatch = runtime.dispatch({
      type: "activate-ability",
      slot: "primary",
      target: { x: 19, z: 0 },
    });
    expect(dispatch.result).toBe("started");
    expect(runtime.drainEvents().map((event) => event.type)).toEqual(["dash-started"]);
    const events = runtime.advance(1000 / 120);
    expect(runtime.state.run.tick).toBe(1);
    expect(events.every((event) => event.tick >= 1)).toBe(true);
  });

  test("freezes enemy locomotion without pausing the player timeline", () => {
    const runtime = createGameRuntime(0);
    runtime.drainEvents();
    const enemyStart = { ...runtime.state.enemies[0]!.position };
    runtime.dispatch({ type: "activate-ability", slot: "primary", target: { x: 19, z: 0 } });
    runtime.drainEvents();
    runtime.advance(1000 / 30, false);
    expect(runtime.state.enemies[0]!.position).toEqual(enemyStart);
    expect(runtime.state.player.position.x).toBeGreaterThan(0);
  });
});
