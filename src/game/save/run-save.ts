import { eventDefinitions } from "../../content/events/definitions";
import { FULL_GAME_SKILL_DEFINITIONS } from "../../content/upgrades/skill-tree";
import type { UpgradeId } from "../../core/ids";
import type { GameState } from "../domain/types";
import { validateRunRoute } from "../run/route-generator";
import { stableHash } from "../serialization/stable";
import { MAXIMUM_SKILL_POINTS, FORGE_MOVE_LIMIT } from "../upgrades/skill-system";
import type { RunProtocolMode } from "../../content/protocols/definitions";
import { ASSIST_PROTOCOL_RULES } from "../../content/protocols/definitions";

export const RUN_SAVE_SCHEMA_VERSION = 2 as const;
export const RUN_SAVE_CONTENT_VERSION = "full-game-v1" as const;
export const RUN_SAVE_STORAGE_KEY = "project-slash:run-save:v2" as const;
export const RUN_SAVE_LEGACY_STORAGE_KEYS = ["project-slash:run-save:v1"] as const;

export type RunSaveFailureCode =
  | "unsafe-phase"
  | "invalid-json"
  | "invalid-envelope"
  | "unsupported-schema"
  | "unsupported-content"
  | "checksum-mismatch"
  | "invalid-state";

export class RunSaveError extends Error {
  readonly code: RunSaveFailureCode;

  constructor(code: RunSaveFailureCode, message: string) {
    super(message);
    this.name = "RunSaveError";
    this.code = code;
  }
}

export interface RunSaveEnvelope {
  readonly schemaVersion: typeof RUN_SAVE_SCHEMA_VERSION;
  readonly contentVersion: typeof RUN_SAVE_CONTENT_VERSION;
  readonly state: GameState;
  readonly checksum: string;
}

export interface RunSaveSummary {
  readonly seed: number;
  readonly phase: string;
  readonly actNumber: number;
  readonly layerNumber: number;
  readonly completedNodeCount: number;
  readonly committedSkillCount: number;
  readonly protocolMode: RunProtocolMode;
  readonly threatLevel: number;
}

const SAFE_CAMPAIGN_PHASES = new Set(["title", "planning", "event", "forge", "reward", "victory"]);
const SAFE_STAGE_PHASES = new Set(["title", "planning", "event", "forge", "reward", "victory"]);
const skillDefinitionById = new Map(FULL_GAME_SKILL_DEFINITIONS.map((definition) => [definition.id, definition]));

export function isRunSaveSafe(state: GameState): boolean {
  const campaign = state.run.fullGame;
  return Boolean(
    campaign &&
    SAFE_CAMPAIGN_PHASES.has(campaign.phase) &&
    SAFE_STAGE_PHASES.has(state.stage.phase) &&
    campaign.encounterRuntime === null &&
    campaign.activeEncounterTemplateId === null &&
    campaign.activeBoss === null &&
    campaign.practiceBossDefinitionId === null &&
    state.player.dash === null &&
    state.player.charge === null &&
    state.player.ultimatePlanning === null &&
    state.player.ultimateExecution === null
  );
}

export function createRunSave(state: GameState): string {
  if (!isRunSaveSafe(state)) {
    throw new RunSaveError(
      "unsafe-phase",
      `当前阶段 ${state.run.fullGame?.phase ?? "legacy"}/${state.stage.phase} 不允许保存；只保存安全节点，不保存战斗中间状态。`,
    );
  }
  const safeState = normalizedSafeState(state);
  validateSavedState(safeState);
  const body = {
    schemaVersion: RUN_SAVE_SCHEMA_VERSION,
    contentVersion: RUN_SAVE_CONTENT_VERSION,
    state: safeState,
  } as const;
  const envelope: RunSaveEnvelope = { ...body, checksum: stableHash(body) };
  return JSON.stringify(envelope);
}

export function restoreRunSave(serialized: string): GameState {
  const envelope = parseEnvelope(serialized);
  if (envelope.schemaVersion !== RUN_SAVE_SCHEMA_VERSION) {
    throw new RunSaveError(
      "unsupported-schema",
      `存档结构版本 ${String(envelope.schemaVersion)} 不受支持；原始存档已保留。`,
    );
  }
  if (envelope.contentVersion !== RUN_SAVE_CONTENT_VERSION) {
    throw new RunSaveError(
      "unsupported-content",
      `存档内容版本 ${String(envelope.contentVersion)} 与当前 ${RUN_SAVE_CONTENT_VERSION} 不兼容；原始存档已保留。`,
    );
  }
  const body = {
    schemaVersion: envelope.schemaVersion,
    contentVersion: envelope.contentVersion,
    state: envelope.state,
  };
  if (typeof envelope.checksum !== "string" || stableHash(body) !== envelope.checksum) {
    throw new RunSaveError("checksum-mismatch", "存档校验失败，数据可能不完整；原始存档已保留。");
  }
  validateSavedState(envelope.state);
  return structuredClone(envelope.state);
}

export function inspectRunSave(serialized: string): RunSaveSummary {
  const state = restoreRunSave(serialized);
  const campaign = state.run.fullGame;
  if (!campaign) throw new RunSaveError("invalid-state", "存档缺少完整游戏进度。");
  return {
    seed: state.run.seed,
    phase: campaign.phase,
    actNumber: campaign.routeProgress.actIndex + 1,
    layerNumber: campaign.routeProgress.layerIndex + 1,
    completedNodeCount: campaign.routeProgress.completedNodeIds.length,
    committedSkillCount: campaign.skills.committedSkillIds.length,
    protocolMode: campaign.protocol.mode,
    threatLevel: campaign.protocol.threatLevel,
  };
}

function normalizedSafeState(state: GameState): GameState {
  const clone = structuredClone(state);
  clone.accumulatorMs = 0;
  clone.lastEvents = [];
  clone.player.dash = null;
  clone.player.charge = null;
  clone.player.ultimatePlanning = null;
  clone.player.ultimateExecution = null;
  clone.player.recoveryRemainingMs = 0;
  clone.player.bufferedAbility = null;
  clone.player.killMomentumStacks = 0;
  clone.enemies = [];
  clone.projectiles = [];
  clone.obstacles = [];
  clone.hazards = [];
  clone.combat.kills = 0;
  clone.combat.totalEnemies = 0;
  clone.combat.scheduledSlashes = [];
  clone.combat.storedPath = null;
  clone.combat.gravityPulls = [];
  if (clone.run.fullGame) {
    clone.run.fullGame.activeTriggerIds = [];
    clone.run.fullGame.activeBoss = null;
    clone.run.fullGame.practiceBossDefinitionId = null;
  }
  return clone;
}

function parseEnvelope(serialized: string): Record<string, unknown> & Partial<RunSaveEnvelope> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new RunSaveError("invalid-json", "存档不是有效 JSON；原始数据已保留。");
  }
  if (!isRecord(parsed)) {
    throw new RunSaveError("invalid-envelope", "存档外层结构无效；原始数据已保留。");
  }
  return parsed as Record<string, unknown> & Partial<RunSaveEnvelope>;
}

function validateSavedState(state: unknown): asserts state is GameState {
  if (
    !isRecord(state) ||
    state.version !== 2 ||
    !isRecord(state.run) ||
    !isRecord(state.stage) ||
    !isRecord(state.player) ||
    !isRecord(state.combat) ||
    !Array.isArray(state.enemies) ||
    !Array.isArray(state.projectiles) ||
    !Array.isArray(state.obstacles) ||
    !Array.isArray(state.hazards) ||
    !Array.isArray(state.lastEvents) ||
    !isRecord(state.run.fullGame) ||
    !Array.isArray(state.run.selectedUpgrades) ||
    !isRecord(state.run.acquiredResources)
  ) {
    throw invalidState("缺少 GameState v2 核心字段");
  }
  const candidate = state as unknown as GameState;
  const campaign = candidate.run.fullGame;
  if (!campaign || campaign.contentVersion !== RUN_SAVE_CONTENT_VERSION) {
    throw invalidState("缺少 full-game-v1 Campaign State");
  }
  validateProtocol(campaign.protocol);
  validateRunMetrics(campaign.runMetrics);
  if (!isRunSaveSafe(candidate)) throw invalidState("存档不处于允许恢复的安全阶段");
  if (candidate.enemies.length > 0 || candidate.projectiles.length > 0 || candidate.obstacles.length > 0 || candidate.hazards.length > 0) {
    throw invalidState("安全存档包含战斗实体");
  }
  if (!phasePairIsValid(campaign.phase, candidate.stage.phase)) {
    throw invalidState(`Campaign / Stage 阶段不一致：${campaign.phase}/${candidate.stage.phase}`);
  }
  try {
    validateRunRoute(campaign.routeProgress.route);
  } catch (error) {
    throw invalidState(`路线图无效：${error instanceof Error ? error.message : String(error)}`);
  }
  const allNodeIds = new Set(campaign.routeProgress.route.acts.flatMap((act) => (
    act.layers.flatMap((layer) => layer.map((node) => node.id))
  )));
  if (campaign.routeProgress.route.seed !== candidate.run.seed) throw invalidState("Run Seed 与路线 Seed 不一致");
  const progressNodeIds = [
    ...campaign.routeProgress.completedNodeIds,
    ...campaign.routeProgress.availableNodeIds,
    ...(campaign.routeProgress.currentNodeId ? [campaign.routeProgress.currentNodeId] : []),
    ...(campaign.provisionalRouteNodeId ? [campaign.provisionalRouteNodeId] : []),
  ];
  if (progressNodeIds.some((id) => !allNodeIds.has(id))) throw invalidState("路线进度引用未知节点");
  if (new Set(campaign.routeProgress.completedNodeIds).size !== campaign.routeProgress.completedNodeIds.length) {
    throw invalidState("已完成路线节点重复");
  }
  validateSkillState(campaign.skills);
  validateCampaignSafePhase(candidate);
  if (!sameIdSet(candidate.run.selectedUpgrades, campaign.skills.committedSkillIds)) {
    throw invalidState("Run Upgrade 与已提交技能不一致");
  }
  for (const [resourceId, amount] of Object.entries(candidate.run.acquiredResources)) {
    if (!resourceId || !Number.isFinite(amount) || amount < 0) throw invalidState(`Run Resource 无效：${resourceId}`);
  }
  if (!Array.isArray(campaign.eventHistory)) throw invalidState("Event History 结构无效");
  for (const history of campaign.eventHistory) {
    if (!isRecord(history) || typeof history.nodeId !== "string" || typeof history.eventDefinitionId !== "string" || typeof history.choiceId !== "string") {
      throw invalidState("Event History 条目结构无效");
    }
    if (!allNodeIds.has(history.nodeId)) throw invalidState("Event History 引用未知节点");
    const definition = eventDefinitions.list().find((event) => event.id === history.eventDefinitionId);
    if (!definition?.choices.some((choice) => choice.id === history.choiceId)) {
      throw invalidState("Event History 引用未知事件或选择");
    }
  }
}

function validateRunMetrics(metrics: unknown): void {
  if (!isRecord(metrics)) throw invalidState("缺少 Run 统计");
  for (const key of ["startedAtMs", "kills", "armorBreaks", "projectileCuts", "bossBreaks", "lastProcessedEventSequence"] as const) {
    const value = metrics[key];
    if (!Number.isFinite(value) || Number(value) < 0) throw invalidState(`Run 统计 ${key} 无效`);
  }
  if (metrics.deathSourceId !== null && typeof metrics.deathSourceId !== "string") {
    throw invalidState("死亡来源无效");
  }
  if (metrics.deathSourceLabel !== null && typeof metrics.deathSourceLabel !== "string") {
    throw invalidState("死亡来源标签无效");
  }
}

function validateProtocol(protocol: unknown): void {
  if (!isRecord(protocol)) throw invalidState("缺少 Run Protocol");
  const mode = protocol.mode;
  const threatLevel = protocol.threatLevel;
  const reboots = protocol.assistRebootsRemaining;
  if (mode !== "standard" && mode !== "assist" && mode !== "threat") throw invalidState("Run Protocol Mode 无效");
  if (!Number.isInteger(threatLevel) || Number(threatLevel) < 0 || Number(threatLevel) > 5) throw invalidState("Threat Level 无效");
  if ((mode === "threat") !== (Number(threatLevel) > 0)) throw invalidState("Threat Mode 与等级不一致");
  if (!Number.isInteger(reboots) || Number(reboots) < 0 || Number(reboots) > ASSIST_PROTOCOL_RULES.rebootPerAct) {
    throw invalidState("Assist Reboot 计数无效");
  }
  if (mode !== "assist" && Number(reboots) !== 0) throw invalidState("非 Assist Run 包含 Reboot");
  if (typeof protocol.leaderboardEligible !== "boolean" || protocol.leaderboardEligible !== (mode !== "assist")) {
    throw invalidState("排行榜资格与 Protocol 不一致");
  }
}

function validateCampaignSafePhase(state: GameState): void {
  const campaign = state.run.fullGame;
  if (!campaign) throw invalidState("缺少 Campaign State");
  const expectedVisitMode = campaign.phase === "planning"
    ? "planning"
    : campaign.phase === "forge"
      ? "forge"
      : "closed";
  if (campaign.skills.visitMode !== expectedVisitMode) {
    throw invalidState(`技能访问模式与阶段不一致：${campaign.skills.visitMode}/${campaign.phase}`);
  }
  if (!Number.isInteger(campaign.forgeTokensSpentThisVisit) || campaign.forgeTokensSpentThisVisit < 0 || campaign.forgeTokensSpentThisVisit > 2) {
    throw invalidState("Forge Token 使用计数无效");
  }
  if (campaign.skills.forgeMoveLimit !== FORGE_MOVE_LIMIT + campaign.forgeTokensSpentThisVisit) {
    throw invalidState("Forge Move Limit 与已消费 Token 不一致");
  }
  if (!("activeChallenge" in campaign) || campaign.activeChallenge !== null) {
    throw invalidState("安全存档包含进行中的 Challenge");
  }
  if (campaign.phase === "planning" || campaign.phase === "title") {
    if (campaign.routeProgress.phase !== "route-map" || campaign.routeProgress.currentNodeId !== null) {
      throw invalidState("Planning / Title 路线进度不是 Route Map");
    }
  }
  if (campaign.phase === "event" || campaign.phase === "forge") {
    if (campaign.routeProgress.phase !== "encounter" || campaign.routeProgress.currentNodeId === null) {
      throw invalidState("Event / Forge 缺少当前路线节点");
    }
  }
  if (campaign.phase === "event" && !campaign.activeEventDefinitionId) {
    throw invalidState("Event 阶段缺少事件定义");
  }
  if (campaign.phase !== "event" && campaign.activeEventDefinitionId !== null) {
    throw invalidState("非 Event 阶段残留事件定义");
  }
  if (campaign.phase === "reward" && campaign.pendingReward === null) {
    throw invalidState("Reward 阶段缺少结算数据");
  }
  if (campaign.pendingReward !== null) {
    const challenge = campaign.pendingReward.challenge;
    if (challenge !== null && (
      !isRecord(challenge) ||
      typeof challenge.definitionId !== "string" ||
      (challenge.status !== "succeeded" && challenge.status !== "failed") ||
      typeof challenge.rewardResourceId !== "string" ||
      !Number.isFinite(challenge.rewardAmount) ||
      !Number.isFinite(challenge.resourceBefore) ||
      !Number.isFinite(challenge.resourceAfter)
    )) {
      throw invalidState("Challenge Reward 结构无效");
    }
  }
  if (campaign.phase === "victory" && campaign.routeProgress.phase !== "victory") {
    throw invalidState("Victory 阶段路线尚未完成");
  }
}

function validateSkillState(skills: unknown): void {
  if (
    !isRecord(skills) ||
    !Array.isArray(skills.committedSkillIds) ||
    !Array.isArray(skills.draftAddedSkillIds) ||
    !Array.isArray(skills.draftRemovedSkillIds) ||
    !skills.committedSkillIds.every((id) => typeof id === "string") ||
    !skills.draftAddedSkillIds.every((id) => typeof id === "string") ||
    !skills.draftRemovedSkillIds.every((id) => typeof id === "string")
  ) {
    throw invalidState("技能分配结构无效");
  }
  const typedSkills = skills as unknown as NonNullable<GameState["run"]["fullGame"]>["skills"];
  if (!Number.isInteger(typedSkills.totalEarnedPoints) || typedSkills.totalEarnedPoints < 0 || typedSkills.totalEarnedPoints > MAXIMUM_SKILL_POINTS) {
    throw invalidState("技能点总数超出范围");
  }
  if (!Number.isInteger(typedSkills.forgeMoveLimit) || typedSkills.forgeMoveLimit < FORGE_MOVE_LIMIT || typedSkills.forgeMoveLimit > FORGE_MOVE_LIMIT + 2) {
    throw invalidState("Forge Move Limit 无效");
  }
  const groups = [typedSkills.committedSkillIds, typedSkills.draftAddedSkillIds, typedSkills.draftRemovedSkillIds];
  for (const group of groups) {
    if (new Set(group).size !== group.length || group.some((id) => !skillDefinitionById.has(id))) {
      throw invalidState("技能分配包含重复或未知节点");
    }
  }
  if (typedSkills.draftAddedSkillIds.some((id) => typedSkills.committedSkillIds.includes(id))) {
    throw invalidState("技能同时处于 Committed 与 Draft Added");
  }
  if (typedSkills.draftRemovedSkillIds.some((id) => !typedSkills.committedSkillIds.includes(id))) {
    throw invalidState("Draft Removed 不属于 Committed");
  }
  if (typedSkills.draftRemovedSkillIds.length > typedSkills.forgeMoveLimit) throw invalidState("Forge 草案超过 Move Limit");
  const effective = new Set<UpgradeId>(typedSkills.committedSkillIds);
  for (const id of typedSkills.draftRemovedSkillIds) effective.delete(id);
  for (const id of typedSkills.draftAddedSkillIds) effective.add(id);
  if (effective.size > typedSkills.totalEarnedPoints) throw invalidState("技能分配超过已获得点数");
  for (const id of effective) {
    const definition = skillDefinitionById.get(id);
    if (!definition || definition.prerequisites.some((prerequisite) => !effective.has(prerequisite))) {
      throw invalidState(`技能前置不完整：${id}`);
    }
  }
}

function phasePairIsValid(campaignPhase: string, stagePhase: string): boolean {
  return campaignPhase === stagePhase ||
    (campaignPhase === "victory" && stagePhase === "victory");
}

function sameIdSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id) => right.includes(id));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function invalidState(detail: string): RunSaveError {
  return new RunSaveError("invalid-state", `存档状态无效：${detail}；原始数据已保留。`);
}
