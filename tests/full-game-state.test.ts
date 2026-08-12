import { describe, expect, test } from "vitest";
import { fullGameEncounterDefinitions } from "../src/content/encounters/definitions";
import { markCampaignDefeat } from "../src/game/campaign/campaign-system";
import type { GameState } from "../src/game/domain/types";
import {
  createFullGameGame,
  dispatchGameCommand,
  getGameSnapshot,
  stepGame,
} from "../src/game/game";

function advanceTicks(state: GameState, ticks: number): void {
  for (let tick = 0; tick < ticks; tick += 1) stepGame(state);
}

function advanceUntil(
  state: GameState,
  predicate: () => boolean,
  maximumTicks = 2_400,
): void {
  for (let tick = 0; tick < maximumTicks && !predicate(); tick += 1) {
    stepGame(state);
  }
  expect(predicate()).toBe(true);
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

function startRun(state: GameState): void {
  expect(dispatchGameCommand(state, { type: "start-full-game-run" }).result).toBe("run-started");
  expect(state.stage.phase).toBe("playing");
  expect(state.run.fullGame?.phase).toBe("combat");
  expect(state.run.fullGame?.activeEncounterTemplateId).not.toBeNull();
  expect(state.run.fullGame?.encounterRuntime).not.toBeNull();
  expect(state.run.selectedUpgrades).toEqual([]);
}

function clearActiveEncounter(state: GameState): void {
  for (let tick = 0; tick < 2_400 && state.stage.phase === "playing"; tick += 1) {
    killAliveEnemies(state);
    stepGame(state);
  }
  expect(state.stage.phase).toBe("upgrade-choice");
  expect(state.run.fullGame?.phase).toBe("upgrade-choice");
}

describe("full-game V2 campaign state", () => {
  test("runs Title -> Combat -> three-skill choice -> next Combat", () => {
    const state = createFullGameGame(3108);
    expect(state.stage.phase).toBe("title");
    expect(state.run.fullGame?.phase).toBe("title");

    startRun(state);
    const firstEncounterId = state.run.fullGame?.activeEncounterTemplateId;
    if (!firstEncounterId) throw new Error("Missing first directed encounter.");
    const firstEncounter = fullGameEncounterDefinitions.get(firstEncounterId);
    expect(getGameSnapshot(state).campaign?.encounter?.waves).toHaveLength(firstEncounter.waves.length);

    advanceUntil(state, () => state.enemies.some((enemy) => enemy.alive));
    expect(state.enemies.map((enemy) => enemy.definitionId)).toEqual(
      firstEncounter.waves[0]?.spawns.map((spawn) => spawn.enemyDefinitionId),
    );

    clearActiveEncounter(state);
    const campaign = state.run.fullGame;
    const draft = campaign?.activeRewardDraft;
    if (!campaign || !draft) throw new Error("Missing V2 reward draft after encounter clear.");

    expect(campaign.routeProgress.completedNodeIds).toHaveLength(1);
    expect(draft.candidateSkillIds).toHaveLength(3);
    expect(new Set(draft.candidateSkillIds).size).toBe(3);
    expect(draft.candidateSkillIds.every((skillId) => !state.run.selectedUpgrades.includes(skillId))).toBe(true);
    expect(getGameSnapshot(state).campaign?.rewardDraft).toEqual({
      offerId: draft.offerId,
      rewardIndex: 0,
      candidateSkillIds: [...draft.candidateSkillIds],
    });

    const selectedSkillId = draft.candidateSkillIds[0];
    const completedNodeId = campaign.routeProgress.completedNodeIds[0];
    expect(dispatchGameCommand(state, {
      type: "select-reward-skill",
      offerId: draft.offerId,
      skillId: selectedSkillId,
    }).result).toBe("reward-skill-selected");

    expect(state.run.selectedUpgrades).toContain(selectedSkillId);
    expect(state.run.selectedUpgrades.filter((skillId) => skillId === selectedSkillId)).toHaveLength(1);
    expect(state.run.fullGame?.skills.committedSkillIds).toContain(selectedSkillId);
    expect(state.run.fullGame?.rewardIndex).toBe(1);
    expect(state.run.fullGame?.activeRewardDraft).toBeNull();
    expect(state.run.fullGame?.pendingReward).toBeNull();
    expect(state.run.fullGame?.phase).toBe("combat");
    expect(state.stage.phase).toBe("playing");
    expect(state.run.fullGame?.activeEncounterTemplateId).not.toBeNull();
    expect(state.run.fullGame?.routeProgress.currentNodeId).not.toBe(completedNodeId);

    if (selectedSkillId === "skill-additional-ultimate-slash-v1") {
      state.player.ultimateEnergy = 100;
      expect(dispatchGameCommand(state, { type: "start-ultimate" }).result).toBe("ultimate-planning-started");
      expect(state.player.ultimatePlanning?.requiredPointCount).toBe(4);
      expect(dispatchGameCommand(state, { type: "cancel-ultimate" }).result).toBe("ultimate-cancelled");
    }

    expect(dispatchGameCommand(state, {
      type: "select-reward-skill",
      offerId: draft.offerId,
      skillId: selectedSkillId,
    }).result).toBe("ignored");
    expect(state.run.selectedUpgrades.filter((skillId) => skillId === selectedSkillId)).toHaveLength(1);
  });

  test("uses the one-per-Act Assist Reboot and preserves deterministic enemy IDs", () => {
    const state = createFullGameGame(44);
    expect(dispatchGameCommand(state, {
      type: "configure-run-protocol",
      mode: "assist",
    }).result).toBe("protocol-configured");
    startRun(state);
    advanceUntil(state, () => state.enemies.some((enemy) => enemy.alive));
    const firstIds = state.enemies.map((enemy) => enemy.id);

    state.stage.phase = "dead";
    markCampaignDefeat(state);
    expect(dispatchGameCommand(state, { type: "restart-stage" }).result).toBe("restarted");
    advanceUntil(state, () => state.enemies.some((enemy) => enemy.alive));
    expect(state.enemies.map((enemy) => enemy.id)).toEqual(firstIds);
    expect(state.stage.attempt).toBe(2);
    expect(state.run.fullGame?.protocol.assistRebootsRemaining).toBe(0);

    state.stage.phase = "dead";
    markCampaignDefeat(state);
    expect(dispatchGameCommand(state, { type: "restart-stage" }).result).toBe("ignored");
  });

  test("ends a Standard Run on death instead of silently restarting", () => {
    const state = createFullGameGame(45);
    startRun(state);
    state.stage.phase = "dead";
    markCampaignDefeat(state);

    expect(dispatchGameCommand(state, { type: "restart-stage" }).result).toBe("ignored");
    expect(state.run.fullGame?.phase).toBe("defeat");
    expect(dispatchGameCommand(state, { type: "return-to-title" }).result).toBe("returned-to-title");
    expect(state.run.fullGame?.phase).toBe("title");
    expect(state.stage.phase).toBe("title");
  });

  test("is deterministic and JSON-safe before and during V2 combat", () => {
    const first = createFullGameGame(901);
    const second = createFullGameGame(901);
    expect(second).toEqual(first);

    startRun(first);
    startRun(second);
    expect(second).toEqual(first);
    advanceTicks(first, 25);
    advanceTicks(second, 25);
    expect(second).toEqual(first);
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
  });
});
