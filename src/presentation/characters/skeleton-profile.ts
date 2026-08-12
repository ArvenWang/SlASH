import * as THREE from "three";

export const REQUIRED_SEMANTIC_BONES = [
  "root",
  "hips",
  "spine",
  "chest",
  "neck",
  "head",
  "leftShoulder",
  "leftUpperArm",
  "leftForearm",
  "leftHand",
  "rightShoulder",
  "rightUpperArm",
  "rightForearm",
  "rightHand",
  "leftUpperLeg",
  "leftLowerLeg",
  "leftFoot",
  "rightUpperLeg",
  "rightLowerLeg",
  "rightFoot",
] as const;

export type RequiredSemanticBone = typeof REQUIRED_SEMANTIC_BONES[number];
export type OptionalSemanticBone = "leftToe" | "rightToe";
export type SemanticBone = RequiredSemanticBone | OptionalSemanticBone;

export interface SkeletonProfileDefinition {
  readonly id: string;
  readonly sourceYawRadians: number;
  readonly bones: Readonly<Record<RequiredSemanticBone, string>>;
  readonly optionalBones?: Readonly<Partial<Record<OptionalSemanticBone, string>>>;
  readonly fingerRoots?: {
    readonly left: readonly string[];
    readonly right: readonly string[];
  };
}

export type SemanticSkeleton = Readonly<Record<RequiredSemanticBone, THREE.Bone>>
  & Readonly<Partial<Record<OptionalSemanticBone, THREE.Bone>>>;

function bindingSafeName(value: string): string {
  return value.replace(/[\s.\[\]:/]/g, "");
}

function boneMap(root: THREE.Object3D) {
  const bonesByName = new Map<string, THREE.Bone>();
  root.traverse((object) => {
    if (object instanceof THREE.Bone) bonesByName.set(bindingSafeName(object.name), object);
  });
  return bonesByName;
}

export function resolveSemanticSkeleton(
  root: THREE.Object3D,
  profile: SkeletonProfileDefinition,
): SemanticSkeleton {
  const bonesByName = boneMap(root);
  const resolve = (semantic: SemanticBone, sourceName: string, required: boolean) => {
    const bone = bonesByName.get(bindingSafeName(sourceName));
    if (!bone && required) {
      throw new Error(`Skeleton profile ${profile.id} cannot resolve ${semantic} from source bone ${sourceName}.`);
    }
    return bone;
  };
  const requiredEntries = REQUIRED_SEMANTIC_BONES.map((semantic) => [
    semantic,
    resolve(semantic, profile.bones[semantic], true),
  ] as const);
  const optionalEntries = Object.entries(profile.optionalBones ?? {}).flatMap(([semantic, sourceName]) => {
    if (!sourceName) return [];
    const bone = resolve(semantic as OptionalSemanticBone, sourceName, false);
    return bone ? [[semantic, bone] as const] : [];
  });
  return Object.fromEntries([...requiredEntries, ...optionalEntries]) as SemanticSkeleton;
}

export function resolveFingerRoots(
  root: THREE.Object3D,
  profile: SkeletonProfileDefinition,
): { readonly left: readonly THREE.Bone[]; readonly right: readonly THREE.Bone[] } {
  const bonesByName = boneMap(root);
  const resolveSide = (side: "left" | "right") => (profile.fingerRoots?.[side] ?? []).map((sourceName) => {
    const bone = bonesByName.get(bindingSafeName(sourceName));
    if (!bone) throw new Error(`Skeleton profile ${profile.id} cannot resolve ${side} finger root ${sourceName}.`);
    return bone;
  });
  return { left: resolveSide("left"), right: resolveSide("right") };
}

export const HERO_V5R_SKELETON_PROFILE: SkeletonProfileDefinition = {
  id: "hero-v5r-tripo-v25",
  sourceYawRadians: Math.PI * 0.5,
  bones: {
    root: "tripo::Root",
    hips: "tripo::0_Right_Limb_0",
    spine: "tripo::Spine_1",
    chest: "tripo::Spine_3",
    neck: "tripo::Head_0",
    head: "tripo::Head_1",
    leftShoulder: "bone_36",
    leftUpperArm: "bone_37",
    leftForearm: "bone_38",
    leftHand: "bone_41",
    rightShoulder: "tripo::Spine_4",
    rightUpperArm: "bone_10",
    rightForearm: "bone_11",
    rightHand: "bone_14",
    leftUpperLeg: "tripo::0_Left_Limb_0",
    leftLowerLeg: "tripo::0_Left_Limb_1",
    leftFoot: "bone_65",
    rightUpperLeg: "tripo::1_Left_Limb_0",
    rightLowerLeg: "tripo::1_Left_Limb_1",
    rightFoot: "tripo::1_Left_Limb_2",
  },
  optionalBones: {
    leftToe: "bone_66",
    rightToe: "tripo::1_Left_Limb_3",
  },
  fingerRoots: {
    left: ["bone_42", "bone_46", "bone_50", "bone_54", "bone_58"],
    right: ["bone_15", "bone_19", "bone_23", "bone_27", "bone_31"],
  },
};

export const ENEMY_V5R_SKELETON_PROFILE: SkeletonProfileDefinition = {
  id: "enemy-v5r-tripo-v25",
  sourceYawRadians: -Math.PI * 0.5,
  bones: {
    root: "tripo::Root",
    hips: "tripo::1_Right_Limb_0",
    // This rigid armored rig has a two-joint torso. The lower torso therefore
    // owns both hips and spine semantics; authored clips de-duplicate tracks.
    spine: "tripo::1_Right_Limb_0",
    chest: "tripo::1_Right_Limb_1",
    neck: "tripo::Spine_0",
    head: "tripo::Head_0",
    leftShoulder: "bone_24",
    leftUpperArm: "bone_25",
    leftForearm: "bone_26",
    leftHand: "bone_27",
    rightShoulder: "tripo::1_Right_Limb_2",
    rightUpperArm: "tripo::1_Right_Limb_3",
    rightForearm: "tripo::1_Right_Limb_4",
    rightHand: "tripo::1_Right_Limb_5",
    leftUpperLeg: "tripo::0_Right_Limb_0",
    leftLowerLeg: "tripo::0_Right_Limb_1",
    leftFoot: "tripo::0_Right_Limb_2",
    rightUpperLeg: "tripo::1_Left_Limb_0",
    rightLowerLeg: "tripo::1_Left_Limb_1",
    rightFoot: "tripo::1_Left_Limb_2",
  },
  optionalBones: {
    leftToe: "tripo::0_Right_Limb_3",
    rightToe: "tripo::1_Left_Limb_3",
  },
  fingerRoots: {
    left: ["bone_28", "bone_31", "bone_34", "bone_37", "bone_40"],
    right: ["bone_9", "tripo::1_Right_Limb_6", "bone_15", "bone_18", "bone_21"],
  },
};
