import * as THREE from "three";
import type { RequiredSemanticBone, SemanticSkeleton } from "../characters/skeleton-profile";

type Rotation = readonly [x: number, y: number, z: number];
type SemanticPose = Readonly<Partial<Record<RequiredSemanticBone, Rotation>>>;

interface PoseKeyframe {
  readonly phase: number;
  readonly pose: SemanticPose;
}

interface BoneRest {
  readonly bone: THREE.Bone;
  readonly localQuaternion: THREE.Quaternion;
  readonly parentWorldQuaternionInverse: THREE.Quaternion;
}

const AXES = [
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, 0, 1),
] as const;

function authoredClip(
  name: string,
  duration: number,
  skeleton: SemanticSkeleton,
  keyframes: readonly PoseKeyframe[],
): THREE.AnimationClip {
  const uniqueBones = new Map<THREE.Bone, BoneRest>();
  Object.values(skeleton).forEach((bone) => {
    if (!bone || uniqueBones.has(bone)) return;
    const parentWorldQuaternion = new THREE.Quaternion();
    bone.parent?.getWorldQuaternion(parentWorldQuaternion);
    uniqueBones.set(bone, {
      bone,
      localQuaternion: bone.quaternion.clone(),
      parentWorldQuaternionInverse: parentWorldQuaternion.invert(),
    });
  });
  const times = keyframes.map(({ phase }) => THREE.MathUtils.clamp(phase, 0, 1) * duration);
  const tracks: THREE.KeyframeTrack[] = [];
  for (const rest of uniqueBones.values()) {
    const values: number[] = [];
    for (const keyframe of keyframes) {
      const target = rest.localQuaternion.clone();
      for (const [semantic, rotation] of Object.entries(keyframe.pose) as Array<[
        RequiredSemanticBone,
        Rotation,
      ]>) {
        if (skeleton[semantic] !== rest.bone) continue;
        rotation.forEach((angle, index) => {
          if (Math.abs(angle) < 0.000001) return;
          const axis = AXES[index].clone().applyQuaternion(rest.parentWorldQuaternionInverse).normalize();
          target.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, angle)).normalize();
        });
      }
      values.push(target.x, target.y, target.z, target.w);
    }
    tracks.push(new THREE.QuaternionKeyframeTrack(`${rest.bone.name}.quaternion`, times, values));
  }
  const clip = new THREE.AnimationClip(name, duration, tracks);
  clip.userData = { authoredFor: "Project Slash V5R", inPlace: true };
  return clip;
}

const HERO_READY: SemanticPose = {
  hips: [0.15, -0.1, -0.025],
  spine: [0.14, 0.04, -0.02],
  chest: [0.22, -0.15, 0.035],
  neck: [-0.08, 0.07, 0],
  head: [-0.12, 0.12, -0.018],
  leftShoulder: [0, 0, -0.075],
  leftUpperArm: [-0.32, 0.04, -0.15],
  leftForearm: [-0.38, 0.02, 0.065],
  rightShoulder: [0.03, 0, 0.05],
  rightUpperArm: [-0.46, -0.07, 0.14],
  rightForearm: [-0.64, -0.02, -0.045],
  rightHand: [0.05, 0.02, -0.055],
  leftUpperLeg: [-0.34, 0, -0.13],
  leftLowerLeg: [0.68, 0, 0],
  leftFoot: [-0.2, 0, 0],
  rightUpperLeg: [0.12, 0, 0.13],
  rightLowerLeg: [0.28, 0, 0],
  rightFoot: [-0.08, 0, 0],
};

const HERO_READY_BREATH: SemanticPose = {
  ...HERO_READY,
  hips: [0.158, -0.092, -0.021],
  spine: [0.15, 0.045, -0.017],
  chest: [0.235, -0.14, 0.031],
  head: [-0.11, 0.105, -0.015],
};

const HERO_ANTICIPATION: SemanticPose = {
  ...HERO_READY,
  hips: [0.28, -0.16, -0.03],
  spine: [0.32, 0.08, -0.02],
  chest: [0.4, -0.2, 0.045],
  head: [-0.2, 0.2, -0.02],
  leftUpperArm: [0.34, 0.04, -0.18],
  leftForearm: [-0.26, 0, 0.08],
  rightUpperArm: [-0.82, -0.14, 0.18],
  rightForearm: [-0.42, 0, -0.06],
  leftUpperLeg: [-0.48, 0, -0.12],
  leftLowerLeg: [0.7, 0, 0],
  leftFoot: [-0.18, 0, 0],
  rightUpperLeg: [0.16, 0, 0.1],
  rightLowerLeg: [0.48, 0, 0],
  rightFoot: [-0.12, 0, 0],
};

const HERO_TRAVEL: SemanticPose = {
  hips: [0.36, -0.12, -0.015],
  spine: [0.44, 0.04, -0.02],
  chest: [0.54, -0.14, 0.035],
  neck: [-0.12, 0.08, 0],
  head: [-0.24, 0.16, -0.02],
  leftShoulder: [0, 0, -0.1],
  leftUpperArm: [0.92, 0.04, -0.18],
  leftForearm: [0.08, 0, 0.04],
  rightShoulder: [0, 0, 0.08],
  rightUpperArm: [-1.04, -0.14, 0.2],
  rightForearm: [-0.16, 0.02, -0.08],
  rightHand: [0.12, 0, -0.08],
  leftUpperLeg: [-0.7, 0, -0.08],
  leftLowerLeg: [0.12, 0, 0],
  leftFoot: [-0.08, 0, 0],
  rightUpperLeg: [0.58, 0, 0.08],
  rightLowerLeg: [0.16, 0, 0],
  rightFoot: [0.04, 0, 0],
};

const HERO_ARRIVAL: SemanticPose = {
  hips: [0.18, 0.2, 0.02],
  spine: [0.08, -0.12, 0.01],
  chest: [-0.12, 0.36, -0.04],
  neck: [0.1, -0.18, 0],
  head: [0.14, -0.3, 0.02],
  leftUpperArm: [-0.34, 0.1, -0.14],
  leftForearm: [-0.46, 0, 0.06],
  rightUpperArm: [-0.68, 0.18, 0.2],
  rightForearm: [-0.62, 0.04, -0.1],
  leftUpperLeg: [-0.5, 0, -0.08],
  leftLowerLeg: [0.66, 0, 0],
  leftFoot: [-0.2, 0, 0],
  rightUpperLeg: [0.24, 0, 0.07],
  rightLowerLeg: [0.2, 0, 0],
  rightFoot: [-0.06, 0, 0],
};

const HERO_FOCUS: SemanticPose = {
  ...HERO_READY,
  hips: [0.22, 0, -0.02],
  spine: [0.26, 0, -0.02],
  chest: [0.32, 0, 0],
  head: [-0.18, 0, 0],
  leftUpperArm: [-0.7, 0.22, -0.38],
  leftForearm: [-0.86, -0.1, 0.2],
  rightUpperArm: [-0.72, -0.18, 0.24],
  rightForearm: [-0.72, 0.1, -0.14],
  leftUpperLeg: [-0.42, 0, -0.12],
  leftLowerLeg: [0.7, 0, 0],
  rightUpperLeg: [0.16, 0, 0.12],
  rightLowerLeg: [0.48, 0, 0],
};

const HERO_SELECTION: SemanticPose = {
  ...HERO_FOCUS,
  chest: [0.28, -0.3, 0.05],
  head: [-0.14, 0.36, -0.02],
  leftUpperArm: [-0.18, 0.26, -0.58],
  leftForearm: [-0.42, -0.12, 0.2],
};

const HERO_CHAIN_1: SemanticPose = {
  ...HERO_ANTICIPATION,
  hips: [0.3, -0.28, -0.02],
  chest: [0.46, -0.5, 0.1],
  rightUpperArm: [-0.88, -0.52, 0.3],
  rightForearm: [-0.58, 0.04, -0.12],
  leftUpperLeg: [-0.54, 0, -0.1],
  leftLowerLeg: [0.64, 0, 0],
  rightUpperLeg: [0.28, 0, 0.1],
  rightLowerLeg: [0.28, 0, 0],
};

const HERO_CHAIN_2: SemanticPose = {
  ...HERO_READY,
  hips: [0.22, 0.3, 0.02],
  chest: [0.3, 0.66, -0.12],
  head: [-0.16, -0.38, 0.04],
  rightUpperArm: [-0.44, 0.58, 0.22],
  rightForearm: [-0.8, 0, -0.1],
  leftUpperLeg: [-0.24, 0, -0.08],
  leftLowerLeg: [0.5, 0, 0],
  rightUpperLeg: [0.34, 0, 0.08],
  rightLowerLeg: [0.48, 0, 0],
};

const HERO_CHAIN_3: SemanticPose = {
  ...HERO_TRAVEL,
  hips: [0.42, -0.08, 0],
  chest: [0.6, -0.12, 0.02],
  rightUpperArm: [-1.12, -0.1, 0.14],
  rightForearm: [-0.12, 0, -0.05],
  leftUpperLeg: [-0.62, 0, -0.08],
  leftLowerLeg: [0.14, 0, 0],
  rightUpperLeg: [0.46, 0, 0.08],
  rightLowerLeg: [0.16, 0, 0],
};

const HERO_DEATH: SemanticPose = {
  hips: [0.15, 0.08, -0.28],
  spine: [0.18, -0.04, -0.32],
  chest: [0.22, 0.1, -0.42],
  neck: [0.16, -0.08, 0.14],
  head: [0.24, -0.14, 0.22],
  leftUpperArm: [-0.18, 0, -0.42],
  leftForearm: [0.34, 0, -0.16],
  rightUpperArm: [-0.48, 0.06, 0.12],
  rightForearm: [-0.62, 0, -0.04],
  leftUpperLeg: [-0.5, 0, -0.14],
  leftLowerLeg: [0.94, 0, 0],
  rightUpperLeg: [0.18, 0, 0.14],
  rightLowerLeg: [0.62, 0, 0],
};

export function createHeroV5RClips(skeleton: SemanticSkeleton): THREE.AnimationClip[] {
  return [
    authoredClip("hero-ready-v5r", 2.2, skeleton, [
      { phase: 0, pose: HERO_READY }, { phase: 0.5, pose: HERO_READY_BREATH }, { phase: 1, pose: HERO_READY },
    ]),
    authoredClip("hero-turn-v5r", 0.18, skeleton, [
      { phase: 0, pose: HERO_READY }, { phase: 0.5, pose: { ...HERO_READY, hips: [0.1, 0.2, -0.03], chest: [0.14, -0.26, 0.04] } }, { phase: 1, pose: HERO_READY },
    ]),
    authoredClip("hero-dash-anticipation-v5r", 0.055, skeleton, [
      { phase: 0, pose: HERO_READY }, { phase: 0.72, pose: HERO_ANTICIPATION }, { phase: 1, pose: HERO_TRAVEL },
    ]),
    authoredClip("hero-dash-travel-v5r", 0.1, skeleton, [
      { phase: 0, pose: HERO_ANTICIPATION }, { phase: 0.32, pose: HERO_TRAVEL }, { phase: 1, pose: HERO_TRAVEL },
    ]),
    authoredClip("hero-arrival-v5r", 0.085, skeleton, [
      { phase: 0, pose: HERO_TRAVEL }, { phase: 0.7, pose: HERO_ARRIVAL }, { phase: 1, pose: HERO_ARRIVAL },
    ]),
    authoredClip("hero-recovery-v5r", 0.15, skeleton, [
      { phase: 0, pose: HERO_ARRIVAL }, { phase: 0.55, pose: HERO_READY_BREATH }, { phase: 1, pose: HERO_READY },
    ]),
    authoredClip("hero-focus-activate-v5r", 0.24, skeleton, [
      { phase: 0, pose: HERO_READY }, { phase: 0.7, pose: HERO_FOCUS }, { phase: 1, pose: HERO_FOCUS },
    ]),
    authoredClip("hero-focus-selection-v5r", 1.1, skeleton, [
      { phase: 0, pose: HERO_SELECTION }, { phase: 0.5, pose: { ...HERO_SELECTION, chest: [0.19, -0.19, 0.03] } }, { phase: 1, pose: HERO_SELECTION },
    ]),
    authoredClip("hero-chain-slash-01-v5r", 0.16, skeleton, [
      { phase: 0, pose: HERO_FOCUS }, { phase: 0.55, pose: HERO_CHAIN_1 }, { phase: 1, pose: HERO_CHAIN_1 },
    ]),
    authoredClip("hero-chain-slash-02-v5r", 0.15, skeleton, [
      { phase: 0, pose: HERO_CHAIN_1 }, { phase: 0.58, pose: HERO_CHAIN_2 }, { phase: 1, pose: HERO_CHAIN_2 },
    ]),
    authoredClip("hero-chain-slash-03-v5r", 0.19, skeleton, [
      { phase: 0, pose: HERO_CHAIN_2 }, { phase: 0.62, pose: HERO_CHAIN_3 }, { phase: 1, pose: HERO_ARRIVAL },
    ]),
    authoredClip("hero-death-v5r", 0.68, skeleton, [
      { phase: 0, pose: HERO_READY }, { phase: 0.22, pose: { ...HERO_READY, chest: [-0.12, 0.18, 0.22] } }, { phase: 1, pose: HERO_DEATH },
    ]),
  ];
}

const ENEMY_IDLE: SemanticPose = {
  hips: [0.035, -0.03, 0],
  chest: [0.075, 0.04, 0],
  neck: [-0.035, -0.03, 0],
  head: [-0.045, -0.04, 0],
  leftUpperArm: [-0.28, 0.02, -0.1],
  leftForearm: [-0.34, 0, 0.05],
  rightUpperArm: [-0.46, -0.05, 0.14],
  rightForearm: [-0.46, 0, -0.06],
  leftUpperLeg: [-0.035, 0, -0.025],
  leftLowerLeg: [0.08, 0, 0],
  rightUpperLeg: [0.035, 0, 0.025],
  rightLowerLeg: [0.08, 0, 0],
};

function enemyRunPose(stride: number): SemanticPose {
  const leftStep = Math.max(0, -stride);
  const rightStep = Math.max(0, stride);
  return {
    ...ENEMY_IDLE,
    hips: [0.1, -stride * 0.06, 0],
    chest: [0.16, stride * 0.08, 0],
    leftUpperArm: [-0.38 + stride * 0.3, 0, -0.1],
    leftForearm: [-0.46, 0, 0.05],
    rightUpperArm: [-0.52 - stride * 0.3, 0, 0.13],
    rightForearm: [-0.54, 0, -0.06],
    leftUpperLeg: [-stride * 0.44, 0, -0.04],
    leftLowerLeg: [0.08 + leftStep * 0.56, 0, 0],
    leftFoot: [stride * 0.13, 0, 0],
    rightUpperLeg: [stride * 0.44, 0, 0.04],
    rightLowerLeg: [0.08 + rightStep * 0.56, 0, 0],
    rightFoot: [-stride * 0.13, 0, 0],
  };
}

const ENEMY_THREAT: SemanticPose = {
  ...ENEMY_IDLE,
  hips: [0.1, -0.12, 0],
  chest: [0.18, -0.2, 0.03],
  head: [-0.1, 0.2, -0.02],
  rightUpperArm: [-0.78, -0.18, 0.2],
  rightForearm: [-0.68, 0, -0.08],
  leftUpperArm: [-0.5, 0.12, -0.18],
  leftForearm: [-0.52, 0, 0.08],
};

const ENEMY_ATTACK: SemanticPose = {
  ...ENEMY_THREAT,
  hips: [0.2, 0.18, 0],
  chest: [0.32, 0.42, -0.04],
  head: [-0.18, -0.3, 0.02],
  rightUpperArm: [-0.94, 0.34, 0.24],
  rightForearm: [-0.38, 0.05, -0.14],
  leftUpperLeg: [0.34, 0, -0.06],
  rightUpperLeg: [-0.3, 0, 0.06],
};

const ENEMY_HIT: SemanticPose = {
  ...ENEMY_IDLE,
  hips: [-0.08, -0.18, 0.08],
  chest: [-0.2, 0.42, -0.22],
  head: [0.16, -0.34, 0.1],
  leftUpperArm: [0.08, 0, -0.46],
  rightUpperArm: [0.18, 0, 0.5],
  rightForearm: [0.3, 0, 0.08],
};

const ENEMY_FALL: SemanticPose = {
  ...ENEMY_HIT,
  hips: [-0.24, -0.16, 0.52],
  chest: [-0.34, 0.22, 0.7],
  head: [0.24, -0.2, -0.2],
  leftUpperLeg: [-0.34, 0, -0.16],
  leftLowerLeg: [0.52, 0, 0],
  rightUpperLeg: [0.48, 0, 0.18],
  rightLowerLeg: [0.7, 0, 0],
};

export function createEnemyV5RClips(skeleton: SemanticSkeleton): THREE.AnimationClip[] {
  return [
    authoredClip("enemy-idle-v5r", 2.25, skeleton, [
      { phase: 0, pose: ENEMY_IDLE }, { phase: 0.5, pose: { ...ENEMY_IDLE, chest: [0.085, 0.02, 0] } }, { phase: 1, pose: ENEMY_IDLE },
    ]),
    authoredClip("enemy-turn-v5r", 0.24, skeleton, [
      { phase: 0, pose: ENEMY_IDLE }, { phase: 0.5, pose: { ...ENEMY_IDLE, hips: [0.06, 0.18, 0], chest: [0.1, -0.24, 0] } }, { phase: 1, pose: ENEMY_IDLE },
    ]),
    authoredClip("enemy-run-v5r", 0.72, skeleton, [
      { phase: 0, pose: enemyRunPose(0) }, { phase: 0.25, pose: enemyRunPose(1) }, { phase: 0.5, pose: enemyRunPose(0) }, { phase: 0.75, pose: enemyRunPose(-1) }, { phase: 1, pose: enemyRunPose(0) },
    ]),
    authoredClip("enemy-threat-v5r", 0.42, skeleton, [
      { phase: 0, pose: ENEMY_IDLE }, { phase: 0.72, pose: ENEMY_THREAT }, { phase: 1, pose: ENEMY_THREAT },
    ]),
    authoredClip("enemy-contact-attack-v5r", 0.44, skeleton, [
      { phase: 0, pose: ENEMY_THREAT }, { phase: 0.58, pose: ENEMY_ATTACK }, { phase: 1, pose: ENEMY_ATTACK },
    ]),
    authoredClip("enemy-attack-recovery-v5r", 0.26, skeleton, [
      { phase: 0, pose: ENEMY_ATTACK }, { phase: 1, pose: ENEMY_IDLE },
    ]),
    authoredClip("enemy-hit-left-v5r", 0.18, skeleton, [
      { phase: 0, pose: ENEMY_IDLE }, { phase: 0.72, pose: ENEMY_HIT }, { phase: 1, pose: ENEMY_HIT },
    ]),
    authoredClip("enemy-hit-right-v5r", 0.18, skeleton, [
      { phase: 0, pose: ENEMY_IDLE }, { phase: 0.72, pose: { ...ENEMY_HIT, hips: [-0.08, 0.18, -0.08], chest: [-0.2, -0.42, 0.22] } }, { phase: 1, pose: ENEMY_HIT },
    ]),
    authoredClip("enemy-delayed-cut-hold-v5r", 0.12, skeleton, [
      { phase: 0, pose: ENEMY_HIT }, { phase: 1, pose: ENEMY_HIT },
    ]),
    authoredClip("enemy-separation-transition-v5r", 0.13, skeleton, [
      { phase: 0, pose: ENEMY_HIT }, { phase: 1, pose: { ...ENEMY_HIT, chest: [-0.24, 0.5, -0.28] } },
    ]),
    authoredClip("enemy-fall-v5r", 0.68, skeleton, [
      { phase: 0, pose: ENEMY_HIT }, { phase: 1, pose: ENEMY_FALL },
    ]),
  ];
}
