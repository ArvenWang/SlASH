import * as THREE from "three";

export type WeaponKind = "energy-katana" | "enforcer-cleaver";

export interface WeaponDefinition {
  readonly id: string;
  readonly kind: WeaponKind;
  readonly ownerHeight: number;
  readonly totalLengthRatio: number;
  readonly gripLengthRatio: number;
}

export interface GripProfileDefinition {
  readonly id: string;
  readonly primaryHand: "right";
  /** Wrist-to-palm-centre offset expressed in the weapon's own axes. */
  readonly primaryGripOffsetInWeaponSpace: readonly [number, number, number];
  readonly weaponOrientation: WeaponOrientationDefinition;
  readonly stateWeaponOrientations?: Readonly<Record<string, WeaponOrientationDefinition>>;
  readonly secondaryHand: "left" | null;
  readonly secondaryIkWeight: number;
  readonly secondaryMaxReachRatio: number;
  readonly secondaryMaxRotationRadians: number;
}

export interface WeaponOrientationDefinition {
  readonly lengthDirection: readonly [number, number, number];
  readonly cuttingEdgeDirection: readonly [number, number, number];
}

export interface WeaponInstance {
  readonly root: THREE.Group;
  readonly landmarks: ReadonlyMap<string, THREE.Object3D>;
  readonly energyMaterials: readonly THREE.MeshStandardMaterial[];
  readonly totalLength: number;
  readonly gripLength: number;
  readonly gripRadius: number;
  dispose(): void;
}

export const HERO_V5R_WEAPON: WeaponDefinition = {
  id: "hero-energy-katana-v5r",
  kind: "energy-katana",
  ownerHeight: 3.3,
  totalLengthRatio: 0.62,
  gripLengthRatio: 0.11,
};

export const ENEMY_V5R_WEAPON: WeaponDefinition = {
  id: "enemy-enforcer-cleaver-v5r",
  kind: "enforcer-cleaver",
  ownerHeight: 3.157,
  totalLengthRatio: 0.39,
  gripLengthRatio: 0.12,
};

export const HERO_V5R_GRIP: GripProfileDefinition = {
  id: "hero-v5r-primary-forward-grip",
  primaryHand: "right",
  primaryGripOffsetInWeaponSpace: [0, 0.068, 0],
  weaponOrientation: {
    // Ready is a forward sabre grip: the blade falls below the hand while the
    // live edge faces away from the torso and toward the next cut.
    lengthDirection: [0.22, -0.9, 0.37],
    cuttingEdgeDirection: [0.08, 0.39, 0.917],
  },
  stateWeaponOrientations: {
    "idle:focus-activate": { lengthDirection: [-0.72, -0.12, 0.683], cuttingEdgeDirection: [-0.36, -0.75, -0.556] },
    "idle:focus-selection": { lengthDirection: [-0.62, -0.08, 0.78], cuttingEdgeDirection: [-0.48, -0.75, -0.458] },
    anticipation: { lengthDirection: [0.12, -0.94, 0.319], cuttingEdgeDirection: [0.04, 0.323, 0.946] },
    action: { lengthDirection: [0.1, -0.08, 0.992], cuttingEdgeDirection: [-0.92, -0.38, 0.062] },
    arrival: { lengthDirection: [0.35, -0.18, 0.92], cuttingEdgeDirection: [-0.9, -0.42, 0.26] },
    recovery: { lengthDirection: [0.28, -0.88, 0.38], cuttingEdgeDirection: [0.06, 0.397, 0.916] },
    "action:chain-1": { lengthDirection: [0.24, -0.1, 0.966], cuttingEdgeDirection: [-0.91, -0.4, 0.185] },
    "action:chain-2": { lengthDirection: [-0.24, -0.12, 0.963], cuttingEdgeDirection: [0.9, -0.4, 0.174] },
    "action:chain-3": { lengthDirection: [0.06, -0.05, 0.997], cuttingEdgeDirection: [-0.94, -0.34, 0.04] },
    death: { lengthDirection: [0.34, -0.84, 0.423], cuttingEdgeDirection: [0.08, 0.47, 0.879] },
  },
  secondaryHand: null,
  secondaryIkWeight: 0,
  secondaryMaxReachRatio: 0,
  secondaryMaxRotationRadians: 0,
};

export const ENEMY_V5R_GRIP: GripProfileDefinition = {
  id: "enemy-v5r-primary-cleaver",
  primaryHand: "right",
  primaryGripOffsetInWeaponSpace: [0, 0.09, 0],
  weaponOrientation: {
    lengthDirection: [0.35, -0.55, 0.758],
    cuttingEdgeDirection: [-0.86, -0.5, 0.035],
  },
  stateWeaponOrientations: {
    action: { lengthDirection: [0.25, -0.32, 0.914], cuttingEdgeDirection: [-0.8, -0.58, 0.016] },
    "action:threat": { lengthDirection: [0.15, -0.24, 0.959], cuttingEdgeDirection: [-0.82, -0.55, -0.01] },
    hit: { lengthDirection: [-0.18, -0.16, 0.97], cuttingEdgeDirection: [-0.82, -0.54, -0.241] },
    death: { lengthDirection: [-0.28, -0.08, 0.956], cuttingEdgeDirection: [-0.82, -0.5, -0.282] },
  },
  secondaryHand: null,
  secondaryIkWeight: 0,
  secondaryMaxReachRatio: 0,
  secondaryMaxRotationRadians: 0,
};

function marker(name: string, position: readonly [number, number, number]) {
  const object = new THREE.Group();
  object.name = name;
  object.position.set(...position);
  return object;
}

export function weaponOrientationQuaternion(
  definition: WeaponOrientationDefinition,
  target = new THREE.Quaternion(),
) {
  const lengthAxis = new THREE.Vector3(...definition.lengthDirection).normalize();
  const cuttingEdge = new THREE.Vector3(...definition.cuttingEdgeDirection)
    .addScaledVector(lengthAxis, -new THREE.Vector3(...definition.cuttingEdgeDirection).dot(lengthAxis))
    .normalize();
  const xAxis = cuttingEdge.multiplyScalar(-1);
  const zAxis = xAxis.clone().cross(lengthAxis).normalize();
  xAxis.copy(lengthAxis).cross(zAxis).normalize();
  return target.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, lengthAxis, zAxis));
}

function curvedBladeGeometry(baseY: number, tipY: number, width: number, depth: number) {
  const sections = [
    { t: 0, centerX: 0, halfWidth: width * 0.5 },
    { t: 0.32, centerX: 0.006, halfWidth: width * 0.48 },
    { t: 0.62, centerX: 0.026, halfWidth: width * 0.4 },
    { t: 0.84, centerX: 0.068, halfWidth: width * 0.28 },
    { t: 0.96, centerX: 0.105, halfWidth: width * 0.15 },
    { t: 1, centerX: 0.124, halfWidth: 0.004 },
  ];
  const vertices: number[] = [];
  const point = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const addTriangle = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => {
    vertices.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  };
  for (let index = 0; index < sections.length - 1; index += 1) {
    const lower = sections[index];
    const upper = sections[index + 1];
    const lowerY = THREE.MathUtils.lerp(baseY, tipY, lower.t);
    const upperY = THREE.MathUtils.lerp(baseY, tipY, upper.t);
    const lf = point(lower.centerX - lower.halfWidth, lowerY, depth * 0.5);
    const rf = point(lower.centerX + lower.halfWidth, lowerY, depth * 0.5);
    const uf = point(upper.centerX - upper.halfWidth, upperY, depth * 0.5);
    const vf = point(upper.centerX + upper.halfWidth, upperY, depth * 0.5);
    const lb = point(lf.x, lf.y, -depth * 0.5);
    const rb = point(rf.x, rf.y, -depth * 0.5);
    const ub = point(uf.x, uf.y, -depth * 0.5);
    const vb = point(vf.x, vf.y, -depth * 0.5);
    addTriangle(lf, vf, rf); addTriangle(lf, uf, vf);
    addTriangle(lb, rb, vb); addTriangle(lb, vb, ub);
    addTriangle(lf, lb, ub); addTriangle(lf, ub, uf);
    addTriangle(rf, vf, vb); addTriangle(rf, vb, rb);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function curvedCuttingEdgeGeometry(baseY: number, tipY: number, width: number, depth: number) {
  const source = [
    { t: 0, centerX: 0, halfWidth: width * 0.5 },
    { t: 0.32, centerX: 0.006, halfWidth: width * 0.48 },
    { t: 0.62, centerX: 0.026, halfWidth: width * 0.4 },
    { t: 0.84, centerX: 0.068, halfWidth: width * 0.28 },
    { t: 0.96, centerX: 0.105, halfWidth: width * 0.15 },
    { t: 1, centerX: 0.124, halfWidth: 0.004 },
  ];
  const positions: number[] = [];
  const point = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const addTriangle = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => {
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  };
  for (let index = 0; index < source.length - 1; index += 1) {
    const lower = source[index];
    const upper = source[index + 1];
    const lowerY = THREE.MathUtils.lerp(baseY, tipY, lower.t);
    const upperY = THREE.MathUtils.lerp(baseY, tipY, upper.t);
    const lowerOuter = lower.centerX - lower.halfWidth;
    const upperOuter = upper.centerX - upper.halfWidth;
    const lowerInner = Math.min(lower.centerX, lowerOuter + 0.018);
    const upperInner = Math.min(upper.centerX, upperOuter + 0.018);
    const lowerOuterFront = point(lowerOuter, lowerY, depth);
    const lowerInnerFront = point(lowerInner, lowerY, depth);
    const upperOuterFront = point(upperOuter, upperY, depth);
    const upperInnerFront = point(upperInner, upperY, depth);
    const lowerOuterBack = point(lowerOuter, lowerY, -depth);
    const lowerInnerBack = point(lowerInner, lowerY, -depth);
    const upperOuterBack = point(upperOuter, upperY, -depth);
    const upperInnerBack = point(upperInner, upperY, -depth);
    // Both blade faces carry the same physical edge. The outer rim joins them,
    // so the live edge remains visible when the camera crosses the blade plane
    // instead of appearing to flip to the spine.
    addTriangle(lowerOuterFront, upperInnerFront, lowerInnerFront);
    addTriangle(lowerOuterFront, upperOuterFront, upperInnerFront);
    addTriangle(lowerOuterBack, lowerInnerBack, upperInnerBack);
    addTriangle(lowerOuterBack, upperInnerBack, upperOuterBack);
    addTriangle(lowerOuterFront, lowerOuterBack, upperOuterBack);
    addTriangle(lowerOuterFront, upperOuterBack, upperOuterFront);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createKatana(definition: WeaponDefinition): WeaponInstance {
  const root = new THREE.Group();
  root.name = definition.id;
  const totalLength = definition.ownerHeight * definition.totalLengthRatio;
  const gripLength = definition.ownerHeight * definition.gripLengthRatio;
  const handleBottomY = -gripLength * 0.7;
  const handleTopY = gripLength * 0.3;
  const bladeBaseY = handleTopY + 0.032;
  const bladeTipY = handleBottomY + totalLength;
  const dark = new THREE.MeshStandardMaterial({
    name: "hero-v5r-katana-grip",
    color: 0x11171a,
    roughness: 0.72,
    metalness: 0.38,
  });
  const guardMaterial = new THREE.MeshStandardMaterial({
    name: "hero-v5r-katana-guard",
    color: 0x283338,
    roughness: 0.4,
    metalness: 0.82,
  });
  const bladeMetal = new THREE.MeshStandardMaterial({
    name: "hero-v5r-katana-dark-spine",
    color: 0x52646b,
    emissive: 0x18353b,
    emissiveIntensity: 0.72,
    roughness: 0.24,
    metalness: 0.82,
    side: THREE.DoubleSide,
  });
  const energy = new THREE.MeshStandardMaterial({
    name: "hero-v5r-katana-cutting-edge",
    color: 0xeaffff,
    emissive: 0xb7f8ff,
    emissiveIntensity: 5.2,
    roughness: 0.12,
    metalness: 0.24,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const glow = new THREE.MeshBasicMaterial({
    name: "hero-v5r-katana-energy-halo",
    color: 0xa9f8ff,
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.045, gripLength, 8), dark);
  handle.name = "hero-v5r-katana-handle";
  handle.position.y = (handleBottomY + handleTopY) * 0.5;
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.035, 0.075), guardMaterial);
  guard.name = "hero-v5r-katana-guard";
  guard.position.y = handleTopY + 0.012;
  const bladeGeometry = curvedBladeGeometry(bladeBaseY, bladeTipY, 0.1, 0.018);
  const blade = new THREE.Mesh(bladeGeometry, bladeMetal);
  blade.name = "hero-v5r-katana-dark-spine-blade";
  blade.castShadow = true;
  const edge = new THREE.Mesh(curvedCuttingEdgeGeometry(bladeBaseY, bladeTipY, 0.1, 0.012), energy);
  edge.name = "hero-v5r-katana-visible-cutting-edge";
  edge.renderOrder = 6;
  const halo = new THREE.Mesh(curvedCuttingEdgeGeometry(bladeBaseY, bladeTipY, 0.112, 0.015), glow);
  halo.name = "hero-v5r-katana-trail-edge";
  halo.renderOrder = 5;
  root.add(handle, guard, blade, edge, halo);
  const landmarks = new Map<string, THREE.Object3D>([
    ["primary-grip", marker("primary-grip", [0, 0, 0])],
    ["secondary-grip", marker("secondary-grip", [0, -gripLength * 0.43, 0])],
    ["guard-center", marker("guard-center", [0, handleTopY + 0.012, 0])],
    ["blade-base", marker("blade-base", [0, bladeBaseY, 0])],
    ["blade-tip", marker("blade-tip", [0.124, bladeTipY, 0])],
    ["trail-edge", marker("trail-edge", [-0.05, bladeBaseY + (bladeTipY - bladeBaseY) * 0.58, 0])],
  ]);
  landmarks.forEach((object) => root.add(object));
  return disposableWeapon(root, landmarks, [energy], totalLength, gripLength, 0.045);
}

function createCleaver(definition: WeaponDefinition): WeaponInstance {
  const root = new THREE.Group();
  root.name = definition.id;
  const totalLength = definition.ownerHeight * definition.totalLengthRatio;
  const gripLength = definition.ownerHeight * definition.gripLengthRatio;
  const handleBottomY = -gripLength * 0.68;
  const bladeBaseY = gripLength * 0.32 + 0.035;
  const bladeTipY = handleBottomY + totalLength;
  const metal = new THREE.MeshStandardMaterial({
    name: "enemy-v5r-cleaver-metal",
    color: 0x34444a,
    emissive: 0x160705,
    emissiveIntensity: 0.42,
    roughness: 0.36,
    metalness: 0.86,
  });
  const heat = new THREE.MeshStandardMaterial({
    name: "enemy-v5r-cleaver-edge",
    color: 0xff5a34,
    emissive: 0xff240d,
    emissiveIntensity: 2.1,
    roughness: 0.3,
    metalness: 0.58,
    toneMapped: false,
  });
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.058, gripLength, 8), metal);
  handle.position.y = (handleBottomY + gripLength * 0.32) * 0.5;
  const shape = new THREE.Shape([
    new THREE.Vector2(-0.06, bladeBaseY),
    new THREE.Vector2(0.16, bladeBaseY + 0.03),
    new THREE.Vector2(0.22, bladeTipY * 0.76),
    new THREE.Vector2(0.08, bladeTipY),
    new THREE.Vector2(-0.12, bladeTipY * 0.92),
  ]);
  const blade = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.045, bevelEnabled: false }), metal);
  blade.name = "enemy-v5r-short-cleaver";
  blade.position.z = -0.0225;
  const edge = new THREE.Mesh(new THREE.BoxGeometry(0.025, bladeTipY - bladeBaseY, 0.052), heat);
  edge.name = "enemy-v5r-cleaver-hot-edge";
  edge.position.set(-0.095, (bladeBaseY + bladeTipY) * 0.5, 0);
  root.add(handle, blade, edge);
  const landmarks = new Map<string, THREE.Object3D>([
    ["primary-grip", marker("primary-grip", [0, 0, 0])],
    ["secondary-grip", marker("secondary-grip", [0, -gripLength * 0.42, 0])],
    ["guard-center", marker("guard-center", [0, bladeBaseY, 0])],
    ["blade-base", marker("blade-base", [0, bladeBaseY, 0])],
    ["blade-tip", marker("blade-tip", [0.08, bladeTipY, 0])],
    ["trail-edge", marker("trail-edge", [-0.095, (bladeBaseY + bladeTipY) * 0.5, 0])],
  ]);
  landmarks.forEach((object) => root.add(object));
  return disposableWeapon(root, landmarks, [heat], totalLength, gripLength, 0.058);
}

function disposableWeapon(
  root: THREE.Group,
  landmarks: ReadonlyMap<string, THREE.Object3D>,
  energyMaterials: readonly THREE.MeshStandardMaterial[],
  totalLength: number,
  gripLength: number,
  gripRadius: number,
): WeaponInstance {
  return {
    root,
    landmarks,
    energyMaterials,
    totalLength,
    gripLength,
    gripRadius,
    dispose() {
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      root.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        geometries.add(object.geometry);
        const entries = Array.isArray(object.material) ? object.material : [object.material];
        entries.forEach((material) => materials.add(material));
      });
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      root.removeFromParent();
    },
  };
}

export function createWeaponInstance(definition: WeaponDefinition): WeaponInstance {
  return definition.kind === "energy-katana" ? createKatana(definition) : createCleaver(definition);
}
