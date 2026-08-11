import { describe, expect, test } from "vitest";
import { CHARGED_DASH_ABILITY_ID, VECTOR_FOCUS_ABILITY_ID } from "../src/content/abilities/definitions";
import {
  encounterForRouteNode,
  fullGameEncounterDefinitions,
} from "../src/content/encounters/definitions";
import { FULL_GAME_NON_BOSS_ENCOUNTERS } from "../src/content/encounters/full-game-library";
import {
  advanceCampaignEncounterScheduler,
  completeCampaignEncounter,
} from "../src/game/campaign/campaign-system";
import { challengeProgressLabel } from "../src/game/campaign/challenge-system";
import type { GameState } from "../src/game/domain/types";
import { emitGameEvent } from "../src/game/events/event-buffer";
import {
  createFullGameGame,
  dispatchGameCommand,
  drainGameEvents,
} from "../src/game/game";
import type { RouteNodeState } from "../src/game/run/types";

describe("campaign Challenge lifecycle", () => {
  test("registers nine real challenge contracts with explicit conditions and rewards", () => {
    const definitions = FULL_GAME_NON_BOSS_ENCOUNTERS.filter((definition) => definition.category === "challenge");
    expect(definitions).toHaveLength(9);
    expect(new Set(definitions.map((definition) => definition.challenge?.id)).size).toBe(9);
    expect(new Set(definitions.map((definition) => definition.challenge?.kind))).toEqual(new Set([
      "clean-line",
      "projectile-cuts",
      "charged-multi-break",
      "no-ultimate",
    ]));
    expect(definitions.every((definition) => (
      definition.challenge !== null &&
      definition.challenge.description.length > 0 &&
      definition.challenge.reward.summary.length > 0
    ))).toBe(true);
  });

  test("tracks projectile cuts and a multi-armor Charged Dash from gameplay events", () => {
    const projectileState = startExactChallenge("encounter-act1-bullet-weave-v1");
    const projectileDefinition = activeDefinition(projectileState);
    const projectileRuntime = projectileState.run.fullGame?.activeChallenge;
    if (!projectileRuntime || !projectileDefinition.challenge) throw new Error("Missing projectile challenge runtime.");
    projectileState.enemies.push(dummyEnemy("source-gunner"));
    for (let count = 0; count < 8; count += 1) {
      emitGameEvent(projectileState, {
        type: "projectile-destroyed",
        projectileId: `projectile-${count}`,
        attackId: "dash-slash",
        sourceId: "source-gunner",
        position: { x: 0, z: 0 },
        direction: { x: 1, z: 0 },
      });
    }
    advanceCampaignEncounterScheduler(projectileState);
    expect(projectileRuntime.projectileCuts).toBe(8);
    expect(challengeProgressLabel(projectileRuntime, projectileDefinition.challenge)).toBe("8 / 8 PROJECTILES");

    const breachState = startExactChallenge("encounter-act3-breach-chain-v1");
    const breachDefinition = activeDefinition(breachState);
    const breachRuntime = breachState.run.fullGame?.activeChallenge;
    if (!breachRuntime || !breachDefinition.challenge) throw new Error("Missing breach challenge runtime.");
    for (let count = 0; count < 2; count += 1) {
      emitGameEvent(breachState, {
        type: "armor-broken",
        enemyId: `armored-${count}`,
        armorPartId: `armor-${count}`,
        attackId: CHARGED_DASH_ABILITY_ID,
        position: { x: count, z: 0 },
        contactRegion: "front",
      });
    }
    emitGameEvent(breachState, {
      type: "dash-ended",
      abilityId: CHARGED_DASH_ABILITY_ID,
      sourceId: "player",
      position: { x: 5, z: 0 },
    });
    advanceCampaignEncounterScheduler(breachState);
    expect(breachRuntime.maximumChargedArmorBreaks).toBe(2);
    expect(breachRuntime.currentChargedArmorBreaks).toBe(0);
    expect(challengeProgressLabel(breachRuntime, breachDefinition.challenge)).toBe("2 / 2 ARMOR");
  });

  test("fails Clean Line on an obstacle impact and Silent Core only when Ultimate actually executes", () => {
    const cleanState = startExactChallenge("encounter-act1-clean-line-v1");
    const cleanDefinition = activeDefinition(cleanState);
    const cleanRuntime = cleanState.run.fullGame?.activeChallenge;
    if (!cleanRuntime || !cleanDefinition.challenge) throw new Error("Missing Clean Line runtime.");
    emitGameEvent(cleanState, {
      type: "dash-obstacle-impact",
      abilityId: "dash-slash",
      obstacleId: "anchor-west",
      position: { x: -6, z: 0 },
      normal: { x: 1, z: 0 },
    });
    advanceCampaignEncounterScheduler(cleanState);
    expect(cleanRuntime).toMatchObject({ status: "failed", failureReason: "OBSTACLE IMPACT" });

    const silentState = startExactChallenge("encounter-act3-silent-mirror-v1");
    const silentRuntime = silentState.run.fullGame?.activeChallenge;
    if (!silentRuntime) throw new Error("Missing Silent Core runtime.");
    silentState.player.ultimateEnergy = 100;
    expect(dispatchGameCommand(silentState, { type: "start-ultimate" }).result).toBe("ultimate-planning-started");
    drainGameEvents(silentState);
    expect(silentRuntime.status).toBe("active");
    expect(dispatchGameCommand(silentState, { type: "add-ultimate-point", target: { x: 5, z: 0 } }).result).toBe("ultimate-point-added");
    drainGameEvents(silentState);
    expect(dispatchGameCommand(silentState, { type: "add-ultimate-point", target: { x: 5, z: 5 } }).result).toBe("ultimate-point-added");
    drainGameEvents(silentState);
    expect(dispatchGameCommand(silentState, { type: "add-ultimate-point", target: { x: -5, z: 5 } }).result).toBe("ultimate-executing");
    drainGameEvents(silentState);
    expect(silentRuntime).toMatchObject({
      status: "failed",
      ultimateExecuted: true,
      failureReason: "ULTIMATE EXECUTED",
    });
  });

  test("resolves success into the exact Run Resource and exposes it in Reward", () => {
    const state = startExactChallenge("encounter-act3-silent-mirror-v1");
    const campaign = state.run.fullGame;
    if (!campaign?.activeChallenge || !campaign.encounterRuntime) throw new Error("Missing active challenge.");
    for (const wave of campaign.encounterRuntime.waves) wave.status = "completed";
    campaign.encounterRuntime.completed = true;
    state.enemies = [];
    advanceCampaignEncounterScheduler(state);
    expect(campaign.activeChallenge.status).toBe("succeeded");
    expect(completeCampaignEncounter(state)).toBe(true);
    expect(state.run.acquiredResources.intel).toBe(1);
    expect(campaign.pendingReward?.challenge).toMatchObject({
      definitionId: "challenge-silent-core-act3-v1",
      status: "succeeded",
      rewardResourceId: "intel",
      rewardAmount: 1,
      resourceBefore: 0,
      resourceAfter: 1,
    });
  });

  test("resolves failure without blocking route completion or granting the bonus", () => {
    const state = startExactChallenge("encounter-act3-silent-mirror-v1");
    const campaign = state.run.fullGame;
    if (!campaign?.activeChallenge || !campaign.encounterRuntime) throw new Error("Missing active challenge.");
    emitGameEvent(state, {
      type: "ultimate-segment-started",
      abilityId: VECTOR_FOCUS_ABILITY_ID,
      segmentIndex: 0,
      from: { x: 0, z: 0 },
      to: { x: 5, z: 0 },
    });
    for (const wave of campaign.encounterRuntime.waves) wave.status = "completed";
    campaign.encounterRuntime.completed = true;
    state.enemies = [];
    advanceCampaignEncounterScheduler(state);
    expect(campaign.activeChallenge.status).toBe("failed");
    expect(completeCampaignEncounter(state)).toBe(true);
    expect(state.run.acquiredResources.intel ?? 0).toBe(0);
    expect(campaign.pendingReward?.challenge).toMatchObject({
      status: "failed",
      rewardAmount: 0,
      failureReason: "ULTIMATE EXECUTED",
    });
    expect(campaign.phase).toBe("reward");
  });
});

function startExactChallenge(encounterId: string): GameState {
  for (let seed = 0; seed < 2_000; seed += 1) {
    const state = createFullGameGame(seed);
    const node = state.run.fullGame?.routeProgress.route.acts
      .flatMap((act) => act.layers.flatMap((layer) => layer))
      .find((candidate) => (
        candidate.kind === "challenge" && encounterForRouteNode(candidate, seed)?.id === encounterId
      ));
    if (!node) continue;
    startAtNode(state, node);
    expect(state.run.fullGame?.activeEncounterTemplateId).toBe(encounterId);
    return state;
  }
  throw new Error(`Could not route to challenge ${encounterId}.`);
}

function startAtNode(state: GameState, node: RouteNodeState): void {
  expect(dispatchGameCommand(state, { type: "start-full-game-run" }).result).toBe("run-started");
  const campaign = state.run.fullGame;
  if (!campaign) throw new Error("Missing full-game campaign.");
  campaign.phase = "planning";
  campaign.routeProgress.phase = "route-map";
  campaign.routeProgress.actIndex = node.actIndex;
  campaign.routeProgress.layerIndex = node.layerIndex;
  campaign.routeProgress.currentNodeId = null;
  campaign.routeProgress.availableNodeIds = [node.id];
  campaign.provisionalRouteNodeId = null;
  state.stage.phase = "planning";
  expect(dispatchGameCommand(state, { type: "preview-route-node", nodeId: node.id }).result).toBe("route-previewed");
  expect(dispatchGameCommand(state, { type: "confirm-planning" }).result).toBe("planning-confirmed");
}

function activeDefinition(state: GameState) {
  const id = state.run.fullGame?.activeEncounterTemplateId;
  if (!id) throw new Error("Missing active encounter ID.");
  return fullGameEncounterDefinitions.get(id);
}

function dummyEnemy(id: string): GameState["enemies"][number] {
  return {
    id,
    definitionId: "enemy-gunner-v1",
    position: { x: 15, z: 0 },
    facing: { x: -1, z: 0 },
    radius: 0.55,
    speed: 0,
    alive: true,
    state: "active",
    spawnedAtMs: 0,
    killedAtMs: null,
    armorParts: [],
    staggerRemainingMs: 0,
  };
}
