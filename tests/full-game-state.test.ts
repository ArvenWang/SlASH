import { describe, expect, test } from "vitest";
import {
  createFullGameGame,
  dispatchGameCommand,
  getGameSnapshot,
  stepGame,
} from "../src/game/game";
import { markCampaignDefeat } from "../src/game/campaign/campaign-system";
import type { GameState } from "../src/game/domain/types";
import { fullGameEncounterDefinitions } from "../src/content/encounters/definitions";

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
    const encounterId = state.run.fullGame?.activeEncounterTemplateId;
    if (!encounterId) throw new Error("Missing active encounter template.");
    const definition = fullGameEncounterDefinitions.get(encounterId);

    advanceTicks(state, 90);
    expect(state.enemies).toHaveLength(definition.waves[0]?.spawns.length ?? 0);
    expect(state.enemies.map((enemy) => enemy.definitionId)).toEqual(
      definition.waves[0]?.spawns.map((spawn) => spawn.enemyDefinitionId),
    );
    expect(getGameSnapshot(state).campaign?.encounter?.waves[0]?.status).toBe("active");

    killAliveEnemies(state);
    stepGame(state);
    expect(getGameSnapshot(state).campaign?.encounter?.waves.map((wave) => wave.status)).toEqual(["completed", "warning"]);
    advanceTicks(state, 90);
    expect(state.enemies.filter((enemy) => enemy.alive)).toHaveLength(definition.waves[1]?.spawns.length ?? 0);

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

  test("uses the one-per-Act Assist Reboot and preserves deterministic enemy IDs", () => {
    const state = createFullGameGame(44);
    expect(dispatchGameCommand(state, {
      type: "configure-run-protocol",
      mode: "assist",
    }).result).toBe("protocol-configured");
    startFirstEncounter(state);
    advanceTicks(state, 90);
    const firstIds = state.enemies.map((enemy) => enemy.id);
    state.stage.phase = "dead";
    markCampaignDefeat(state);
    expect(dispatchGameCommand(state, { type: "restart-stage" }).result).toBe("restarted");
    advanceTicks(state, 90);
    expect(state.enemies.map((enemy) => enemy.id)).toEqual(firstIds);
    expect(state.stage.attempt).toBe(2);
    expect(state.run.fullGame?.protocol.assistRebootsRemaining).toBe(0);
    state.stage.phase = "dead";
    markCampaignDefeat(state);
    expect(dispatchGameCommand(state, { type: "restart-stage" }).result).toBe("ignored");
  });

  test("ends a Standard Run on death instead of silently restarting", () => {
    const state = createFullGameGame(45);
    startFirstEncounter(state);
    state.stage.phase = "dead";
    markCampaignDefeat(state);
    expect(dispatchGameCommand(state, { type: "restart-stage" }).result).toBe("ignored");
    expect(state.run.fullGame?.phase).toBe("defeat");
    expect(dispatchGameCommand(state, { type: "return-to-title" }).result).toBe("returned-to-title");
    expect(state.run.fullGame?.phase).toBe("title");
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
