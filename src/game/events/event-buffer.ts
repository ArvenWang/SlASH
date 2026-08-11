import type { GameEvent, GameEventPayload, GameState } from "../domain/types";

export function emitGameEvent(state: GameState, payload: GameEventPayload): GameEvent {
  state.eventSequence += 1;
  const event = {
    ...payload,
    id: `${state.run.tick}:${state.eventSequence}`,
    tick: state.run.tick,
    sequence: state.eventSequence,
    atMs: state.elapsedMs,
  } as GameEvent;
  state.lastEvents.push(event);
  return event;
}

export function drainGameEvents(state: GameState): GameEvent[] {
  return state.lastEvents.splice(0, state.lastEvents.length);
}
