import * as THREE from "three";

export interface GltfAssetInspection {
  readonly meshes: number;
  readonly skinnedMeshes: number;
  readonly triangles: number;
  readonly materials: number;
  readonly textures: number;
  readonly maximumTextureWidth: number;
  readonly maximumTextureHeight: number;
  readonly skeletonBones: number;
  readonly animationClipNames: readonly string[];
  readonly bounds: {
    readonly min: readonly [number, number, number];
    readonly max: readonly [number, number, number];
  };
  readonly height: number;
  readonly groundOffset: number;
}

export interface GltfAssetRequirements {
  readonly requireSkinnedMesh?: boolean;
  readonly requireAnimationClips?: boolean;
  readonly minimumHeight?: number;
}

export function inspectGltfAsset(
  scene: THREE.Object3D,
  animations: readonly THREE.AnimationClip[],
): GltfAssetInspection {
  scene.updateWorldMatrix(true, true);
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const bones = new Set<THREE.Bone>();
  let meshes = 0;
  let skinnedMeshes = 0;
  let triangles = 0;
  let maximumTextureWidth = 0;
  let maximumTextureHeight = 0;
  scene.traverse((object) => {
    if (object instanceof THREE.Bone) bones.add(object);
    if (!(object instanceof THREE.Mesh)) return;
    meshes += 1;
    if (object instanceof THREE.SkinnedMesh) {
      skinnedMeshes += 1;
      object.skeleton.bones.forEach((bone) => bones.add(bone));
    }
    const position = object.geometry.getAttribute("position");
    triangles += object.geometry.index
      ? object.geometry.index.count / 3
      : (position?.count ?? 0) / 3;
    const entries = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of entries) {
      materials.add(material);
      for (const value of Object.values(material)) {
        if (!(value instanceof THREE.Texture)) continue;
        textures.add(value);
        const image = value.image as { width?: number; height?: number } | undefined;
        maximumTextureWidth = Math.max(maximumTextureWidth, image?.width ?? 0);
        maximumTextureHeight = Math.max(maximumTextureHeight, image?.height ?? 0);
      }
    }
  });
  const bounds = new THREE.Box3().setFromObject(scene);
  const height = bounds.max.y - bounds.min.y;
  return {
    meshes,
    skinnedMeshes,
    triangles,
    materials: materials.size,
    textures: textures.size,
    maximumTextureWidth,
    maximumTextureHeight,
    skeletonBones: bones.size,
    animationClipNames: animations.map((clip) => clip.name),
    bounds: {
      min: [bounds.min.x, bounds.min.y, bounds.min.z],
      max: [bounds.max.x, bounds.max.y, bounds.max.z],
    },
    height,
    groundOffset: bounds.min.y,
  };
}

export function assertGltfAssetRequirements(
  inspection: GltfAssetInspection,
  requirements: GltfAssetRequirements = {},
): void {
  if (inspection.meshes === 0) throw new Error("GLB character has no mesh.");
  if (requirements.requireSkinnedMesh !== false && inspection.skinnedMeshes === 0) {
    throw new Error("GLB character has no SkinnedMesh.");
  }
  if (requirements.requireSkinnedMesh !== false && inspection.skeletonBones === 0) {
    throw new Error("GLB character has no skeleton bones.");
  }
  if (requirements.requireAnimationClips && inspection.animationClipNames.length === 0) {
    throw new Error("GLB character has no AnimationClip.");
  }
  const minimumHeight = requirements.minimumHeight ?? 0.01;
  if (!Number.isFinite(inspection.height) || inspection.height < minimumHeight) {
    throw new Error(`GLB character height ${inspection.height} is invalid.`);
  }
}

export function disposeObjectResources(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    const entries = Array.isArray(object.material) ? object.material : [object.material];
    entries.forEach((material) => {
      materials.add(material);
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) textures.add(value);
      }
    });
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  textures.forEach((texture) => texture.dispose());
}
