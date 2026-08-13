import { describe, expect, test } from "vitest";
import { BOSS_MAXIMUM_HP } from "../src/redesign/config";
import {
  createBossRegressionState,
  createGame,
  currentWorldTimeScale,
  dispatch,
  forceBossCoreWindow,
  gameplayHash,
  previewUltimatePath,
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

    state.player.position = { x: 130, z: 0 };
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

  test("moves with normalized WASD input at walking speed without changing pointer facing", () => {
    const state = createGame(33);
    dispatch(state, { type: "start-run" });
    dispatch(state, { type: "aim", target: { x: -12, z: 20 } });
    const aimTarget = { ...state.player.aimTarget };
    expect(dispatch(state, { type: "set-movement", direction: { x: 1, z: 1 } })).toBe("movement-updated");
    advanceTicks(state, 60);
    expect(Math.hypot(state.player.position.x, state.player.position.z)).toBeGreaterThan(2);
    expect(Math.hypot(state.player.position.x, state.player.position.z)).toBeLessThan(3.3);
    const expectedFacing = Math.atan2(
      aimTarget.x - state.player.position.x,
      aimTarget.z - state.player.position.z,
    );
    expect(Math.atan2(state.player.facing.x, state.player.facing.z)).toBeCloseTo(expectedFacing, 6);
    expect(Math.hypot(state.player.moveVelocity.x, state.player.moveVelocity.z)).toBeLessThanOrEqual(6.41);
    dispatch(state, { type: "set-movement", direction: { x: 0, z: 0 } });
    advanceTicks(state, 1);
    expect(Math.hypot(state.player.moveVelocity.x, state.player.moveVelocity.z)).toBe(0);
  });

  test("grows charged preview and execution width from the same value", () => {
    const state = createGame(35);
    dispatch(state, { type: "start-run" });
    const target = { x: 18, z: 0 };
    dispatch(state, { type: "begin-primary", target });
    advanceTicks(state, Math.ceil(CHARGE_THRESHOLD_MS / (1_000 / 120)));
    expect(dispatch(state, { type: "release-primary", target })).toBe("dash-started");
    expect(state.player.dash?.kind).toBe("charged");
    expect(state.player.dash?.chargePower).toBe(1);
    expect(state.player.dash?.hitRadius).toBeCloseTo(0.95 * 1.65, 6);
  });

  test("uses faster dash travel and executes a three-point ultimate almost instantly", () => {
    const state = createGame(350);
    dispatch(state, { type: "start-run" });
    dispatch(state, { type: "begin-primary", target: { x: 40, z: 0 } });
    dispatch(state, { type: "release-primary", target: { x: 40, z: 0 } });
    expect(state.player.dash?.totalDurationMs).toBeLessThan(470);
    while (state.player.action !== "ready") step(state);
    state.player.ultimateEnergy = 100;
    expect(dispatch(state, { type: "start-ultimate" })).toBe("ultimate-started");
    expect(dispatch(state, { type: "add-ultimate-point", target: { x: 12, z: 0 } })).toBe("ultimate-point-added");
    expect(dispatch(state, { type: "add-ultimate-point", target: { x: -12, z: 0 } })).toBe("ultimate-point-added");
    expect(dispatch(state, { type: "add-ultimate-point", target: { x: 0, z: 12 } })).toBe("ultimate-executing");
    expect(state.player.dash?.kind).toBe("ultimate");
    expect(state.player.dash?.totalDurationMs).toBeLessThanOrEqual(120);
  });

  test("buffers a quick click during recovery and auto-dashes when recovery ends", () => {
    const state = createGame(351);
    dispatch(state, { type: "start-run" });
    dispatch(state, { type: "begin-primary", target: { x: 12, z: 0 } });
    dispatch(state, { type: "release-primary", target: { x: 12, z: 0 } });
    while (state.player.action === "dashing") step(state);
    expect(state.player.action).toBe("recovering");
    expect(dispatch(state, { type: "begin-primary", target: { x: -10, z: 5 } })).toBe("primary-buffered");
    expect(dispatch(state, { type: "release-primary", target: { x: -10, z: 5 } })).toBe("primary-buffer-released");
    expect(state.player.bufferedPrimary).toEqual({ target: { x: -10, z: 5 }, held: false });
    while (state.player.action === "recovering") step(state);
    expect(state.player.action).toBe("dashing");
    expect(state.player.dash?.kind).toBe("basic");
    expect(state.player.bufferedPrimary).toBeNull();
  });

  test("buffers a held press during recovery and starts charging at recovery end", () => {
    const state = createGame(352);
    dispatch(state, { type: "start-run" });
    dispatch(state, { type: "begin-primary", target: { x: 12, z: 0 } });
    dispatch(state, { type: "release-primary", target: { x: 12, z: 0 } });
    while (state.player.action === "dashing") step(state);
    expect(dispatch(state, { type: "begin-primary", target: { x: -8, z: 3 } })).toBe("primary-buffered");
    dispatch(state, { type: "aim", target: { x: -14, z: 7 } });
    while (state.player.action === "recovering") step(state);
    expect(state.player.action).toBe("charging");
    expect(state.player.chargeTarget).toEqual({ x: -14, z: 7 });
    advanceTicks(state, Math.ceil(CHARGE_THRESHOLD_MS / (1_000 / 120)));
    expect(dispatch(state, { type: "release-primary", target: { x: -14, z: 7 } })).toBe("dash-started");
    expect(state.player.dash?.kind).toBe("charged");
  });

  test("slows the combat world during ultimate planning and exposes the full planned route", () => {
    const state = createGame(36);
    dispatch(state, { type: "start-run" });
    state.player.ultimateEnergy = 100;
    advanceTicks(state, 1);
    const enemy = state.enemies[0]!;
    const enemyBefore = { ...enemy.position };
    const encounterBefore = state.run.encounterElapsedMs;
    expect(dispatch(state, { type: "start-ultimate" })).toBe("ultimate-started");
    expect(currentWorldTimeScale(state)).toBe(0.16);
    advanceTicks(state, 60);
    expect(state.run.encounterElapsedMs - encounterBefore).toBeCloseTo(80, 5);
    expect(Math.hypot(enemy.position.x - enemyBefore.x, enemy.position.z - enemyBefore.z)).toBeLessThan(1.5);
    expect(state.player.ultimatePlanningMs).toBeCloseTo(3_000, 5);
    dispatch(state, { type: "aim", target: { x: 8, z: -4 } });
    expect(previewUltimatePath(state).segments.length).toBeGreaterThan(0);
    expect(dispatch(state, { type: "add-ultimate-point", target: { x: 8, z: -4 } })).toBe("ultimate-point-added");
    dispatch(state, { type: "aim", target: { x: -7, z: 5 } });
    const planned = previewUltimatePath(state);
    expect(planned.confirmedSegmentCount).toBeGreaterThan(0);
    expect(planned.segments.length).toBeGreaterThan(planned.confirmedSegmentCount);
    expect(planned.hitRadius).toBeCloseTo(1.15, 8);
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
