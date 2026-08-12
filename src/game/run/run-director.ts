import type { RouteNodeId } from "../../core/ids";
import type { RouteNodeKind } from "../../content/runs/definitions";
import { routeNodeById, selectRouteNode } from "./run-system";
import type { FullGameRunProgressState, RouteNodeState } from "./types";

export const RUN_DIRECTOR_SUPPORTED_NODE_KINDS = [
  "combat",
  "elite",
  "challenge",
  "boss",
] as const satisfies readonly RouteNodeKind[];

export type RunDirectorFailureReason =
  | "not-ready"
  | "no-available-nodes"
  | "invalid-route-state"
  | "unsupported"
  | "selection-rejected";

export type RunDirectorSelectionResult =
  | {
      readonly ok: true;
      readonly node: RouteNodeState;
    }
  | {
      readonly ok: false;
      readonly reason: RunDirectorFailureReason;
      readonly availableNodeIds: readonly RouteNodeId[];
      readonly availableNodeKinds: readonly RouteNodeKind[];
    };

const supportedNodeKinds = new Set<RouteNodeKind>(RUN_DIRECTOR_SUPPORTED_NODE_KINDS);

/**
 * Selects and submits one supported node from the run's current legal choices.
 * The caller supplies no route choice: the same seed and progress state always
 * produce the same selected node.
 */
export function autoSelectRunNode(
  progress: FullGameRunProgressState,
): RunDirectorSelectionResult {
  if (progress.phase !== "route-map" || progress.currentNodeId !== null) {
    return failure(progress, "not-ready");
  }
  if (progress.availableNodeIds.length === 0) {
    return failure(progress, "no-available-nodes");
  }
  if (new Set(progress.availableNodeIds).size !== progress.availableNodeIds.length) {
    return failure(progress, "invalid-route-state");
  }

  const availableNodes: RouteNodeState[] = [];
  try {
    for (const nodeId of progress.availableNodeIds) {
      const node = routeNodeById(progress.route, nodeId);
      if (node.actIndex !== progress.actIndex || node.layerIndex !== progress.layerIndex) {
        return failure(progress, "invalid-route-state", availableNodes);
      }
      availableNodes.push(node);
    }
  } catch {
    return failure(progress, "invalid-route-state", availableNodes);
  }

  let supportedNodes = availableNodes
    .filter((node) => supportedNodeKinds.has(node.kind))
    .sort((left, right) => compareNodeIds(left.id, right.id));
  if (supportedNodes.length === 0) {
    const bypassed = bypassUnsupportedLayer(progress, availableNodes);
    if (!bypassed.ok) return bypassed.result;
    supportedNodes = bypassed.nodes;
  }

  const selectedNode = supportedNodes[deterministicSelectionIndex(progress, supportedNodes)];
  if (!selectedNode) return failure(progress, "invalid-route-state", availableNodes);
  if (selectRouteNode(progress, selectedNode.id) !== "selected") {
    return failure(progress, "selection-rejected", availableNodes);
  }
  return { ok: true, node: selectedNode };
}

function bypassUnsupportedLayer(
  progress: FullGameRunProgressState,
  unsupportedNodes: readonly RouteNodeState[],
): { readonly ok: true; readonly nodes: RouteNodeState[] } | { readonly ok: false; readonly result: RunDirectorSelectionResult } {
  if (!unsupportedNodes.every((node) => node.kind === "event" || node.kind === "forge")) {
    return { ok: false, result: failure(progress, "unsupported", unsupportedNodes) };
  }
  const nextNodeIds = [...new Set(unsupportedNodes.flatMap((node) => node.nextNodeIds))].sort(compareNodeIds);
  if (nextNodeIds.length === 0) {
    return { ok: false, result: failure(progress, "unsupported", unsupportedNodes) };
  }
  const nextNodes: RouteNodeState[] = [];
  try {
    for (const nodeId of nextNodeIds) {
      const node = routeNodeById(progress.route, nodeId);
      if (!supportedNodeKinds.has(node.kind)) {
        return { ok: false, result: failure(progress, "unsupported", unsupportedNodes) };
      }
      nextNodes.push(node);
    }
  } catch {
    return { ok: false, result: failure(progress, "invalid-route-state", unsupportedNodes) };
  }
  progress.layerIndex = nextNodes[0]!.layerIndex;
  progress.availableNodeIds = nextNodeIds;
  return { ok: true, nodes: nextNodes.sort((left, right) => compareNodeIds(left.id, right.id)) };
}

function deterministicSelectionIndex(
  progress: FullGameRunProgressState,
  candidates: readonly RouteNodeState[],
): number {
  const selectionKey = [
    progress.route.seed >>> 0,
    progress.actIndex,
    progress.layerIndex,
    [...progress.completedNodeIds].sort(compareNodeIds).join(","),
    candidates.map((node) => node.id).join(","),
  ].join("|");
  return stableHash32(selectionKey) % candidates.length;
}

function stableHash32(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function failure(
  progress: FullGameRunProgressState,
  reason: RunDirectorFailureReason,
  resolvedNodes: readonly RouteNodeState[] = [],
): RunDirectorSelectionResult {
  return {
    ok: false,
    reason,
    availableNodeIds: [...progress.availableNodeIds],
    availableNodeKinds: [...new Set(resolvedNodes.map((node) => node.kind))].sort(),
  };
}

function compareNodeIds(left: RouteNodeId, right: RouteNodeId): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
