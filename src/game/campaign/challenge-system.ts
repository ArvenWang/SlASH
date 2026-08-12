import { CHARGED_DASH_ABILITY_ID, VECTOR_FOCUS_ABILITY_ID } from "../../content/abilities/definitions";
import type { ChallengeRuleDefinition, FullGameEncounterDefinition } from "../../content/encounters/types";
import type { GameState } from "../domain/types";
import type { CampaignChallengeRuntimeState } from "./types";

export function createCampaignChallengeRuntime(
  definition: FullGameEncounterDefinition,
  state: GameState,
): CampaignChallengeRuntimeState | null {
  if (!definition.challenge) return null;
  return {
    definitionId: definition.challenge.id,
    status: "active",
    startedAtMs: state.elapsedMs,
    elapsedMs: 0,
    projectileCuts: 0,
    obstacleImpacts: 0,
    currentChargedArmorBreaks: 0,
    maximumChargedArmorBreaks: 0,
    ultimateExecuted: false,
    lastProcessedEventSequence: state.eventSequence,
    failureReason: null,
  };
}

export function advanceCampaignChallengeRuntime(
  state: GameState,
  definition: FullGameEncounterDefinition,
): void {
  const runtime = state.run.fullGame?.activeChallenge;
  const rule = definition.challenge;
  if (!runtime || !rule || runtime.definitionId !== rule.id) return;

  runtime.elapsedMs = Math.max(0, state.elapsedMs - runtime.startedAtMs);
  const events = state.lastEvents.filter((event) => event.sequence > runtime.lastProcessedEventSequence);
  for (const event of events) {
    if (event.type === "projectile-destroyed") {
      const hostileSource = state.enemies.some((enemy) => enemy.id === event.sourceId);
      if (hostileSource) runtime.projectileCuts += 1;
    } else if (event.type === "dash-obstacle-impact") {
      runtime.obstacleImpacts += 1;
    } else if (event.type === "armor-broken" && event.attackId === CHARGED_DASH_ABILITY_ID) {
      runtime.currentChargedArmorBreaks += 1;
      runtime.maximumChargedArmorBreaks = Math.max(
        runtime.maximumChargedArmorBreaks,
        runtime.currentChargedArmorBreaks,
      );
    } else if (event.type === "dash-ended" && event.abilityId === CHARGED_DASH_ABILITY_ID) {
      runtime.maximumChargedArmorBreaks = Math.max(
        runtime.maximumChargedArmorBreaks,
        runtime.currentChargedArmorBreaks,
      );
      runtime.currentChargedArmorBreaks = 0;
    } else if (event.type === "ultimate-segment-started" && event.abilityId === VECTOR_FOCUS_ABILITY_ID) {
      runtime.ultimateExecuted = true;
    }
    runtime.lastProcessedEventSequence = Math.max(runtime.lastProcessedEventSequence, event.sequence);
  }

  if (runtime.status === "active") applyImmediateFailure(runtime, rule);
  if (runtime.status === "active" && state.run.fullGame?.encounterRuntime?.completed === true) {
    if (challengeTargetMet(runtime, rule)) {
      runtime.status = "succeeded";
    } else {
      runtime.status = "failed";
      runtime.failureReason = failureReason(runtime, rule);
    }
  }
}

export function challengeProgressLabel(
  runtime: CampaignChallengeRuntimeState,
  rule: ChallengeRuleDefinition,
): string {
  if (runtime.status === "succeeded") return "完成";
  if (runtime.status === "failed") return "失败";
  if (rule.kind === "clean-line") {
    const remaining = Math.max(0, (rule.timeLimitMs ?? 0) - runtime.elapsedMs);
    return `${(remaining / 1000).toFixed(1)}秒 · 撞击 ${runtime.obstacleImpacts}`;
  }
  if (rule.kind === "projectile-cuts") return `切弹 ${runtime.projectileCuts} / ${rule.target}`;
  if (rule.kind === "charged-multi-break") {
    return `破甲 ${Math.max(runtime.maximumChargedArmorBreaks, runtime.currentChargedArmorBreaks)} / ${rule.target}`;
  }
  return runtime.ultimateExecuted ? "已使用大招" : "未使用大招";
}

function applyImmediateFailure(
  runtime: CampaignChallengeRuntimeState,
  rule: ChallengeRuleDefinition,
): void {
  if (rule.kind === "clean-line" && runtime.obstacleImpacts > 0) {
    runtime.status = "failed";
    runtime.failureReason = "OBSTACLE IMPACT";
  } else if (rule.kind === "clean-line" && rule.timeLimitMs !== null && runtime.elapsedMs > rule.timeLimitMs) {
    runtime.status = "failed";
    runtime.failureReason = "TIME LIMIT";
  } else if (rule.kind === "no-ultimate" && runtime.ultimateExecuted) {
    runtime.status = "failed";
    runtime.failureReason = "ULTIMATE EXECUTED";
  }
}

function challengeTargetMet(
  runtime: CampaignChallengeRuntimeState,
  rule: ChallengeRuleDefinition,
): boolean {
  if (rule.kind === "clean-line") {
    return runtime.obstacleImpacts === 0 && (rule.timeLimitMs === null || runtime.elapsedMs <= rule.timeLimitMs);
  }
  if (rule.kind === "projectile-cuts") return runtime.projectileCuts >= rule.target;
  if (rule.kind === "charged-multi-break") {
    return Math.max(runtime.maximumChargedArmorBreaks, runtime.currentChargedArmorBreaks) >= rule.target;
  }
  return !runtime.ultimateExecuted;
}

function failureReason(
  runtime: CampaignChallengeRuntimeState,
  rule: ChallengeRuleDefinition,
): string {
  if (rule.kind === "projectile-cuts") return `${runtime.projectileCuts}/${rule.target} PROJECTILES`;
  if (rule.kind === "charged-multi-break") {
    return `${Math.max(runtime.maximumChargedArmorBreaks, runtime.currentChargedArmorBreaks)}/${rule.target} ARMOR`;
  }
  if (rule.kind === "no-ultimate") return "ULTIMATE EXECUTED";
  return runtime.obstacleImpacts > 0 ? "OBSTACLE IMPACT" : "TIME LIMIT";
}
