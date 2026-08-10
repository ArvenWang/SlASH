import * as THREE from "three";

export interface DeathModuleSet {
  head: THREE.Group;
  upperTorso: THREE.Group;
  pelvis: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
}

interface CorpsePiece {
  object: THREE.Group;
  startPosition: THREE.Vector3;
  landingPosition: THREE.Vector3;
  startQuaternion: THREE.Quaternion;
  landingQuaternion: THREE.Quaternion;
  flightDuration: number;
  arcHeight: number;
}

export interface CorpseRuntime {
  root: THREE.Group;
  age: number;
  settled: boolean;
  update(dt: number): void;
  dispose(): void;
}

const FLOOR_CLEARANCE = 0.035;
const ENEMY_CHEST_WIDTH = 1;
const cutCapGeometry = new THREE.CircleGeometry(0.46, 9);
const cutRimGeometry = new THREE.RingGeometry(0.34, 0.49, 9);
const cutCapMaterial = new THREE.MeshStandardMaterial({
  name: "corpse-deep-wet-cut-surface",
  color: 0x5a030b,
  emissive: 0x160001,
  emissiveIntensity: 0.11,
  metalness: 0.03,
  roughness: 0.2,
  side: THREE.DoubleSide,
});
const cutRimMaterial = new THREE.MeshStandardMaterial({
  name: "corpse-charred-cut-rim",
  color: 0x210104,
  emissive: 0x0d0001,
  emissiveIntensity: 0.08,
  metalness: 0.08,
  roughness: 0.44,
  side: THREE.DoubleSide,
});

function seededUnit(seed: number) {
  const value = Math.sin(seed * 91.733 + 17.171) * 43758.5453;
  return value - Math.floor(value);
}

function seededSigned(seed: number, offset: number) {
  return seededUnit(seed + offset) * 2 - 1;
}

function seededPoseSlot(seed: number) {
  return Math.abs(Math.round(seed * 100)) % 6;
}

function createAssembly(
  root: THREE.Group,
  name: string,
  members: readonly THREE.Group[],
) {
  const assembly = new THREE.Group();
  assembly.name = name;
  const pivot = new THREE.Vector3();
  members[0]?.getWorldPosition(pivot);
  assembly.position.copy(pivot);
  root.add(assembly);
  root.updateWorldMatrix(true, true);
  for (const member of members) {
    member.updateWorldMatrix(true, true);
    assembly.attach(member);
  }
  return assembly;
}

function composeWorldRotation(
  base: THREE.Quaternion,
  rotations: ReadonlyArray<readonly [THREE.Vector3, number]>,
) {
  const result = base.clone();
  const rotation = new THREE.Quaternion();
  for (const [axis, angle] of rotations) {
    rotation.setFromAxisAngle(axis, angle);
    result.premultiply(rotation);
  }
  return result.normalize();
}

function positionAssemblyByCutSurface(
  cap: THREE.Mesh,
  desiredCutPosition: THREE.Vector3,
  rotation: THREE.Quaternion,
) {
  const capOffset = cap.position.clone().applyQuaternion(rotation);
  return desiredCutPosition.clone().sub(capOffset);
}

function placeAssemblyOnFloor(
  root: THREE.Group,
  object: THREE.Group,
  targetPosition: THREE.Vector3,
  targetQuaternion: THREE.Quaternion,
) {
  const savedPosition = object.position.clone();
  const savedQuaternion = object.quaternion.clone();
  object.position.copy(targetPosition);
  object.quaternion.copy(targetQuaternion);
  root.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3().setFromObject(object);
  targetPosition.y += FLOOR_CLEARANCE - bounds.min.y;
  object.position.copy(savedPosition);
  object.quaternion.copy(savedQuaternion);
  root.updateWorldMatrix(true, true);
}

function projectionInterval(object: THREE.Group, axis: THREE.Vector3) {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  const point = new THREE.Vector3();
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const positions = child.geometry.getAttribute("position");
    if (!(positions instanceof THREE.BufferAttribute)) return;
    for (let index = 0; index < positions.count; index += 1) {
      point.fromBufferAttribute(positions, index).applyMatrix4(child.matrixWorld);
      const projection = point.dot(axis);
      min = Math.min(min, projection);
      max = Math.max(max, projection);
    }
  });
  return { min, max };
}

function fitAuthoredNegativeSpace(
  root: THREE.Group,
  upper: THREE.Group,
  lower: THREE.Group,
  upperPosition: THREE.Vector3,
  lowerPosition: THREE.Vector3,
  upperQuaternion: THREE.Quaternion,
  lowerQuaternion: THREE.Quaternion,
  targetGap: number,
) {
  const savedUpperPosition = upper.position.clone();
  const savedLowerPosition = lower.position.clone();
  const savedUpperQuaternion = upper.quaternion.clone();
  const savedLowerQuaternion = lower.quaternion.clone();
  const axis = upperPosition.clone().sub(lowerPosition).setY(0).normalize();

  upper.position.copy(upperPosition);
  upper.quaternion.copy(upperQuaternion);
  lower.position.copy(lowerPosition);
  lower.quaternion.copy(lowerQuaternion);
  root.updateWorldMatrix(true, true);

  const upperInterval = projectionInterval(upper, axis);
  const lowerInterval = projectionInterval(lower, axis);
  const currentGap = upperInterval.min - lowerInterval.max;
  const correction = (targetGap - currentGap) * 0.5;
  upperPosition.addScaledVector(axis, correction);
  lowerPosition.addScaledVector(axis, -correction);

  upper.position.copy(savedUpperPosition);
  upper.quaternion.copy(savedUpperQuaternion);
  lower.position.copy(savedLowerPosition);
  lower.quaternion.copy(savedLowerQuaternion);
  root.updateWorldMatrix(true, true);
  return targetGap;
}

function cutSurfaceWorldPosition(
  cap: THREE.Mesh,
  assemblyPosition: THREE.Vector3,
  assemblyQuaternion: THREE.Quaternion,
) {
  return cap.position.clone().applyQuaternion(assemblyQuaternion).add(assemblyPosition);
}

function lowerSemanticLongAxis(
  root: THREE.Group,
  lowerAssembly: THREE.Group,
  lowerCap: THREE.Mesh,
) {
  root.updateWorldMatrix(true, true);
  const leftFoot = lowerAssembly.getObjectByName("left-foot");
  const rightFoot = lowerAssembly.getObjectByName("right-foot");
  const footCenter = new THREE.Vector3();
  let footCount = 0;
  for (const foot of [leftFoot, rightFoot]) {
    if (!foot) continue;
    const footPosition = new THREE.Vector3();
    foot.getWorldPosition(footPosition);
    footCenter.add(lowerAssembly.worldToLocal(footPosition));
    footCount += 1;
  }
  if (footCount === 0) return new THREE.Vector3(0, -1, 0);
  footCenter.multiplyScalar(1 / footCount);
  return footCenter.sub(lowerCap.position).normalize();
}

type LandingFamily = 0 | 1 | 2 | 3;

const LANDING_FAMILY_NAMES = [
  "shoulder-slide",
  "opposed-shoulder-roll",
  "supine-open",
  "prone-collapse",
] as const;

function localPositionOf(assembly: THREE.Group, object: THREE.Object3D) {
  const worldPosition = new THREE.Vector3();
  object.getWorldPosition(worldPosition);
  return assembly.worldToLocal(worldPosition);
}

function orthogonalizedFront(longAxis: THREE.Vector3, frontHint: THREE.Vector3) {
  const front = frontHint.clone().addScaledVector(longAxis, -frontHint.dot(longAxis));
  if (front.lengthSq() < 0.0001) {
    front.set(0, 0, 1).addScaledVector(longAxis, -longAxis.z);
  }
  return front.normalize();
}

function upperSemanticBasis(
  root: THREE.Group,
  upperAssembly: THREE.Group,
  upperCap: THREE.Mesh,
) {
  root.updateWorldMatrix(true, true);
  const head = upperAssembly.getObjectByName("head");
  const leftShoulder = upperAssembly.getObjectByName("left-shoulder");
  const rightShoulder = upperAssembly.getObjectByName("right-shoulder");
  if (!head || !leftShoulder || !rightShoulder) {
    return {
      long: new THREE.Vector3(0, 1, 0),
      lateral: new THREE.Vector3(1, 0, 0),
      front: new THREE.Vector3(0, 0, 1),
    };
  }
  const long = localPositionOf(upperAssembly, head).sub(upperCap.position).normalize();
  const lateralHint = localPositionOf(upperAssembly, leftShoulder)
    .sub(localPositionOf(upperAssembly, rightShoulder));
  const lateral = lateralHint.addScaledVector(long, -lateralHint.dot(long)).normalize();
  const front = lateral.clone().cross(long).normalize();
  lateral.copy(long).cross(front).normalize();
  return { long, lateral, front };
}

function basisMappingQuaternion(
  localLong: THREE.Vector3,
  localFront: THREE.Vector3,
  targetLong: THREE.Vector3,
  targetFront: THREE.Vector3,
) {
  const localFrontOrtho = orthogonalizedFront(localLong, localFront);
  const localLateral = localLong.clone().cross(localFrontOrtho).normalize();
  const targetFrontOrtho = orthogonalizedFront(targetLong, targetFront);
  const targetLateral = targetLong.clone().cross(targetFrontOrtho).normalize();
  const localMatrix = new THREE.Matrix4().makeBasis(localLateral, localLong, localFrontOrtho);
  const targetMatrix = new THREE.Matrix4().makeBasis(targetLateral, targetLong, targetFrontOrtho);
  const localQuaternion = new THREE.Quaternion().setFromRotationMatrix(localMatrix);
  const targetQuaternion = new THREE.Quaternion().setFromRotationMatrix(targetMatrix);
  return targetQuaternion.multiply(localQuaternion.invert()).normalize();
}

interface UpperFamilyPose {
  quaternion: THREE.Quaternion;
  semanticAxisLocal: THREE.Vector3;
  semanticAxisWorld: THREE.Vector3;
  frontAxisWorld: THREE.Vector3;
  verticalSpan: number;
  longSpan: number;
  heightToLongSpan: number;
}

function chooseUpperFamilyPose(
  root: THREE.Group,
  upperAssembly: THREE.Group,
  upperCap: THREE.Mesh,
  family: LandingFamily,
): UpperFamilyPose {
  const savedQuaternion = upperAssembly.quaternion.clone();
  const basis = upperSemanticBasis(root, upperAssembly, upperCap);
  const worldUp = new THREE.Vector3(0, 1, 0);
  const screenHorizontal = new THREE.Vector3(0.826, 0, -0.563).normalize();
  const familyYaw = [-0.52, -0.18, 0.2, 0.55] as const;
  const yaw = new THREE.Quaternion().setFromAxisAngle(worldUp, familyYaw[family]);
  const targetLong = screenHorizontal.applyQuaternion(yaw).normalize();
  const groundNormal = new THREE.Vector3().crossVectors(worldUp, targetLong).normalize();
  const targetFront = family === 0
    ? groundNormal.multiplyScalar(0.72).addScaledVector(worldUp, 0.69).normalize()
    : family === 1
      ? groundNormal.multiplyScalar(-0.72).addScaledVector(worldUp, -0.69).normalize()
      : family === 2
        ? worldUp.clone()
        : worldUp.clone().multiplyScalar(-1);
  const quaternion = basisMappingQuaternion(basis.long, basis.front, targetLong, targetFront);

  upperAssembly.quaternion.copy(quaternion);
  root.updateWorldMatrix(true, true);
  const vertical = projectionInterval(upperAssembly, worldUp);
  const longitudinal = projectionInterval(upperAssembly, targetLong);
  const verticalSpan = vertical.max - vertical.min;
  const longSpan = longitudinal.max - longitudinal.min;
  upperAssembly.quaternion.copy(savedQuaternion);
  root.updateWorldMatrix(true, true);

  return {
    quaternion,
    semanticAxisLocal: basis.long,
    semanticAxisWorld: basis.long.clone().applyQuaternion(quaternion).normalize(),
    frontAxisWorld: basis.front.clone().applyQuaternion(quaternion).normalize(),
    verticalSpan,
    longSpan,
    heightToLongSpan: verticalSpan / Math.max(0.001, longSpan),
  };
}

function lowerSemanticFront(
  root: THREE.Group,
  lowerAssembly: THREE.Group,
  semanticLong: THREE.Vector3,
) {
  root.updateWorldMatrix(true, true);
  const pelvis = lowerAssembly.getObjectByName("death-module-pelvis");
  if (!pelvis) return orthogonalizedFront(semanticLong, new THREE.Vector3(0, 0, 1));
  const worldQuaternion = new THREE.Quaternion();
  pelvis.getWorldQuaternion(worldQuaternion);
  const frontWorld = new THREE.Vector3(0, 0, 1).applyQuaternion(worldQuaternion);
  const assemblyInverse = new THREE.Quaternion();
  lowerAssembly.getWorldQuaternion(assemblyInverse);
  assemblyInverse.invert();
  return orthogonalizedFront(semanticLong, frontWorld.applyQuaternion(assemblyInverse));
}

interface GroundedLowerPose {
  quaternion: THREE.Quaternion;
  semanticAxisLocal: THREE.Vector3;
  semanticAxisWorld: THREE.Vector3;
  verticalSpan: number;
  longSpan: number;
  heightToLongSpan: number;
  screenYawDegrees: number;
  rollDegrees: number;
  cutNormalVerticalComponent: number;
  frontVerticalComponent: number;
  familyAlignment: number;
}

function chooseGroundedLowerPose(
  root: THREE.Group,
  lowerAssembly: THREE.Group,
  lowerCap: THREE.Mesh,
  seed: number,
  family: LandingFamily,
): GroundedLowerPose {
  const savedQuaternion = lowerAssembly.quaternion.clone();
  const semanticAxisLocal = lowerSemanticLongAxis(root, lowerAssembly, lowerCap);
  const semanticFrontLocal = lowerSemanticFront(root, lowerAssembly, semanticAxisLocal);
  // This is the fixed gameplay camera's right vector projected onto the floor.
  // Keeping the leg axis near this direction prevents camera foreshortening from
  // turning a genuinely horizontal body into a compact, kneeling silhouette.
  const screenHorizontal = new THREE.Vector3(0.826, 0, -0.563).normalize();
  const worldUp = new THREE.Vector3(0, 1, 0);
  // Six camera-readable yaw sectors keep a multi-kill row from looking stamped
  // out. The slot is derived solely from the existing deterministic seed.
  const yawFan = [-0.44, -0.27, -0.1, 0.1, 0.27, 0.44] as const;
  const poseSlot = seededPoseSlot(seed);
  const yawVariation = yawFan[poseSlot];
  const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yawVariation);
  const targetAxis = screenHorizontal.applyQuaternion(yaw).normalize();
  // The two shoulder-led upper families deliberately pair with opposing flat
  // leg landings. This creates four stable whole-corpse grammars without using
  // a tall lower-body side pose that could regress into the kneeling read.
  const targetFront = family === 0 || family === 3
    ? worldUp.clone().multiplyScalar(-1)
    : worldUp.clone();
  const alignment = new THREE.Quaternion().setFromUnitVectors(semanticAxisLocal, targetAxis);
  const roll = new THREE.Quaternion();
  const candidate = new THREE.Quaternion();
  const rollOffset = seededUnit(seed + 11.83) * (Math.PI / 12);
  const candidates: Array<{
    quaternion: THREE.Quaternion;
    verticalSpan: number;
    longSpan: number;
    ratio: number;
    rollRadians: number;
    familyAlignment: number;
  }> = [];

  // Mapping pelvis-to-feet onto the floor leaves one rotational degree of
  // freedom. Evaluate twelve side/back landing candidates against the actual
  // rendered vertices and select the thinnest grounded silhouette.
  for (let index = 0; index < 12; index += 1) {
    roll.setFromAxisAngle(targetAxis, rollOffset + index * (Math.PI / 6));
    candidate.copy(alignment).premultiply(roll).normalize();
    lowerAssembly.quaternion.copy(candidate);
    root.updateWorldMatrix(true, true);
    const vertical = projectionInterval(lowerAssembly, worldUp);
    const longitudinal = projectionInterval(lowerAssembly, targetAxis);
    const verticalSpan = vertical.max - vertical.min;
    const longSpan = longitudinal.max - longitudinal.min;
    const ratio = verticalSpan / Math.max(0.001, longSpan);
    const frontWorld = semanticFrontLocal.clone().applyQuaternion(candidate).normalize();
    candidates.push({
      quaternion: candidate.clone(),
      verticalSpan,
      longSpan,
      ratio,
      rollRadians: rollOffset + index * (Math.PI / 6),
      familyAlignment: frontWorld.dot(targetFront),
    });
  }

  candidates.sort((a, b) => a.ratio - b.ratio);
  const bestCandidate = candidates[0]!;
  const acceptableRatio = 0.44;
  const groundedCandidates = candidates.filter((entry) => entry.ratio <= acceptableRatio);
  groundedCandidates.sort((a, b) => {
    const alignmentDifference = b.familyAlignment - a.familyAlignment;
    if (Math.abs(alignmentDifference) > 0.02) return alignmentDifference;
    return a.ratio - b.ratio;
  });
  const selected = groundedCandidates[0] ?? bestCandidate;
  const bestQuaternion = selected.quaternion;

  lowerAssembly.quaternion.copy(savedQuaternion);
  root.updateWorldMatrix(true, true);
  const cutNormalWorld = new THREE.Vector3(0, 0, 1)
    .applyQuaternion(lowerCap.quaternion)
    .applyQuaternion(bestQuaternion)
    .normalize();
  const selectedFrontWorld = semanticFrontLocal.clone()
    .applyQuaternion(bestQuaternion)
    .normalize();
  return {
    quaternion: bestQuaternion,
    semanticAxisLocal,
    semanticAxisWorld: semanticAxisLocal.clone().applyQuaternion(bestQuaternion).normalize(),
    verticalSpan: selected.verticalSpan,
    longSpan: selected.longSpan,
    heightToLongSpan: selected.ratio,
    screenYawDegrees: THREE.MathUtils.radToDeg(yawVariation),
    rollDegrees: THREE.MathUtils.radToDeg(selected.rollRadians % (Math.PI * 2)),
    cutNormalVerticalComponent: Math.abs(cutNormalWorld.y),
    frontVerticalComponent: selectedFrontWorld.y,
    familyAlignment: selected.familyAlignment,
  };
}

function makeCorpseWeaponSubordinate(
  upperAssembly: THREE.Group,
  ownedMaterials: THREE.Material[],
) {
  upperAssembly.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || Array.isArray(child.material)) return;

    if (child.name === "heavy-cleaver-body" && child.material instanceof THREE.MeshStandardMaterial) {
      const material = child.material.clone();
      material.name = "corpse-cleaver-darkened-gunmetal";
      material.color.setHex(0x101619);
      material.roughness = 0.88;
      material.metalness = 0.12;
      child.material = material;
      ownedMaterials.push(material);
      return;
    }

    if (child.name === "heavy-cleaver-red-orange-edge" && child.material instanceof THREE.MeshStandardMaterial) {
      const material = child.material.clone();
      material.name = "corpse-cleaver-cooled-edge";
      material.color.setHex(0x39110c);
      material.emissive.setHex(0x120100);
      material.emissiveIntensity = 0.04;
      material.roughness = 0.7;
      material.metalness = 0.2;
      material.toneMapped = true;
      child.material = material;
      ownedMaterials.push(material);
      return;
    }

    if (child.name === "red-orange-sensor-slit" && child.material instanceof THREE.MeshStandardMaterial) {
      const material = child.material.clone();
      material.name = "corpse-sensor-fading-heat";
      material.color.setHex(0x742315);
      material.emissive.setHex(0x350501);
      material.emissiveIntensity = 0.22;
      material.toneMapped = true;
      child.material = material;
      ownedMaterials.push(material);
    }
  });
}

export function createCorpseRuntime(
  scene: THREE.Scene,
  actorRoot: THREE.Group,
  modules: DeathModuleSet,
  slashDirection: THREE.Vector3,
  seed = 0,
): CorpseRuntime {
  actorRoot.updateWorldMatrix(true, true);
  const direction = slashDirection.clone().setY(0);
  if (direction.lengthSq() < 0.0001) direction.set(1, 0, 0);
  direction.normalize();
  const side = new THREE.Vector3(-direction.z, 0, direction.x);
  const landingFamily = (seededPoseSlot(seed) % 4) as LandingFamily;

  const root = new THREE.Group();
  root.name = "enemy-corpse-modules";
  scene.add(root);

  // Preserve two unmistakable anatomical masses. The head, arms and cleaver
  // remain on the upper body; the pelvis and both legs remain on the lower body.
  const upperAssembly = createAssembly(root, "corpse-upper-mass", [
    modules.upperTorso,
    modules.head,
    modules.leftArm,
    modules.rightArm,
  ]);
  const lowerAssembly = createAssembly(root, "corpse-lower-mass", [
    modules.pelvis,
    modules.leftLeg,
    modules.rightLeg,
  ]);

  const upperPivot = new THREE.Vector3();
  const lowerPivot = new THREE.Vector3();
  upperAssembly.getWorldPosition(upperPivot);
  lowerAssembly.getWorldPosition(lowerPivot);
  const cutWorld = lowerPivot.clone().lerp(upperPivot, 0.38);

  const addCutCap = (assembly: THREE.Group, name: string, twist: number) => {
    assembly.updateWorldMatrix(true, true);
    const cap = new THREE.Mesh(cutCapGeometry, cutCapMaterial);
    cap.name = name;
    cap.position.copy(assembly.worldToLocal(cutWorld.clone()));
    cap.rotation.set(-Math.PI / 2, 0, twist);
    cap.scale.set(1.22, 0.92, 1);
    cap.castShadow = false;
    cap.receiveShadow = false;
    cap.renderOrder = 7;
    assembly.add(cap);
    const rim = new THREE.Mesh(cutRimGeometry, cutRimMaterial);
    rim.name = `${name}-charred-rim`;
    rim.position.copy(cap.position);
    rim.position.z = -0.003;
    rim.rotation.copy(cap.rotation);
    rim.scale.copy(cap.scale);
    rim.castShadow = false;
    rim.receiveShadow = false;
    rim.renderOrder = 8;
    assembly.add(rim);
    return cap;
  };
  const cutTwistVariation = seededSigned(seed, 43.17) * 0.32;
  const upperCap = addCutCap(
    upperAssembly,
    "upper-waist-cut-cap",
    -0.22 + cutTwistVariation,
  );
  const lowerCap = addCutCap(
    lowerAssembly,
    "lower-waist-cut-cap",
    -0.22 - cutTwistVariation * 0.72,
  );

  const ownedMaterials: THREE.Material[] = [];
  makeCorpseWeaponSubordinate(upperAssembly, ownedMaterials);

  const variation = seededUnit(seed) - 0.5;
  const upperBaseQuaternion = upperAssembly.quaternion.clone();
  const lowerBaseQuaternion = lowerAssembly.quaternion.clone();

  // The first rendered corpse frame already has a full chest-width break. This
  // does not depend on frame rate or on an eventual physics impulse accumulating.
  const upperStartCut = cutWorld.clone()
    .addScaledVector(side, 0.76)
    .addScaledVector(direction, 0.3);
  const lowerStartCut = cutWorld.clone()
    .addScaledVector(side, -0.76)
    .addScaledVector(direction, -0.25);

  // Land with roughly one chest width of empty floor between the silhouettes.
  // The cap centres remain farther apart because each rigid mass has thickness.
  const pairSideDrift = seededSigned(seed, 13.27) * 0.2;
  const pairDirectionDrift = seededSigned(seed, 17.63) * 0.22;
  const familySeparationAxis = landingFamily === 0
    ? side.clone()
    : landingFamily === 1
      ? side.clone().multiplyScalar(0.72).addScaledVector(direction, 0.69).normalize()
      : landingFamily === 2
        ? direction.clone()
        : side.clone().multiplyScalar(0.72).addScaledVector(direction, -0.69).normalize();
  const upperSeparationDistance = 1.04 + seededUnit(seed + 23.71) * 0.28;
  const lowerSeparationDistance = 0.92 + seededUnit(seed + 37.19) * 0.26;
  const upperLandingCut = cutWorld.clone()
    .addScaledVector(side, pairSideDrift)
    .addScaledVector(direction, pairDirectionDrift)
    .addScaledVector(familySeparationAxis, upperSeparationDistance);
  const lowerLandingCut = cutWorld.clone()
    .addScaledVector(side, pairSideDrift)
    .addScaledVector(direction, pairDirectionDrift)
    .addScaledVector(familySeparationAxis, -lowerSeparationDistance);

  const upperStartQuaternion = composeWorldRotation(upperBaseQuaternion, [
    [direction, 0.42],
    [side, -0.3],
  ]);
  const lowerStartQuaternion = composeWorldRotation(lowerBaseQuaternion, [
    [direction, -0.28],
    [side, -0.92],
  ]);

  // Four authored landing grammars map the real torso basis to shoulder-left,
  // shoulder-right, chest-up and chest-down poses. Lower-body candidates use
  // the corresponding side/supine/prone family while retaining the flatness gate.
  const upperFamilyPose = chooseUpperFamilyPose(
    root,
    upperAssembly,
    upperCap,
    landingFamily,
  );
  const upperLandingQuaternion = upperFamilyPose.quaternion;
  const groundedLowerPose = chooseGroundedLowerPose(
    root,
    lowerAssembly,
    lowerCap,
    seed,
    landingFamily,
  );
  const lowerLandingQuaternion = groundedLowerPose.quaternion;

  const upperStartPosition = positionAssemblyByCutSurface(
    upperCap,
    upperStartCut,
    upperStartQuaternion,
  );
  const lowerStartPosition = positionAssemblyByCutSurface(
    lowerCap,
    lowerStartCut,
    lowerStartQuaternion,
  );
  const upperLandingPosition = positionAssemblyByCutSurface(
    upperCap,
    upperLandingCut,
    upperLandingQuaternion,
  );
  const lowerLandingPosition = positionAssemblyByCutSurface(
    lowerCap,
    lowerLandingCut,
    lowerLandingQuaternion,
  );

  placeAssemblyOnFloor(root, upperAssembly, upperLandingPosition, upperLandingQuaternion);
  placeAssemblyOnFloor(root, lowerAssembly, lowerLandingPosition, lowerLandingQuaternion);

  const startNegativeSpace = fitAuthoredNegativeSpace(
    root,
    upperAssembly,
    lowerAssembly,
    upperStartPosition,
    lowerStartPosition,
    upperStartQuaternion,
    lowerStartQuaternion,
    0.92 * ENEMY_CHEST_WIDTH,
  );
  const landingNegativeSpace = fitAuthoredNegativeSpace(
    root,
    upperAssembly,
    lowerAssembly,
    upperLandingPosition,
    lowerLandingPosition,
    upperLandingQuaternion,
    lowerLandingQuaternion,
    1.38 * ENEMY_CHEST_WIDTH,
  );

  upperAssembly.position.copy(upperStartPosition);
  upperAssembly.quaternion.copy(upperStartQuaternion);
  lowerAssembly.position.copy(lowerStartPosition);
  lowerAssembly.quaternion.copy(lowerStartQuaternion);
  root.updateWorldMatrix(true, true);

  const upperFlightDuration = [0.34, 0.47, 0.39, 0.43] as const;
  const upperArcHeight = [0.3, 0.9, 0.5, 0.42] as const;
  const lowerFlightDuration = [0.29, 0.34, 0.27, 0.32] as const;
  const lowerArcHeight = [0.3, 0.5, 0.35, 0.4] as const;
  const pieces: CorpsePiece[] = [
    {
      object: upperAssembly,
      startPosition: upperStartPosition,
      landingPosition: upperLandingPosition,
      startQuaternion: upperStartQuaternion,
      landingQuaternion: upperLandingQuaternion,
      flightDuration: upperFlightDuration[landingFamily] + variation * 0.016,
      arcHeight: upperArcHeight[landingFamily] + variation * 0.035,
    },
    {
      object: lowerAssembly,
      startPosition: lowerStartPosition,
      landingPosition: lowerLandingPosition,
      startQuaternion: lowerStartQuaternion,
      landingQuaternion: lowerLandingQuaternion,
      flightDuration: lowerFlightDuration[landingFamily] - variation * 0.012,
      arcHeight: lowerArcHeight[landingFamily] - variation * 0.025,
    },
  ];

  const upperStartCapWorld = cutSurfaceWorldPosition(upperCap, upperStartPosition, upperStartQuaternion);
  const lowerStartCapWorld = cutSurfaceWorldPosition(lowerCap, lowerStartPosition, lowerStartQuaternion);
  const upperLandingCapWorld = cutSurfaceWorldPosition(upperCap, upperLandingPosition, upperLandingQuaternion);
  const lowerLandingCapWorld = cutSurfaceWorldPosition(lowerCap, lowerLandingPosition, lowerLandingQuaternion);
  root.userData.cutSurfaceStartSeparation = upperStartCapWorld.distanceTo(lowerStartCapWorld);
  root.userData.cutSurfaceLandingSeparation = upperLandingCapWorld.distanceTo(lowerLandingCapWorld);
  root.userData.startNegativeSpace = startNegativeSpace;
  root.userData.landingNegativeSpace = landingNegativeSpace;
  root.userData.enemyChestWidth = ENEMY_CHEST_WIDTH;
  root.userData.lowerLongAxisGroundAngleDegrees = THREE.MathUtils.radToDeg(
    Math.asin(Math.min(1, Math.abs(groundedLowerPose.semanticAxisWorld.y))),
  );
  root.userData.lowerWorldVerticalSpan = groundedLowerPose.verticalSpan;
  root.userData.lowerWorldLongSpan = groundedLowerPose.longSpan;
  root.userData.lowerHeightToLongSpan = groundedLowerPose.heightToLongSpan;
  root.userData.lowerScreenYawDegrees = groundedLowerPose.screenYawDegrees;
  root.userData.lowerRollDegrees = groundedLowerPose.rollDegrees;
  root.userData.lowerCutNormalVerticalComponent = groundedLowerPose.cutNormalVerticalComponent;
  root.userData.lowerFrontVerticalComponent = groundedLowerPose.frontVerticalComponent;
  root.userData.lowerFamilyAlignment = groundedLowerPose.familyAlignment;
  root.userData.landingFamily = landingFamily;
  root.userData.landingFamilyName = LANDING_FAMILY_NAMES[landingFamily];
  root.userData.upperLongAxisGroundAngleDegrees = THREE.MathUtils.radToDeg(
    Math.asin(Math.min(1, Math.abs(upperFamilyPose.semanticAxisWorld.y))),
  );
  root.userData.upperFrontVerticalComponent = upperFamilyPose.frontAxisWorld.y;
  root.userData.upperWorldVerticalSpan = upperFamilyPose.verticalSpan;
  root.userData.upperWorldLongSpan = upperFamilyPose.longSpan;
  root.userData.upperHeightToLongSpan = upperFamilyPose.heightToLongSpan;
  const landingSeparationAxis = upperLandingCapWorld.clone().sub(lowerLandingCapWorld).setY(0);
  root.userData.landingSeparationAxisYawDegrees = THREE.MathUtils.radToDeg(
    Math.atan2(landingSeparationAxis.x, landingSeparationAxis.z),
  );

  actorRoot.visible = false;
  const runtime: CorpseRuntime = {
    root,
    age: 0,
    settled: false,
    update(dt) {
      runtime.age += dt;
      let moving = false;
      for (const piece of pieces) {
        const progress = THREE.MathUtils.clamp(runtime.age / piece.flightDuration, 0, 1);
        if (progress < 1) moving = true;
        const travel = 1 - Math.pow(1 - progress, 3);
        const rotationProgress = THREE.MathUtils.smoothstep(progress, 0, 1);
        piece.object.position.x = THREE.MathUtils.lerp(
          piece.startPosition.x,
          piece.landingPosition.x,
          travel,
        );
        piece.object.position.z = THREE.MathUtils.lerp(
          piece.startPosition.z,
          piece.landingPosition.z,
          travel,
        );
        piece.object.position.y = THREE.MathUtils.lerp(
          piece.startPosition.y,
          piece.landingPosition.y,
          progress,
        ) + Math.sin(Math.PI * progress) * piece.arcHeight;
        piece.object.quaternion.slerpQuaternions(
          piece.startQuaternion,
          piece.landingQuaternion,
          rotationProgress,
        );
      }
      runtime.settled = runtime.age >= 0.54 && !moving;
    },
    dispose() {
      scene.remove(root);
      for (const material of ownedMaterials) material.dispose();
    },
  };
  return runtime;
}
