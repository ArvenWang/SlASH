import { createHash } from "node:crypto";
import { describe, expect, test } from "vitest";
import {
  createGame,
  createStages,
  getGameSnapshot,
  queueDash,
  runGameplayAcceptanceCheck,
  runGameplaySelfCheck,
  stepGame,
  type GameEvent,
} from "../src/game/game";

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

describe("Phase 1 compatibility baseline", () => {
  test("keeps the authored stage definitions and initial states unchanged", () => {
    expect(digest(createStages())).toBe(
      "8fc9c373d1023eb5198165ffad1c350557398307ddd5d7a49ad5cb1edf59c3bc",
    );
    expect(
      digest([0, 1, 2].map((stageIndex) => getGameSnapshot(createGame(stageIndex)))),
    ).toBe("f372e9632ef035ebf9e228746aae3b0fd8d96065248cb52a7dc84ba83f53e022");
  });

  test("keeps one representative dash and its event order unchanged", () => {
    const state = createGame(0);
    state.enemies.forEach((enemy) => {
      enemy.speed = 0;
    });
    const events: GameEvent[] = [];

    expect(queueDash(state, { x: 19, z: 0 })).toBe("started");
    events.push(...state.lastEvents);
    for (let tick = 0; tick < 60 && state.player.dash !== null; tick += 1) {
      stepGame(state);
      events.push(...state.lastEvents);
    }

    expect(digest({ snapshot: getGameSnapshot(state), events })).toBe(
      "88c6bb244d3924e9fac97d3325da51e57e9fdaf0173fd2f78d9933a72d99e451",
    );
  });

  test("keeps the existing gameplay acceptance suite green", () => {
    expect(runGameplaySelfCheck().ok).toBe(true);
    expect(runGameplayAcceptanceCheck().ok).toBe(true);
  });
});
