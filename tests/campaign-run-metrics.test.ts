import { describe, expect, test } from "vitest";
import { createFullGameGame, getGameSnapshot } from "../src/game/game";
import { synchronizeCampaignRunMetrics } from "../src/game/campaign/campaign-system";

describe("campaign run metrics", () => {
  test("preserves a translated death-source identity after the source entity is removed", () => {
    const state = createFullGameGame(17);
    state.lastEvents = [{
      id: "event-1",
      tick: 1,
      sequence: 1,
      atMs: 8,
      type: "player-died",
      enemyId: "vanished-sniper-round",
      position: { x: 0, z: 0 },
    }];
    state.eventSequence = 1;
    state.projectiles = [{
      id: "vanished-sniper-round",
      definitionId: "projectile-sniper-round-v1",
      position: { x: 0, z: 0 },
      velocity: { x: 1, z: 0 },
      radius: 0.11,
      alive: true,
      spawnedAtMs: 0,
      sourceId: "sniper",
      faction: "enemy",
      reflectedAtMs: null,
      ageMs: 8,
      returnTargetId: null,
      reflectedByAbilityId: null,
    }];

    synchronizeCampaignRunMetrics(state);
    state.projectiles = [];

    expect(state.run.fullGame?.runMetrics.deathSourceLabel).toBe("projectile:projectile-sniper-round-v1");
    expect(getGameSnapshot(state).campaign?.runMetrics.deathSourceLabel).toBe("projectile:projectile-sniper-round-v1");
  });
});
