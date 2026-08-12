import { describe, expect, test } from "vitest";
import { FULL_GAME_SKILL_DEFINITIONS } from "../src/content/upgrades/skill-tree";
import type { SkillDefinition } from "../src/content/upgrades/types";
import {
  createRewardDraft,
  selectRewardCandidate,
} from "../src/game/rewards/reward-draft-system";

const definitionById = new Map(FULL_GAME_SKILL_DEFINITIONS.map((definition) => [definition.id, definition]));

function definitions(...ids: string[]): SkillDefinition[] {
  return ids.map((id) => {
    const definition = definitionById.get(id);
    if (!definition) throw new Error(`Missing test skill definition: ${id}`);
    return definition;
  });
}

describe("V2 deterministic reward draft", () => {
  test("returns exactly three different eligible candidates", () => {
    const ownedSkillIds = ["skill-curve-dash-v1"];
    const candidateDefinitions = definitions(
      "skill-gravity-slash-v1",
      "skill-curve-dash-v1",
      "skill-refraction-v1",
      "skill-cross-execution-v1",
      "skill-echo-slash-v1",
    );

    const result = createRewardDraft({
      seed: 7401,
      rewardIndex: 2,
      ownedSkillIds,
      candidateDefinitions,
      poolVersion: "confirmed-v2.0",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`Expected reward draft, received ${result.reason}.`);
    expect(result.state.candidateSkillIds).toHaveLength(3);
    expect(new Set(result.state.candidateSkillIds).size).toBe(3);
    expect(new Set(result.state.candidateSkillIds)).toEqual(new Set([
      "skill-refraction-v1",
      "skill-cross-execution-v1",
      "skill-echo-slash-v1",
    ]));
    expect(result.state.candidateSkillIds).not.toContain("skill-curve-dash-v1");
    expect(result.state.candidateSkillIds).not.toContain("skill-gravity-slash-v1");
  });

  test("is deterministic and independent of candidate and owned array order", () => {
    const candidateDefinitions = FULL_GAME_SKILL_DEFINITIONS.slice(0, 18);
    const ownedSkillIds = ["skill-wide-slash-v1", "skill-refraction-v1"];
    const input = {
      seed: 91_337,
      rewardIndex: 7,
      ownedSkillIds,
      candidateDefinitions,
      poolVersion: "confirmed-v2.0",
    } as const;

    const first = createRewardDraft(input);
    const repeated = createRewardDraft(input);
    const reordered = createRewardDraft({
      ...input,
      ownedSkillIds: [...ownedSkillIds].reverse(),
      candidateDefinitions: [...candidateDefinitions].reverse(),
    });

    expect(first).toEqual(repeated);
    expect(reordered).toEqual(first);
  });

  test("includes reward index and pool version in the deterministic offer", () => {
    const baseInput = {
      seed: 2_026,
      rewardIndex: 0,
      ownedSkillIds: [],
      candidateDefinitions: FULL_GAME_SKILL_DEFINITIONS,
      poolVersion: "confirmed-v2.0",
    } as const;
    const first = createRewardDraft(baseInput);
    const nextReward = createRewardDraft({ ...baseInput, rewardIndex: 1 });
    const nextPool = createRewardDraft({ ...baseInput, poolVersion: "confirmed-v2.1" });

    expect(first.ok && nextReward.ok && nextPool.ok).toBe(true);
    if (!first.ok || !nextReward.ok || !nextPool.ok) throw new Error("Expected valid reward drafts.");
    expect(nextReward.state.offerId).not.toBe(first.state.offerId);
    expect(nextPool.state.offerId).not.toBe(first.state.offerId);
    expect(nextReward.state.candidateSkillIds).not.toEqual(first.state.candidateSkillIds);
    expect(nextPool.state.candidateSkillIds).not.toEqual(first.state.candidateSkillIds);
  });

  test("returns an explicit failure when fewer than three candidates are eligible", () => {
    const result = createRewardDraft({
      seed: 4,
      rewardIndex: 0,
      ownedSkillIds: [],
      candidateDefinitions: definitions(
        "skill-curve-dash-v1",
        "skill-gravity-slash-v1",
      ),
      poolVersion: "confirmed-v2.0",
    });

    expect(result).toEqual({
      ok: false,
      reason: "insufficient-eligible-candidates",
      eligibleCandidateCount: 1,
      requiredCandidateCount: 3,
    });
  });

  test("rejects ambiguous pools with duplicate skill ids", () => {
    const [definition] = definitions("skill-curve-dash-v1");
    const result = createRewardDraft({
      seed: 4,
      rewardIndex: 0,
      ownedSkillIds: [],
      candidateDefinitions: [definition!, definition!],
      poolVersion: "confirmed-v2.0",
    });

    expect(result).toEqual({
      ok: false,
      reason: "duplicate-candidate-id",
      skillId: "skill-curve-dash-v1",
    });
  });

  test("selects one offered skill without mutating state and rejects repeat or stale choices", () => {
    const draft = createRewardDraft({
      seed: 808,
      rewardIndex: 3,
      ownedSkillIds: [],
      candidateDefinitions: definitions(
        "skill-curve-dash-v1",
        "skill-refraction-v1",
        "skill-cross-execution-v1",
        "skill-echo-slash-v1",
      ),
      poolVersion: "confirmed-v2.0",
    });
    if (!draft.ok) throw new Error(`Expected reward draft, received ${draft.reason}.`);
    const selectedSkillId = draft.state.candidateSkillIds[1];

    const selection = selectRewardCandidate(draft.state, {
      offerId: draft.state.offerId,
      skillId: selectedSkillId,
    });

    expect(selection.ok).toBe(true);
    if (!selection.ok) throw new Error(`Expected reward selection, received ${selection.reason}.`);
    expect(selection.awardedSkillId).toBe(selectedSkillId);
    expect(selection.state.selectedSkillId).toBe(selectedSkillId);
    expect(draft.state.selectedSkillId).toBeNull();
    expect(selectRewardCandidate(selection.state, {
      offerId: selection.state.offerId,
      skillId: selection.state.candidateSkillIds[0],
    })).toEqual({
      ok: false,
      reason: "already-selected",
      selectedSkillId,
    });
    expect(selectRewardCandidate(draft.state, {
      offerId: "stale-offer",
      skillId: selectedSkillId,
    })).toEqual({ ok: false, reason: "stale-offer" });
    expect(selectRewardCandidate(draft.state, {
      offerId: draft.state.offerId,
      skillId: "skill-not-offered-v1",
    })).toEqual({ ok: false, reason: "not-a-candidate" });
  });
});
