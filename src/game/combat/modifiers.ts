import { upgradeDefinitions, type ModifierDefinition } from "../../content/upgrades/definitions";
import type { GameState } from "../domain/types";

export interface DashModifierContext {
  distance: number;
  durationMs: number;
  recoveryMs: number;
  hitRadius: number;
}

function applyOperation(current: number, modifier: ModifierDefinition): number {
  if (!Number.isFinite(modifier.value)) throw new Error("Modifier value must be finite.");
  switch (modifier.operation) {
    case "add": return current + modifier.value;
    case "multiply": return current * modifier.value;
    case "clamp-min": return Math.max(current, modifier.value);
    case "clamp-max": return Math.min(current, modifier.value);
  }
}

export function applyDashModifiers(state: GameState, context: DashModifierContext): DashModifierContext {
  const result = { ...context };
  for (const upgradeId of state.run.selectedUpgrades) {
    const upgrade = upgradeDefinitions.get(upgradeId);
    for (const modifier of upgrade.modifiers) {
      if (modifier.hook !== "before-dash") continue;
      result[modifier.field] = applyOperation(result[modifier.field], modifier);
    }
  }
  result.distance = Math.max(0, result.distance);
  result.durationMs = Math.max(0, result.durationMs);
  result.recoveryMs = Math.max(0, result.recoveryMs);
  result.hitRadius = Math.max(0, result.hitRadius);
  return result;
}
