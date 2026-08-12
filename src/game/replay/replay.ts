import { createSeededRandom } from "../../core/random/seeded-random";
import {
  createGame,
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

export const REPLAY_VERSION = 2 as const;
export const REPLAY_CONTENT_VERSION = "phase2a-vector-focus-v2" as const;

export interface ReplayEntry {
  readonly runTick: number;
  readonly sequence: number;
  readonly command: GameCommand;
}

export interface ReplayLog {
  readonly version: typeof REPLAY_VERSION;
  readonly contentVersion: typeof REPLAY_CONTENT_VERSION;
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
  if (command.type === "activate-ability") {
    return command.target
      ? { ...command, target: { x: command.target.x, z: command.target.z } }
      : { ...command };
  }
  if (command.type === "submit-ability-target") {
    return { ...command, target: { x: command.target.x, z: command.target.z } };
  }
  return { ...command };
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => (
    `${JSON.stringify(key)}:${stableStringify(record[key])}`
  )).join(",")}}`;
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
  const text = stableStringify(serializable);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function createReplayRecorder(state: GameState): ReplayRecorder {
  if (state.run.tick !== 0 || state.commandSequence !== 0) {
    throw new Error("Replay recording must start from a fresh game state.");
  }
  const initialStageIndex = state.stage.index;
  const seed = state.run.seed;
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
  if (log.version !== REPLAY_VERSION || log.contentVersion !== REPLAY_CONTENT_VERSION) {
    throw new Error(`Unsupported replay version: ${log.version}/${log.contentVersion}`);
  }
  const state = createGame(log.initialStageIndex, log.rules);
  state.run.seed = log.seed;
  state.run.random = createSeededRandom(log.seed).snapshot();
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
