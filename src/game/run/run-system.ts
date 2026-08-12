import type { RouteNodeId } from "../../core/ids";
import { FULL_GAME_RUN_DEFINITION, type RunDefinition } from "../../content/runs/definitions";
import { generateRunRoute } from "./route-generator";
import type { FullGameRunProgressState, RouteNodeState, RunRouteGraph } from "./types";

export type RouteSelectionResult = "selected" | "ignored";
export type RouteCompletionResult = "layer-complete" | "act-complete" | "run-complete" | "ignored";

export function createFullGameRunProgress(
  seed: number,
  definition: RunDefinition = FULL_GAME_RUN_DEFINITION,
  threatLevel = 0,
): FullGameRunProgressState {
  const route = generateRunRoute(seed, definition, threatLevel);
  const firstAct = route.acts[0];
  if (!firstAct) throw new Error("A full game run requires at least one act.");
  return {
    route,
    phase: "route-map",
    actIndex: 0,
    layerIndex: 0,
    currentNodeId: null,
    availableNodeIds: [...firstAct.entryNodeIds],
    completedNodeIds: [],
  };
}

export function selectRouteNode(
  progress: FullGameRunProgressState,
  nodeId: RouteNodeId,
): RouteSelectionResult {
  if (
    progress.phase !== "route-map" ||
    progress.currentNodeId !== null ||
    !progress.availableNodeIds.includes(nodeId)
  ) {
    return "ignored";
  }
  const node = routeNodeById(progress.route, nodeId);
  if (node.actIndex !== progress.actIndex || node.layerIndex !== progress.layerIndex) return "ignored";
  progress.currentNodeId = nodeId;
  progress.availableNodeIds = [];
  progress.phase = "encounter";
  return "selected";
}

export function completeCurrentRouteNode(
  progress: FullGameRunProgressState,
): RouteCompletionResult {
  if (progress.phase !== "encounter" || progress.currentNodeId === null) return "ignored";
  const current = routeNodeById(progress.route, progress.currentNodeId);
  if (!progress.completedNodeIds.includes(current.id)) progress.completedNodeIds.push(current.id);
  progress.currentNodeId = null;

  if (current.kind === "boss") {
    const nextAct = progress.route.acts[progress.actIndex + 1];
    if (!nextAct) {
      progress.phase = "victory";
      progress.availableNodeIds = [];
      return "run-complete";
    }
    progress.actIndex += 1;
    progress.layerIndex = 0;
    progress.availableNodeIds = [...nextAct.entryNodeIds];
    progress.phase = "route-map";
    return "act-complete";
  }

  progress.layerIndex += 1;
  progress.availableNodeIds = [...current.nextNodeIds];
  progress.phase = "route-map";
  return "layer-complete";
}

export function currentRouteNode(progress: FullGameRunProgressState): RouteNodeState | null {
  return progress.currentNodeId === null ? null : routeNodeById(progress.route, progress.currentNodeId);
}

export function availableRouteNodes(progress: FullGameRunProgressState): RouteNodeState[] {
  return progress.availableNodeIds.map((id) => routeNodeById(progress.route, id));
}

export function routeNodeById(route: RunRouteGraph, nodeId: RouteNodeId): RouteNodeState {
  for (const act of route.acts) {
    for (const layer of act.layers) {
      const node = layer.find((candidate) => candidate.id === nodeId);
      if (node) return node;
    }
  }
  throw new Error(`Unknown route node id: ${nodeId}`);
}
