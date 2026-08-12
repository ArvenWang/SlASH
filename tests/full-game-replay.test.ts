import { describe, expect, test } from "vitest";
import {
  createFullGameGame,
  dispatchGameCommand,
  drainGameEvents,
  getPlayerAction,
  stepGame,
  type GameCommand,
  type GameState,
  type Vec2,
} from "../src/game/game";
import {
  REPLAY_CONTENT_VERSION,
  REPLAY_VERSION,
  createReplayRecorder,
  playReplay,
  type ReplayLog,
  type ReplayRecorder,
} from "../src/game/replay/replay";

const RETIRED_V1_COMMAND_TYPES = new Set<GameCommand["type"]>([
  "preview-route-node",
  "confirm-planning",
  "preview-skill-purchase",
  "preview-skill-refund",
  "discard-skill-draft",
  "acknowledge-reward",
  "resolve-event-choice",
  "use-forge-token",
  "confirm-forge",
]);

describe("full-game replay v4", () => {
  test("starts V2 directly in combat and replays the selected Run Protocol", () => {
    const state = createFullGameGame(601);
    const recorder = createReplayRecorder(state);

    expect(recorder.dispatch({
      type: "configure-run-protocol",
      mode: "threat",
      threatLevel: 3,
    }).result).toBe("protocol-configured");
    expect(recorder.dispatch({ type: "start-full-game-run" }).result).toBe("run-started");
    expect(state.run.fullGame?.phase).toBe("combat");
    expect(state.stage.phase).toBe("playing");
    expect(state.run.fullGame?.activeEncounterTemplateId).not.toBeNull();

    const log = recorder.finish();
    const replay = playReplay(log);
    expect(replay.matched).toBe(true);
    expect(replay.state.run.fullGame?.phase).toBe("combat");
    expect(replay.state.run.fullGame?.protocol).toMatchObject({ mode: "threat", threatLevel: 3 });
  });

  test("replays clear -> three choices -> selection -> automatic next combat to the same hash", () => {
    const state = createFullGameGame(601, { recoveryMs: 35 });
    const recorder = createReplayRecorder(state);

    expect(recorder.dispatch({ type: "configure-run-protocol", mode: "assist" }).result).toBe("protocol-configured");
    expect(recorder.dispatch({ type: "start-full-game-run" }).result).toBe("run-started");
    expect(state.run.fullGame?.phase).toBe("combat");
    const firstNodeId = state.run.fullGame?.routeProgress.currentNodeId;
    if (!firstNodeId) throw new Error("V2 start did not select the first encounter.");

    clearCurrentEncounter(state, recorder);

    const draft = state.run.fullGame?.activeRewardDraft;
    expect(state.run.fullGame?.phase).toBe("upgrade-choice");
    expect(state.stage.phase).toBe("upgrade-choice");
    expect(draft?.candidateSkillIds).toHaveLength(3);
    expect(new Set(draft?.candidateSkillIds).size).toBe(3);
    if (!draft) throw new Error("Cleared encounter did not create a V2 reward draft.");

    const selectedSkillId = draft.candidateSkillIds[0];
    const selectionCommand = {
      type: "select-reward-skill",
      offerId: draft.offerId,
      skillId: selectedSkillId,
    } as const;
    expect(recorder.dispatch(selectionCommand).result).toBe("reward-skill-selected");
    expect(state.run.fullGame?.phase).toBe("combat");
    expect(state.stage.phase).toBe("playing");
    expect(state.run.fullGame?.routeProgress.completedNodeIds).toContain(firstNodeId);
    expect(state.run.fullGame?.routeProgress.currentNodeId).not.toBe(firstNodeId);
    expect(state.run.fullGame?.skills.committedSkillIds).toContain(selectedSkillId);
    expect(state.run.selectedUpgrades).toContain(selectedSkillId);

    const log = recorder.finish();
    expect(log.mode).toBe("full-game");
    expect(log.version).toBe(REPLAY_VERSION);
    expect(log.contentVersion).toBe(REPLAY_CONTENT_VERSION);
    expect(log.entries.some((entry) => (
      entry.command.type === "select-reward-skill"
      && entry.command.offerId === draft.offerId
      && entry.command.skillId === selectedSkillId
    ))).toBe(true);
    expect(log.entries.filter((entry) => RETIRED_V1_COMMAND_TYPES.has(entry.command.type))).toEqual([]);

    const replay = playReplay(log);
    expect(replay.matched).toBe(true);
    expect(replay.actualStateHash).toBe(log.expectedStateHash);
    expect(replay.state.run.fullGame?.phase).toBe("combat");
    expect(replay.state.run.fullGame?.routeProgress.currentNodeId).toBe(
      state.run.fullGame?.routeProgress.currentNodeId,
    );
    expect(replay.state.run.fullGame?.skills.committedSkillIds).toContain(selectedSkillId);
  });

  test("keeps retired V1 route, skill draft, Event, and Forge commands out of the V2 success path", () => {
    const state = createFullGameGame(602);
    expect(dispatchGameCommand(state, { type: "start-full-game-run" }).result).toBe("run-started");
    const currentNodeId = state.run.fullGame?.routeProgress.currentNodeId;
    if (!currentNodeId) throw new Error("V2 start did not select an encounter.");

    const retiredCommands: GameCommand[] = [
      { type: "preview-route-node", nodeId: currentNodeId },
      { type: "confirm-planning" },
      { type: "preview-skill-purchase", skillId: "skill-wide-slash-v1" },
      { type: "preview-skill-refund", skillId: "skill-wide-slash-v1" },
      { type: "discard-skill-draft" },
      { type: "acknowledge-reward" },
      { type: "resolve-event-choice", choiceId: "retired-event-choice" },
      { type: "use-forge-token" },
      { type: "confirm-forge" },
    ];

    for (const command of retiredCommands) {
      expect(dispatchGameCommand(state, command).result, command.type).toBe("ignored");
    }
    expect(state.run.fullGame?.phase).toBe("combat");
    expect(state.run.fullGame?.routeProgress.currentNodeId).toBe(currentNodeId);
    expect(state.run.fullGame?.skills.committedSkillIds).toEqual([]);
  });

  test("rejects unsupported versions and damaged replay logs", () => {
    const state = createFullGameGame(1);
    const recorder = createReplayRecorder(state);
    recorder.dispatch({ type: "configure-run-protocol", mode: "standard" });
    recorder.dispatch({ type: "start-full-game-run" });
    const log = recorder.finish();

    expect(() => playReplay({ ...log, version: 999 as typeof REPLAY_VERSION })).toThrow(/Unsupported replay version/);
    expect(() => playReplay({
      ...log,
      contentVersion: "future" as typeof REPLAY_CONTENT_VERSION,
    })).toThrow(/Unsupported replay version/);
    expect(() => playReplay({ ...log, mode: "unknown" as typeof log.mode })).toThrow(/Unsupported replay mode/);
    expect(() => playReplay({ ...log, finalRunTick: -1 })).toThrow(/Invalid replay final tick/);
    expect(() => playReplay({ ...log, expectedStateHash: "damaged" })).toThrow(/expected state hash is invalid/);

    const firstEntry = log.entries[0];
    const secondEntry = log.entries[1];
    if (!firstEntry || !secondEntry) throw new Error("Replay fixture is missing command entries.");
    const outOfOrderLog: ReplayLog = {
      ...log,
      finalRunTick: 1,
      entries: [
        { ...firstEntry, runTick: 1 },
        { ...secondEntry, runTick: 0 },
      ],
    };
    expect(() => playReplay(outOfOrderLog)).toThrow(/Replay entries are not ordered/);
    expect(() => playReplay({
      ...log,
      entries: [{ ...firstEntry, sequence: 2 }, secondEntry],
    })).toThrow(/Invalid replay command sequence/);
  });
});

function clearCurrentEncounter(state: GameState, recorder: ReplayRecorder): void {
  let retries = 0;
  for (
    let guard = 0;
    guard < 20_000 && (state.run.fullGame?.phase === "combat" || state.run.fullGame?.phase === "defeat");
    guard += 1
  ) {
    if (state.stage.phase === "dead") {
      if (retries >= 1) throw new Error("V2 replay autoplayer exhausted the Assist reboot.");
      expect(recorder.dispatch({ type: "restart-stage" }).result).toBe("restarted");
      retries += 1;
      continue;
    }
    if (state.stage.phase !== "playing") {
      throw new Error(`V2 encounter left Playing in ${state.stage.phase}.`);
    }
    if (getPlayerAction(state) === "ready" && state.enemies.some((enemy) => enemy.alive)) {
      const target = chooseDashTarget(state);
      const armored = state.enemies.some((enemy) => (
        enemy.alive && enemy.armorParts.some((part) => part.intact)
      ));
      if (armored) {
        expect(recorder.dispatch({ type: "begin-charge", target }).result).toBe("charge-started");
        for (let tick = 0; tick < 80 && state.player.charge !== null; tick += 1) {
          stepGame(state);
          drainGameEvents(state);
        }
        expect(recorder.dispatch({ type: "release-charge", target }).result).toBe("charged-released");
      } else {
        expect(recorder.dispatch({ type: "activate-ability", slot: "primary", target }).result).toBe("started");
      }
    }
    stepGame(state);
    drainGameEvents(state);
  }
  expect(state.run.fullGame?.phase).toBe("upgrade-choice");
}

function chooseDashTarget(state: GameState): Vec2 {
  const player = state.player.position;
  let best: { target: Vec2; score: number; travel: number } | null = null;
  for (const enemy of state.enemies) {
    if (!enemy.alive) continue;
    const target = extendToArenaBoundary(player, enemy.position, state.stage.arena);
    if (!target) continue;
    const score = state.enemies.reduce((count, candidate) => (
      count + (
        candidate.alive
        && distanceSquaredPointToSegment(candidate.position, player, target) <= (candidate.radius + 1.15) ** 2
          ? 1
          : 0
      )
    ), 0);
    const travel = Math.hypot(target.x - player.x, target.z - player.z);
    if (!best || score > best.score || (score === best.score && travel > best.travel)) {
      best = { target, score, travel };
    }
  }
  return best?.target ?? { x: -player.x, z: -player.z };
}

function extendToArenaBoundary(
  player: Vec2,
  enemy: Vec2,
  arena: GameState["stage"]["arena"],
): Vec2 | null {
  const dx = enemy.x - player.x;
  const dz = enemy.z - player.z;
  const length = Math.hypot(dx, dz);
  if (length <= 1e-6) return null;
  const dirX = dx / length;
  const dirZ = dz / length;
  const margin = 0.5;
  const candidates: number[] = [];
  if (dirX > 1e-6) candidates.push((arena.maxX - margin - player.x) / dirX);
  if (dirX < -1e-6) candidates.push((arena.minX + margin - player.x) / dirX);
  if (dirZ > 1e-6) candidates.push((arena.maxZ - margin - player.z) / dirZ);
  if (dirZ < -1e-6) candidates.push((arena.minZ + margin - player.z) / dirZ);
  const distance = Math.min(...candidates.filter((value) => value > 0));
  return Number.isFinite(distance)
    ? { x: player.x + dirX * distance, z: player.z + dirZ * distance }
    : null;
}

function distanceSquaredPointToSegment(point: Vec2, start: Vec2, end: Vec2): number {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared <= 1e-8) return Number.POSITIVE_INFINITY;
  const ratio = Math.max(0, Math.min(1, (
    (point.x - start.x) * dx + (point.z - start.z) * dz
  ) / lengthSquared));
  const x = start.x + dx * ratio;
  const z = start.z + dz * ratio;
  return (point.x - x) ** 2 + (point.z - z) ** 2;
}
