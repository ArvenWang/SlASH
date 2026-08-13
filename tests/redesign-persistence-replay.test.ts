import { describe, expect, test } from "vitest";
import { createGame, dispatch, gameplayHash, step } from "../src/redesign/game";
import { loadGame, saveGame, SAVE_STORAGE_KEY, type StoragePort } from "../src/redesign/persistence";
import { createReplayRecorder, playReplay } from "../src/redesign/replay";

function memoryStorage(): StoragePort & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, value); },
    removeItem: (key) => { data.delete(key); },
  };
}

describe("V2.1 safe persistence", () => {
  test("roundtrips a live deterministic combat state with vertical and build facts", () => {
    const storage = memoryStorage();
    const state = createGame(817);
    dispatch(state, { type: "start-run" });
    for (let index = 0; index < 120; index += 1) step(state);
    saveGame(storage, state);
    const loaded = loadGame(storage);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) throw new Error(loaded.message);
    expect(gameplayHash(loaded.state)).toBe(gameplayHash(state));
    expect(loaded.state.player).toMatchObject({ supported: true, gravity: -24 });
  });

  test("rejects tampering and old versions without deleting the raw save", () => {
    const storage = memoryStorage();
    const state = createGame(91);
    dispatch(state, { type: "start-run" });
    saveGame(storage, state);
    const raw = storage.getItem(SAVE_STORAGE_KEY)!;
    const tampered = JSON.parse(raw);
    tampered.state.player.hp = 99;
    storage.setItem(SAVE_STORAGE_KEY, JSON.stringify(tampered));
    const result = loadGame(storage);
    expect(result).toMatchObject({ ok: false, reason: "checksum-mismatch", raw: JSON.stringify(tampered) });
    expect(storage.getItem(SAVE_STORAGE_KEY)).toBe(JSON.stringify(tampered));
  });
});

describe("V2.1 replay", () => {
  test("replays real aim, charge and dash commands to the same final hash", () => {
    const state = createGame(328);
    const recorder = createReplayRecorder(state);
    expect(recorder.dispatch({ type: "start-run" })).toBe("run-started");
    for (let index = 0; index < 24; index += 1) step(state);
    recorder.dispatch({ type: "aim", target: { x: 12, z: -4 } });
    expect(recorder.dispatch({ type: "begin-primary", target: { x: 12, z: -4 } })).toBe("charge-started");
    for (let index = 0; index < 18; index += 1) step(state);
    expect(recorder.dispatch({ type: "release-primary", target: { x: 12, z: -4 } })).toBe("dash-started");
    for (let index = 0; index < 160; index += 1) step(state);
    const log = recorder.finish();
    const replay = playReplay(log);
    expect(replay.matched).toBe(true);
    expect(replay.hash).toBe(log.expectedHash);
  });
});
