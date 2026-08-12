import { ASSIST_PROTOCOL_RULES, type RunProtocolMode } from "../../content/protocols/definitions";
import type { GameState } from "../domain/types";
import type { RunProtocolState } from "./types";

export function createRunProtocolState(
  mode: RunProtocolMode = "standard",
  requestedThreatLevel = 0,
): RunProtocolState {
  const threatLevel = mode === "threat" ? normalizedThreatLevel(requestedThreatLevel) : 0;
  return {
    mode,
    threatLevel,
    assistRebootsRemaining: mode === "assist" ? ASSIST_PROTOCOL_RULES.rebootPerAct : 0,
    leaderboardEligible: mode !== "assist",
  };
}

export function configureRunProtocolState(
  protocol: RunProtocolState,
  mode: RunProtocolMode,
  requestedThreatLevel = 0,
): void {
  Object.assign(protocol, createRunProtocolState(mode, requestedThreatLevel));
}

export function resetAssistRebootForAct(protocol: RunProtocolState): void {
  protocol.assistRebootsRemaining = protocol.mode === "assist" ? ASSIST_PROTOCOL_RULES.rebootPerAct : 0;
}

export function isAssistProtocol(state: GameState): boolean {
  return state.run.fullGame?.protocol.mode === "assist";
}

export function currentThreatLevel(state: GameState): number {
  return state.run.fullGame?.protocol.threatLevel ?? 0;
}

export function telegraphDurationScale(state: GameState): number {
  return isAssistProtocol(state) ? ASSIST_PROTOCOL_RULES.telegraphScale : 1;
}

export function hostileProjectileSpeedScale(state: GameState): number {
  return isAssistProtocol(state) ? ASSIST_PROTOCOL_RULES.projectileSpeedScale : 1;
}

export function hazardActiveDurationScale(state: GameState): number {
  return currentThreatLevel(state) >= 2 ? 1.2 : 1;
}

export function effectiveIntelDepth(state: GameState): number {
  const owned = Math.max(0, Math.min(3, state.run.acquiredResources.intel ?? 0));
  return Math.max(0, owned - (currentThreatLevel(state) >= 4 ? 1 : 0));
}

export function bossThreatVariationEnabled(state: GameState): boolean {
  return currentThreatLevel(state) >= 3;
}

export function redlineOpeningRailEnabled(state: GameState): boolean {
  return currentThreatLevel(state) >= 5;
}

export function normalizedThreatLevel(value: number): 0 | 1 | 2 | 3 | 4 | 5 {
  return Math.max(0, Math.min(5, Math.round(Number.isFinite(value) ? value : 0))) as 0 | 1 | 2 | 3 | 4 | 5;
}
