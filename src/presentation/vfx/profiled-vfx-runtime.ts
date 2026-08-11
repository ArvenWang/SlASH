import type * as THREE from "three";
import type { KillImpactVfxOptions, SlashVfxOptions, VfxRuntime } from "../../vfx";
import { vfxProfileRegistry, type VfxPriority } from "../profiles/definitions";

export interface ProfiledVfxSnapshot {
  readonly density: number;
  readonly triggerCounts: Readonly<Record<string, number>>;
  readonly base: ReturnType<VfxRuntime["snapshot"]>;
}

export interface ProfiledVfxRuntime {
  spawnSlash(profileId: string, options: SlashVfxOptions): void;
  spawnCutContact(profileId: string, options: KillImpactVfxOptions): void;
  spawnKillImpact(profileId: string, options: KillImpactVfxOptions): void;
  seedBlood(profileId: string, position: THREE.Vector3, direction?: THREE.Vector3): void;
  setDensity(value: number): void;
  clearStage(): void;
  update(dt: number): void;
  snapshot(): ProfiledVfxSnapshot;
  dispose(): void;
}

export function createProfiledVfxRuntime(base: VfxRuntime): ProfiledVfxRuntime {
  let density = 1;
  let sequence = 0;
  const triggerCounts: Record<string, number> = {};

  function resolve(profileId: string, runtimeId: string) {
    const profile = vfxProfileRegistry.get(profileId);
    if (profile.runtimeId !== runtimeId) {
      throw new Error(`VFX profile ${profileId} cannot use ${runtimeId}.`);
    }
    triggerCounts[profileId] = (triggerCounts[profileId] ?? 0) + 1;
    sequence += 1;
    return profile;
  }

  function shouldRender(priority: VfxPriority): boolean {
    if (priority === "critical") return true;
    if (density >= 1) return true;
    if (density <= 0) return false;
    return ((sequence * 0x9e3779b1) >>> 0) / 0x1_0000_0000 < density;
  }

  return {
    spawnSlash(profileId, options) {
      const profile = resolve(profileId, "procedural-dash-slash-runtime");
      if (shouldRender(profile.priority)) base.spawnSlash(options);
    },
    spawnCutContact(profileId, options) {
      const profile = resolve(profileId, "procedural-cut-contact-runtime");
      if (shouldRender(profile.priority)) base.spawnCutContact(options);
    },
    spawnKillImpact(profileId, options) {
      const profile = resolve(profileId, "procedural-humanoid-cut-runtime");
      if (shouldRender(profile.priority)) base.spawnKillImpact(options);
    },
    seedBlood(profileId, position, direction) {
      const profile = resolve(profileId, "procedural-blood-runtime");
      if (shouldRender(profile.priority)) base.seedBlood(position, direction);
    },
    setDensity(value) {
      density = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 1));
    },
    clearStage: base.clearStage,
    update: base.update,
    snapshot() {
      return { density, triggerCounts: { ...triggerCounts }, base: base.snapshot() };
    },
    dispose: base.dispose,
  };
}
