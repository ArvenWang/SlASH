import { describe, expect, test } from "vitest";
import {
  CORE_UPGRADE_DEFINITIONS,
  MAX_EQUIPPED_SKILL_FAMILIES,
  REWARD_CHOICE_COUNT,
  SKILL_FAMILIES,
  coreUpgradeById,
  createEmptyBuild,
  createRewardOffer,
  eligibleCoreUpgrades,
  selectRewardUpgrade,
  validateBuild,
} from "../src/redesign/skills";
import {
  CHAPTER_COUNT,
  ENCOUNTERS_PER_CHAPTER,
  STANDARD_RUN,
  STANDARD_RUN_ENCOUNTER_COUNT,
  STANDARD_RUN_REWARD_COUNT,
  validateStandardRun,
} from "../src/redesign/run";
import {
  BOSS_DASH_DAMAGE,
  BOSS_MAXIMUM_HP,
  PLAYABLE_ARENA,
  PLAYABLE_ARENA_SIZE,
  VISUAL_PLATFORM_SIZE,
} from "../src/redesign/config";

describe("Redesign V2.1 compact run", () => {
  test("contains exactly three chapters, nine fights, three bosses and eight rewards", () => {
    expect(() => validateStandardRun()).not.toThrow();
    expect(STANDARD_RUN).toHaveLength(STANDARD_RUN_ENCOUNTER_COUNT);
    expect(STANDARD_RUN_REWARD_COUNT).toBe(STANDARD_RUN_ENCOUNTER_COUNT - 1);
    expect(STANDARD_RUN.filter((definition) => definition.kind === "boss")).toHaveLength(CHAPTER_COUNT);
    for (let chapter = 1; chapter <= CHAPTER_COUNT; chapter += 1) {
      const chapterContent = STANDARD_RUN.filter((definition) => definition.chapter === chapter);
      expect(chapterContent).toHaveLength(ENCOUNTERS_PER_CHAPTER);
      expect(chapterContent.at(-1)?.kind).toBe("boss");
    }
  });

  test("uses five enemy mechanic families and three distinct geometric bosses", () => {
    const archetypes = new Set(STANDARD_RUN.flatMap((definition) => (
      definition.enemies.map((spawn) => spawn.archetype)
    )));
    expect(archetypes).toEqual(new Set(["chaser", "shooter", "spinner", "splitter", "slammer"]));
    expect(STANDARD_RUN.flatMap((definition) => definition.boss ? [definition.boss] : [])).toEqual([
      "prism-hound",
      "cube-fortress",
      "singularity-crown",
    ]);
  });

  test("uses a real 64 by 40 gameplay arena instead of a camera-only enlargement", () => {
    expect(PLAYABLE_ARENA).toEqual({ minX: -32, maxX: 32, minZ: -20, maxZ: 20 });
    expect(PLAYABLE_ARENA_SIZE.width * PLAYABLE_ARENA_SIZE.depth).toBeGreaterThanOrEqual(40 * 25 * 2.5);
    expect(VISUAL_PLATFORM_SIZE.width).toBeGreaterThan(PLAYABLE_ARENA_SIZE.width);
    expect(VISUAL_PLATFORM_SIZE.depth).toBeGreaterThan(PLAYABLE_ARENA_SIZE.depth);
    const spawns = STANDARD_RUN.flatMap((definition) => definition.enemies.map((spawn) => spawn.position));
    expect(Math.max(...spawns.map((position) => position.x)) - Math.min(...spawns.map((position) => position.x))).toBeGreaterThanOrEqual(44.8);
    expect(Math.max(...spawns.map((position) => position.z)) - Math.min(...spawns.map((position) => position.z))).toBeGreaterThanOrEqual(28);
  });

  test("keeps regular enemies one-hit while bosses use explicit multi-hit damage", () => {
    expect(Object.values(BOSS_MAXIMUM_HP).every((hp) => hp > 1)).toBe(true);
    expect(BOSS_DASH_DAMAGE).toEqual({ basic: 1, charged: 2, ultimate: 1 });
    expect(BOSS_DASH_DAMAGE.charged).toBeLessThan(Math.min(...Object.values(BOSS_MAXIMUM_HP)));
  });
});

describe("Redesign V2.1 reward build", () => {
  test("contains exactly five families and fifteen sequential rank upgrades", () => {
    expect(SKILL_FAMILIES).toHaveLength(5);
    expect(CORE_UPGRADE_DEFINITIONS).toHaveLength(15);
    for (const familyId of SKILL_FAMILIES) {
      expect(CORE_UPGRADE_DEFINITIONS.filter((definition) => definition.familyId === familyId)
        .map((definition) => definition.rank)).toEqual([1, 2, 3]);
    }
  });

  test("always offers three different legal families through all eight choices", () => {
    for (let seed = 0; seed < 1_000; seed += 1) {
      let build = createEmptyBuild();
      for (let rewardIndex = 0; rewardIndex < REWARD_CHOICE_COUNT; rewardIndex += 1) {
        const offer = createRewardOffer(seed, rewardIndex, build);
        expect(offer.candidateUpgradeIds).toHaveLength(3);
        const definitions = offer.candidateUpgradeIds.map(coreUpgradeById);
        expect(new Set(definitions.map((definition) => definition.familyId)).size).toBe(3);
        for (const definition of definitions) {
          expect(definition.rank).toBe(build.ranks[definition.familyId] + 1);
          expect(build.equippedFamilyIds.includes(definition.familyId)
            || build.equippedFamilyIds.length < MAX_EQUIPPED_SKILL_FAMILIES).toBe(true);
        }
        const selected = offer.candidateUpgradeIds[seed % 3]!;
        build = selectRewardUpgrade(build, offer, selected);
        expect(() => validateBuild(build)).not.toThrow();
        expect(build.equippedFamilyIds.length).toBeLessThanOrEqual(MAX_EQUIPPED_SKILL_FAMILIES);
        expect(Math.max(...Object.values(build.ranks))).toBeLessThanOrEqual(3);
      }
      expect(build.selectedUpgradeIds).toHaveLength(REWARD_CHOICE_COUNT);
    }
  });

  test("is deterministic, order-independent and rejects stale or illegal cards", () => {
    const build = createEmptyBuild();
    const first = createRewardOffer(88, 0, build);
    expect(createRewardOffer(88, 0, build)).toEqual(first);
    const selected = selectRewardUpgrade(build, first, first.candidateUpgradeIds[0]);
    expect(() => selectRewardUpgrade(selected, first, first.candidateUpgradeIds[1])).toThrow(/index|stale|history/i);
    expect(() => selectRewardUpgrade(build, first, CORE_UPGRADE_DEFINITIONS.find((definition) => (
      !first.candidateUpgradeIds.includes(definition.id)
    ))!.id)).toThrow(/not in the active offer/i);
    expect(eligibleCoreUpgrades(build)).toHaveLength(5);
  });
});
