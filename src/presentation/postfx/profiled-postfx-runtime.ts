import type { PostFxRuntime } from "../../postfx";
import { postFxImpactProfileRegistry } from "../profiles/definitions";

export interface ProfiledPostFxRuntime extends Omit<PostFxRuntime, "impact" | "impactDecay"> {
  triggerImpact(profileId: string, additiveAmount?: number): void;
  snapshot(): { impact: number; activeProfileId: string | null };
}

export function createProfiledPostFxRuntime(base: PostFxRuntime): ProfiledPostFxRuntime {
  let activeProfileId: string | null = null;
  return {
    composer: base.composer,
    bloom: base.bloom,
    resize: base.resize,
    update: base.update,
    triggerImpact(profileId, additiveAmount = 0) {
      const profile = postFxImpactProfileRegistry.get(profileId);
      if (profile.runtimeId !== "cinematic-impact-runtime") {
        throw new Error(`Unsupported Post FX impact runtime: ${profile.runtimeId}`);
      }
      activeProfileId = profileId;
      base.impactDecay = profile.decay;
      base.impact = Math.max(
        base.impact,
        Math.min(profile.maximumImpact, profile.baseImpact + Math.max(0, additiveAmount)),
      );
    },
    snapshot() {
      return { impact: base.impact, activeProfileId };
    },
  };
}
