import type { ActDefinitionId, RouteNodeId, RunDefinitionId } from "../../core/ids";
import type { SeededRandomState } from "../../core/random/seeded-random";
import type { RouteNodeKind } from "../../content/runs/definitions";

export type RouteReward = "none" | "skill-point" | "elite-bonus" | "act-clear" | "run-victory";

export interface RouteNodeState {
  readonly id: RouteNodeId;
  readonly actId: ActDefinitionId;
  readonly actIndex: number;
  readonly layerIndex: number;
  readonly nodeIndex: number;
  readonly kind: RouteNodeKind;
  readonly reward: RouteReward;
  readonly nextNodeIds: readonly RouteNodeId[];
}

export interface ActRouteGraph {
  readonly actId: ActDefinitionId;
  readonly actIndex: number;
  readonly layers: readonly (readonly RouteNodeState[])[];
  readonly entryNodeIds: readonly RouteNodeId[];
  readonly bossNodeId: RouteNodeId;
}

export interface RunRouteGraph {
  readonly runDefinitionId: RunDefinitionId;
  readonly seed: number;
  readonly random: SeededRandomState;
  readonly acts: readonly ActRouteGraph[];
}

export interface RouteValidationResult {
  readonly ok: true;
  readonly actCount: number;
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly guaranteedSkillRewards: number;
  readonly optionalEliteRewards: number;
}

export type RunProgressPhase = "route-map" | "encounter" | "victory";

export interface FullGameRunProgressState {
  readonly route: RunRouteGraph;
  phase: RunProgressPhase;
  actIndex: number;
  layerIndex: number;
  currentNodeId: RouteNodeId | null;
  availableNodeIds: RouteNodeId[];
  completedNodeIds: RouteNodeId[];
}
