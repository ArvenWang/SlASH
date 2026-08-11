import { describe, expect, test } from "vitest";
import { eventForRouteNode } from "../src/content/events/definitions";
import { threatPreviewForRouteNode } from "../src/content/encounters/definitions";
import {
  createFullGameGame,
  dispatchGameCommand,
  drainGameEvents,
  getGameSnapshot,
} from "../src/game/game";
import type { GameState } from "../src/game/domain/types";
import type { RouteNodeState } from "../src/game/run/types";

function safeLayerNodes(state: GameState): readonly RouteNodeState[] {
  const campaign = state.run.fullGame;
  const layer = campaign?.routeProgress.route.acts[0]?.layers[2];
  if (!layer) throw new Error("Missing Act I safe layer.");
  return layer;
}

function positionPlanningAtNode(state: GameState, node: RouteNodeState): void {
  const campaign = state.run.fullGame;
  if (!campaign) throw new Error("Missing full-game campaign.");
  campaign.phase = "planning";
  campaign.provisionalRouteNodeId = null;
  campaign.routeProgress.phase = "route-map";
  campaign.routeProgress.actIndex = node.actIndex;
  campaign.routeProgress.layerIndex = node.layerIndex;
  campaign.routeProgress.currentNodeId = null;
  campaign.routeProgress.availableNodeIds = [node.id];
  state.stage.phase = "planning";
}

function startAtNode(state: GameState, node: RouteNodeState): void {
  expect(dispatchGameCommand(state, { type: "start-full-game-run" }).result).toBe("run-started");
  positionPlanningAtNode(state, node);
  expect(dispatchGameCommand(state, { type: "preview-route-node", nodeId: node.id }).result).toBe("route-previewed");
  expect(dispatchGameCommand(state, { type: "confirm-planning" }).result).toBe("planning-confirmed");
}

function stateWithForgeNode(): { state: GameState; node: RouteNodeState } {
  for (let seed = 0; seed < 1_000; seed += 1) {
    const state = createFullGameGame(seed);
    const node = safeLayerNodes(state).find((candidate) => candidate.kind === "forge");
    if (node) return { state, node };
  }
  throw new Error("Expected at least one deterministic seed with a Forge node.");
}

function stateWithEnergyEvent(): { state: GameState; node: RouteNodeState; choiceId: string; amount: number } {
  for (let seed = 0; seed < 1_000; seed += 1) {
    const state = createFullGameGame(seed);
    const node = safeLayerNodes(state).find((candidate) => candidate.kind === "event");
    if (!node) continue;
    const definition = eventForRouteNode(node, seed);
    const choice = definition.choices.find((candidate) => (
      candidate.effects.some((effect) => effect.resourceId === "next-combat-energy")
    ));
    const effect = choice?.effects.find((candidate) => candidate.resourceId === "next-combat-energy");
    if (choice && effect) return { state, node, choiceId: choice.id, amount: effect.amount };
  }
  throw new Error("Expected at least one deterministic energy event.");
}

describe("campaign non-combat nodes", () => {
  test("resolves an Event choice exactly once and continues through Reward", () => {
    const state = createFullGameGame(3108);
    const node = safeLayerNodes(state).find((candidate) => candidate.kind === "event");
    if (!node) throw new Error("Missing Event node.");
    const definition = eventForRouteNode(node, state.run.seed);
    const choice = definition.choices[0];
    const effect = choice.effects[0];

    startAtNode(state, node);
    expect(state.run.fullGame?.phase).toBe("event");
    expect(state.stage.phase).toBe("event");
    expect(state.enemies).toEqual([]);
    expect(getGameSnapshot(state).campaign?.activeEventDefinitionId).toBe(definition.id);
    expect(dispatchGameCommand(state, { type: "resolve-event-choice", choiceId: "invalid-choice" }).result).toBe("ignored");

    drainGameEvents(state);
    expect(dispatchGameCommand(state, { type: "resolve-event-choice", choiceId: choice.id }).result).toBe("event-resolved");
    expect(state.run.acquiredResources[effect.resourceId]).toBe(Math.min(effect.maximum, effect.amount));
    expect(state.run.fullGame?.eventHistory).toEqual([{
      nodeId: node.id,
      eventDefinitionId: definition.id,
      choiceId: choice.id,
    }]);
    expect(state.run.fullGame?.phase).toBe("reward");
    expect(state.run.fullGame?.routeProgress.completedNodeIds).toContain(node.id);
    const events = drainGameEvents(state);
    expect(events.filter((event) => event.type === "event-choice-resolved")).toHaveLength(1);
    expect(dispatchGameCommand(state, { type: "resolve-event-choice", choiceId: choice.id }).result).toBe("ignored");
    expect(dispatchGameCommand(state, { type: "acknowledge-reward" }).result).toBe("reward-acknowledged");
    expect(state.stage.phase).toBe("planning");
  });

  test("banks Event energy until the next combat and consumes it once", () => {
    const { state, node, choiceId, amount } = stateWithEnergyEvent();
    state.player.ultimateEnergy = 80;
    startAtNode(state, node);
    expect(dispatchGameCommand(state, { type: "resolve-event-choice", choiceId }).result).toBe("event-resolved");
    expect(state.run.acquiredResources["next-combat-energy"]).toBe(amount);
    expect(dispatchGameCommand(state, { type: "acknowledge-reward" }).result).toBe("reward-acknowledged");

    const nextCombat = state.run.fullGame?.routeProgress.availableNodeIds[0];
    if (!nextCombat) throw new Error("Missing route after Event.");
    expect(dispatchGameCommand(state, { type: "preview-route-node", nodeId: nextCombat }).result).toBe("route-previewed");
    expect(dispatchGameCommand(state, { type: "confirm-planning" }).result).toBe("planning-confirmed");
    expect(state.stage.phase).toBe("playing");
    expect(state.player.ultimateEnergy).toBe(100);
    expect(state.run.acquiredResources["next-combat-energy"]).toBe(0);
    expect(drainGameEvents(state).some((event) => (
      event.type === "ultimate-energy-changed" && event.source === "event-next-combat-energy"
    ))).toBe(true);
  });

  test("Forge enforces cascade move limits, consumes tokens explicitly, and preserves total SP", () => {
    const { state, node } = stateWithForgeNode();
    const campaign = state.run.fullGame;
    if (!campaign) throw new Error("Missing campaign.");
    campaign.skills.totalEarnedPoints = 3;
    expect(dispatchGameCommand(state, { type: "start-full-game-run" }).result).toBe("run-started");
    expect(dispatchGameCommand(state, { type: "preview-skill-purchase", skillId: "skill-wide-slash-v1" }).result).toBe("skill-drafted");
    expect(dispatchGameCommand(state, { type: "preview-skill-purchase", skillId: "skill-gravity-slash-v1" }).result).toBe("skill-drafted");
    expect(dispatchGameCommand(state, { type: "preview-skill-purchase", skillId: "skill-refraction-v1" }).result).toBe("skill-drafted");
    positionPlanningAtNode(state, node);
    expect(dispatchGameCommand(state, { type: "preview-route-node", nodeId: node.id }).result).toBe("route-previewed");
    expect(dispatchGameCommand(state, { type: "confirm-planning" }).result).toBe("planning-confirmed");
    expect(campaign.phase).toBe("forge");
    expect(state.enemies).toEqual([]);

    expect(dispatchGameCommand(state, { type: "preview-skill-refund", skillId: "skill-wide-slash-v1" }).result).toBe("skill-refunded");
    expect(getGameSnapshot(state).campaign?.forge).toMatchObject({ movesUsed: 2, moveLimit: 2 });
    expect(dispatchGameCommand(state, { type: "preview-skill-refund", skillId: "skill-refraction-v1" }).result).toBe("ignored");

    state.run.acquiredResources["reroute-token"] = 1;
    expect(dispatchGameCommand(state, { type: "use-forge-token" }).result).toBe("forge-token-used");
    expect(state.run.acquiredResources["reroute-token"]).toBe(0);
    expect(dispatchGameCommand(state, { type: "preview-skill-refund", skillId: "skill-refraction-v1" }).result).toBe("skill-refunded");
    expect(dispatchGameCommand(state, { type: "preview-skill-purchase", skillId: "skill-curve-dash-v1" }).result).toBe("skill-drafted");
    expect(dispatchGameCommand(state, { type: "preview-skill-purchase", skillId: "skill-cross-execution-v1" }).result).toBe("skill-drafted");
    expect(dispatchGameCommand(state, { type: "preview-skill-purchase", skillId: "skill-echo-slash-v1" }).result).toBe("skill-drafted");
    expect(dispatchGameCommand(state, { type: "confirm-forge" }).result).toBe("forge-confirmed");

    expect(campaign.skills.totalEarnedPoints).toBe(3);
    expect(campaign.skills.committedSkillIds).toEqual([
      "skill-curve-dash-v1",
      "skill-cross-execution-v1",
      "skill-echo-slash-v1",
    ]);
    expect(campaign.phase).toBe("reward");
    expect(campaign.skills.forgeMoveLimit).toBe(2);
    expect(campaign.forgeTokensSpentThisVisit).toBe(0);
  });

  test("exposes every safe-layer option as a selectable real lifecycle across 100 seeds", () => {
    for (let seed = 0; seed < 100; seed += 1) {
      const source = createFullGameGame(seed);
      for (const node of safeLayerNodes(source)) {
        expect(threatPreviewForRouteNode(node, seed).available).toBe(true);
        const state = createFullGameGame(seed);
        startAtNode(state, node);
        if (node.kind === "event") expect(state.stage.phase).toBe("event");
        else if (node.kind === "forge") expect(state.stage.phase).toBe("forge");
        else expect(state.stage.phase).toBe("playing");
      }
    }
  });
});
