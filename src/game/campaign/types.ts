import type { EncounterTemplateId, RouteNodeId } from "../../core/ids";
import type { EncounterRuntimeState } from "../encounters/types";
import type { FullGameRunProgressState, RouteReward } from "../run/types";
import type { SkillAllocationState } from "../upgrades/types";

export type CampaignPhase = "title" | "planning" | "event" | "forge" | "combat" | "reward" | "defeat" | "victory";

export interface CampaignRewardState {
  readonly completedNodeId: RouteNodeId;
  readonly routeReward: RouteReward;
  readonly skillPointsGranted: number;
  readonly eliteRewardConverted: boolean;
}

export interface FullGameCampaignState {
  readonly contentVersion: "full-game-v1";
  phase: CampaignPhase;
  routeProgress: FullGameRunProgressState;
  skills: SkillAllocationState;
  provisionalRouteNodeId: RouteNodeId | null;
  activeEncounterTemplateId: EncounterTemplateId | null;
  encounterRuntime: EncounterRuntimeState | null;
  activeTriggerIds: string[];
  pendingReward: CampaignRewardState | null;
  eliteSkillPointRewardsGranted: number;
  activeEventDefinitionId: string | null;
  eventHistory: Array<{ nodeId: RouteNodeId; eventDefinitionId: string; choiceId: string }>;
  forgeTokensSpentThisVisit: number;
}
