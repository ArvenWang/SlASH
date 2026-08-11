import type { EntityId, RouteNodeId } from "../../core/ids";
import { copyVec2, vec2 } from "../../core/math/vec2";
import { createSeededRandom } from "../../core/random/seeded-random";
import {
  encounterForRouteNode,
  fullGameEncounterDefinitions,
} from "../../content/encounters/definitions";
import { enemyDefinitions } from "../../content/enemies/definitions";
import { FULL_GAME_ACT_DEFINITIONS } from "../../content/runs/definitions";
import type { GameState } from "../domain/types";
import {
  createEncounterRuntime,
  recordWaveSpawnedEntities,
  updateEncounterScheduler,
} from "../encounters/encounter-system";
import { emitGameEvent } from "../events/event-buffer";
import {
  availableRouteNodes,
  completeCurrentRouteNode,
  createFullGameRunProgress,
  currentRouteNode,
  routeNodeById,
  selectRouteNode,
} from "../run/run-system";
import {
  commitSkillDraft,
  createSkillAllocationState,
  grantSkillPoints,
  openSkillAllocationVisit,
  previewSkillPurchase,
  previewSkillRefund,
} from "../upgrades/skill-system";
import type { FullGameCampaignState } from "./types";

export type CampaignCommandResult =
  | "run-started"
  | "route-previewed"
  | "skill-drafted"
  | "skill-refunded"
  | "draft-discarded"
  | "planning-confirmed"
  | "reward-acknowledged"
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
    activeTriggerIds: [],
    pendingReward: null,
    eliteSkillPointRewardsGranted: 0,
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
  state.player.recoveryRemainingMs = 0;
  state.player.bufferedAbility = null;
  state.enemies = [];
  state.projectiles = [];
  state.obstacles = [];
  state.hazards = [];
  state.combat.kills = 0;
  state.combat.totalEnemies = 0;
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
  if (!campaign || campaign.phase !== "planning") return "ignored";
  return previewSkillPurchase(campaign.skills, skillId).ok ? "skill-drafted" : "ignored";
}

export function previewCampaignSkillRefund(state: GameState, skillId: string): CampaignCommandResult {
  const campaign = state.run.fullGame;
  if (!campaign || campaign.phase !== "planning") return "ignored";
  return previewSkillRefund(campaign.skills, skillId).ok ? "skill-refunded" : "ignored";
}

export function discardCampaignSkillDraft(state: GameState): CampaignCommandResult {
  const campaign = state.run.fullGame;
  if (!campaign || campaign.phase !== "planning") return "ignored";
  campaign.skills.draftAddedSkillIds = [];
  campaign.skills.draftRemovedSkillIds = [];
  return "draft-discarded";
}

export function confirmCampaignPlanning(state: GameState): CampaignCommandResult {
  const campaign = state.run.fullGame;
  const provisionalId = campaign?.provisionalRouteNodeId;
  if (!campaign || campaign.phase !== "planning" || !provisionalId) return "ignored";
  const node = routeNodeById(campaign.routeProgress.route, provisionalId);
  const encounter = encounterForRouteNode(node);
  if (!encounter) return "ignored";

  // Build and route are committed as one transaction. Any failed validation
  // leaves the live campaign untouched.
  const stagedSkills = structuredClone(campaign.skills);
  const stagedRoute = structuredClone(campaign.routeProgress);
  if (!commitSkillDraft(stagedSkills).ok) return "ignored";
  if (selectRouteNode(stagedRoute, provisionalId) !== "selected") return "ignored";

  campaign.skills = stagedSkills;
  campaign.routeProgress = stagedRoute;
  campaign.provisionalRouteNodeId = null;
  campaign.phase = "combat";
  campaign.activeEncounterTemplateId = encounter.id;
  campaign.encounterRuntime = createEncounterRuntime(encounter, state.tick, state.elapsedMs);
  campaign.activeTriggerIds = [];
  campaign.pendingReward = null;
  state.run.selectedUpgrades = [...campaign.skills.committedSkillIds];
  prepareEncounterState(state, node.id, encounter.id, node.actIndex, node.kind.toUpperCase(), false);
  emitGameEvent(state, { type: "route-node-started", nodeId: node.id, encounterId: encounter.id });
  // Immediate waves begin their warning at the exact planning-confirm tick,
  // rather than one simulation tick later.
  advanceCampaignEncounterScheduler(state);
  return "planning-confirmed";
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
}

export function campaignEncounterCanComplete(state: GameState): boolean {
  const campaign = state.run.fullGame;
  return campaign !== null &&
    campaign.phase === "combat" &&
    campaign.encounterRuntime?.completed === true;
}

export function completeCampaignEncounter(state: GameState): boolean {
  const campaign = state.run.fullGame;
  if (!campaign || !campaignEncounterCanComplete(state)) return false;
  const node = currentRouteNode(campaign.routeProgress);
  if (!node) return false;

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
  };
  campaign.encounterRuntime = null;
  campaign.activeEncounterTemplateId = null;
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
  if (!campaign || !node || (campaign.phase !== "defeat" && state.stage.phase !== "dead")) return "ignored";
  const encounter = encounterForRouteNode(node);
  if (!encounter) return "ignored";
  const nextAttempt = state.stage.attempt + 1;
  campaign.phase = "combat";
  campaign.activeEncounterTemplateId = encounter.id;
  campaign.encounterRuntime = createEncounterRuntime(encounter, state.tick, state.elapsedMs);
  campaign.activeTriggerIds = [];
  prepareEncounterState(state, node.id, encounter.id, node.actIndex, node.kind.toUpperCase(), true);
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
  state.player.recoveryRemainingMs = 0;
  state.player.bufferedAbility = null;
  state.enemies = [];
  state.projectiles = [];
  state.obstacles = [];
  state.hazards = [];
  state.combat.kills = 0;
  state.combat.totalEnemies = 0;
  if (!preserveClock) state.accumulatorMs = 0;
}

function spawnEncounterWave(
  state: GameState,
  spawns: readonly {
    readonly id: string;
    readonly enemyDefinitionId: string;
    readonly position: { readonly x: number; readonly z: number };
    readonly facing?: { readonly x: number; readonly z: number };
  }[],
  authoredMoveSpeed: number,
): EntityId[] {
  const node = state.run.fullGame ? currentRouteNode(state.run.fullGame.routeProgress) : null;
  if (!node) throw new Error("Cannot spawn a campaign wave without a current route node.");
  const ids: EntityId[] = [];
  for (const spawn of spawns) {
    const definition = enemyDefinitions.get(spawn.enemyDefinitionId);
    const id = `${node.id}:${spawn.id}`;
    if (state.enemies.some((enemy) => enemy.id === id)) throw new Error(`Duplicate campaign enemy id ${id}.`);
    state.enemies.push({
      id,
      definitionId: definition.id,
      position: copyVec2(spawn.position),
      facing: copyVec2(spawn.facing ?? vec2(0, -1)),
      radius: definition.radius,
      speed: authoredMoveSpeed,
      alive: true,
      state: "active",
      spawnedAtMs: state.elapsedMs,
      killedAtMs: null,
    });
    ids.push(id);
  }
  state.combat.totalEnemies += ids.length;
  return ids;
}
