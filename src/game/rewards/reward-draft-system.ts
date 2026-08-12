import type { UpgradeId } from "../../core/ids";
import { createSeededRandom } from "../../core/random/seeded-random";
import type { SkillDefinition } from "../../content/upgrades/types";
import {
  REWARD_DRAFT_SIZE,
  type RewardCandidateSkillIds,
  type RewardDraftInput,
  type RewardDraftResult,
  type RewardDraftState,
  type RewardSelectionResult,
  type SelectRewardCandidateCommand,
} from "./types";

export function createRewardDraft(input: RewardDraftInput): RewardDraftResult {
  if (!Number.isSafeInteger(input.seed)) {
    return { ok: false, reason: "invalid-seed" };
  }
  if (!Number.isSafeInteger(input.rewardIndex) || input.rewardIndex < 0) {
    return { ok: false, reason: "invalid-reward-index" };
  }
  if (input.poolVersion.trim().length === 0) {
    return { ok: false, reason: "invalid-pool-version" };
  }

  const duplicateSkillId = findDuplicateSkillId(input.candidateDefinitions);
  if (duplicateSkillId !== null) {
    return { ok: false, reason: "duplicate-candidate-id", skillId: duplicateSkillId };
  }

  const ownedSkillIds = new Set(input.ownedSkillIds);
  const eligibleDefinitions = [...input.candidateDefinitions]
    .filter((definition) => isEligibleCandidate(definition, ownedSkillIds))
    .sort((left, right) => compareStableIds(left.id, right.id));

  if (eligibleDefinitions.length < REWARD_DRAFT_SIZE) {
    return {
      ok: false,
      reason: "insufficient-eligible-candidates",
      eligibleCandidateCount: eligibleDefinitions.length,
      requiredCandidateCount: REWARD_DRAFT_SIZE,
    };
  }

  const normalizedOwnedSkillIds = [...ownedSkillIds].sort(compareStableIds);
  const eligibleSkillIds = eligibleDefinitions.map((definition) => definition.id);
  const draftSeed = deriveRewardDraftSeed(
    input.seed,
    input.rewardIndex,
    input.poolVersion,
    normalizedOwnedSkillIds,
    eligibleSkillIds,
  );
  const random = createSeededRandom(draftSeed);
  const shuffled = [...eligibleDefinitions];

  for (let index = 0; index < REWARD_DRAFT_SIZE; index += 1) {
    const remainingCount = shuffled.length - index;
    const selectedIndex = index + Math.floor(random.next() * remainingCount);
    [shuffled[index], shuffled[selectedIndex]] = [shuffled[selectedIndex]!, shuffled[index]!];
  }

  const candidateSkillIds: RewardCandidateSkillIds = [
    shuffled[0]!.id,
    shuffled[1]!.id,
    shuffled[2]!.id,
  ];
  const state: RewardDraftState = {
    offerId: createOfferId(input.rewardIndex, input.poolVersion, draftSeed),
    seed: input.seed,
    rewardIndex: input.rewardIndex,
    poolVersion: input.poolVersion,
    candidateSkillIds,
    selectedSkillId: null,
  };

  return { ok: true, state };
}

export function selectRewardCandidate(
  state: RewardDraftState,
  command: SelectRewardCandidateCommand,
): RewardSelectionResult {
  if (command.offerId !== state.offerId) {
    return { ok: false, reason: "stale-offer" };
  }
  if (state.selectedSkillId !== null) {
    return {
      ok: false,
      reason: "already-selected",
      selectedSkillId: state.selectedSkillId,
    };
  }
  if (!state.candidateSkillIds.includes(command.skillId)) {
    return { ok: false, reason: "not-a-candidate" };
  }

  return {
    ok: true,
    awardedSkillId: command.skillId,
    state: {
      ...state,
      selectedSkillId: command.skillId,
    },
  };
}

function isEligibleCandidate(
  definition: SkillDefinition,
  ownedSkillIds: ReadonlySet<UpgradeId>,
): boolean {
  return !ownedSkillIds.has(definition.id)
    && definition.prerequisites.every((prerequisiteId) => ownedSkillIds.has(prerequisiteId));
}

function findDuplicateSkillId(definitions: readonly SkillDefinition[]): UpgradeId | null {
  const seen = new Set<UpgradeId>();
  for (const definition of definitions) {
    if (seen.has(definition.id)) return definition.id;
    seen.add(definition.id);
  }
  return null;
}

function deriveRewardDraftSeed(
  seed: number,
  rewardIndex: number,
  poolVersion: string,
  ownedSkillIds: readonly UpgradeId[],
  eligibleSkillIds: readonly UpgradeId[],
): number {
  let hash = 0x811c9dc5;
  hash = hashField(hash, String(seed));
  hash = hashField(hash, String(rewardIndex));
  hash = hashField(hash, poolVersion);
  for (const skillId of ownedSkillIds) hash = hashField(hash, `owned:${skillId}`);
  for (const skillId of eligibleSkillIds) hash = hashField(hash, `eligible:${skillId}`);
  return hash >>> 0;
}

function hashField(initialHash: number, value: string): number {
  let hash = initialHash >>> 0;
  const framedValue = `${value.length}:${value}|`;
  for (let index = 0; index < framedValue.length; index += 1) {
    hash ^= framedValue.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function createOfferId(rewardIndex: number, poolVersion: string, draftSeed: number): string {
  return `reward-${rewardIndex}-${draftSeed.toString(16).padStart(8, "0")}-${hashField(0x811c9dc5, poolVersion).toString(16).padStart(8, "0")}`;
}

function compareStableIds(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
