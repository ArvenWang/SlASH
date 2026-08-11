import type {
  AbilityId,
  AnimationSetId,
  AudioProfileId,
  CameraProfileId,
  CharacterPresentationId,
  CharacterProviderId,
  DeathProfileId,
  EnemyDefinitionId,
  EnvironmentPresentationId,
  LightingProfileId,
  PostFxProfileId,
  VfxProfileId,
} from "../core/ids";
import { DASH_SLASH_ABILITY_ID, abilityDefinitions } from "../content/abilities/definitions";
import { PHASE_ONE_GRUNT_ID, enemyDefinitions } from "../content/enemies/definitions";
import { LEVEL_DEFINITIONS } from "../content/levels/definitions";
import { DefinitionRegistry } from "../content/registry";

export interface CharacterPresentationDefinition {
  readonly id: CharacterPresentationId;
  readonly providerId: CharacterProviderId;
  readonly animationSetId: AnimationSetId;
  readonly afterimageSource: "character-root";
  readonly weaponMounts: readonly string[];
}

export interface AnimationSetDefinition {
  readonly id: AnimationSetId;
  readonly controllerId: string;
  readonly states: readonly string[];
}

export interface EnemyPresentationDefinition {
  readonly id: EnemyDefinitionId;
  readonly characterId: CharacterPresentationId;
  readonly animationSetId: AnimationSetId;
  readonly vfxProfileId: VfxProfileId;
  readonly audioProfileId: AudioProfileId;
  readonly deathProfileId: DeathProfileId;
}

export interface AbilityPresentationDefinition {
  readonly id: AbilityId;
  readonly vfxProfileId: VfxProfileId;
  readonly audioProfileId: AudioProfileId;
  readonly cameraProfileId: CameraProfileId;
}

export interface EnvironmentPresentationDefinition {
  readonly id: EnvironmentPresentationId;
  readonly lightingProfileId: LightingProfileId;
  readonly postFxProfileId: PostFxProfileId;
}

export interface PresentationProfileReference {
  readonly id: string;
  readonly runtimeId: string;
  readonly quality: {
    readonly high: "full";
    readonly compatibility: "full" | "reduced";
  };
}

export const PLAYER_CHARACTER_PRESENTATION_ID: CharacterPresentationId = "hero-procedural-v5";

export const characterPresentationRegistry = new DefinitionRegistry<CharacterPresentationDefinition>([
  {
    id: PLAYER_CHARACTER_PRESENTATION_ID,
    providerId: "procedural-hero-v5",
    animationSetId: "hero-procedural-v5",
    afterimageSource: "character-root",
    weaponMounts: ["sword-hand"],
  },
  {
    id: "enemy-procedural-v5",
    providerId: "procedural-enemy-v5",
    animationSetId: "enemy-procedural-v5",
    afterimageSource: "character-root",
    weaponMounts: ["weapon-hand"],
  },
]);

export const animationSetRegistry = new DefinitionRegistry<AnimationSetDefinition>([
  {
    id: "hero-procedural-v5",
    controllerId: "hero-procedural-pose-driver-v5",
    states: ["idle", "action", "recovery", "death"],
  },
  {
    id: "enemy-procedural-v5",
    controllerId: "enemy-procedural-pose-driver-v5",
    states: ["locomotion", "threat", "death"],
  },
]);

export const enemyPresentationRegistry = new DefinitionRegistry<EnemyPresentationDefinition>([
  {
    id: PHASE_ONE_GRUNT_ID,
    characterId: "enemy-procedural-v5",
    animationSetId: "enemy-procedural-v5",
    vfxProfileId: "enemy-cut-humanoid-v1",
    audioProfileId: "enemy-cyber-grunt-v1",
    deathProfileId: "humanoid-soft-v1",
  },
]);

export const abilityPresentationRegistry = new DefinitionRegistry<AbilityPresentationDefinition>([
  {
    id: DASH_SLASH_ABILITY_ID,
    vfxProfileId: "dash-slash-current-v1",
    audioProfileId: "dash-slash-current-v1",
    cameraProfileId: "dash-impact-current-v1",
  },
]);

export const vfxRegistry = new DefinitionRegistry<PresentationProfileReference>([
  {
    id: "dash-slash-current-v1",
    runtimeId: "procedural-dash-slash-runtime",
    quality: { high: "full", compatibility: "full" },
  },
  {
    id: "enemy-cut-humanoid-v1",
    runtimeId: "procedural-humanoid-cut-runtime",
    quality: { high: "full", compatibility: "full" },
  },
]);

export const audioRegistry = new DefinitionRegistry<PresentationProfileReference>([
  {
    id: "dash-slash-current-v1",
    runtimeId: "procedural-dash-audio-runtime",
    quality: { high: "full", compatibility: "full" },
  },
  {
    id: "enemy-cyber-grunt-v1",
    runtimeId: "procedural-enemy-audio-runtime",
    quality: { high: "full", compatibility: "full" },
  },
]);

export const deathProfileRegistry = new DefinitionRegistry<PresentationProfileReference>([
  {
    id: "humanoid-soft-v1",
    runtimeId: "procedural-humanoid-corpse-runtime",
    quality: { high: "full", compatibility: "full" },
  },
]);

export const cameraProfileRegistry = new DefinitionRegistry<PresentationProfileReference>([
  {
    id: "dash-impact-current-v1",
    runtimeId: "gameplay-camera-impulse-v1",
    quality: { high: "full", compatibility: "full" },
  },
]);

export const lightingRegistry = new DefinitionRegistry<PresentationProfileReference>([
  {
    id: "transit-cathedral-night-rain",
    runtimeId: "transit-cathedral-lighting-current",
    quality: { high: "full", compatibility: "reduced" },
  },
]);

export const postFxRegistry = new DefinitionRegistry<PresentationProfileReference>([
  {
    id: "cinematic-current-v1",
    runtimeId: "cinematic-postfx-current",
    quality: { high: "full", compatibility: "reduced" },
  },
]);

export const environmentRegistry = new DefinitionRegistry<EnvironmentPresentationDefinition>([
  {
    id: "transit-cathedral-v1",
    lightingProfileId: "transit-cathedral-night-rain",
    postFxProfileId: "cinematic-current-v1",
  },
]);

export interface PresentationRegistryIntegrity {
  readonly ok: true;
  readonly checked: readonly string[];
}

export function assertPresentationRegistryIntegrity(): PresentationRegistryIntegrity {
  const checked: string[] = [];
  for (const character of characterPresentationRegistry.list()) {
    animationSetRegistry.get(character.animationSetId);
    checked.push(`character:${character.id}`);
  }
  for (const enemy of enemyDefinitions.list()) {
    const presentation = enemyPresentationRegistry.get(enemy.id);
    characterPresentationRegistry.get(presentation.characterId);
    animationSetRegistry.get(presentation.animationSetId);
    vfxRegistry.get(presentation.vfxProfileId);
    audioRegistry.get(presentation.audioProfileId);
    deathProfileRegistry.get(presentation.deathProfileId);
    checked.push(`enemy:${enemy.id}`);
  }
  for (const ability of abilityDefinitions.list()) {
    const presentation = abilityPresentationRegistry.get(ability.id);
    vfxRegistry.get(presentation.vfxProfileId);
    audioRegistry.get(presentation.audioProfileId);
    cameraProfileRegistry.get(presentation.cameraProfileId);
    checked.push(`ability:${ability.id}`);
  }
  for (const level of LEVEL_DEFINITIONS) {
    const environment = environmentRegistry.get(level.environmentId);
    if (environment.lightingProfileId !== level.lightingProfileId) {
      throw new Error(`Level ${level.id} lighting does not match environment ${environment.id}.`);
    }
    lightingRegistry.get(environment.lightingProfileId);
    postFxRegistry.get(environment.postFxProfileId);
    checked.push(`level:${level.id}`);
  }
  return { ok: true, checked };
}

assertPresentationRegistryIntegrity();
