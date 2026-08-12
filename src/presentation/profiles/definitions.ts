import { DefinitionRegistry } from "../../content/registry";
import { MATERIAL_TOKENS, type MaterialTokenPath } from "../materials/tokens";

export type QualityBehavior = "full" | "reduced";
export type VfxPriority = "critical" | "important" | "ambient";

export interface QualityDeclaration {
  readonly high: "full";
  readonly compatibility: QualityBehavior;
}

export interface VfxProfileDefinition {
  readonly id: string;
  readonly runtimeId: string;
  readonly durationMs: number;
  readonly poolSize: number;
  readonly priority: VfxPriority;
  readonly quality: QualityDeclaration;
}

export interface AudioProfileDefinition {
  readonly id: string;
  readonly runtimeId: string;
  readonly event: "dash" | "focus-start" | "chain-dash" | "death" | "enemy";
  readonly quality: QualityDeclaration;
}

export interface MaterialProfileDefinition {
  readonly id: string;
  readonly colorToken: MaterialTokenPath;
  readonly color: number;
  readonly roughness: number;
  readonly metalness: number;
  readonly emissive?: number;
  readonly emissiveIntensity?: number;
}

export interface LightingProfileDefinition {
  readonly id: string;
  readonly runtimeId: string;
  readonly quality: QualityDeclaration;
  readonly exposure: number;
  readonly hemisphere: { sky: number; ground: number; intensity: number };
  readonly key: { color: number; intensity: number; position: readonly [number, number, number] };
  readonly coldRim: { color: number; intensity: number; position: readonly [number, number, number] };
  readonly environmentFill: { color: number; intensity: number; position: readonly [number, number, number] };
  readonly arenaFill: { color: number; intensity: number; position: readonly [number, number, number] };
  readonly hostileRim: { color: number; intensity: number; position: readonly [number, number, number] };
  readonly heroAnchor: { color: number; intensity: number };
  readonly heroKey: { color: number; intensity: number };
  readonly shadowMapSize: { high: number; compatibility: number };
}

export interface PostFxProfileDefinition {
  readonly id: string;
  readonly runtimeId: string;
  readonly quality: QualityDeclaration;
  readonly bloomStrength: { high: number; compatibility: number };
  readonly bloomRadius: { high: number; compatibility: number };
  readonly bloomThreshold: number;
}

export interface PostFxImpactProfileDefinition {
  readonly id: string;
  readonly runtimeId: string;
  readonly baseImpact: number;
  readonly maximumImpact: number;
  readonly decay: number;
}

export interface EnvironmentProfileDefinition {
  readonly id: string;
  readonly runtimeId: string;
  readonly lightingProfileId: string;
  readonly postFxProfileId: string;
  readonly background: number;
  readonly fogColor: number;
  readonly fogDensity: number;
  readonly rainDensity: number;
  readonly modules: readonly string[];
  readonly quality: QualityDeclaration;
}

export const materialProfileRegistry = new DefinitionRegistry<MaterialProfileDefinition>([
  { id: "hero-soft-v1", colorToken: "surface.darkPrimary", color: MATERIAL_TOKENS.surface.darkPrimary, roughness: 0.94, metalness: 0.01 },
  { id: "hero-armor-v1", colorToken: "surface.playerArmor", color: MATERIAL_TOKENS.surface.playerArmor, roughness: 0.74, metalness: 0.12 },
  { id: "hero-energy-v1", colorToken: "energy.playerCore", color: MATERIAL_TOKENS.energy.playerCore, roughness: 0.24, metalness: 0.02, emissive: 0xf2ffff, emissiveIntensity: 1.45 },
  { id: "hero-optic-v1", colorToken: "energy.playerCore", color: 0xc6e7e9, roughness: 0.3, metalness: 0.06, emissive: 0xe8ffff, emissiveIntensity: 1.7 },
  { id: "enemy-soft-v1", colorToken: "surface.darkSecondary", color: MATERIAL_TOKENS.surface.darkSecondary, roughness: 0.96, metalness: 0.01 },
  { id: "enemy-armor-v1", colorToken: "surface.enemyArmor", color: MATERIAL_TOKENS.surface.enemyArmor, roughness: 0.82, metalness: 0.08 },
  { id: "enemy-energy-v1", colorToken: "energy.enemyWarning", color: MATERIAL_TOKENS.energy.enemyWarning, roughness: 0.2, metalness: 0.72, emissive: MATERIAL_TOKENS.energy.enemyEmissive, emissiveIntensity: 3.4 },
  { id: "enemy-accent-v1", colorToken: "energy.enemyWarning", color: 0xc73518, roughness: 0.82, metalness: 0.03 },
  { id: "blood-wet-v1", colorToken: "blood.primary", color: MATERIAL_TOKENS.blood.primary, roughness: 0.18, metalness: 0, emissive: MATERIAL_TOKENS.blood.deep, emissiveIntensity: 0.24 },
]);

export const vfxProfileRegistry = new DefinitionRegistry<VfxProfileDefinition>([
  { id: "dash-slash-current-v1", runtimeId: "procedural-dash-slash-runtime", durationMs: 200, poolSize: 8, priority: "critical", quality: { high: "full", compatibility: "full" } },
  { id: "vector-focus-chain-v1", runtimeId: "procedural-dash-slash-runtime", durationMs: 480, poolSize: 8, priority: "critical", quality: { high: "full", compatibility: "full" } },
  { id: "enemy-cut-contact-v1", runtimeId: "procedural-cut-contact-runtime", durationMs: 120, poolSize: 24, priority: "critical", quality: { high: "full", compatibility: "full" } },
  { id: "enemy-cut-humanoid-v1", runtimeId: "procedural-humanoid-cut-runtime", durationMs: 720, poolSize: 24, priority: "important", quality: { high: "full", compatibility: "full" } },
  { id: "blood-current-v1", runtimeId: "procedural-blood-runtime", durationMs: 650, poolSize: 28, priority: "important", quality: { high: "full", compatibility: "full" } },
]);

export const audioProfileRegistry = new DefinitionRegistry<AudioProfileDefinition>([
  { id: "dash-slash-current-v1", runtimeId: "procedural-dash-audio-runtime", event: "dash", quality: { high: "full", compatibility: "full" } },
  { id: "vector-focus-start-v1", runtimeId: "procedural-focus-start-audio-runtime", event: "focus-start", quality: { high: "full", compatibility: "full" } },
  { id: "vector-focus-chain-v1", runtimeId: "procedural-chain-dash-audio-runtime", event: "chain-dash", quality: { high: "full", compatibility: "full" } },
  { id: "player-death-current-v1", runtimeId: "procedural-death-audio-runtime", event: "death", quality: { high: "full", compatibility: "full" } },
  { id: "enemy-cyber-grunt-v1", runtimeId: "procedural-enemy-audio-runtime", event: "enemy", quality: { high: "full", compatibility: "full" } },
]);

export const lightingProfileRegistry = new DefinitionRegistry<LightingProfileDefinition>([
  {
    id: "clean-arena-neutral-v2",
    runtimeId: "clean-arena-lighting-v2",
    quality: { high: "full", compatibility: "reduced" },
    exposure: 1.04,
    hemisphere: { sky: 0xc8e2e7, ground: 0x090d10, intensity: 0.62 },
    key: { color: 0xe4f7fa, intensity: 2.45, position: [-22, 36, 24] },
    coldRim: { color: 0x75d4e2, intensity: 330, position: [24, 18, -22] },
    environmentFill: { color: 0x36515b, intensity: 0.4, position: [0, 30, -42] },
    arenaFill: { color: 0xb5e1e5, intensity: 72, position: [0, 14, 5] },
    hostileRim: { color: 0xff4d2a, intensity: 54, position: [-18, 5, -8] },
    heroAnchor: { color: 0xc9f7fa, intensity: 2.1 },
    heroKey: { color: 0xd6edf0, intensity: 330 },
    shadowMapSize: { high: 1536, compatibility: 1024 },
  },
  {
    id: "transit-cathedral-night-rain",
    runtimeId: "transit-cathedral-lighting-current",
    quality: { high: "full", compatibility: "reduced" },
    exposure: 0.98,
    hemisphere: { sky: MATERIAL_TOKENS.environment.coldLight, ground: 0x080d12, intensity: 0.46 },
    key: { color: 0xd9f7ff, intensity: 2.25, position: [-18, 34, 19] },
    coldRim: { color: MATERIAL_TOKENS.environment.coolRim, intensity: 610, position: [20, 20, -24] },
    environmentFill: { color: 0x5a86a0, intensity: 1.08, position: [5, 38, -86] },
    arenaFill: { color: 0xa8d8df, intensity: 82, position: [0, 13, 5] },
    hostileRim: { color: 0xff3b1c, intensity: 58, position: [-17, 4.5, -7] },
    heroAnchor: { color: 0xb9f7ff, intensity: 2.2 },
    heroKey: { color: 0xbfd9e6, intensity: 380 },
    shadowMapSize: { high: 1536, compatibility: 1024 },
  },
  {
    id: "transit-cathedral-day-inspection",
    runtimeId: "transit-cathedral-lighting-current",
    quality: { high: "full", compatibility: "reduced" },
    exposure: 1.08,
    hemisphere: { sky: 0xd8edf0, ground: 0x17232a, intensity: 0.72 },
    key: { color: 0xf0fbff, intensity: 2.8, position: [-14, 36, 16] },
    coldRim: { color: 0x90d9e8, intensity: 360, position: [20, 20, -24] },
    environmentFill: { color: 0x8eaab4, intensity: 1.35, position: [5, 38, -86] },
    arenaFill: { color: 0xc0d9dd, intensity: 105, position: [0, 13, 5] },
    hostileRim: { color: 0xff5736, intensity: 42, position: [-17, 4.5, -7] },
    heroAnchor: { color: 0xd9fbff, intensity: 2 },
    heroKey: { color: 0xe8f6f8, intensity: 310 },
    shadowMapSize: { high: 1536, compatibility: 1024 },
  },
]);

export const postFxProfileRegistry = new DefinitionRegistry<PostFxProfileDefinition>([
  {
    id: "cinematic-current-v1",
    runtimeId: "cinematic-postfx-current",
    quality: { high: "full", compatibility: "reduced" },
    bloomStrength: { high: 0.34, compatibility: 0.28 },
    bloomRadius: { high: 0.3, compatibility: 0.25 },
    bloomThreshold: 1.02,
  },
]);

export const postFxImpactProfileRegistry = new DefinitionRegistry<PostFxImpactProfileDefinition>([
  { id: "dash-impact-current-v1", runtimeId: "cinematic-impact-runtime", baseImpact: 0.15, maximumImpact: 0.62, decay: 11 },
  { id: "vector-focus-start-impact-v1", runtimeId: "cinematic-impact-runtime", baseImpact: 0.28, maximumImpact: 0.46, decay: 8 },
  { id: "vector-focus-impact-v1", runtimeId: "cinematic-impact-runtime", baseImpact: 0.64, maximumImpact: 1, decay: 9 },
  { id: "kill-impact-current-v1", runtimeId: "cinematic-impact-runtime", baseImpact: 0.22, maximumImpact: 0.72, decay: 11 },
  { id: "death-impact-current-v1", runtimeId: "cinematic-impact-runtime", baseImpact: 1, maximumImpact: 1, decay: 11 },
]);

export const environmentProfileRegistry = new DefinitionRegistry<EnvironmentProfileDefinition>([
  {
    id: "clean-arena-v2",
    runtimeId: "clean-arena-runtime-v2",
    lightingProfileId: "clean-arena-neutral-v2",
    postFxProfileId: "cinematic-current-v1",
    background: 0x080d11,
    fogColor: 0x080d11,
    fogDensity: 0,
    rainDensity: 0,
    modules: [
      "clean-arena/surface",
      "clean-arena/surface-detail",
      "clean-arena/boundary-light",
      "clean-arena/lighting",
    ],
    quality: { high: "full", compatibility: "full" },
  },
  {
    id: "transit-cathedral-v1",
    runtimeId: "transit-cathedral-runtime-current",
    lightingProfileId: "transit-cathedral-night-rain",
    postFxProfileId: "cinematic-current-v1",
    background: MATERIAL_TOKENS.environment.background,
    fogColor: MATERIAL_TOKENS.environment.fog,
    fogDensity: 0.0102,
    rainDensity: 1,
    modules: [
      "transit-cathedral/arena",
      "transit-cathedral/transit",
      "transit-cathedral/city",
      "transit-cathedral/weather",
      "transit-cathedral/lighting",
    ],
    quality: { high: "full", compatibility: "full" },
  },
  {
    id: "transit-cathedral-day-inspection",
    runtimeId: "transit-cathedral-runtime-current",
    lightingProfileId: "transit-cathedral-day-inspection",
    postFxProfileId: "cinematic-current-v1",
    background: 0x294451,
    fogColor: 0x597985,
    fogDensity: 0.0045,
    rainDensity: 0.35,
    modules: [
      "transit-cathedral/arena",
      "transit-cathedral/transit",
      "transit-cathedral/city",
      "transit-cathedral/weather",
      "transit-cathedral/lighting",
    ],
    quality: { high: "full", compatibility: "full" },
  },
]);
