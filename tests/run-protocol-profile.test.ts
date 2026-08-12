import { describe, expect, test } from "vitest";
import { BOSS_DEFINITIONS, MIRROR_REGENT_BOSS_ID, RAIL_HOUND_BOSS_ID, SIEGE_CHOIR_BOSS_ID } from "../src/content/bosses/definitions";
import { TWIN_GUNNER_ELITE_ID } from "../src/content/enemies/definitions";
import {
  ARC_RAIL_HAZARD_ID,
  STANDARD_ROUND_PROJECTILE_ID,
  hazardDefinitions,
  projectileDefinitions,
} from "../src/content/entities/definitions";
import { ASSIST_PROTOCOL_RULES } from "../src/content/protocols/definitions";
import { createFullGameGame, dispatchGameCommand, getGameSnapshot, stepGame } from "../src/game/game";
import { effectiveIntelDepth } from "../src/game/difficulty/protocol-system";
import { advanceHazards, spawnHazard } from "../src/game/entities/hazard-system";
import { spawnProjectile } from "../src/game/entities/projectile-system";
import type { GameEvent, GameState } from "../src/game/domain/types";
import {
  PROFILE_STORAGE_KEY,
  createDefaultProfile,
  restoreProfile,
  serializeProfile,
} from "../src/game/profile/profile-save";
import { generateRunRoute } from "../src/game/run/route-generator";
import { createProfileRuntime } from "../src/runtime/profile-runtime";

describe("Run Protocols", () => {
  test("configures Standard, Assist, and cumulative Threat routes only at Title", () => {
    const state = createFullGameGame(3108);
    expect(dispatchGameCommand(state, { type: "configure-run-protocol", mode: "assist" }).result).toBe("protocol-configured");
    expect(getGameSnapshot(state).campaign?.protocol).toEqual({
      mode: "assist",
      threatLevel: 0,
      assistRebootsRemaining: 1,
      leaderboardEligible: false,
    });
    expect(dispatchGameCommand(state, { type: "configure-run-protocol", mode: "threat", threatLevel: 5 }).result).toBe("protocol-configured");
    expect(state.run.fullGame?.protocol).toMatchObject({ mode: "threat", threatLevel: 5, leaderboardEligible: true });
    expect(dispatchGameCommand(state, { type: "start-full-game-run" }).result).toBe("run-started");
    expect(dispatchGameCommand(state, { type: "configure-run-protocol", mode: "standard" }).result).toBe("ignored");

    const standard = generateRunRoute(3108);
    const threat = generateRunRoute(3108, undefined, 1);
    const standardPressureLayers = standard.acts.flatMap((act) => act.layers).filter((layer) => layer.length === 3);
    const threatPressureLayers = threat.acts.flatMap((act) => act.layers).filter((layer) => layer.length === 3);
    expect(standardPressureLayers.every((layer) => layer.filter((node) => node.kind === "elite").length === 1)).toBe(true);
    expect(threatPressureLayers.every((layer) => layer.filter((node) => node.kind === "elite").length === 2)).toBe(true);
  });

  test("applies Assist projectile and Telegraph timing without changing attack outcomes", () => {
    const state = createFullGameGame(9);
    dispatchGameCommand(state, { type: "configure-run-protocol", mode: "assist" });
    const projectile = spawnProjectile(state, {
      id: "assist-round",
      definitionId: STANDARD_ROUND_PROJECTILE_ID,
      position: { x: 0, z: 0 },
      direction: { x: 1, z: 0 },
      sourceId: "assist-source",
    });
    expect(projectile?.velocity.x).toBeCloseTo(
      projectileDefinitions.get(STANDARD_ROUND_PROJECTILE_ID).speed * ASSIST_PROTOCOL_RULES.projectileSpeedScale,
    );

    const rail = spawnHazard(state, {
      id: "assist-rail",
      definitionId: ARC_RAIL_HAZARD_ID,
      position: { x: 10, z: 10 },
    });
    const telegraphMs = hazardDefinitions.get(ARC_RAIL_HAZARD_ID).telegraphMs * ASSIST_PROTOCOL_RULES.telegraphScale;
    advanceHazards(state, telegraphMs - 1);
    expect(rail?.phase).toBe("telegraph");
    advanceHazards(state, 1);
    expect(rail?.phase).toBe("active");
  });

  test("applies Threat 2–5 to hazards, Intel, opening Rail, and public Boss variations", () => {
    const state = createFullGameGame(11);
    dispatchGameCommand(state, { type: "configure-run-protocol", mode: "threat", threatLevel: 5 });
    state.run.acquiredResources.intel = 3;
    expect(effectiveIntelDepth(state)).toBe(2);
    dispatchGameCommand(state, { type: "start-full-game-run" });
    const firstNode = state.run.fullGame?.routeProgress.availableNodeIds[0];
    if (!firstNode) throw new Error("Missing Threat entry node.");
    dispatchGameCommand(state, { type: "preview-route-node", nodeId: firstNode });
    dispatchGameCommand(state, { type: "confirm-planning" });
    expect(state.hazards.some((hazard) => hazard.sourceId === "threat-05-redline")).toBe(true);

    const activeMs = hazardDefinitions.get(ARC_RAIL_HAZARD_ID).activeMs;
    const isolated = createFullGameGame(12);
    dispatchGameCommand(isolated, { type: "configure-run-protocol", mode: "threat", threatLevel: 2 });
    const hazard = spawnHazard(isolated, { id: "long-rail", definitionId: ARC_RAIL_HAZARD_ID, position: { x: 10, z: 10 } });
    advanceHazards(isolated, hazardDefinitions.get(ARC_RAIL_HAZARD_ID).telegraphMs);
    advanceHazards(isolated, activeMs);
    expect(hazard?.phase).toBe("active");
    advanceHazards(isolated, activeMs * 0.2);
    expect(hazard?.phase).toBe("expired");

    const rail = threatBoss(RAIL_HOUND_BOSS_ID);
    expect(rail.run.fullGame?.activeBoss?.mechanics).toMatchObject({ kind: "rail-hound", chargesThisCycle: 2 });
    const siege = threatBoss(SIEGE_CHOIR_BOSS_ID);
    expect(siege.enemies.filter((enemy) => enemy.id.includes("turret")).every((enemy) => enemy.definitionId === TWIN_GUNNER_ELITE_ID)).toBe(true);
    const mirror = threatBoss(MIRROR_REGENT_BOSS_ID);
    const mechanics = mirror.run.fullGame?.activeBoss?.mechanics;
    expect(mechanics?.kind === "mirror-regent" ? mechanics.cloneEntityIds.length : 0).toBe(4);
  });
});

describe("Player Profile", () => {
  test("roundtrips a versioned Profile with no permanent combat-stat progression", () => {
    const profile = createDefaultProfile("2026-08-12T00:00:00.000Z");
    profile.discoveries.enemyDefinitionIds.push("enemy-striker-v1");
    profile.settings.reducedMotion = true;
    expect(restoreProfile(serializeProfile(profile))).toEqual(profile);
    const serialized = serializeProfile(profile);
    expect(serialized).not.toMatch(/dashDamage|playerHp|recoveryMs|damageMultiplier|healthBonus/i);
  });

  test("records discoveries, local stats, Boss Practice, and unlocks Threat after a Standard clear", () => {
    const storage = memoryStorage();
    const runtime = createProfileRuntime(storage, () => new Date("2026-08-12T01:00:00.000Z"));
    const state = createFullGameGame(77);
    runtime.observe(state, [gameEvent({ type: "campaign-started", seed: 77, protocolMode: "standard", threatLevel: 0 })]);
    state.enemies.push({
      id: "seen-striker",
      definitionId: "enemy-striker-v1",
      position: { x: 0, z: 0 },
      facing: { x: 1, z: 0 },
      radius: 0.55,
      speed: 0,
      alive: true,
      state: "active",
      spawnedAtMs: 0,
      killedAtMs: null,
      armorParts: [],
      staggerRemainingMs: 0,
    });
    runtime.observe(state, [gameEvent({ type: "boss-victory", bossDefinitionId: RAIL_HOUND_BOSS_ID, breakCount: 3, durationMs: 12_000 })]);
    state.elapsedMs = 90_000;
    runtime.observe(state, [gameEvent({ type: "campaign-victory", seed: 77 })]);
    const profile = runtime.profile();
    expect(profile.discoveries.enemyDefinitionIds).toContain("enemy-striker-v1");
    expect(profile.unlocks.bossPracticeIds).toContain(RAIL_HOUND_BOSS_ID);
    expect(profile.unlocks.maximumThreatLevel).toBe(5);
    expect(profile.statistics.runsStarted).toBe(1);
    expect(profile.statistics.clears.standard).toBe(1);
    expect(profile.statistics.bestClearTimeMs.standard).toBe(90_000);
    expect(storage.getItem(PROFILE_STORAGE_KEY)).not.toBeNull();
  });

  test("preserves corrupt source and only rebuilds after an explicit recovery call", () => {
    const storage = memoryStorage({ [PROFILE_STORAGE_KEY]: "{broken" });
    const runtime = createProfileRuntime(storage, () => new Date("2026-08-12T02:00:00.000Z"));
    expect(runtime.status().kind).toBe("error");
    expect(storage.getItem(PROFILE_STORAGE_KEY)).toBe("{broken");
    const rebuilt = runtime.rebuildCorruptProfile();
    expect(rebuilt.ok).toBe(true);
    expect(rebuilt.ok && rebuilt.backupKey ? storage.getItem(rebuilt.backupKey) : null).toBe("{broken");
    expect(runtime.status().kind).toBe("ready");
    expect(() => restoreProfile(storage.getItem(PROFILE_STORAGE_KEY) ?? "")).not.toThrow();
  });
});

function threatBoss(bossDefinitionId: string): GameState {
  const state = createFullGameGame(101);
  dispatchGameCommand(state, { type: "configure-run-protocol", mode: "threat", threatLevel: 3 });
  expect(dispatchGameCommand(state, { type: "start-boss-practice", bossDefinitionId }).result).toBe("boss-practice-started");
  for (let tick = 0; tick < 100 && !state.run.fullGame?.activeBoss; tick += 1) stepGame(state);
  expect(state.run.fullGame?.activeBoss?.definitionId).toBe(bossDefinitionId);
  return state;
}

function gameEvent<T extends Omit<GameEvent, "id" | "tick" | "sequence" | "atMs">>(payload: T): GameEvent {
  return { ...payload, id: "profile-test-event", tick: 0, sequence: 1, atMs: 0 } as GameEvent;
}

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key: string) { return values.get(key) ?? null; },
    setItem(key: string, value: string) { values.set(key, value); },
  };
}
