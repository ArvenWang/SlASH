import { describe, expect, test } from "vitest";
import { createGame } from "../src/game/game";
import { registerDebugTestEnemy, DEBUG_STATIONARY_ENEMY } from "../src/debug/content/test-enemy";
import { enemyPresentationRegistry } from "../src/presentation/registry";
import { moveEnemiesWithBehaviors } from "../src/game/simulation/enemy-behavior";
import {
  environmentProfileRegistry,
  lightingProfileRegistry,
  materialProfileRegistry,
  postFxProfileRegistry,
  vfxProfileRegistry,
} from "../src/presentation/profiles/definitions";
import { createPerformanceBudgetSnapshot } from "../src/presentation/performance/budgets";

describe("presentation profiles", () => {
  test("preserves the current night/rain values behind typed profiles", () => {
    const environment = environmentProfileRegistry.get("transit-cathedral-v1");
    const lighting = lightingProfileRegistry.get(environment.lightingProfileId);
    const postFx = postFxProfileRegistry.get(environment.postFxProfileId);
    expect(environment).toMatchObject({ fogDensity: 0.0078, rainDensity: 1 });
    expect(lighting).toMatchObject({ exposure: 0.98, shadowMapSize: { high: 1536, compatibility: 1024 } });
    expect(postFx).toMatchObject({ bloomStrength: { high: 0.34, compatibility: 0.28 } });
    expect(vfxProfileRegistry.get("dash-slash-current-v1").priority).toBe("critical");
    expect(materialProfileRegistry.get("blood-wet-v1").colorToken).toBe("blood.primary");
  });

  test("reports visible frame timing without mislabelling it GPU time", () => {
    const state = createGame(0);
    const snapshot = createPerformanceBudgetSnapshot({
      gameState: state,
      diagnostics: {
        frame: { sampleCount: 1, averageFps: 60, averageMs: 16.67, p95Ms: 16.67, p99Ms: 16.67, worstMs: 16.67 },
        renderer: { calls: 1, triangles: 1, points: 0, lines: 0, geometries: 1, textures: 0 },
        input: { sampleCount: 0, latestInputToLogicMs: null, latestInputToPresentedMs: null, p95InputToLogicMs: null, p95InputToPresentedMs: null },
      },
      vfx: {
        density: 1,
        triggerCounts: {},
        base: { activeEffects: 0, persistentDecals: 0, pools: [] },
      },
    });
    expect(snapshot.frameMetric).toBe("visible-rAF-frame-time");
    expect(snapshot.categories.characters).toMatchObject({ active: 9, status: "within-budget" });
  });
});

describe("debug content extension", () => {
  test("registers a test enemy through Definition, Behavior and Presentation only", () => {
    registerDebugTestEnemy();
    const state = createGame(0);
    const enemy = state.enemies[0]!;
    enemy.definitionId = DEBUG_STATIONARY_ENEMY.id;
    enemy.speed = 10;
    const before = { ...enemy.position };
    moveEnemiesWithBehaviors(state, 1000);
    expect(enemy.position).toEqual(before);
    expect(enemyPresentationRegistry.get(DEBUG_STATIONARY_ENEMY.id).characterId).toBe("enemy-procedural-v5");
  });
});
