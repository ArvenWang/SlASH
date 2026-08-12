import type { BossDefinitionId, EntityId, RouteNodeId } from "../../core/ids";
import { copyVec2, vec2 } from "../../core/math/vec2";
import { createSeededRandom } from "../../core/random/seeded-random";
import {
  encounterForRouteNode,
  fullGameEncounterDefinitions,
} from "../../content/encounters/definitions";
import type { FullGameEncounterDefinition } from "../../content/encounters/types";
import { enemyDefinitions } from "../../content/enemies/definitions";
import { FULL_GAME_ACT_DEFINITIONS } from "../../content/runs/definitions";
import { eventDefinitions, eventForRouteNode } from "../../content/events/definitions";
import type { SpawnDefinition } from "../../content/levels/definitions";
import type { GameState } from "../domain/types";
import {
  createEncounterRuntime,
  recordWaveSpawnedEntities,
  updateEncounterScheduler,
} from "../encounters/encounter-system";
import { emitGameEvent } from "../events/event-buffer";
import { spawnHazard } from "../entities/hazard-system";
import { spawnObstacle } from "../entities/obstacle-system";
import { resolveSafeEncounterSpawns } from "../encounters/spawn-safety";
import {
  availableRouteNodes,
  completeCurrentRouteNode,
  createFullGameRunProgress,
  currentRouteNode,
  routeNodeById,
  selectRouteNode,
} from "../run/run-system";
import {
  FORGE_MOVE_LIMIT,
  commitSkillDraft,
  createSkillAllocationState,
  grantSkillPoints,
  openSkillAllocationVisit,
  previewSkillPurchase,
  previewSkillRefund,
} from "../upgrades/skill-system";
import type { CampaignChallengeRewardState, FullGameCampaignState } from "./types";
import {
  advanceCampaignChallengeRuntime,
  createCampaignChallengeRuntime,
} from "./challenge-system";
import { createArmorPartStates } from "../combat/armor";
import { createEnemyTacticalState } from "../enemies/enemy-attack-system";
import {
  bossDefinitions,
  bossDefinitionForEncounter,
} from "../../content/bosses/definitions";
import { ensureCampaignBossRuntime } from "../bosses/boss-system";

export type CampaignCommandResult =
  | "run-started"
  | "boss-practice-started"
  | "returned-to-title"
  | "route-previewed"
  | "skill-drafted"
  | "skill-refunded"
  | "draft-discarded"
  | "planning-confirmed"
  | "reward-acknowledged"
  | "event-resolved"
  | "forge-token-used"
  | "forge-confirmed"
  | "restarted"
  | "ignored";

export function createFullGameCampaignState(seed: number): FullGameCampaignState {
  return {
    contentVersion: "full-game-v1",
    phase: "title",
    routeProgress: createFullGameRunProgress(seed),
    skills: createSkillAllocationState(),
    provisionalRouteNodeId: null,
    activeEncounterTemplateId: null,
    encounterRuntime: null,
    activeChallenge: null,
    activeBoss: null,
    practiceBossDefinitionId: null,
    activeTriggerIds: [],
    pendingReward: null,
    eliteSkillPointRewardsGranted: 0,
    activeEventDefinitionId: null,
    eventHistory: [],
    forgeTokensSpentThisVisit: 0,
  };
}

export function initializeFullGameCampaign(state: GameState, seed: number): void {
  state.run.seed = seed;
  state.run.random = createSeededRandom(seed).snapshot();
  state.run.selectedUpgrades = [];
  state.run.acquiredResources = {};
  state.run.fullGame = createFullGameCampaignState(seed);
  state.stage.index = 0;
  state.stage.name = FULL_GAME_ACT_DEFINITIONS[0]?.name ?? "ARRIVAL YARD";
  state.stage.phase = "title";
  state.stage.attempt = 1;
  state.player.position = vec2(0, 0);
  state.player.facing = vec2(0, -1);
  state.player.hp = 1;
  state.player.dash = null;
  state.player.charge = null;
  state.player.ultimatePlanning = null;
  state.player.ultimateExecution = null;
  state.player.recoveryRemainingMs = 0;
  state.player.killMomentumStacks = 0;
  state.player.bufferedAbility = null;
  state.enemies = [];
  state.projectiles = [];
  state.obstacles = [];
  state.hazards = [];
  state.combat.kills = 0;
  state.combat.totalEnemies = 0;
  state.combat.scheduledSlashes = [];
  state.combat.storedPath = null;
  state.combat.gravityPulls = [];
  state.lastEvents = [];
}

export function startFullGameRun(state: GameState): CampaignCommandResult {
  const campaign = state.run.fullGame;
  if (!campaign || campaign.phase !== "title") return "ignored";
  campaign.phase = "planning";
  state.stage.phase = "planning";
  openSkillAllocationVisit(campaign.skills, "planning");
  emitGameEvent(state, { type: "campaign-started", seed: state.run.seed });
  return "run-started";
}

export function returnCampaignToTitle(state: GameState): CampaignCommandResult {
  const campaign = state.run.fullGame;
  if (!campaign || (campaign.phase !== "victory" && campaign.phase !== "reward")) return "ignored";
  initializeFullGameCampaign(state, state.run.seed);
  return "returned-to-title";
}

export function previewCampaignRouteNode(
  state: GameState,
  nodeId: RouteNodeId,
): CampaignCommandResult {
  const campaign = state.run.fullGame;
  if (
    !campaign ||
    campaign.phase !== "planning" ||
    !campaign.routeProgress.availableNodeIds.includes(nodeId)
  ) {
    return "ignored";
  }
  campaign.provisionalRouteNodeId = nodeId;
  return "route-previewed";
}

export function previewCampaignSkillPurchase(state: GameState, skillId: string): CampaignCommandResult {
  const campaign = state.run.fullGame;
  if (!campaign || (campaign.phase !== "planning" && campaign.phase !== "forge")) return "ignored";
  return previewSkillPurchase(campaign.skills, skillId).ok ? "skill-drafted" : "ignored";
}

export function previewCampaignSkillRefund(state: GameState, skillId: string): CampaignCommandResult {
  const campaign = state.run.fullGame;
  if (!campaign || (campaign.phase !== "planning" && campaign.phase !== "forge")) return "ignored";
  return previewSkillRefund(campaign.skills, skillId).ok ? "skill-refunded" : "ignored";
}

export function discardCampaignSkillDraft(state: GameState): CampaignCommandResult {
  const campaign = state.run.fullGame;
  if (!campaign || (campaign.phase !== "planning" && campaign.phase !== "forge")) return "ignored";
  campaign.skills.draftAddedSkillIds = [];
  campaign.skills.draftRemovedSkillIds = [];
  return "draft-discarded";
}

export function confirmCampaignPlanning(state: GameState): CampaignCommandResult {
  const campaign = state.run.fullGame;
  const provisionalId = campaign?.provisionalRouteNodeId;
  if (!campaign || campaign.phase !== "planning" || !provisionalId) return "ignored";
  const node = routeNodeById(campaign.routeProgress.route, provisionalId);
  const encounter = encounterForRouteNode(node, state.run.seed);
  if (!encounter && node.kind !== "event" && node.kind !== "forge") return "ignored";

  // Build and route are committed as one transaction. Any failed validation
  // leaves the live campaign untouched.
  const stagedSkills = structuredClone(campaign.skills);
  const stagedRoute = structuredClone(campaign.routeProgress);
  if (!commitSkillDraft(stagedSkills).ok) return "ignored";
  if (selectRouteNode(stagedRoute, provisionalId) !== "selected") return "ignored";

  campaign.skills = stagedSkills;
  campaign.routeProgress = stagedRoute;
  campaign.provisionalRouteNodeId = null;
  campaign.activeEncounterTemplateId = null;
  campaign.encounterRuntime = null;
  campaign.activeChallenge = null;
  campaign.activeBoss = null;
  campaign.practiceBossDefinitionId = null;
  campaign.activeTriggerIds = [];
  campaign.pendingReward = null;
  state.run.selectedUpgrades = [...campaign.skills.committedSkillIds];
  if (node.kind === "event") {
    const event = eventForRouteNode(node, state.run.seed);
    campaign.phase = "event";
    campaign.activeEventDefinitionId = event.id;
    campaign.forgeTokensSpentThisVisit = 0;
    prepareNonCombatState(state, node.id, node.actIndex, "EVENT", "event");
    emitGameEvent(state, { type: "route-node-started", nodeId: node.id, encounterId: event.id });
    return "planning-confirmed";
  }
  if (node.kind === "forge") {
    campaign.phase = "forge";
    campaign.activeEventDefinitionId = null;
    campaign.forgeTokensSpentThisVisit = 0;
    campaign.skills.forgeMoveLimit = FORGE_MOVE_LIMIT;
    openSkillAllocationVisit(campaign.skills, "forge");
    prepareNonCombatState(state, node.id, node.actIndex, "FORGE", "forge");
    emitGameEvent(state, { type: "route-node-started", nodeId: node.id, encounterId: "forge-allocation-v1" });
    return "planning-confirmed";
  }
  if (!encounter) return "ignored";
  campaign.phase = "combat";
  campaign.activeEncounterTemplateId = encounter.id;
  campaign.encounterRuntime = createEncounterRuntime(encounter, state.tick, state.elapsedMs);
  campaign.activeChallenge = createCampaignChallengeRuntime(encounter, state);
  prepareEncounterState(state, node.id, encounter.id, node.actIndex, node.kind.toUpperCase(), false);
  spawnEncounterEnvironment(state, node.id, encounter);
  emitGameEvent(state, { type: "route-node-started", nodeId: node.id, encounterId: encounter.id });
  // Immediate waves begin their warning at the exact planning-confirm tick,
  // rather than one simulation tick later.
  advanceCampaignEncounterScheduler(state);
  return "planning-confirmed";
}

export function startBossPractice(
  state: GameState,
  bossDefinitionId: BossDefinitionId,
): CampaignCommandResult {
  const campaign = state.run.fullGame;
  if (!campaign || campaign.phase !== "title" || !bossDefinitions.has(bossDefinitionId)) return "ignored";
  const boss = bossDefinitions.get(bossDefinitionId);
  const encounter = fullGameEncounterDefinitions.get(boss.encounterId);
  campaign.phase = "combat";
  campaign.practiceBossDefinitionId = boss.id;
  campaign.activeEncounterTemplateId = encounter.id;
  campaign.encounterRuntime = createEncounterRuntime(encounter, state.tick, state.elapsedMs);
  campaign.activeChallenge = null;
  campaign.activeBoss = null;
  campaign.activeTriggerIds = [];
  campaign.pendingReward = null;
  prepareEncounterState(
    state,
    `practice:${boss.id}`,
    encounter.id,
    boss.actIndex,
    `PRACTICE / ${boss.title}`,
    false,
  );
  emitGameEvent(state, {
    type: "route-node-started",
    nodeId: `practice:${boss.id}`,
    encounterId: encounter.id,
  });
  advanceCampaignEncounterScheduler(state);
  return "boss-practice-started";
}

export function advanceCampaignEncounterScheduler(state: GameState): void {
  const campaign = state.run.fullGame;
  const runtime = campaign?.encounterRuntime;
  if (!campaign || campaign.phase !== "combat" || !runtime || state.stage.phase !== "playing") return;
  const definition = fullGameEncounterDefinitions.get(runtime.encounterId);
  const update = updateEncounterScheduler(runtime, definition, {
    tick: state.tick,
    elapsedMs: state.elapsedMs,
    aliveEntityIds: new Set(state.enemies.filter((enemy) => enemy.alive).map((enemy) => enemy.id)),
    triggerIds: new Set(campaign.activeTriggerIds),
  });

  for (const waveId of update.warnedWaveIds) {
    const waveRuntime = runtime.waves.find((wave) => wave.id === waveId);
    emitGameEvent(state, {
      type: "encounter-wave-warning",
      encounterId: definition.id,
      waveId,
      activationAtMs: waveRuntime?.activationAtMs ?? state.elapsedMs,
    });
  }
  for (const waveId of update.activatedWaveIds) {
    const wave = definition.waves.find((candidate) => candidate.id === waveId);
    if (!wave) throw new Error(`Activated unknown encounter wave ${waveId}.`);
    const enemyIds = spawnEncounterWave(state, wave.spawns, definition.enemyMoveSpeed);
    recordWaveSpawnedEntities(runtime, waveId, enemyIds);
    emitGameEvent(state, {
      type: "encounter-wave-started",
      encounterId: definition.id,
      waveId,
      enemyIds,
    });
  }
  for (const waveId of update.completedWaveIds) {
    emitGameEvent(state, {
      type: "encounter-wave-completed",
      encounterId: definition.id,
      waveId,
    });
  }
  advanceCampaignChallengeRuntime(state, definition);
  if (definition.category === "boss") ensureCampaignBossRuntime(state, bossDefinitionForEncounter(definition.id));
}

/** Command handlers may emit gameplay events that Presentation drains before
 * the next fixed tick (notably Ultimate confirmation). Synchronize Challenge
 * metrics at the command boundary so those events cannot be lost. */
export function synchronizeCampaignChallenge(state: GameState): void {
  const campaign = state.run.fullGame;
  if (
    !campaign ||
    campaign.phase !== "combat" ||
    campaign.activeEncounterTemplateId === null ||
    campaign.activeChallenge === null
  ) return;
  advanceCampaignChallengeRuntime(
    state,
    fullGameEncounterDefinitions.get(campaign.activeEncounterTemplateId),
  );
}

export function campaignEncounterCanComplete(state: GameState): boolean {
  const campaign = state.run.fullGame;
  if (
    !campaign ||
    campaign.phase !== "combat" ||
    campaign.encounterRuntime?.completed !== true ||
    campaign.activeEncounterTemplateId === null
  ) return false;
  const definition = fullGameEncounterDefinitions.get(campaign.activeEncounterTemplateId);
  return definition.category !== "boss" || campaign.activeBoss?.completed === true;
}

export function completeCampaignEncounter(state: GameState): boolean {
  const campaign = state.run.fullGame;
  if (!campaign || !campaignEncounterCanComplete(state)) return false;
  if (campaign.practiceBossDefinitionId !== null) {
    campaign.phase = "victory";
    campaign.activeEncounterTemplateId = null;
    campaign.encounterRuntime = null;
    campaign.activeChallenge = null;
    state.player.bufferedAbility = null;
    state.stage.phase = "victory";
    return true;
  }
  const node = currentRouteNode(campaign.routeProgress);
  if (!node) return false;
  return completeCampaignNode(state, node.id);
}

function completeCampaignNode(state: GameState, nodeId: RouteNodeId): boolean {
  const campaign = state.run.fullGame;
  if (!campaign) return false;
  const node = currentRouteNode(campaign.routeProgress);
  if (!node || node.id !== nodeId) return false;
  const completedEncounter = campaign.activeEncounterTemplateId
    ? fullGameEncounterDefinitions.get(campaign.activeEncounterTemplateId)
    : null;
  const challengeReward = completedEncounter ? resolveChallengeReward(state, completedEncounter) : null;
  let skillPointsGranted = 0;
  let eliteRewardConverted = false;
  if (node.reward === "skill-point") {
    skillPointsGranted = grantSkillPoints(campaign.skills, 1);
  } else if (node.reward === "elite-bonus") {
    if (campaign.eliteSkillPointRewardsGranted < 2) {
      skillPointsGranted = grantSkillPoints(campaign.skills, 1);
      if (skillPointsGranted > 0) campaign.eliteSkillPointRewardsGranted += 1;
    } else {
      eliteRewardConverted = true;
    }
  }
  const routeResult = completeCurrentRouteNode(campaign.routeProgress);
  campaign.pendingReward = {
    completedNodeId: node.id,
    routeReward: node.reward,
    skillPointsGranted,
    eliteRewardConverted,
    challenge: challengeReward,
  };
  campaign.encounterRuntime = null;
  campaign.activeEncounterTemplateId = null;
  campaign.activeChallenge = null;
  campaign.activeBoss = null;
  campaign.practiceBossDefinitionId = null;
  campaign.activeEventDefinitionId = null;
  campaign.activeTriggerIds = [];
  state.player.bufferedAbility = null;
  if (skillPointsGranted > 0) {
    emitGameEvent(state, {
      type: "skill-points-granted",
      amount: skillPointsGranted,
      total: campaign.skills.totalEarnedPoints,
      source: node.id,
    });
  }
  emitGameEvent(state, { type: "route-node-completed", nodeId: node.id, result: routeResult });
  if (routeResult === "run-complete") {
    campaign.phase = "victory";
    state.stage.phase = "victory";
    emitGameEvent(state, { type: "campaign-victory", seed: state.run.seed });
  } else {
    campaign.phase = "reward";
    state.stage.phase = "reward";
  }
  return true;
}

export function resolveCampaignEventChoice(
  state: GameState,
  choiceId: string,
): CampaignCommandResult {
  const campaign = state.run.fullGame;
  const node = campaign ? currentRouteNode(campaign.routeProgress) : null;
  if (!campaign || campaign.phase !== "event" || !node || !campaign.activeEventDefinitionId) return "ignored";
  const definition = eventDefinitions.get(campaign.activeEventDefinitionId);
  const choice = definition.choices.find((candidate) => candidate.id === choiceId);
  if (!choice) return "ignored";
  const resourceChanges = choice.effects.map((effect) => {
    const before = state.run.acquiredResources[effect.resourceId] ?? 0;
    const after = Math.min(effect.maximum, Math.max(0, before + effect.amount));
    state.run.acquiredResources[effect.resourceId] = after;
    return { resourceId: effect.resourceId, before, after };
  });
  campaign.eventHistory.push({
    nodeId: node.id,
    eventDefinitionId: definition.id,
    choiceId: choice.id,
  });
  emitGameEvent(state, {
    type: "event-choice-resolved",
    nodeId: node.id,
    eventDefinitionId: definition.id,
    choiceId: choice.id,
    resourceChanges,
  });
  completeCampaignNode(state, node.id);
  return "event-resolved";
}

export function useCampaignForgeToken(state: GameState): CampaignCommandResult {
  const campaign = state.run.fullGame;
  const node = campaign ? currentRouteNode(campaign.routeProgress) : null;
  const tokens = state.run.acquiredResources["reroute-token"] ?? 0;
  if (!campaign || campaign.phase !== "forge" || !node || tokens <= 0) return "ignored";
  state.run.acquiredResources["reroute-token"] = tokens - 1;
  campaign.forgeTokensSpentThisVisit += 1;
  campaign.skills.forgeMoveLimit += 1;
  emitGameEvent(state, {
    type: "forge-token-used",
    nodeId: node.id,
    remainingTokens: tokens - 1,
    moveLimit: campaign.skills.forgeMoveLimit,
  });
  return "forge-token-used";
}

export function confirmCampaignForge(state: GameState): CampaignCommandResult {
  const campaign = state.run.fullGame;
  const node = campaign ? currentRouteNode(campaign.routeProgress) : null;
  if (!campaign || campaign.phase !== "forge" || !node) return "ignored";
  const stagedSkills = structuredClone(campaign.skills);
  const commit = commitSkillDraft(stagedSkills);
  if (!commit.ok) return "ignored";
  stagedSkills.forgeMoveLimit = FORGE_MOVE_LIMIT;
  campaign.skills = stagedSkills;
  state.run.selectedUpgrades = [...campaign.skills.committedSkillIds];
  emitGameEvent(state, {
    type: "forge-completed",
    nodeId: node.id,
    movedSkillIds: [...commit.changedSkillIds],
  });
  campaign.forgeTokensSpentThisVisit = 0;
  completeCampaignNode(state, node.id);
  return "forge-confirmed";
}

export function acknowledgeCampaignReward(state: GameState): CampaignCommandResult {
  const campaign = state.run.fullGame;
  if (!campaign || campaign.phase !== "reward") return "ignored";
  campaign.phase = "planning";
  campaign.pendingReward = null;
  state.stage.phase = "planning";
  const act = FULL_GAME_ACT_DEFINITIONS[campaign.routeProgress.actIndex];
  if (act) {
    state.stage.index = campaign.routeProgress.completedNodeIds.length;
    state.stage.name = act.name;
  }
  state.enemies = [];
  state.combat.kills = 0;
  state.combat.totalEnemies = 0;
  openSkillAllocationVisit(campaign.skills, "planning");
  return "reward-acknowledged";
}

export function markCampaignDefeat(state: GameState): void {
  const campaign = state.run.fullGame;
  if (campaign?.phase === "combat") campaign.phase = "defeat";
}

export function restartCampaignEncounter(state: GameState): CampaignCommandResult {
  const campaign = state.run.fullGame;
  const node = campaign ? currentRouteNode(campaign.routeProgress) : null;
  if (!campaign || (campaign.phase !== "defeat" && state.stage.phase !== "dead")) return "ignored";
  const practiceBoss = campaign.practiceBossDefinitionId === null
    ? null
    : bossDefinitions.get(campaign.practiceBossDefinitionId);
  const encounter = practiceBoss
    ? fullGameEncounterDefinitions.get(practiceBoss.encounterId)
    : node ? encounterForRouteNode(node, state.run.seed) : null;
  if (!encounter) return "ignored";
  const nextAttempt = state.stage.attempt + 1;
  campaign.phase = "combat";
  campaign.activeEncounterTemplateId = encounter.id;
  campaign.encounterRuntime = createEncounterRuntime(encounter, state.tick, state.elapsedMs);
  campaign.activeChallenge = createCampaignChallengeRuntime(encounter, state);
  campaign.activeBoss = null;
  campaign.activeTriggerIds = [];
  const ownerId = practiceBoss ? `practice:${practiceBoss.id}` : node!.id;
  const actIndex = practiceBoss?.actIndex ?? node!.actIndex;
  const label = practiceBoss ? `PRACTICE / ${practiceBoss.title}` : node!.kind.toUpperCase();
  prepareEncounterState(state, ownerId, encounter.id, actIndex, label, true);
  spawnEncounterEnvironment(state, ownerId, encounter);
  state.stage.attempt = nextAttempt;
  advanceCampaignEncounterScheduler(state);
  return "restarted";
}

export function campaignAvailableRouteNodes(state: GameState) {
  const campaign = state.run.fullGame;
  return campaign ? availableRouteNodes(campaign.routeProgress) : [];
}

function prepareEncounterState(
  state: GameState,
  nodeId: RouteNodeId,
  encounterId: string,
  actIndex: number,
  nodeLabel: string,
  preserveClock: boolean,
): void {
  state.stage.index = state.run.fullGame?.routeProgress.completedNodeIds.length ?? 0;
  state.stage.levelId = nodeId;
  state.stage.name = `${FULL_GAME_ACT_DEFINITIONS[actIndex]?.name ?? `ACT ${actIndex + 1}`} / ${nodeLabel}`;
  state.stage.phase = "playing";
  state.stage.attempt = preserveClock ? state.stage.attempt : 1;
  state.stage.encounterId = encounterId;
  state.player.position = vec2(0, 0);
  state.player.facing = vec2(0, -1);
  state.player.hp = 1;
  state.player.dash = null;
  state.player.charge = null;
  state.player.ultimatePlanning = null;
  state.player.ultimateExecution = null;
  state.player.recoveryRemainingMs = 0;
  state.player.killMomentumStacks = 0;
  state.player.bufferedAbility = null;
  state.enemies = [];
  state.projectiles = [];
  state.obstacles = [];
  state.hazards = [];
  state.combat.kills = 0;
  state.combat.totalEnemies = 0;
  state.combat.scheduledSlashes = [];
  state.combat.storedPath = null;
  state.combat.gravityPulls = [];
  if (!preserveClock) {
    const storedEnergy = Math.max(0, state.run.acquiredResources["next-combat-energy"] ?? 0);
    if (storedEnergy > 0) {
      const before = state.player.ultimateEnergy;
      state.player.ultimateEnergy = Math.min(100, before + storedEnergy);
      state.run.acquiredResources["next-combat-energy"] = 0;
      emitGameEvent(state, {
        type: "ultimate-energy-changed",
        before,
        after: state.player.ultimateEnergy,
        source: "event-next-combat-energy",
      });
    }
  }
  if (!preserveClock) state.accumulatorMs = 0;
}

function prepareNonCombatState(
  state: GameState,
  nodeId: RouteNodeId,
  actIndex: number,
  nodeLabel: string,
  phase: "event" | "forge",
): void {
  state.stage.index = state.run.fullGame?.routeProgress.completedNodeIds.length ?? 0;
  state.stage.levelId = nodeId;
  state.stage.name = `${FULL_GAME_ACT_DEFINITIONS[actIndex]?.name ?? `ACT ${actIndex + 1}`} / ${nodeLabel}`;
  state.stage.phase = phase;
  state.stage.attempt = 1;
  state.stage.encounterId = phase === "event"
    ? (state.run.fullGame?.activeEventDefinitionId ?? "event-unavailable")
    : "forge-allocation-v1";
  state.player.position = vec2(0, 0);
  state.player.facing = vec2(0, -1);
  state.player.hp = 1;
  state.player.dash = null;
  state.player.charge = null;
  state.player.ultimatePlanning = null;
  state.player.ultimateExecution = null;
  state.player.recoveryRemainingMs = 0;
  state.player.killMomentumStacks = 0;
  state.player.bufferedAbility = null;
  state.enemies = [];
  state.projectiles = [];
  state.obstacles = [];
  state.hazards = [];
  state.combat.kills = 0;
  state.combat.totalEnemies = 0;
  state.combat.scheduledSlashes = [];
  state.combat.storedPath = null;
  state.combat.gravityPulls = [];
  state.accumulatorMs = 0;
}

function spawnEncounterWave(
  state: GameState,
  spawns: readonly SpawnDefinition[],
  authoredMoveSpeed: number,
): EntityId[] {
  const node = state.run.fullGame ? currentRouteNode(state.run.fullGame.routeProgress) : null;
  const practiceId = state.run.fullGame?.practiceBossDefinitionId;
  if (!node && !practiceId) throw new Error("Cannot spawn a campaign wave without an encounter owner.");
  const ownerId = node?.id ?? `practice:${practiceId!}`;
  const ids: EntityId[] = [];
  for (const { spawn, position } of resolveSafeEncounterSpawns(state, spawns)) {
    const definition = enemyDefinitions.get(spawn.enemyDefinitionId);
    const id = `${ownerId}:${spawn.id}`;
    if (state.enemies.some((enemy) => enemy.id === id)) throw new Error(`Duplicate campaign enemy id ${id}.`);
    state.enemies.push({
      id,
      definitionId: definition.id,
      position: copyVec2(position),
      facing: copyVec2(spawn.facing ?? vec2(0, -1)),
      radius: definition.radius,
      speed: definition.baseMoveSpeed * Math.max(0.5, authoredMoveSpeed / 2.75),
      alive: true,
      state: "active",
      spawnedAtMs: state.elapsedMs,
      killedAtMs: null,
      armorParts: createArmorPartStates(definition.armorProfileId),
      staggerRemainingMs: 0,
      tactical: createEnemyTacticalState(id, definition.attackProfile),
    });
    ids.push(id);
  }
  state.combat.totalEnemies += ids.length;
  return ids;
}

function spawnEncounterEnvironment(
  state: GameState,
  nodeId: RouteNodeId,
  definition: FullGameEncounterDefinition,
): void {
  for (const obstacle of definition.initialObstacles) {
    const spawned = spawnObstacle(state, {
      id: `${nodeId}:${obstacle.id}`,
      definitionId: obstacle.definitionId,
      position: obstacle.position,
      rotationRadians: obstacle.rotationRadians,
      velocity: obstacle.velocity,
      sourceId: definition.id,
    });
    if (!spawned) throw new Error(`Encounter ${definition.id} could not spawn obstacle ${obstacle.id}.`);
  }
  for (const hazard of definition.initialHazards) {
    const spawned = spawnHazard(state, {
      id: `${nodeId}:${hazard.id}`,
      definitionId: hazard.definitionId,
      position: hazard.position,
      rotationRadians: hazard.rotationRadians,
      sourceId: definition.id,
    });
    if (!spawned) throw new Error(`Encounter ${definition.id} could not spawn hazard ${hazard.id}.`);
  }
}

function resolveChallengeReward(
  state: GameState,
  definition: FullGameEncounterDefinition,
): CampaignChallengeRewardState | null {
  const rule = definition.challenge;
  const runtime = state.run.fullGame?.activeChallenge;
  if (!rule || !runtime) return null;
  if (runtime.definitionId !== rule.id || runtime.status === "active") {
    throw new Error(`Challenge ${rule.id} reached reward resolution before a terminal result.`);
  }
  const before = Math.max(0, state.run.acquiredResources[rule.reward.resourceId] ?? 0);
  const after = runtime.status === "succeeded"
    ? Math.min(rule.reward.maximum, before + rule.reward.amount)
    : before;
  state.run.acquiredResources[rule.reward.resourceId] = after;
  const result = {
    definitionId: rule.id,
    status: runtime.status,
    failureReason: runtime.failureReason,
    rewardResourceId: rule.reward.resourceId,
    rewardAmount: after - before,
    resourceBefore: before,
    resourceAfter: after,
  } as const;
  emitGameEvent(state, {
    type: "challenge-resolved",
    challengeDefinitionId: rule.id,
    status: runtime.status,
    rewardResourceId: rule.reward.resourceId,
    rewardAmount: after - before,
  });
  return result;
}
