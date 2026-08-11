import type { UpgradeId } from "../../core/ids";
import {
  FULL_GAME_SKILL_DEFINITIONS,
  fullGameSkillById,
} from "../../content/upgrades/skill-tree";
import type { SkillDefinition } from "../../content/upgrades/types";
import type {
  SkillAllocationCommandResult,
  SkillAllocationSnapshot,
  SkillAllocationState,
  SkillAllocationVisitMode,
  SkillNodeAllocationView,
} from "./types";

export const STARTING_SKILL_POINTS = 2;
export const MAXIMUM_SKILL_POINTS = 12;
export const FORGE_MOVE_LIMIT = 2;

const definitionById = new Map(FULL_GAME_SKILL_DEFINITIONS.map((definition) => [definition.id, definition]));
const definitionOrder = new Map(FULL_GAME_SKILL_DEFINITIONS.map((definition, index) => [definition.id, index]));

assertSkillTreeDefinitions();

export function createSkillAllocationState(
  startingPoints = STARTING_SKILL_POINTS,
): SkillAllocationState {
  return {
    totalEarnedPoints: normalizePointTotal(startingPoints),
    committedSkillIds: [],
    draftAddedSkillIds: [],
    draftRemovedSkillIds: [],
    visitMode: "closed",
    forgeMoveLimit: FORGE_MOVE_LIMIT,
  };
}

export function openSkillAllocationVisit(
  state: SkillAllocationState,
  mode: Exclude<SkillAllocationVisitMode, "closed">,
): void {
  state.visitMode = mode;
  state.draftAddedSkillIds = [];
  state.draftRemovedSkillIds = [];
}

export function closeSkillAllocationVisit(state: SkillAllocationState): void {
  state.visitMode = "closed";
  state.draftAddedSkillIds = [];
  state.draftRemovedSkillIds = [];
}

export function grantSkillPoints(state: SkillAllocationState, requestedPoints: number): number {
  const safeRequested = Math.max(0, Math.floor(Number.isFinite(requestedPoints) ? requestedPoints : 0));
  const before = state.totalEarnedPoints;
  state.totalEarnedPoints = Math.min(MAXIMUM_SKILL_POINTS, before + safeRequested);
  return state.totalEarnedPoints - before;
}

export function previewSkillPurchase(
  state: SkillAllocationState,
  skillId: UpgradeId,
): SkillAllocationCommandResult {
  if (state.visitMode === "closed") return failure("allocation-closed");
  const definition = definitionById.get(skillId);
  if (!definition) return failure("unknown-skill");

  const effective = effectiveSkillIdSet(state);
  if (effective.has(skillId)) return failure("already-owned");
  const missing = definition.prerequisites.filter((id) => !effective.has(id));
  if (missing.length > 0) return failure("missing-prerequisite");
  if (unspentSkillPoints(state) < definition.cost) return failure("insufficient-points");

  const removedIndex = state.draftRemovedSkillIds.indexOf(skillId);
  if (removedIndex >= 0) {
    state.draftRemovedSkillIds.splice(removedIndex, 1);
  } else {
    state.draftAddedSkillIds.push(skillId);
  }
  return success([skillId]);
}

export function previewSkillRefund(
  state: SkillAllocationState,
  skillId: UpgradeId,
): SkillAllocationCommandResult {
  if (state.visitMode === "closed") return failure("allocation-closed");
  if (!definitionById.has(skillId)) return failure("unknown-skill");
  const effective = effectiveSkillIdSet(state);
  if (!effective.has(skillId)) return failure("not-owned");

  const cascade = invalidatedSkillsAfterRemoval(effective, skillId);
  const committedToRemove = cascade.filter((id) => (
    state.committedSkillIds.includes(id) && !state.draftRemovedSkillIds.includes(id)
  ));
  if (committedToRemove.length > 0 && state.visitMode !== "forge") {
    return failure("committed-locked");
  }
  if (state.draftRemovedSkillIds.length + committedToRemove.length > state.forgeMoveLimit) {
    return failure("forge-move-limit");
  }

  const changed: UpgradeId[] = [];
  for (const id of cascade) {
    const addedIndex = state.draftAddedSkillIds.indexOf(id);
    if (addedIndex >= 0) {
      state.draftAddedSkillIds.splice(addedIndex, 1);
      changed.push(id);
      continue;
    }
    if (state.committedSkillIds.includes(id) && !state.draftRemovedSkillIds.includes(id)) {
      state.draftRemovedSkillIds.push(id);
      changed.push(id);
    }
  }
  return success(sortSkillIds(changed));
}

export function discardSkillDraft(state: SkillAllocationState): void {
  state.draftAddedSkillIds = [];
  state.draftRemovedSkillIds = [];
}

export function commitSkillDraft(state: SkillAllocationState): SkillAllocationCommandResult {
  if (state.visitMode === "closed") return failure("allocation-closed");
  const effective = effectiveSkillIdSet(state);
  if (!isLegalOwnedSet(effective) || effective.size > state.totalEarnedPoints) {
    return failure("invalid-draft");
  }
  const changed = sortSkillIds([...state.draftAddedSkillIds, ...state.draftRemovedSkillIds]);
  state.committedSkillIds = sortSkillIds([...effective]);
  state.draftAddedSkillIds = [];
  state.draftRemovedSkillIds = [];
  state.visitMode = "closed";
  return success(changed);
}

export function effectiveSkillIds(state: SkillAllocationState): UpgradeId[] {
  return sortSkillIds([...effectiveSkillIdSet(state)]);
}

export function spentSkillPoints(state: SkillAllocationState): number {
  return effectiveSkillIdSet(state).size;
}

export function unspentSkillPoints(state: SkillAllocationState): number {
  return Math.max(0, state.totalEarnedPoints - spentSkillPoints(state));
}

export function skillAllocationSnapshot(state: SkillAllocationState): SkillAllocationSnapshot {
  const effective = effectiveSkillIdSet(state);
  const unspent = Math.max(0, state.totalEarnedPoints - effective.size);
  return {
    visitMode: state.visitMode,
    totalEarnedPoints: state.totalEarnedPoints,
    spentPoints: effective.size,
    unspentPoints: unspent,
    committedSkillIds: sortSkillIds(state.committedSkillIds),
    draftAddedSkillIds: sortSkillIds(state.draftAddedSkillIds),
    draftRemovedSkillIds: sortSkillIds(state.draftRemovedSkillIds),
    effectiveSkillIds: sortSkillIds([...effective]),
    forgeMovesUsed: state.draftRemovedSkillIds.length,
    forgeMoveLimit: state.forgeMoveLimit,
    nodes: FULL_GAME_SKILL_DEFINITIONS.map((definition) => nodeView(state, definition, effective, unspent)),
  };
}

function nodeView(
  state: SkillAllocationState,
  definition: SkillDefinition,
  effective: ReadonlySet<UpgradeId>,
  unspent: number,
): SkillNodeAllocationView {
  if (state.draftAddedSkillIds.includes(definition.id)) {
    return { id: definition.id, state: "draft", draftAction: "add", missingPrerequisiteIds: [] };
  }
  if (state.draftRemovedSkillIds.includes(definition.id)) {
    return { id: definition.id, state: "draft", draftAction: "remove", missingPrerequisiteIds: [] };
  }
  if (effective.has(definition.id)) {
    return { id: definition.id, state: "committed", draftAction: null, missingPrerequisiteIds: [] };
  }
  const missing = definition.prerequisites.filter((id) => !effective.has(id));
  return {
    id: definition.id,
    state: missing.length === 0 && unspent >= definition.cost && state.visitMode !== "closed" ? "available" : "locked",
    draftAction: null,
    missingPrerequisiteIds: missing,
  };
}

function effectiveSkillIdSet(state: SkillAllocationState): Set<UpgradeId> {
  const result = new Set(state.committedSkillIds);
  for (const id of state.draftRemovedSkillIds) result.delete(id);
  for (const id of state.draftAddedSkillIds) result.add(id);
  return result;
}

function invalidatedSkillsAfterRemoval(
  effective: ReadonlySet<UpgradeId>,
  skillId: UpgradeId,
): UpgradeId[] {
  const removed = new Set<UpgradeId>([skillId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const definition of FULL_GAME_SKILL_DEFINITIONS) {
      if (!effective.has(definition.id) || removed.has(definition.id)) continue;
      if (definition.prerequisites.some((id) => removed.has(id))) {
        removed.add(definition.id);
        changed = true;
      }
    }
  }
  return sortSkillIds([...removed]);
}

function isLegalOwnedSet(ids: ReadonlySet<UpgradeId>): boolean {
  for (const id of ids) {
    const definition = definitionById.get(id);
    if (!definition || definition.prerequisites.some((prerequisite) => !ids.has(prerequisite))) return false;
  }
  return true;
}

function normalizePointTotal(value: number): number {
  if (!Number.isFinite(value)) return STARTING_SKILL_POINTS;
  return Math.min(MAXIMUM_SKILL_POINTS, Math.max(0, Math.floor(value)));
}

function sortSkillIds(ids: readonly UpgradeId[]): UpgradeId[] {
  return [...new Set(ids)].sort((a, b) => (
    (definitionOrder.get(a) ?? Number.MAX_SAFE_INTEGER) - (definitionOrder.get(b) ?? Number.MAX_SAFE_INTEGER)
  ));
}

function success(changedSkillIds: readonly UpgradeId[]): SkillAllocationCommandResult {
  return { ok: true, changedSkillIds };
}

function failure(reason: Exclude<SkillAllocationCommandResult, { ok: true }>["reason"]): SkillAllocationCommandResult {
  return { ok: false, reason };
}

function assertSkillTreeDefinitions(): void {
  if (FULL_GAME_SKILL_DEFINITIONS.length !== 28) {
    throw new Error(`Full-game skill tree must contain 28 nodes; found ${FULL_GAME_SKILL_DEFINITIONS.length}.`);
  }
  const ids = new Set<string>();
  for (const definition of FULL_GAME_SKILL_DEFINITIONS) {
    if (ids.has(definition.id)) throw new Error(`Duplicate full-game skill id: ${definition.id}`);
    ids.add(definition.id);
    if (definition.cost !== 1 || definition.hookIds.length === 0) {
      throw new Error(`Skill ${definition.id} needs cost=1 and at least one gameplay hook.`);
    }
    const text = definition.presentation;
    if (![text.effect, text.trigger, text.limit, text.prerequisite].every((value) => value.trim().length > 0)) {
      throw new Error(`Skill ${definition.id} is missing complete player-facing copy.`);
    }
  }
  for (const definition of FULL_GAME_SKILL_DEFINITIONS) {
    for (const prerequisite of definition.prerequisites) {
      if (!ids.has(prerequisite)) throw new Error(`Skill ${definition.id} has unknown prerequisite ${prerequisite}.`);
    }
  }
  const visiting = new Set<UpgradeId>();
  const visited = new Set<UpgradeId>();
  const visit = (id: UpgradeId) => {
    if (visiting.has(id)) throw new Error(`Skill prerequisite cycle reaches ${id}.`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const prerequisite of fullGameSkillById(id).prerequisites) visit(prerequisite);
    visiting.delete(id);
    visited.add(id);
  };
  for (const definition of FULL_GAME_SKILL_DEFINITIONS) visit(definition.id);
}
