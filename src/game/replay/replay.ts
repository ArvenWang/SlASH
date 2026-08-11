import { createSeededRandom } from "../../core/random/seeded-random";
import {
  createGame,
  createFullGameGame,
  dispatchGameCommand,
  getGameSnapshot,
  stepGame,
} from "../game";
import type {
  GameCommand,
  GameCommandDispatchResult,
  GameRules,
  GameState,
} from "../domain/types";
import { stableHash } from "../serialization/stable";

export const REPLAY_VERSION = 2 as const;
export const REPLAY_CONTENT_VERSION = "full-game-v1" as const;
export type ReplayMode = "legacy-stage" | "full-game";

export interface ReplayEntry {
  readonly runTick: number;
  readonly sequence: number;
  readonly command: GameCommand;
}

export interface ReplayLog {
  readonly version: typeof REPLAY_VERSION;
  readonly contentVersion: typeof REPLAY_CONTENT_VERSION;
  readonly mode: ReplayMode;
  readonly initialStageIndex: number;
  readonly seed: number;
  readonly rules: GameRules;
  readonly entries: readonly ReplayEntry[];
  readonly finalRunTick: number;
  readonly expectedStateHash: string;
}

export interface ReplayRecorder {
  dispatch(command: GameCommand): GameCommandDispatchResult;
  finish(): ReplayLog;
}

function cloneCommand(command: GameCommand): GameCommand {
  switch (command.type) {
    case "activate-ability":
    case "begin-charge":
    case "update-charge-target":
    case "release-charge":
    case "add-ultimate-point":
      return { ...command, target: { x: command.target.x, z: command.target.z } };
    default:
      return { ...command };
  }
}

export function gameplayStateHash(state: GameState): string {
  const serializable = {
    version: state.version,
    run: state.run,
    stage: state.stage,
    player: state.player,
    enemies: state.enemies,
    projectiles: state.projectiles,
    obstacles: state.obstacles,
    hazards: state.hazards,
    combat: state.combat,
    tick: state.tick,
    elapsedMs: state.elapsedMs,
    accumulatorMs: state.accumulatorMs,
    rules: state.rules,
    eventSequence: state.eventSequence,
    commandSequence: state.commandSequence,
    snapshot: getGameSnapshot(state),
  };
  return stableHash(serializable);
}

export function createReplayRecorder(state: GameState): ReplayRecorder {
  if (state.run.tick !== 0 || state.commandSequence !== 0) {
    throw new Error("Replay recording must start from a fresh game state.");
  }
  const initialStageIndex = state.stage.index;
  const seed = state.run.seed;
  const mode: ReplayMode = state.run.fullGame === null ? "legacy-stage" : "full-game";
  const rules = { ...state.rules };
  const entries: ReplayEntry[] = [];
  let finished = false;
  return {
    dispatch(command) {
      if (finished) throw new Error("Replay recorder is already finished.");
      const result = dispatchGameCommand(state, command);
      entries.push({
        runTick: state.run.tick,
        sequence: result.sequence,
        command: cloneCommand(command),
      });
      return result;
    },
    finish() {
      if (finished) throw new Error("Replay recorder is already finished.");
      finished = true;
      return {
        version: REPLAY_VERSION,
        contentVersion: REPLAY_CONTENT_VERSION,
        mode,
        initialStageIndex,
        seed,
        rules,
        entries: entries.map((entry) => ({ ...entry, command: cloneCommand(entry.command) })),
        finalRunTick: state.run.tick,
        expectedStateHash: gameplayStateHash(state),
      };
    },
  };
}

export function playReplay(log: ReplayLog): { state: GameState; matched: boolean; actualStateHash: string } {
  validateReplayLog(log);
  const state = log.mode === "full-game"
    ? createFullGameGame(log.seed, log.rules)
    : createGame(log.initialStageIndex, log.rules);
  if (log.mode === "legacy-stage") {
    state.run.seed = log.seed;
    state.run.random = createSeededRandom(log.seed).snapshot();
  }
  const entries = [...log.entries].sort((a, b) => a.runTick - b.runTick || a.sequence - b.sequence);
  let entryIndex = 0;

  while (state.run.tick <= log.finalRunTick) {
    while (entries[entryIndex]?.runTick === state.run.tick) {
      const entry = entries[entryIndex];
      if (!entry) break;
      const dispatch = dispatchGameCommand(state, cloneCommand(entry.command));
      if (dispatch.sequence !== entry.sequence) {
        throw new Error(`Replay command sequence diverged at run tick ${state.run.tick}.`);
      }
      entryIndex += 1;
    }
    if (state.run.tick === log.finalRunTick) break;
    if (state.stage.phase !== "playing") {
      throw new Error(`Replay cannot advance from ${state.stage.phase} at run tick ${state.run.tick}.`);
    }
    stepGame(state);
  }
  if (entryIndex !== entries.length) throw new Error("Replay ended before all commands were dispatched.");
  const actualStateHash = gameplayStateHash(state);
  return { state, matched: actualStateHash === log.expectedStateHash, actualStateHash };
}

function validateReplayLog(log: ReplayLog): void {
  if (log.version !== REPLAY_VERSION || log.contentVersion !== REPLAY_CONTENT_VERSION) {
    throw new Error(`Unsupported replay version: ${String(log.version)}/${String(log.contentVersion)}`);
  }
  if (log.mode !== "legacy-stage" && log.mode !== "full-game") {
    throw new Error(`Unsupported replay mode: ${String(log.mode)}`);
  }
  if (!Number.isSafeInteger(log.finalRunTick) || log.finalRunTick < 0 || log.finalRunTick > 10_000_000) {
    throw new Error(`Invalid replay final tick: ${String(log.finalRunTick)}`);
  }
  if (!Number.isSafeInteger(log.seed) || !Number.isSafeInteger(log.initialStageIndex)) {
    throw new Error("Replay seed and initial stage index must be safe integers.");
  }
  if (!Array.isArray(log.entries) || log.entries.length > 1_000_000) {
    throw new Error("Replay entry collection is invalid or exceeds the safety limit.");
  }
  let previousRunTick = 0;
  for (let index = 0; index < log.entries.length; index += 1) {
    const entry = log.entries[index]!;
    if (!Number.isSafeInteger(entry.runTick) || entry.runTick < 0 || entry.runTick > log.finalRunTick) {
      throw new Error(`Invalid replay entry tick: ${String(entry.runTick)}`);
    }
    if (entry.runTick < previousRunTick) {
      throw new Error(`Replay entries are not ordered at sequence ${String(entry.sequence)}.`);
    }
    if (!Number.isSafeInteger(entry.sequence) || entry.sequence !== index + 1) {
      throw new Error(`Invalid replay command sequence: ${String(entry.sequence)}`);
    }
    previousRunTick = entry.runTick;
  }
  if (!/^[0-9a-f]{8}$/.test(log.expectedStateHash)) throw new Error("Replay expected state hash is invalid.");
}
