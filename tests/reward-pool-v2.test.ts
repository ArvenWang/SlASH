import { describe, expect, test } from "vitest";
import { FULL_GAME_SKILL_IDS, fullGameSkillById } from "../src/content/upgrades/skill-tree";
import {
  REWARD_POOL_V2,
  REWARD_POOL_V2_DISABLED_IDS,
  REWARD_POOL_V2_ENABLED_IDS,
  REWARD_POOL_V2_ENTRIES,
  REWARD_POOL_V2_POOL_VERSION,
  rewardPoolV2EntryById,
  rewardPoolV2SkillDefinitionById,
} from "../src/content/upgrades/reward-pool-v2";
import { MAXIMUM_SKILL_POINTS } from "../src/game/upgrades/skill-system";

const CONFIRMED_SKILL_IDS = [
  "skill-cross-execution-v1",
  "skill-echo-slash-v1",
  "skill-kill-momentum-v1",
].sort();

describe("V2 reward content pool", () => {
  test("uses one stable pool version and unique enabled ids", () => {
    const entryIds = REWARD_POOL_V2_ENTRIES.map((entry) => entry.id);

    expect(REWARD_POOL_V2_POOL_VERSION).toBe("reward-pool-v2.0.0");
    expect(REWARD_POOL_V2.poolVersion).toBe(REWARD_POOL_V2_POOL_VERSION);
    expect(REWARD_POOL_V2.enabledIds).toEqual(REWARD_POOL_V2_ENABLED_IDS);
    expect(entryIds).toEqual(REWARD_POOL_V2_ENABLED_IDS);
    expect(new Set(entryIds).size).toBe(entryIds.length);
    expect(entryIds.length).toBeGreaterThanOrEqual(MAXIMUM_SKILL_POINTS + 2);
  });

  test("resolves every enabled id to one real implemented skill definition", () => {
    for (const entry of REWARD_POOL_V2_ENTRIES) {
      expect(fullGameSkillById(entry.id).id).toBe(entry.id);
      expect(rewardPoolV2EntryById(entry.id)).toBe(entry);
      expect(rewardPoolV2SkillDefinitionById(entry.id).id).toBe(entry.id);
    }

    const accountedIds = [...REWARD_POOL_V2_ENABLED_IDS, ...REWARD_POOL_V2_DISABLED_IDS].sort();
    expect(accountedIds).toEqual([...FULL_GAME_SKILL_IDS].sort());
    expect(accountedIds.some((id) => /return-slash|death-mark|twin-path/i.test(id))).toBe(false);
  });

  test("marks only the three user-confirmed directions as confirmed", () => {
    const confirmedIds = REWARD_POOL_V2_ENTRIES
      .filter((entry) => entry.productStatus === "confirmed")
      .map((entry) => entry.id)
      .sort();

    expect(confirmedIds).toEqual(CONFIRMED_SKILL_IDS);
    expect(REWARD_POOL_V2_ENTRIES.every((entry) => (
      entry.productStatus === "confirmed" || entry.productStatus === "implemented-review"
    ))).toBe(true);
    expect(REWARD_POOL_V2_ENTRIES.filter((entry) => entry.productStatus === "implemented-review").length)
      .toBe(REWARD_POOL_V2_ENTRIES.length - CONFIRMED_SKILL_IDS.length);
  });

  test("keeps every player-facing card short, single-language, and free of internal terms", () => {
    const forbiddenCopy = /[A-Za-z/／]|技能点|种子|触发|限制|前置/;

    for (const entry of REWARD_POOL_V2_ENTRIES) {
      expect(entry.name).toBe(entry.name.trim());
      expect(entry.effect).toBe(entry.effect.trim());
      expect(entry.name).toMatch(/^[\p{Script=Han}]+$/u);
      expect(entry.name.length).toBeLessThanOrEqual(8);
      expect(entry.effect).toMatch(/[\p{Script=Han}]/u);
      expect(entry.effect.length).toBeLessThanOrEqual(32);
      expect(entry.effect.endsWith("。")).toBe(true);
      expect(entry.effect.match(/。/g)).toHaveLength(1);
      expect(`${entry.name}${entry.effect}`).not.toMatch(forbiddenCopy);
      expect(`${entry.name}${entry.effect}`).not.toContain("\n");
    }
  });

  test("disables the implemented Gravity and Near-Miss direction", () => {
    expect(REWARD_POOL_V2_DISABLED_IDS).toEqual(["skill-gravity-slash-v1"]);
    expect(REWARD_POOL_V2_ENABLED_IDS).not.toContain("skill-gravity-slash-v1");
    expect(REWARD_POOL_V2_ENABLED_IDS.some((id) => /gravity|near-miss/i.test(id))).toBe(false);
    expect(() => rewardPoolV2EntryById("skill-gravity-slash-v1")).toThrow(/not enabled/);
  });
});
