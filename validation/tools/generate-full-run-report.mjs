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
  const run = autoplay.completeFullRunForValidation(state, (command) => recorder.dispatch(command));
  const log = recorder.finish();
  const replay = replayModule.playReplay(log);
  const finalState = game.getGameSnapshot(state);
  const rewardChoiceCount = run.rewardChoices.length;
  const finalSkillCount = run.finalSkills.length;
  const completedNodeCount = run.completedNodes.length;
  const bossCount = run.bosses.length;
  const report = {
    ok: run.victory && replay.matched && completedNodeCount > 0 && bossCount === 4 &&
      rewardChoiceCount === completedNodeCount - 1 && finalSkillCount === rewardChoiceCount &&
      finalState.player.hp === 1,
    seed,
    protocol: "standard",
    rewardChoices: run.rewardChoices,
    rewardChoiceCount,
    finalSkills: run.finalSkills,
    finalSkillCount,
    completedNodes: run.completedNodes,
    completedNodeCount,
    bosses: run.bosses,
    bossCount,
    victory: run.victory,
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
  console.log(JSON.stringify({
    ok: report.ok,
    seed,
    rewardChoices: rewardChoiceCount,
    finalSkills: finalSkillCount,
    completedNodes: completedNodeCount,
    bosses: bossCount,
    victory: run.victory,
    commands: report.commands,
    ticks: report.ticks,
    replayMatched: replay.matched,
  }, null, 2));
  if (!report.ok) process.exitCode = 1;
} finally {
  await server.close();
}
