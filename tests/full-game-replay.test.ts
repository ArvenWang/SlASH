import { describe, expect, test } from "vitest";
import { eventForRouteNode } from "../src/content/events/definitions";
import { encounterForRouteNode } from "../src/content/encounters/definitions";
import {
  createFullGameGame,
  dispatchGameCommand,
  drainGameEvents,
  getPlayerAction,
  stepGame,
  type GameState,
  type Vec2,
} from "../src/game/game";
import {
  REPLAY_CONTENT_VERSION,
  REPLAY_VERSION,
  createReplayRecorder,
  playReplay,
  type ReplayRecorder,
} from "../src/game/replay/replay";
import type { RouteNodeState } from "../src/game/run/types";

describe("full-game replay v2", () => {
  test("replays route, allocation, Charged, Ultimate, and Event commands to the same hash", () => {
    const { state, target } = stateWithReplayFriendlyEvent();
    const recorder = createReplayRecorder(state);

    beginRunWithBuild(state, recorder);
    enterNextNodeToward(state, recorder, target.id);
    playCurrentEncounter(state, recorder, { useCharged: true, useUltimate: false });
    recorder.dispatch({ type: "acknowledge-reward" });
    enterNextNodeToward(state, recorder, target.id);
    playCurrentEncounter(state, recorder, { useCharged: false, useUltimate: false });
    recorder.dispatch({ type: "acknowledge-reward" });
    enterNextNodeToward(state, recorder, target.id);
    expect(state.run.fullGame?.phase).toBe("event");
    const event = eventForRouteNode(target, state.run.seed);
    const energyChoice = event.choices.find((choice) => (
      choice.effects.some((effect) => effect.resourceId === "next-combat-energy")
    ));
    if (!energyChoice) throw new Error("Replay Event must provide next-combat energy.");
    expect(recorder.dispatch({ type: "resolve-event-choice", choiceId: energyChoice.id }).result).toBe("event-resolved");
    recorder.dispatch({ type: "acknowledge-reward" });
    enterFirstAvailableNode(state, recorder);
    playCurrentEncounter(state, recorder, { useCharged: false, useUltimate: true });

    const log = recorder.finish();
    expect(log.mode).toBe("full-game");
    expect(log.version).toBe(REPLAY_VERSION);
    expect(log.contentVersion).toBe(REPLAY_CONTENT_VERSION);
    expect(log.entries.some((entry) => entry.command.type === "begin-charge")).toBe(true);
    expect(log.entries.some((entry) => entry.command.type === "release-charge")).toBe(true);
    expect(log.entries.some((entry) => entry.command.type === "start-ultimate")).toBe(true);
    expect(log.entries.filter((entry) => entry.command.type === "add-ultimate-point")).toHaveLength(3);
    expect(log.entries.some((entry) => entry.command.type === "resolve-event-choice")).toBe(true);

    const replay = playReplay(log);
    expect(replay.matched).toBe(true);
    expect(replay.state.run.fullGame?.phase).toBe("reward");
    expect(replay.state.run.fullGame?.eventHistory).toHaveLength(1);
  });

  test("replays a real Forge cascade and replacement allocation", () => {
    const { state, target } = stateWithReachableForge();
    const recorder = createReplayRecorder(state);
    beginRunWithBuild(state, recorder);
    enterNextNodeToward(state, recorder, target.id);
    playCurrentEncounter(state, recorder, { useCharged: false, useUltimate: false });
    recorder.dispatch({ type: "acknowledge-reward" });
    enterNextNodeToward(state, recorder, target.id);
    playCurrentEncounter(state, recorder, { useCharged: false, useUltimate: false });
    recorder.dispatch({ type: "acknowledge-reward" });
    enterNextNodeToward(state, recorder, target.id);

    expect(state.run.fullGame?.phase).toBe("forge");
    expect(recorder.dispatch({ type: "preview-skill-refund", skillId: "skill-wide-slash-v1" }).result).toBe("skill-refunded");
    expect(recorder.dispatch({ type: "preview-skill-purchase", skillId: "skill-curve-dash-v1" }).result).toBe("skill-drafted");
    expect(recorder.dispatch({ type: "preview-skill-purchase", skillId: "skill-cross-execution-v1" }).result).toBe("skill-drafted");
    expect(recorder.dispatch({ type: "confirm-forge" }).result).toBe("forge-confirmed");

    const log = recorder.finish();
    expect(log.entries.some((entry) => entry.command.type === "confirm-forge")).toBe(true);
    const replay = playReplay(log);
    expect(replay.matched).toBe(true);
    expect(replay.state.run.fullGame?.skills.committedSkillIds).toEqual([
      "skill-curve-dash-v1",
      "skill-cross-execution-v1",
    ]);
  });

  test("rejects unsupported schema, content, and mode instead of approximate playback", () => {
    const state = createFullGameGame(1);
    const log = createReplayRecorder(state).finish();
    expect(() => playReplay({ ...log, version: 999 as typeof REPLAY_VERSION })).toThrow(/Unsupported replay version/);
    expect(() => playReplay({ ...log, contentVersion: "future" as typeof REPLAY_CONTENT_VERSION })).toThrow(/Unsupported replay version/);
    expect(() => playReplay({ ...log, mode: "unknown" as typeof log.mode })).toThrow(/Unsupported replay mode/);
  });
});

function beginRunWithBuild(state: GameState, recorder: ReplayRecorder): void {
  expect(recorder.dispatch({ type: "start-full-game-run" }).result).toBe("run-started");
  expect(recorder.dispatch({ type: "preview-skill-purchase", skillId: "skill-wide-slash-v1" }).result).toBe("skill-drafted");
  expect(recorder.dispatch({ type: "preview-skill-purchase", skillId: "skill-gravity-slash-v1" }).result).toBe("skill-drafted");
}

function enterNextNodeToward(state: GameState, recorder: ReplayRecorder, targetId: string): void {
  const campaign = state.run.fullGame;
  if (!campaign || campaign.phase !== "planning") throw new Error("Expected Planning before route selection.");
  const node = campaign.routeProgress.availableNodeIds
    .map((id) => routeNode(state, id))
    .filter((candidate) => reachesNode(state, candidate, targetId))
    .sort((first, second) => encounterGeometryScore(state, first) - encounterGeometryScore(state, second))[0];
  if (!node) throw new Error(`No available route reaches ${targetId}.`);
  expect(recorder.dispatch({ type: "preview-route-node", nodeId: node.id }).result).toBe("route-previewed");
  expect(recorder.dispatch({ type: "confirm-planning" }).result).toBe("planning-confirmed");
}

function encounterGeometryScore(state: GameState, node: RouteNodeState): number {
  const definition = encounterForRouteNode(node, state.run.seed);
  return definition ? definition.initialObstacles.length * 10 + definition.initialHazards.length : 0;
}

function enterFirstAvailableNode(state: GameState, recorder: ReplayRecorder): void {
  const nodeId = state.run.fullGame?.routeProgress.availableNodeIds[0];
  if (!nodeId) throw new Error("Missing available route node.");
  expect(recorder.dispatch({ type: "preview-route-node", nodeId }).result).toBe("route-previewed");
  expect(recorder.dispatch({ type: "confirm-planning" }).result).toBe("planning-confirmed");
}

function playCurrentEncounter(
  state: GameState,
  recorder: ReplayRecorder,
  options: { useCharged: boolean; useUltimate: boolean },
): void {
  let chargedUsed = false;
  let ultimateUsed = false;
  let retries = 0;
  for (
    let guard = 0;
    guard < 12_000 && (state.run.fullGame?.phase === "combat" || state.run.fullGame?.phase === "defeat");
    guard += 1
  ) {
    if (state.stage.phase === "dead") {
      if (retries >= 4) {
        throw new Error(`Replay test autoplayer exceeded four deterministic retries in ${state.run.fullGame?.activeEncounterTemplateId}.`);
      }
      expect(recorder.dispatch({ type: "restart-stage" }).result).toBe("restarted");
      retries += 1;
      continue;
    }
    if (state.stage.phase !== "playing") throw new Error(`Encounter left Playing in ${state.stage.phase}.`);
    if (getPlayerAction(state) === "ready" && state.enemies.some((enemy) => enemy.alive)) {
      if (options.useCharged && !chargedUsed) {
        const target = chooseDashTarget(state);
        expect(recorder.dispatch({ type: "begin-charge", target }).result).toBe("charge-started");
        for (let tick = 0; tick < 80 && state.player.charge !== null; tick += 1) {
          stepGame(state);
          drainGameEvents(state);
        }
        expect(recorder.dispatch({ type: "release-charge", target }).result).toBe("charged-released");
        chargedUsed = true;
      } else if (options.useUltimate && !ultimateUsed && state.player.ultimateEnergy >= 100) {
        expect(recorder.dispatch({ type: "start-ultimate" }).result).toBe("ultimate-planning-started");
        const points = ultimatePoints(state);
        expect(recorder.dispatch({ type: "add-ultimate-point", target: points[0]! }).result).toBe("ultimate-point-added");
        expect(recorder.dispatch({ type: "add-ultimate-point", target: points[1]! }).result).toBe("ultimate-point-added");
        expect(recorder.dispatch({ type: "add-ultimate-point", target: points[2]! }).result).toBe("ultimate-executing");
        ultimateUsed = true;
      } else {
        recorder.dispatch({ type: "activate-ability", slot: "primary", target: chooseDashTarget(state) });
      }
    }
    stepGame(state);
    drainGameEvents(state);
  }
  expect(state.run.fullGame?.phase).toBe("reward");
  if (options.useCharged) expect(chargedUsed).toBe(true);
  if (options.useUltimate) expect(ultimateUsed).toBe(true);
}

function ultimatePoints(state: GameState): [Vec2, Vec2, Vec2] {
  const alive = state.enemies.filter((enemy) => enemy.alive).map((enemy) => ({ ...enemy.position }));
  const fallback: Vec2[] = [
    { x: state.stage.arena.minX + 2, z: state.stage.arena.minZ + 2 },
    { x: state.stage.arena.maxX - 2, z: 0 },
    { x: 0, z: state.stage.arena.maxZ - 2 },
  ];
  return [alive[0] ?? fallback[0]!, alive[1] ?? fallback[1]!, alive[2] ?? fallback[2]!];
}

function safeNode(state: GameState, kind: "event" | "forge"): RouteNodeState {
  const node = state.run.fullGame?.routeProgress.route.acts[0]?.layers[2]
    ?.find((candidate) => candidate.kind === kind);
  if (!node) throw new Error(`Missing ${kind} safe node.`);
  return node;
}

function stateWithReachableForge(): { state: GameState; target: RouteNodeState } {
  for (let seed = 0; seed < 1_000; seed += 1) {
    const state = createFullGameGame(seed);
    const target = state.run.fullGame?.routeProgress.route.acts[0]?.layers[2]
      ?.find((node) => node.kind === "forge");
    if (target) return { state, target };
  }
  throw new Error("No Forge seed found.");
}

function stateWithReplayFriendlyEvent(): { state: GameState; target: RouteNodeState } {
  for (let seed = 0; seed < 2_000; seed += 1) {
    const state = createFullGameGame(seed);
    const target = state.run.fullGame?.routeProgress.route.acts[0]?.layers[2]
      ?.find((node) => node.kind === "event");
    if (!target) continue;
    const event = eventForRouteNode(target, seed);
    if (!event.choices.some((choice) => choice.effects.some((effect) => effect.resourceId === "next-combat-energy"))) {
      continue;
    }
    const entries = state.run.fullGame?.routeProgress.route.acts[0]?.layers[0] ?? [];
    const hasClearPath = entries.some((entry) => {
      if (!reachesNode(state, entry, target.id) || encounterGeometryScore(state, entry) !== 0) return false;
      return entry.nextNodeIds
        .map((id) => routeNode(state, id))
        .some((next) => reachesNode(state, next, target.id) && encounterGeometryScore(state, next) === 0);
    });
    if (hasClearPath) return { state, target };
  }
  throw new Error("No replay-friendly deterministic Event path found.");
}

function routeNode(state: GameState, id: string): RouteNodeState {
  const nodes = state.run.fullGame?.routeProgress.route.acts
    .flatMap((act) => act.layers.flatMap((layer) => layer));
  const node = nodes?.find((candidate) => candidate.id === id);
  if (!node) throw new Error(`Unknown route node ${id}.`);
  return node;
}

function reachesNode(state: GameState, start: RouteNodeState, targetId: string): boolean {
  const pending = [start.id];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const id = pending.pop();
    if (!id || visited.has(id)) continue;
    if (id === targetId) return true;
    visited.add(id);
    pending.push(...routeNode(state, id).nextNodeIds);
  }
  return false;
}

function chooseDashTarget(state: GameState): Vec2 {
  const player = state.player.position;
  let best: { target: Vec2; score: number; travel: number } | null = null;
  for (const enemy of state.enemies) {
    if (!enemy.alive) continue;
    const target = extendToArenaBoundary(player, enemy.position, state.stage.arena);
    if (!target) continue;
    const score = state.enemies.reduce((count, candidate) => (
      count + (candidate.alive && distanceSquaredPointToSegment(candidate.position, player, target) <= 1.02 ** 2 ? 1 : 0)
    ), 0);
    const travel = Math.hypot(target.x - player.x, target.z - player.z);
    if (!best || score > best.score || (score === best.score && travel > best.travel)) {
      best = { target, score, travel };
    }
  }
  return best?.target ?? { x: -player.x, z: -player.z };
}

function extendToArenaBoundary(player: Vec2, enemy: Vec2, arena: GameState["stage"]["arena"]): Vec2 | null {
  const dx = enemy.x - player.x;
  const dz = enemy.z - player.z;
  const length = Math.hypot(dx, dz);
  if (length <= 1e-6) return null;
  const dirX = dx / length;
  const dirZ = dz / length;
  const margin = 0.5;
  const candidates: number[] = [];
  if (dirX > 1e-6) candidates.push((arena.maxX - margin - player.x) / dirX);
  if (dirX < -1e-6) candidates.push((arena.minX + margin - player.x) / dirX);
  if (dirZ > 1e-6) candidates.push((arena.maxZ - margin - player.z) / dirZ);
  if (dirZ < -1e-6) candidates.push((arena.minZ + margin - player.z) / dirZ);
  const distance = Math.min(...candidates.filter((value) => value > 0));
  return Number.isFinite(distance)
    ? { x: player.x + dirX * distance, z: player.z + dirZ * distance }
    : null;
}

function distanceSquaredPointToSegment(point: Vec2, start: Vec2, end: Vec2): number {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared <= 1e-8) return Number.POSITIVE_INFINITY;
  const ratio = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSquared));
  const x = start.x + dx * ratio;
  const z = start.z + dz * ratio;
  return (point.x - x) ** 2 + (point.z - z) ** 2;
}
