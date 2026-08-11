import * as THREE from "three";
import { toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { createStandardMaterial } from "../presentation/materials/material-library";
import { MATERIAL_TOKENS } from "../presentation/materials/tokens";

type Point2 = readonly [x: number, y: number];
type Point3 = readonly [x: number, y: number, z: number];

interface FacetSection {
  y: number;
  radiusX: number;
  radiusZ: number;
  offsetX?: number;
  offsetZ?: number;
  rotation?: number;
}

/**
 * A limb/body ring is intentionally not a circle. The front is held flatter,
 * the outside carries a longer plane and the rear is tucked in. This is the
 * small but important difference between a hand-cut character volume and a
 * cone/capsule with its polygons merely made visible.
 */
interface SculptedSection extends FacetSection {
  frontBias?: number;
  outerBias?: number;
  /** A hand-authored ring twist prevents an assembly-line tube read. */
  twist?: number;
}

export interface HeroRig {
  rootMotion: THREE.Group;
  hips: THREE.Group;
  spine: THREE.Group;
  chest: THREE.Group;
  neck: THREE.Group;
  head: THREE.Group;
  leftShoulder: THREE.Group;
  rightShoulder: THREE.Group;
  leftUpperArm: THREE.Group;
  rightUpperArm: THREE.Group;
  leftForearm: THREE.Group;
  rightForearm: THREE.Group;
  leftHand: THREE.Group;
  rightHand: THREE.Group;
  leftUpperLeg: THREE.Group;
  rightUpperLeg: THREE.Group;
  leftShin: THREE.Group;
  rightShin: THREE.Group;
  leftFoot: THREE.Group;
  rightFoot: THREE.Group;
  swordPivot: THREE.Group;
}

export interface HeroCharacter {
  root: THREE.Group;
  visualRoot: THREE.Group;
  rig: HeroRig;
  swordHand: THREE.Group;
  sword: THREE.Group;
  blade: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  energyMaterials: THREE.MeshStandardMaterial[];
}

interface HeroMaterials {
  undersuit: THREE.MeshStandardMaterial;
  armor: THREE.MeshStandardMaterial;
  optic: THREE.MeshStandardMaterial;
  bladeEnergy: THREE.MeshStandardMaterial;
  bladeGlow: THREE.MeshBasicMaterial;
}

function pushTriangle(target: number[], a: Point3, b: Point3, c: Point3) {
  target.push(...a, ...b, ...c);
}

/**
 * Builds a deliberately low-poly, flat-shaded volume from hand-authored body
 * cross-sections. Every face owns its vertices so the planar construction is
 * preserved after normal calculation.
 */
function createSectionGeometry(
  sections: readonly FacetSection[],
  sides = 6,
  phase = Math.PI / 6,
): THREE.BufferGeometry {
  const vertices: number[] = [];
  const pointAt = (section: FacetSection, index: number): Point3 => {
    const angle = phase + (index / sides) * Math.PI * 2 + (section.rotation ?? 0);
    return [
      (section.offsetX ?? 0) + Math.cos(angle) * section.radiusX,
      section.y,
      (section.offsetZ ?? 0) + Math.sin(angle) * section.radiusZ,
    ];
  };

  for (let sectionIndex = 0; sectionIndex < sections.length - 1; sectionIndex += 1) {
    const lower = sections[sectionIndex];
    const upper = sections[sectionIndex + 1];
    for (let side = 0; side < sides; side += 1) {
      const next = (side + 1) % sides;
      const a = pointAt(lower, side);
      const b = pointAt(lower, next);
      const c = pointAt(upper, next);
      const d = pointAt(upper, side);
      pushTriangle(vertices, a, c, b);
      pushTriangle(vertices, a, d, c);
    }
  }

  const bottom = sections[0];
  const top = sections[sections.length - 1];
  const bottomCenter: Point3 = [bottom.offsetX ?? 0, bottom.y, bottom.offsetZ ?? 0];
  const topCenter: Point3 = [top.offsetX ?? 0, top.y, top.offsetZ ?? 0];
  for (let side = 0; side < sides; side += 1) {
    const next = (side + 1) % sides;
    pushTriangle(vertices, bottomCenter, pointAt(bottom, side), pointAt(bottom, next));
    pushTriangle(vertices, topCenter, pointAt(top, next), pointAt(top, side));
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createSculptedGeometry(
  sections: readonly SculptedSection[],
  sides = 9,
  phase = Math.PI / 8,
  capBottom = true,
  capTop = true,
): THREE.BufferGeometry {
  const vertices: number[] = [];
  // V5 keeps the hand-authored landmark rings, then samples a continuous curve
  // between them. The added topology describes anatomy and joint transitions;
  // it does not introduce additional armour pieces or decorative bands.
  const spansPerLandmark = 4;
  const sample = (key: keyof SculptedSection, index: number, t: number) => {
    const p0 = Number(sections[Math.max(0, index - 1)]?.[key] ?? 0);
    const p1 = Number(sections[index]?.[key] ?? 0);
    const p2 = Number(sections[Math.min(sections.length - 1, index + 1)]?.[key] ?? 0);
    const p3 = Number(sections[Math.min(sections.length - 1, index + 2)]?.[key] ?? 0);
    const t2 = t * t;
    const t3 = t2 * t;
    return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  };
  const refinedSections: SculptedSection[] = [];
  for (let index = 0; index < sections.length - 1; index += 1) {
    if (index === 0) refinedSections.push({ ...sections[0] });
    for (let step = 1; step <= spansPerLandmark; step += 1) {
      const t = step / spansPerLandmark;
      refinedSections.push({
        y: THREE.MathUtils.lerp(sections[index]!.y, sections[index + 1]!.y, t),
        radiusX: Math.max(0.002, sample("radiusX", index, t)),
        radiusZ: Math.max(0.002, sample("radiusZ", index, t)),
        offsetX: sample("offsetX", index, t),
        offsetZ: sample("offsetZ", index, t),
        rotation: sample("rotation", index, t),
        frontBias: sample("frontBias", index, t),
        outerBias: sample("outerBias", index, t),
        twist: sample("twist", index, t),
      });
    }
  }
  const radialSides = Math.max(10, sides + 2);
  const pointAt = (section: SculptedSection, index: number): Point3 => {
    const angle = phase + (index / radialSides) * Math.PI * 2 + (section.rotation ?? 0) + (section.twist ?? 0);
    const front = Math.max(0, Math.sin(angle));
    const outer = Math.abs(Math.cos(angle));
    const radiusX = section.radiusX * (1 + outer * (section.outerBias ?? 0));
    const radiusZ = section.radiusZ * (1 + front * (section.frontBias ?? 0));
    return [
      (section.offsetX ?? 0) + Math.cos(angle) * radiusX,
      section.y,
      (section.offsetZ ?? 0) + Math.sin(angle) * radiusZ,
    ];
  };

  for (let ring = 0; ring < refinedSections.length - 1; ring += 1) {
    for (let side = 0; side < radialSides; side += 1) {
      const next = (side + 1) % radialSides;
      const a = pointAt(refinedSections[ring], side);
      const b = pointAt(refinedSections[ring], next);
      const c = pointAt(refinedSections[ring + 1], next);
      const d = pointAt(refinedSections[ring + 1], side);
      pushTriangle(vertices, a, c, b);
      pushTriangle(vertices, a, d, c);
    }
  }
  const bottom = refinedSections[0];
  const top = refinedSections[refinedSections.length - 1];
  const bottomCenter: Point3 = [bottom.offsetX ?? 0, bottom.y, bottom.offsetZ ?? 0];
  const topCenter: Point3 = [top.offsetX ?? 0, top.y, top.offsetZ ?? 0];
  for (let side = 0; side < radialSides; side += 1) {
    const next = (side + 1) % radialSides;
    if (capBottom) pushTriangle(vertices, bottomCenter, pointAt(bottom, side), pointAt(bottom, next));
    if (capTop) pushTriangle(vertices, topCenter, pointAt(top, next), pointAt(top, side));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  const creased = toCreasedNormals(geometry, THREE.MathUtils.degToRad(26));
  creased.computeBoundingBox();
  creased.computeBoundingSphere();
  return creased;
}

/** Creates a solid, flat-shaded plate by extruding a convex hand-drawn profile. */
function createPlateGeometry(profile: readonly Point2[], depth: number): THREE.BufferGeometry {
  const vertices: number[] = [];
  const frontZ = depth * 0.5;
  const backZ = -frontZ;
  const front = (point: Point2): Point3 => [point[0], point[1], frontZ];
  const back = (point: Point2): Point3 => [point[0], point[1], backZ];

  for (let index = 1; index < profile.length - 1; index += 1) {
    pushTriangle(vertices, front(profile[0]), front(profile[index]), front(profile[index + 1]));
    pushTriangle(vertices, back(profile[0]), back(profile[index + 1]), back(profile[index]));
  }

  for (let index = 0; index < profile.length; index += 1) {
    const next = (index + 1) % profile.length;
    pushTriangle(vertices, front(profile[index]), back(profile[next]), back(profile[index]));
    pushTriangle(vertices, front(profile[index]), front(profile[next]), back(profile[next]));
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Builds a very thin, gently swept katana blade from paired spine/edge points.
 * The animation system still sees local +Y as the blade direction, while the
 * hand-authored X offsets create a readable sword curvature without a heavy
 * core or stacked blade parts.
 */
function createCurvedKatanaGeometry(widthScale = 1, thickness = 0.018): THREE.BufferGeometry {
  const source = [
    // 3.07m from ricasso to tip: 93% of the locked 3.3m character height.
    { y: 0.27, spineX: -0.035, edgeX: -0.115 },
    { y: 0.84, spineX: -0.025, edgeX: -0.125 },
    { y: 1.52, spineX: 0.008, edgeX: -0.105 },
    { y: 2.18, spineX: 0.062, edgeX: -0.048 },
    { y: 2.72, spineX: 0.13, edgeX: 0.03 },
    { y: 3.10, spineX: 0.19, edgeX: 0.115 },
    { y: 3.34, spineX: 0.235, edgeX: 0.225 },
  ] as const;
  const sections = source.map((section) => {
    const center = (section.spineX + section.edgeX) * 0.5;
    const halfWidth = (section.spineX - section.edgeX) * 0.5 * widthScale;
    return { y: section.y, spineX: center + halfWidth, edgeX: center - halfWidth };
  });
  const vertices: number[] = [];
  const halfDepth = thickness * 0.5;
  const point = (x: number, y: number, z: number): Point3 => [x, y, z];

  for (let index = 0; index < sections.length - 1; index += 1) {
    const lower = sections[index];
    const upper = sections[index + 1];
    const frontSpineLower = point(lower.spineX, lower.y, halfDepth);
    const frontEdgeLower = point(lower.edgeX, lower.y, halfDepth);
    const frontSpineUpper = point(upper.spineX, upper.y, halfDepth);
    const frontEdgeUpper = point(upper.edgeX, upper.y, halfDepth);
    const backSpineLower = point(lower.spineX, lower.y, -halfDepth);
    const backEdgeLower = point(lower.edgeX, lower.y, -halfDepth);
    const backSpineUpper = point(upper.spineX, upper.y, -halfDepth);
    const backEdgeUpper = point(upper.edgeX, upper.y, -halfDepth);

    pushTriangle(vertices, frontSpineLower, frontEdgeUpper, frontEdgeLower);
    pushTriangle(vertices, frontSpineLower, frontSpineUpper, frontEdgeUpper);
    pushTriangle(vertices, backSpineLower, backEdgeLower, backEdgeUpper);
    pushTriangle(vertices, backSpineLower, backEdgeUpper, backSpineUpper);
    pushTriangle(vertices, frontSpineLower, backSpineLower, backSpineUpper);
    pushTriangle(vertices, frontSpineLower, backSpineUpper, frontSpineUpper);
    pushTriangle(vertices, frontEdgeLower, frontEdgeUpper, backEdgeUpper);
    pushTriangle(vertices, frontEdgeLower, backEdgeUpper, backEdgeLower);
  }

  const base = sections[0];
  const tip = sections[sections.length - 1];
  pushTriangle(vertices, point(base.spineX, base.y, halfDepth), point(base.edgeX, base.y, -halfDepth), point(base.spineX, base.y, -halfDepth));
  pushTriangle(vertices, point(base.spineX, base.y, halfDepth), point(base.edgeX, base.y, halfDepth), point(base.edgeX, base.y, -halfDepth));
  pushTriangle(vertices, point(tip.spineX, tip.y, halfDepth), point(tip.spineX, tip.y, -halfDepth), point(tip.edgeX, tip.y, -halfDepth));
  pushTriangle(vertices, point(tip.spineX, tip.y, halfDepth), point(tip.edgeX, tip.y, -halfDepth), point(tip.edgeX, tip.y, halfDepth));

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createFootGeometry(side: -1 | 1): THREE.BufferGeometry {
  // An actual asymmetric boot: heel, instep and a low tapered toe are swept
  // along Z. It keeps a clean large-facet language without reading as a cube.
  const sections = [
    { z: -0.17, centerY: -0.035, radiusX: 0.102, radiusY: 0.16 },
    { z: -0.08, centerY: -0.015, radiusX: 0.12, radiusY: 0.19 },
    { z: 0.07, centerY: -0.025, radiusX: 0.145, radiusY: 0.17 },
    { z: 0.20, centerY: -0.075, radiusX: 0.15, radiusY: 0.125 },
    { z: 0.29, centerY: -0.105, radiusX: 0.112, radiusY: 0.072 },
    { z: 0.34, centerY: -0.116, radiusX: 0.075, radiusY: 0.042 },
  ] as const;
  const sides = 12;
  const positions: number[] = [];
  const pointAt = (section: typeof sections[number], index: number): Point3 => {
    const angle = Math.PI / 12 + (index / sides) * Math.PI * 2;
    const lateral = Math.cos(angle) * section.radiusX;
    const vertical = Math.sin(angle) * section.radiusY;
    const outsideLift = Math.max(0, side * lateral) * 0.08;
    return [side * 0.012 + lateral, section.centerY + vertical + outsideLift, section.z];
  };
  for (let ring = 0; ring < sections.length - 1; ring += 1) {
    for (let index = 0; index < sides; index += 1) {
      const next = (index + 1) % sides;
      pushTriangle(positions, pointAt(sections[ring], index), pointAt(sections[ring + 1], next), pointAt(sections[ring], next));
      pushTriangle(positions, pointAt(sections[ring], index), pointAt(sections[ring + 1], index), pointAt(sections[ring + 1], next));
    }
  }
  for (let index = 0; index < sides; index += 1) {
    const next = (index + 1) % sides;
    pushTriangle(positions, [side * 0.012, -0.035, -0.17], pointAt(sections[0], next), pointAt(sections[0], index));
    pushTriangle(positions, [side * 0.012, -0.116, 0.34], pointAt(sections[sections.length - 1], index), pointAt(sections[sections.length - 1], next));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createMaterials(): HeroMaterials {
  const optic = createStandardMaterial("hero-optic-v1", { flatShading: true });
  const bladeEnergy = createStandardMaterial("hero-energy-v1", { flatShading: true });
  bladeEnergy.toneMapped = false;
  bladeEnergy.side = THREE.DoubleSide;
  const bladeGlow = new THREE.MeshBasicMaterial({
    color: MATERIAL_TOKENS.energy.playerGlow,
    transparent: true,
    opacity: 0.05,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
  optic.name = "hero-cold-white-optic";
  bladeEnergy.name = "hero-full-energy-katana-blade";
  bladeGlow.name = "hero-thin-katana-halo";
  const undersuit = createStandardMaterial("hero-soft-v1");
  const armor = createStandardMaterial("hero-armor-v1");
  undersuit.flatShading = false;
  armor.flatShading = false;
  undersuit.name = "hero-minimal-near-black-soft-layer";
  armor.name = "hero-large-deep-graphite-armor";
  return {
    undersuit,
    armor,
    optic,
    bladeEnergy,
    bladeGlow,
  };
}

function joint(name: string): THREE.Group {
  const group = new THREE.Group();
  group.name = name;
  return group;
}

function mesh(
  name: string,
  geometry: THREE.BufferGeometry,
  meshMaterial: THREE.MeshStandardMaterial,
  parent: THREE.Object3D,
  position: Point3 = [0, 0, 0],
): THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> {
  const part = new THREE.Mesh(geometry, meshMaterial);
  part.name = name;
  part.position.set(...position);
  part.castShadow = meshMaterial.emissiveIntensity <= 0;
  part.receiveShadow = meshMaterial.emissiveIntensity <= 0;
  parent.add(part);
  return part;
}

function addArm(
  side: -1 | 1,
  chest: THREE.Group,
  materials: HeroMaterials,
): {
  shoulder: THREE.Group;
  upperArm: THREE.Group;
  forearm: THREE.Group;
  hand: THREE.Group;
} {
  const prefix = side < 0 ? "left" : "right";
  const shoulder = joint(`hero-${prefix}-shoulder`);
  shoulder.position.set(side * 0.31, 0.39, 0.008);
  chest.add(shoulder);

  const upperArm = joint(`hero-${prefix}-upper-arm`);
  upperArm.position.set(side * 0.07, 0.01, 0);
  upperArm.rotation.z = side * 0.105;
  shoulder.add(upperArm);
  mesh(
    `hero-${prefix}-upper-arm-continuous-shell`,
    createSculptedGeometry([
      // v4 calibration: a shoulder should resolve as one narrow continuation
      // of the chest shell, not a separate broad slab beside it. Keep depth
      // for the side silhouette while pulling only the lateral shell in.
      { y: 0.15, radiusX: 0.055, radiusZ: 0.155, offsetZ: 0.01, frontBias: 0.06, outerBias: 0.14, twist: side * -0.02 },
      { y: -0.12, radiusX: 0.15, radiusZ: 0.145, offsetX: side * 0.015, offsetZ: 0.014, frontBias: 0.1, outerBias: 0.08, twist: side * 0.025 },
      { y: -0.49, radiusX: 0.112, radiusZ: 0.11, offsetX: side * 0.025, offsetZ: -0.01, frontBias: 0, outerBias: 0.03, twist: side * 0.05 },
    ], 9, Math.PI / 9, false, false),
    materials.undersuit,
    upperArm,
  );
  const forearm = joint(`hero-${prefix}-forearm`);
  forearm.position.set(0, -0.45, 0);
  upperArm.add(forearm);
  mesh(
    `hero-${prefix}-forearm-continuous-shell`,
    createSculptedGeometry([
      { y: 0.13, radiusX: 0.118, radiusZ: 0.12, offsetX: side * 0.008, frontBias: 0.06, outerBias: 0.06, twist: side * 0.04 },
      { y: -0.17, radiusX: 0.128, radiusZ: 0.13, offsetX: side * 0.02, offsetZ: 0.012, frontBias: 0.1, outerBias: 0.08, twist: side * 0.065 },
      { y: -0.49, radiusX: 0.075, radiusZ: 0.08, offsetX: side * 0.026, frontBias: -0.02, twist: side * 0.045 },
    ], 9, Math.PI / 9, false, false),
    materials.armor,
    forearm,
  );

  const hand = joint(`hero-${prefix}-hand`);
  hand.position.set(0, -0.405, 0.006);
  forearm.add(hand);
  mesh(
    `hero-${prefix}-hand`,
    createSculptedGeometry([
      { y: 0.07, radiusX: 0.075, radiusZ: 0.078, frontBias: 0.03 },
      { y: -0.13, radiusX: 0.09, radiusZ: 0.078, offsetX: side * 0.016, offsetZ: 0.042, frontBias: 0.09, outerBias: 0.08, twist: side * 0.06 },
      { y: -0.27, radiusX: 0.04, radiusZ: 0.038, offsetX: side * 0.024, offsetZ: 0.082, frontBias: 0.01 },
    ], 8, Math.PI / 10, false, true),
    materials.undersuit,
    hand,
  );

  return { shoulder, upperArm, forearm, hand };
}

function addLeg(
  side: -1 | 1,
  hips: THREE.Group,
  materials: HeroMaterials,
): { upperLeg: THREE.Group; shin: THREE.Group; foot: THREE.Group } {
  const prefix = side < 0 ? "left" : "right";
  const upperLeg = joint(`hero-${prefix}-upper-leg`);
  upperLeg.position.set(side * 0.18, 0.018, 0.008);
  hips.add(upperLeg);
  mesh(
    `hero-${prefix}-thigh-continuous-shell`,
    createSculptedGeometry([
      { y: 0.14, radiusX: 0.19, radiusZ: 0.18, offsetX: side * 0.012, offsetZ: -0.005, frontBias: 0.07, outerBias: 0.1, twist: side * -0.025 },
      { y: -0.2, radiusX: 0.195, radiusZ: 0.195, offsetX: side * 0.03, offsetZ: 0.012, frontBias: 0.13, outerBias: 0.12, twist: side * 0.02 },
      { y: -0.52, radiusX: 0.145, radiusZ: 0.16, offsetX: side * 0.026, offsetZ: -0.005, frontBias: 0.07, outerBias: 0.07, twist: side * 0.06 },
      { y: -0.81, radiusX: 0.105, radiusZ: 0.112, offsetX: side * 0.006, offsetZ: -0.012, frontBias: -0.03, twist: side * 0.07 },
    ], 9, Math.PI / 9, false, false),
    materials.undersuit,
    upperLeg,
  );
  const shin = joint(`hero-${prefix}-shin`);
  shin.position.set(0, -0.735, 0.006);
  upperLeg.add(shin);
  mesh(
    `hero-${prefix}-lower-leg-continuous-shell`,
    createSculptedGeometry([
      { y: 0.16, radiusX: 0.112, radiusZ: 0.12, offsetX: side * 0.01, frontBias: 0.04, outerBias: 0.04, twist: side * 0.06 },
      { y: -0.16, radiusX: 0.135, radiusZ: 0.145, offsetX: side * 0.024, offsetZ: 0.012, frontBias: 0.13, outerBias: 0.08, twist: side * 0.025 },
      { y: -0.52, radiusX: 0.087, radiusZ: 0.098, offsetX: side * 0.014, offsetZ: -0.004, frontBias: -0.01, outerBias: 0.04, twist: side * -0.035 },
      { y: -0.79, radiusX: 0.066, radiusZ: 0.07, frontBias: -0.04, twist: side * -0.045 },
    ], 9, Math.PI / 9, false, false),
    materials.armor,
    shin,
  );

  const foot = joint(`hero-${prefix}-foot`);
  foot.position.set(0, -0.745, 0.015);
  shin.add(foot);
  mesh(
    `hero-${prefix}-faceted-boot`,
    createFootGeometry(side),
    materials.armor,
    foot,
  );
  return { upperLeg, shin, foot };
}

function addHelmet(head: THREE.Group, materials: HeroMaterials) {
  mesh(
    "hero-single-shell-helmet",
    createSculptedGeometry([
      { y: 0.0, radiusX: 0.14, radiusZ: 0.145, offsetZ: -0.025, frontBias: -0.04, outerBias: 0.06 },
      { y: 0.12, radiusX: 0.205, radiusZ: 0.225, offsetZ: 0.022, frontBias: 0.055, outerBias: 0.08 },
      { y: 0.31, radiusX: 0.205, radiusZ: 0.215, offsetZ: 0.002, frontBias: 0.0, outerBias: 0.065 },
      { y: 0.43, radiusX: 0.145, radiusZ: 0.155, offsetZ: -0.025, frontBias: -0.025, outerBias: 0.035 },
      { y: 0.49, radiusX: 0.075, radiusZ: 0.082, offsetZ: -0.035, frontBias: -0.035 },
    ], 10, Math.PI / 10),
    materials.armor,
    head,
  );

  mesh(
    "hero-left-cold-white-visor-segment",
    createPlateGeometry([
      [-0.168, 0.102], [-0.014, 0.074], [-0.014, 0.12], [-0.152, 0.145],
    ], 0.01),
    materials.optic,
    head,
    [0, 0.02, 0.236],
  );
  mesh(
    "hero-right-cold-white-visor-segment",
    createPlateGeometry([
      [0.014, 0.074], [0.168, 0.102], [0.152, 0.145], [0.014, 0.12],
    ], 0.01),
    materials.optic,
    head,
    [0, 0.02, 0.236],
  );
}

function addSword(
  swordPivot: THREE.Group,
  materials: HeroMaterials,
): {
  sword: THREE.Group;
  blade: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
} {
  const sword = joint("hero-future-energy-katana");
  swordPivot.add(sword);

  mesh(
    "hero-katana-simple-dark-grip",
    createSectionGeometry([
      { y: -0.23, radiusX: 0.043, radiusZ: 0.038 },
      { y: 0.25, radiusX: 0.043, radiusZ: 0.038 },
    ], 6, Math.PI / 6),
    materials.undersuit,
    sword,
  );
  mesh(
    "hero-katana-minimal-guard",
    createPlateGeometry([
      [-0.13, -0.018], [0.13, -0.018], [0.105, 0.026], [-0.105, 0.026],
    ], 0.05),
    materials.armor,
    sword,
    [0, 0.268, 0],
  );
  const bladeGlow = new THREE.Mesh(
    createCurvedKatanaGeometry(0.96, 0.009),
    materials.bladeGlow,
  );
  bladeGlow.name = "hero-katana-low-opacity-halo";
  bladeGlow.castShadow = false;
  bladeGlow.receiveShadow = false;
  bladeGlow.renderOrder = 2;
  sword.add(bladeGlow);
  const blade = mesh(
    "hero-katana-full-cold-white-blade",
    createCurvedKatanaGeometry(0.76, 0.012),
    materials.bladeEnergy,
    sword,
  );
  blade.renderOrder = 3;
  return { sword, blade };
}

function applyCombatRestPose(rig: HeroRig) {
  rig.hips.rotation.set(-0.025, -0.055, -0.012);
  rig.spine.rotation.set(0.09, 0.035, -0.018);
  rig.chest.rotation.set(0.07, -0.095, 0.025);
  rig.neck.rotation.set(-0.035, 0.035, 0);
  rig.head.rotation.set(-0.045, 0.045, -0.012);

  // The free shoulder reaches toward the threat while the sword shoulder loads
  // behind the rib cage. Arm roll leaves a readable strip of negative space.
  rig.leftShoulder.position.z = 0.075;
  rig.rightShoulder.position.z = -0.085;
  rig.leftShoulder.rotation.set(-0.035, 0.08, -0.025);
  rig.rightShoulder.rotation.set(0.045, -0.1, 0.035);
  rig.leftUpperArm.rotation.x = -0.12;
  rig.leftUpperArm.rotation.y = -0.055;
  rig.rightUpperArm.rotation.x = 0.16;
  rig.rightUpperArm.rotation.y = 0.07;
  rig.leftForearm.rotation.set(-0.11, 0.015, -0.025);
  rig.rightForearm.rotation.set(0.19, -0.025, 0.04);

  // A staggered, lightly compressed stance is the authored rest state. The
  // animator records these transforms and layers idle/dash motion on top.
  rig.leftUpperLeg.position.z = 0.035;
  rig.rightUpperLeg.position.z = -0.025;
  rig.leftUpperLeg.rotation.set(-0.055, -0.035, -0.055);
  rig.rightUpperLeg.rotation.set(0.035, 0.035, 0.055);
  rig.leftShin.rotation.x = 0.18;
  rig.rightShin.rotation.x = 0.18;
  rig.leftFoot.rotation.x = -0.06;
  rig.rightFoot.rotation.x = -0.06;

  // The blade clears the body by 0.2 world units and leaves the hand at a
  // shallow downward attack line rather than hanging vertically.
  rig.swordPivot.position.set(0.2, -0.14, 0.13);
}

function orientRestBladeForAuthoredIdle(swordRestOrientation: THREE.Group) {
  // Pre-compensates the authored idle rotations across chest, shoulder, arm,
  // forearm, and swordPivot. Keeping this on an internal child prevents the
  // public animation joint from entering an unstable near-singular Euler pose.
  swordRestOrientation.quaternion.set(
    -0.7815311892870129,
    0.4950313757188365,
    0.3586381207407211,
    0.12462598275282491,
  );
  // The 3.07m blade remains low and threatening, but its hand-authored sweep
  // clears the ground in Ready, Transit and Recovery rather than relying on
  // an animation-time offset (which would detach it from the hand).
  swordRestOrientation.rotateX(-0.4);
  swordRestOrientation.rotateZ(1);
}

function groundCombatStance(root: THREE.Group, rig: HeroRig) {
  root.updateMatrixWorld(true);
  const footBounds = new THREE.Box3().setFromObject(rig.leftFoot);
  footBounds.union(new THREE.Box3().setFromObject(rig.rightFoot));
  rig.rootMotion.position.y -= footBounds.min.y;
  root.updateMatrixWorld(true);
}

export function createHeroCharacter(): HeroCharacter {
  const materials = createMaterials();
  const root = joint("hero-character");
  const rootMotion = joint("hero-root-motion");
  const visualRoot = joint("hero-visual-root");
  root.add(rootMotion);
  rootMotion.add(visualRoot);

  const hips = joint("hero-hips");
  hips.position.y = 1.62;
  visualRoot.add(hips);
  mesh(
    "hero-v5-pelvis-abdomen-shell",
    createSculptedGeometry([
      { y: -0.21, radiusX: 0.225, radiusZ: 0.165, offsetZ: -0.018, frontBias: 0.02, outerBias: 0.06, twist: -0.025 },
      { y: 0.01, radiusX: 0.292, radiusZ: 0.205, offsetZ: 0.004, frontBias: 0.1, outerBias: 0.12, twist: 0.005 },
      { y: 0.22, radiusX: 0.235, radiusZ: 0.17, offsetZ: 0, frontBias: 0.05, outerBias: 0.07, twist: 0.025 },
      { y: 0.4, radiusX: 0.19, radiusZ: 0.145, offsetZ: -0.004, frontBias: 0.04, outerBias: 0.04, twist: 0.035 },
      { y: 0.5, radiusX: 0.2, radiusZ: 0.15, offsetZ: -0.004, frontBias: 0.04, outerBias: 0.04, twist: 0.035 },
    ], 10, Math.PI / 10, true, false),
    materials.undersuit,
    hips,
  );

  const spine = joint("hero-spine");
  spine.position.y = 0.18;
  hips.add(spine);
  const chest = joint("hero-chest");
  chest.position.y = 0.42;
  spine.add(chest);
  mesh(
    "hero-v5-rib-shoulder-shell",
    createSculptedGeometry([
      { y: -0.46, radiusX: 0.205, radiusZ: 0.155, offsetZ: -0.008, frontBias: 0.04, outerBias: 0.04, twist: 0.025 },
      { y: -0.25, radiusX: 0.19, radiusZ: 0.15, offsetZ: -0.004, frontBias: 0.04, outerBias: 0.04, twist: 0.035 },
      { y: -0.02, radiusX: 0.29, radiusZ: 0.195, offsetZ: 0.008, frontBias: 0.11, outerBias: 0.1, twist: 0.01 },
      { y: 0.22, radiusX: 0.395, radiusZ: 0.22, offsetZ: 0.006, frontBias: 0.1, outerBias: 0.14, twist: 0.015 },
      { y: 0.4, radiusX: 0.285, radiusZ: 0.175, offsetZ: -0.012, frontBias: 0.02, outerBias: 0.06, twist: 0.035 },
      { y: 0.52, radiusX: 0.19, radiusZ: 0.145, offsetZ: -0.02, frontBias: -0.02, outerBias: 0.03, twist: 0.045 },
    ], 10, Math.PI / 10, false, false),
    materials.undersuit,
    chest,
  );
  mesh(
    "hero-single-large-sternum-shell",
    createPlateGeometry([
      [-0.36, 0.22], [0, -0.14], [0.36, 0.22], [0.29, 0.45],
      [0.08, 0.59], [0, 0.55], [-0.08, 0.59], [-0.29, 0.45],
    ], 0.032),
    materials.armor,
    chest,
    [0, 0.015, 0.205],
  );

  const neck = joint("hero-neck");
  neck.position.y = 0.48;
  chest.add(neck);
  mesh(
    "hero-neck-continuous-shell",
    createSculptedGeometry([
      { y: -0.065, radiusX: 0.16, radiusZ: 0.145, offsetZ: -0.015, frontBias: 0.04, outerBias: 0.07 },
      { y: 0.005, radiusX: 0.145, radiusZ: 0.135, offsetZ: -0.005, frontBias: 0.08, outerBias: 0.05, twist: 0.025 },
      { y: 0.085, radiusX: 0.125, radiusZ: 0.12, offsetZ: 0.002, frontBias: 0.05, outerBias: 0.03, twist: 0.045 },
      { y: 0.17, radiusX: 0.112, radiusZ: 0.105, offsetZ: -0.01, frontBias: -0.025, twist: 0.055 },
    ], 8, Math.PI / 10, false, false),
    materials.undersuit,
    neck,
  );

  const head = joint("hero-head");
  // V5 uses a near eight-head fashion proportion. Scale the helmet down while
  // raising its pivot so the 3.3m crown height and existing rig remain stable.
  head.position.y = 0.194;
  head.scale.set(0.92, 0.86, 0.92);
  neck.add(head);
  addHelmet(head, materials);

  const leftArm = addArm(-1, chest, materials);
  const rightArm = addArm(1, chest, materials);
  const leftLeg = addLeg(-1, hips, materials);
  const rightLeg = addLeg(1, hips, materials);

  const swordPivot = joint("hero-sword-pivot");
  swordPivot.position.set(0, -0.12, 0.025);
  rightArm.hand.add(swordPivot);
  const swordRestOrientation = joint("hero-sword-rest-orientation");
  swordPivot.add(swordRestOrientation);
  const { sword, blade } = addSword(swordRestOrientation, materials);

  const rig: HeroRig = {
    rootMotion,
    hips,
    spine,
    chest,
    neck,
    head,
    leftShoulder: leftArm.shoulder,
    rightShoulder: rightArm.shoulder,
    leftUpperArm: leftArm.upperArm,
    rightUpperArm: rightArm.upperArm,
    leftForearm: leftArm.forearm,
    rightForearm: rightArm.forearm,
    leftHand: leftArm.hand,
    rightHand: rightArm.hand,
    leftUpperLeg: leftLeg.upperLeg,
    rightUpperLeg: rightLeg.upperLeg,
    leftShin: leftLeg.shin,
    rightShin: rightLeg.shin,
    leftFoot: leftLeg.foot,
    rightFoot: rightLeg.foot,
    swordPivot,
  };

  applyCombatRestPose(rig);
  orientRestBladeForAuthoredIdle(swordRestOrientation);
  groundCombatStance(root, rig);

  root.userData.heroHeight = 3.3;
  root.userData.forwardAxis = "+Z";
  visualRoot.userData.afterimageSource = true;
  return {
    root,
    visualRoot,
    rig,
    swordHand: rightArm.hand,
    sword,
    blade,
    energyMaterials: [materials.optic, materials.bladeEnergy],
  };
}
