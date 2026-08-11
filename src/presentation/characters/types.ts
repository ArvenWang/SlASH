import type * as THREE from "three";
import type { Vec2 } from "../../core/math/vec2";
import type { CharacterAnimationController } from "../animation/controller";
import type { GltfAssetInspection } from "./gltf-asset";

export type CharacterRole = "hero" | "enemy";

export interface CorpsePresentationRuntime {
  readonly root: THREE.Object3D;
  update(dt: number): void;
  dispose(): void;
}

export interface CharacterDeathPresentation {
  readonly profileId: string;
  setCutVisible(visible: boolean): void;
  setCutHeat(amount: number): void;
  separate(
    scene: THREE.Scene,
    direction: THREE.Vector3,
    seed: number,
  ): CorpsePresentationRuntime | null;
}

export interface CharacterAssetMetadata {
  readonly source: "procedural" | "gltf";
  readonly providerId: string;
  readonly animationClipNames: readonly string[];
  readonly skeletonBoneCount: number;
  readonly forwardAxis: "+Z";
  readonly groundAligned: boolean;
  readonly inspection?: GltfAssetInspection;
}

export interface CharacterRuntime {
  readonly role: CharacterRole;
  readonly root: THREE.Object3D;
  readonly animation: CharacterAnimationController;
  readonly weaponMounts: ReadonlyMap<string, THREE.Object3D>;
  readonly landmarks: ReadonlyMap<string, THREE.Object3D>;
  readonly afterimageSource: THREE.Object3D;
  readonly deathPresentation: CharacterDeathPresentation | null;
  readonly asset: CharacterAssetMetadata;
  setPosition(position: Vec2, y?: number): void;
  setFacingRadians(radians: number): void;
  setVisible(visible: boolean): void;
  setEnergyLevel(level: number): void;
  dispose(): void;
}

export interface CharacterCreateOptions {
  readonly role: CharacterRole;
  readonly variant?: number;
}

export interface CharacterProvider {
  readonly id: string;
  readonly source: CharacterAssetMetadata["source"];
  readonly ready: boolean;
  prepare(): Promise<void>;
  create(options: CharacterCreateOptions): CharacterRuntime;
  dispose(): void;
}
