import { describe, expect, test } from "vitest";
import { BOSS_MAXIMUM_HP } from "../src/redesign/config";
import {
  createBossRegressionState,
  createGame,
  dispatch,
  forceBossCoreWindow,
  gameplayHash,
  resolveBossRegressionContact,
  step,
} from "../src/redesign/game";
import { CHARGE_THRESHOLD_MS } from "../src/redesign/public-constants";

function advanceTicks(state: ReturnType<typeof createGame>, count: number): void {
  for (let index = 0; index < count; index += 1) step(state);
}

function dash(state: ReturnType<typeof createGame>, target: { x: number; z: number }, charged = false): void {
  expect(dispatch(state, { type: "begin-primary", target })).toBe("charge-started");
  if (charged) advanceTicks(state, Math.ceil(CHARGE_THRESHOLD_MS / (1_000 / 120)));
  expect(dispatch(state, { type: "release-primary", target })).toBe("dash-started");
  for (let guard = 0; guard < 1_000 && state.player.action !== "ready"; guard += 1) step(state);
  expect(state.player.action).toBe("ready");
}

describe("Redesign V2.1 gameplay facts", () => {
  test("keeps ordinary enemies one-hit and splits the splitter into two real shards", () => {
    const state = createGame(17);
    expect(dispatch(state, { type: "start-run" })).toBe("run-started");
    step(state);
    const target = state.enemies[0];
    expect(target).toBeDefined();
    const beforeKills = state.run.totalKills;
    state.player.position = { x: target!.position.x + 7, z: target!.position.z };
    dash(state, { x: target!.position.x - 7, z: target!.position.z });
    expect(target!.alive).toBe(false);
    expect(state.run.totalKills).toBe(beforeKills + 1);

    state.enemies = [];
    state.pendingSpawns = [];
    state.run.encounterIndex = 4;
    state.phase = "combat";
    state.enemies.push({
      id: "splitter-test",
      archetype: "splitter",
      position: { x: 8, z: 0 },
      facing: { x: 1, z: 0 },
      radius: 1.05,
      alive: true,
      phase: "idle",
      phaseElapsedMs: 0,
      phaseDurationMs: 10_000,
      attackSequence: 0,
      lockedTarget: null,
      angularVelocity: 0.45,
      rotationRadians: 0,
      splitGeneration: 0,
      deathElapsedMs: 0,
      height: 0.64,
      verticalVelocity: 0,
      gravity: -24,
      supported: true,
      grounded: false,
    });
    state.player.position = { x: 0, z: 0 };
    dash(state, { x: 12, z: 0 });
    expect(state.enemies.find((enemy) => enemy.id === "splitter-test")?.alive).toBe(false);
    expect(state.enemies.filter((enemy) => enemy.archetype === "splitter-shard" && enemy.alive)).toHaveLength(2);
  });

  test("uses real vertical state for hovering, slam launch and falling outside support", () => {
    const state = createGame(23);
    dispatch(state, { type: "start-run" });
    step(state);
    state.player.height = 0.62;
    const initialHeight = state.player.height;
    advanceTicks(state, 120);
    expect(state.player.height).not.toBe(initialHeight);
    expect(state.player.supported).toBe(true);

    state.player.position = { x: 40, z: 0 };
    const beforeFall = state.player.height;
    advanceTicks(state, 60);
    expect(state.player.supported).toBe(false);
    expect(state.player.height).toBeLessThan(beforeFall);
    expect(state.player.verticalVelocity).toBeLessThan(0);
  });

  test("keeps facing aligned with the current pointer target across idle and dash recovery", () => {
    const state = createGame(9);
    dispatch(state, { type: "start-run" });
    dispatch(state, { type: "aim", target: { x: 20, z: -10 } });
    step(state);
    const expected = Math.atan2(20 - state.player.position.x, -10 - state.player.position.z);
    const actual = Math.atan2(state.player.facing.x, state.player.facing.z);
    expect(Math.abs(actual - expected)).toBeLessThan(0.001);
    dash(state, { x: 16, z: 0 });
    dispatch(state, { type: "aim", target: { x: -16, z: 12 } });
    step(state);
    expect(state.player.facing.x).toBeLessThan(0);
    expect(state.player.facing.z).toBeGreaterThan(0);
  });

  test("bosses reject one-hit kills and apply basic, charged and ultimate damage only in core windows", () => {
    for (const archetype of ["prism-hound", "cube-fortress", "singularity-crown"] as const) {
      const state = createBossRegressionState(archetype);
      const maximumHp = BOSS_MAXIMUM_HP[archetype];
      resolveBossRegressionContact(state, "charged");
      expect(state.boss?.currentHp).toBe(maximumHp);
      forceBossCoreWindow(state);
      resolveBossRegressionContact(state, "basic");
      expect(state.boss?.currentHp).toBe(maximumHp - 1);
      resolveBossRegressionContact(state, "charged");
      expect(state.boss?.currentHp).toBe(maximumHp - 3);
      resolveBossRegressionContact(state, "ultimate");
      expect(state.boss?.currentHp).toBe(maximumHp - 4);
      expect(state.boss?.actionPhase).not.toBe("defeated");
    }
  });

  test("fixes the cube-fortress empty-companion regression and wins at zero core hp", () => {
    const state = createBossRegressionState("cube-fortress");
    const boss = state.boss!;
    boss.parts = [];
    boss.currentHp = 1;
    boss.vulnerable = false;
    boss.actionPhase = "recovery";
    resolveBossRegressionContact(state, "basic");
    expect(boss.currentHp).toBe(0);
    expect(boss.actionPhase).toBe("defeated");

    const deadParts = createBossRegressionState("cube-fortress");
    deadParts.boss!.parts.forEach((part) => { part.alive = false; });
    deadParts.boss!.currentHp = 1;
    resolveBossRegressionContact(deadParts, "basic");
    expect(deadParts.boss!.actionPhase).toBe("defeated");
  });

  test("is deterministic across equivalent fixed-step execution", () => {
    const first = createGame(42);
    const second = createGame(42);
    dispatch(first, { type: "start-run" });
    dispatch(second, { type: "start-run" });
    dispatch(first, { type: "aim", target: { x: 20, z: 8 } });
    dispatch(second, { type: "aim", target: { x: 20, z: 8 } });
    advanceTicks(first, 240);
    advanceTicks(second, 240);
    expect(gameplayHash(first)).toBe(gameplayHash(second));
  });
});
