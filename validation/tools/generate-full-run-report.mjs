import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "vite";

const projectRoot = resolve(import.meta.dirname, "../..");
const outputDirectory = resolve(projectRoot, process.argv[2] ?? "validation/full-game/full-run");
const seed = Number(process.argv[3] ?? 911);
const server = await createServer({ root: projectRoot, server: { middlewareMode: true }, appType: "custom" });

try {
  const game = await server.ssrLoadModule("/src/game/game.ts");
  const replayModule = await server.ssrLoadModule("/src/game/replay/replay.ts");
  const autoplay = await server.ssrLoadModule("/src/game/validation/full-run-autoplayer.ts");
  const state = game.createFullGameGame(seed);
  const recorder = replayModule.createReplayRecorder(state);
  const build = [
    "skill-wide-slash-v1", "skill-gravity-slash-v1",
    "skill-breach-momentum-v1", "skill-chain-breach-v1",
    "skill-execution-tempo-v1", "skill-predator-drive-v1",
    "skill-cross-execution-v1", "skill-cross-purge-v1",
    "skill-projectile-reversal-v1", "skill-kill-momentum-v1",
  ];
  const run = autoplay.completeFullRunForValidation(state, (command) => recorder.dispatch(command), build);
  const log = recorder.finish();
  const replay = replayModule.playReplay(log);
  const finalState = game.getGameSnapshot(state);
  const report = {
    ok: replay.matched && run.route.length === 24 && run.bosses.length === 4 && finalState.player.hp === 1,
    seed,
    protocol: "standard",
    route: run.route,
    bosses: run.bosses,
    build: [...state.run.selectedUpgrades],
    commands: log.entries.length,
    ticks: log.finalRunTick,
    expectedHash: log.expectedStateHash,
    actualReplayHash: replay.actualStateHash,
    replayMatched: replay.matched,
    finalState,
  };
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(resolve(outputDirectory, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(resolve(outputDirectory, "replay.json"), `${JSON.stringify(log)}\n`);
  console.log(JSON.stringify({ ok: report.ok, seed, nodes: run.route.length, bosses: run.bosses.length, skills: report.build.length, commands: report.commands, ticks: report.ticks, replayMatched: replay.matched }, null, 2));
  if (!report.ok) process.exitCode = 1;
} finally {
  await server.close();
}
