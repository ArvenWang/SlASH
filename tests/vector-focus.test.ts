import { describe, expect, test } from "vitest";
import {
  createGame,
  dispatchGameCommand,
  drainGameEvents,
  getPlayerAction,
  getVectorFocusEnergy,
  isVectorFocusReady,
  queueDash,
  setVectorFocusEnergy,
  stepGame,
  type GameState,
} from "../src/game/game";
import { gameplayStateHash } from "../src/game/replay/replay";

function keepOnly(state: GameState, positions: Array<{ x: number; z: number }>): void {
  state.enemies.forEach((enemy, index) => {
    const position = positions[index];
    enemy.alive = Boolean(position);
    enemy.state = position ? "active" : "dead";
    enemy.killedAtMs = position ? null : 0;
    enemy.speed = 0;
    if (position) enemy.position = { ...position };
  });
  state.combat.kills = state.combat.totalEnemies - positions.length;
}

function runUntil(state: GameState, done: () => boolean, maximumTicks = 240): void {
  for (let tick = 0; tick < maximumTicks && !done(); tick += 1) stepGame(state);
  expect(done()).toBe(true);
}

describe("Vector Focus ability", () => {
  test("ignores activation until the resource is full", () => {
    const state = createGame(0);
    expect(dispatchGameCommand(state, { type: "activate-ability", slot: "ultimate" }).result).toBe("ignored");
    expect(state.player.activeAbility).toBeNull();
  });

  test.each([
    [1, 14],
    [2, 32],
    [3, 54],
    [4, 80],
    [5, 100],
  ])("grants %i-kill Dash Slash energy as %i", (killCount, expectedEnergy) => {
    const state = createGame(0);
    keepOnly(state, Array.from({ length: killCount }, (_, index) => ({ x: 2 + index * 1.25, z: 0 })));
    drainGameEvents(state);
    expect(queueDash(state, { x: 10, z: 0 })).toBe("started");
    runUntil(state, () => state.player.dash === null);
    expect(getVectorFocusEnergy(state)).toBe(expectedEnergy);
  });

  test("selects three points, consumes once, and executes a non-refilling route", () => {
    const state = createGame(0);
    keepOnly(state, [{ x: 2.5, z: 0 }, { x: 5, z: 2.5 }, { x: 0, z: 5 }]);
    setVectorFocusEnergy(state, 100);
    drainGameEvents(state);

    expect(isVectorFocusReady(state)).toBe(true);
    expect(dispatchGameCommand(state, { type: "activate-ability", slot: "ultimate" }).result).toBe("started");
    expect(getPlayerAction(state)).toBe("targeting");
    expect(dispatchGameCommand(state, { type: "submit-ability-target", target: { x: 5, z: 0 } }).result).toBe("target-added");
    expect(dispatchGameCommand(state, { type: "submit-ability-target", target: { x: 5, z: 5 } }).result).toBe("target-added");
    expect(dispatchGameCommand(state, { type: "submit-ability-target", target: { x: -5, z: 5 } }).result).toBe("triggered");
    expect(getVectorFocusEnergy(state)).toBe(0);
    expect(getPlayerAction(state)).toBe("route-dashing");

    runUntil(state, () => state.player.activeAbility === null && state.player.dash === null);
    expect(state.enemies.slice(0, 3).every((enemy) => !enemy.alive)).toBe(true);
    expect(getVectorFocusEnergy(state)).toBe(0);
    const eventTypes = drainGameEvents(state).map((event) => event.type);
    expect(eventTypes).toContain("ability-route-started");
    expect(eventTypes).toContain("ability-route-ended");
  });

  test("keeps target selection vulnerable and slows enemy motion without slowing its timer", () => {
    const state = createGame(0);
    keepOnly(state, [{ x: 4, z: 0 }]);
    const enemy = state.enemies[0]!;
    enemy.speed = 12;
    setVectorFocusEnergy(state, 100);
    dispatchGameCommand(state, { type: "activate-ability", slot: "ultimate" });
    const startX = enemy.position.x;
    stepGame(state);
    expect(startX - enemy.position.x).toBeCloseTo(12 * (1 / 120) * 0.12, 6);
    expect(state.player.activeAbility?.phase).toBe("target-selection");
    if (state.player.activeAbility?.phase !== "target-selection") throw new Error("Expected selection.");
    expect(state.player.activeAbility.elapsedMs).toBeCloseTo(1000 / 120, 6);

    enemy.position = { ...state.player.position };
    stepGame(state);
    expect(state.stage.phase).toBe("dead");
    expect(state.player.activeAbility).toBeNull();
    expect(drainGameEvents(state).some((event) => event.type === "ability-cancelled" && event.reason === "death")).toBe(true);
  });

  test("produces the same route result and hash from identical command streams", () => {
    function execute(): string {
      const state = createGame(0);
      keepOnly(state, [{ x: 2.5, z: 0 }, { x: 5, z: 2.5 }, { x: 0, z: 5 }]);
      setVectorFocusEnergy(state, 100);
      dispatchGameCommand(state, { type: "activate-ability", slot: "ultimate" });
      for (const target of [{ x: 5, z: 0 }, { x: 5, z: 5 }, { x: -5, z: 5 }]) {
        dispatchGameCommand(state, { type: "submit-ability-target", target });
      }
      runUntil(state, () => state.player.activeAbility === null && state.player.dash === null);
      return gameplayStateHash(state);
    }
    expect(execute()).toBe(execute());
  });
});
