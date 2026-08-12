import type {
  AbilityId,
  AnimationSetId,
  AudioProfileId,
  CameraProfileId,
  CharacterPresentationId,
  CharacterProviderId,
  DeathProfileId,
  EnemyDefinitionId,
  VfxProfileId,
} from "../core/ids";
import {
  DASH_SLASH_ABILITY_ID,
  VECTOR_FOCUS_ABILITY_ID,
  abilityDefinitions,
} from "../content/abilities/definitions";
import { PHASE_ONE_GRUNT_ID, enemyDefinitions } from "../content/enemies/definitions";
import { LEVEL_DEFINITIONS } from "../content/levels/definitions";
import { DefinitionRegistry } from "../content/registry";
import type {
  AnimationSetDefinition,
  AnimationStateDefinition,
  CharacterAnimationState,
} from "./animation/controller";
import {
  audioProfileRegistry,
  environmentProfileRegistry,
  lightingProfileRegistry,
  postFxImpactProfileRegistry,
  postFxProfileRegistry,
  vfxProfileRegistry,
} from "./profiles/definitions";

export interface CharacterPresentationDefinition {
  readonly id: CharacterPresentationId;
  readonly providerId: CharacterProviderId;
  readonly animationSetId: AnimationSetId;
  readonly afterimageSource: "character-root";
  readonly weaponMounts: readonly string[];
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
  readonly activationAudioProfileId?: AudioProfileId;
  readonly cameraProfileId: CameraProfileId;
  readonly activationImpactProfileId?: CameraProfileId;
}

export interface PresentationProfileReference {
  readonly id: string;
  readonly runtimeId: string;
  readonly quality: {
    readonly high: "full";
    readonly compatibility: "full" | "reduced";
  };
}

export const PLAYER_CHARACTER_PRESENTATION_ID: CharacterPresentationId = "hero-v5r";

const STATE_PRIORITIES: Readonly<Record<CharacterAnimationState, number>> = {
  idle: 0,
  anticipation: 20,
  action: 30,
  arrival: 25,
  recovery: 10,
  hit: 80,
  death: 100,
};

function animationStates(
  clips: Partial<Record<CharacterAnimationState, string>> = {},
): Readonly<Record<CharacterAnimationState, AnimationStateDefinition>> {
  const state = (
    id: CharacterAnimationState,
    fadeInMs: number,
    fadeOutMs: number,
    loop: "repeat" | "once",
  ): AnimationStateDefinition => ({
    clip: clips[id] ?? null,
    fadeInMs,
    fadeOutMs,
    timeScale: 1,
    loop,
    priority: STATE_PRIORITIES[id],
  });
  return {
    idle: state("idle", 140, 100, "repeat"),
    anticipation: state("anticipation", 35, 35, "once"),
    action: state("action", 30, 45, "once"),
    arrival: state("arrival", 35, 70, "once"),
    recovery: state("recovery", 70, 100, "once"),
    hit: state("hit", 20, 80, "once"),
    death: state("death", 45, 0, "once"),
  };
}

function heroV5RAnimationStates(): Readonly<Record<CharacterAnimationState, AnimationStateDefinition>> {
  const base = animationStates({
    idle: "hero-ready-v5r",
    anticipation: "hero-dash-anticipation-v5r",
    action: "hero-dash-travel-v5r",
    arrival: "hero-arrival-v5r",
    recovery: "hero-recovery-v5r",
    hit: "hero-death-v5r",
    death: "hero-death-v5r",
  });
  return {
    idle: {
      ...base.idle,
      clipVariants: {
        turn: "hero-turn-v5r",
        "focus-activate": "hero-focus-activate-v5r",
        "focus-selection": "hero-focus-selection-v5r",
      },
    },
    anticipation: { ...base.anticipation, sourceProgressRange: [0, 0.18] },
    action: {
      ...base.action,
      sourceProgressRange: [0.18, 0.72],
      clipVariants: {
        "chain-1": "hero-chain-slash-01-v5r",
        "chain-2": "hero-chain-slash-02-v5r",
        "chain-3": "hero-chain-slash-03-v5r",
      },
      variantSourceProgressRanges: {
        "chain-1": [0, 1],
        "chain-2": [0, 1],
        "chain-3": [0, 1],
      },
    },
    arrival: { ...base.arrival, sourceProgressRange: [0.72, 1] },
    recovery: { ...base.recovery, sourceProgressRange: [0, 1] },
    hit: { ...base.hit, sourceProgressRange: [0, 1] },
    death: { ...base.death, sourceProgressRange: [0, 1] },
  };
}

function enemyV5RAnimationStates(): Readonly<Record<CharacterAnimationState, AnimationStateDefinition>> {
  const base = animationStates({
    idle: "enemy-idle-v5r",
    anticipation: "enemy-threat-v5r",
    action: "enemy-run-v5r",
    arrival: "enemy-attack-recovery-v5r",
    recovery: "enemy-attack-recovery-v5r",
    hit: "enemy-hit-left-v5r",
    death: "enemy-separation-transition-v5r",
  });
  return {
    idle: {
      ...base.idle,
      clipVariants: { turn: "enemy-turn-v5r" },
    },
    anticipation: base.anticipation,
    action: {
      ...base.action,
      speedScaleFromInput: true,
      clipVariants: {
        threat: "enemy-threat-v5r",
        attack: "enemy-contact-attack-v5r",
      },
    },
    arrival: base.arrival,
    recovery: base.recovery,
    hit: {
      ...base.hit,
      sourceProgressRange: [0, 1],
      clipVariants: { right: "enemy-hit-right-v5r", "cut-hold": "enemy-delayed-cut-hold-v5r" },
    },
    death: {
      ...base.death,
      sourceProgressRange: [0, 1],
      clipVariants: { fall: "enemy-fall-v5r" },
    },
  };
}

export const characterPresentationRegistry = new DefinitionRegistry<CharacterPresentationDefinition>([
  {
    id: PLAYER_CHARACTER_PRESENTATION_ID,
    providerId: "gltf-hero-v5r",
    animationSetId: "hero-v5r-authored",
    afterimageSource: "character-root",
    weaponMounts: ["primary-weapon"],
  },
  {
    id: "enemy-v5r",
    providerId: "gltf-enemy-v5r",
    animationSetId: "enemy-v5r-authored",
    afterimageSource: "character-root",
    weaponMounts: ["primary-weapon"],
  },
  {
    id: "hero-procedural-v5",
    providerId: "procedural-hero-v5",
    animationSetId: "hero-procedural-v5",
    afterimageSource: "character-root",
    weaponMounts: ["primary-weapon"],
  },
  {
    id: "enemy-procedural-v5",
    providerId: "procedural-enemy-v5",
    animationSetId: "enemy-procedural-v5",
    afterimageSource: "character-root",
    weaponMounts: ["primary-weapon"],
  },
]);

export const animationSetRegistry = new DefinitionRegistry<AnimationSetDefinition>([
  {
    id: "hero-v5r-authored",
    controllerId: "semantic-animation-clip-v5r",
    states: heroV5RAnimationStates(),
  },
  {
    id: "enemy-v5r-authored",
    controllerId: "semantic-animation-clip-v5r",
    states: enemyV5RAnimationStates(),
  },
  {
    id: "hero-procedural-v5",
    controllerId: "hero-procedural-pose-driver-v5",
    states: animationStates(),
  },
  {
    id: "enemy-procedural-v5",
    controllerId: "enemy-procedural-pose-driver-v5",
    states: animationStates(),
  },
  {
    id: "validation-native-clips-v1",
    controllerId: "native-animation-mixer-v1",
    states: animationStates({
      idle: "Idle",
      anticipation: "Anticipation",
      action: "Action",
      arrival: "Arrival",
      recovery: "Recovery",
      hit: "Hit",
      death: "Death",
    }),
  },
]);

export const enemyPresentationRegistry = new DefinitionRegistry<EnemyPresentationDefinition>([
  {
    id: PHASE_ONE_GRUNT_ID,
    characterId: "enemy-v5r",
    animationSetId: "enemy-v5r-authored",
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
  {
    id: VECTOR_FOCUS_ABILITY_ID,
    vfxProfileId: "vector-focus-chain-v1",
    audioProfileId: "vector-focus-chain-v1",
    activationAudioProfileId: "vector-focus-start-v1",
    cameraProfileId: "vector-focus-impact-v1",
    activationImpactProfileId: "vector-focus-start-impact-v1",
  },
]);

export const vfxRegistry = vfxProfileRegistry;
export const audioRegistry = audioProfileRegistry;

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
  {
    id: "vector-focus-impact-v1",
    runtimeId: "gameplay-camera-impulse-v1",
    quality: { high: "full", compatibility: "full" },
  },
  {
    id: "vector-focus-start-impact-v1",
    runtimeId: "gameplay-camera-impulse-v1",
    quality: { high: "full", compatibility: "full" },
  },
]);

export const lightingRegistry = lightingProfileRegistry;
export const postFxRegistry = postFxProfileRegistry;
export const environmentRegistry = environmentProfileRegistry;

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
    if (presentation.activationAudioProfileId) audioRegistry.get(presentation.activationAudioProfileId);
    cameraProfileRegistry.get(presentation.cameraProfileId);
    postFxImpactProfileRegistry.get(presentation.cameraProfileId);
    if (presentation.activationImpactProfileId) {
      cameraProfileRegistry.get(presentation.activationImpactProfileId);
      postFxImpactProfileRegistry.get(presentation.activationImpactProfileId);
    }
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
  for (const environment of environmentRegistry.list()) {
    lightingRegistry.get(environment.lightingProfileId);
    postFxRegistry.get(environment.postFxProfileId);
    checked.push(`environment:${environment.id}`);
  }
  return { ok: true, checked };
}

assertPresentationRegistryIntegrity();
