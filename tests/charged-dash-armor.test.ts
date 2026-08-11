import { describe, expect, test } from "vitest";
import {
  STRIKER_ENEMY_ID,
  VANGUARD_ENEMY_ID,
  enemyDefinitions,
} from "../src/content/enemies/definitions";
import { REAR_GUARD_ARMOR_PROFILE_ID } from "../src/content/enemies/armor-definitions";
import {
  CHARGE_TAP_MAX_MS,
  CHARGED_DASH_THRESHOLD_MS,
} from "../src/game/abilities/charged-dash";
import { createArmorPartStates, resolveArmorContact } from "../src/game/combat/armor";
import type { EnemyState, GameState } from "../src/game/domain/types";
import {
  createGame,
  dispatchGameCommand,
  drainGameEvents,
  queueDash,
  stepGame,
} from "../src/game/game";
import { DASH_HIT_RADIUS, FIXED_STEP_MS } from "../src/game/rules/constants";

function createVanguard(position = { x: 0, z: 0 }, facing = { x: -1, z: 0 }): EnemyState {
  const definition = enemyDefinitions.get(VANGUARD_ENEMY_ID);
  return {
    id: "vanguard-01",
    definitionId: definition.id,
    position: { ...position },
    facing: { ...facing },
    radius: definition.radius,
    speed: 0,
    alive: true,
    state: "active",
    spawnedAtMs: 0,
    killedAtMs: null,
    armorParts: createArmorPartStates(definition.armorProfileId),
    staggerRemainingMs: 0,
  };
}

function createStriker(id: string, position: { x: number; z: number }): EnemyState {
  const definition = enemyDefinitions.get(STRIKER_ENEMY_ID);
  return {
    id,
    definitionId: definition.id,
    position: { ...position },
    facing: { x: 0, z: -1 },
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

function armorScenario(
  playerPosition = { x: -8, z: 0 },
  enemies: EnemyState[] = [createVanguard()],
): GameState {
  const state = createGame(0);
  state.player.position = { ...playerPosition };
  state.player.facing = { x: playerPosition.x < 0 ? 1 : -1, z: 0 };
  state.enemies = enemies;
  state.combat.totalEnemies = enemies.length;
  state.combat.kills = 0;
  drainGameEvents(state);
  return state;
}

function holdTicks(state: GameState, tickCount: number): void {
  for (let tick = 0; tick < tickCount; tick += 1) stepGame(state);
}

function beginAndReleaseFullCharge(state: GameState, target: { x: number; z: number }) {
  expect(dispatchGameCommand(state, { type: "begin-charge", target }).result).toBe("charge-started");
  const requiredTicks = Math.ceil((state.player.charge?.thresholdMs ?? CHARGED_DASH_THRESHOLD_MS) / FIXED_STEP_MS);
  holdTicks(state, requiredTicks);
  return dispatchGameCommand(state, { type: "release-charge", target }).result;
}

function advanceUntilDashEnds(state: GameState): void {
  for (let tick = 0; tick < 120 && state.player.dash !== null; tick += 1) stepGame(state);
  expect(state.player.dash).toBeNull();
}

describe("Charged Dash input lifecycle", () => {
  test("treats a quick tap as Basic but cancels an intentional undercharge", () => {
    const tap = armorScenario();
    expect(dispatchGameCommand(tap, { type: "begin-charge", target: { x: 8, z: 0 } }).result).toBe("charge-started");
    expect(dispatchGameCommand(tap, { type: "release-charge", target: { x: 8, z: 0 } }).result).toBe("started");
    expect(tap.player.dash?.abilityId).toBe("dash-slash");

    const undercharge = armorScenario();
    dispatchGameCommand(undercharge, { type: "begin-charge", target: { x: 8, z: 0 } });
    holdTicks(undercharge, Math.ceil((CHARGE_TAP_MAX_MS + 20) / FIXED_STEP_MS));
    expect(dispatchGameCommand(undercharge, { type: "release-charge", target: { x: 8, z: 0 } }).result).toBe("charge-cancelled");
    expect(undercharge.player.dash).toBeNull();
    expect(undercharge.player.charge).toBeNull();
    expect(drainGameEvents(undercharge).some((event) => event.type === "charge-cancelled")).toBe(true);
  });

  test("is rooted and vulnerable while charging", () => {
    const enemy = createVanguard({ x: 0.9, z: 0 });
    enemy.armorParts = [];
    const state = armorScenario({ x: 0, z: 0 }, [enemy]);
    dispatchGameCommand(state, { type: "begin-charge", target: { x: 8, z: 0 } });
    stepGame(state);
    expect(state.player.position).toEqual({ x: 0, z: 0 });
    expect(state.player.hp).toBe(0);
    expect(state.player.charge).toBeNull();
  });

  test("applies Quick Ignition and bounded Adaptive Aim", () => {
    const state = armorScenario();
    state.run.selectedUpgrades = ["skill-adaptive-aim-v1", "skill-quick-ignition-v1"];
    dispatchGameCommand(state, { type: "begin-charge", target: { x: 8, z: 0 } });
    expect(state.player.charge?.thresholdMs).toBe(500);
    holdTicks(state, 30);
    dispatchGameCommand(state, { type: "update-charge-target", target: { x: -8, z: 8 } });
    const adjustment = state.player.charge?.totalAimAdjustmentRadians ?? 0;
    expect(adjustment).toBeGreaterThan(0);
    expect(adjustment).toBeLessThanOrEqual(Math.PI / 3 + 1e-8);
  });
});

describe("Armor Coverage resolution", () => {
  test("blocks Basic from the front without removing armor", () => {
    const state = armorScenario();
    queueDash(state, { x: 8, z: 0 });
    advanceUntilDashEnds(state);
    expect(state.enemies[0]?.alive).toBe(true);
    expect(state.enemies[0]?.armorParts[0]?.intact).toBe(true);
    expect(drainGameEvents(state).some((event) => event.type === "armor-blocked")).toBe(true);
  });

  test("strips front armor, pushes through, and never kills the same enemy on that contact", () => {
    const state = armorScenario();
    expect(beginAndReleaseFullCharge(state, { x: 8, z: 0 })).toBe("charged-released");
    advanceUntilDashEnds(state);
    const enemy = state.enemies[0]!;
    expect(enemy.alive).toBe(true);
    expect(enemy.armorParts[0]?.intact).toBe(false);
    expect(enemy.position.x).toBeGreaterThan(0);
    expect(state.player.position.x).toBeGreaterThan(enemy.position.x);
    expect(state.player.ultimateEnergy).toBe(4);
    expect(drainGameEvents(state).filter((event) => event.type === "armor-broken")).toHaveLength(1);
  });

  test("kills from an exposed rear while leaving unrelated front armor intact", () => {
    const state = armorScenario({ x: 8, z: 0 });
    const contact = resolveArmorContact(state.enemies[0]!, { x: 8, z: 0 }, { x: -8, z: 0 });
    expect(contact.contactRegion).toBe("rear");
    expect(contact.armorPart).toBeNull();
    expect(beginAndReleaseFullCharge(state, { x: -8, z: 0 })).toBe("charged-released");
    advanceUntilDashEnds(state);
    expect(state.enemies[0]?.alive).toBe(false);
    expect(state.enemies[0]?.armorParts[0]?.intact).toBe(true);
    expect(state.combat.kills).toBe(1);
  });

  test("treats a side outside the 140-degree front plate as exposed", () => {
    const enemy = createVanguard();
    const contact = resolveArmorContact(enemy, { x: 0, z: -8 }, { x: 0, z: 8 });
    expect(contact.contactRegion).toMatch(/left|right/);
    expect(contact.armorPart).toBeNull();
  });

  test("selects rear armor when a profile actually covers the rear", () => {
    const enemy = createVanguard();
    enemy.armorParts = createArmorPartStates(REAR_GUARD_ARMOR_PROFILE_ID);
    const contact = resolveArmorContact(enemy, { x: 8, z: 0 }, { x: -8, z: 0 }, REAR_GUARD_ARMOR_PROFILE_ID);
    expect(contact.contactRegion).toBe("rear");
    expect(contact.armorPart?.id).toBe("rear-plate");
  });

  test("allows a later Basic to kill through the area a prior Charged exposed", () => {
    const state = armorScenario();
    beginAndReleaseFullCharge(state, { x: 8, z: 0 });
    advanceUntilDashEnds(state);
    state.player.recoveryRemainingMs = 0;
    state.player.position = { x: -8, z: 0 };
    queueDash(state, { x: 8, z: 0 });
    advanceUntilDashEnds(state);
    expect(state.enemies[0]?.alive).toBe(false);
  });
});

describe("Charged passive branches", () => {
  test("turns a full 350ms Overdrive hold into a 40 percent wider Charged corridor", () => {
    const state = armorScenario();
    state.run.selectedUpgrades = ["skill-adaptive-aim-v1", "skill-quick-ignition-v1", "skill-overdrive-v1"];
    dispatchGameCommand(state, { type: "begin-charge", target: { x: 8, z: 0 } });
    holdTicks(state, Math.ceil((500 + 350) / FIXED_STEP_MS));
    expect(dispatchGameCommand(state, { type: "release-charge", target: { x: 8, z: 0 } }).result).toBe("charged-released");
    expect(state.player.dash?.baseHitRadius).toBeCloseTo(DASH_HIT_RADIUS * 1.4);
  });

  test("chains armor breaks without restricting the root ability", () => {
    const first = createVanguard({ x: -2, z: 0 });
    first.id = "vanguard-01";
    const second = createVanguard({ x: 2, z: 0 });
    second.id = "vanguard-02";
    const state = armorScenario({ x: -8, z: 0 }, [first, second]);
    state.run.selectedUpgrades = ["skill-breach-momentum-v1", "skill-chain-breach-v1"];
    beginAndReleaseFullCharge(state, { x: 8, z: 0 });
    for (let tick = 0; tick < 30 && state.enemies.some((enemy) => enemy.armorParts[0]?.intact); tick += 1) stepGame(state);
    expect(state.enemies.every((enemy) => enemy.alive && enemy.armorParts[0]?.intact === false)).toBe(true);
    expect(state.player.dash?.armorBreakCount).toBe(2);
    expect(state.player.dash?.recoveryMs).toBe(160);
    expect(state.player.dash?.hitRadius).toBeCloseTo((state.player.dash?.baseHitRadius ?? 0) * 1.3);
  });

  test("rear execution drives tempo, stores Predator Drive, and charges the Ultimate", () => {
    const state = armorScenario({ x: 8, z: 0 });
    state.run.selectedUpgrades = [
      "skill-execution-tempo-v1",
      "skill-predator-drive-v1",
      "skill-backline-battery-v1",
    ];
    beginAndReleaseFullCharge(state, { x: -8, z: 0 });
    for (let tick = 0; tick < 30 && state.enemies[0]?.alive; tick += 1) stepGame(state);
    expect(state.player.dash?.recoveryMs).toBe(state.rules.recoveryMs);
    expect(state.player.predatorDriveExpiresAtMs).not.toBeNull();
    expect(state.player.ultimateEnergy).toBe(23);
    expect(drainGameEvents(state).some((event) => event.type === "rear-execution")).toBe(true);
    advanceUntilDashEnds(state);

    state.stage.phase = "playing";
    state.player.recoveryRemainingMs = 0;
    state.player.hp = 1;
    expect(dispatchGameCommand(state, { type: "begin-charge", target: { x: 8, z: 0 } }).result).toBe("charge-started");
    expect(state.player.charge?.thresholdMs).toBeCloseTo(CHARGED_DASH_THRESHOLD_MS * 0.65);
    expect(state.player.predatorDriveExpiresAtMs).toBeNull();
  });

  test("launches Armor Shrapnel only at a nearby exposed standard enemy", () => {
    const source = createVanguard({ x: 0, z: 0 });
    const exposedTarget = createStriker("striker-side", { x: 0, z: 5 });
    const state = armorScenario({ x: -8, z: 0 }, [source, exposedTarget]);
    state.run.selectedUpgrades = [
      "skill-breach-momentum-v1",
      "skill-chain-breach-v1",
      "skill-armor-shrapnel-v1",
    ];
    beginAndReleaseFullCharge(state, { x: 8, z: 0 });
    for (let tick = 0; tick < 30 && source.armorParts[0]?.intact; tick += 1) stepGame(state);
    expect(source.alive).toBe(true);
    expect(source.armorParts[0]?.intact).toBe(false);
    expect(exposedTarget.alive).toBe(false);
    expect(state.combat.kills).toBe(1);

    const armoredTarget = createVanguard({ x: 0, z: 5 });
    armoredTarget.id = "vanguard-side";
    const blocked = armorScenario({ x: -8, z: 0 }, [createVanguard(), armoredTarget]);
    blocked.run.selectedUpgrades = [...state.run.selectedUpgrades];
    beginAndReleaseFullCharge(blocked, { x: 8, z: 0 });
    for (let tick = 0; tick < 30 && blocked.enemies[0]?.armorParts[0]?.intact; tick += 1) stepGame(blocked);
    expect(armoredTarget.alive).toBe(true);
    expect(armoredTarget.armorParts[0]?.intact).toBe(true);
  });
});
