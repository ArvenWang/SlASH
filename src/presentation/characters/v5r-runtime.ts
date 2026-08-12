import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { clone as cloneSkinnedScene } from "three/examples/jsm/utils/SkeletonUtils.js";
import { createEnemyV5RClips, createHeroV5RClips } from "../animation/v5r-clips";
import type { CharacterAnimationFrame, ProceduralAnimationDriver } from "../animation/controller";
import {
  ENEMY_V5R_GRIP,
  ENEMY_V5R_WEAPON,
  HERO_V5R_GRIP,
  HERO_V5R_WEAPON,
  createWeaponInstance,
  type GripProfileDefinition,
  type WeaponInstance,
  weaponOrientationQuaternion,
} from "../weapons/weapon-runtime";
import {
  ENEMY_V5R_SKELETON_PROFILE,
  HERO_V5R_SKELETON_PROFILE,
  resolveFingerRoots,
  resolveSemanticSkeleton,
  type SemanticSkeleton,
  type SkeletonProfileDefinition,
} from "./skeleton-profile";
import { createCharacterDistanceLod, type CharacterDistanceLodRuntime } from "./distance-lod";

export interface V5RCharacterVisual {
  readonly root: THREE.Group;
  readonly model: THREE.Object3D;
  readonly weaponMount: THREE.Group;
  readonly weapon: WeaponInstance;
  readonly landmarks: ReadonlyMap<string, THREE.Object3D>;
  readonly clips: readonly THREE.AnimationClip[];
  readonly proceduralDriver: ProceduralAnimationDriver;
  readonly distanceLod: CharacterDistanceLodRuntime;
  readonly animationTimeOffsetSeconds: number;
  readonly cutSeam?: {
    setVisible(visible: boolean): void;
    setHeat(amount: number): void;
    dispose(): void;
  };
  dispose(): void;
}

interface PreparedCharacter {
  readonly root: THREE.Group;
  readonly model: THREE.Object3D;
  readonly skeleton: SemanticSkeleton;
  readonly neutralModelY: number;
  readonly targetHeight: number;
}

function maskGeneratedRightHand(
  model: THREE.Object3D,
  rightHand: THREE.Bone,
  profileId: string,
) {
  const handBones = new Set<THREE.Bone>();
  rightHand.traverse((object) => {
    if (object instanceof THREE.Bone) handBones.add(object);
  });
  model.traverse((object) => {
    if (!(object instanceof THREE.SkinnedMesh)) return;
    const geometry = object.geometry;
    const maskId = `${profileId}:right-hand-replaced`;
    if (geometry.userData.presentationMaskId === maskId) return;
    const skinIndex = geometry.getAttribute("skinIndex");
    const skinWeight = geometry.getAttribute("skinWeight");
    const position = geometry.getAttribute("position");
    if (!skinIndex || !skinWeight || !position || skinIndex.itemSize < 4 || skinWeight.itemSize < 4) return;
    const handBoneIndices = new Set<number>();
    object.skeleton.bones.forEach((bone, index) => {
      if (handBones.has(bone)) handBoneIndices.add(index);
    });
    if (handBoneIndices.size === 0) return;
    const sourceIndex = geometry.index;
    const indexCount = sourceIndex?.count ?? position.count;
    const vertexIndexAt = (offset: number) => sourceIndex ? sourceIndex.getX(offset) : offset;
    const handWeightAt = (vertexIndex: number) => {
      const indices = [
        skinIndex.getX(vertexIndex),
        skinIndex.getY(vertexIndex),
        skinIndex.getZ(vertexIndex),
        skinIndex.getW(vertexIndex),
      ];
      const weights = [
        skinWeight.getX(vertexIndex),
        skinWeight.getY(vertexIndex),
        skinWeight.getZ(vertexIndex),
        skinWeight.getW(vertexIndex),
      ];
      return indices.reduce(
        (total, boneIndex, index) => total + (handBoneIndices.has(Math.round(boneIndex)) ? weights[index] : 0),
        0,
      );
    };
    const retained: number[] = [];
    let removedTriangles = 0;
    for (let offset = 0; offset + 2 < indexCount; offset += 3) {
      const triangle = [vertexIndexAt(offset), vertexIndexAt(offset + 1), vertexIndexAt(offset + 2)];
      const weights = triangle.map(handWeightAt);
      const stronglyBoundVertices = weights.filter((weight) => weight >= 0.28).length;
      const averageWeight = (weights[0] + weights[1] + weights[2]) / 3;
      if (stronglyBoundVertices >= 2 || averageWeight >= 0.42) {
        removedTriangles += 1;
      } else {
        retained.push(...triangle);
      }
    }
    if (removedTriangles === 0) return;
    geometry.setIndex(retained);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    geometry.userData.presentationMaskId = maskId;
    geometry.userData.presentationMaskedTriangles = removedTriangles;
  });
}

function prepareCharacter(
  template: THREE.Object3D,
  targetHeight: number,
  profile: SkeletonProfileDefinition,
  name: string,
): PreparedCharacter {
  template.updateWorldMatrix(true, true);
  const reliableTemplateBounds = new THREE.Box3().setFromObject(template);
  const reliableTemplateSize = reliableTemplateBounds.getSize(new THREE.Vector3());
  const reliableTemplateCenter = reliableTemplateBounds.getCenter(new THREE.Vector3());
  if (!Number.isFinite(reliableTemplateSize.y) || reliableTemplateSize.y < 0.01) {
    throw new Error(`${name} has invalid template bounds.`);
  }
  const root = new THREE.Group();
  root.name = name;
  root.userData.characterSource = "v5r-semantic-rig";
  root.userData.skeletonProfileId = profile.id;
  const model = cloneSkinnedScene(template);
  model.name = `${name}-model`;
  model.rotation.y = profile.sourceYawRadians;
  root.add(model);
  const normalizationScale = targetHeight / reliableTemplateSize.y;
  model.scale.setScalar(normalizationScale);
  const rotatedCenter = reliableTemplateCenter
    .clone()
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), profile.sourceYawRadians)
    .multiplyScalar(normalizationScale);
  model.position.set(
    -rotatedCenter.x,
    -reliableTemplateBounds.min.y * normalizationScale,
    -rotatedCenter.z,
  );
  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = true;
    object.frustumCulled = false;
  });
  root.updateWorldMatrix(true, true);
  root.userData.normalization = {
    sourceHeight: reliableTemplateSize.y,
    scale: normalizationScale,
    groundedOffsetY: model.position.y,
  };
  const skeleton = resolveSemanticSkeleton(model, profile);
  maskGeneratedRightHand(model, skeleton.rightHand, profile.id);
  return { root, model, skeleton, neutralModelY: model.position.y, targetHeight };
}

function characterSpaceMount(parent: THREE.Bone, name: string) {
  parent.updateWorldMatrix(true, false);
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

function attachWeapon(
  skeleton: SemanticSkeleton,
  definition: typeof HERO_V5R_WEAPON | typeof ENEMY_V5R_WEAPON,
  grip: GripProfileDefinition,
) {
  const weapon = createWeaponInstance(definition);
  const mount = characterSpaceMount(skeleton.rightHand, `${definition.id}-mount`);
  weapon.root.quaternion.copy(weaponOrientationQuaternion(grip.weaponOrientation));
  weapon.root.position
    .set(...grip.primaryGripOffsetInWeaponSpace)
    .applyQuaternion(weapon.root.quaternion);
  mount.add(weapon.root);
  return { mount, weapon };
}

function semanticLandmarks(skeleton: SemanticSkeleton, weapon: WeaponInstance) {
  return new Map<string, THREE.Object3D>([
    ["root", skeleton.root],
    ["hips", skeleton.hips],
    ["spine", skeleton.spine],
    ["chest", skeleton.chest],
    ["neck", skeleton.neck],
    ["head", skeleton.head],
    ["left-shoulder", skeleton.leftShoulder],
    ["right-shoulder", skeleton.rightShoulder],
    ["left-upper-arm", skeleton.leftUpperArm],
    ["right-upper-arm", skeleton.rightUpperArm],
    ["left-forearm", skeleton.leftForearm],
    ["right-forearm", skeleton.rightForearm],
    ["left-upper-leg", skeleton.leftUpperLeg],
    ["right-upper-leg", skeleton.rightUpperLeg],
    ["left-lower-leg", skeleton.leftLowerLeg],
    ["right-lower-leg", skeleton.rightLowerLeg],
    ["left-shin", skeleton.leftLowerLeg],
    ["right-shin", skeleton.rightLowerLeg],
    ["left-foot", skeleton.leftFoot],
    ["right-foot", skeleton.rightFoot],
    ["left-palm", skeleton.leftHand],
    ["right-palm", skeleton.rightHand],
    ...Array.from(weapon.landmarks.entries()).map(([name, object]) => [`weapon-${name}`, object] as const),
  ]);
}

function attachGripGauntlet(weapon: WeaponInstance, role: "hero" | "enemy") {
  const group = new THREE.Group();
  group.name = `${role}-v5r-modular-grip-gauntlet`;
  group.userData.presentationAttachment = "primary-grip-gauntlet";
  const width = weapon.gripRadius * (role === "hero" ? 2.9 : 3.15);
  const length = Math.min(weapon.gripLength * 0.52, role === "hero" ? 0.19 : 0.22);
  const depth = weapon.gripRadius * (role === "hero" ? 2.35 : 2.55);
  const material = new THREE.MeshStandardMaterial({
    name: `${role}-v5r-grip-gauntlet-material`,
    color: role === "hero" ? 0x11191c : 0x20292d,
    emissive: role === "hero" ? 0x071317 : 0x180805,
    emissiveIntensity: 0.34,
    roughness: role === "hero" ? 0.46 : 0.38,
    metalness: role === "hero" ? 0.44 : 0.72,
  });
  const palm = new THREE.Mesh(
    new THREE.CapsuleGeometry(depth * 0.43, Math.max(0.02, length - depth * 0.86), 7, 12),
    material,
  );
  palm.name = `${role}-v5r-grip-gauntlet-palm`;
  // The shell sits behind the handle in weapon space. The handle remains
  // visible through the curled fingers instead of piercing a solid fist.
  palm.position.set(0, -length * 0.08, depth * 0.24);
  palm.scale.set(width / depth, 1, 0.92);
  palm.castShadow = true;

  const cuff = new THREE.Mesh(
    new THREE.CylinderGeometry(width * 0.47, width * 0.56, length * 0.48, 10),
    material,
  );
  cuff.name = `${role}-v5r-grip-gauntlet-cuff`;
  cuff.position.set(0, -length * 0.72, depth * 0.12);
  cuff.scale.z = 0.82;
  cuff.castShadow = true;

  group.add(palm, cuff);
  const fingerMaterial = material.clone();
  fingerMaterial.name = `${role}-v5r-grip-gauntlet-finger-material`;
  fingerMaterial.color.offsetHSL(0, 0, 0.045);
  const backPlate = new THREE.Mesh(
    new RoundedBoxGeometry(width * 0.8, length * 0.58, depth * 0.16, 3, depth * 0.045),
    fingerMaterial,
  );
  backPlate.name = `${role}-v5r-grip-gauntlet-back-plate`;
  backPlate.position.set(0, -length * 0.04, depth * 0.56);
  backPlate.castShadow = true;
  group.add(backPlate);
  for (let index = 0; index < 4; index += 1) {
    const finger = new THREE.Mesh(
      new THREE.TorusGeometry(
        weapon.gripRadius * 1.03,
        weapon.gripRadius * 0.29,
        6,
        12,
        Math.PI * 1.48,
      ),
      fingerMaterial,
    );
    finger.name = `${role}-v5r-grip-gauntlet-finger-${index + 1}`;
    finger.rotation.set(Math.PI * 0.5, Math.PI * 0.08, Math.PI * 0.18);
    finger.position.set(
      -weapon.gripRadius * 0.08,
      THREE.MathUtils.lerp(-length * 0.34, length * 0.3, index / 3),
      -weapon.gripRadius * 0.04,
    );
    finger.castShadow = true;
    group.add(finger);
  }
  const thumb = new THREE.Mesh(
    new THREE.CapsuleGeometry(weapon.gripRadius * 0.3, width * 0.58, 5, 10),
    fingerMaterial,
  );
  thumb.name = `${role}-v5r-grip-gauntlet-thumb`;
  thumb.rotation.set(Math.PI * 0.47, 0, -Math.PI * 0.34);
  thumb.position.set(width * 0.23, length * 0.16, -depth * 0.17);
  thumb.castShadow = true;
  group.add(thumb);
  weapon.root.add(group);

  // The generated hand triangles are replaced because their Tripo weights
  // spike under wrist rotation. Keep a second, open presentation state for
  // unarmed rig/model inspection; production combat shows the closed grip.
  const openHand = new THREE.Group();
  openHand.name = `${role}-v5r-modular-open-hand`;
  openHand.userData.presentationAttachment = "open-hand";
  openHand.visible = false;
  const openPalm = new THREE.Mesh(
    new RoundedBoxGeometry(width * 0.78, length * 0.76, depth * 0.58, 3, depth * 0.12),
    material,
  );
  openPalm.position.set(0, length * 0.08, depth * 0.2);
  openPalm.castShadow = true;
  openHand.add(openPalm);
  for (let index = 0; index < 4; index += 1) {
    const fingerRadius = width * 0.072;
    const finger = new THREE.Mesh(
      new THREE.CapsuleGeometry(fingerRadius, length * (0.38 - index * 0.018), 4, 8),
      fingerMaterial,
    );
    finger.position.set(
      THREE.MathUtils.lerp(-width * 0.28, width * 0.28, index / 3),
      length * 0.59,
      depth * 0.19,
    );
    finger.castShadow = true;
    openHand.add(finger);
  }
  const openThumb = new THREE.Mesh(
    new THREE.CapsuleGeometry(width * 0.082, length * 0.31, 4, 8),
    fingerMaterial,
  );
  openThumb.rotation.z = Math.PI * 0.28;
  openThumb.position.set(width * 0.47, length * 0.2, depth * 0.16);
  openThumb.castShadow = true;
  openHand.add(openThumb);
  weapon.root.add(openHand);
  return group;
}

function createEnemyCutSeam(root: THREE.Group, targetHeight: number) {
  const material = new THREE.MeshStandardMaterial({
    name: "enemy-v5r-cut-seam-material",
    color: 0x5c0008,
    emissive: 0xff1b0b,
    emissiveIntensity: 0,
    roughness: 0.28,
    metalness: 0.08,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const seam = new THREE.Mesh(new THREE.TorusGeometry(targetHeight * 0.125, 0.012, 6, 28), material);
  seam.name = "enemy-v5r-cut-seam";
  seam.position.y = targetHeight * 0.515;
  seam.rotation.x = Math.PI * 0.5;
  seam.rotation.z = -0.12;
  seam.scale.z = 0.64;
  seam.visible = false;
  seam.renderOrder = 8;
  root.add(seam);
  return {
    setVisible(visible: boolean) {
      seam.visible = visible;
    },
    setHeat(amount: number) {
      const heat = THREE.MathUtils.clamp(amount, 0, 1);
      material.emissiveIntensity = heat * 5.2;
      material.opacity = heat * 0.94;
    },
    dispose() {
      seam.geometry.dispose();
      material.dispose();
      seam.removeFromParent();
    },
  };
}

function rotateBoneInCharacterSpace(bone: THREE.Bone, axis: THREE.Vector3, angle: number) {
  if (Math.abs(angle) < 0.000001) return;
  const parentQuaternion = new THREE.Quaternion();
  bone.parent?.getWorldQuaternion(parentQuaternion);
  const localAxis = axis.clone().applyQuaternion(parentQuaternion.invert()).normalize();
  bone.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(localAxis, angle)).normalize();
}

function rotateBoneToward(
  root: THREE.Object3D,
  bone: THREE.Bone,
  endpoint: THREE.Bone,
  target: THREE.Vector3,
  weight: number,
  maximumAngle: number,
) {
  root.updateWorldMatrix(true, true);
  const pivot = new THREE.Vector3();
  const currentEnd = new THREE.Vector3();
  bone.getWorldPosition(pivot);
  endpoint.getWorldPosition(currentEnd);
  const from = currentEnd.sub(pivot);
  const to = target.clone().sub(pivot);
  if (from.lengthSq() < 0.000001 || to.lengthSq() < 0.000001) return;
  from.normalize();
  to.normalize();
  const dot = THREE.MathUtils.clamp(from.dot(to), -1, 1);
  const angle = Math.min(maximumAngle, Math.acos(dot)) * weight;
  if (angle < 0.00001) return;
  const axis = from.cross(to);
  if (axis.lengthSq() < 0.000001) return;
  axis.normalize();
  const worldDelta = new THREE.Quaternion().setFromAxisAngle(axis, angle);
  const parentWorld = new THREE.Quaternion();
  const currentWorld = new THREE.Quaternion();
  bone.parent?.getWorldQuaternion(parentWorld);
  bone.getWorldQuaternion(currentWorld);
  const desiredLocal = parentWorld.invert().multiply(worldDelta.multiply(currentWorld));
  bone.quaternion.slerp(desiredLocal, weight).normalize();
}

function signedAngleAroundAxis(
  from: THREE.Vector3,
  to: THREE.Vector3,
  axis: THREE.Vector3,
) {
  const projectedFrom = from.clone().addScaledVector(axis, -from.dot(axis));
  const projectedTo = to.clone().addScaledVector(axis, -to.dot(axis));
  if (projectedFrom.lengthSq() < 0.000001 || projectedTo.lengthSq() < 0.000001) return 0;
  projectedFrom.normalize();
  projectedTo.normalize();
  return Math.atan2(
    axis.dot(projectedFrom.clone().cross(projectedTo)),
    THREE.MathUtils.clamp(projectedFrom.dot(projectedTo), -1, 1),
  );
}

function rotateBoneTowardAroundAxis(
  root: THREE.Object3D,
  bone: THREE.Bone,
  endpoint: THREE.Bone,
  target: THREE.Vector3,
  hingeAxis: THREE.Vector3,
  weight: number,
  maximumAngle: number,
) {
  root.updateWorldMatrix(true, true);
  const pivot = bone.getWorldPosition(new THREE.Vector3());
  const from = endpoint.getWorldPosition(new THREE.Vector3()).sub(pivot);
  const to = target.clone().sub(pivot);
  if (from.lengthSq() < 0.000001 || to.lengthSq() < 0.000001) return;
  const axis = hingeAxis.clone().normalize();
  const angle = THREE.MathUtils.clamp(
    signedAngleAroundAxis(from, to, axis),
    -maximumAngle,
    maximumAngle,
  ) * weight;
  rotateBoneInCharacterSpace(bone, axis, angle);
}

function fingerChains(roots: readonly THREE.Bone[]) {
  return roots.map((root) => {
    const bones: THREE.Bone[] = [];
    let current: THREE.Bone | undefined = root;
    while (current) {
      bones.push(current);
      current = current.children.find((child): child is THREE.Bone => child instanceof THREE.Bone);
    }
    return bones;
  });
}

function createPostAnimationDriver(
  prepared: PreparedCharacter,
  profile: SkeletonProfileDefinition,
  mount: THREE.Group,
  weapon: WeaponInstance,
  grip: GripProfileDefinition,
  role: "hero" | "enemy",
): ProceduralAnimationDriver {
  const { root, model, skeleton, neutralModelY, targetHeight } = prepared;
  const resolvedFingers = resolveFingerRoots(model, profile);
  const leftFingerChains = fingerChains(resolvedFingers.left);
  const rightFingerChains = fingerChains(resolvedFingers.right);
  const leftFingerBones = leftFingerChains.flat();
  const rightFingerBones = rightFingerChains.flat();
  const fingerRests = new Map([...leftFingerBones, ...rightFingerBones].map((bone) => [bone, bone.quaternion.clone()]));
  const fingerScaleRests = new Map([...leftFingerBones, ...rightFingerBones].map((bone) => [bone, bone.scale.clone()]));
  const rightHandScaleRest = skeleton.rightHand.scale.clone();
  const secondaryGrip = weapon.landmarks.get("secondary-grip") ?? null;
  const guardCenter = weapon.landmarks.get("guard-center") ?? weapon.root;
  const weaponTargetQuaternion = weapon.root.quaternion.clone();
  const weaponTargetPosition = weapon.root.position.clone();
  const mountParentWorldQuaternion = new THREE.Quaternion();
  const rootWorldQuaternion = new THREE.Quaternion();
  const mountParentWorldScale = new THREE.Vector3();
  const rootWorldScale = new THREE.Vector3();
  root.updateWorldMatrix(true, true);
  const rootWorldY = new THREE.Vector3();
  const leftSolePosition = new THREE.Vector3();
  const rightSolePosition = new THREE.Vector3();
  root.getWorldPosition(rootWorldY);
  const createSoleContact = (foot: THREE.Bone, name: string) => {
    const footWorld = foot.getWorldPosition(new THREE.Vector3());
    const marker = new THREE.Group();
    marker.name = name;
    marker.userData.presentationLandmark = "sole-contact";
    marker.position.copy(foot.worldToLocal(new THREE.Vector3(footWorld.x, rootWorldY.y, footWorld.z)));
    foot.add(marker);
    return marker;
  };
  const leftSoleContact = createSoleContact(skeleton.leftFoot, `${role}-left-sole-contact`);
  const rightSoleContact = createSoleContact(skeleton.rightFoot, `${role}-right-sole-contact`);
  // Asset-specific contact metadata. Generated shoe geometry does not have a
  // rigid sole plane, so each authored contact clip carries a small calibrated
  // vertical correction. Transit clips intentionally omit correction.
  const groundingCorrections: Readonly<Record<string, number>> = role === "hero"
    ? {
        idle: 0.00405,
        "idle:turn": 0.01084,
        "idle:focus-activate": 0.0062,
        "idle:focus-selection": 0.00577,
        anticipation: 0.00274,
        arrival: -0.00267,
        recovery: 0.00402,
        hit: -0.00318,
        death: -0.00318,
      }
    : {
        idle: 0.00946,
        "idle:turn": 0.00756,
        anticipation: 0.00946,
        action: 0.00502,
        "action:threat": 0.00946,
        "action:attack": 0.01198,
        arrival: 0.01082,
        recovery: 0.01082,
        hit: 0.00946,
        "hit:right": 0.00946,
        "hit:cut-hold": 0.00946,
        death: 0.00946,
        "death:fall": 0.01837,
      };
  let groundedModelY = neutralModelY;

  function stabilizeWeaponMount() {
    root.updateWorldMatrix(true, true);
    skeleton.rightHand.getWorldQuaternion(mountParentWorldQuaternion);
    root.getWorldQuaternion(rootWorldQuaternion);
    skeleton.rightHand.getWorldScale(mountParentWorldScale);
    root.getWorldScale(rootWorldScale);
    mount.quaternion.copy(
      mountParentWorldQuaternion
        .invert()
        .multiply(rootWorldQuaternion),
    );
    mount.scale.set(
      rootWorldScale.x / Math.max(0.0001, mountParentWorldScale.x),
      rootWorldScale.y / Math.max(0.0001, mountParentWorldScale.y),
      rootWorldScale.z / Math.max(0.0001, mountParentWorldScale.z),
    );
    mount.updateWorldMatrix(true, true);
  }

  function applyFingerCurl(bones: readonly THREE.Bone[], amount: number) {
    bones.forEach((bone, index) => {
      const rest = fingerRests.get(bone);
      if (!rest) return;
      bone.quaternion.copy(rest);
      rotateBoneInCharacterSpace(bone, new THREE.Vector3(1, 0, 0), amount * (index % 4 === 0 ? 0.72 : 0.48));
    });
  }

  function applyPrimaryGrip() {
    rightFingerBones.forEach((bone) => {
      const rest = fingerRests.get(bone);
      if (rest) bone.quaternion.copy(rest);
      const scaleRest = fingerScaleRests.get(bone);
      if (scaleRest) bone.scale.copy(scaleRest);
    });
    root.updateWorldMatrix(true, true);
    const littleFingerRoot = rightFingerChains[0]?.[0];
    const middleFingerRoot = rightFingerChains[Math.min(2, rightFingerChains.length - 1)]?.[0];
    const indexFingerRoot = rightFingerChains[Math.min(3, rightFingerChains.length - 1)]?.[0];
    if (!littleFingerRoot || !middleFingerRoot || !indexFingerRoot) return;
    const wrist = skeleton.rightHand.getWorldPosition(new THREE.Vector3());
    const middle = middleFingerRoot.getWorldPosition(new THREE.Vector3());
    const little = littleFingerRoot.getWorldPosition(new THREE.Vector3());
    const index = indexFingerRoot.getWorldPosition(new THREE.Vector3());
    const palmAxis = middle.sub(wrist).normalize();
    const acrossPalm = index.sub(little).normalize();
    rightFingerChains.forEach((chain, fingerIndex) => {
      const endpoint = chain.at(-1);
      if (!endpoint) return;
      const isThumb = fingerIndex === rightFingerChains.length - 1;
      const grippingFingerCount = Math.max(1, rightFingerChains.length - 1);
      const fingerPhase = grippingFingerCount <= 1 ? 0.5 : fingerIndex / (grippingFingerCount - 1);
      const target = new THREE.Vector3(
        isThumb ? weapon.gripRadius * 0.18 : -weapon.gripRadius * 0.1,
        isThumb
          ? weapon.gripLength * 0.08
          : THREE.MathUtils.lerp(-weapon.gripLength * 0.18, weapon.gripLength * 0.12, fingerPhase),
        isThumb ? -weapon.gripRadius * 0.78 : weapon.gripRadius * 0.76,
      );
      weapon.root.localToWorld(target);
      for (let iteration = 0; iteration < 2; iteration += 1) {
        for (let jointIndex = chain.length - 2; jointIndex >= 0; jointIndex -= 1) {
          const bone = chain[jointIndex];
          if (!bone) continue;
          rotateBoneTowardAroundAxis(
            root,
            bone,
            endpoint,
            target,
            isThumb && jointIndex === 0 ? palmAxis : acrossPalm,
            isThumb ? 0.58 : 0.76,
            isThumb ? 0.82 : jointIndex === 0 ? 0.72 : 1.02,
          );
        }
      }
      chain.forEach((bone, segmentIndex) => {
        const scaleRest = fingerScaleRests.get(bone);
        if (!scaleRest) return;
        const compact = isThumb
          ? THREE.MathUtils.lerp(0.15, 0.025, segmentIndex / Math.max(1, chain.length - 1))
          : THREE.MathUtils.lerp(0.12, 0.018, segmentIndex / Math.max(1, chain.length - 1));
        bone.scale.copy(scaleRest).multiplyScalar(compact);
      });
    });
  }

  function applySecondaryGrip(frame: CharacterAnimationFrame) {
    if (!secondaryGrip || !grip.secondaryHand || frame.variant === "focus-selection") return;
    root.updateWorldMatrix(true, true);
    const target = new THREE.Vector3();
    const shoulder = new THREE.Vector3();
    secondaryGrip.getWorldPosition(target);
    skeleton.leftUpperArm.getWorldPosition(shoulder);
    const maximumReach = targetHeight * grip.secondaryMaxReachRatio;
    if (target.distanceTo(shoulder) > maximumReach * 1.9) return;
    const stateWeight = frame.activeState === "action" || frame.activeState === "arrival" ? 0.56 : 1;
    const weight = grip.secondaryIkWeight * stateWeight;
    for (let iteration = 0; iteration < 2; iteration += 1) {
      rotateBoneToward(root, skeleton.leftForearm, skeleton.leftHand, target, weight, grip.secondaryMaxRotationRadians * 0.7);
      rotateBoneToward(root, skeleton.leftUpperArm, skeleton.leftHand, target, weight, grip.secondaryMaxRotationRadians);
    }
  }

  function updateGrounding(frame: CharacterAnimationFrame) {
    root.updateWorldMatrix(true, true);
    root.getWorldPosition(rootWorldY);
    leftSoleContact.getWorldPosition(leftSolePosition);
    rightSoleContact.getWorldPosition(rightSolePosition);
    const leftSole = leftSolePosition.y - rootWorldY.y;
    const rightSole = rightSolePosition.y - rootWorldY.y;
    const error = -Math.min(leftSole, rightSole);
    const stateKey = frame.variant ? `${frame.activeState}:${frame.variant}` : frame.activeState;
    const correction = groundingCorrections[stateKey]
      ?? groundingCorrections[frame.activeState]
      ?? 0;
    const unboundedTargetY = model.position.y + error + targetHeight * correction;
    const targetY = THREE.MathUtils.clamp(
      unboundedTargetY,
      // Hero low stances need enough range to compensate the generated shoe
      // volume. The correction table above remains the authoritative limit;
      // this clamp only catches malformed animation data.
      neutralModelY - targetHeight * 0.05,
      neutralModelY + targetHeight * 0.04,
    );
    root.userData.groundingCalibration = {
      stateKey,
      correction,
      neutralModelY,
      currentModelY: model.position.y,
      leftSole,
      rightSole,
      unboundedTargetY,
      targetY,
    };
    groundedModelY = THREE.MathUtils.damp(groundedModelY, targetY, 26, frame.deltaSeconds);
    model.position.y = groundedModelY;
  }

  function updateWeaponPose(frame: CharacterAnimationFrame) {
    const stateKey = frame.variant ? `${frame.activeState}:${frame.variant}` : frame.activeState;
    const orientation = grip.stateWeaponOrientations?.[stateKey]
      ?? grip.stateWeaponOrientations?.[frame.activeState]
      ?? grip.weaponOrientation;
    weaponOrientationQuaternion(orientation, weaponTargetQuaternion);
    weaponTargetPosition
      .set(...grip.primaryGripOffsetInWeaponSpace)
      .applyQuaternion(weaponTargetQuaternion);
    const blend = 1 - Math.exp(-30 * Math.max(0, frame.deltaSeconds));
    weapon.root.quaternion.slerp(weaponTargetQuaternion, blend);
    weapon.root.position.lerp(weaponTargetPosition, blend);
  }

  function alignPrimaryHandToHandle() {
    const middleFingerRoot = rightFingerChains[Math.min(2, rightFingerChains.length - 1)]?.[0];
    const littleFingerRoot = rightFingerChains[0]?.[0];
    const indexFingerRoot = rightFingerChains[Math.min(3, rightFingerChains.length - 1)]?.[0];
    if (!middleFingerRoot || !littleFingerRoot || !indexFingerRoot) return;
    root.updateWorldMatrix(true, true);
    const guardTarget = new THREE.Vector3();
    guardCenter.getWorldPosition(guardTarget);
    rotateBoneToward(root, skeleton.rightHand, middleFingerRoot, guardTarget, 1, 1.35);

    root.updateWorldMatrix(true, true);
    const wrist = skeleton.rightHand.getWorldPosition(new THREE.Vector3());
    const middle = middleFingerRoot.getWorldPosition(new THREE.Vector3());
    const little = littleFingerRoot.getWorldPosition(new THREE.Vector3());
    const index = indexFingerRoot.getWorldPosition(new THREE.Vector3());
    const gripAxis = guardTarget.clone().sub(wrist).normalize();
    const palmAxis = middle.sub(wrist).normalize();
    const acrossPalm = index.sub(little).normalize();
    const palmNormal = palmAxis.clone().cross(acrossPalm).normalize();
    const bladeFaceNormal = new THREE.Vector3(0, 0, -1).transformDirection(weapon.root.matrixWorld);
    const roll = THREE.MathUtils.clamp(
      signedAngleAroundAxis(palmNormal, bladeFaceNormal, gripAxis),
      -1.65,
      1.65,
    );
    rotateBoneInCharacterSpace(skeleton.rightHand, gripAxis, roll * 0.9);
  }

  return {
    update(frame) {
      root.updateWorldMatrix(true, true);
      const turn = THREE.MathUtils.clamp(frame.turn ?? 0, -1, 1);
      rotateBoneInCharacterSpace(skeleton.hips, new THREE.Vector3(0, 1, 0), turn * 0.035);
      rotateBoneInCharacterSpace(skeleton.chest, new THREE.Vector3(0, 1, 0), turn * 0.09);
      rotateBoneInCharacterSpace(skeleton.head, new THREE.Vector3(0, 1, 0), turn * 0.12);
      if (role === "enemy" && (frame.threat ?? 0) > 0 && frame.variant !== "threat") {
        rotateBoneInCharacterSpace(skeleton.chest, new THREE.Vector3(1, 0, 0), (frame.threat ?? 0) * 0.045);
      }
      applyFingerCurl(leftFingerBones, role === "hero" && frame.variant !== "focus-selection" ? -0.5 : -0.2);
      applySecondaryGrip(frame);
      // Tripo's generated hand weights produce long spikes under deep wrist
      // rotations. Collapse only the generated right-hand skin cluster and let
      // the modular grip attachment provide the visible hand. The compensated
      // mount below keeps the independently replaceable weapon at full scale.
      skeleton.rightHand.scale.copy(rightHandScaleRest).multiplyScalar(0.065);
      stabilizeWeaponMount();
      updateWeaponPose(frame);
      alignPrimaryHandToHandle();
      stabilizeWeaponMount();
      alignPrimaryHandToHandle();
      stabilizeWeaponMount();
      applyPrimaryGrip();
      updateGrounding(frame);
    },
    reset() {
      fingerRests.forEach((quaternion, bone) => bone.quaternion.copy(quaternion));
      fingerScaleRests.forEach((scale, bone) => bone.scale.copy(scale));
      skeleton.rightHand.scale.copy(rightHandScaleRest);
      groundedModelY = neutralModelY;
      model.position.y = neutralModelY;
    },
    dispose() {
      fingerRests.clear();
      fingerScaleRests.clear();
    },
  };
}

export function createHeroV5RVisual(template: THREE.Object3D): V5RCharacterVisual {
  const prepared = prepareCharacter(template, 3.3, HERO_V5R_SKELETON_PROFILE, "hero-v5r");
  const distanceLod = createCharacterDistanceLod(prepared.root, {
    id: "hero-v5r-distance-lod",
    targetHeight: 3.3,
    targetTriangleRatio: 0.42,
  });
  const { mount, weapon } = attachWeapon(prepared.skeleton, HERO_V5R_WEAPON, HERO_V5R_GRIP);
  attachGripGauntlet(weapon, "hero");
  const clips = createHeroV5RClips(prepared.skeleton);
  return {
    ...prepared,
    weaponMount: mount,
    weapon,
    landmarks: semanticLandmarks(prepared.skeleton, weapon),
    clips,
    proceduralDriver: createPostAnimationDriver(prepared, HERO_V5R_SKELETON_PROFILE, mount, weapon, HERO_V5R_GRIP, "hero"),
    distanceLod,
    animationTimeOffsetSeconds: 0,
    dispose() {
      distanceLod.dispose();
      weapon.dispose();
    },
  };
}

export function createEnemyV5RVisual(template: THREE.Object3D, variant: number): V5RCharacterVisual {
  const prepared = prepareCharacter(template, 3.157, ENEMY_V5R_SKELETON_PROFILE, "enemy-v5r");
  const distanceLod = createCharacterDistanceLod(prepared.root, {
    id: "enemy-v5r-distance-lod",
    targetHeight: 3.157,
    targetTriangleRatio: 0.4,
  });
  const { mount, weapon } = attachWeapon(prepared.skeleton, ENEMY_V5R_WEAPON, ENEMY_V5R_GRIP);
  attachGripGauntlet(weapon, "enemy");
  const clips = createEnemyV5RClips(prepared.skeleton);
  const cutSeam = createEnemyCutSeam(prepared.root, 3.157);
  return {
    ...prepared,
    weaponMount: mount,
    weapon,
    landmarks: semanticLandmarks(prepared.skeleton, weapon),
    clips,
    proceduralDriver: createPostAnimationDriver(prepared, ENEMY_V5R_SKELETON_PROFILE, mount, weapon, ENEMY_V5R_GRIP, "enemy"),
    distanceLod,
    animationTimeOffsetSeconds: variant * 0.127,
    cutSeam,
    dispose() {
      distanceLod.dispose();
      cutSeam.dispose();
      weapon.dispose();
    },
  };
}
