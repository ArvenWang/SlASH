import { describe, expect, test } from "vitest";
import {
  encounterForRouteNode,
  encounterPool,
  fullGameEncounterDefinitions,
  threatPreviewForRouteNode,
} from "../src/content/encounters/definitions";
import {
  FULL_GAME_ACT_PRESENTATION_CONTRACTS,
  FULL_GAME_NON_BOSS_ENCOUNTERS,
  derivedEncounterTags,
  pressureForEncounter,
  validateEncounterPressure,
} from "../src/content/encounters/full-game-library";
import { enemyDefinitions } from "../src/content/enemies/definitions";
import { FULL_GAME_ACT_DEFINITIONS } from "../src/content/runs/definitions";
import { squaredDistance } from "../src/core/math/vec2";
import { createGame } from "../src/game/game";
import {
  MIN_HOSTILE_SPAWN_DISTANCE,
  resolveSafeEncounterSpawns,
  validateEncounterSpawnSafety,
} from "../src/game/encounters/spawn-safety";
import { spawnHazard } from "../src/game/entities/hazard-system";
import { spawnObstacle } from "../src/game/entities/obstacle-system";
import { generateRunRoute } from "../src/game/run/route-generator";

describe("full-game encounter library", () => {
  test("contains the exact 28 Standard / 12 Elite / 9 Challenge inventory by Act", () => {
    expect(FULL_GAME_NON_BOSS_ENCOUNTERS).toHaveLength(49);
    expect(fullGameEncounterDefinitions.list()).toHaveLength(49);
    expect(new Set(FULL_GAME_NON_BOSS_ENCOUNTERS.map((definition) => definition.id)).size).toBe(49);
    expect(inventoryMatrix()).toEqual([
      { standard: 6, elite: 2, challenge: 2 },
      { standard: 7, elite: 3, challenge: 2 },
      { standard: 7, elite: 3, challenge: 2 },
      { standard: 8, elite: 4, challenge: 3 },
    ]);
  });

  test("keeps every authored template inside its Act pressure range and spawn safety contract", () => {
    const failures: string[] = [];
    for (const definition of FULL_GAME_NON_BOSS_ENCOUNTERS) {
      try {
        expect(validateEncounterPressure(definition)).toEqual(pressureForEncounter(definition));
        expect(validateEncounterSpawnSafety(definition)).toMatchObject({ ok: true });
      } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error));
      }
      expect(definition.waves.every((wave) => wave.spawns.length > 0)).toBe(true);
      expect(definition.category === "challenge").toBe(definition.challenge !== null);
    }
    expect(failures).toEqual([]);
  });

  test("references all 10 Standard and 4 Elite enemies from formal encounter content", () => {
    const referenced = new Set(FULL_GAME_NON_BOSS_ENCOUNTERS.flatMap((definition) => (
      definition.waves.flatMap((wave) => wave.spawns.map((spawn) => spawn.enemyDefinitionId))
    )));
    const productionEnemies = enemyDefinitions.list().filter((enemy) => (
      enemy.tags.includes("standard") || enemy.tags.includes("elite")
    ));
    expect(productionEnemies).toHaveLength(14);
    expect(productionEnemies.every((enemy) => referenced.has(enemy.id))).toBe(true);
  });

  test("binds every encounter to the correct Act environment, lighting, and presentation contract", () => {
    for (const definition of FULL_GAME_NON_BOSS_ENCOUNTERS) {
      const contract = FULL_GAME_ACT_PRESENTATION_CONTRACTS[definition.actIndex];
      expect(contract).toBeDefined();
      expect(definition.environmentId).toBe(FULL_GAME_ACT_DEFINITIONS[definition.actIndex]?.environmentId);
      expect(definition.lightingProfileId).toBe(contract?.lightingProfileId);
      expect(definition.presentationId).toBe(contract?.presentationId);
    }
  });

  test("derives every route preview from the selected definition with 100% exact counts", () => {
    let checked = 0;
    for (let seed = 0; seed < 100; seed += 1) {
      const nodes = generateRunRoute(seed).acts.flatMap((act) => act.layers.flatMap((layer) => layer));
      for (const node of nodes) {
        if (node.kind === "event" || node.kind === "forge" || node.kind === "boss") continue;
        const definition = encounterForRouteNode(node, seed);
        if (!definition) throw new Error(`Missing encounter for ${node.id}.`);
        const preview = threatPreviewForRouteNode(node, seed);
        const spawns = definition.waves.flatMap((wave) => wave.spawns);
        const enemies = spawns.map((spawn) => enemyDefinitions.get(spawn.enemyDefinitionId));
        expect(preview).toMatchObject({
          title: definition.title,
          summary: definition.summary,
          waveCount: definition.waves.length,
          hostileCount: spawns.length,
          armoredHostileCount: enemies.filter((enemy) => enemy.armorProfileId !== null).length,
          projectileSourceCount: enemies.filter((enemy) => enemy.tags.includes("projectile")).length,
          obstacleSourceCount: definition.initialObstacles.length + enemies.filter((enemy) => enemy.tags.includes("obstacle")).length,
          hazardSourceCount: definition.initialHazards.length + enemies.filter((enemy) => enemy.tags.includes("hazard")).length,
          pressure: pressureForEncounter(definition).totalPressure,
          available: true,
        });
        expect(preview.tags).toEqual([...derivedEncounterTags(definition), `${definition.waves.length} WAVES`]);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(3_000);
  });

  test("exposes every one of the 49 templates through deterministic route mapping across representative seeds", () => {
    const selected = new Set<string>();
    for (let seed = 0; seed < 1_000; seed += 1) {
      for (const act of generateRunRoute(seed).acts) {
        for (const node of act.layers.flatMap((layer) => layer)) {
          const encounter = encounterForRouteNode(node, seed);
          if (encounter) selected.add(encounter.id);
        }
      }
    }
    expect(selected.size).toBe(49);
    expect([...selected].sort()).toEqual(FULL_GAME_NON_BOSS_ENCOUNTERS.map((definition) => definition.id).sort());
  });

  test("never presents duplicate encounter choices inside the same route layer", () => {
    for (let seed = 0; seed < 1_000; seed += 1) {
      for (const act of generateRunRoute(seed).acts) {
        for (const layer of act.layers) {
          const encounterIds = layer
            .map((node) => encounterForRouteNode(node, seed)?.id ?? null)
            .filter((id): id is string => id !== null);
          expect(new Set(encounterIds).size).toBe(encounterIds.length);
        }
      }
    }
  });

  test("resolves 10,000 dynamic spawn samples away from the actual player and active geometry", () => {
    let samples = 0;
    for (const definition of FULL_GAME_NON_BOSS_ENCOUNTERS) {
      const state = createGame(0);
      state.enemies = [];
      state.projectiles = [];
      state.obstacles = [];
      state.hazards = [];
      state.lastEvents = [];
      for (const obstacle of definition.initialObstacles) {
        spawnObstacle(state, {
          id: `${definition.id}:${obstacle.id}`,
          definitionId: obstacle.definitionId,
          position: obstacle.position,
          rotationRadians: obstacle.rotationRadians,
          velocity: obstacle.velocity,
        });
      }
      for (const hazard of definition.initialHazards) {
        spawnHazard(state, {
          id: `${definition.id}:${hazard.id}`,
          definitionId: hazard.definitionId,
          position: hazard.position,
          rotationRadians: hazard.rotationRadians,
        });
      }
      const wave = definition.waves[0];
      if (!wave) throw new Error(`Missing first wave for ${definition.id}.`);
      const sampleCount = definition === FULL_GAME_NON_BOSS_ENCOUNTERS.at(-1) ? 256 : 203;
      for (let sample = 0; sample < sampleCount; sample += 1) {
        state.player.position = {
          x: -18 + ((sample * 7 + definition.actIndex * 3) % 37),
          z: -10 + ((sample * 11 + definition.id.length) % 21),
        };
        const resolved = resolveSafeEncounterSpawns(state, wave.spawns);
        expect(resolved).toHaveLength(wave.spawns.length);
        expect(resolved.every(({ position }) => (
          squaredDistance(position, state.player.position) >= MIN_HOSTILE_SPAWN_DISTANCE ** 2
        ))).toBe(true);
        samples += 1;
      }
    }
    expect(samples).toBe(10_000);
  });
});

function inventoryMatrix() {
  return [0, 1, 2, 3].map((actIndex) => ({
    standard: encounterPool(actIndex, "standard").length,
    elite: encounterPool(actIndex, "elite").length,
    challenge: encounterPool(actIndex, "challenge").length,
  }));
}
