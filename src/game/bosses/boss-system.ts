import {
  LAST_CONDUCTOR_BOSS_ID,
  MIRROR_REGENT_BOSS_ID,
  RAIL_HOUND_BOSS_ID,
  SIEGE_CHOIR_BOSS_ID,
  bossDefinitionForEncounter,
  type BossDefinition,
} from "../../content/bosses/definitions";
import { enemyDefinitions } from "../../content/enemies/definitions";
import type { DashState, EnemyState, GameState } from "../domain/types";
import {
  advanceLastConductor,
  createLastConductorRuntime,
  recordLastConductorDash,
  resolveLastConductorDashContact,
} from "./last-conductor";
import {
  advanceMirrorRegent,
  createMirrorRegentRuntime,
  recordMirrorRegentDash,
  resolveMirrorRegentDashContact,
} from "./mirror-regent";
import {
  advanceRailHound,
  createRailHoundRuntime,
  resolveRailHoundDashContact,
} from "./rail-hound";
import {
  advanceSiegeChoir,
  createSiegeChoirRuntime,
  resolveSiegeChoirDashContact,
} from "./siege-choir";
import type { BossRuntimeState } from "./types";

export function ensureCampaignBossRuntime(state: GameState, definition: BossDefinition): BossRuntimeState | null {
  const campaign = state.run.fullGame;
  if (!campaign || campaign.phase !== "combat") return null;
  if (campaign.activeBoss?.definitionId === definition.id) return campaign.activeBoss;
  const entity = state.enemies.find((candidate) => (
    candidate.alive && candidate.definitionId === definition.enemyDefinitionId
  ));
  if (!entity) return null;
  const runtime = createRuntime(state, definition, entity);
  campaign.activeBoss = runtime;
  return runtime;
}

export function advanceBossSystem(state: GameState, deltaMs: number): string | null {
  const campaign = state.run.fullGame;
  if (!campaign || campaign.phase !== "combat" || !campaign.activeEncounterTemplateId) return null;
  let runtime = campaign.activeBoss;
  if (!runtime) {
    const definition = safeBossDefinition(campaign.activeEncounterTemplateId);
    if (!definition) return null;
    runtime = ensureCampaignBossRuntime(state, definition);
  }
  if (!runtime || runtime.completed) return null;
  const entity = state.enemies.find((candidate) => candidate.id === runtime!.entityId);
  if (!entity) return null;
  const definition = safeBossDefinition(campaign.activeEncounterTemplateId);
  if (!definition) return null;

  if (runtime.definitionId === RAIL_HOUND_BOSS_ID) return advanceRailHound(state, runtime, entity, deltaMs);
  if (runtime.definitionId === SIEGE_CHOIR_BOSS_ID) {
    advanceSiegeChoir(state, runtime, entity, deltaMs);
    return null;
  }
  if (runtime.definitionId === MIRROR_REGENT_BOSS_ID) return advanceMirrorRegent(state, runtime, entity, deltaMs);
  if (runtime.definitionId === LAST_CONDUCTOR_BOSS_ID) {
    advanceLastConductor(state, runtime, entity, definition, deltaMs);
  }
  return null;
}

/** Returns true when the contact belongs to a Boss mechanic and must not fall
 * through to the generic one-hit enemy resolver. */
export function resolveBossDashContact(
  state: GameState,
  enemy: EnemyState,
  dash: DashState,
  segmentStart: { x: number; z: number },
  segmentEnd: { x: number; z: number },
): boolean {
  if (!isBossControlledEnemy(enemy)) return false;
  const runtime = state.run.fullGame?.activeBoss;
  if (!runtime) return true;
  const definition = state.run.fullGame?.activeEncounterTemplateId
    ? safeBossDefinition(state.run.fullGame.activeEncounterTemplateId)
    : null;
  if (!definition) return true;
  if (runtime.definitionId === RAIL_HOUND_BOSS_ID) {
    return resolveRailHoundDashContact(state, runtime, enemy, dash, segmentStart, segmentEnd);
  }
  if (runtime.definitionId === SIEGE_CHOIR_BOSS_ID) {
    return resolveSiegeChoirDashContact(state, runtime, enemy, dash, segmentStart, segmentEnd);
  }
  if (runtime.definitionId === MIRROR_REGENT_BOSS_ID) {
    return resolveMirrorRegentDashContact(state, runtime, enemy, dash);
  }
  if (runtime.definitionId === LAST_CONDUCTOR_BOSS_ID) {
    return resolveLastConductorDashContact(
      state,
      runtime,
      enemy,
      dash,
      segmentStart,
      segmentEnd,
      definition,
    );
  }
  return true;
}

export function recordBossCompletedDash(state: GameState, dash: DashState): void {
  const campaign = state.run.fullGame;
  const runtime = campaign?.activeBoss;
  if (!campaign || !runtime || runtime.completed || !campaign.activeEncounterTemplateId) return;
  const entity = state.enemies.find((candidate) => candidate.id === runtime.entityId);
  if (!entity) return;
  const definition = safeBossDefinition(campaign.activeEncounterTemplateId);
  if (!definition) return;
  if (runtime.definitionId === MIRROR_REGENT_BOSS_ID) recordMirrorRegentDash(state, runtime, dash);
  else if (runtime.definitionId === LAST_CONDUCTOR_BOSS_ID) {
    recordLastConductorDash(state, runtime, entity, dash, definition);
  }
}

export function isBossControlledEnemy(enemy: EnemyState): boolean {
  return enemyDefinitions.get(enemy.definitionId).tags.includes("boss");
}

function createRuntime(
  state: GameState,
  definition: BossDefinition,
  entity: EnemyState,
): BossRuntimeState {
  if (definition.id === RAIL_HOUND_BOSS_ID) return createRailHoundRuntime(state, definition, entity);
  if (definition.id === SIEGE_CHOIR_BOSS_ID) return createSiegeChoirRuntime(state, definition, entity);
  if (definition.id === MIRROR_REGENT_BOSS_ID) return createMirrorRegentRuntime(state, definition, entity);
  if (definition.id === LAST_CONDUCTOR_BOSS_ID) return createLastConductorRuntime(state, definition, entity);
  throw new Error(`Unsupported Boss Definition: ${definition.id}`);
}

function safeBossDefinition(encounterId: string): BossDefinition | null {
  try {
    return bossDefinitionForEncounter(encounterId);
  } catch {
    return null;
  }
}
