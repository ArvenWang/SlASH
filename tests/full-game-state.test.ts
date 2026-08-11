import { describe, expect, test } from "vitest";
import {
  createFullGameGame,
  dispatchGameCommand,
  getGameSnapshot,
  stepGame,
} from "../src/game/game";
import { markCampaignDefeat } from "../src/game/campaign/campaign-system";
import type { GameState } from "../src/game/domain/types";

function advanceTicks(state: GameState, ticks: number): void {
  for (let tick = 0; tick < ticks; tick += 1) stepGame(state);
}

function killAliveEnemies(state: GameState): void {
  for (const enemy of state.enemies) {
    if (!enemy.alive) continue;
    enemy.alive = false;
    enemy.state = "dead";
    enemy.killedAtMs = state.elapsedMs;
    state.combat.kills += 1;
  }
}

function startFirstEncounter(state: GameState): void {
  expect(dispatchGameCommand(state, { type: "start-full-game-run" }).result).toBe("run-started");
  const firstNode = state.run.fullGame?.routeProgress.availableNodeIds[0];
  if (!firstNode) throw new Error("Missing first route node.");
  expect(dispatchGameCommand(state, { type: "preview-route-node", nodeId: firstNode }).result).toBe("route-previewed");
  expect(dispatchGameCommand(state, { type: "preview-skill-purchase", skillId: "skill-wide-slash-v1" }).result).toBe("skill-drafted");
  expect(dispatchGameCommand(state, { type: "confirm-planning" }).result).toBe("planning-confirmed");
}

describe("full-game campaign state", () => {
  test("runs Title -> Planning -> two-wave Combat -> Reward with stable observable state", () => {
    const state = createFullGameGame(3108);
    expect(state.stage.phase).toBe("title");
    expect(getGameSnapshot(state).campaign?.skillPoints).toEqual({ earned: 2, spent: 0, unspent: 2 });

    startFirstEncounter(state);
    expect(state.stage.phase).toBe("playing");
    expect(state.run.selectedUpgrades).toEqual(["skill-wide-slash-v1"]);
    expect(getGameSnapshot(state).campaign?.encounter?.waves.map((wave) => wave.status)).toEqual(["warning", "pending"]);

    advanceTicks(state, 90);
    expect(state.enemies).toHaveLength(3);
    expect(state.enemies.every((enemy) => enemy.id.includes(":striker-"))).toBe(true);
    expect(getGameSnapshot(state).campaign?.encounter?.waves[0]?.status).toBe("active");

    killAliveEnemies(state);
    stepGame(state);
    expect(getGameSnapshot(state).campaign?.encounter?.waves.map((wave) => wave.status)).toEqual(["completed", "warning"]);
    advanceTicks(state, 90);
    expect(state.enemies.filter((enemy) => enemy.alive)).toHaveLength(4);

    killAliveEnemies(state);
    stepGame(state);
    expect(state.run.fullGame?.phase).toBe("reward");
    expect(state.stage.phase).toBe("reward");
    expect(state.run.fullGame?.routeProgress.completedNodeIds).toHaveLength(1);
    expect(state.run.fullGame?.skills.totalEarnedPoints).toBe(3);
    expect(dispatchGameCommand(state, { type: "acknowledge-reward" }).result).toBe("reward-acknowledged");
    expect(state.stage.phase).toBe("planning");
    expect(getGameSnapshot(state).campaign?.availableNodes.length).toBeGreaterThan(0);
  });

  test("restarts the current encounter with the same deterministic enemy IDs", () => {
    const state = createFullGameGame(44);
    startFirstEncounter(state);
    advanceTicks(state, 90);
    const firstIds = state.enemies.map((enemy) => enemy.id);
    state.stage.phase = "dead";
    markCampaignDefeat(state);
    expect(dispatchGameCommand(state, { type: "restart-stage" }).result).toBe("restarted");
    advanceTicks(state, 90);
    expect(state.enemies.map((enemy) => enemy.id)).toEqual(firstIds);
    expect(state.stage.attempt).toBe(2);
  });

  test("is deterministic and JSON-safe before and during combat", () => {
    const first = createFullGameGame(901);
    const second = createFullGameGame(901);
    expect(second).toEqual(first);
    startFirstEncounter(first);
    advanceTicks(first, 25);
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
  });
});
