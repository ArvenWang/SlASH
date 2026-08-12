import { describe, expect, test } from "vitest";
import { createFullGameGame } from "../src/game/game";
import { completeFullRunForValidation } from "../src/game/validation/full-run-autoplayer";
import { createReplayRecorder, playReplay } from "../src/game/replay/replay";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const builds = [
  ["skill-refraction-v1", "skill-prism-momentum-v1", "skill-cross-execution-v1", "skill-cross-purge-v1"],
  ["skill-wide-slash-v1", "skill-gravity-slash-v1", "skill-echo-slash-v1", "skill-double-echo-v1"],
  ["skill-breach-momentum-v1", "skill-chain-breach-v1", "skill-armor-shrapnel-v1", "skill-execution-tempo-v1"],
  ["skill-execution-tempo-v1", "skill-predator-drive-v1", "skill-backline-battery-v1", "skill-kill-momentum-v1"],
] as const;

describe("full-run replay matrix", () => {
  test("matches final hashes for 100 seeds across four representative builds", () => {
    const failures: Array<{ seed: number; build: number; reason: string }> = [];
    const samples: Array<{ seed: number; build: number; hash: string; ticks: number; commands: number }> = [];
    for (let seed = 0; seed < 100; seed += 1) {
      for (let buildIndex = 0; buildIndex < builds.length; buildIndex += 1) {
        try {
          const state = createFullGameGame(seed);
          const recorder = createReplayRecorder(state);
          const result = completeFullRunForValidation(state, (command) => recorder.dispatch(command), builds[buildIndex]);
          const log = recorder.finish();
          const replay = playReplay(log);
          if (!replay.matched || result.route.length !== 24 || result.bosses.length !== 4) {
            failures.push({ seed, build: buildIndex + 1, reason: "terminal mismatch" });
          } else {
            samples.push({ seed, build: buildIndex + 1, hash: log.expectedStateHash, ticks: log.finalRunTick, commands: log.entries.length });
          }
        } catch (error) {
          failures.push({ seed, build: buildIndex + 1, reason: error instanceof Error ? error.message : String(error) });
        }
      }
    }
    const outputDirectory = resolve("validation/full-game");
    mkdirSync(outputDirectory, { recursive: true });
    writeFileSync(resolve(outputDirectory, "replay-matrix.json"), `${JSON.stringify({
      ok: failures.length === 0,
      seedCount: 100,
      buildCount: builds.length,
      runCount: 400,
      matched: samples.length,
      failures,
      builds,
      samples,
    }, null, 2)}\n`);
    expect(failures).toEqual([]);
  }, 180_000);
});
