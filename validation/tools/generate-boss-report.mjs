import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "vite";

const projectRoot = resolve(import.meta.dirname, "../..");
const outputDirectory = resolve(projectRoot, process.argv[2] ?? "validation/full-game");
const server = await createServer({ root: projectRoot, server: { middlewareMode: true }, appType: "custom" });

try {
  const game = await server.ssrLoadModule("/src/game/game.ts");
  const bosses = await server.ssrLoadModule("/src/content/bosses/definitions.ts");
  const fixedSeed = 911;
  const attemptsPerBoss = 100;
  const definitions = [
    { id: bosses.RAIL_HOUND_BOSS_ID, modules: ["Basic Dash"], solve: solveRailHound },
    { id: bosses.SIEGE_CHOIR_BOSS_ID, modules: ["Basic Dash", "Charged Dash"], solve: solveSiegeChoir },
    { id: bosses.MIRROR_REGENT_BOSS_ID, modules: ["Basic Dash"], solve: solveMirrorRegent },
    { id: bosses.LAST_CONDUCTOR_BOSS_ID, modules: ["Basic Dash", "Charged Dash", "Ultimate"], solve: solveLastConductor },
  ];
  const results = [];

  for (const definition of definitions) {
    const durations = [];
    const ticks = [];
    let completed = 0;
    let deaths = 0;
    let deadlocks = 0;
    let phaseEvents = 0;
    let breakEvents = 0;
    let victoryEvents = 0;
    for (let attempt = 0; attempt < attemptsPerBoss; attempt += 1) {
      try {
        const state = practice(game, definition.id, fixedSeed);
        definition.solve(game, state);
        if (state.run.fullGame?.phase !== "victory" || state.run.selectedUpgrades.length !== 0) {
          throw new Error("terminal state did not preserve zero-skill victory");
        }
        completed += 1;
        durations.push(state.elapsedMs);
        ticks.push(state.run.tick);
        phaseEvents += state.lastEvents.filter((event) => event.type === "boss-phase-started").length;
        breakEvents += state.lastEvents.filter((event) => event.type === "boss-break").length;
        victoryEvents += state.lastEvents.filter((event) => event.type === "boss-victory").length;
      } catch (error) {
        if (String(error).includes("died")) deaths += 1;
        else deadlocks += 1;
      }
    }
    results.push({
      bossDefinitionId: definition.id,
      fixedSeed,
      attempts: attemptsPerBoss,
      completed,
      deaths,
      deadlocks,
      zeroSkill: true,
      activeModules: definition.modules,
      minimumTicks: Math.min(...ticks),
      maximumTicks: Math.max(...ticks),
      minimumDurationMs: Math.round(Math.min(...durations)),
      maximumDurationMs: Math.round(Math.max(...durations)),
      eventTotals: { phaseEvents, breakEvents, victoryEvents },
    });
  }

  const gates = {
    fourStableBosses: bosses.BOSS_DEFINITIONS.length === 4 && new Set(bosses.BOSS_DEFINITIONS.map((boss) => boss.id)).size === 4,
    fourHundredZeroSkillCompletions: results.reduce((total, result) => total + result.completed, 0) === attemptsPerBoss * 4,
    noDeaths: results.every((result) => result.deaths === 0),
    noDeadlocks: results.every((result) => result.deadlocks === 0),
    explicitPhaseEvents: results.every((result) => result.eventTotals.phaseEvents >= result.attempts),
    explicitBreakEvents: results.every((result) => result.eventTotals.breakEvents >= result.attempts * 2),
    explicitVictoryEvents: results.every((result) => result.eventTotals.victoryEvents === result.attempts),
    allThreeBaseModulesCovered: ["Basic Dash", "Charged Dash", "Ultimate"].every((module) => (
      results.some((result) => result.activeModules.includes(module))
    )),
  };
  const report = {
    ok: Object.values(gates).every(Boolean),
    generatedAt: new Date().toISOString(),
    contract: "FG-B01 / FG-B02 / FG-B03",
    fixedSeed,
    attemptsPerBoss,
    totalAttempts: attemptsPerBoss * 4,
    gates,
    bosses: results,
    replayEvidence: "tests/bosses.test.ts",
  };
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(resolve(outputDirectory, "boss-no-upgrade.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
} finally {
  await server.close();
}

function practice(game, bossDefinitionId, seed) {
  const state = game.createFullGameGame(seed);
  assert(game.dispatchGameCommand(state, { type: "start-boss-practice", bossDefinitionId }).result === "boss-practice-started", "practice command rejected");
  advanceUntil(game, state, () => state.run.fullGame?.activeBoss !== null, 300);
  return state;
}

function solveRailHound(game, state) {
  const seen = new Set();
  for (let hit = 0; hit < 3; hit += 1) {
    advanceUntil(game, state, () => {
      const runtime = state.run.fullGame?.activeBoss;
      if (!runtime) return false;
      if (runtime.actionPhase === "telegraph" && !seen.has(runtime.attackSequence)) {
        seen.add(runtime.attackSequence);
        if (game.getPlayerAction(state) === "ready") {
          const perpendicular = { x: -runtime.lockedDirection.z, z: runtime.lockedDirection.x };
          game.dispatchGameCommand(state, {
            type: "activate-ability",
            slot: "primary",
            target: {
              x: clamp(state.player.position.x + perpendicular.x * 10, -18, 18),
              z: clamp(state.player.position.z + perpendicular.z * 8, -10, 10),
            },
          });
        }
      }
      return runtime.actionPhase === "vulnerable";
    }, 1_500);
    hitRailSideCore(game, state);
  }
  finish(game, state);
}

function solveSiegeChoir(game, state) {
  for (let round = 0; round < 2; round += 1) {
    const runtime = state.run.fullGame?.activeBoss;
    assert(runtime?.mechanics.kind === "siege-choir", "missing Siege mechanics");
    for (const id of runtime.mechanics.turretEntityIds) {
      const turret = state.enemies.find((enemy) => enemy.id === id && enemy.alive);
      if (turret) dashThrough(game, state, turret.position, 3);
    }
    dashTo(game, state, { x: 10, z: -6 });
    chargedDash(game, state, { x: -10, z: -6 });
    chargedDash(game, state, { x: 10, z: -6 });
    dashTo(game, state, { x: 0, z: -11 });
    dashThrough(game, state, bossEntity(state).position, 7);
    if (round === 0) advanceUntil(game, state, () => state.run.fullGame?.activeBoss?.actionPhase === "objective", 1_000);
  }
  finish(game, state);
}

function hitRailSideCore(game, state) {
  const runtime = state.run.fullGame?.activeBoss;
  assert(runtime?.mechanics.kind === "rail-hound", "missing Rail Hound runtime");
  const boss = bossEntity(state);
  const perpendicular = { x: -runtime.lockedDirection.z, z: runtime.lockedDirection.x };
  const side = (state.player.position.x - boss.position.x) * perpendicular.x +
    (state.player.position.z - boss.position.z) * perpendicular.z >= 0 ? 1 : -1;
  dashTo(game, state, {
    x: clamp(boss.position.x + perpendicular.x * side * 5, -19, 19),
    z: clamp(boss.position.z + perpendicular.z * side * 5, -11.5, 11.5),
  });
  dashTo(game, state, {
    x: clamp(boss.position.x - perpendicular.x * side * 7, -19, 19),
    z: clamp(boss.position.z - perpendicular.z * side * 7, -11.5, 11.5),
  });
}

function solveMirrorRegent(game, state) {
  for (let hit = 0; hit < 3; hit += 1) {
    const runtime = state.run.fullGame?.activeBoss;
    assert(runtime?.mechanics.kind === "mirror-regent", "missing Mirror mechanics");
    const real = state.enemies.find((enemy) => enemy.id === runtime.mechanics.realEntityId);
    assert(real, "missing real Mirror entity");
    dashThrough(game, state, real.position, 6);
    if (hit < 2) advanceUntil(game, state, () => state.run.fullGame?.activeBoss?.actionPhase === "objective", 1_000);
  }
  finish(game, state);
}

function solveLastConductor(game, state) {
  advanceUntil(game, state, () => state.run.fullGame?.activeBoss?.actionPhase === "objective", 1_000);
  const barrage = lastMechanics(state);
  for (const id of barrage.barrageSupportEntityIds) {
    const support = state.enemies.find((enemy) => enemy.id === id && enemy.alive);
    if (support) dashThrough(game, state, support.position, 3);
  }
  advanceUntil(game, state, () => state.run.fullGame?.activeBoss?.coreExposed === true, 300);
  dashThrough(game, state, bossEntity(state).position, 7);

  waitLastPhase(game, state, 1);
  for (const node of lastMechanics(state).railNodes) dashTo(game, state, node.position);
  waitLastPhase(game, state, 2);
  dashTo(game, state, { x: 0, z: 6 });
  chargedDash(game, state, { x: 0, z: -11 });
  dashTo(game, state, { x: 10, z: -7 });
  chargedDash(game, state, { x: -10, z: -7 });
  chargedDash(game, state, { x: 10, z: -7 });
  dashThrough(game, state, bossEntity(state).position, 7);

  waitLastPhase(game, state, 3);
  const points = lastMechanics(state).finaleNodes.map((node) => node.position);
  settleReady(game, state);
  assert(game.dispatchGameCommand(state, { type: "start-ultimate" }).result === "ultimate-planning-started", "finale Ultimate did not start");
  assert(game.dispatchGameCommand(state, { type: "add-ultimate-point", target: points[0] }).result === "ultimate-point-added", "finale point one rejected");
  assert(game.dispatchGameCommand(state, { type: "add-ultimate-point", target: points[1] }).result === "ultimate-point-added", "finale point two rejected");
  assert(game.dispatchGameCommand(state, { type: "add-ultimate-point", target: points[2] }).result === "ultimate-executing", "finale did not execute");
  finish(game, state);
}

function waitLastPhase(game, state, phaseIndex) {
  advanceUntil(game, state, () => {
    const runtime = state.run.fullGame?.activeBoss;
    return runtime?.phaseIndex === phaseIndex && runtime.actionPhase === "objective";
  }, 1_500);
}

function chargedDash(game, state, target) {
  settleReady(game, state);
  assert(game.dispatchGameCommand(state, { type: "begin-charge", target }).result === "charge-started", "charge did not start");
  for (let tick = 0; tick < 80 && state.player.charge !== null; tick += 1) stepAlive(game, state);
  assert(game.dispatchGameCommand(state, { type: "release-charge", target }).result === "charged-released", "charged dash did not release");
  settleReady(game, state);
}

function dashThrough(game, state, position, extraDistance) {
  const dx = position.x - state.player.position.x;
  const dz = position.z - state.player.position.z;
  const length = Math.max(0.001, Math.hypot(dx, dz));
  dashTo(game, state, {
    x: clamp(position.x + dx / length * extraDistance, -19, 19),
    z: clamp(position.z + dz / length * extraDistance, -11.5, 11.5),
  });
}

function dashTo(game, state, target) {
  settleReady(game, state);
  assert(game.dispatchGameCommand(state, { type: "activate-ability", slot: "primary", target }).result === "started", "Basic Dash did not start");
  settleReady(game, state);
}

function settleReady(game, state) {
  advanceUntil(game, state, () => game.getPlayerAction(state) === "ready" || state.stage.phase !== "playing", 600);
}

function finish(game, state) {
  advanceUntil(game, state, () => state.run.fullGame?.phase === "victory", 1_500);
}

function advanceUntil(game, state, predicate, maximumTicks) {
  for (let tick = 0; tick < maximumTicks && !predicate(); tick += 1) stepAlive(game, state);
  assert(predicate(), `deadlock at ${state.run.fullGame?.activeBoss?.phaseId}/${state.run.fullGame?.activeBoss?.actionPhase}`);
}

function stepAlive(game, state) {
  game.stepGame(state);
  if (state.player.hp === 0) throw new Error(`autoplayer died at ${state.run.fullGame?.activeBoss?.phaseId}`);
}

function bossEntity(state) {
  const entity = state.enemies.find((enemy) => enemy.id === state.run.fullGame?.activeBoss?.entityId);
  assert(entity, "missing Boss entity");
  return entity;
}

function lastMechanics(state) {
  const mechanics = state.run.fullGame?.activeBoss?.mechanics;
  assert(mechanics?.kind === "last-conductor", "missing Last Conductor mechanics");
  return mechanics;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
