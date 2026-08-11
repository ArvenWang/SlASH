import type { AudioRuntime } from "../../audio";
import { audioProfileRegistry } from "../profiles/definitions";

export interface ProfiledAudioRuntime {
  resume(): Promise<void>;
  playDash(profileId: string, killCount: number): void;
  playDeath(profileId: string): void;
  setEnabled(enabled: boolean): void;
  snapshot(): { enabled: boolean; triggerCounts: Readonly<Record<string, number>> };
  dispose(): Promise<void>;
}

export function createProfiledAudioRuntime(base: AudioRuntime): ProfiledAudioRuntime {
  let enabled = true;
  const triggerCounts: Record<string, number> = {};
  function resolve(profileId: string, event: "dash" | "death") {
    const profile = audioProfileRegistry.get(profileId);
    if (profile.event !== event) throw new Error(`Audio profile ${profileId} is not a ${event} profile.`);
    triggerCounts[profileId] = (triggerCounts[profileId] ?? 0) + 1;
    return profile;
  }
  return {
    resume: base.resume,
    playDash(profileId, killCount) {
      const profile = resolve(profileId, "dash");
      if (profile.runtimeId !== "procedural-dash-audio-runtime") {
        throw new Error(`Unsupported dash audio runtime: ${profile.runtimeId}`);
      }
      base.playDash(killCount);
    },
    playDeath(profileId) {
      const profile = resolve(profileId, "death");
      if (profile.runtimeId !== "procedural-death-audio-runtime") {
        throw new Error(`Unsupported death audio runtime: ${profile.runtimeId}`);
      }
      base.playDeath();
    },
    setEnabled(nextEnabled) {
      enabled = nextEnabled;
      base.setEnabled(nextEnabled);
    },
    snapshot() {
      return { enabled, triggerCounts: { ...triggerCounts } };
    },
    dispose: base.dispose,
  };
}
