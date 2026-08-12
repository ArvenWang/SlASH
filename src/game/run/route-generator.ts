import type { RouteNodeId } from "../../core/ids";
import { createSeededRandom } from "../../core/random/seeded-random";
import { FULL_GAME_RUN_DEFINITION, type ActDefinition, type RouteNodeKind, type RunDefinition } from "../../content/runs/definitions";
import type {
  ActRouteGraph,
  RouteReward,
  RouteNodeState,
  RouteValidationResult,
  RunRouteGraph,
} from "./types";

export type {
  ActRouteGraph,
  RouteNodeState,
  RouteValidationResult,
  RunRouteGraph,
} from "./types";

export function generateRunRoute(
  seed: number,
  definition: RunDefinition = FULL_GAME_RUN_DEFINITION,
  threatLevel = 0,
): RunRouteGraph {
  const normalizedSeed = Number.isFinite(seed) ? Math.trunc(seed) >>> 0 : 0;
  const random = createSeededRandom(normalizedSeed);
  const acts = definition.acts.map((act) => generateActRoute(act, random, threatLevel));
  const graph: RunRouteGraph = {
    runDefinitionId: definition.id,
    seed: normalizedSeed,
    random: random.snapshot(),
    acts,
  };
  validateRunRoute(graph, definition);
  return graph;
}

function generateActRoute(
  act: ActDefinition,
  random: ReturnType<typeof createSeededRandom>,
  threatLevel: number,
): ActRouteGraph {
  const nodeKindsByLayer = act.layers.map((layer) => createLayerKinds(
    layer.role,
    layer.nodeCount,
    random,
    threatLevel,
  ));
  const nodeIdsByLayer = act.layers.map((layer) => (
    Array.from({ length: layer.nodeCount }, (_, nodeIndex) => createRouteNodeId(act, layer.index, nodeIndex))
  ));

  const layers = act.layers.map((layer, layerIndex) => {
    const currentIds = nodeIdsByLayer[layerIndex];
    const nextIds = nodeIdsByLayer[layerIndex + 1] ?? [];
    if (!currentIds) throw new Error(`Missing route IDs for ${act.id} layer ${layer.index}.`);
    const sourceRotation = currentIds.length > 1 ? Math.floor(random.next() * currentIds.length) : 0;
    return currentIds.map((id, nodeIndex): RouteNodeState => {
      const kind = nodeKindsByLayer[layerIndex]?.[nodeIndex];
      if (!kind) throw new Error(`Missing route kind for ${id}.`);
      return {
        id,
        actId: act.id,
        actIndex: act.index,
        layerIndex: layer.index,
        nodeIndex,
        kind,
        reward: rewardForNode(act, layer.index, kind),
        nextNodeIds: nextIds.length === 0
          ? []
          : connectedNextNodeIds(nodeIndex, currentIds.length, nextIds, sourceRotation),
      };
    });
  });

  const firstLayer = layers[0];
  const bossLayer = layers.at(-1);
  const boss = bossLayer?.[0];
  if (!firstLayer || !boss) throw new Error(`Act ${act.id} must contain entry and boss layers.`);
  return {
    actId: act.id,
    actIndex: act.index,
    layers,
    entryNodeIds: firstLayer.map((node) => node.id),
    bossNodeId: boss.id,
  };
}

function createLayerKinds(
  role: ActDefinition["layers"][number]["role"],
  nodeCount: number,
  random: ReturnType<typeof createSeededRandom>,
  threatLevel: number,
): RouteNodeKind[] {
  if (role === "boss") return ["boss"];
  if (role === "opening-combat" || role === "pre-boss") {
    return Array.from({ length: nodeCount }, () => "combat" as const);
  }
  if (role === "safe-choice") {
    const optionalSafeKind: RouteNodeKind = random.next() < 0.5 ? "forge" : "challenge";
    return random.next() < 0.5 ? ["event", optionalSafeKind] : [optionalSafeKind, "event"];
  }
  const eliteIndex = Math.floor(random.next() * nodeCount);
  const additionalEliteIndex = threatLevel >= 1 && nodeCount >= 3
    ? (eliteIndex + 1 + Math.floor(random.next() * (nodeCount - 1))) % nodeCount
    : -1;
  return Array.from({ length: nodeCount }, (_, index) => (
    index === eliteIndex || index === additionalEliteIndex ? "elite" : "combat"
  ));
}

function rewardForNode(act: ActDefinition, layerIndex: number, kind: RouteNodeKind): RouteReward {
  if (kind === "boss") return act.index === FULL_GAME_RUN_DEFINITION.acts.length - 1 ? "run-victory" : "act-clear";
  if (kind === "elite") return "elite-bonus";
  return act.guaranteedSkillRewardLayers.includes(layerIndex) ? "skill-point" : "none";
}

function createRouteNodeId(act: ActDefinition, layerIndex: number, nodeIndex: number): RouteNodeId {
  return `${act.id}:layer-${String(layerIndex + 1).padStart(2, "0")}:node-${String(nodeIndex + 1).padStart(2, "0")}`;
}

function connectedNextNodeIds(
  nodeIndex: number,
  currentCount: number,
  nextIds: readonly RouteNodeId[],
  sourceRotation: number,
): RouteNodeId[] {
  if (nextIds.length === 1) return [nextIds[0]!];
  const projectedSourceIndex = (nodeIndex + sourceRotation) % currentCount;
  const primaryIndex = Math.min(
    nextIds.length - 1,
    Math.floor(projectedSourceIndex * nextIds.length / currentCount),
  );
  const secondaryIndex = primaryIndex < nextIds.length - 1 ? primaryIndex + 1 : primaryIndex - 1;
  return [nextIds[primaryIndex]!, nextIds[secondaryIndex]!].sort();
}

export function validateRunRoute(
  graph: RunRouteGraph,
  definition: RunDefinition = FULL_GAME_RUN_DEFINITION,
): RouteValidationResult {
  assert(graph.runDefinitionId === definition.id, "run definition id mismatch");
  assert(graph.acts.length === definition.acts.length, "act count mismatch");
  const allNodes = graph.acts.flatMap((act) => act.layers.flatMap((layer) => layer));
  const allIds = new Set(allNodes.map((node) => node.id));
  assert(allIds.size === allNodes.length, "duplicate route node id");

  let edgeCount = 0;
  let guaranteedSkillRewards = 0;
  let optionalEliteRewards = 0;
  graph.acts.forEach((actGraph, actIndex) => {
    const actDefinition = definition.acts[actIndex];
    assert(actDefinition !== undefined, `missing act definition ${actIndex}`);
    assert(actGraph.actId === actDefinition.id, `act id mismatch at ${actIndex}`);
    assert(actGraph.layers.length === actDefinition.layers.length, `layer count mismatch in ${actGraph.actId}`);
    assert(actGraph.entryNodeIds.length >= 2, `act ${actGraph.actId} must have at least two entries`);
    assert(isBossReachableFromEveryEntry(actGraph), `boss is not reachable from every entry in ${actGraph.actId}`);
    guaranteedSkillRewards += actDefinition.guaranteedSkillRewardLayers.length;

    actGraph.layers.forEach((layer, layerIndex) => {
      const layerDefinition = actDefinition.layers[layerIndex];
      assert(layerDefinition !== undefined, `missing layer definition ${layerIndex}`);
      assert(layer.length === layerDefinition.nodeCount, `node count mismatch in ${actGraph.actId} layer ${layerIndex}`);
      const nextLayerIds = new Set((actGraph.layers[layerIndex + 1] ?? []).map((node) => node.id));
      if (actDefinition.guaranteedSkillRewardLayers.includes(layerIndex)) {
        assert(layer.every((node) => node.reward === "skill-point"), `missing guaranteed reward in ${actGraph.actId} layer ${layerIndex}`);
      }
      if (layerIndex < actGraph.layers.length - 1) {
        assert(nextLayerIds.size > 0, `missing next layer in ${actGraph.actId}`);
        const incoming = new Set<RouteNodeId>();
        for (const node of layer) {
          assert(node.nextNodeIds.length >= 1, `dead-end route node ${node.id}`);
          for (const nextId of node.nextNodeIds) {
            assert(nextLayerIds.has(nextId), `invalid route edge ${node.id} -> ${nextId}`);
            incoming.add(nextId);
            edgeCount += 1;
          }
        }
        assert(incoming.size === nextLayerIds.size, `unreachable node in ${actGraph.actId} layer ${layerIndex + 1}`);
      } else {
        assert(layer.length === 1 && layer[0]?.kind === "boss", `final layer of ${actGraph.actId} must be one boss`);
        assert(layer[0]?.nextNodeIds.length === 0, `boss ${layer[0]?.id} must not have an in-act edge`);
      }
    });

    const safeLayer = actGraph.layers.find((layer) => layer[0]?.layerIndex === 2);
    assert(safeLayer?.some((node) => node.kind === "event") === true, `act ${actGraph.actId} needs an event choice`);
    assert(safeLayer?.every((node) => node.kind === "event" || node.kind === "forge" || node.kind === "challenge") === true, `safe layer in ${actGraph.actId} contains combat`);
  });

  for (const node of allNodes) {
    if (node.reward === "elite-bonus") optionalEliteRewards += 1;
  }
  assert(
    definition.startingSkillPoints + guaranteedSkillRewards === definition.guaranteedSkillPoints,
    "guaranteed skill reward total mismatch",
  );
  return {
    ok: true,
    actCount: graph.acts.length,
    nodeCount: allNodes.length,
    edgeCount,
    guaranteedSkillRewards,
    optionalEliteRewards,
  };
}

function isBossReachableFromEveryEntry(act: ActRouteGraph): boolean {
  const nodes = new Map(act.layers.flatMap((layer) => layer).map((node) => [node.id, node]));
  return act.entryNodeIds.every((entryId) => {
    const pending = [entryId];
    const visited = new Set<RouteNodeId>();
    while (pending.length > 0) {
      const currentId = pending.pop();
      if (!currentId || visited.has(currentId)) continue;
      if (currentId === act.bossNodeId) return true;
      visited.add(currentId);
      const current = nodes.get(currentId);
      if (!current) return false;
      pending.push(...current.nextNodeIds);
    }
    return false;
  });
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid full-game route: ${message}`);
}
