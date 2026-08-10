import * as THREE from "three";
import { toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * Formal Vermilion Enforcer character.
 *
 * This module deliberately avoids primitive Box/Capsule/Sphere geometry. Every
 * visible solid is built from a small, hand-authored faceted BufferGeometry and
 * shared between character instances. The joint graph remains independent from
 * the visible modules so gameplay animation and delayed modular dismemberment do
 * not have to fight the model hierarchy.
 */

type Vec3Tuple = readonly [x: number, y: number, z: number];

interface RingSection {
  readonly y: number;
  readonly radiusX: number;
  readonly radiusZ: number;
  readonly offsetX?: number;
  readonly offsetZ?: number;
  readonly twist?: number;
}

export interface EnemyRig {
  readonly rootMotion: THREE.Group;
  readonly hips: THREE.Group;
  readonly spine: THREE.Group;
  readonly chest: THREE.Group;
  readonly neck: THREE.Group;
  readonly head: THREE.Group;
  readonly leftShoulder: THREE.Group;
  readonly rightShoulder: THREE.Group;
  readonly leftUpperArm: THREE.Group;
  readonly rightUpperArm: THREE.Group;
  readonly leftForearm: THREE.Group;
  readonly rightForearm: THREE.Group;
  readonly leftHand: THREE.Group;
  readonly rightHand: THREE.Group;
  readonly leftUpperLeg: THREE.Group;
  readonly rightUpperLeg: THREE.Group;
  readonly leftShin: THREE.Group;
  readonly rightShin: THREE.Group;
  readonly leftFoot: THREE.Group;
  readonly rightFoot: THREE.Group;
  readonly weaponPivot: THREE.Group;
}

export interface EnemyDeathModules {
  readonly head: THREE.Group;
  readonly upperTorso: THREE.Group;
  readonly pelvis: THREE.Group;
  readonly leftArm: THREE.Group;
  readonly rightArm: THREE.Group;
  readonly leftLeg: THREE.Group;
  readonly rightLeg: THREE.Group;
}

export interface EnemyCutSeam {
  /** Parent group attached to the upper-torso module. Hidden during normal play. */
  readonly root: THREE.Group;
  /** Dark physical split that prevents the effect from reading as a floating laser. */
  readonly diagonal: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  /** Bright inner heat edge, intended to be faded in before module separation. */
  readonly heatEdge: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  setVisible(visible: boolean): void;
  setHeat(amount: number): void;
  /** Disposes only the seam's per-instance animated material. */
  dispose(): void;
}

export interface EnemyCharacter {
  readonly root: THREE.Group;
  readonly rig: EnemyRig;
  readonly energyMaterials: readonly THREE.MeshStandardMaterial[];
  readonly deathModules: EnemyDeathModules;
  readonly cutSeam: EnemyCutSeam;
}

const COLOR = {
  // The enemy intentionally uses only two dark body values. Lighting and the
  // large physical planes describe the form; small colour facets do not.
  undersuit: 0x12181b,
  armorBlack: 0x293136,
  armorGraphite: 0x293136,
  armorPlane: 0x293136,
  armorEdge: 0x293136,
  recess: 0x12181b,
  vermilion: 0xc73518,
  vermilionLight: 0xc73518,
  bladeBlack: 0x293136,
} as const;

// Neutral-pose crown: neck 2.564 + head origin 0.163 + 0.43m helmet geometry
// at V5 scale 1.0 = 3.157m.
const CHARACTER_HEIGHT = 3.157;

class FacetBuilder {
  private readonly positions: number[] = [];
  private readonly colors: number[] = [];
  private readonly indices: number[] = [];
  private continuousSurface = false;

  private pushVertex(position: Vec3Tuple, color: number): number {
    const index = this.positions.length / 3;
    this.positions.push(position[0], position[1], position[2]);
    const displayColor = new THREE.Color(color);
    this.colors.push(displayColor.r, displayColor.g, displayColor.b);
    return index;
  }

  addTriangle(a: Vec3Tuple, b: Vec3Tuple, c: Vec3Tuple, color: number): this {
    const offset = this.pushVertex(a, color);
    this.pushVertex(b, color);
    this.pushVertex(c, color);
    this.indices.push(offset, offset + 1, offset + 2);
    return this;
  }

  addQuad(
    a: Vec3Tuple,
    b: Vec3Tuple,
    c: Vec3Tuple,
    d: Vec3Tuple,
    color: number,
    flipDiagonal = false,
  ): this {
    const offset = this.pushVertex(a, color);
    this.pushVertex(b, color);
    this.pushVertex(c, color);
    this.pushVertex(d, color);
    if (flipDiagonal) {
      this.indices.push(offset, offset + 1, offset + 3, offset + 1, offset + 2, offset + 3);
    } else {
      this.indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
    }
    return this;
  }

  addRingBody(
    sections: readonly RingSection[],
    sides: number,
    sideColors: readonly number[],
    capColor: number,
    capBottom = true,
    capTop = true,
  ): this {
    this.continuousSurface = true;
    const spansPerLandmark = 3;
    const sample = (key: keyof RingSection, index: number, t: number) => {
      const p0 = Number(sections[Math.max(0, index - 1)]?.[key] ?? 0);
      const p1 = Number(sections[index]?.[key] ?? 0);
      const p2 = Number(sections[Math.min(sections.length - 1, index + 1)]?.[key] ?? 0);
      const p3 = Number(sections[Math.min(sections.length - 1, index + 2)]?.[key] ?? 0);
      const t2 = t * t;
      const t3 = t2 * t;
      return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
    };
    const refinedSections: RingSection[] = [];
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
          twist: sample("twist", index, t),
        });
      }
    }
    const refinedSides = Math.max(10, sides + 2);
    const rings = refinedSections.map((section) => {
      const points: Vec3Tuple[] = [];
      for (let index = 0; index < refinedSides; index += 1) {
        const angle = (index / refinedSides) * Math.PI * 2 + (section.twist ?? 0);
        points.push([
          Math.cos(angle) * section.radiusX + (section.offsetX ?? 0),
          section.y,
          Math.sin(angle) * section.radiusZ + (section.offsetZ ?? 0),
        ]);
      }
      return points;
    });

    for (let ringIndex = 0; ringIndex < rings.length - 1; ringIndex += 1) {
      const lower = rings[ringIndex];
      const upper = rings[ringIndex + 1];
      if (!lower || !upper) continue;
      for (let side = 0; side < refinedSides; side += 1) {
        const next = (side + 1) % refinedSides;
        const color = sideColors[side % sideColors.length] ?? COLOR.armorGraphite;
        const lowerSide = lower[side];
        const upperSide = upper[side];
        const upperNext = upper[next];
        const lowerNext = lower[next];
        if (!lowerSide || !upperSide || !upperNext || !lowerNext) continue;
        // Winding points away from the body for sections ordered bottom-to-top.
        this.addQuad(lowerSide, upperSide, upperNext, lowerNext, color, (side + ringIndex) % 2 === 0);
      }
    }

    const bottom = rings[0];
    const top = rings[rings.length - 1];
    const firstSection = refinedSections[0];
    const lastSection = refinedSections[refinedSections.length - 1];
    if (!bottom || !top || !firstSection || !lastSection) return this;

    const bottomCenter: Vec3Tuple = [
      firstSection.offsetX ?? 0,
      firstSection.y,
      firstSection.offsetZ ?? 0,
    ];
    const topCenter: Vec3Tuple = [lastSection.offsetX ?? 0, lastSection.y, lastSection.offsetZ ?? 0];
    for (let side = 0; side < refinedSides; side += 1) {
      const next = (side + 1) % refinedSides;
      const bottomSide = bottom[side];
      const bottomNext = bottom[next];
      const topSide = top[side];
      const topNext = top[next];
      if (!bottomSide || !bottomNext || !topSide || !topNext) continue;
      if (capBottom) this.addTriangle(bottomCenter, bottomSide, bottomNext, capColor);
      if (capTop) this.addTriangle(topCenter, topNext, topSide, capColor);
    }
    return this;
  }

  addExtrudedPolygon(
    polygon: readonly (readonly [x: number, y: number])[],
    zMin: number,
    zMax: number,
    frontColor: number | readonly number[],
    sideColor?: number,
    backColor?: number,
  ): this {
    if (polygon.length < 3) return this;
    const firstFrontColor = typeof frontColor === "number" ? frontColor : (frontColor[0] ?? 0xffffff);
    const resolvedSideColor = sideColor ?? firstFrontColor;
    const resolvedBackColor = backColor ?? resolvedSideColor;
    const signedArea = polygon.reduce((area, point, index) => {
      const next = polygon[(index + 1) % polygon.length];
      return next ? area + point[0] * next[1] - next[0] * point[1] : area;
    }, 0);
    const isCounterClockwise = signedArea > 0;
    const frontCenter: Vec3Tuple = [
      polygon.reduce((sum, point) => sum + point[0], 0) / polygon.length,
      polygon.reduce((sum, point) => sum + point[1], 0) / polygon.length,
      zMax,
    ];
    const backCenter: Vec3Tuple = [frontCenter[0], frontCenter[1], zMin];

    for (let index = 0; index < polygon.length; index += 1) {
      const next = (index + 1) % polygon.length;
      const point = polygon[index];
      const nextPoint = polygon[next];
      if (!point || !nextPoint) continue;
      const front: Vec3Tuple = [point[0], point[1], zMax];
      const frontNext: Vec3Tuple = [nextPoint[0], nextPoint[1], zMax];
      const back: Vec3Tuple = [point[0], point[1], zMin];
      const backNext: Vec3Tuple = [nextPoint[0], nextPoint[1], zMin];
      const resolvedFrontColor =
        typeof frontColor === "number" ? frontColor : (frontColor[index % frontColor.length] ?? firstFrontColor);
      if (isCounterClockwise) {
        this.addTriangle(frontCenter, front, frontNext, resolvedFrontColor);
        this.addTriangle(backCenter, backNext, back, resolvedBackColor);
        this.addQuad(front, back, backNext, frontNext, resolvedSideColor, index % 2 === 0);
      } else {
        this.addTriangle(frontCenter, frontNext, front, resolvedFrontColor);
        this.addTriangle(backCenter, back, backNext, resolvedBackColor);
        this.addQuad(frontNext, backNext, back, front, resolvedSideColor, index % 2 === 0);
      }
    }
    return this;
  }

  /**
   * A low-poly solid with a broad central plane and a narrow authored chamfer.
   * It is used for the shoulder caps so they retain an armour-shell read rather
   * than becoming either a sphere or a featureless cardboard extrusion.
   */
  addBeveledExtrudedPolygon(
    polygon: readonly (readonly [x: number, y: number])[],
    zMin: number,
    zMax: number,
    bevel: number,
    color: number,
  ): this {
    if (polygon.length < 3) return this;
    const center: readonly [number, number] = [
      polygon.reduce((sum, point) => sum + point[0], 0) / polygon.length,
      polygon.reduce((sum, point) => sum + point[1], 0) / polygon.length,
    ];
    const inset = (point: readonly [number, number]): readonly [number, number] => [
      center[0] + (point[0] - center[0]) * 0.78,
      center[1] + (point[1] - center[1]) * 0.78,
    ];
    const signedArea = polygon.reduce((area, point, index) => {
      const next = polygon[(index + 1) % polygon.length];
      return next ? area + point[0] * next[1] - next[0] * point[1] : area;
    }, 0);
    const ccw = signedArea > 0;
    const frontCenter: Vec3Tuple = [center[0], center[1], zMax];
    const backCenter: Vec3Tuple = [center[0], center[1], zMin];
    for (let index = 0; index < polygon.length; index += 1) {
      const next = (index + 1) % polygon.length;
      const outer = polygon[index];
      const outerNext = polygon[next];
      if (!outer || !outerNext) continue;
      const inner = inset(outer);
      const innerNext = inset(outerNext);
      const outerFront: Vec3Tuple = [outer[0], outer[1], zMax - bevel];
      const outerFrontNext: Vec3Tuple = [outerNext[0], outerNext[1], zMax - bevel];
      const innerFront: Vec3Tuple = [inner[0], inner[1], zMax];
      const innerFrontNext: Vec3Tuple = [innerNext[0], innerNext[1], zMax];
      const outerBack: Vec3Tuple = [outer[0], outer[1], zMin + bevel];
      const outerBackNext: Vec3Tuple = [outerNext[0], outerNext[1], zMin + bevel];
      const innerBack: Vec3Tuple = [inner[0], inner[1], zMin];
      const innerBackNext: Vec3Tuple = [innerNext[0], innerNext[1], zMin];
      if (ccw) {
        this.addTriangle(frontCenter, innerFront, innerFrontNext, color);
        this.addTriangle(backCenter, innerBackNext, innerBack, color);
        this.addQuad(outerFront, outerFrontNext, innerFrontNext, innerFront, color);
        this.addQuad(innerBack, innerBackNext, outerBackNext, outerBack, color);
        this.addQuad(outerFront, outerBack, outerBackNext, outerFrontNext, color);
      } else {
        this.addTriangle(frontCenter, innerFrontNext, innerFront, color);
        this.addTriangle(backCenter, innerBack, innerBackNext, color);
        this.addQuad(innerFront, innerFrontNext, outerFrontNext, outerFront, color);
        this.addQuad(outerBack, outerBackNext, innerBackNext, innerBack, color);
        this.addQuad(outerFrontNext, outerBackNext, outerBack, outerFront, color);
      }
    }
    return this;
  }

  addSkewedPrism(
    min: Vec3Tuple,
    max: Vec3Tuple,
    topInset: readonly [x: number, z: number],
    colors: readonly number[],
  ): this {
    const [minX, minY, minZ] = min;
    const [maxX, maxY, maxZ] = max;
    const [insetX, insetZ] = topInset;
    const bottom: readonly Vec3Tuple[] = [
      [minX, minY, minZ],
      [maxX, minY, minZ],
      [maxX, minY, maxZ],
      [minX, minY, maxZ],
    ];
    const top: readonly Vec3Tuple[] = [
      [minX + insetX, maxY, minZ + insetZ],
      [maxX - insetX, maxY, minZ + insetZ],
      [maxX - insetX, maxY, maxZ - insetZ],
      [minX + insetX, maxY, maxZ - insetZ],
    ];
    const colorAt = (index: number) => colors[index % colors.length] ?? COLOR.armorGraphite;
    this.addQuad(bottom[0]!, bottom[3]!, bottom[2]!, bottom[1]!, colorAt(0));
    this.addQuad(top[0]!, top[1]!, top[2]!, top[3]!, colorAt(1));
    for (let side = 0; side < 4; side += 1) {
      const next = (side + 1) % 4;
      this.addQuad(bottom[side]!, bottom[next]!, top[next]!, top[side]!, colorAt(side + 2), side % 2 === 0);
    }
    return this;
  }

  build(name: string): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.name = name;
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.setIndex(this.indices);
    geometry.computeVertexNormals();
    const result = this.continuousSurface
      ? toCreasedNormals(geometry, THREE.MathUtils.degToRad(26))
      : geometry;
    result.name = name;
    result.computeBoundingBox();
    result.computeBoundingSphere();
    return result;
  }
}

function createDiagonalCutBandGeometry(
  name: string,
  halfWidth: number,
  radiusX: number,
  radiusZ: number,
): THREE.BufferGeometry {
  const builder = new FacetBuilder();
  const sides = 12;
  const lower: Vec3Tuple[] = [];
  const upper: Vec3Tuple[] = [];
  for (let index = 0; index < sides; index += 1) {
    const angle = (index / sides) * Math.PI * 2;
    const x = Math.cos(angle) * radiusX;
    const z = Math.sin(angle) * radiusZ;
    const centerY = 0.02 - x * 0.18;
    lower.push([x, centerY - halfWidth, z]);
    upper.push([x, centerY + halfWidth, z]);
  }
  for (let index = 0; index < sides; index += 1) {
    const next = (index + 1) % sides;
    builder.addQuad(lower[index]!, upper[index]!, upper[next]!, lower[next]!, 0xffffff);
  }
  return builder.build(name);
}

function makePelvisGeometry(): THREE.BufferGeometry {
  return new FacetBuilder()
    // The lower core uses the same faceted, wrapping volume as the waist. It
    // deliberately has no front plate, so the cut module cannot read as a
    // floating abdominal trapezoid before it separates on death.
    .addRingBody(
      [
        { y: -0.16, radiusX: 0.25, radiusZ: 0.17, offsetZ: 0.015, twist: Math.PI / 8 },
        { y: 0.015, radiusX: 0.36, radiusZ: 0.205, offsetZ: 0.01 },
        { y: 0.17, radiusX: 0.34, radiusZ: 0.19, offsetZ: 0.01, twist: Math.PI / 8 },
        { y: 0.255, radiusX: 0.30, radiusZ: 0.18, offsetZ: 0.01 },
      ],
      10,
      [COLOR.undersuit],
      COLOR.undersuit,
      false,
      false,
    )
    .build("enemy-pelvis-core-continuation");
}

function makeSpineGeometry(): THREE.BufferGeometry {
  return new FacetBuilder()
    .addRingBody(
      [
        // The inner body is one inverted-cone core: broad at pelvis and chest,
        // compact through the waist. Its overlap with both modules removes the
        // old front-facing stack of three trapezoids.
        { y: -0.18, radiusX: 0.32, radiusZ: 0.19, offsetZ: 0.005, twist: Math.PI / 8 },
        { y: -0.01, radiusX: 0.30, radiusZ: 0.18, offsetZ: 0.02 },
        { y: 0.15, radiusX: 0.255, radiusZ: 0.165, offsetZ: 0.04, twist: Math.PI / 8 },
        { y: 0.32, radiusX: 0.35, radiusZ: 0.205, offsetZ: 0.03 },
        { y: 0.44, radiusX: 0.47, radiusZ: 0.235, offsetZ: 0.005, twist: Math.PI / 8 },
      ],
      10,
      [COLOR.undersuit],
      COLOR.undersuit,
      false,
      false,
    )
    .build("enemy-continuous-inverted-cone-core");
}

function makeChestGeometry(): THREE.BufferGeometry {
  return new FacetBuilder()
    // V5 upper body is a continuous rib/shoulder shell tied to the chest joint.
    // Open ends bury into the waist core and collar, so leaning never exposes a
    // flat disc or a floating breastplate.
    .addRingBody(
      [
        { y: -0.29, radiusX: 0.33, radiusZ: 0.205, offsetZ: 0.012, twist: Math.PI / 10 },
        { y: -0.14, radiusX: 0.295, radiusZ: 0.195, offsetZ: 0.022 },
        { y: 0.07, radiusX: 0.45, radiusZ: 0.25, offsetZ: 0.018, twist: Math.PI / 10 },
        { y: 0.3, radiusX: 0.57, radiusZ: 0.285, offsetZ: 0.004 },
        { y: 0.46, radiusX: 0.34, radiusZ: 0.22, offsetZ: -0.012, twist: Math.PI / 10 },
        { y: 0.53, radiusX: 0.27, radiusZ: 0.19, offsetZ: -0.018, twist: Math.PI / 10 },
      ],
      10,
      [COLOR.armorBlack],
      COLOR.armorBlack,
      false,
      false,
    )
    .build("enemy-v5-continuous-rib-shoulder-shell");
}

function makeChestAccentGeometry(): THREE.BufferGeometry {
  return new FacetBuilder()
    .addExtrudedPolygon(
      [
        // Single, unbroken painted armour block. The outer corners sit inside
        // the rib shell, so it reads as armour integrated into the chest.
        [-0.40, 0.265],
        [-0.275, 0.365],
        [0, 0.08],
        [0.275, 0.365],
        [0.40, 0.265],
        [0, -0.16],
      ],
      0.296,
      0.312,
      COLOR.vermilion,
      COLOR.vermilion,
      COLOR.vermilion,
    )
    .build("enemy-vermilion-chest-continuous-block");
}

function makeCollarGeometry(): THREE.BufferGeometry {
  return new FacetBuilder()
    .addRingBody(
      [
        { y: -0.105, radiusX: 0.30, radiusZ: 0.22, offsetZ: -0.01, twist: Math.PI / 8 },
        { y: 0.02, radiusX: 0.23, radiusZ: 0.175, offsetZ: 0.01 },
        { y: 0.19, radiusX: 0.16, radiusZ: 0.125, offsetZ: 0.02, twist: Math.PI / 8 },
      ],
      8,
      [COLOR.armorBlack],
      COLOR.armorBlack,
      false,
      false,
    )
    .build("enemy-collar-shell");
}

function makeHelmetGeometry(): THREE.BufferGeometry {
  const builder = new FacetBuilder();
  builder.addRingBody(
    [
      // Four low-sided sections make a short brow-forward wedge, not an orb.
      { y: 0, radiusX: 0.15, radiusZ: 0.15, offsetZ: 0.04, twist: Math.PI / 8 },
      { y: 0.105, radiusX: 0.235, radiusZ: 0.245, offsetZ: 0.065 },
      { y: 0.285, radiusX: 0.235, radiusZ: 0.225, offsetZ: 0.01, twist: Math.PI / 8 },
      { y: 0.39, radiusX: 0.17, radiusZ: 0.15, offsetZ: -0.025 },
      { y: 0.43, radiusX: 0.09, radiusZ: 0.085, offsetZ: -0.025, twist: Math.PI / 8 },
    ],
    8,
    [COLOR.armorBlack],
    COLOR.armorBlack,
  );
  // The single forward face is a planar continuation of the helmet hull, not a
  // second floating mask or jaw module.
  builder.addExtrudedPolygon(
    [
      [-0.14, 0.02],
      [-0.22, 0.12],
      [-0.18, 0.29],
      [0, 0.355],
      [0.18, 0.29],
      [0.22, 0.12],
      [0.14, 0.02],
    ],
    0.19,
    0.285,
    COLOR.armorBlack,
    COLOR.armorBlack,
  );
  return builder.build("enemy-helmet-wedge-faceted");
}

function makeSensorGeometry(): THREE.BufferGeometry {
  return new FacetBuilder()
    .addExtrudedPolygon(
      [
        [-0.175, 0.19],
        [-0.055, 0.166],
        [0.055, 0.166],
        [0.175, 0.19],
        [0.16, 0.225],
        [0.052, 0.202],
        [-0.052, 0.202],
        [-0.16, 0.225],
      ],
      // Keep this one semantic light in front of the helmet's face plane; it
      // must survive the 64 px read instead of disappearing inside the shell.
      0.312,
      0.334,
      0xffffff,
    )
    .build("enemy-sensor-slit");
}

function makeShoulderGeometry(accent: boolean): THREE.BufferGeometry {
  const color = accent ? COLOR.vermilion : COLOR.armorGraphite;
  return new FacetBuilder()
    // This is intentionally a hand-cut shell, not a radial dome. The long
    // inner edge buries into the rib cage while the outer peak breaks toward
    // the bicep, matching the broad armoured cap in the turnaround.
    .addBeveledExtrudedPolygon(
      [
        [-0.21, -0.12],
        [-0.24, 0.015],
        [-0.16, 0.15],
        [0.15, 0.235],
        [0.255, 0.11],
        [0.275, -0.075],
        [0.035, -0.165],
      ],
      -0.105,
      0.105,
      0.022,
      color,
    )
    .build(accent ? "enemy-left-shoulder-vermilion-block" : "enemy-right-shoulder-charcoal-block");
}

function makeUpperArmGeometry(): THREE.BufferGeometry {
  return new FacetBuilder()
    .addRingBody(
      [
        { y: -0.41, radiusX: 0.135, radiusZ: 0.13, offsetZ: 0.01, twist: Math.PI / 8 },
        { y: -0.29, radiusX: 0.17, radiusZ: 0.16, offsetZ: 0.014, twist: Math.PI / 10 },
        { y: -0.14, radiusX: 0.19, radiusZ: 0.175, offsetZ: 0.015 },
        { y: 0.005, radiusX: 0.165, radiusZ: 0.15, offsetZ: -0.008, twist: Math.PI / 10 },
        { y: 0.105, radiusX: 0.13, radiusZ: 0.125, offsetZ: -0.012, twist: Math.PI / 8 },
      ],
      10,
      [COLOR.undersuit],
      COLOR.undersuit,
      false,
      false,
    )
    .build("enemy-upper-arm-single-wedge");
}

function makeForearmCoreGeometry(): THREE.BufferGeometry {
  return new FacetBuilder()
    .addRingBody(
      [
        // One long gauntlet wedge, widest at the elbow and narrow at the wrist.
        { y: -0.405, radiusX: 0.1, radiusZ: 0.105, offsetZ: 0.02, twist: Math.PI / 8 },
        { y: -0.29, radiusX: 0.13, radiusZ: 0.135, offsetZ: 0.022, twist: Math.PI / 10 },
        { y: -0.15, radiusX: 0.18, radiusZ: 0.175, offsetZ: 0.02 },
        { y: -0.015, radiusX: 0.135, radiusZ: 0.13, offsetZ: -0.005, twist: Math.PI / 10 },
        { y: 0.07, radiusX: 0.115, radiusZ: 0.11, offsetZ: -0.015, twist: Math.PI / 8 },
      ],
      10,
      [COLOR.armorBlack],
      COLOR.armorBlack,
      false,
      false,
    )
    .build("enemy-forearm-single-gauntlet");
}

function makeHandGeometry(): THREE.BufferGeometry {
  return new FacetBuilder()
    .addRingBody(
      [
        { y: -0.22, radiusX: 0.105, radiusZ: 0.095, offsetZ: 0.025, twist: Math.PI / 8 },
        { y: -0.105, radiusX: 0.13, radiusZ: 0.13, offsetZ: 0.01 },
        { y: 0.02, radiusX: 0.08, radiusZ: 0.08, offsetZ: -0.01, twist: Math.PI / 8 },
      ],
      8,
      [COLOR.undersuit],
      COLOR.undersuit,
      true,
      false,
    )
    .build("enemy-hand-faceted");
}

function makeUpperLegGeometry(): THREE.BufferGeometry {
  return new FacetBuilder()
    .addRingBody(
      [
        // Deliberately reaches into the knee pivot: locomotion still bends at
        // the rig joint, but the neutral/read pose has no floating knee block.
        { y: -0.73, radiusX: 0.145, radiusZ: 0.155, offsetZ: 0.01, twist: Math.PI / 8 },
        { y: -0.56, radiusX: 0.175, radiusZ: 0.185, offsetZ: 0.012, twist: Math.PI / 10 },
        { y: -0.33, radiusX: 0.25, radiusZ: 0.245, offsetZ: 0.006 },
        { y: -0.11, radiusX: 0.24, radiusZ: 0.225, offsetZ: -0.006, twist: Math.PI / 10 },
        { y: 0.055, radiusX: 0.205, radiusZ: 0.195, offsetZ: -0.018, twist: Math.PI / 8 },
      ],
      10,
      [COLOR.armorBlack],
      COLOR.armorBlack,
      false,
      false,
    )
    .build("enemy-thigh-single-wedge");
}

function makeShinCoreGeometry(): THREE.BufferGeometry {
  return new FacetBuilder()
    .addRingBody(
      [
        { y: -0.64, radiusX: 0.105, radiusZ: 0.115, offsetZ: -0.005, twist: Math.PI / 8 },
        { y: -0.43, radiusX: 0.13, radiusZ: 0.14, offsetZ: 0.006, twist: Math.PI / 10 },
        { y: -0.23, radiusX: 0.19, radiusZ: 0.2, offsetZ: 0.024 },
        { y: -0.055, radiusX: 0.18, radiusZ: 0.18, offsetZ: 0.002, twist: Math.PI / 10 },
        { y: 0.08, radiusX: 0.15, radiusZ: 0.15, offsetZ: -0.01, twist: Math.PI / 8 },
      ],
      10,
      [COLOR.armorBlack],
      COLOR.armorBlack,
      false,
      false,
    )
    .build("enemy-shin-single-wedge");
}

function makeFootGeometry(): THREE.BufferGeometry {
  const builder = new FacetBuilder();
  const sections = [
    { z: -0.19, centerY: -0.055, radiusX: 0.14, radiusY: 0.16 },
    { z: -0.07, centerY: -0.025, radiusX: 0.17, radiusY: 0.18 },
    { z: 0.09, centerY: -0.045, radiusX: 0.19, radiusY: 0.16 },
    { z: 0.24, centerY: -0.09, radiusX: 0.195, radiusY: 0.115 },
    { z: 0.39, centerY: -0.125, radiusX: 0.175, radiusY: 0.075 },
  ] as const;
  const sides = 8;
  const pointAt = (section: typeof sections[number], index: number): Vec3Tuple => {
    const contour: readonly (readonly [number, number])[] = [
      [-0.68, 1], [0.68, 1], [1, 0.42], [1, -0.42],
      [0.72, -1], [-0.72, -1], [-1, -0.42], [-1, 0.42],
    ];
    const point = contour[index] ?? contour[0]!;
    return [point[0] * section.radiusX, Math.max(-0.215, section.centerY + point[1] * section.radiusY), section.z];
  };
  for (let ring = 0; ring < sections.length - 1; ring += 1) {
    for (let side = 0; side < sides; side += 1) {
      const next = (side + 1) % sides;
      builder.addQuad(
        pointAt(sections[ring]!, side),
        pointAt(sections[ring + 1]!, side),
        pointAt(sections[ring + 1]!, next),
        pointAt(sections[ring]!, next),
        COLOR.armorBlack,
        (side + ring) % 2 === 0,
      );
    }
  }
  for (let side = 0; side < sides; side += 1) {
    const next = (side + 1) % sides;
    builder.addTriangle([0, sections[0]!.centerY, sections[0]!.z], pointAt(sections[0]!, next), pointAt(sections[0]!, side), COLOR.armorBlack);
    builder.addTriangle([0, sections.at(-1)!.centerY, sections.at(-1)!.z], pointAt(sections.at(-1)!, side), pointAt(sections.at(-1)!, next), COLOR.armorBlack);
  }
  return builder.build("enemy-v5-swept-anatomical-boot");
}

function makeWeaponBodyGeometry(): THREE.BufferGeometry {
  // One uninterrupted heavy blade, with the grip cut into the same silhouette
  // rather than built as a second visible primitive.
  return new FacetBuilder()
    .addExtrudedPolygon(
    [
      [-0.21, -0.8],
      [-0.255, -0.67],
      [-0.235, 0.07],
      [-0.08, 0.28],
      [0.08, 0.28],
      [0.18, 0.14],
      [0.19, -0.7],
    ],
    -0.09,
    0.09,
    COLOR.bladeBlack,
    COLOR.armorEdge,
  )
    .build("enemy-single-heavy-cleaver");
}

function makeWeaponEdgeGeometry(): THREE.BufferGeometry {
  return new FacetBuilder()
    .addExtrudedPolygon(
      [
      [-0.221, -0.795],
      [-0.268, -0.675],
      [-0.248, 0.074],
      [-0.222, 0.082],
      [-0.239, -0.665],
      [-0.194, -0.785],
      ],
      -0.098,
      0.098,
      0xffffff,
    )
    .build("enemy-cleaver-heat-edge");
}

const sharedGeometries = {
  pelvis: makePelvisGeometry(),
  spine: makeSpineGeometry(),
  chest: makeChestGeometry(),
  chestAccent: makeChestAccentGeometry(),
  collar: makeCollarGeometry(),
  helmet: makeHelmetGeometry(),
  sensor: makeSensorGeometry(),
  leftShoulder: makeShoulderGeometry(true),
  rightShoulder: makeShoulderGeometry(false),
  upperArm: makeUpperArmGeometry(),
  forearmCore: makeForearmCoreGeometry(),
  hand: makeHandGeometry(),
  upperLeg: makeUpperLegGeometry(),
  shinCore: makeShinCoreGeometry(),
  foot: makeFootGeometry(),
  weaponBody: makeWeaponBodyGeometry(),
  weaponEdge: makeWeaponEdgeGeometry(),
  cutGap: createDiagonalCutBandGeometry("enemy-diagonal-cut-gap", 0.075, 0.37, 0.235),
  cutHeat: createDiagonalCutBandGeometry("enemy-diagonal-cut-heat", 0.045, 0.378, 0.243),
} as const;

const sharedMaterials = {
  softLayer: new THREE.MeshStandardMaterial({
    name: "enemy-soft-layer",
    color: 0x151b1e,
    roughness: 0.96,
    metalness: 0.01,
    // Facets come from the authored silhouette breaks, not a hard normal on
    // every triangulation diagonal. This keeps the handmade planes broad.
    flatShading: false,
  }),
  blackArmor: new THREE.MeshStandardMaterial({
    name: "enemy-charcoal-large-armor",
    color: 0x30383c,
    roughness: 0.82,
    metalness: 0.08,
    flatShading: false,
  }),
  vermilionArmor: new THREE.MeshStandardMaterial({
    name: "enemy-vermilion-single-matte-block",
    color: 0xc73518,
    roughness: 0.82,
    metalness: 0.03,
    flatShading: false,
  }),
  sensorHeat: new THREE.MeshStandardMaterial({
    name: "enemy-sensor-and-blade-heat",
    color: 0xff5b2e,
    emissive: 0xff2b0d,
    emissiveIntensity: 3.4,
    roughness: 0.2,
    metalness: 0.72,
    toneMapped: false,
  }),
  cutGap: new THREE.MeshStandardMaterial({
    name: "enemy-cut-gap",
    color: 0x2a0703,
    emissive: 0x5f0b03,
    emissiveIntensity: 1.2,
    roughness: 0.66,
    metalness: 0.22,
    side: THREE.DoubleSide,
  }),
  cutHeat: new THREE.MeshStandardMaterial({
    name: "enemy-cut-heat",
    color: 0xff7a3d,
    emissive: 0xff2608,
    emissiveIntensity: 0,
    roughness: 0.12,
    metalness: 0.48,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    toneMapped: false,
  }),
} as const;

function surfaceMesh(
  name: string,
  geometry: THREE.BufferGeometry,
  material: THREE.MeshStandardMaterial = sharedMaterials.blackArmor,
  castsShadow = false,
): THREE.Mesh {
  const part = new THREE.Mesh(geometry, material);
  part.name = name;
  part.castShadow = castsShadow;
  part.receiveShadow = true;
  return part;
}

function energyMesh(
  name: string,
  geometry: THREE.BufferGeometry,
  material: THREE.MeshStandardMaterial,
): THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> {
  const part = new THREE.Mesh(geometry, material);
  part.name = name;
  part.castShadow = false;
  part.receiveShadow = false;
  return part;
}

function joint(name: string, position: Vec3Tuple, parent: THREE.Object3D): THREE.Group {
  const node = new THREE.Group();
  node.name = name;
  node.position.set(position[0], position[1], position[2]);
  parent.add(node);
  return node;
}

function markDeathModule(group: THREE.Group, id: keyof EnemyDeathModules, cutPlane: string): THREE.Group {
  group.userData.deathModule = id;
  group.userData.cutPlane = cutPlane;
  group.userData.dismemberment = "delayed-rigid-module";
  group.userData.detached = false;
  return group;
}

function buildArm(
  side: "left" | "right",
  chest: THREE.Group,
): {
  shoulder: THREE.Group;
  upperArm: THREE.Group;
  forearm: THREE.Group;
  hand: THREE.Group;
} {
  // With the character facing +Z, local +X is anatomical left. This also keeps
  // the vermilion left shoulder and right-hand cleaver aligned to the turnaround.
  const sign = side === "left" ? 1 : -1;
  const shoulder = joint(`${side}-shoulder`, [sign * 0.47, 0.39, 0], chest);
  const shoulderArmor = surfaceMesh(
    `${side}-shoulder-armor`,
    side === "left" ? sharedGeometries.leftShoulder : sharedGeometries.rightShoulder,
    side === "left" ? sharedMaterials.vermilionArmor : sharedMaterials.blackArmor,
  );
  shoulderArmor.scale.x = sign;
  shoulder.add(shoulderArmor);

  const upperArm = joint(`${side}-upper-arm`, [sign * 0.055, -0.12, 0], shoulder);
  const upperArmMesh = surfaceMesh(`${side}-upper-arm-mesh`, sharedGeometries.upperArm, sharedMaterials.softLayer);
  upperArmMesh.scale.x = sign;
  upperArm.add(upperArmMesh);

  const forearm = joint(`${side}-forearm`, [0, -0.4, 0], upperArm);
  const forearmCore = surfaceMesh(`${side}-forearm-tapered-gauntlet`, sharedGeometries.forearmCore);
  forearmCore.scale.set(sign, 1, 1.02);
  forearm.add(forearmCore);

  const hand = joint(`${side}-hand`, [0, -0.4, 0], forearm);
  const handMesh = surfaceMesh(`${side}-hand-mesh`, sharedGeometries.hand, sharedMaterials.softLayer, false);
  handMesh.scale.x = sign;
  hand.add(handMesh);

  return { shoulder, upperArm, forearm, hand };
}

function buildLeg(
  side: "left" | "right",
  hips: THREE.Group,
): { upperLeg: THREE.Group; shin: THREE.Group; foot: THREE.Group } {
  const sign = side === "left" ? 1 : -1;
  const upperLeg = joint(`${side}-upper-leg`, [sign * 0.235, -0.04, 0], hips);
  const thighMesh = surfaceMesh(`${side}-thigh-mesh`, sharedGeometries.upperLeg);
  thighMesh.scale.set(sign, 1.075, 1);
  upperLeg.add(thighMesh);

  const shin = joint(`${side}-shin`, [0, -0.72, 0], upperLeg);
  const shinCore = surfaceMesh(`${side}-shin-tapered-blade`, sharedGeometries.shinCore);
  shinCore.scale.set(sign, 1.1, 1);
  shin.add(shinCore);

  const foot = joint(`${side}-foot`, [0, -0.656, 0], shin);
  const footMesh = surfaceMesh(`${side}-foot-mesh`, sharedGeometries.foot);
  footMesh.scale.set(sign * 0.92, 0.95, 0.94);
  foot.add(footMesh);
  return { upperLeg, shin, foot };
}

function createCutSeam(parent: THREE.Group): EnemyCutSeam {
  const root = new THREE.Group();
  root.name = "diagonal-cut-seam";
  root.visible = false;
  root.userData.cutDirection = new THREE.Vector3(0.9, -0.44, 0).normalize();
  root.userData.separationDelayMs = 90;

  const diagonal = energyMesh("diagonal-cut-gap", sharedGeometries.cutGap, sharedMaterials.cutGap);
  // The surface, sensor and weapon materials stay shared across the whole crowd.
  // Only the animated cut heat is per-instance, otherwise one dying enemy would
  // change the heat/opacity of every other enemy on screen.
  const heatMaterial = sharedMaterials.cutHeat.clone();
  heatMaterial.name = "enemy-cut-heat-instance";
  const heatEdge = energyMesh("diagonal-cut-heat-edge", sharedGeometries.cutHeat, heatMaterial);
  root.add(diagonal, heatEdge);
  parent.add(root);

  return {
    root,
    diagonal,
    heatEdge,
    setVisible(visible: boolean) {
      root.visible = visible;
      if (!visible) {
        heatMaterial.emissiveIntensity = 0;
        heatMaterial.opacity = 0;
      }
    },
    setHeat(amount: number) {
      const normalized = THREE.MathUtils.clamp(amount, 0, 1);
      root.visible = normalized > 0.001;
      heatMaterial.emissiveIntensity = normalized * 8.5;
      heatMaterial.opacity = normalized;
    },
    dispose() {
      heatMaterial.dispose();
    },
  };
}

/**
 * Creates a rigged, original Vermilion Enforcer.
 *
 * - Foot soles sit at y=0 in the neutral pose.
 * - The helmet crown reaches y=3.157.
 * - The character faces +Z.
 * - `variant` is intentionally silhouette-neutral; it is recorded for spawn and
 *   animation variation without mutating shared GPU resources.
 */
export function createEnemyCharacter(variant = 0): EnemyCharacter {
  const root = new THREE.Group();
  root.name = "vermilion-enforcer";
  root.userData.characterHeight = CHARACTER_HEIGHT;
  root.userData.forwardAxis = "+Z";
  root.userData.variant = Math.max(0, Math.floor(variant));
  root.userData.sharedGeometryCount = Object.keys(sharedGeometries).length;
  root.userData.sharedMaterialCount = Object.keys(sharedMaterials).length;
  root.userData.uniqueAnimatedMaterialCount = 1;

  const rootMotion = joint("root-motion", [0, 0, 0], root);
  const hips = joint("hips", [0, 1.644, 0], rootMotion);

  const pelvisModule = markDeathModule(new THREE.Group(), "pelvis", "diagonal-waist");
  pelvisModule.name = "death-module-pelvis";
  pelvisModule.add(surfaceMesh("pelvis-core-continuation", sharedGeometries.pelvis, sharedMaterials.softLayer));
  hips.add(pelvisModule);

  const spine = joint("spine", [0, 0.16, 0], hips);
  spine.add(surfaceMesh("lower-spine-soft-layer", sharedGeometries.spine, sharedMaterials.softLayer));
  const chest = joint("chest", [0, 0.31, 0], spine);

  const upperTorsoModule = markDeathModule(new THREE.Group(), "upperTorso", "diagonal-chest");
  upperTorsoModule.name = "death-module-upper-torso";
  upperTorsoModule.add(surfaceMesh("upper-torso-armor", sharedGeometries.chest));
  upperTorsoModule.add(
    surfaceMesh("vermilion-inverted-v-main-block", sharedGeometries.chestAccent, sharedMaterials.vermilionArmor),
  );
  chest.add(upperTorsoModule);

  const neck = joint("neck", [0, 0.45, 0], chest);
  neck.add(surfaceMesh("neck-collar", sharedGeometries.collar));
  // Reduce the toy-like oversized helmet without changing the locked crown.
  const head = markDeathModule(joint("head", [0, 0.163, 0], neck), "head", "neck");
  head.scale.setScalar(1);
  head.add(surfaceMesh("wedge-helmet", sharedGeometries.helmet));
  const sensor = energyMesh("red-orange-sensor-slit", sharedGeometries.sensor, sharedMaterials.sensorHeat);
  head.add(sensor);

  const leftArm = buildArm("left", chest);
  const rightArm = buildArm("right", chest);
  markDeathModule(leftArm.shoulder, "leftArm", "left-upper-arm");
  markDeathModule(rightArm.shoulder, "rightArm", "right-upper-arm");

  // A slightly asymmetric ready stance keeps the heavy silhouette readable while
  // retaining a clean, neutral rig base for later authored animation.
  leftArm.upperArm.rotation.z = 0.04;
  rightArm.upperArm.rotation.z = -0.1;
  leftArm.forearm.rotation.x = -0.035;
  rightArm.forearm.rotation.x = 0.045;
  rightArm.forearm.rotation.z = -0.045;
  rightArm.hand.rotation.z = -0.065;

  const leftLeg = buildLeg("left", hips);
  const rightLeg = buildLeg("right", hips);
  markDeathModule(leftLeg.upperLeg, "leftLeg", "left-thigh");
  markDeathModule(rightLeg.upperLeg, "rightLeg", "right-thigh");

  const weaponPivot = joint("weapon-pivot", [-0.34, -0.13, 0.04], rightArm.hand);
  weaponPivot.rotation.set(-0.14, THREE.MathUtils.degToRad(25), 0.12);
  weaponPivot.add(surfaceMesh("heavy-cleaver-body", sharedGeometries.weaponBody, sharedMaterials.blackArmor));
  const weaponHeatEdge = energyMesh(
    "heavy-cleaver-red-orange-edge",
    sharedGeometries.weaponEdge,
    sharedMaterials.sensorHeat,
  );
  weaponPivot.add(weaponHeatEdge);

  const cutSeam = createCutSeam(upperTorsoModule);

  const rig: EnemyRig = {
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
    weaponPivot,
  };

  const deathModules: EnemyDeathModules = {
    head,
    upperTorso: upperTorsoModule,
    pelvis: pelvisModule,
    leftArm: leftArm.shoulder,
    rightArm: rightArm.shoulder,
    leftLeg: leftLeg.upperLeg,
    rightLeg: rightLeg.upperLeg,
  };

  return {
    root,
    rig,
    energyMaterials: [sharedMaterials.sensorHeat, cutSeam.heatEdge.material],
    deathModules,
    cutSeam,
  };
}
