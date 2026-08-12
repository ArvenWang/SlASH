import { eventForRouteNode } from "../../content/events/definitions";
import { encounterForRouteNode } from "../../content/encounters/definitions";
import type { GameCommand, GameCommandDispatchResult, GameState, Vec2 } from "../domain/types";
import type { RouteNodeState } from "../run/types";
import { currentRouteNode, routeNodeById } from "../run/run-system";
import { getPlayerAction, stepGame } from "../game";
import { planDashGeometry } from "../entities/obstacle-system";

export interface FullRunAutoplayerResult {
  readonly route: Array<{ readonly id: string; readonly act: number; readonly layer: number; readonly kind: string }>;
  readonly bosses: string[];
}

export function completeFullRunForValidation(
  state: GameState,
  send: (command: GameCommand) => GameCommandDispatchResult,
  buildTargets: readonly string[] = [],
): FullRunAutoplayerResult {
  const route: FullRunAutoplayerResult["route"] = [];
  const bosses: string[] = [];
  assert(send({ type: "start-full-game-run" }).result === "run-started", "run did not start");
  for (let guard = 0; guard < 80 && state.run.fullGame?.phase !== "victory"; guard += 1) {
    const campaign = state.run.fullGame;
    assert(campaign, "campaign disappeared");
    if (campaign.phase === "reward") {
      assert(send({ type: "acknowledge-reward" }).result === "reward-acknowledged", "reward acknowledgement failed");
      continue;
    }
    if (campaign.phase === "event") {
      const node = currentRouteNode(campaign.routeProgress);
      assert(node, "event has no current route node");
      const definition = eventForRouteNode(node, state.run.seed);
      assert(send({ type: "resolve-event-choice", choiceId: definition.choices[0]!.id }).result === "event-resolved", "event resolution failed");
      continue;
    }
    if (campaign.phase === "forge") {
      assert(send({ type: "confirm-forge" }).result === "forge-confirmed", "forge confirmation failed");
      continue;
    }
    assert(campaign.phase === "planning", `unexpected phase ${campaign.phase}`);
    allocateBuild(state, send, buildTargets);
    const node = campaign.routeProgress.availableNodeIds
      .map((id) => routeNodeById(campaign.routeProgress.route, id))
      .sort((a, b) => routePriority(state, a) - routePriority(state, b) || a.id.localeCompare(b.id))[0];
    assert(node, "route has no available node");
    assert(send({ type: "preview-route-node", nodeId: node.id }).result === "route-previewed", "route preview failed");
    assert(send({ type: "confirm-planning" }).result === "planning-confirmed", "planning confirmation failed");
    route.push({ id: node.id, act: node.actIndex + 1, layer: node.layerIndex + 1, kind: node.kind });
    if (node.kind === "event" || node.kind === "forge") continue;
    if (node.kind === "boss") {
      advanceUntil(state, () => state.run.fullGame?.activeBoss !== null, 400);
      const bossId = state.run.fullGame?.activeBoss?.definitionId;
      assert(bossId, "boss runtime did not start");
      solveBoss(state, send, bossId);
      bosses.push(bossId);
    } else {
      playEncounter(state, send);
    }
  }
  assert(state.run.fullGame?.phase === "victory", `run ended at ${state.run.fullGame?.phase}`);
  return { route, bosses };
}

function allocateBuild(state: GameState, send: (command: GameCommand) => GameCommandDispatchResult, targets: readonly string[]): void {
  for (let pass = 0; pass < targets.length; pass += 1) {
    let changed = false;
    for (const skillId of targets) {
      const skills = state.run.fullGame?.skills;
      if (!skills || skills.totalEarnedPoints - skills.committedSkillIds.length - skills.draftAddedSkillIds.length + skills.draftRemovedSkillIds.length <= 0) return;
      if (skills.committedSkillIds.includes(skillId) || skills.draftAddedSkillIds.includes(skillId)) continue;
      if (send({ type: "preview-skill-purchase", skillId }).result === "skill-drafted") changed = true;
    }
    if (!changed) return;
  }
}

function routePriority(state: GameState, node: RouteNodeState): number {
  if (node.kind === "event") return 0;
  if (node.kind === "forge") return 1;
  if (node.kind === "boss") return 1_000;
  const encounter = encounterForRouteNode(node, state.run.seed);
  assert(encounter, `missing encounter for ${node.id}`);
  return (node.kind === "elite" ? 40 : node.kind === "challenge" ? 30 : 10) +
    encounter.initialHazards.length * 20 + encounter.initialObstacles.length * 12 +
    encounter.waves.flatMap((wave) => wave.spawns).filter((spawn) => spawn.enemyDefinitionId.includes("vanguard") || spawn.enemyDefinitionId.includes("bastion") || spawn.enemyDefinitionId.includes("fortress")).length * 4;
}

function playEncounter(state: GameState, send: (command: GameCommand) => GameCommandDispatchResult): void {
  for (let guard = 0; guard < 20_000 && state.run.fullGame?.phase === "combat"; guard += 1) {
    if (state.player.hp === 0) throw new Error(`autoplayer died in ${state.run.fullGame?.activeEncounterTemplateId}`);
    if (getPlayerAction(state) !== "ready" || !state.enemies.some((enemy) => enemy.alive)) {
      stepGame(state);
      continue;
    }
    const target = chooseDashTarget(state);
    const armored = state.enemies.some((enemy) => enemy.alive && enemy.armorParts.some((part) => part.intact));
    if (armored && chargingIsSafe(state)) chargedDash(state, send, target);
    else send({ type: "activate-ability", slot: "primary", target });
    stepGame(state);
  }
  assert(state.run.fullGame?.phase === "reward", `encounter ended at ${state.run.fullGame?.phase}`);
}

function chargingIsSafe(state: GameState): boolean {
  return state.enemies.every((enemy) => {
    if (!enemy.alive || !enemy.tactical) return true;
    if (enemy.tactical.attackPhase === "active") return false;
    if (enemy.tactical.attackPhase !== "telegraph") return true;
    return enemy.tactical.phaseDurationMs - enemy.tactical.phaseElapsedMs > 900;
  });
}

function solveBoss(state: GameState, send: (command: GameCommand) => GameCommandDispatchResult, bossId: string): void {
  if (bossId.includes("rail-hound")) solveRailHound(state, send);
  else if (bossId.includes("siege-choir")) solveSiegeChoir(state, send);
  else if (bossId.includes("mirror-regent")) solveMirrorRegent(state, send);
  else solveLastConductor(state, send);
}

function solveRailHound(state: GameState, send: (command: GameCommand) => GameCommandDispatchResult): void {
  const seen = new Set<number>();
  for (let hit = 0; hit < 3; hit += 1) {
    advanceUntil(state, () => {
      const runtime = state.run.fullGame?.activeBoss;
      if (!runtime) return false;
      if (runtime.actionPhase === "telegraph" && !seen.has(runtime.attackSequence)) {
        seen.add(runtime.attackSequence);
        if (getPlayerAction(state) === "ready") {
          const perpendicular = { x: -runtime.lockedDirection.z, z: runtime.lockedDirection.x };
          send({ type: "activate-ability", slot: "primary", target: {
            x: clamp(state.player.position.x + perpendicular.x * 10, -18, 18),
            z: clamp(state.player.position.z + perpendicular.z * 8, -10, 10),
          } });
        }
      }
      return runtime.actionPhase === "vulnerable";
    }, 1_500);
    const runtime = state.run.fullGame?.activeBoss;
    assert(runtime?.mechanics.kind === "rail-hound", "Rail Hound runtime missing");
    const boss = bossEntity(state);
    const perpendicular = { x: -runtime.lockedDirection.z, z: runtime.lockedDirection.x };
    const side = (state.player.position.x - boss.position.x) * perpendicular.x + (state.player.position.z - boss.position.z) * perpendicular.z >= 0 ? 1 : -1;
    dashTo(state, send, { x: clamp(boss.position.x + perpendicular.x * side * 5, -19, 19), z: clamp(boss.position.z + perpendicular.z * side * 5, -11.5, 11.5) });
    dashTo(state, send, { x: clamp(boss.position.x - perpendicular.x * side * 7, -19, 19), z: clamp(boss.position.z - perpendicular.z * side * 7, -11.5, 11.5) });
  }
  finishBoss(state);
}

function solveSiegeChoir(state: GameState, send: (command: GameCommand) => GameCommandDispatchResult): void {
  for (let round = 0; round < 2; round += 1) {
    const runtime = state.run.fullGame?.activeBoss;
    assert(runtime?.mechanics.kind === "siege-choir", "Siege Choir runtime missing");
    for (const id of runtime.mechanics.turretEntityIds) {
      const turret = state.enemies.find((enemy) => enemy.id === id && enemy.alive);
      if (turret) dashThrough(state, send, turret.position, 3);
    }
    dashTo(state, send, { x: 10, z: -6 });
    chargedDash(state, send, { x: -10, z: -6 });
    chargedDash(state, send, { x: 10, z: -6 });
    dashTo(state, send, { x: 0, z: -11 });
    dashThrough(state, send, bossEntity(state).position, 7);
    if (round === 0) advanceUntil(state, () => state.run.fullGame?.activeBoss?.actionPhase === "objective", 1_000);
  }
  finishBoss(state);
}

function solveMirrorRegent(state: GameState, send: (command: GameCommand) => GameCommandDispatchResult): void {
  for (let hit = 0; hit < 3; hit += 1) {
    const runtime = state.run.fullGame?.activeBoss;
    assert(runtime?.mechanics.kind === "mirror-regent", "Mirror Regent runtime missing");
    const mechanics = runtime.mechanics;
    const real = state.enemies.find((enemy) => enemy.id === mechanics.realEntityId);
    assert(real, "Mirror Regent real body missing");
    dashThrough(state, send, real.position, 6);
    if (hit < 2) advanceUntil(state, () => state.run.fullGame?.activeBoss?.actionPhase === "objective", 1_000);
  }
  finishBoss(state);
}

function solveLastConductor(state: GameState, send: (command: GameCommand) => GameCommandDispatchResult): void {
  advanceUntil(state, () => state.run.fullGame?.activeBoss?.actionPhase === "objective", 1_000);
  for (const id of lastMechanics(state).barrageSupportEntityIds) {
    const support = state.enemies.find((enemy) => enemy.id === id && enemy.alive);
    if (support) dashThrough(state, send, support.position, 3);
  }
  advanceUntil(state, () => state.run.fullGame?.activeBoss?.coreExposed === true, 300);
  dashThrough(state, send, bossEntity(state).position, 7);
  waitLastPhase(state, 1);
  for (const node of lastMechanics(state).railNodes) dashTo(state, send, node.position);
  waitLastPhase(state, 2);
  dashTo(state, send, { x: 0, z: 6 });
  chargedDash(state, send, { x: 0, z: -11 });
  dashTo(state, send, { x: 10, z: -7 });
  chargedDash(state, send, { x: -10, z: -7 });
  chargedDash(state, send, { x: 10, z: -7 });
  dashThrough(state, send, bossEntity(state).position, 7);
  waitLastPhase(state, 3);
  settleReady(state);
  const points = lastMechanics(state).finaleNodes.map((node) => node.position);
  assert(send({ type: "start-ultimate" }).result === "ultimate-planning-started", "final Ultimate did not start");
  for (let index = 0; index < points.length; index += 1) {
    const result = send({ type: "add-ultimate-point", target: points[index]! }).result;
    assert(result === (index === points.length - 1 ? "ultimate-executing" : "ultimate-point-added"), "final Ultimate point rejected");
  }
  finishBoss(state);
}

function chargedDash(state: GameState, send: (command: GameCommand) => GameCommandDispatchResult, target: Vec2): void {
  settleReady(state);
  assert(send({ type: "begin-charge", target }).result === "charge-started", "charge did not start");
  for (let tick = 0; tick < 80 && state.player.charge !== null; tick += 1) stepAlive(state);
  assert(send({ type: "release-charge", target }).result === "charged-released", "charge did not release");
  settleReady(state);
}

function dashThrough(state: GameState, send: (command: GameCommand) => GameCommandDispatchResult, position: Vec2, extraDistance: number): void {
  const dx = position.x - state.player.position.x;
  const dz = position.z - state.player.position.z;
  const length = Math.max(0.001, Math.hypot(dx, dz));
  dashTo(state, send, {
    x: clamp(position.x + dx / length * extraDistance, -19, 19),
    z: clamp(position.z + dz / length * extraDistance, -11.5, 11.5),
  });
}

function dashTo(state: GameState, send: (command: GameCommand) => GameCommandDispatchResult, target: Vec2): void {
  settleReady(state);
  assert(send({ type: "activate-ability", slot: "primary", target }).result === "started", "Basic Dash did not start");
  settleReady(state);
}

function settleReady(state: GameState): void {
  advanceUntil(state, () => getPlayerAction(state) === "ready" || state.stage.phase !== "playing", 600);
}

function finishBoss(state: GameState): void {
  advanceUntil(state, () => state.run.fullGame?.phase === "reward" || state.run.fullGame?.phase === "victory", 1_500);
}

function waitLastPhase(state: GameState, phaseIndex: number): void {
  advanceUntil(state, () => state.run.fullGame?.activeBoss?.phaseIndex === phaseIndex && state.run.fullGame.activeBoss.actionPhase === "objective", 1_500);
}

function advanceUntil(state: GameState, predicate: () => boolean, maximumTicks: number): void {
  for (let tick = 0; tick < maximumTicks && !predicate(); tick += 1) stepAlive(state);
  assert(predicate(), `condition timed out at ${state.run.fullGame?.activeBoss?.phaseId}/${state.run.fullGame?.activeBoss?.actionPhase}`);
}

function stepAlive(state: GameState): void {
  stepGame(state);
  assert(state.player.hp === 1, `autoplayer died in ${state.run.fullGame?.activeEncounterTemplateId}`);
}

function chooseDashTarget(state: GameState): Vec2 {
  const player = state.player.position;
  let best: { readonly target: Vec2; readonly score: number; readonly reachable: boolean } | null = null;
  for (const enemy of state.enemies) {
    if (!enemy.alive) continue;
    const boundaryTarget = extendToArenaBoundary(player, enemy.position, state.stage.arena);
    if (!boundaryTarget) continue;
    for (const target of [boundaryTarget, enemy.position]) {
      const path = planDashGeometry(state, player, target);
      const segments = path.map((segment) => ({ from: segment.from, to: segment.to }));
      const reachable = segments.some((segment) => distanceSquaredPointToSegment(enemy.position, segment.from, segment.to) <= (enemy.radius + 1.15) ** 2);
      const score = state.enemies.reduce((count, candidate) => count + (candidate.alive && segments.some((segment) => distanceSquaredPointToSegment(candidate.position, segment.from, segment.to) <= 1.15 ** 2) ? 1 : 0), 0);
      if (!best || Number(reachable) > Number(best.reachable) || (reachable === best.reachable && score > best.score)) best = { target: { ...target }, score, reachable };
    }
  }
  if (best?.reachable) return best.target;
  return chooseSafeReposition(state);
}

function chooseSafeReposition(state: GameState): Vec2 {
  const arena = state.stage.arena;
  const margin = 1.2;
  const candidates: Vec2[] = [
    { x: arena.minX + margin, z: arena.minZ + margin },
    { x: arena.maxX - margin, z: arena.minZ + margin },
    { x: arena.minX + margin, z: arena.maxZ - margin },
    { x: arena.maxX - margin, z: arena.maxZ - margin },
    { x: 0, z: 0 },
  ];
  const scored = candidates.map((target) => {
    const segments = planDashGeometry(state, state.player.position, target);
    const endpoint = segments.at(-1)?.to ?? state.player.position;
    const travel = Math.hypot(endpoint.x - state.player.position.x, endpoint.z - state.player.position.z);
    const hostileDistance = Math.min(...state.enemies.filter((enemy) => enemy.alive).map((enemy) => Math.hypot(endpoint.x - enemy.position.x, endpoint.z - enemy.position.z)));
    return { target, score: travel + Math.min(8, hostileDistance) };
  });
  return scored.sort((a, b) => b.score - a.score)[0]?.target ?? { x: -state.player.position.x, z: -state.player.position.z };
}

function extendToArenaBoundary(player: Vec2, enemy: Vec2, arena: GameState["stage"]["arena"]): Vec2 | null {
  const dx = enemy.x - player.x;
  const dz = enemy.z - player.z;
  const length = Math.hypot(dx, dz);
  if (length <= 1e-6) return null;
  const x = dx / length;
  const z = dz / length;
  const distances: number[] = [];
  if (x > 1e-6) distances.push((arena.maxX - 0.7 - player.x) / x);
  if (x < -1e-6) distances.push((arena.minX + 0.7 - player.x) / x);
  if (z > 1e-6) distances.push((arena.maxZ - 0.7 - player.z) / z);
  if (z < -1e-6) distances.push((arena.minZ + 0.7 - player.z) / z);
  const distance = Math.min(...distances.filter((value) => value > 0));
  return { x: player.x + x * distance, z: player.z + z * distance };
}

function distanceSquaredPointToSegment(point: Vec2, start: Vec2, end: Vec2): number {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSquared = Math.max(dx * dx + dz * dz, 1e-8);
  const ratio = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSquared));
  const x = start.x + dx * ratio;
  const z = start.z + dz * ratio;
  return (point.x - x) ** 2 + (point.z - z) ** 2;
}

function bossEntity(state: GameState) {
  const enemy = state.enemies.find((candidate) => candidate.id === state.run.fullGame?.activeBoss?.entityId);
  assert(enemy, "Boss entity missing");
  return enemy;
}

function lastMechanics(state: GameState) {
  const mechanics = state.run.fullGame?.activeBoss?.mechanics;
  assert(mechanics?.kind === "last-conductor", "Last Conductor runtime missing");
  return mechanics;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
