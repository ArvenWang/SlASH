import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinnedScene } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptSimplifier } from "meshoptimizer";
import {
  createCharacterAnimationController,
  type ProceduralAnimationDriver,
} from "../animation/controller";
import { animationSetRegistry } from "../registry";
import { createEnemyV5RVisual, createHeroV5RVisual } from "./v5r-runtime";
import { createSkinnedCorpseRuntime } from "./skinned-corpse";
import { assertGltfAssetRequirements, disposeObjectResources, inspectGltfAsset } from "./gltf-asset";
import type {
  CharacterCreateOptions,
  CharacterProvider,
  CharacterRole,
  CharacterRuntime,
} from "./types";

export interface GltfCharacterInstance {
  readonly root: THREE.Object3D;
  readonly weaponMount: THREE.Object3D;
  readonly landmarks?: ReadonlyMap<string, THREE.Object3D>;
  readonly proceduralDriver?: ProceduralAnimationDriver;
  readonly clips?: readonly THREE.AnimationClip[];
  readonly animationTimeOffsetSeconds?: number;
  readonly groundReference?: THREE.Object3D;
  readonly deathPresentation?: CharacterRuntime["deathPresentation"];
  dispose?(): void;
}

export interface GltfCharacterProviderConfig {
  readonly id: string;
  readonly role: CharacterRole;
  readonly url?: string;
  readonly animationSetId: string;
  readonly targetHeight: number;
  readonly sourceYawRadians?: number;
  readonly load?: () => Promise<GLTF>;
  readonly instantiate?: (template: THREE.Object3D, options: CharacterCreateOptions) => GltfCharacterInstance;
}

function normalizeGenericInstance(
  template: THREE.Object3D,
  targetHeight: number,
  yawRadians: number,
): GltfCharacterInstance {
  const root = new THREE.Group();
  const model = cloneSkinnedScene(template);
  model.rotation.y = yawRadians;
  root.add(model);
  model.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3().setFromObject(model);
  const height = bounds.max.y - bounds.min.y;
  if (!Number.isFinite(height) || height < 0.01) throw new Error("GLB instance has invalid bounds.");
  model.scale.setScalar(targetHeight / height);
  model.updateWorldMatrix(true, true);
  const scaledBounds = new THREE.Box3().setFromObject(model);
  model.position.set(
    -(scaledBounds.min.x + scaledBounds.max.x) * 0.5,
    -scaledBounds.min.y,
    -(scaledBounds.min.z + scaledBounds.max.z) * 0.5,
  );
  const weaponMount = new THREE.Group();
  weaponMount.name = "gltf-primary-weapon-mount";
  root.add(weaponMount);
  return { root, weaponMount };
}

function cloneInstanceMaterials(root: THREE.Object3D): Set<THREE.Material> {
  const ownedMaterials = new Set<THREE.Material>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    if (Array.isArray(object.material)) {
      object.material = object.material.map((material) => {
        const clone = material.clone();
        ownedMaterials.add(clone);
        return clone;
      });
    } else {
      const clone = object.material.clone();
      ownedMaterials.add(clone);
      object.material = clone;
    }
    object.castShadow = true;
    object.receiveShadow = true;
    object.frustumCulled = false;
  });
  return ownedMaterials;
}

function createEnergyController(root: THREE.Object3D) {
  const entries: Array<{ material: THREE.MeshStandardMaterial; baseline: number }> = [];
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (material instanceof THREE.MeshStandardMaterial && material.emissive.getHex() !== 0) {
        entries.push({ material, baseline: material.emissiveIntensity });
      }
    }
  });
  return (level: number) => {
    const safeLevel = THREE.MathUtils.clamp(level, 0, 4);
    entries.forEach(({ material, baseline }) => {
      material.emissiveIntensity = baseline * safeLevel;
    });
  };
}

export class GltfCharacterProvider implements CharacterProvider {
  readonly source = "gltf" as const;
  private asset: GLTF | null = null;
  private preparing: Promise<void> | null = null;

  constructor(private readonly config: GltfCharacterProviderConfig) {}

  get id(): string {
    return this.config.id;
  }

  get ready(): boolean {
    return this.asset !== null;
  }

  async prepare(): Promise<void> {
    if (this.asset) return;
    if (this.preparing) return this.preparing;
    this.preparing = (async () => {
      if (!this.config.load && !this.config.url) {
        throw new Error(`${this.id} requires a GLB URL or custom loader.`);
      }
      const asset = this.config.load
        ? await this.config.load()
        : await new GLTFLoader().loadAsync(this.config.url as string);
      await MeshoptSimplifier.ready;
      const inspection = inspectGltfAsset(asset.scene, asset.animations);
      assertGltfAssetRequirements(inspection, { requireSkinnedMesh: true });
      asset.scene.userData.assetInspection = inspection;
      this.asset = asset;
    })();
    try {
      await this.preparing;
    } finally {
      this.preparing = null;
    }
  }

  create(options: CharacterCreateOptions): CharacterRuntime {
    if (options.role !== this.config.role) {
      throw new Error(`${this.id} cannot create ${options.role} characters.`);
    }
    if (!this.asset) throw new Error(`${this.id} must be prepared before create().`);
    const instance = this.config.instantiate
      ? this.config.instantiate(this.asset.scene, options)
      : normalizeGenericInstance(
          this.asset.scene,
          this.config.targetHeight,
          this.config.sourceYawRadians ?? 0,
        );
    const ownedMaterials = cloneInstanceMaterials(instance.root);
    const instanceClips = instance.clips ?? this.asset.animations;
    const animation = createCharacterAnimationController({
      root: instance.root,
      animationSet: animationSetRegistry.get(this.config.animationSetId),
      clips: instanceClips,
      proceduralDriver: instance.proceduralDriver,
      createMixer: true,
      timeOffsetSeconds: instance.animationTimeOffsetSeconds,
    });
    const inspection = inspectGltfAsset(instance.root, instanceClips);
    const groundReferenceBounds = new THREE.Box3().setFromObject(instance.groundReference ?? instance.root);
    const setEnergyLevel = createEnergyController(instance.root);
    return {
      role: this.config.role,
      root: instance.root,
      animation,
      weaponMounts: new Map([["primary-weapon", instance.weaponMount]]),
      landmarks: instance.landmarks ?? new Map(),
      afterimageSource: instance.root,
      deathPresentation: instance.deathPresentation ?? null,
      asset: {
        source: "gltf",
        providerId: this.id,
        animationClipNames: inspection.animationClipNames,
        skeletonBoneCount: inspection.skeletonBones,
        forwardAxis: "+Z",
        groundAligned: Math.abs(groundReferenceBounds.min.y) <= 0.01,
        inspection,
      },
      setPosition(position, y = 0) {
        instance.root.position.set(position.x, y, position.z);
      },
      setFacingRadians(radians) {
        instance.root.rotation.y = radians;
      },
      setVisible(visible) {
        instance.root.visible = visible;
      },
      setEnergyLevel,
      dispose() {
        animation.dispose();
        instance.dispose?.();
        instance.root.removeFromParent();
        ownedMaterials.forEach((material) => material.dispose());
      },
    };
  }

  dispose(): void {
    if (!this.asset) return;
    disposeObjectResources(this.asset.scene);
    this.asset = null;
  }
}

export function createHeroV5RProvider(): CharacterProvider {
  return new GltfCharacterProvider({
    id: "gltf-hero-v5r",
    role: "hero",
    url: "/models/characters/hero-v5r-rig-v25.glb",
    animationSetId: "hero-v5r-authored",
    targetHeight: 3.3,
    instantiate(template) {
      const visual = createHeroV5RVisual(template);
      return {
        root: visual.root,
        weaponMount: visual.weaponMount,
        landmarks: visual.landmarks,
        clips: visual.clips,
        groundReference: visual.model,
        proceduralDriver: visual.proceduralDriver,
        animationTimeOffsetSeconds: visual.animationTimeOffsetSeconds,
        dispose: visual.dispose,
      };
    },
  });
}

export function createEnemyV5RProvider(): CharacterProvider {
  return new GltfCharacterProvider({
    id: "gltf-enemy-v5r",
    role: "enemy",
    url: "/models/characters/enemy-v5r-rig-v25.glb",
    animationSetId: "enemy-v5r-authored",
    targetHeight: 3.157,
    instantiate(template, options) {
      const visual = createEnemyV5RVisual(template, Math.max(0, Math.floor(options.variant ?? 0)));
      return {
        root: visual.root,
        weaponMount: visual.weaponMount,
        landmarks: visual.landmarks,
        clips: visual.clips,
        groundReference: visual.model,
        proceduralDriver: visual.proceduralDriver,
        animationTimeOffsetSeconds: visual.animationTimeOffsetSeconds,
        deathPresentation: visual.cutSeam ? {
          profileId: "humanoid-soft-v1",
          setCutVisible: visual.cutSeam.setVisible,
          setCutHeat: visual.cutSeam.setHeat,
          separate(scene, direction, seed) {
            return createSkinnedCorpseRuntime(scene, visual.root, direction, seed, 3.157);
          },
        } : undefined,
        dispose() {
          visual.dispose();
        },
      };
    },
  });
}
