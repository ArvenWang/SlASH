import { createHash } from "node:crypto";
import { describe, expect, test } from "vitest";
import {
  createGame,
  createStages,
  drainGameEvents,
  getGameSnapshot,
  queueDash,
  runGameplayAcceptanceCheck,
  runGameplaySelfCheck,
  stepGame,
  type GameEvent,
  type GameSnapshot,
} from "../src/game/game";

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function phaseOneEventView(event: GameEvent): Record<string, unknown> {
  switch (event.type) {
    case "stage-started":
      return { type: event.type, atMs: event.atMs, stageIndex: event.stageIndex };
    case "stage-restarted":
      return { type: event.type, atMs: event.atMs, stageIndex: event.stageIndex, attempt: event.attempt };
    case "dash-started":
      return { type: event.type, atMs: event.atMs, from: event.from, to: event.to, durationMs: event.durationMs };
    case "enemy-killed":
      return { type: event.type, atMs: event.atMs, enemyId: event.enemyId, position: event.position };
    case "dash-ended":
      return { type: event.type, atMs: event.atMs, position: event.position };
    case "player-died":
      return { type: event.type, atMs: event.atMs, enemyId: event.enemyId, position: event.position };
    case "stage-cleared":
    case "game-complete":
      return { type: event.type, atMs: event.atMs, stageIndex: event.stageIndex };
  }
}

function phaseOneSnapshotView(snapshot: GameSnapshot): Record<string, unknown> {
  return {
    stage: snapshot.stage,
    phase: snapshot.phase,
    attempt: snapshot.attempt,
    tick: snapshot.tick,
    timeMs: snapshot.timeMs,
    rules: snapshot.rules,
    arena: snapshot.arena,
    player: snapshot.player,
    dash: snapshot.dash,
    bufferedTarget: snapshot.bufferedTarget,
    kills: snapshot.kills,
    enemyCount: snapshot.enemyCount,
    aliveEnemies: snapshot.aliveEnemies,
  };
}

describe("Phase 1 compatibility baseline", () => {
  test("keeps the authored stage definitions and initial states unchanged", () => {
    expect(digest(createStages())).toBe(
      "8fc9c373d1023eb5198165ffad1c350557398307ddd5d7a49ad5cb1edf59c3bc",
    );
    expect(
      digest(
        [0, 1, 2].map((stageIndex) => phaseOneSnapshotView(getGameSnapshot(createGame(stageIndex)))),
      ),
    ).toBe("f372e9632ef035ebf9e228746aae3b0fd8d96065248cb52a7dc84ba83f53e022");
  });

  test("keeps one representative dash and its event order unchanged", () => {
    const state = createGame(0);
    state.enemies.forEach((enemy) => {
      enemy.speed = 0;
    });
    const events: GameEvent[] = [];

    expect(queueDash(state, { x: 19, z: 0 })).toBe("started");
    events.push(...drainGameEvents(state));
    for (let tick = 0; tick < 60 && state.player.dash !== null; tick += 1) {
      stepGame(state);
      events.push(...drainGameEvents(state));
    }

    expect(digest({ snapshot: phaseOneSnapshotView(getGameSnapshot(state)), events: events.map(phaseOneEventView) })).toBe(
      "88c6bb244d3924e9fac97d3325da51e57e9fdaf0173fd2f78d9933a72d99e451",
    );
  });

  test("keeps the existing gameplay acceptance suite green", () => {
    expect(runGameplaySelfCheck().ok).toBe(true);
    expect(runGameplayAcceptanceCheck().ok).toBe(true);
  });
});
