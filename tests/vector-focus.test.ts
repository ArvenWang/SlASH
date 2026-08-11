import { describe, expect, test } from "vitest";
import { STRIKER_ENEMY_ID, enemyDefinitions } from "../src/content/enemies/definitions";
import type { EnemyState, GameState } from "../src/game/domain/types";
import {
  createGame,
  dispatchGameCommand,
  drainGameEvents,
  isPlayerInvulnerable,
  stepGame,
} from "../src/game/game";
import { FIXED_STEP_MS } from "../src/game/rules/constants";

function striker(id: string, x: number, z: number): EnemyState {
  const definition = enemyDefinitions.get(STRIKER_ENEMY_ID);
  return {
    id,
    definitionId: definition.id,
    position: { x, z },
    facing: { x: -1, z: 0 },
    radius: definition.radius,
    speed: 0,
    alive: true,
    state: "active",
    spawnedAtMs: 0,
    killedAtMs: null,
    armorParts: [],
    staggerRemainingMs: 0,
  };
}

function ultimateState(enemies: EnemyState[] = [striker("anchor", 18, 10)]): GameState {
  const state = createGame(0);
  state.player.position = { x: 0, z: 0 };
  state.player.ultimateEnergy = 100;
  state.enemies = enemies;
  state.combat.totalEnemies = enemies.length;
  state.combat.kills = 0;
  drainGameEvents(state);
  return state;
}

function commitPoints(state: GameState, points: Array<{ x: number; z: number }>): void {
  expect(dispatchGameCommand(state, { type: "start-ultimate" }).result).toBe("ultimate-planning-started");
  points.forEach((target, index) => {
    const result = dispatchGameCommand(state, { type: "add-ultimate-point", target }).result;
    expect(result).toBe(index === points.length - 1 ? "ultimate-executing" : "ultimate-point-added");
  });
}

function runUntilUltimateEnds(state: GameState, maximumTicks = 240): void {
  for (let tick = 0; tick < maximumTicks && (
    state.player.dash !== null || state.player.ultimateExecution !== null
  ); tick += 1) stepGame(state);
  expect(state.player.dash).toBeNull();
  expect(state.player.ultimateExecution).toBeNull();
}

describe("Vector Focus planning", () => {
  test("requires full energy and preserves it when cancelled", () => {
    const blocked = ultimateState();
    blocked.player.ultimateEnergy = 99;
    expect(dispatchGameCommand(blocked, { type: "start-ultimate" }).result).toBe("ignored");

    const state = ultimateState();
    expect(dispatchGameCommand(state, { type: "start-ultimate" }).result).toBe("ultimate-planning-started");
    expect(state.player.ultimatePlanning?.requiredPointCount).toBe(3);
    expect(state.player.ultimatePlanning?.durationMs).toBe(3_000);
    expect(state.player.ultimateEnergy).toBe(100);
    expect(dispatchGameCommand(state, { type: "add-ultimate-point", target: { x: 8, z: 0 } }).result).toBe("ultimate-point-added");
    expect(dispatchGameCommand(state, { type: "cancel-ultimate" }).result).toBe("ultimate-cancelled");
    expect(state.player.ultimateEnergy).toBe(100);
    expect(state.player.ultimatePlanning).toBeNull();
  });

  test("rejects zero-length points and times out without spending energy", () => {
    const state = ultimateState();
    dispatchGameCommand(state, { type: "start-ultimate" });
    expect(dispatchGameCommand(state, { type: "add-ultimate-point", target: { x: 0.2, z: 0 } }).result).toBe("ignored");
    const ticks = Math.ceil(3_000 / FIXED_STEP_MS);
    for (let tick = 0; tick < ticks; tick += 1) stepGame(state);
    expect(state.player.ultimatePlanning).toBeNull();
    expect(state.player.ultimateEnergy).toBe(100);
    expect(drainGameEvents(state).some((event) => event.type === "ultimate-planning-cancelled")).toBe(true);
  });

  test("slows enemy simulation to 0.12 while planning", () => {
    const enemy = striker("moving", 10, 0);
    enemy.speed = 1;
    const state = ultimateState([enemy]);
    dispatchGameCommand(state, { type: "start-ultimate" });
    for (let tick = 0; tick < 120; tick += 1) stepGame(state);
    expect(enemy.position.x).toBeCloseTo(9.88, 5);
    expect(state.player.position).toEqual({ x: 0, z: 0 });
    expect(isPlayerInvulnerable(state)).toBe(false);
  });

  test("uses four points and 3.75 seconds with the planning branch", () => {
    const state = ultimateState();
    state.run.selectedUpgrades = ["skill-additional-ultimate-slash-v1", "skill-tactical-window-v1"];
    dispatchGameCommand(state, { type: "start-ultimate" });
    expect(state.player.ultimatePlanning?.requiredPointCount).toBe(4);
    expect(state.player.ultimatePlanning?.durationMs).toBe(3_750);
  });
});

describe("Vector Focus execution", () => {
  test("spends energy only on final confirmation and executes three invulnerable segments in order", () => {
    const state = ultimateState();
    const points = [{ x: 8, z: 0 }, { x: 8, z: 8 }, { x: -8, z: 8 }];
    dispatchGameCommand(state, { type: "start-ultimate" });
    dispatchGameCommand(state, { type: "add-ultimate-point", target: points[0]! });
    dispatchGameCommand(state, { type: "add-ultimate-point", target: points[1]! });
    expect(state.player.ultimateEnergy).toBe(100);
    expect(dispatchGameCommand(state, { type: "add-ultimate-point", target: points[2]! }).result).toBe("ultimate-executing");
    expect(state.player.ultimateEnergy).toBe(0);
    expect(isPlayerInvulnerable(state)).toBe(true);
    runUntilUltimateEnds(state);
    expect(state.player.position.x).toBeCloseTo(-8);
    expect(state.player.position.z).toBeCloseTo(8);
    const events = drainGameEvents(state);
    expect(events.filter((event) => event.type === "ultimate-segment-started")).toHaveLength(3);
    expect(events.some((event) => event.type === "ultimate-ended")).toBe(true);
  });

  test("does not self-charge and only Residual Charge preserves 20 energy after three kills", () => {
    const enemies = [striker("line-1", 2, 0), striker("line-2", 4, 0), striker("line-3", 6, 0)];
    const state = ultimateState(enemies);
    state.run.selectedUpgrades = ["skill-residual-charge-v1"];
    commitPoints(state, [{ x: 8, z: 0 }, { x: 8, z: 6 }, { x: -8, z: 6 }]);
    runUntilUltimateEnds(state);
    expect(state.combat.kills).toBe(3);
    expect(state.player.ultimateEnergy).toBe(20);

    const noResidual = ultimateState([striker("line-a", 2, 0), striker("line-b", 4, 0), striker("line-c", 6, 0)]);
    commitPoints(noResidual, [{ x: 8, z: 0 }, { x: 8, z: 6 }, { x: -8, z: 6 }]);
    runUntilUltimateEnds(noResidual);
    expect(noResidual.player.ultimateEnergy).toBe(0);
  });

  test("triggers one internal Cross Cascade at the first strict intersection", () => {
    const crossTarget = striker("cross-target", 0, 2);
    const state = ultimateState([crossTarget, striker("anchor", 18, 10)]);
    state.player.position = { x: -8, z: -4 };
    state.run.selectedUpgrades = ["skill-cross-cascade-v1"];
    commitPoints(state, [{ x: 8, z: 4 }, { x: 8, z: -4 }, { x: -8, z: 4 }]);
    runUntilUltimateEnds(state);
    expect(crossTarget.alive).toBe(false);
    expect(drainGameEvents(state).filter((event) => event.type === "ultimate-cross-triggered")).toHaveLength(1);
  });

  test("schedules Vector Echo 0.4 seconds after the final segment without moving the player", () => {
    const echoTarget = striker("echo-target", 0, -8);
    const state = ultimateState([echoTarget]);
    state.run.selectedUpgrades = ["skill-vector-echo-v1"];
    commitPoints(state, [{ x: 8, z: 0 }, { x: 8, z: 8 }, { x: -8, z: 8 }]);
    runUntilUltimateEnds(state);
    const finalPosition = { ...state.player.position };
    expect(state.combat.scheduledSlashes).toHaveLength(1);
    echoTarget.position = { x: 0, z: 8 };
    const ticks = Math.ceil(400 / FIXED_STEP_MS);
    for (let tick = 0; tick < ticks; tick += 1) stepGame(state);
    expect(echoTarget.alive).toBe(false);
    expect(state.player.position).toEqual(finalPosition);
    expect(state.combat.scheduledSlashes).toHaveLength(0);
  });
});
