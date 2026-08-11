import { describe, expect, test } from "vitest";
import { enemyAttackProfiles } from "../src/content/enemies/attack-definitions";
import {
  ARCHITECT_ELITE_ID,
  CONDUCTOR_ENEMY_ID,
  FORTRESS_ELITE_ID,
  REDLINE_LANCER_ELITE_ID,
  STRIKER_ENEMY_ID,
  TWIN_GUNNER_ELITE_ID,
  enemyDefinitions,
} from "../src/content/enemies/definitions";
import { enemyPresentationRegistry } from "../src/presentation/registry";
import { createArmorPartStates } from "../src/game/combat/armor";
import type { EnemyState, GameEvent, GameState } from "../src/game/domain/types";
import {
  advanceEnemyAttacks,
  createEnemyTacticalState,
  isEnemyContactLethal,
} from "../src/game/enemies/enemy-attack-system";
import { createGame, drainGameEvents } from "../src/game/game";
import { FIXED_STEP_MS } from "../src/game/rules/constants";
import { enemyBehaviors, moveEnemiesWithBehaviors } from "../src/game/simulation/enemy-behavior";

const FORMAL_IDS = enemyDefinitions.list()
  .filter((definition) => definition.tags.includes("standard") || definition.tags.includes("elite"))
  .map((definition) => definition.id);

describe("complete enemy roster", () => {
  test("registers exactly 10 Standard and 4 Elite with attack, movement, armor, and presentation coverage", () => {
    const standard = enemyDefinitions.list().filter((definition) => definition.tags.includes("standard"));
    const elite = enemyDefinitions.list().filter((definition) => definition.tags.includes("elite"));
    expect(standard).toHaveLength(10);
    expect(elite).toHaveLength(4);
    expect(FORMAL_IDS).toHaveLength(14);
    for (const definition of [...standard, ...elite]) {
      expect(enemyAttackProfiles.has(definition.attackProfile)).toBe(true);
      expect(enemyBehaviors.has(definition.movementProfile)).toBe(true);
      expect(enemyPresentationRegistry.has(definition.id)).toBe(true);
      if (definition.tags.includes("elite")) expect(definition.energyReward).toBe(12);
      else expect(definition.energyReward).toBeGreaterThanOrEqual(4);
      const armor = createArmorPartStates(definition.armorProfileId);
      if (definition.armorProfileId) expect(armor.length).toBeGreaterThan(0);
      else expect(armor).toHaveLength(0);
    }
  });

  test.each(FORMAL_IDS)("runs %s through telegraph, active, and recovery with its real action", (definitionId) => {
    const state = isolatedEnemyState(definitionId);
    if (definitionId === CONDUCTOR_ENEMY_ID) addEnemy(state, STRIKER_ENEMY_ID, { x: 2, z: 1 }, "support-target");
    drainGameEvents(state);
    const events = advanceUntilFirstRecovery(state, definitionId);
    const phases = events
      .filter((event) => event.type === "enemy-attack-phase-changed" && event.enemyId === "subject")
      .map((event) => event.type === "enemy-attack-phase-changed" ? event.phase : "");
    expect(phases).toEqual(expect.arrayContaining(["telegraph", "active", "recovery"]));
    expect(phases.indexOf("telegraph")).toBeLessThan(phases.indexOf("active"));
    expect(phases.indexOf("active")).toBeLessThan(phases.indexOf("recovery"));

    const profile = enemyAttackProfiles.get(enemyDefinitions.get(definitionId).attackProfile);
    const telegraph = events.find((event) => event.type === "enemy-attack-phase-changed" && event.enemyId === "subject" && event.phase === "telegraph");
    expect(telegraph?.type).toBe("enemy-attack-phase-changed");
    if (telegraph?.type === "enemy-attack-phase-changed") {
      expect(telegraph.durationMs).toBeGreaterThanOrEqual(profile.minimumTelegraphMs);
      expect(telegraph.target).not.toBeNull();
    }
    if (profile.action === "projectile-volley") expect(state.projectiles.length).toBe(profile.volleyAnglesRadians.length);
    if (profile.action === "deploy-barrier") expect(state.obstacles.length).toBe(profile.deploymentCount);
    if (profile.action === "deploy-mine") expect(state.hazards).toHaveLength(1);
    if (profile.action === "blink-lunge") expect(events.some((event) => event.type === "enemy-blinked")).toBe(true);
    if (profile.action === "support-pulse") expect(events.some((event) => event.type === "enemy-support-pulse")).toBe(true);
  });

  test("keeps all telegraphs above hard minimums after a Conductor 20% buff", () => {
    for (const definitionId of FORMAL_IDS) {
      if (definitionId === CONDUCTOR_ENEMY_ID) continue;
      const state = isolatedEnemyState(definitionId);
      const subject = state.enemies[0]!;
      if (!subject.tactical) throw new Error("Missing tactical state.");
      subject.tactical.nextTelegraphMultiplier = 0.8;
      const events = advanceUntilFirstRecovery(state, definitionId);
      const profile = enemyAttackProfiles.get(enemyDefinitions.get(definitionId).attackProfile);
      const telegraph = events.find((event) => (
        event.type === "enemy-attack-phase-changed" && event.enemyId === "subject" && event.phase === "telegraph"
      ));
      expect(telegraph?.type).toBe("enemy-attack-phase-changed");
      if (telegraph?.type === "enemy-attack-phase-changed") {
        expect(telegraph.durationMs).toBeGreaterThanOrEqual(profile.minimumTelegraphMs);
      }
    }
  });

  test("caps simultaneous Lancer / Blink lethal telegraphs at three", () => {
    const state = isolatedEnemyState(REDLINE_LANCER_ELITE_ID);
    state.enemies = [];
    for (let index = 0; index < 5; index += 1) {
      const enemy = addEnemy(
        state,
        index % 2 === 0 ? REDLINE_LANCER_ELITE_ID : "enemy-blink-stalker-v1",
        { x: 7 + index * 0.3, z: -2 + index },
        `pressure-${index}`,
      );
      if (enemy.tactical) enemy.tactical.phaseDurationMs = 0;
    }
    advanceEnemyAttacks(state, FIXED_STEP_MS);
    expect(state.enemies.filter((enemy) => (
      enemy.tactical?.attackPhase === "telegraph" || enemy.tactical?.attackPhase === "active"
    ))).toHaveLength(3);
  });

  test("Conductor buff is consumed by one attack and never crosses the profile minimum", () => {
    const state = isolatedEnemyState("enemy-gunner-v1");
    const enemy = state.enemies[0]!;
    if (!enemy.tactical) throw new Error("Missing tactical state.");
    enemy.tactical.phaseDurationMs = 0;
    enemy.tactical.nextTelegraphMultiplier = 0.8;
    const first = advanceUntilEvent(state, (event) => (
      event.type === "enemy-attack-phase-changed" && event.enemyId === "subject" && event.phase === "telegraph"
    )).find((event) => event.type === "enemy-attack-phase-changed" && event.phase === "telegraph");
    expect(first?.type).toBe("enemy-attack-phase-changed");
    if (first?.type === "enemy-attack-phase-changed") expect(first.durationMs).toBe(500);
    expect(enemy.tactical.nextTelegraphMultiplier).toBe(1);
  });

  test("Redline Lancer performs two separately telegraphed charges and reacquires the second target", () => {
    const state = isolatedEnemyState(REDLINE_LANCER_ELITE_ID);
    drainGameEvents(state);
    const firstEvents = advanceUntilEvent(state, (event) => (
      event.type === "enemy-attack-phase-changed" && event.enemyId === "subject" && event.phase === "active"
    ));
    const firstActive = firstEvents.find((event) => event.type === "enemy-attack-phase-changed" && event.phase === "active");
    expect(firstActive?.type).toBe("enemy-attack-phase-changed");
    state.player.position = { x: -7, z: 4 };
    const secondEvents = advanceUntilEvent(state, (event) => (
      event.type === "enemy-attack-phase-changed" && event.enemyId === "subject" && event.phase === "telegraph" && event.attackSequence === 2
    ));
    const second = secondEvents.find((event) => event.type === "enemy-attack-phase-changed" && event.attackSequence === 2);
    expect(second?.type).toBe("enemy-attack-phase-changed");
    if (second?.type === "enemy-attack-phase-changed") {
      expect(second.durationMs).toBeGreaterThanOrEqual(500);
      expect(second.target).toEqual({ x: -7, z: 4 });
    }
  });

  test("Twin Gunner fires an 18-degree three-shot fan", () => {
    const state = isolatedEnemyState(TWIN_GUNNER_ELITE_ID);
    advanceUntilFirstRecovery(state, TWIN_GUNNER_ELITE_ID);
    expect(state.projectiles).toHaveLength(3);
    expect(angleBetween(state.projectiles[0]!.velocity, state.projectiles[1]!.velocity)).toBeCloseTo(18 * Math.PI / 180, 4);
    expect(angleBetween(state.projectiles[1]!.velocity, state.projectiles[2]!.velocity)).toBeCloseTo(18 * Math.PI / 180, 4);
  });

  test("Architect maintains two barriers and moves an existing one on the next cycle", () => {
    const state = isolatedEnemyState(ARCHITECT_ELITE_ID);
    advanceUntilFirstRecovery(state, ARCHITECT_ELITE_ID);
    expect(state.obstacles).toHaveLength(2);
    const firstVelocities = state.obstacles.map((obstacle) => ({ ...obstacle.velocity }));
    advanceUntilEvent(state, (event) => (
      event.type === "enemy-attack-phase-changed" && event.enemyId === "subject" && event.phase === "active" && event.attackSequence === 2
    ));
    expect(state.obstacles).toHaveLength(2);
    expect(state.obstacles.some((obstacle, index) => (
      obstacle.velocity.x !== firstVelocities[index]?.x || obstacle.velocity.z !== firstVelocities[index]?.z
    ))).toBe(true);
  });

  test("Fortress has four independent armor parts and cannot contact-kill outside Active", () => {
    const state = isolatedEnemyState(FORTRESS_ELITE_ID);
    const enemy = state.enemies[0]!;
    expect(enemy.armorParts.map((part) => part.id)).toEqual([
      "front-plate",
      "left-plate",
      "right-plate",
      "rear-plate",
    ]);
    expect(isEnemyContactLethal(enemy)).toBe(false);
    advanceUntilEvent(state, (event) => (
      event.type === "enemy-attack-phase-changed" && event.enemyId === "subject" && event.phase === "active"
    ));
    expect(isEnemyContactLethal(enemy)).toBe(true);
  });

  test("movement profiles produce bounded, deterministic positions", () => {
    for (const definitionId of FORMAL_IDS) {
      const first = isolatedEnemyState(definitionId);
      const second = isolatedEnemyState(definitionId);
      first.enemies[0]!.tactical!.phaseDurationMs = 10_000;
      second.enemies[0]!.tactical!.phaseDurationMs = 10_000;
      for (let tick = 0; tick < 240; tick += 1) {
        moveEnemiesWithBehaviors(first, FIXED_STEP_MS);
        moveEnemiesWithBehaviors(second, FIXED_STEP_MS);
      }
      expect(second.enemies[0]!.position).toEqual(first.enemies[0]!.position);
      expect(first.enemies[0]!.position.x).toBeGreaterThanOrEqual(first.stage.arena.minX);
      expect(first.enemies[0]!.position.x).toBeLessThanOrEqual(first.stage.arena.maxX);
      expect(first.enemies[0]!.position.z).toBeGreaterThanOrEqual(first.stage.arena.minZ);
      expect(first.enemies[0]!.position.z).toBeLessThanOrEqual(first.stage.arena.maxZ);
    }
  });
});

function isolatedEnemyState(definitionId: string): GameState {
  const state = createGame(0);
  state.player.position = { x: 0, z: 0 };
  state.player.facing = { x: 1, z: 0 };
  state.enemies = [];
  state.projectiles = [];
  state.obstacles = [];
  state.hazards = [];
  const definition = enemyDefinitions.get(definitionId);
  const profile = enemyAttackProfiles.get(definition.attackProfile);
  const distance = Math.max(profile.minimumRange + 0.5, Math.min(profile.maximumRange - 0.5, preferredTestRange(profile.action)));
  addEnemy(state, definitionId, { x: distance, z: 0 }, "subject");
  state.combat.totalEnemies = state.enemies.length;
  drainGameEvents(state);
  return state;
}

function addEnemy(state: GameState, definitionId: string, position: { x: number; z: number }, id: string): EnemyState {
  const definition = enemyDefinitions.get(definitionId);
  const enemy: EnemyState = {
    id,
    definitionId,
    position: { ...position },
    facing: { x: -1, z: 0 },
    radius: definition.radius,
    speed: definition.baseMoveSpeed,
    alive: true,
    state: "active",
    spawnedAtMs: state.elapsedMs,
    killedAtMs: null,
    armorParts: createArmorPartStates(definition.armorProfileId),
    staggerRemainingMs: 0,
    tactical: createEnemyTacticalState(id, definition.attackProfile),
  };
  state.enemies.push(enemy);
  return enemy;
}

function advanceUntilFirstRecovery(state: GameState, definitionId: string): GameEvent[] {
  return advanceUntilEvent(state, (event) => (
    event.type === "enemy-attack-phase-changed" &&
    event.enemyId === "subject" &&
    event.phase === "recovery" &&
    enemyDefinitions.get(definitionId).attackProfile === event.attackProfileId
  ));
}

function advanceUntilEvent(state: GameState, predicate: (event: GameEvent) => boolean): GameEvent[] {
  const collected: GameEvent[] = [];
  for (let tick = 0; tick < 2_000; tick += 1) {
    state.tick += 1;
    state.run.tick += 1;
    state.elapsedMs += FIXED_STEP_MS;
    advanceEnemyAttacks(state, FIXED_STEP_MS);
    moveEnemiesWithBehaviors(state, FIXED_STEP_MS);
    const events = drainGameEvents(state);
    collected.push(...events);
    if (events.some(predicate)) return collected;
  }
  throw new Error(`Enemy attack lifecycle did not reach the expected event: ${JSON.stringify({
    subject: state.enemies.find((enemy) => enemy.id === "subject")?.tactical,
    position: state.enemies.find((enemy) => enemy.id === "subject")?.position,
    player: state.player.position,
    phases: collected.filter((event) => event.type === "enemy-attack-phase-changed" && event.enemyId === "subject").map((event) => (
      event.type === "enemy-attack-phase-changed" ? { phase: event.phase, attackSequence: event.attackSequence, target: event.target } : null
    )),
  })}`);
}

function preferredTestRange(action: string): number {
  if (action === "melee-lunge") return 3.5;
  if (action === "blink-lunge") return 9;
  if (action === "projectile-volley") return 10;
  if (action === "support-pulse") return 5;
  return 8;
}

function angleBetween(first: { x: number; z: number }, second: { x: number; z: number }): number {
  const firstLength = Math.hypot(first.x, first.z);
  const secondLength = Math.hypot(second.x, second.z);
  const cosine = (first.x * second.x + first.z * second.z) / (firstLength * secondLength);
  return Math.acos(Math.max(-1, Math.min(1, cosine)));
}
