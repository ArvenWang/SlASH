import type { UpgradeId } from "../../core/ids";
import type { SkillDefinition } from "../../content/upgrades/types";

export const REWARD_DRAFT_SIZE = 3 as const;

export type RewardCandidateSkillIds = readonly [UpgradeId, UpgradeId, UpgradeId];

export interface RewardDraftInput {
  readonly seed: number;
  readonly rewardIndex: number;
  readonly ownedSkillIds: readonly UpgradeId[];
  readonly candidateDefinitions: readonly SkillDefinition[];
  readonly poolVersion: string;
}

export interface RewardDraftState {
  readonly offerId: string;
  readonly seed: number;
  readonly rewardIndex: number;
  readonly poolVersion: string;
  readonly candidateSkillIds: RewardCandidateSkillIds;
  readonly selectedSkillId: UpgradeId | null;
}

export type RewardDraftResult =
  | {
      readonly ok: true;
      readonly state: RewardDraftState;
    }
  | {
      readonly ok: false;
      readonly reason: "invalid-seed" | "invalid-reward-index" | "invalid-pool-version";
    }
  | {
      readonly ok: false;
      readonly reason: "duplicate-candidate-id";
      readonly skillId: UpgradeId;
    }
  | {
      readonly ok: false;
      readonly reason: "insufficient-eligible-candidates";
      readonly eligibleCandidateCount: number;
      readonly requiredCandidateCount: typeof REWARD_DRAFT_SIZE;
    };

export interface SelectRewardCandidateCommand {
  readonly offerId: string;
  readonly skillId: UpgradeId;
}

export type RewardSelectionResult =
  | {
      readonly ok: true;
      readonly awardedSkillId: UpgradeId;
      readonly state: RewardDraftState;
    }
  | {
      readonly ok: false;
      readonly reason: "stale-offer" | "not-a-candidate";
    }
  | {
      readonly ok: false;
      readonly reason: "already-selected";
      readonly selectedSkillId: UpgradeId;
    };
