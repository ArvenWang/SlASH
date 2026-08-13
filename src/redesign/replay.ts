import type { GameCommand, GameCommandResult, GameState } from "./state";
import { createGame, dispatch, gameplayHash, step } from "./game";
import { REDESIGN_CONTENT_VERSION } from "./run";

export const REPLAY_VERSION = 3 as const;

export interface ReplayEntry {
  readonly tick: number;
  readonly sequence: number;
  readonly command: GameCommand;
  readonly result: GameCommandResult;
}

export interface ReplayLog {
  readonly version: typeof REPLAY_VERSION;
  readonly contentVersion: typeof REDESIGN_CONTENT_VERSION;
  readonly seed: number;
  readonly entries: readonly ReplayEntry[];
  readonly finalTick: number;
  readonly expectedHash: string;
}

export interface ReplayRecorder {
  dispatch(command: GameCommand): GameCommandResult;
  finish(): ReplayLog;
}

export function createReplayRecorder(state: GameState): ReplayRecorder {
  if (state.tick !== 0 || state.phase !== "title") throw new Error("Replay recording requires a fresh title state.");
  const entries: ReplayEntry[] = [];
  let finished = false;
  return {
    dispatch(command) {
      if (finished) throw new Error("Replay recorder is finished.");
      const result = dispatch(state, structuredClone(command));
      entries.push({ tick: state.tick, sequence: entries.length + 1, command: structuredClone(command), result });
      return result;
    },
    finish() {
      if (finished) throw new Error("Replay recorder is finished.");
      finished = true;
      return {
        version: REPLAY_VERSION,
        contentVersion: REDESIGN_CONTENT_VERSION,
        seed: state.run.seed,
        entries: structuredClone(entries),
        finalTick: state.tick,
        expectedHash: gameplayHash(state),
      };
    },
  };
}

export function playReplay(log: ReplayLog): { readonly state: GameState; readonly matched: boolean; readonly hash: string } {
  if (log.version !== REPLAY_VERSION || log.contentVersion !== REDESIGN_CONTENT_VERSION) {
    throw new Error("Unsupported V2.1 replay.");
  }
  if (!Number.isInteger(log.finalTick) || log.finalTick < 0 || log.finalTick > 20_000_000) throw new Error("Invalid replay duration.");
  const state = createGame(log.seed);
  let entryIndex = 0;
  while (state.tick <= log.finalTick) {
    while (log.entries[entryIndex]?.tick === state.tick) {
      const entry = log.entries[entryIndex]!;
      if (entry.sequence !== entryIndex + 1) throw new Error("Replay command sequence is invalid.");
      const result = dispatch(state, structuredClone(entry.command));
      if (result !== entry.result) throw new Error(`Replay command diverged at tick ${state.tick}.`);
      entryIndex += 1;
    }
    if (state.tick === log.finalTick) break;
    step(state);
  }
  if (entryIndex !== log.entries.length) throw new Error("Replay ended before all commands.");
  const hash = gameplayHash(state);
  return { state, matched: hash === log.expectedHash, hash };
}
