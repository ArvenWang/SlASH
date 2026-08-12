import { describe, expect, test } from "vitest";
import { createFullGameGame } from "../src/game/game";
import { completeFullRunForValidation } from "../src/game/validation/full-run-autoplayer";
import { createReplayRecorder, playReplay } from "../src/game/replay/replay";

const V2_FULL_RUN_SEEDS = [0, 1, 911] as const;

describe("full-run V2 deterministic replay", () => {
  test.each(V2_FULL_RUN_SEEDS)("replays one auto-directed reward-choice run for seed %i", (seed) => {
    const state = createFullGameGame(seed);
    const recorder = createReplayRecorder(state);
    const result = completeFullRunForValidation(state, (command) => recorder.dispatch(command));
    const log = recorder.finish();
    const replay = playReplay(log);
    const completedNodeIds = state.run.fullGame?.routeProgress.completedNodeIds ?? [];
    const selectedRewardSkillIds = log.entries.flatMap((entry) => (
      entry.command.type === "select-reward-skill" ? [entry.command.skillId] : []
    ));

    expect(result.victory).toBe(true);
    expect(state.run.fullGame?.phase).toBe("victory");
    expect(state.run.fullGame?.routeProgress.phase).toBe("victory");
    expect(result.completedNodes).toHaveLength(completedNodeIds.length);
    expect(result.completedNodes.length).toBeGreaterThan(4);
    expect(result.bosses).toHaveLength(4);
    expect(new Set(result.bosses).size).toBe(4);

    expect(result.rewardChoices).toHaveLength(result.completedNodes.length - 1);
    expect(result.finalSkills).toHaveLength(result.rewardChoices.length);
    expect(new Set(result.finalSkills).size).toBe(result.finalSkills.length);
    expect(new Set(selectedRewardSkillIds)).toEqual(new Set(result.finalSkills));
    expect(result.finalSkills).toEqual(state.run.selectedUpgrades);

    expect(replay.matched).toBe(true);
    expect(replay.actualStateHash).toBe(log.expectedStateHash);
    expect(replay.state.run.fullGame?.phase).toBe("victory");
    expect(replay.state.run.fullGame?.routeProgress.completedNodeIds).toEqual(completedNodeIds);
    expect(replay.state.run.selectedUpgrades).toEqual(result.finalSkills);
  }, 60_000);
});
