import type { AbilitySlot } from "../../content/abilities/definitions";
import type { GameState } from "../domain/types";

export function getAbilityResource(state: GameState, slot: AbilitySlot) {
  return state.player.abilities[slot]?.resource ?? null;
}

export function setAbilityResource(state: GameState, slot: AbilitySlot, value: number): number {
  const resource = getAbilityResource(state, slot);
  if (!resource) return 0;
  const finiteValue = Number.isFinite(value) ? value : 0;
  resource.current = Math.min(resource.maximum, Math.max(0, finiteValue));
  return resource.current;
}

export function addAbilityResource(state: GameState, slot: AbilitySlot, amount: number): number {
  const resource = getAbilityResource(state, slot);
  if (!resource) return 0;
  const before = resource.current;
  setAbilityResource(state, slot, before + Math.max(0, Number.isFinite(amount) ? amount : 0));
  return resource.current - before;
}

export function spendAbilityResource(state: GameState, slot: AbilitySlot, amount: number): boolean {
  const resource = getAbilityResource(state, slot);
  const cost = Math.max(0, Number.isFinite(amount) ? amount : 0);
  if (!resource || resource.current + 1e-8 < cost) return false;
  resource.current = Math.max(0, resource.current - cost);
  return true;
}
