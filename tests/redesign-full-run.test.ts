import { describe, expect, test } from "vitest";
import { createGame, step } from "../src/redesign/game";
import { PLAYABLE_ARENA } from "../src/redesign/config";
import type { CoreUpgradeId } from "../src/redesign/skills";
import { coreUpgradeById } from "../src/redesign/skills";
import type { GameCommand, GameState } from "../src/redesign/state";
import { createReplayRecorder, playReplay } from "../src/redesign/replay";

const SKILL_PRIORITY = [
  "wide-slash",
  "echo-slash",
  "kill-momentum",
  "cross-execution",
  "refraction",
] as const;

describe("V2.1 complete production run", () => {
  test("completes nine real encounters, eight choices and three multi-hit bosses with replay hash", () => {
    const state = createGame(911);
    const recorder = createReplayRecorder(state);
    const send = (command: GameCommand) => recorder.dispatch(command);
    expect(send({ type: "start-run" })).toBe("run-started");
    let lastEncounter = -1;
    let bossHits = 0;
    let commands = 1;

    for (let guard = 0; guard < 160_000 && state.phase !== "victory"; guard += 1) {
      if (state.phase === "defeat") {
        throw new Error(`Autoplayer died in encounter ${state.run.encounterIndex} after ${commands} commands.`);
      }
      if (state.phase === "reward") {
        const offer = state.run.activeOffer;
        if (!offer) throw new Error("Reward phase has no offer.");
        const selected = [...offer.candidateUpgradeIds].sort((left, right) => (
          priority(left) - priority(right) || left.localeCompare(right)
        ))[0]!;
        expect(send({ type: "select-upgrade", offerId: offer.id, upgradeId: selected })).toBe("upgrade-selected");
        commands += 1;
        continue;
      }
      if (state.phase !== "combat") throw new Error(`Unexpected phase ${state.phase}.`);
      if (state.run.encounterIndex !== lastEncounter) {
        lastEncounter = state.run.encounterIndex;
        bossHits = 0;
      }
      if (state.player.action === "ready") {
        const target = chooseTarget(state, bossHits);
        send({ type: "aim", target });
        expect(send({ type: "begin-primary", target })).toBe("charge-started");
        expect(send({ type: "release-primary", target })).toBe("dash-started");
        commands += 3;
        if (state.boss?.vulnerable) bossHits += 1;
      }
      step(state);
    }

    expect(state.phase).toBe("victory");
    expect(state.run.completedEncounterIds).toHaveLength(9);
    expect(state.run.selectedUpgradeIds).toHaveLength(8);
    expect(state.run.build.equippedFamilyIds.length).toBeLessThanOrEqual(4);
    expect(state.run.totalBossDamage).toBe(8 + 12 + 16);
    const log = recorder.finish();
    const replay = playReplay(log);
    expect(replay.matched).toBe(true);
    expect(replay.state.phase).toBe("victory");
    expect(replay.state.run.completedEncounterIds).toEqual(state.run.completedEncounterIds);
  }, 30_000);
});

function chooseTarget(state: GameState, bossHits: number): { x: number; z: number } {
  const boss = state.boss;
  if (boss) {
    const canAttackCore = boss.vulnerable
      || (boss.archetype === "cube-fortress" && boss.parts.some((part) => part.alive));
    if (canAttackCore) return throughTarget(state.player.position, boss.position, 6 + bossHits % 2 * 2);
    return safeDodgeTarget(state, boss.attackSequence + boss.phaseIndex);
  }
  const alive = state.enemies.filter((enemy) => enemy.alive);
  if (alive.length === 0) return { ...state.player.position };
  const target = [...alive].sort((left, right) => (
    distance(state.player.position, left.position) - distance(state.player.position, right.position)
  ))[0]!;
  const targetDistance = distance(state.player.position, target.position);
  if (targetDistance <= 13.5) return throughTarget(state.player.position, target.position, 3.5);
  const direction = directionTo(state.player.position, target.position);
  return clampTarget({
    x: state.player.position.x + direction.x * 14,
    z: state.player.position.z + direction.z * 14,
  });
}

function safeDodgeTarget(state: GameState, offset: number): { x: number; z: number } {
  const corners = [
    { x: PLAYABLE_ARENA.minX + 4, z: PLAYABLE_ARENA.minZ + 4 },
    { x: PLAYABLE_ARENA.maxX - 4, z: PLAYABLE_ARENA.minZ + 4 },
    { x: PLAYABLE_ARENA.maxX - 4, z: PLAYABLE_ARENA.maxZ - 4 },
    { x: PLAYABLE_ARENA.minX + 4, z: PLAYABLE_ARENA.maxZ - 4 },
  ];
  return corners[(offset + Math.floor(state.tick / 180)) % corners.length]!;
}

function throughTarget(from: { x: number; z: number }, target: { x: number; z: number }, extension: number): { x: number; z: number } {
  const direction = directionTo(from, target);
  return clampTarget({ x: target.x + direction.x * extension, z: target.z + direction.z * extension });
}

function directionTo(from: { x: number; z: number }, to: { x: number; z: number }): { x: number; z: number } {
  const x = to.x - from.x;
  const z = to.z - from.z;
  const magnitude = Math.max(0.001, Math.hypot(x, z));
  return { x: x / magnitude, z: z / magnitude };
}

function distance(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function clampTarget(target: { x: number; z: number }): { x: number; z: number } {
  return {
    x: Math.max(PLAYABLE_ARENA.minX + 2, Math.min(PLAYABLE_ARENA.maxX - 2, target.x)),
    z: Math.max(PLAYABLE_ARENA.minZ + 2, Math.min(PLAYABLE_ARENA.maxZ - 2, target.z)),
  };
}

function priority(upgradeId: CoreUpgradeId): number {
  const family = coreUpgradeById(upgradeId).familyId;
  return SKILL_PRIORITY.indexOf(family as typeof SKILL_PRIORITY[number]);
}
