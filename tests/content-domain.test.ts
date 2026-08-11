import { describe, expect, test } from "vitest";
import { enemyDefinitions, PHASE_ONE_GRUNT_ID } from "../src/content/enemies/definitions";
import { LEVEL_DEFINITIONS } from "../src/content/levels/definitions";
import { DefinitionRegistry } from "../src/content/registry";
import { createGame } from "../src/game/game";
import { moveEnemiesWithBehaviors } from "../src/game/simulation/enemy-behavior";

describe("Phase 2A content and gameplay domain", () => {
  test("creates a serializable V2 state without speculative entities", () => {
    const state = createGame(0);
    expect(state.version).toBe(2);
    expect(state.stage.levelId).toBe("stage-01-arrival");
    expect(state.stage.encounterId).toBe("encounter-arrival-v1");
    expect(state.run.selectedUpgrades).toEqual([]);
    expect(state.projectiles).toEqual([]);
    expect(state.obstacles).toEqual([]);
    expect(state.hazards).toEqual([]);
    expect(state.enemies.every((enemy) => enemy.definitionId === PHASE_ONE_GRUNT_ID)).toBe(true);
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });

  test("maps all authored levels through immediate encounters", () => {
    expect(LEVEL_DEFINITIONS.map((level) => ({
      id: level.id,
      count: level.encounters.flatMap((encounter) => encounter.waves.flatMap((wave) => wave.spawns)).length,
      speed: level.encounters[0]?.enemyMoveSpeed,
    }))).toEqual([
      { id: "stage-01-arrival", count: 8, speed: 2.75 },
      { id: "stage-02-compression", count: 12, speed: 3.15 },
      { id: "stage-03-redline", count: 18, speed: 3.55 },
    ]);
  });

  test("runs the migrated DirectChase behavior through its registry", () => {
    const state = createGame(0);
    state.enemies.forEach((enemy, index) => {
      enemy.alive = index === 0;
      enemy.state = index === 0 ? "active" : "dead";
    });
    const enemy = state.enemies[0];
    if (!enemy) throw new Error("Expected Phase 1 enemy.");
    enemy.position = { x: 10, z: 0 };
    enemy.speed = 2.75;

    moveEnemiesWithBehaviors(state, 1000);

    expect(enemy.position).toEqual({ x: 7.25, z: 0 });
    expect(enemy.facing).toEqual({ x: -1, z: 0 });
    expect(enemyDefinitions.get(enemy.definitionId).movementProfile).toBe("direct-chase");
  });

  test("rejects duplicate and unknown definition ids", () => {
    const registry = new DefinitionRegistry([{ id: "first", value: 1 }]);
    expect(() => registry.register({ id: "first", value: 2 })).toThrow(/Duplicate definition id/);
    expect(() => registry.get("missing")).toThrow(/Unknown definition id/);
  });
});
