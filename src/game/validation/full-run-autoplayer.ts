import { rewardPoolV2SkillDefinitionById } from "../../content/upgrades/reward-pool-v2";
import type { GameCommand, GameCommandDispatchResult, GameState, Vec2 } from "../domain/types";
import { routeNodeById } from "../run/run-system";
import { getPlayerAction, stepGame } from "../game";
import { planDashGeometry } from "../entities/obstacle-system";

const VALIDATION_SKILL_PRIORITY = [
  "skill-wide-slash-v1",
  "skill-breach-momentum-v1",
  "skill-chain-breach-v1",
  "skill-execution-tempo-v1",
  "skill-predator-drive-v1",
  "skill-backline-battery-v1",
  "skill-armor-shrapnel-v1",
  "skill-kill-momentum-v1",
  "skill-projectile-reversal-v1",
  "skill-echo-slash-v1",
] as const;

export interface FullRunAutoplayerResult {
  readonly route: Array<{ readonly id: string; readonly act: number; readonly layer: number; readonly kind: string }>;
  readonly completedNodes: Array<{ readonly id: string; readonly act: number; readonly layer: number; readonly kind: string }>;
  readonly bosses: string[];
  readonly rewardChoices: string[];
  readonly finalSkills: string[];
  readonly victory: true;
}

/**
 * Completes the Redesign V2 run flow. The third parameter is retained only for
 * compatibility with legacy validation callers; V2 builds come exclusively
 * from the reward drafts produced between encounters.
 */
export function completeFullRunForValidation(
  state: GameState,
  send: (command: GameCommand) => GameCommandDispatchResult,
  _ignoredLegacyBuildTargets: readonly string[] = [],
): FullRunAutoplayerResult {
  const bosses: string[] = [];
  const rewardChoices: string[] = [];
  assert(send({ type: "start-full-game-run" }).result === "run-started", "run did not start");
  const initialPhase = state.run.fullGame?.phase;
  assert(initialPhase === "combat", `run started at ${initialPhase}`);
  for (let guard = 0; guard < 80; guard += 1) {
    const campaign = state.run.fullGame;
    assert(campaign, "campaign disappeared");
    if (campaign.phase === "victory") break;
    assert(campaign.phase === "combat", `unexpected phase ${campaign.phase}`);
    const currentNodeId = campaign.routeProgress.currentNodeId;
    assert(currentNodeId, "combat has no current route node");
    const node = routeNodeById(campaign.routeProgress.route, currentNodeId);
    if (node.kind === "boss") {
      advanceUntil(state, () => state.run.fullGame?.activeBoss !== null, 400);
      const bossId = state.run.fullGame?.activeBoss?.definitionId;
      assert(bossId, "boss runtime did not start");
      solveBoss(state, send, bossId);
      bosses.push(bossId);
    } else {
      playEncounter(state, send);
    }

    const completedCampaign = state.run.fullGame;
    assert(completedCampaign, "campaign disappeared after combat");
    if (completedCampaign.phase === "victory") break;
    assert(completedCampaign.phase === "upgrade-choice", `combat ended at ${completedCampaign.phase}`);
    const draft = completedCampaign.activeRewardDraft;
    assert(draft, "upgrade choice has no active reward draft");
    assert(draft.candidateSkillIds.length === 3, `reward draft ${draft.offerId} does not contain three skills`);
    const legalSkillIds = draft.candidateSkillIds.filter((skillId) => {
      const definition = rewardPoolV2SkillDefinitionById(skillId);
      return !completedCampaign.skills.committedSkillIds.includes(skillId)
        && definition.prerequisites.every((id) => completedCampaign.skills.committedSkillIds.includes(id));
    });
    const selectedSkillId = [...legalSkillIds].sort((left, right) => (
      validationSkillPriority(left) - validationSkillPriority(right)
      || left.localeCompare(right)
    ))[0];
    assert(selectedSkillId, `reward draft ${draft.offerId} has no legal skill`);
    assert(send({
      type: "select-reward-skill",
      offerId: draft.offerId,
      skillId: selectedSkillId,
    }).result === "reward-skill-selected", `reward selection failed for ${selectedSkillId}`);
    rewardChoices.push(selectedSkillId);
    assert(state.run.fullGame?.phase === "combat", `reward continued at ${state.run.fullGame?.phase}`);
  }
  const completedCampaign = state.run.fullGame;
  assert(completedCampaign?.phase === "victory", `run ended at ${completedCampaign?.phase}`);
  const route = completedCampaign.routeProgress.completedNodeIds.map((id) => {
    const node = routeNodeById(completedCampaign.routeProgress.route, id);
    return { id: node.id, act: node.actIndex + 1, layer: node.layerIndex + 1, kind: node.kind };
  });
  assert(bosses.length === 4, `run completed with ${bosses.length} bosses`);
  assert(new Set(bosses).size === 4, "run did not complete four distinct bosses");
  return {
    route,
    completedNodes: route,
    bosses,
    rewardChoices,
    finalSkills: [...completedCampaign.skills.committedSkillIds],
    victory: true,
  };
}

function validationSkillPriority(skillId: string): number {
  if (
    skillId === "skill-curve-dash-v1"
    || skillId === "skill-refraction-v1"
    || skillId === "skill-rapid-dash-v1"
  ) return 10_000;
  const index = VALIDATION_SKILL_PRIORITY.indexOf(skillId as typeof VALIDATION_SKILL_PRIORITY[number]);
  return index === -1 ? VALIDATION_SKILL_PRIORITY.length : index;
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
  assert(state.run.fullGame?.phase === "upgrade-choice", `encounter ended at ${state.run.fullGame?.phase}`);
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
    if (hit < 2) advanceUntil(state, () => (
      state.run.fullGame?.activeBoss?.actionPhase === "objective"
      && getPlayerAction(state) === "ready"
    ), 1_000);
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
  const requiredPointCount = state.player.ultimatePlanning?.requiredPointCount;
  assert(requiredPointCount === 3 || requiredPointCount === 4, "final Ultimate has an invalid point count");
  const plannedPoints = requiredPointCount === 4 ? [...points, { x: 0, z: 0 }] : points;
  for (let index = 0; index < plannedPoints.length; index += 1) {
    const result = send({ type: "add-ultimate-point", target: plannedPoints[index]! }).result;
    assert(result === (index === plannedPoints.length - 1 ? "ultimate-executing" : "ultimate-point-added"), "final Ultimate point rejected");
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
  advanceUntil(state, () => state.run.fullGame?.phase === "upgrade-choice" || state.run.fullGame?.phase === "victory", 1_500);
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
