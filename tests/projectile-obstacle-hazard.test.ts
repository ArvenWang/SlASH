import { describe, expect, test } from "vitest";
import {
  ARC_RAIL_HAZARD_ID,
  ARMED_MINE_HAZARD_ID,
  DEPLOYABLE_BARRIER_OBSTACLE_ID,
  RAIL_GATE_OBSTACLE_ID,
  SNIPER_ROUND_PROJECTILE_ID,
  BOSS_SHARD_PROJECTILE_ID,
  STANDARD_ROUND_PROJECTILE_ID,
  STATIC_REFLECTOR_OBSTACLE_ID,
  hazardDefinitions,
  obstacleDefinitions,
  projectileDefinitions,
} from "../src/content/entities/definitions";
import { STRIKER_ENEMY_ID, enemyDefinitions } from "../src/content/enemies/definitions";
import type { EnemyState, GameState } from "../src/game/domain/types";
import { advanceHazards, spawnHazard } from "../src/game/entities/hazard-system";
import { advanceObstacles, spawnObstacle } from "../src/game/entities/obstacle-system";
import { advanceProjectiles, spawnProjectile } from "../src/game/entities/projectile-system";
import {
  createGame,
  advanceGame,
  dispatchGameCommand,
  drainGameEvents,
  getPlayerAction,
  getGameSnapshot,
  queueDash,
  stepGame,
} from "../src/game/game";
import { gameplayStateHash } from "../src/game/replay/replay";
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

function isolatedState(source = striker("source", 18, 10)): GameState {
  const state = createGame(0);
  state.player.position = { x: -8, z: 0 };
  state.player.facing = { x: 1, z: 0 };
  state.enemies = [source];
  state.combat.totalEnemies = 1;
  state.combat.kills = 0;
  state.projectiles = [];
  state.obstacles = [];
  state.hazards = [];
  drainGameEvents(state);
  return state;
}

function runTicks(state: GameState, count: number): void {
  for (let index = 0; index < count && state.stage.phase === "playing"; index += 1) stepGame(state);
}

function runUntilDashEnds(state: GameState, maximumTicks = 240): void {
  for (let index = 0; index < maximumTicks && getPlayerAction(state) === "dashing"; index += 1) stepGame(state);
  expect(state.player.dash).toBeNull();
}

describe("P4 production entity definitions", () => {
  test("registers the complete 3 / 4 / 2 content families with stable rules", () => {
    expect(projectileDefinitions.list()).toHaveLength(3);
    expect(obstacleDefinitions.list()).toHaveLength(4);
    expect(hazardDefinitions.list()).toHaveLength(2);
    expect(projectileDefinitions.get(STANDARD_ROUND_PROJECTILE_ID).tags).toContain("returnable");
    expect(projectileDefinitions.get(SNIPER_ROUND_PROJECTILE_ID).tags).toContain("not-returnable");
    expect(obstacleDefinitions.get(DEPLOYABLE_BARRIER_OBSTACLE_ID).activationDelayMs).toBe(900);
    expect(obstacleDefinitions.get(DEPLOYABLE_BARRIER_OBSTACLE_ID).lifetimeMs).toBe(7_000);
    expect(hazardDefinitions.get(ARMED_MINE_HAZARD_ID).triggerDelayMs).toBe(550);
    expect(hazardDefinitions.get(ARC_RAIL_HAZARD_ID).activeMs).toBe(600);
  });

  test("rejects entity spawns above the 32 / 8 / 8 pressure caps", () => {
    const state = isolatedState();
    for (let index = 0; index < 40; index += 1) {
      spawnProjectile(state, {
        id: `cap-projectile-${index}`,
        definitionId: STANDARD_ROUND_PROJECTILE_ID,
        position: { x: 0, z: 8 },
        direction: { x: 1, z: 0 },
        sourceId: "source",
      });
      spawnObstacle(state, {
        id: `cap-obstacle-${index}`,
        definitionId: STATIC_REFLECTOR_OBSTACLE_ID,
        position: { x: 0, z: 8 },
      });
      spawnHazard(state, {
        id: `cap-hazard-${index}`,
        definitionId: ARMED_MINE_HAZARD_ID,
        position: { x: 0, z: 8 },
      });
    }
    expect(state.projectiles).toHaveLength(32);
    expect(state.obstacles).toHaveLength(8);
    expect(state.hazards).toHaveLength(8);
  });

  test("survives JSON roundtrip with identical snapshot and replay hash", () => {
    const state = isolatedState();
    spawnProjectile(state, {
      id: "roundtrip-projectile",
      definitionId: STANDARD_ROUND_PROJECTILE_ID,
      position: { x: 0, z: 8 },
      direction: { x: 1, z: 0 },
      sourceId: "source",
    });
    spawnObstacle(state, {
      id: "roundtrip-obstacle",
      definitionId: DEPLOYABLE_BARRIER_OBSTACLE_ID,
      position: { x: 2, z: 6 },
    });
    spawnHazard(state, {
      id: "roundtrip-hazard",
      definitionId: ARMED_MINE_HAZARD_ID,
      position: { x: -2, z: 6 },
    });
    const restored = JSON.parse(JSON.stringify(state)) as GameState;
    expect(getGameSnapshot(restored)).toEqual(getGameSnapshot(state));
    expect(gameplayStateHash(restored)).toBe(gameplayStateHash(state));
  });
});

describe("projectile lifecycle and slash interaction", () => {
  test.each([
    STANDARD_ROUND_PROJECTILE_ID,
    SNIPER_ROUND_PROJECTILE_ID,
    BOSS_SHARD_PROJECTILE_ID,
  ])("%s honors its authored lifetime", (definitionId) => {
    const state = isolatedState();
    const projectile = spawnProjectile(state, {
      id: `lifetime-${definitionId}`,
      definitionId,
      position: { x: 0, z: 8 },
      direction: { x: 1, z: 0 },
      sourceId: "source",
    });
    if (!projectile) throw new Error("Expected projectile.");
    projectile.velocity = { x: 0, z: 0 };
    const lifetime = projectileDefinitions.get(definitionId).lifetimeMs;
    advanceProjectiles(state, lifetime - 1);
    expect(state.projectiles).toHaveLength(1);
    advanceProjectiles(state, 1);
    expect(state.projectiles).toHaveLength(0);
  });

  test("hostile projectile uses swept contact and kills a non-dashing player", () => {
    const state = isolatedState(striker("gunner", 4, 0));
    state.player.position = { x: 0, z: 0 };
    spawnProjectile(state, {
      id: "round-01",
      definitionId: STANDARD_ROUND_PROJECTILE_ID,
      position: { x: 2, z: 0 },
      direction: { x: -1, z: 0 },
      sourceId: "gunner",
    });
    runTicks(state, 30);
    expect(state.player.hp).toBe(0);
    expect(state.stage.phase).toBe("dead");
  });

  test("every Dash cancels slashable rounds without needing an upgrade", () => {
    const state = isolatedState();
    spawnProjectile(state, {
      id: "round-cut",
      definitionId: SNIPER_ROUND_PROJECTILE_ID,
      position: { x: 0, z: 0 },
      direction: { x: -1, z: 0 },
      sourceId: "source",
    });
    queueDash(state, { x: 10, z: 0 });
    runUntilDashEnds(state);
    expect(state.player.hp).toBe(1);
    expect(state.projectiles).toHaveLength(0);
    expect(drainGameEvents(state).some((event) => event.type === "projectile-destroyed")).toBe(true);
  });

  test("Projectile Reversal returns a standard round to its actual source and kills it", () => {
    const source = striker("gunner", 14, 0);
    const state = isolatedState(source);
    state.run.selectedUpgrades = ["skill-projectile-reversal-v1"];
    spawnProjectile(state, {
      id: "round-return",
      definitionId: STANDARD_ROUND_PROJECTILE_ID,
      position: { x: 0, z: 0 },
      direction: { x: -1, z: 0 },
      sourceId: source.id,
    });
    queueDash(state, { x: 8, z: 0 });
    runTicks(state, 180);
    expect(source.alive).toBe(false);
    const events = drainGameEvents(state);
    expect(events.some((event) => event.type === "projectile-reflected")).toBe(true);
    expect(events.some((event) => event.type === "enemy-killed" && event.attackId === "skill-projectile-reversal-v1")).toBe(true);
  });

  test("returns at most eight standard rounds and only destroys non-returnable sniper rounds", () => {
    const source = striker("gunner", 18, 8);
    const state = isolatedState(source);
    state.player.position = { x: -10, z: 0 };
    state.run.selectedUpgrades = ["skill-projectile-reversal-v1"];
    for (let index = 0; index < 9; index += 1) {
      spawnProjectile(state, {
        id: `round-${index}`,
        definitionId: STANDARD_ROUND_PROJECTILE_ID,
        position: { x: -2 + index * 0.5, z: 0 },
        direction: { x: 0, z: 1 },
        sourceId: source.id,
      });
    }
    spawnProjectile(state, {
      id: "sniper-no-return",
      definitionId: SNIPER_ROUND_PROJECTILE_ID,
      position: { x: -9.7, z: 0 },
      direction: { x: 0, z: 1 },
      sourceId: source.id,
    });
    queueDash(state, { x: 10, z: 0 });
    runUntilDashEnds(state);
    expect(state.projectiles.filter((projectile) => projectile.faction === "player")).toHaveLength(8);
    expect(state.projectiles.some((projectile) => projectile.id === "sniper-no-return")).toBe(false);
  });

  test("Projectile Return works only on Ultimate segments and never self-charges", () => {
    const source = striker("ultimate-gunner", 12, 0);
    const state = isolatedState(source);
    state.player.position = { x: 0, z: 0 };
    state.player.ultimateEnergy = 100;
    state.run.selectedUpgrades = ["skill-projectile-reversal-v1", "skill-projectile-return-v1"];
    spawnProjectile(state, {
      id: "ultimate-round",
      definitionId: STANDARD_ROUND_PROJECTILE_ID,
      position: { x: 4, z: 0 },
      direction: { x: 0, z: 1 },
      sourceId: source.id,
    });
    dispatchGameCommand(state, { type: "start-ultimate" });
    dispatchGameCommand(state, { type: "add-ultimate-point", target: { x: 8, z: 0 } });
    dispatchGameCommand(state, { type: "add-ultimate-point", target: { x: 8, z: 8 } });
    dispatchGameCommand(state, { type: "add-ultimate-point", target: { x: -8, z: 8 } });
    runTicks(state, 240);
    expect(source.alive).toBe(false);
    expect(state.player.ultimateEnergy).toBe(0);
    expect(drainGameEvents(state).some((event) => (
      event.type === "enemy-killed" && event.attackId === "skill-projectile-return-v1"
    ))).toBe(true);
  });

  test("Vector planning slows projectile and lifecycle world time to 0.12", () => {
    const state = isolatedState();
    state.player.ultimateEnergy = 100;
    const projectile = spawnProjectile(state, {
      id: "slow-round",
      definitionId: STANDARD_ROUND_PROJECTILE_ID,
      position: { x: 0, z: 8 },
      direction: { x: 1, z: 0 },
      sourceId: "source",
    });
    const barrier = spawnObstacle(state, {
      id: "slow-barrier",
      definitionId: DEPLOYABLE_BARRIER_OBSTACLE_ID,
      position: { x: 0, z: -8 },
    });
    const rail = spawnHazard(state, {
      id: "slow-rail",
      definitionId: ARC_RAIL_HAZARD_ID,
      position: { x: 0, z: -8 },
    });
    dispatchGameCommand(state, { type: "start-ultimate" });
    runTicks(state, 120);
    expect(projectile?.position.x).toBeCloseTo(1.32, 2);
    expect(barrier?.ageMs).toBeCloseTo(120, 2);
    expect(barrier?.active).toBe(false);
    expect(rail?.ageMs).toBeCloseTo(120, 2);
    expect(rail?.phase).toBe("telegraph");
  });

  test("expires at the arena boundary and carries source, direction and position in its event", () => {
    const state = isolatedState();
    const projectile = spawnProjectile(state, {
      id: "arena-round",
      definitionId: STANDARD_ROUND_PROJECTILE_ID,
      position: { x: state.stage.arena.maxX - 0.1, z: 8 },
      direction: { x: 1, z: 0 },
      sourceId: "source",
    });
    expect(projectile).not.toBeNull();
    runTicks(state, 5);
    expect(state.projectiles).toHaveLength(0);
    const event = drainGameEvents(state).find((candidate) => candidate.type === "projectile-destroyed");
    expect(event?.type).toBe("projectile-destroyed");
    if (!event || event.type !== "projectile-destroyed") throw new Error("Expected projectile-destroyed event.");
    expect(event.sourceId).toBe("source");
    expect(event.direction).toEqual({ x: 1, z: 0 });
    expect(event.position.x).toBeGreaterThan(state.stage.arena.maxX);
  });

  test("produces the same fixed-step entity state at 60 and 144Hz wrappers", () => {
    const createCadenceState = () => {
      const state = isolatedState();
      spawnProjectile(state, {
        id: "cadence-round",
        definitionId: STANDARD_ROUND_PROJECTILE_ID,
        position: { x: -10, z: 8 },
        direction: { x: 1, z: 0 },
        sourceId: "source",
      });
      drainGameEvents(state);
      return state;
    };
    const at60 = createCadenceState();
    const at144 = createCadenceState();
    advanceAtCadence(at60, 60, 1_000);
    advanceAtCadence(at144, 144, 1_000);
    expect(at60.tick).toBe(at144.tick);
    expect(at60.projectiles[0]?.position).toEqual(at144.projectiles[0]?.position);
    expect(gameplayStateHash(at60)).toBe(gameplayStateHash(at144));
  });
});

function advanceAtCadence(state: GameState, fps: number, durationMs: number): void {
  const frameMs = 1_000 / fps;
  let elapsed = 0;
  while (elapsed < durationMs - 1e-8) {
    const delta = Math.min(frameMs, durationMs - elapsed);
    advanceGame(state, delta);
    elapsed += delta;
  }
}

describe("obstacle collision and Refraction", () => {
  test("Basic Dash stops at an active obstacle and applies readable recoil", () => {
    const state = isolatedState();
    spawnObstacle(state, {
      id: "wall",
      definitionId: STATIC_REFLECTOR_OBSTACLE_ID,
      position: { x: 0, z: 0 },
    });
    queueDash(state, { x: 8, z: 0 });
    expect(state.player.dash?.pathSegments).toHaveLength(1);
    expect(state.player.dash?.pathSegments[0]?.terminalImpact?.obstacleId).toBe("wall");
    runUntilDashEnds(state);
    expect(state.player.position.x).toBeLessThan(-1.5);
    expect(drainGameEvents(state).some((event) => event.type === "dash-obstacle-impact")).toBe(true);
  });

  test("Refraction reflects once from the collision normal and continues remaining distance", () => {
    const state = isolatedState();
    state.player.position = { x: -8, z: -3 };
    state.run.selectedUpgrades = ["skill-refraction-v1"];
    spawnObstacle(state, {
      id: "reflector",
      definitionId: STATIC_REFLECTOR_OBSTACLE_ID,
      position: { x: 0, z: 0 },
    });
    queueDash(state, { x: 8, z: 3 });
    expect(state.player.dash?.pathSegments).toHaveLength(2);
    expect(state.player.dash?.pathSegments[0]?.reflectionAtEnd?.normal.x).toBeLessThan(-0.99);
    runUntilDashEnds(state);
    expect(state.player.position.x).toBeLessThan(-7);
    expect(state.player.position.z).toBeGreaterThan(2);
    expect(drainGameEvents(state).filter((event) => event.type === "dash-reflected")).toHaveLength(1);
  });

  test("Charged Dash obeys the same physical obstacle rule and cannot tunnel through", () => {
    const state = isolatedState();
    spawnObstacle(state, {
      id: "charged-wall",
      definitionId: STATIC_REFLECTOR_OBSTACLE_ID,
      position: { x: 0, z: 0 },
    });
    dispatchGameCommand(state, { type: "begin-charge", target: { x: 8, z: 0 } });
    runTicks(state, Math.ceil(650 / FIXED_STEP_MS));
    expect(dispatchGameCommand(state, { type: "release-charge", target: { x: 8, z: 0 } }).result).toBe("charged-released");
    runUntilDashEnds(state);
    expect(state.player.position.x).toBeLessThan(-1.5);
  });

  test("deployable barrier activates after 900ms, lasts 7s world time, and moving gate bounces inside arena", () => {
    const state = isolatedState();
    const barrier = spawnObstacle(state, {
      id: "barrier",
      definitionId: DEPLOYABLE_BARRIER_OBSTACLE_ID,
      position: { x: 0, z: 0 },
    });
    expect(barrier?.active).toBe(false);
    advanceObstacles(state, 899);
    expect(barrier?.active).toBe(false);
    advanceObstacles(state, 1);
    expect(barrier?.active).toBe(true);
    advanceObstacles(state, 6_999);
    expect(state.obstacles.some((obstacle) => obstacle.id === "barrier")).toBe(true);
    advanceObstacles(state, 1);
    expect(state.obstacles.some((obstacle) => obstacle.id === "barrier")).toBe(false);

    const gate = spawnObstacle(state, {
      id: "gate",
      definitionId: RAIL_GATE_OBSTACLE_ID,
      position: { x: state.stage.arena.maxX - 0.1, z: 0 },
      velocity: { x: 6, z: 0 },
    });
    advanceObstacles(state, 1_000);
    expect(gate?.position.x).toBeLessThanOrEqual(state.stage.arena.maxX);
    expect(gate?.velocity.x).toBeLessThan(0);
  });
});

describe("hazard lifecycle", () => {
  test("mine arms for 1s, waits 550ms after trigger, then becomes lethal", () => {
    const state = isolatedState();
    state.player.position = { x: -5, z: 0 };
    const mine = spawnHazard(state, {
      id: "mine",
      definitionId: ARMED_MINE_HAZARD_ID,
      position: { x: 0, z: 0 },
    });
    expect(mine?.phase).toBe("telegraph");
    expect(advanceHazards(state, 1_000)).toBeNull();
    expect(mine?.phase).toBe("armed");
    state.player.position = { x: 0, z: 0 };
    expect(advanceHazards(state, 1)).toBeNull();
    expect(mine?.phase).toBe("triggered");
    expect(advanceHazards(state, 549)).toBeNull();
    expect(advanceHazards(state, 1)).toBe("mine");
    expect(mine?.phase).toBe("active");
    advanceHazards(state, 120);
    expect(state.hazards).toHaveLength(0);
    expect(getGameSnapshot(state).hazards).toHaveLength(0);
  });

  test("active Arc Rail is lethal outside Dash and harmless during Dash transit", () => {
    const safeState = isolatedState();
    safeState.player.position = { x: -8, z: 0 };
    const safeRail = spawnHazard(safeState, {
      id: "rail-safe",
      definitionId: ARC_RAIL_HAZARD_ID,
      position: { x: 0, z: 0 },
    });
    queueDash(safeState, { x: 8, z: 0 });
    if (!safeRail) throw new Error("Expected rail hazard.");
    safeRail.phase = "active";
    safeRail.active = true;
    safeRail.phaseElapsedMs = 0;
    safeState.player.position = { x: 0, z: 0 };
    expect(advanceHazards(safeState, FIXED_STEP_MS)).toBeNull();

    const lethalState = isolatedState();
    lethalState.player.position = { x: 0, z: 0 };
    const lethalRail = spawnHazard(lethalState, {
      id: "rail-lethal",
      definitionId: ARC_RAIL_HAZARD_ID,
      position: { x: 0, z: 0 },
    });
    if (!lethalRail) throw new Error("Expected rail hazard.");
    lethalRail.phase = "active";
    lethalRail.active = true;
    lethalRail.phaseElapsedMs = 0;
    expect(advanceHazards(lethalState, FIXED_STEP_MS)).toBe("rail-lethal");
  });
});
