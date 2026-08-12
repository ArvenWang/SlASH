import { describe, expect, test } from "vitest";
import {
  BOSS_DEFINITIONS,
  LAST_CONDUCTOR_BOSS_ID,
  MIRROR_REGENT_BOSS_ID,
  RAIL_HOUND_BOSS_ID,
  SIEGE_CHOIR_BOSS_ID,
} from "../src/content/bosses/definitions";
import {
  createFullGameGame,
  dispatchGameCommand,
  getGameSnapshot,
  getPlayerAction,
  stepGame,
  type GameState,
  type GameCommand,
  type GameCommandDispatchResult,
  type Vec2,
} from "../src/game/game";
import { MIRROR_SLASH_TELEGRAPH_MS } from "../src/game/bosses/mirror-regent";
import { RAIL_HOUND_CORE_WINDOW_MS, RAIL_HOUND_TELEGRAPH_MS } from "../src/game/bosses/rail-hound";
import { SIEGE_CHOIR_CORE_WINDOW_MS } from "../src/game/bosses/siege-choir";
import { createReplayRecorder, playReplay } from "../src/game/replay/replay";
import { campaignEncounterCanComplete } from "../src/game/campaign/campaign-system";

describe("four mechanic Boss encounters", () => {
  test("publishes stable definitions, explicit phases, and readable minimum windows", () => {
    expect(BOSS_DEFINITIONS).toHaveLength(4);
    expect(new Set(BOSS_DEFINITIONS.map((boss) => boss.id)).size).toBe(4);
    expect(RAIL_HOUND_TELEGRAPH_MS).toBeGreaterThanOrEqual(800);
    expect(RAIL_HOUND_CORE_WINDOW_MS).toBeGreaterThanOrEqual(900);
    expect(SIEGE_CHOIR_CORE_WINDOW_MS).toBe(1_500);
    expect(MIRROR_SLASH_TELEGRAPH_MS).toBeGreaterThanOrEqual(600);
    expect(BOSS_DEFINITIONS.every((boss) => boss.phases.length > 0)).toBe(true);
  });

  test("does not clear a Boss encounter when its visible entity disappears before the objective completes", () => {
    const state = practice(RAIL_HOUND_BOSS_ID);
    const campaign = state.run.fullGame;
    const entity = bossEntity(state);
    entity.alive = false;
    entity.state = "dead";
    if (!campaign?.encounterRuntime || !campaign.activeBoss) throw new Error("Missing Boss campaign state.");
    campaign.encounterRuntime.completed = true;
    expect(campaign.activeBoss.completed).toBe(false);
    expect(campaignEncounterCanComplete(state)).toBe(false);
  });

  test("completes Rail Hound with zero skills and three real core hits", () => {
    const state = practice(RAIL_HOUND_BOSS_ID);
    const seenSequences = new Set<number>();
    for (let coreHit = 0; coreHit < 3; coreHit += 1) {
      waitForRailWindow(state, seenSequences);
      hitRailSideCore(state);
      expect(state.run.fullGame?.activeBoss?.breakCount).toBe(coreHit + 1);
    }
    finishBoss(state);
    expect(state.run.selectedUpgrades).toEqual([]);
    expect(state.run.fullGame?.phase).toBe("victory");
  });

  test("completes Siege Choir by removing two actual coverage parts per round then hitting the rear core", () => {
    const state = practice(SIEGE_CHOIR_BOSS_ID);
    for (let round = 1; round <= 2; round += 1) {
      killChoirTurrets(state);
      dashTo(state, { x: 10, z: -6 });
      chargedDash(state, { x: -10, z: -6 });
      chargedDash(state, { x: 10, z: -6 });
      expect(state.run.fullGame?.activeBoss?.coreExposed).toBe(true);
      dashTo(state, { x: 0, z: -11 });
      dashThrough(state, bossEntity(state).position, 7);
      expect(state.run.fullGame?.activeBoss?.breakCount).toBe(round);
      if (round === 1) waitForBossAction(state, "objective");
    }
    finishBoss(state);
    expect(state.run.fullGame?.phase).toBe("victory");
  });

  test("distinguishes Mirror Regent clones, exposes an 800ms recorded path, and ends on the third true hit", () => {
    const state = practice(MIRROR_REGENT_BOSS_ID);
    dashTo(state, { x: 0, z: 10 });
    expect(state.run.fullGame?.activeBoss?.actionPhase).toBe("telegraph");
    expect(state.run.fullGame?.activeBoss?.phaseDurationMs).toBe(MIRROR_SLASH_TELEGRAPH_MS);
    dashTo(state, { x: 15, z: 10 });
    waitForBossAction(state, "objective");

    for (let hit = 0; hit < 3; hit += 1) {
      const runtime = state.run.fullGame?.activeBoss;
      if (!runtime || runtime.mechanics.kind !== "mirror-regent") throw new Error("Missing Mirror runtime.");
      const real = state.enemies.find((enemy) => enemy.id === runtime.mechanics.realEntityId);
      if (!real) throw new Error("Missing real Mirror entity.");
      dashThrough(state, real.position, 6);
      expect(runtime.breakCount).toBe(hit + 1);
      if (hit < 2) waitForBossAction(state, "objective");
    }
    finishBoss(state);
    expect(state.run.fullGame?.phase).toBe("victory");
  });

  test("completes Last Conductor phases in order and requires the three-point Vector finale", () => {
    const state = practice(LAST_CONDUCTOR_BOSS_ID);
    waitForBossAction(state, "objective");
    killLastConductorSupports(state);
    expect(state.run.fullGame?.activeBoss?.coreExposed).toBe(true);
    dashThrough(state, bossEntity(state).position, 7);

    waitForBossPhase(state, 1, "objective");
    const railNodes = lastMechanics(state).railNodes.map((node) => node.position);
    railNodes.forEach((node) => dashTo(state, node));

    waitForBossPhase(state, 2, "objective");
    dashTo(state, { x: 0, z: 6 });
    chargedDash(state, { x: 0, z: -11 });
    dashTo(state, { x: 10, z: -7 });
    chargedDash(state, { x: -10, z: -7 });
    chargedDash(state, { x: 10, z: -7 });
    expect(state.run.fullGame?.activeBoss?.coreExposed).toBe(true);
    dashThrough(state, bossEntity(state).position, 7);

    waitForBossPhase(state, 3, "objective");
    expect(state.player.ultimateEnergy).toBe(100);
    const finaleNodes = lastMechanics(state).finaleNodes.map((node) => node.position);
    settleReady(state);
    expect(dispatchGameCommand(state, { type: "start-ultimate" }).result).toBe("ultimate-planning-started");
    expect(dispatchGameCommand(state, { type: "add-ultimate-point", target: finaleNodes[0]! }).result).toBe("ultimate-point-added");
    expect(dispatchGameCommand(state, { type: "add-ultimate-point", target: finaleNodes[1]! }).result).toBe("ultimate-point-added");
    expect(dispatchGameCommand(state, { type: "add-ultimate-point", target: finaleNodes[2]! }).result).toBe("ultimate-executing");
    finishBoss(state);
    const snapshot = getGameSnapshot(state);
    expect(snapshot.campaign?.boss?.phaseId).toBe("vector-finale");
    expect(snapshot.campaign?.boss?.completed).toBe(true);
    expect(state.run.fullGame?.phase).toBe("victory");
  });

  test("selects the real Act I Boss route and advances Campaign progress into Act II", () => {
    const state = createFullGameGame(911);
    expect(dispatchGameCommand(state, { type: "start-full-game-run" }).result).toBe("run-started");
    const campaign = state.run.fullGame;
    const bossNode = campaign?.routeProgress.route.acts[0]?.layers[5]?.[0];
    if (!campaign || !bossNode || bossNode.kind !== "boss") throw new Error("Missing Act I Boss route node.");
    campaign.routeProgress.actIndex = 0;
    campaign.routeProgress.layerIndex = 5;
    campaign.routeProgress.currentNodeId = null;
    campaign.routeProgress.availableNodeIds = [bossNode.id];
    campaign.routeProgress.phase = "route-map";
    state.stage.phase = "planning";
    expect(dispatchGameCommand(state, { type: "preview-route-node", nodeId: bossNode.id }).result).toBe("route-previewed");
    expect(dispatchGameCommand(state, { type: "confirm-planning" }).result).toBe("planning-confirmed");
    advanceUntil(state, () => state.run.fullGame?.activeBoss !== null, 300);
    const seenSequences = new Set<number>();
    for (let hit = 0; hit < 3; hit += 1) {
      waitForRailWindow(state, seenSequences);
      hitRailSideCore(state);
    }
    advanceUntil(state, () => state.run.fullGame?.phase === "reward", 1_000);
    expect(campaign.routeProgress.actIndex).toBe(1);
    expect(campaign.routeProgress.layerIndex).toBe(0);
    expect(campaign.routeProgress.completedNodeIds).toContain(bossNode.id);
    expect(campaign.pendingReward?.routeReward).toBe("act-clear");
    expect(campaign.activeBoss).toBeNull();
  });

  test("restarts a failed Boss attempt and replays the complete practice fight to the same state hash", () => {
    const state = createFullGameGame(911);
    const recorder = createReplayRecorder(state);
    expect(recorder.dispatch({ type: "start-boss-practice", bossDefinitionId: RAIL_HOUND_BOSS_ID }).result).toBe("boss-practice-started");
    for (let tick = 0; tick < 600 && state.stage.phase !== "dead"; tick += 1) stepGame(state);
    expect(state.stage.phase).toBe("dead");
    expect(recorder.dispatch({ type: "restart-stage" }).result).toBe("restarted");
    advanceUntil(state, () => state.run.fullGame?.activeBoss !== null, 300);

    const send = (command: GameCommand) => recorder.dispatch(command);
    const seenSequences = new Set<number>();
    for (let coreHit = 0; coreHit < 3; coreHit += 1) {
      waitForRailWindow(state, seenSequences, send);
      hitRailSideCore(state, send);
    }
    finishBoss(state);
    const log = recorder.finish();
    const replay = playReplay(log);
    expect(log.entries.some((entry) => entry.command.type === "restart-stage")).toBe(true);
    expect(replay.matched).toBe(true);
    expect(replay.state.run.fullGame?.phase).toBe("victory");
    expect(replay.state.run.fullGame?.activeBoss?.breakCount).toBe(3);
  });
});

function practice(bossDefinitionId: string): GameState {
  const state = createFullGameGame(911);
  expect(dispatchGameCommand(state, { type: "start-boss-practice", bossDefinitionId }).result).toBe("boss-practice-started");
  advanceUntil(state, () => state.run.fullGame?.activeBoss !== null, 300);
  expect(state.run.fullGame?.activeBoss?.definitionId).toBe(bossDefinitionId);
  expect(state.run.selectedUpgrades).toEqual([]);
  return state;
}

function waitForRailWindow(state: GameState, seenSequences: Set<number>, sender?: CommandSender): void {
  advanceUntil(state, () => {
    const runtime = state.run.fullGame?.activeBoss;
    if (!runtime) return false;
    if (runtime.actionPhase === "telegraph" && !seenSequences.has(runtime.attackSequence)) {
      seenSequences.add(runtime.attackSequence);
      if (getPlayerAction(state) === "ready") {
        const perpendicular = { x: -runtime.lockedDirection.z, z: runtime.lockedDirection.x };
        const target = {
          x: clamp(state.player.position.x + perpendicular.x * 10, -18, 18),
          z: clamp(state.player.position.z + perpendicular.z * 8, -10, 10),
        };
        sendCommand(state, { type: "activate-ability", slot: "primary", target }, sender);
      }
    }
    return runtime.actionPhase === "vulnerable";
  }, 1_500);
}

function killChoirTurrets(state: GameState): void {
  const runtime = state.run.fullGame?.activeBoss;
  if (!runtime || runtime.mechanics.kind !== "siege-choir") throw new Error("Missing Siege runtime.");
  for (const id of runtime.mechanics.turretEntityIds) {
    const turret = state.enemies.find((enemy) => enemy.id === id && enemy.alive);
    if (turret) dashThrough(state, turret.position, 3);
  }
}

function hitRailSideCore(state: GameState, sender?: CommandSender): void {
  const runtime = state.run.fullGame?.activeBoss;
  if (!runtime || runtime.mechanics.kind !== "rail-hound") throw new Error("Missing Rail Hound runtime.");
  const boss = bossEntity(state);
  const perpendicular = { x: -runtime.lockedDirection.z, z: runtime.lockedDirection.x };
  const side = (state.player.position.x - boss.position.x) * perpendicular.x +
    (state.player.position.z - boss.position.z) * perpendicular.z >= 0 ? 1 : -1;
  dashTo(state, {
    x: clamp(boss.position.x + perpendicular.x * side * 5, -19, 19),
    z: clamp(boss.position.z + perpendicular.z * side * 5, -11.5, 11.5),
  }, sender);
  dashTo(state, {
    x: clamp(boss.position.x - perpendicular.x * side * 7, -19, 19),
    z: clamp(boss.position.z - perpendicular.z * side * 7, -11.5, 11.5),
  }, sender);
}

function killLastConductorSupports(state: GameState): void {
  for (const id of lastMechanics(state).barrageSupportEntityIds) {
    const support = state.enemies.find((enemy) => enemy.id === id && enemy.alive);
    if (support) dashThrough(state, support.position, 3);
  }
  advanceUntil(state, () => state.run.fullGame?.activeBoss?.coreExposed === true, 300);
}

function chargedDash(state: GameState, target: Vec2): void {
  settleReady(state);
  expect(dispatchGameCommand(state, { type: "begin-charge", target }).result).toBe("charge-started");
  for (let tick = 0; tick < 80 && state.player.charge !== null; tick += 1) stepAlive(state);
  expect(dispatchGameCommand(state, { type: "release-charge", target }).result).toBe("charged-released");
  settleReady(state);
}

function dashThrough(state: GameState, position: Vec2, extraDistance: number, sender?: CommandSender): void {
  const from = state.player.position;
  const dx = position.x - from.x;
  const dz = position.z - from.z;
  const length = Math.max(0.001, Math.hypot(dx, dz));
  dashTo(state, {
    x: clamp(position.x + dx / length * extraDistance, -19, 19),
    z: clamp(position.z + dz / length * extraDistance, -11.5, 11.5),
  }, sender);
}

function dashTo(state: GameState, target: Vec2, sender?: CommandSender): void {
  settleReady(state);
  const result = sendCommand(state, { type: "activate-ability", slot: "primary", target }, sender).result;
  expect(result).toBe("started");
  settleReady(state);
}

type CommandSender = (command: GameCommand) => GameCommandDispatchResult;

function sendCommand(state: GameState, command: GameCommand, sender?: CommandSender): GameCommandDispatchResult {
  return sender ? sender(command) : dispatchGameCommand(state, command);
}

function settleReady(state: GameState): void {
  advanceUntil(state, () => getPlayerAction(state) === "ready" || state.stage.phase !== "playing", 600);
}

function waitForBossAction(state: GameState, action: string): void {
  advanceUntil(state, () => state.run.fullGame?.activeBoss?.actionPhase === action, 1_000);
}

function waitForBossPhase(state: GameState, phaseIndex: number, action: string): void {
  advanceUntil(state, () => {
    const runtime = state.run.fullGame?.activeBoss;
    return runtime?.phaseIndex === phaseIndex && runtime.actionPhase === action;
  }, 1_500);
}

function finishBoss(state: GameState): void {
  advanceUntil(state, () => state.run.fullGame?.phase === "victory", 1_500);
}

function advanceUntil(state: GameState, predicate: () => boolean, maximumTicks: number): void {
  for (let tick = 0; tick < maximumTicks && !predicate(); tick += 1) stepAlive(state);
  if (!predicate()) {
    const runtime = state.run.fullGame?.activeBoss;
    throw new Error(`Condition timed out at ${runtime?.phaseId}/${runtime?.actionPhase}/${runtime?.objectiveCurrent}.`);
  }
}

function stepAlive(state: GameState): void {
  stepGame(state);
  if (state.player.hp === 0) {
    const runtime = state.run.fullGame?.activeBoss;
    throw new Error(`Autoplayer died at ${runtime?.definitionId}/${runtime?.phaseId}/${runtime?.actionPhase}.`);
  }
}

function bossEntity(state: GameState) {
  const id = state.run.fullGame?.activeBoss?.entityId;
  const entity = state.enemies.find((enemy) => enemy.id === id);
  if (!entity) throw new Error("Missing Boss entity.");
  return entity;
}

function lastMechanics(state: GameState) {
  const mechanics = state.run.fullGame?.activeBoss?.mechanics;
  if (!mechanics || mechanics.kind !== "last-conductor") throw new Error("Missing Last Conductor mechanics.");
  return mechanics;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
