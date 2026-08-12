import type { BossDefinitionId, EncounterTemplateId, RouteNodeId } from "../../core/ids";
import type { RunResourceId } from "../../content/events/definitions";
import type { EncounterRuntimeState } from "../encounters/types";
import type { FullGameRunProgressState, RouteReward } from "../run/types";
import type { SkillAllocationState } from "../upgrades/types";
import type { BossRuntimeState } from "../bosses/types";
import type { RunProtocolState } from "../difficulty/types";

export type CampaignPhase = "title" | "planning" | "event" | "forge" | "combat" | "reward" | "defeat" | "victory";

export type CampaignChallengeStatus = "active" | "succeeded" | "failed";

export interface CampaignChallengeRuntimeState {
  readonly definitionId: string;
  status: CampaignChallengeStatus;
  readonly startedAtMs: number;
  elapsedMs: number;
  projectileCuts: number;
  obstacleImpacts: number;
  currentChargedArmorBreaks: number;
  maximumChargedArmorBreaks: number;
  ultimateExecuted: boolean;
  lastProcessedEventSequence: number;
  failureReason: string | null;
}

export interface CampaignChallengeRewardState {
  readonly definitionId: string;
  readonly status: Exclude<CampaignChallengeStatus, "active">;
  readonly failureReason: string | null;
  readonly rewardResourceId: RunResourceId;
  readonly rewardAmount: number;
  readonly resourceBefore: number;
  readonly resourceAfter: number;
}

export interface CampaignRewardState {
  readonly completedNodeId: RouteNodeId;
  readonly routeReward: RouteReward;
  readonly skillPointsGranted: number;
  readonly eliteRewardConverted: boolean;
  readonly challenge: CampaignChallengeRewardState | null;
}

export interface CampaignRunMetricsState {
  startedAtMs: number;
  kills: number;
  armorBreaks: number;
  projectileCuts: number;
  bossBreaks: number;
  lastProcessedEventSequence: number;
  deathSourceId: string | null;
  deathSourceLabel: string | null;
}

export interface FullGameCampaignState {
  readonly contentVersion: "full-game-v1";
  protocol: RunProtocolState;
  runMetrics: CampaignRunMetricsState;
  phase: CampaignPhase;
  routeProgress: FullGameRunProgressState;
  skills: SkillAllocationState;
  provisionalRouteNodeId: RouteNodeId | null;
  activeEncounterTemplateId: EncounterTemplateId | null;
  encounterRuntime: EncounterRuntimeState | null;
  activeChallenge: CampaignChallengeRuntimeState | null;
  activeBoss: BossRuntimeState | null;
  practiceBossDefinitionId: BossDefinitionId | null;
  activeTriggerIds: string[];
  pendingReward: CampaignRewardState | null;
  eliteSkillPointRewardsGranted: number;
  activeEventDefinitionId: string | null;
  eventHistory: Array<{ nodeId: RouteNodeId; eventDefinitionId: string; choiceId: string }>;
  forgeTokensSpentThisVisit: number;
}
