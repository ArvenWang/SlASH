import { describe, expect, test } from "vitest";
import { VANGUARD_ENEMY_ID, STRIKER_ENEMY_ID, enemyDefinitions } from "../src/content/enemies/definitions";
import { STANDARD_ROUND_PROJECTILE_ID } from "../src/content/entities/definitions";
import type { EnemyState, GameState, Vec2 } from "../src/game/domain/types";
import { spawnObstacle } from "../src/game/entities/obstacle-system";
import { spawnProjectile } from "../src/game/entities/projectile-system";
import { STATIC_REFLECTOR_OBSTACLE_ID } from "../src/content/entities/definitions";
import {
  createGame,
  dispatchGameCommand,
  drainGameEvents,
  queueDash,
  stepGame,
} from "../src/game/game";
import { createArmorPartStates } from "../src/game/combat/armor";
import { CHARGED_DASH_THRESHOLD_MS } from "../src/game/abilities/charged-dash";
import { CURVE_MAX_TURN_RADIANS } from "../src/game/abilities/dash-slash";
import { FIXED_STEP_MS } from "../src/game/rules/constants";

function striker(id: string, position: Vec2): EnemyState {
  const definition = enemyDefinitions.get(STRIKER_ENEMY_ID);
  return {
    id,
    definitionId: definition.id,
    position: { ...position },
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

function vanguard(id: string, position: Vec2): EnemyState {
  const definition = enemyDefinitions.get(VANGUARD_ENEMY_ID);
  return {
    ...striker(id, position),
    definitionId: definition.id,
    radius: definition.radius,
    armorParts: createArmorPartStates(definition.armorProfileId),
  };
}

function stateWith(enemies: EnemyState[] = [striker("anchor", { x: 18, z: 10 })]): GameState {
  const state = createGame(0);
  state.player.position = { x: -8, z: 0 };
  state.player.facing = { x: 1, z: 0 };
  state.enemies = enemies;
  state.combat.totalEnemies = enemies.length;
  state.combat.kills = 0;
  state.projectiles = [];
  state.obstacles = [];
  state.hazards = [];
  state.combat.scheduledSlashes = [];
  state.combat.storedPath = null;
  state.combat.gravityPulls = [];
  drainGameEvents(state);
  return state;
}

function runUntilDashEnds(state: GameState, maximumTicks = 240): void {
  for (let index = 0; index < maximumTicks && state.player.dash !== null; index += 1) stepGame(state);
  expect(state.player.dash).toBeNull();
}

function runTicks(state: GameState, count: number): void {
  for (let index = 0; index < count && state.stage.phase === "playing"; index += 1) stepGame(state);
}

describe("Basic corridor, geometry and tempo passives", () => {
  test("Wide Slash and Rapid Dash affect only the Basic root values", () => {
    const state = stateWith();
    state.run.selectedUpgrades = ["skill-wide-slash-v1", "skill-rapid-dash-v1"];
    queueDash(state, { x: 12, z: 0 });
    expect(state.player.dash?.baseHitRadius).toBeCloseTo(0.45 * 1.3);
    expect(state.player.dash?.recoveryMs).toBeCloseTo(120 * 0.7);
    expect(state.player.dash?.pathSegments.at(-1)?.to.x).toBeCloseTo(5);
  });

  test("a quick drag creates a capped quadratic Basic path while Charged remains a hold", () => {
    const state = stateWith();
    state.player.position = { x: 0, z: 0 };
    state.run.selectedUpgrades = ["skill-curve-dash-v1"];
    expect(dispatchGameCommand(state, { type: "begin-charge", target: { x: 10, z: 0 } }).result).toBe("charge-started");
    dispatchGameCommand(state, { type: "update-charge-target", target: { x: 5, z: 8 } });
    expect(dispatchGameCommand(state, { type: "release-charge", target: { x: 5, z: 8 } }).result).toBe("started");
    const dash = state.player.dash;
    expect(dash?.abilityId).toBe("dash-slash");
    expect(dash?.pathSegments).toHaveLength(10);
    expect(dash?.pathSegments.at(-1)?.to.x).toBeCloseTo(10);
    expect(dash?.pathSegments.at(-1)?.to.z).toBeCloseTo(0);
    if (!dash) throw new Error("Expected curve dash.");
    const first = direction(dash.pathSegments[0]!.from, dash.pathSegments[0]!.to);
    const last = direction(dash.pathSegments.at(-1)!.from, dash.pathSegments.at(-1)!.to);
    expect(Math.acos(clamp(first.x * last.x + first.z * last.z, -1, 1))).toBeLessThanOrEqual(CURVE_MAX_TURN_RADIANS + 0.03);
    runUntilDashEnds(state);
    expect(state.player.position.x).toBeCloseTo(10);
    expect(state.player.position.z).toBeCloseTo(0);
  });

  test("Gravity Slash pulls only near misses over 0.35s and does no direct damage", () => {
    const nearMiss = striker("near-miss", { x: 0, z: 1.22 });
    const state = stateWith([nearMiss, striker("anchor", { x: 18, z: 10 })]);
    state.run.selectedUpgrades = ["skill-wide-slash-v1", "skill-gravity-slash-v1"];
    queueDash(state, { x: 8, z: 0 });
    runUntilDashEnds(state);
    expect(nearMiss.alive).toBe(true);
    expect(state.combat.gravityPulls).toHaveLength(1);
    runTicks(state, Math.ceil(350 / FIXED_STEP_MS));
    expect(nearMiss.position.z).toBeCloseTo(0.62, 2);
    expect(state.combat.gravityPulls).toHaveLength(0);
  });

  test("Prism Momentum widens the reflected leg and reduces Recovery for at most three kills", () => {
    const state = stateWith([striker("anchor", { x: 18, z: 10 })]);
    state.player.position = { x: -8, z: -3 };
    state.run.selectedUpgrades = ["skill-refraction-v1", "skill-prism-momentum-v1"];
    spawnObstacle(state, { id: "wall", definitionId: STATIC_REFLECTOR_OBSTACLE_ID, position: { x: 0, z: 0 } });
    queueDash(state, { x: 8, z: 3 });
    const second = state.player.dash?.pathSegments[1];
    if (!second) throw new Error("Expected reflected leg.");
    for (let index = 1; index <= 4; index += 1) {
      state.enemies.push(striker(`reflected-${index}`, interpolate(second.from, second.to, index / 5)));
    }
    state.combat.totalEnemies = state.enemies.length;
    for (let tick = 0; tick < 30 && (state.player.dash?.reflectionsUsed ?? 0) === 0; tick += 1) stepGame(state);
    expect(state.player.dash?.hitRadius).toBeCloseTo((state.player.dash?.baseHitRadius ?? 0) * 1.25);
    runUntilDashEnds(state);
    expect(state.enemies.filter((enemy) => enemy.id.startsWith("reflected-") && !enemy.alive)).toHaveLength(4);
    expect(state.player.recoveryRemainingMs).toBeLessThanOrEqual(80);
  });
});

describe("Path memory, Echo and endpoint passives", () => {
  test("Cross Execution supports deliberate 1.5m reverse overlap and Cross Purge uses real entities", () => {
    const victim = striker("cross-victim", { x: 6.5, z: 1.5 });
    const armored = vanguard("cross-armored", { x: 6.5, z: 2 });
    const state = stateWith([victim, armored, striker("anchor", { x: 18, z: 10 })]);
    state.run.selectedUpgrades = ["skill-cross-execution-v1", "skill-cross-purge-v1"];
    queueDash(state, { x: 8, z: 0 });
    runUntilDashEnds(state);
    expect(state.combat.storedPath?.segments).toHaveLength(1);
    state.player.recoveryRemainingMs = 0;
    spawnProjectile(state, {
      id: "cross-round",
      definitionId: STANDARD_ROUND_PROJECTILE_ID,
      position: { x: 6.5, z: -2 },
      direction: { x: 0, z: 1 },
      sourceId: armored.id,
    });
    queueDash(state, { x: -8, z: 0 });
    runUntilDashEnds(state);
    expect(victim.alive).toBe(false);
    expect(armored.alive).toBe(true);
    expect(armored.staggerRemainingMs).toBeGreaterThan(0);
    expect(state.projectiles).toHaveLength(0);
    expect(state.combat.storedPath).toBeNull();
    const cross = drainGameEvents(state).find((event) => event.type === "cross-execution-triggered");
    expect(cross?.type).toBe("cross-execution-triggered");
    if (!cross || cross.type !== "cross-execution-triggered") throw new Error("Expected Cross event.");
    expect(cross.position.x).toBeCloseTo(6.5, 1);
    expect(cross.killedCount).toBe(1);
    expect(cross.purgedProjectileCount).toBe(1);
    expect(cross.interruptedEnemyCount).toBe(1);
  });

  test("a non-crossing line replaces the only Stored Path and it expires after 2.5s world time", () => {
    const state = stateWith();
    state.run.selectedUpgrades = ["skill-cross-execution-v1"];
    queueDash(state, { x: 8, z: 0 });
    runUntilDashEnds(state);
    const firstId = state.combat.storedPath?.id;
    state.player.recoveryRemainingMs = 0;
    queueDash(state, { x: 8, z: 8 });
    runUntilDashEnds(state);
    expect(state.combat.storedPath?.id).not.toBe(firstId);
    expect(state.combat.storedPath?.segments.at(-1)?.to).toEqual({ x: 8, z: 8 });
    runTicks(state, Math.ceil(2_500 / FIXED_STEP_MS));
    expect(state.combat.storedPath).toBeNull();
  });

  test("Echo and Double Echo replay the actual path at 0.4s and 0.8s without moving the player", () => {
    const first = striker("echo-first", { x: 0, z: 5 });
    const second = striker("echo-second", { x: 2, z: 5 });
    const narrowMiss = striker("echo-narrow-miss", { x: -2, z: 5 });
    const state = stateWith([first, second, narrowMiss, striker("anchor", { x: 18, z: 10 })]);
    state.run.selectedUpgrades = ["skill-wide-slash-v1", "skill-echo-slash-v1", "skill-double-echo-v1"];
    queueDash(state, { x: 8, z: 0 });
    runUntilDashEnds(state);
    const endpoint = { ...state.player.position };
    first.position = { x: 0, z: 0 };
    runTicks(state, Math.ceil(400 / FIXED_STEP_MS));
    expect(first.alive).toBe(false);
    expect(second.alive).toBe(true);
    second.position = { x: 2, z: 0 };
    narrowMiss.position = { x: -2, z: 1.06 };
    runTicks(state, Math.ceil(400 / FIXED_STEP_MS));
    expect(second.alive).toBe(false);
    expect(narrowMiss.alive).toBe(true);
    expect(state.player.position).toEqual(endpoint);
    const attacks = drainGameEvents(state)
      .filter((event) => event.type === "enemy-killed")
      .map((event) => event.type === "enemy-killed" ? event.attackId : "");
    expect(attacks).toContain("skill-echo-slash-v1");
    expect(attacks).toContain("skill-double-echo-v1");
  });

  test("Impact Burst requires endpoint contact, kills nearby exposed enemies, and never breaks armor", () => {
    const endpoint = striker("endpoint", { x: 8, z: 0 });
    const nearby = striker("nearby", { x: 8, z: 1.6 });
    const armored = vanguard("burst-armored", { x: 8, z: -1.6 });
    const state = stateWith([endpoint, nearby, armored, striker("anchor", { x: 18, z: 10 })]);
    state.run.selectedUpgrades = ["skill-impact-burst-v1"];
    queueDash(state, { x: 8, z: 0 });
    runUntilDashEnds(state);
    expect(endpoint.alive).toBe(false);
    expect(nearby.alive).toBe(false);
    expect(armored.alive).toBe(true);
    expect(armored.armorParts.some((part) => part.intact)).toBe(true);
    expect(drainGameEvents(state).some((event) => event.type === "impact-burst-triggered")).toBe(true);
  });
});

describe("Shared Kill Momentum", () => {
  test("stores up to five direct path kills, consumes them on the next Basic, then rebuilds", () => {
    const victims = [-3, 0, 3].map((x, index) => striker(`momentum-${index}`, { x, z: 0 }));
    const state = stateWith([...victims, striker("anchor", { x: 18, z: 10 })]);
    state.run.selectedUpgrades = ["skill-kill-momentum-v1"];
    queueDash(state, { x: 8, z: 0 });
    runUntilDashEnds(state);
    expect(state.player.killMomentumStacks).toBe(3);
    state.player.recoveryRemainingMs = 0;
    queueDash(state, { x: 8, z: 8 });
    expect(state.player.dash?.killMomentumConsumedStacks).toBe(3);
    expect(state.player.dash?.recoveryMs).toBe(80);
    expect(state.player.killMomentumStacks).toBe(0);
    runUntilDashEnds(state);
    expect(state.player.killMomentumStacks).toBe(0);
  });

  test("also reduces Charged Recovery before Breach Momentum applies its own floor", () => {
    const state = stateWith();
    state.run.selectedUpgrades = ["skill-kill-momentum-v1"];
    state.player.killMomentumStacks = 2;
    dispatchGameCommand(state, { type: "begin-charge", target: { x: 8, z: 0 } });
    runTicks(state, Math.ceil(CHARGED_DASH_THRESHOLD_MS / FIXED_STEP_MS));
    dispatchGameCommand(state, { type: "release-charge", target: { x: 8, z: 0 } });
    expect(state.player.dash?.abilityId).toBe("charged-dash");
    expect(state.player.dash?.recoveryMs).toBe(250);
    expect(state.player.killMomentumStacks).toBe(0);
  });
});

function direction(from: Vec2, to: Vec2): Vec2 {
  const x = to.x - from.x;
  const z = to.z - from.z;
  const length = Math.hypot(x, z);
  return { x: x / length, z: z / length };
}

function interpolate(from: Vec2, to: Vec2, t: number): Vec2 {
  return { x: from.x + (to.x - from.x) * t, z: from.z + (to.z - from.z) * t };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
