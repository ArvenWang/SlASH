import { describe, expect, test } from "vitest";
import { FULL_GAME_SKILL_DEFINITIONS } from "../src/content/upgrades/skill-tree";
import {
  MAXIMUM_SKILL_POINTS,
  closeSkillAllocationVisit,
  commitSkillDraft,
  createSkillAllocationState,
  discardSkillDraft,
  effectiveSkillIds,
  grantSkillPoints,
  openSkillAllocationVisit,
  previewSkillPurchase,
  previewSkillRefund,
  skillAllocationSnapshot,
  unspentSkillPoints,
} from "../src/game/upgrades/skill-system";
import { createGame, queueDash } from "../src/game/game";

describe("full-game skill definitions", () => {
  test("contains 28 fully described one-point passive nodes", () => {
    expect(FULL_GAME_SKILL_DEFINITIONS).toHaveLength(28);
    expect(new Set(FULL_GAME_SKILL_DEFINITIONS.map((skill) => skill.id)).size).toBe(28);
    expect(FULL_GAME_SKILL_DEFINITIONS.every((skill) => (
      skill.cost === 1 &&
      skill.hookIds.length > 0 &&
      skill.presentation.effect.length > 0 &&
      skill.presentation.trigger.length > 0 &&
      skill.presentation.limit.length > 0 &&
      skill.presentation.prerequisite.length > 0
    ))).toBe(true);
    expect(FULL_GAME_SKILL_DEFINITIONS.filter((skill) => skill.module === "basic")).toHaveLength(12);
    expect(FULL_GAME_SKILL_DEFINITIONS.filter((skill) => skill.module === "charged")).toHaveLength(9);
    expect(FULL_GAME_SKILL_DEFINITIONS.filter((skill) => skill.module === "ultimate")).toHaveLength(6);
    expect(FULL_GAME_SKILL_DEFINITIONS.filter((skill) => skill.module === "shared")).toHaveLength(1);
  });

  test("defines armor breaking as a Charged root rule, not a purchased hook", () => {
    const armorUnlocks = FULL_GAME_SKILL_DEFINITIONS.filter((skill) => (
      skill.hookIds.some((hook) => hook.includes("unlock-armor-break"))
    ));
    expect(armorUnlocks).toEqual([]);
    expect(FULL_GAME_SKILL_DEFINITIONS.find((skill) => skill.id === "skill-breach-momentum-v1")?.presentation.trigger)
      .toContain("任意角度");
  });
});

describe("skill point allocation flow", () => {
  test("starts with two bankable points and keeps combat allocation closed", () => {
    const state = createSkillAllocationState();
    expect(skillAllocationSnapshot(state).unspentPoints).toBe(2);
    expect(previewSkillPurchase(state, "skill-wide-slash-v1")).toEqual({ ok: false, reason: "allocation-closed" });
    closeSkillAllocationVisit(state);
    expect(unspentSkillPoints(state)).toBe(2);
  });

  test("uses draft changes and atomically commits them", () => {
    const state = createSkillAllocationState();
    openSkillAllocationVisit(state, "planning");
    expect(previewSkillPurchase(state, "skill-gravity-slash-v1")).toEqual({ ok: false, reason: "missing-prerequisite" });
    expect(previewSkillPurchase(state, "skill-wide-slash-v1").ok).toBe(true);
    expect(previewSkillPurchase(state, "skill-gravity-slash-v1").ok).toBe(true);
    expect(skillAllocationSnapshot(state).draftAddedSkillIds).toEqual([
      "skill-wide-slash-v1",
      "skill-gravity-slash-v1",
    ]);
    expect(previewSkillRefund(state, "skill-wide-slash-v1")).toEqual({
      ok: true,
      changedSkillIds: ["skill-wide-slash-v1", "skill-gravity-slash-v1"],
    });
    expect(skillAllocationSnapshot(state).unspentPoints).toBe(2);

    previewSkillPurchase(state, "skill-refraction-v1");
    expect(commitSkillDraft(state).ok).toBe(true);
    expect(effectiveSkillIds(state)).toEqual(["skill-refraction-v1"]);
    expect(state.visitMode).toBe("closed");
  });

  test("locks historical points during ordinary planning and cascades at Forge", () => {
    const state = createSkillAllocationState(4);
    openSkillAllocationVisit(state, "planning");
    previewSkillPurchase(state, "skill-refraction-v1");
    previewSkillPurchase(state, "skill-prism-momentum-v1");
    commitSkillDraft(state);

    openSkillAllocationVisit(state, "planning");
    expect(previewSkillRefund(state, "skill-refraction-v1")).toEqual({ ok: false, reason: "committed-locked" });
    discardSkillDraft(state);
    openSkillAllocationVisit(state, "forge");
    expect(previewSkillRefund(state, "skill-refraction-v1")).toEqual({
      ok: true,
      changedSkillIds: ["skill-refraction-v1", "skill-prism-momentum-v1"],
    });
    expect(skillAllocationSnapshot(state).forgeMovesUsed).toBe(2);
    expect(previewSkillPurchase(state, "skill-cross-execution-v1").ok).toBe(true);
    expect(previewSkillPurchase(state, "skill-cross-purge-v1").ok).toBe(true);
    expect(commitSkillDraft(state).ok).toBe(true);
    expect(effectiveSkillIds(state)).toEqual(["skill-cross-execution-v1", "skill-cross-purge-v1"]);
  });

  test("caps rewards at 12 points", () => {
    const state = createSkillAllocationState();
    expect(grantSkillPoints(state, 100)).toBe(10);
    expect(state.totalEarnedPoints).toBe(MAXIMUM_SKILL_POINTS);
    expect(grantSkillPoints(state, 1)).toBe(0);
  });

  test("survives 10,000 deterministic random allocation operations without overspend or broken prerequisites", () => {
    const state = createSkillAllocationState(12);
    openSkillAllocationVisit(state, "planning");
    let random = 0x51a5f00d;
    const next = () => {
      random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
      return random / 0x1_0000_0000;
    };

    for (let operation = 0; operation < 10_000; operation += 1) {
      const definition = FULL_GAME_SKILL_DEFINITIONS[Math.floor(next() * FULL_GAME_SKILL_DEFINITIONS.length)]!;
      if (next() < 0.7) previewSkillPurchase(state, definition.id);
      else previewSkillRefund(state, definition.id);
      const snapshot = skillAllocationSnapshot(state);
      expect(snapshot.spentPoints + snapshot.unspentPoints).toBe(snapshot.totalEarnedPoints);
      expect(snapshot.totalEarnedPoints).toBeLessThanOrEqual(MAXIMUM_SKILL_POINTS);
      const owned = new Set(snapshot.effectiveSkillIds);
      for (const id of owned) {
        const skillDefinition = FULL_GAME_SKILL_DEFINITIONS.find((candidate) => candidate.id === id)!;
        expect(skillDefinition.prerequisites.every((prerequisite) => owned.has(prerequisite))).toBe(true);
      }
    }
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });
});

describe("implemented skill hooks", () => {
  test("applies Wide Slash and Rapid Dash to real Basic Dash geometry", () => {
    const baseline = createGame(0);
    const modified = createGame(0);
    modified.run.selectedUpgrades = ["skill-wide-slash-v1", "skill-rapid-dash-v1"];
    queueDash(baseline, { x: 10, z: 0 });
    queueDash(modified, { x: 10, z: 0 });
    expect(modified.player.dash?.hitRadius).toBeCloseTo((baseline.player.dash?.hitRadius ?? 0) * 1.3);
    expect(modified.player.dash?.to.x).toBeCloseTo((baseline.player.dash?.to.x ?? 0) * 0.65);
    expect(modified.player.dash?.recoveryMs).toBeCloseTo((baseline.player.dash?.recoveryMs ?? 0) * 0.7);
  });
});
