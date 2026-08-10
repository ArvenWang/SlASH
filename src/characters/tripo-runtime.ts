import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinnedScene } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { EnemyAnimationFrame, HeroAnimationFrame } from "./animation";

const HERO_MODEL_URL = "/models/characters/hero-v5-rigged.glb";
const ENEMY_MODEL_URL = "/models/characters/enemy-v5-rigged.glb";
const HERO_HEIGHT = 3.3;
const ENEMY_HEIGHT = 3.157;
const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Y = new THREE.Vector3(0, 1, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);

export interface TripoCharacterTemplates {
  readonly hero: THREE.Object3D;
  readonly enemy: THREE.Object3D;
}

export interface TripoHeroVisual {
  readonly root: THREE.Group;
  readonly weaponMount: THREE.Group;
  readonly animator: {
    update(frame: HeroAnimationFrame): void;
    reset(): void;
  };
}

export interface TripoEnemyVisual {
  readonly root: THREE.Group;
  readonly weaponMount: THREE.Group;
  readonly animator: {
    update(frame: EnemyAnimationFrame): void;
    reset(): void;
  };
}

interface BoneRest {
  readonly localQuaternion: THREE.Quaternion;
  readonly parentWorldQuaternion: THREE.Quaternion;
}

function smooth(value: number, start = 0, end = 1) {
  return THREE.MathUtils.smoothstep(THREE.MathUtils.clamp(value, start, end), start, end);
}

function requiredBone(root: THREE.Object3D, name: string) {
  // GLTFLoader sanitizes ':', '/', '.', '[' and ']' from node names for the
  // animation binding syntax, while Tripo writes those characters into GLB.
  const semanticName = (value: string) => value.replace(/[\s.\[\]:/]/g, "");
  let node = root.getObjectByName(name);
  if (!node) {
    root.traverse((candidate) => {
      if (!node && candidate instanceof THREE.Bone && semanticName(candidate.name) === semanticName(name)) {
        node = candidate;
      }
    });
  }
  if (!(node instanceof THREE.Bone)) {
    throw new Error(`Tripo character is missing required bone: ${name}`);
  }
  return node;
}

/**
 * Tripo's generated bone-local axes differ from limb to limb. Poses are
 * therefore authored around character-space axes and converted back into each
 * bone parent's rest space. That keeps a forward leg swing pointing forward on
 * both sides without relying on opaque per-bone Euler signs.
 */
class CharacterSpacePose {
  private readonly rests = new Map<THREE.Bone, BoneRest>();
  private readonly targets = new Map<THREE.Bone, THREE.Quaternion>();
  private readonly axisInParent = new THREE.Vector3();
  private readonly delta = new THREE.Quaternion();

  constructor(private readonly bones: readonly THREE.Bone[], root: THREE.Object3D) {
    root.updateWorldMatrix(true, true);
    for (const bone of bones) {
      const parentWorldQuaternion = new THREE.Quaternion();
      bone.parent?.getWorldQuaternion(parentWorldQuaternion);
      this.rests.set(bone, {
        localQuaternion: bone.quaternion.clone(),
        parentWorldQuaternion,
      });
      this.targets.set(bone, bone.quaternion.clone());
    }
  }

  begin() {
    for (const bone of this.bones) {
      const rest = this.rests.get(bone);
      const target = this.targets.get(bone);
      if (rest && target) target.copy(rest.localQuaternion);
    }
  }

  rotate(bone: THREE.Bone, characterAxis: THREE.Vector3, angle: number) {
    if (Math.abs(angle) < 0.000001) return;
    const rest = this.rests.get(bone);
    const target = this.targets.get(bone);
    if (!rest || !target) return;
    this.axisInParent
      .copy(characterAxis)
      .applyQuaternion(rest.parentWorldQuaternion.clone().invert())
      .normalize();
    this.delta.setFromAxisAngle(this.axisInParent, angle);
    target.premultiply(this.delta).normalize();
  }

  commit(dt: number, responsiveness: number) {
    const alpha = 1 - Math.exp(-responsiveness * Math.max(0, dt));
    for (const bone of this.bones) {
      const target = this.targets.get(bone);
      if (target) bone.quaternion.slerp(target, alpha);
    }
  }

  reset() {
    for (const bone of this.bones) {
      const rest = this.rests.get(bone);
      if (rest) bone.quaternion.copy(rest.localQuaternion);
    }
  }
}

function prepareModel(
  template: THREE.Object3D,
  targetHeight: number,
  yaw: number,
  name: string,
) {
  const root = new THREE.Group();
  root.name = name;
  root.userData.characterSource = "tripo-custom-rig";
  const model = cloneSkinnedScene(template);
  model.name = `${name}-skinned-model`;
  root.add(model);

  model.rotation.y = yaw;
  model.updateWorldMatrix(true, true);
  model.traverse((child) => {
    if (!(child instanceof THREE.SkinnedMesh)) return;
    // SkeletonUtils reconnects cloned bones after GLTFLoader has cached the
    // template bounds. Recompute against the clone's own bone matrices before
    // grounding; stale template bounds place this rig roughly half a body too
    // low and hide its legs below the arena.
    child.skeleton.update();
    child.computeBoundingBox();
    child.computeBoundingSphere();
  });
  const neutralBounds = new THREE.Box3().setFromObject(model);
  const neutralHeight = neutralBounds.max.y - neutralBounds.min.y;
  if (!Number.isFinite(neutralHeight) || neutralHeight < 0.01) {
    throw new Error(`${name} has invalid bounds.`);
  }
  model.scale.setScalar(targetHeight / neutralHeight);
  model.updateWorldMatrix(true, true);
  const scaledBounds = new THREE.Box3().setFromObject(model);
  model.position.x -= (scaledBounds.min.x + scaledBounds.max.x) * 0.5;
  model.position.y -= scaledBounds.min.y;
  model.position.z -= (scaledBounds.min.z + scaledBounds.max.z) * 0.5;
  root.userData.normalization = {
    neutralMinY: neutralBounds.min.y,
    neutralMaxY: neutralBounds.max.y,
    scale: targetHeight / neutralHeight,
    groundedOffsetY: model.position.y,
  };

  model.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.castShadow = true;
    child.receiveShadow = true;
    // Generated skinned bounds describe the bind pose only. The custom dash
    // and run poses can extend past it, so avoid limb flicker at screen edges.
    child.frustumCulled = false;
  });
  root.updateWorldMatrix(true, true);
  return { root, model };
}

function createCharacterSpaceMount(
  root: THREE.Object3D,
  parent: THREE.Bone,
  name: string,
) {
  root.updateWorldMatrix(true, true);
  const parentQuaternion = new THREE.Quaternion();
  const parentScale = new THREE.Vector3();
  parent.getWorldQuaternion(parentQuaternion);
  parent.getWorldScale(parentScale);
  const mount = new THREE.Group();
  mount.name = name;
  mount.quaternion.copy(parentQuaternion.invert());
  mount.scale.set(
    1 / Math.max(0.0001, parentScale.x),
    1 / Math.max(0.0001, parentScale.y),
    1 / Math.max(0.0001, parentScale.z),
  );
  parent.add(mount);
  return mount;
}

export async function loadTripoCharacterTemplates(): Promise<TripoCharacterTemplates> {
  // Keep image decoding sequential. Some Chromium/WebKit GPU configurations
  // can starve concurrent createImageBitmap work while the main module is held
  // by top-level await, leaving the loading overlay up indefinitely.
  const hero = await new GLTFLoader().loadAsync(HERO_MODEL_URL);
  const enemy = await new GLTFLoader().loadAsync(ENEMY_MODEL_URL);
  return { hero: hero.scene, enemy: enemy.scene };
}

export function createTripoHeroVisual(template: THREE.Object3D): TripoHeroVisual {
  // The source model faces -X. +90 degrees makes its authored forward +Z.
  const { root, model } = prepareModel(template, HERO_HEIGHT, Math.PI * 0.5, "tripo-hero-v5");
  const rig = {
    hips: requiredBone(model, "tripo::0_Right_Limb_0"),
    spine: requiredBone(model, "tripo::0_Right_Limb_1"),
    chest: requiredBone(model, "tripo::0_Right_Limb_2"),
    neck: requiredBone(model, "tripo::Head_0"),
    head: requiredBone(model, "tripo::Head_1"),
    leftShoulder: requiredBone(model, "tripo::0_Right_Limb_3"),
    leftUpperArm: requiredBone(model, "tripo::0_Right_Limb_4"),
    leftForearm: requiredBone(model, "tripo::0_Right_Limb_5"),
    leftHand: requiredBone(model, "tripo::0_Right_Limb_6"),
    rightShoulder: requiredBone(model, "tripo::Spine_0"),
    rightUpperArm: requiredBone(model, "bone_7"),
    rightForearm: requiredBone(model, "bone_8"),
    rightHand: requiredBone(model, "bone_9"),
    leftUpperLeg: requiredBone(model, "tripo::0_Left_Limb_0"),
    leftShin: requiredBone(model, "tripo::0_Left_Limb_1"),
    leftFoot: requiredBone(model, "tripo::0_Left_Limb_2"),
    rightUpperLeg: requiredBone(model, "tripo::1_Left_Limb_0"),
    rightShin: requiredBone(model, "tripo::1_Left_Limb_1"),
    rightFoot: requiredBone(model, "tripo::1_Left_Limb_2"),
  };
  const pose = new CharacterSpacePose(Object.values(rig), root);
  const weaponMount = createCharacterSpaceMount(root, rig.rightHand, "tripo-hero-weapon-mount");
  const rootTargetPosition = root.position.clone();
  const rootTargetQuaternion = root.quaternion.clone();
  const rootTargetEuler = new THREE.Euler();

  function commitRootPose(
    frame: HeroAnimationFrame,
    x: number,
    y: number,
    z: number,
    positionX = 0,
    positionY = 0,
    positionZ = 0,
    responsiveness = 18,
  ) {
    rootTargetPosition.set(positionX, positionY, positionZ);
    rootTargetEuler.set(x, y, z);
    rootTargetQuaternion.setFromEuler(rootTargetEuler);
    const alpha = 1 - Math.exp(-responsiveness * Math.max(0, frame.dt));
    root.position.lerp(rootTargetPosition, alpha);
    root.quaternion.slerp(rootTargetQuaternion, alpha);
  }

  function addReady(frame: HeroAnimationFrame, weight: number) {
    const breath = Math.sin(frame.time * 2.4) * weight;
    pose.rotate(rig.hips, AXIS_X, (0.08 + breath * 0.008) * weight);
    pose.rotate(rig.hips, AXIS_Y, -0.08 * weight);
    pose.rotate(rig.spine, AXIS_X, (0.09 + breath * 0.01) * weight);
    pose.rotate(rig.chest, AXIS_X, (0.12 + breath * 0.012) * weight);
    pose.rotate(rig.chest, AXIS_Y, (-0.13 + frame.turn * 0.16) * weight);
    pose.rotate(rig.neck, AXIS_X, -0.08 * weight);
    pose.rotate(rig.head, AXIS_X, -0.08 * weight);
    pose.rotate(rig.head, AXIS_Y, (0.12 + frame.turn * 0.24) * weight);

    // A low sword-side guard: both elbows leave the torso silhouette and the
    // right hand stays close to the procedural blade mount.
    pose.rotate(rig.leftUpperArm, AXIS_X, -0.12 * weight);
    pose.rotate(rig.leftUpperArm, AXIS_Z, -0.08 * weight);
    pose.rotate(rig.leftForearm, AXIS_X, -0.16 * weight);
    pose.rotate(rig.rightUpperArm, AXIS_X, -0.2 * weight);
    pose.rotate(rig.rightUpperArm, AXIS_Z, 0.08 * weight);
    pose.rotate(rig.rightForearm, AXIS_X, -0.3 * weight);

    // The generated hero has long, narrow legs. A deep two-joint crouch hides
    // them behind the pelvis at the gameplay camera, so Ready keeps both feet
    // planted and reads its tension through torso/weapon asymmetry.
    pose.rotate(rig.leftUpperLeg, AXIS_X, -0.05 * weight);
    pose.rotate(rig.leftUpperLeg, AXIS_Z, -0.025 * weight);
    pose.rotate(rig.leftShin, AXIS_X, 0.09 * weight);
    pose.rotate(rig.leftFoot, AXIS_X, -0.035 * weight);
    pose.rotate(rig.rightUpperLeg, AXIS_X, 0.035 * weight);
    pose.rotate(rig.rightUpperLeg, AXIS_Z, 0.025 * weight);
    pose.rotate(rig.rightShin, AXIS_X, 0.075 * weight);
    pose.rotate(rig.rightFoot, AXIS_X, -0.025 * weight);
  }

  function addDash(progress: number, weight = 1) {
    const p = THREE.MathUtils.clamp(progress, 0, 1);
    const launch = smooth(p, 0.02, 0.2);
    const transit = launch * (1 - smooth(p, 0.6, 0.88)) * weight;
    const brake = smooth(p, 0.6, 1) * weight;
    const anticipation = (1 - smooth(p, 0.02, 0.17)) * weight;

    pose.rotate(rig.hips, AXIS_X, 0.12 * anticipation + 0.2 * transit + 0.08 * brake);
    pose.rotate(rig.hips, AXIS_Y, -0.1 * transit + 0.2 * brake);
    pose.rotate(rig.spine, AXIS_X, 0.26 * anticipation + 0.24 * transit - 0.08 * brake);
    pose.rotate(rig.chest, AXIS_X, 0.2 * anticipation + 0.34 * transit - 0.12 * brake);
    pose.rotate(rig.chest, AXIS_Y, -0.12 * transit + 0.34 * brake);
    pose.rotate(rig.head, AXIS_X, -0.18 * transit + 0.12 * brake);

    pose.rotate(rig.leftUpperLeg, AXIS_X, -0.4 * anticipation - 0.62 * transit + 0.52 * brake);
    pose.rotate(rig.leftShin, AXIS_X, 0.5 * anticipation + 0.18 * transit + 0.52 * brake);
    pose.rotate(rig.leftFoot, AXIS_X, -0.12 * transit - 0.18 * brake);
    pose.rotate(rig.rightUpperLeg, AXIS_X, 0.3 * anticipation + 0.68 * transit - 0.48 * brake);
    pose.rotate(rig.rightShin, AXIS_X, 0.36 * anticipation + 0.74 * transit + 0.6 * brake);
    pose.rotate(rig.rightFoot, AXIS_X, 0.12 * transit - 0.16 * brake);

    pose.rotate(rig.leftUpperArm, AXIS_X, 0.16 * anticipation + 0.84 * transit - 0.22 * brake);
    pose.rotate(rig.leftUpperArm, AXIS_Z, -0.16 * transit);
    pose.rotate(rig.leftForearm, AXIS_X, -0.2 * anticipation + 0.18 * transit - 0.35 * brake);
    pose.rotate(rig.rightUpperArm, AXIS_X, -0.58 * anticipation - 0.9 * transit - 0.62 * brake);
    pose.rotate(rig.rightUpperArm, AXIS_Z, 0.16 * transit + 0.12 * brake);
    pose.rotate(rig.rightForearm, AXIS_X, -0.34 * anticipation - 0.18 * transit - 0.54 * brake);
  }

  function addDeath(progress: number) {
    const fall = smooth(progress, 0.04, 0.86);
    pose.rotate(rig.chest, AXIS_X, -0.34 * fall);
    pose.rotate(rig.chest, AXIS_Z, 0.38 * fall);
    pose.rotate(rig.head, AXIS_X, 0.22 * fall);
    pose.rotate(rig.leftUpperArm, AXIS_Z, -0.48 * fall);
    pose.rotate(rig.rightUpperArm, AXIS_Z, 0.52 * fall);
    pose.rotate(rig.leftUpperLeg, AXIS_X, -0.25 * fall);
    pose.rotate(rig.rightUpperLeg, AXIS_X, 0.4 * fall);
    pose.rotate(rig.rightShin, AXIS_X, 0.6 * fall);
  }

  return {
    root,
    weaponMount,
    animator: {
      update(frame) {
        pose.begin();
        if (frame.deathProgress !== null) {
          addDeath(frame.deathProgress);
          const fall = smooth(frame.deathProgress, 0.04, 0.86);
          commitRootPose(frame, -0.08 * fall, 0, 1.18 * fall, 0.16 * fall, 0.03 * fall, -0.08 * fall, 13);
          pose.commit(frame.dt, 13);
          return;
        }
        if (frame.dashProgress !== null) {
          const p = THREE.MathUtils.clamp(frame.dashProgress, 0, 1);
          const transit = smooth(p, 0.03, 0.2) * (1 - smooth(p, 0.6, 0.88));
          const brake = smooth(p, 0.6, 1);
          const anticipation = 1 - smooth(p, 0.02, 0.17);
          addReady(frame, 0.22);
          addDash(frame.dashProgress);
          commitRootPose(
            frame,
            0.08 + 0.14 * anticipation + 0.38 * transit + 0.06 * brake,
            0,
            -0.025 * transit + 0.035 * brake,
            0,
            -0.035 * transit,
            0.1 * transit,
            56,
          );
          pose.commit(frame.dt, 56);
          return;
        }
        if (frame.recoveryProgress !== null) {
          const ready = smooth(frame.recoveryProgress, 0.06, 0.92);
          addDash(0.86, 1 - ready);
          addReady(frame, ready);
          commitRootPose(frame, THREE.MathUtils.lerp(0.16, 0.08, ready), 0, THREE.MathUtils.lerp(0.035, 0, ready), 0, 0, 0, 25);
          pose.commit(frame.dt, 25);
          return;
        }
        addReady(frame, 1);
        commitRootPose(frame, 0.08, 0, -0.015, 0, 0, 0, 15);
        pose.commit(frame.dt, 15);
      },
      reset() {
        pose.reset();
        root.position.set(0, 0, 0);
        root.quaternion.identity();
      },
    },
  };
}

export function createTripoEnemyVisual(
  template: THREE.Object3D,
  phaseOffset = 0,
): TripoEnemyVisual {
  // The source model faces +X. -90 degrees makes its authored forward +Z.
  const { root, model } = prepareModel(template, ENEMY_HEIGHT, -Math.PI * 0.5, "tripo-enemy-v5");
  const rig = {
    hips: requiredBone(model, "tripo::1_Left_Limb_0"),
    spine: requiredBone(model, "tripo::1_Left_Limb_1"),
    chest: requiredBone(model, "tripo::1_Left_Limb_2"),
    shoulders: requiredBone(model, "tripo::1_Left_Limb_3"),
    rightShoulder: requiredBone(model, "tripo::1_Left_Limb_4"),
    rightUpperArm: requiredBone(model, "tripo::1_Left_Limb_5"),
    rightForearm: requiredBone(model, "tripo::1_Left_Limb_6"),
    rightHand: requiredBone(model, "tripo::1_Left_Limb_7"),
    leftShoulder: requiredBone(model, "bone_28"),
    leftUpperArm: requiredBone(model, "bone_29"),
    leftForearm: requiredBone(model, "bone_30"),
    leftHand: requiredBone(model, "bone_31"),
    leftUpperLeg: requiredBone(model, "tripo::0_Right_Limb_0"),
    leftShin: requiredBone(model, "tripo::0_Right_Limb_1"),
    // Tripo weights the broad left boot to the shin and omits its terminal
    // joint from the runtime skeleton, so foot articulation shares that bone.
    leftFoot: requiredBone(model, "tripo::0_Right_Limb_1"),
    rightUpperLeg: requiredBone(model, "tripo::0_Left_Limb_0"),
    rightShin: requiredBone(model, "tripo::0_Left_Limb_1"),
    rightFoot: requiredBone(model, "tripo::0_Left_Limb_2"),
  };
  const pose = new CharacterSpacePose(Object.values(rig), root);
  const weaponMount = createCharacterSpaceMount(root, rig.rightHand, "tripo-enemy-weapon-mount");
  let locomotionPhase = phaseOffset;

  function addAlive(frame: EnemyAnimationFrame) {
    const moving = THREE.MathUtils.clamp(frame.speedNormalized, 0, 1);
    locomotionPhase += frame.distanceMoved * 5.4 + frame.dt * (1.5 + moving * 1.8);
    const stride = Math.sin(locomotionPhase);
    const stepLeft = Math.max(0, Math.sin(locomotionPhase + Math.PI));
    const stepRight = Math.max(0, Math.sin(locomotionPhase));
    const drive = 0.42 + moving * 0.58;
    const breath = Math.sin(frame.time * 2.1 + phaseOffset);

    // The enforcer already has a forward-heavy silhouette. Keep the authored
    // run in the legs and shoulders instead of accumulating a large bend at
    // every torso joint (which reads as crawling on this short, broad rig).
    pose.rotate(rig.hips, AXIS_X, (0.012 + moving * 0.008) * drive);
    pose.rotate(rig.hips, AXIS_Y, -stride * 0.08 * drive);
    pose.rotate(rig.spine, AXIS_X, (0.024 + moving * 0.014 + breath * 0.006) * drive);
    pose.rotate(rig.spine, AXIS_Y, frame.turn * 0.12);
    pose.rotate(rig.chest, AXIS_X, (0.034 + moving * 0.022) * drive);
    pose.rotate(rig.chest, AXIS_Y, frame.turn * 0.18);
    pose.rotate(rig.shoulders, AXIS_Z, -stride * 0.07 * drive);

    pose.rotate(rig.leftUpperLeg, AXIS_X, -stride * 0.42 * drive);
    pose.rotate(rig.leftShin, AXIS_X, (0.06 + stepLeft * 0.5) * drive);
    pose.rotate(rig.leftFoot, AXIS_X, stride * 0.18 * drive);
    pose.rotate(rig.rightUpperLeg, AXIS_X, stride * 0.42 * drive);
    pose.rotate(rig.rightShin, AXIS_X, (0.06 + stepRight * 0.5) * drive);
    pose.rotate(rig.rightFoot, AXIS_X, -stride * 0.18 * drive);

    pose.rotate(rig.leftUpperArm, AXIS_X, (0.3 * stride - 0.32) * drive);
    pose.rotate(rig.leftUpperArm, AXIS_Z, -0.1 * drive);
    pose.rotate(rig.leftForearm, AXIS_X, -0.4 * drive);
    pose.rotate(rig.rightUpperArm, AXIS_X, (-0.3 * stride - 0.5) * drive);
    pose.rotate(rig.rightUpperArm, AXIS_Z, 0.14 * drive);
    pose.rotate(rig.rightForearm, AXIS_X, -0.52 * drive);

    const threat = THREE.MathUtils.clamp(frame.threat, 0, 1);
    if (threat > 0) {
      pose.rotate(rig.chest, AXIS_X, 0.07 * threat);
      pose.rotate(rig.chest, AXIS_Y, -0.2 * threat);
      pose.rotate(rig.rightUpperArm, AXIS_X, -0.55 * threat);
      pose.rotate(rig.rightForearm, AXIS_X, -0.42 * threat);
      pose.rotate(rig.leftUpperArm, AXIS_X, -0.28 * threat);
      pose.rotate(rig.leftForearm, AXIS_X, -0.32 * threat);
    }
  }

  function addHit(deathAge: number) {
    const amount = smooth(deathAge, 0.006, 0.075);
    pose.rotate(rig.hips, AXIS_Y, -0.18 * amount);
    pose.rotate(rig.spine, AXIS_X, -0.2 * amount);
    pose.rotate(rig.chest, AXIS_Y, 0.36 * amount);
    pose.rotate(rig.chest, AXIS_Z, -0.28 * amount);
    pose.rotate(rig.leftUpperArm, AXIS_Z, -0.34 * amount);
    pose.rotate(rig.rightUpperArm, AXIS_Z, 0.38 * amount);
    pose.rotate(rig.rightForearm, AXIS_X, 0.3 * amount);
  }

  return {
    root,
    weaponMount,
    animator: {
      update(frame) {
        pose.begin();
        if (frame.deathAge !== null) {
          addHit(frame.deathAge);
          pose.commit(frame.dt, 52);
          return;
        }
        addAlive(frame);
        pose.commit(frame.dt, 18);
      },
      reset() {
        locomotionPhase = phaseOffset;
        pose.reset();
      },
    },
  };
}
