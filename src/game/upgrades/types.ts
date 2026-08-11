import type { UpgradeId } from "../../core/ids";

export type SkillAllocationVisitMode = "closed" | "planning" | "forge";
export type SkillDraftAction = "add" | "remove";
export type SkillNodeStateName = "available" | "draft" | "committed" | "locked";

export interface SkillAllocationState {
  totalEarnedPoints: number;
  committedSkillIds: UpgradeId[];
  draftAddedSkillIds: UpgradeId[];
  draftRemovedSkillIds: UpgradeId[];
  visitMode: SkillAllocationVisitMode;
  forgeMoveLimit: number;
}

export interface SkillNodeAllocationView {
  readonly id: UpgradeId;
  readonly state: SkillNodeStateName;
  readonly draftAction: SkillDraftAction | null;
  readonly missingPrerequisiteIds: readonly UpgradeId[];
}

export interface SkillAllocationSnapshot {
  readonly visitMode: SkillAllocationVisitMode;
  readonly totalEarnedPoints: number;
  readonly spentPoints: number;
  readonly unspentPoints: number;
  readonly committedSkillIds: readonly UpgradeId[];
  readonly draftAddedSkillIds: readonly UpgradeId[];
  readonly draftRemovedSkillIds: readonly UpgradeId[];
  readonly effectiveSkillIds: readonly UpgradeId[];
  readonly forgeMovesUsed: number;
  readonly forgeMoveLimit: number;
  readonly nodes: readonly SkillNodeAllocationView[];
}

export type SkillAllocationFailureReason =
  | "allocation-closed"
  | "unknown-skill"
  | "already-owned"
  | "not-owned"
  | "committed-locked"
  | "missing-prerequisite"
  | "insufficient-points"
  | "forge-move-limit"
  | "invalid-draft";

export type SkillAllocationCommandResult =
  | { readonly ok: true; readonly changedSkillIds: readonly UpgradeId[] }
  | { readonly ok: false; readonly reason: SkillAllocationFailureReason };
