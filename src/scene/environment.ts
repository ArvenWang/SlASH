import * as THREE from "three";
import { ARENA_DEPTH, ARENA_WIDTH } from "../game/game";

export interface ArenaBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export interface EnvironmentRuntime {
  readonly root: THREE.Group;
  readonly arenaHitSurface: THREE.Object3D;
  readonly arenaBounds: ArenaBounds;
  reactToDash(start: THREE.Vector3, end: THREE.Vector3, intensity?: number): void;
  update(timeSeconds: number, dt: number): void;
  dispose(): void;
}

type BoxPlacement = {
  readonly position: readonly [number, number, number];
  readonly scale: readonly [number, number, number];
  readonly rotation?: readonly [number, number, number];
};

type Building = {
  readonly x: number;
  readonly z: number;
  readonly width: number;
  readonly depth: number;
  readonly height: number;
  readonly baseY: number;
  readonly layer: number;
};

type GroundTextures = {
  readonly albedo: THREE.Texture;
  readonly roughness: THREE.DataTexture;
};

type RainRuntime = {
  readonly points: THREE.Points;
  readonly positions: Float32Array;
  readonly basePositions: Float32Array;
  readonly speeds: Float32Array;
  readonly reactionOffsets: Float32Array;
  readonly reactionDecayRates: Float32Array;
};

type SteamRuntime = {
  readonly points: THREE.Points;
  readonly positions: Float32Array;
  readonly ages: Float32Array;
  readonly lives: Float32Array;
  readonly speeds: Float32Array;
  readonly phase: Float32Array;
  readonly ventIndices: Uint8Array;
  readonly origins: readonly THREE.Vector3[];
  readonly reactionOffsets: Float32Array;
  readonly reactionVelocities: Float32Array;
};

type GroundDashReactions = {
  readonly mesh: THREE.InstancedMesh;
  readonly alphaAttribute: THREE.InstancedBufferAttribute;
  readonly remaining: Float32Array;
  readonly durations: Float32Array;
  readonly peakAlpha: Float32Array;
  readonly transform: THREE.Object3D;
  cursor: number;
};

type TransitRuntime = {
  readonly train: THREE.Group;
  updateTraffic(timeSeconds: number): void;
};

const ARENA_BOUNDS: ArenaBounds = Object.freeze({
  minX: -ARENA_WIDTH / 2,
  maxX: ARENA_WIDTH / 2,
  minZ: -ARENA_DEPTH / 2,
  maxZ: ARENA_DEPTH / 2,
});

const TRACK_Z = -20.5;
const TRACK_Y = 10.8;
const GROUND_DASH_REACTION_CAPACITY = 8;

function mulberry32(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function smoothStep(value: number): number {
  return value * value * (3 - 2 * value);
}

function hash2(x: number, y: number, seed: number): number {
  let value = Math.imul(x, 374761393) + Math.imul(y, 668265263) + seed * 69069;
  value = (value ^ (value >>> 13)) * 1274126177;
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function valueNoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smoothStep(x - x0);
  const ty = smoothStep(y - y0);
  const a = hash2(x0, y0, seed);
  const b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed);
  const d = hash2(x0 + 1, y0 + 1, seed);
  const top = THREE.MathUtils.lerp(a, b, tx);
  const bottom = THREE.MathUtils.lerp(c, d, tx);
  return THREE.MathUtils.lerp(top, bottom, ty);
}

function createGroundTextures(): GroundTextures {
  // The roughness map describes one complete 56 x 34 m deck instead of tiling generic
  // noise field.  The high camera sees the whole arena at once, so broad drainage
  // catchments and dry service islands have to remain legible at gameplay distance.
  const size = 384;
  const albedoData = new Uint8Array(size * size * 4);
  const roughnessData = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / (size - 1);
      const v = y / (size - 1);
      const large = valueNoise(x / 104, y / 91, 17);
      const medium = valueNoise(x / 25, y / 23, 43);
      const fine = valueNoise(x / 5.5, y / 5.5, 91);
      const breakup = valueNoise((x - y * 0.22) / 37, (y + x * 0.1) / 34, 149);
      const drainRun = Math.abs(v - (0.205 + u * 0.045 + Math.sin(u * 15.7) * 0.008));
      const crossRun = Math.abs(v - (0.67 - u * 0.115 + Math.sin(u * 11.3 + 1.7) * 0.013));
      const serviceRun = Math.abs(u - (0.28 + v * 0.052 + Math.sin(v * 16.2) * 0.012));
      const channelWet = Math.max(
        1 - smoothStep(THREE.MathUtils.clamp((drainRun - 0.006) * 24, 0, 1)),
        0.72 - smoothStep(THREE.MathUtils.clamp((crossRun - 0.008) * 18, 0, 1)),
        0.64 - smoothStep(THREE.MathUtils.clamp((serviceRun - 0.009) * 17, 0, 1)),
      );
      const edgeBreak = valueNoise((x + y * 0.23) / 28, (y - x * 0.16) / 31, 311) - 0.5;
      const basinA = Math.max(0, 1 - Math.hypot((u - 0.2) / 0.19, (v - 0.35) / 0.12) + edgeBreak * 0.42);
      const basinB = Math.max(0, 1 - Math.hypot((u - 0.56) / 0.22, (v - 0.72) / 0.13) + edgeBreak * 0.38);
      const basinC = Math.max(0, 1 - Math.hypot((u - 0.82) / 0.14, (v - 0.47) / 0.18) + edgeBreak * 0.46);
      const catchment = Math.max(basinA, basinB * 0.92, basinC * 0.84);
      const brokenEdge = THREE.MathUtils.clamp((breakup - 0.43) * 1.8, 0, 1);
      const wetness = THREE.MathUtils.clamp(
        // Broad runoff still links the basins, but never becomes a black stripe across
        // the entire arena in the high gameplay camera.
        channelWet * 0.16 + catchment * (0.42 + brokenEdge * 0.22) + (large - 0.48) * 0.08,
        0,
        1,
      );
      const rainGrain = valueNoise(x / 2.7, y / 3.1, 211) * 0.018;
      // The dry-to-wet luminance split is deliberately large enough to survive fog,
      // tone mapping and a 1366 px-wide gameplay capture without lifting the whole deck.
      const colorValue = Math.round(112 - wetness * 46 + large * 7 + medium * 5 + fine * 2);
      const roughnessValue = Math.round(
        THREE.MathUtils.clamp(118 - wetness * 122 + medium * 8 + rainGrain * 156, 20, 120),
      );
      const index = (y * size + x) * 4;

      albedoData[index] = Math.round(colorValue * 0.78);
      albedoData[index + 1] = Math.round(colorValue * 0.87);
      albedoData[index + 2] = Math.round(colorValue * 0.95);
      albedoData[index + 3] = 255;

      roughnessData[index] = roughnessValue;
      roughnessData[index + 1] = roughnessValue;
      roughnessData[index + 2] = roughnessValue;
      roughnessData[index + 3] = 255;
    }
  }

  const albedo = new THREE.TextureLoader().load("/textures/arena-wet-deck-albedo-v2.png");
  albedo.name = "arena-wet-deck-albedo-v2-imagegen";
  albedo.wrapS = THREE.RepeatWrapping;
  albedo.wrapT = THREE.RepeatWrapping;
  albedo.repeat.set(1.55, 1);
  albedo.colorSpace = THREE.SRGBColorSpace;
  albedo.minFilter = THREE.LinearMipmapLinearFilter;
  albedo.magFilter = THREE.LinearFilter;
  albedo.anisotropy = 4;

  const roughness = new THREE.DataTexture(roughnessData, size, size, THREE.RGBAFormat);
  roughness.name = "arena-wet-roughness";
  roughness.wrapS = THREE.ClampToEdgeWrapping;
  roughness.wrapT = THREE.ClampToEdgeWrapping;
  roughness.colorSpace = THREE.NoColorSpace;
  roughness.minFilter = THREE.LinearMipmapLinearFilter;
  roughness.magFilter = THREE.LinearFilter;
  roughness.generateMipmaps = true;
  roughness.anisotropy = 4;
  roughness.needsUpdate = true;

  return { albedo, roughness };
}

function createRadialParticleTexture(): THREE.DataTexture {
  const size = 64;
  const data = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const nx = (x + 0.5) / size - 0.5;
      const ny = (y + 0.5) / size - 0.5;
      const distance = Math.sqrt(nx * nx + ny * ny) * 2;
      const alpha = Math.round(255 * Math.pow(Math.max(0, 1 - distance), 2.3));
      const index = (y * size + x) * 4;
      data[index] = 235;
      data[index + 1] = 245;
      data[index + 2] = 247;
      data[index + 3] = alpha;
    }
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.name = "steam-soft-particle";
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function createInstancedBoxes(
  placements: readonly BoxPlacement[],
  material: THREE.Material,
  name: string,
  castShadow = false,
  receiveShadow = false,
): THREE.InstancedMesh {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const mesh = new THREE.InstancedMesh(geometry, material, placements.length);
  const transform = new THREE.Object3D();

  mesh.name = name;
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;

  placements.forEach((placement, index) => {
    transform.position.set(...placement.position);
    transform.scale.set(...placement.scale);
    const rotation = placement.rotation ?? [0, 0, 0];
    transform.rotation.set(...rotation);
    transform.updateMatrix();
    mesh.setMatrixAt(index, transform.matrix);
  });

  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}

function createPlatform(
  root: THREE.Group,
  groundTextures: GroundTextures,
): {
  readonly hitSurface: THREE.Mesh;
  readonly beaconMaterial: THREE.MeshStandardMaterial;
} {
  const understructureMaterial = new THREE.MeshStandardMaterial({
    color: 0x080d12,
    metalness: 0.82,
    roughness: 0.38,
  });
  const floorMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x34464c,
    map: groundTextures.albedo,
    roughnessMap: groundTextures.roughness,
    roughness: 1,
    metalness: 0.42,
    envMapIntensity: 0.68,
    // Keep the sheen in the roughness map. A uniform clear coat made dry panels
    // reflect like puddles and erased the material hierarchy from the high camera.
    clearcoat: 0.08,
    clearcoatRoughness: 0.32,
    anisotropy: 0.24,
    anisotropyRotation: Math.PI / 2,
  });
  const trimMaterial = new THREE.MeshStandardMaterial({
    color: 0x111920,
    metalness: 0.9,
    roughness: 0.27,
  });
  const seamMaterial = new THREE.MeshStandardMaterial({
    color: 0x0b1115,
    metalness: 0.24,
    roughness: 0.84,
  });
  const drainFrameMaterial = new THREE.MeshStandardMaterial({
    color: 0x3d5960,
    metalness: 0.82,
    roughness: 0.34,
  });
  const repairMaterial = new THREE.MeshStandardMaterial({
    color: 0x24383e,
    emissive: 0x02080a,
    emissiveIntensity: 0.18,
    metalness: 0.6,
    roughness: 0.48,
  });
  const beaconMaterial = new THREE.MeshStandardMaterial({
    color: 0x6b1d0d,
    emissive: 0xff3a16,
    emissiveIntensity: 2.5,
    metalness: 0.24,
    roughness: 0.28,
  });

  const understructure = new THREE.Mesh(
    new THREE.BoxGeometry(ARENA_WIDTH + 4.5, 1.15, ARENA_DEPTH + 4.5),
    understructureMaterial,
  );
  understructure.name = "arena-understructure";
  understructure.position.y = -0.86;
  understructure.receiveShadow = true;
  root.add(understructure);

  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(ARENA_WIDTH, 0.55, ARENA_DEPTH, 1, 1, 1),
    floorMaterial,
  );
  floor.name = "arena-wet-deck";
  floor.position.y = -0.275;
  floor.receiveShadow = true;
  root.add(floor);

  const edgePlacements: BoxPlacement[] = [
    { position: [0, 0.08, -17.45], scale: [58, 0.24, 0.72] },
    { position: [0, 0.08, 17.45], scale: [58, 0.24, 0.72] },
    { position: [-28.45, 0.08, 0], scale: [0.72, 0.24, 34.2] },
    { position: [28.45, 0.08, 0], scale: [0.72, 0.24, 34.2] },
    { position: [-28.85, -0.2, -17.85], scale: [2.2, 1.5, 2.2] },
    { position: [28.85, -0.2, -17.85], scale: [2.2, 1.5, 2.2] },
    { position: [-28.85, -0.2, 17.85], scale: [2.2, 1.5, 2.2] },
    { position: [28.85, -0.2, 17.85], scale: [2.2, 1.5, 2.2] },
  ];
  root.add(createInstancedBoxes(edgePlacements, trimMaterial, "arena-edge-frame", true, true));

  const seamPlacements: BoxPlacement[] = [
    { position: [-10.8, 0.014, -6.3], scale: [17.1, 0.016, 0.026] },
    { position: [10.4, 0.014, -6.3], scale: [16.4, 0.016, 0.026] },
    { position: [-4.8, 0.014, 0], scale: [27.7, 0.016, 0.026] },
    { position: [15.7, 0.014, 0.34], scale: [6.8, 0.016, 0.026], rotation: [0, -0.045, 0] },
    { position: [-12.4, 0.014, 6.3], scale: [14.2, 0.016, 0.026] },
    { position: [8.4, 0.014, 6.3], scale: [21.2, 0.016, 0.026] },
  ];
  const staggeredJoints = [
    { z: -9.4, xs: [-12.5, 7.5] },
    { z: -3.15, xs: [-5.5, 14] },
    { z: 3.15, xs: [-15, 2.5, 17] },
    { z: 9.4, xs: [-8.5, 11.5] },
  ] as const;
  for (const row of staggeredJoints) {
    for (const x of row.xs) {
      seamPlacements.push({ position: [x, 0.014, row.z], scale: [0.026, 0.016, 5.7] });
    }
  }
  seamPlacements.push(
    { position: [-14.5, 0.019, -8.5], scale: [3.4, 0.018, 1.25], rotation: [0, 0.04, 0] },
    { position: [11.8, 0.019, 2.1], scale: [2.7, 0.018, 1.05], rotation: [0, -0.035, 0] },
    { position: [-4.2, 0.019, 8.7], scale: [2.2, 0.018, 0.82], rotation: [0, 0.025, 0] },
  );
  // Fine material structure now lives in the generated albedo. Avoid adding a
  // second arbitrary line grid over the physically authored panel language.

  const railPlacements: BoxPlacement[] = [
    { position: [0, 1.05, -17.95], scale: [55.8, 0.1, 0.1] },
    { position: [0, 0.42, -17.95], scale: [55.8, 0.055, 0.055] },
    { position: [-28.95, 1.05, 0], scale: [0.1, 0.1, 33.4] },
    { position: [-28.95, 0.42, 0], scale: [0.055, 0.055, 33.4] },
    { position: [28.95, 1.05, 0], scale: [0.1, 0.1, 33.4] },
    { position: [28.95, 0.42, 0], scale: [0.055, 0.055, 33.4] },
  ];
  for (let x = -27.6; x <= 27.6; x += 4.6) {
    railPlacements.push({ position: [x, 0.55, -17.95], scale: [0.11, 1.15, 0.11] });
  }
  for (const x of [-28.95, 28.95]) {
    for (let z = -15.8; z <= 15.8; z += 4.5) {
      railPlacements.push({ position: [x, 0.55, z], scale: [0.11, 1.15, 0.11] });
    }
  }
  // The fine rail rhythm should frame the arena, not project ruler-like shadow bands across play space.
  root.add(createInstancedBoxes(railPlacements, trimMaterial, "arena-safety-rails", false));

  const beaconPlacements: BoxPlacement[] = [
    // Maintenance lamps identify four access clusters, not an ornamental grid.
    { position: [-25.4, 0.3, -17.82], scale: [0.11, 0.23, 0.085] },
    { position: [-25.05, 0.3, -17.82], scale: [0.08, 0.13, 0.075] },
    { position: [9.4, 0.3, -17.82], scale: [0.11, 0.2, 0.085] },
    { position: [9.75, 0.3, -17.82], scale: [0.075, 0.11, 0.075] },
    { position: [-12.6, 0.3, 17.82], scale: [0.11, 0.2, 0.085] },
    { position: [23.3, 0.3, 17.82], scale: [0.11, 0.22, 0.085] },
    { position: [-28.82, 0.3, 7.2], scale: [0.085, 0.21, 0.11] },
    { position: [28.82, 0.3, -8.4], scale: [0.085, 0.19, 0.11] },
  ];
  root.add(createInstancedBoxes(beaconPlacements, beaconMaterial, "arena-edge-beacons"));

  const drainPlacements: BoxPlacement[] = [
    { position: [0, 0.025, -15.1], scale: [54.65, 0.028, 0.48] },
  ];
  for (let x = -27; x <= 27; x += 0.58) {
    drainPlacements.push({ position: [x, 0.042, -15.1], scale: [0.042, 0.026, 0.4] });
  }
  root.add(createInstancedBoxes(drainPlacements, seamMaterial, "arena-rear-drain"));
  root.add(createInstancedBoxes([
    { position: [0, 0.026, -15.37], scale: [54.8, 0.03, 0.052] },
    { position: [0, 0.026, -14.83], scale: [54.8, 0.03, 0.052] },
  ], drainFrameMaterial, "arena-rear-drain-channel-frame"));

  const wetTransform = new THREE.Object3D();

  const repairPlacements: BoxPlacement[] = [
    { position: [-14.6, 0.028, -3.2], scale: [3.25, 0.026, 1.52], rotation: [0, 0.055, 0] },
    { position: [9.8, 0.028, -4.4], scale: [2.2, 0.026, 1.05], rotation: [0, -0.075, 0] },
    { position: [-3.2, 0.028, 10.6], scale: [2.7, 0.026, 1.22], rotation: [0, 0.032, 0] },
  ];
  root.add(createInstancedBoxes(repairPlacements, repairMaterial, "arena-irregular-maintenance-patches"));

  const reflectionShape = new THREE.Shape();
  reflectionShape.moveTo(-0.06, -1);
  reflectionShape.lineTo(0.11, -0.72);
  reflectionShape.lineTo(0.045, -0.2);
  reflectionShape.lineTo(0.13, 0.34);
  reflectionShape.lineTo(0.035, 1);
  reflectionShape.lineTo(-0.08, 0.62);
  reflectionShape.lineTo(-0.035, 0.08);
  reflectionShape.lineTo(-0.12, -0.46);
  reflectionShape.closePath();
  const reflectionGeometry = new THREE.ShapeGeometry(reflectionShape, 1);
  reflectionGeometry.rotateX(-Math.PI / 2);
  const coldReflectionMaterial = new THREE.MeshBasicMaterial({
    color: 0x91b9bd,
    transparent: true,
    opacity: 0.17,
    depthWrite: false,
    blending: THREE.NormalBlending,
    toneMapped: true,
  });
  const coldReflectionPlacements: BoxPlacement[] = [
    { position: [-16.8, 0.033, -7.7], scale: [1.34, 1, 4.85], rotation: [0, 0.04, 0] },
    { position: [-8.3, 0.033, -7.1], scale: [1.05, 1, 3.9], rotation: [0, -0.06, 0] },
    { position: [2.2, 0.033, -6.4], scale: [1.12, 1, 5.35], rotation: [0, 0.025, 0] },
    { position: [12.5, 0.033, -7.5], scale: [0.92, 1, 4.1], rotation: [0, -0.035, 0] },
    { position: [-6.4, 0.033, 4.2], scale: [0.9, 1, 2.95], rotation: [0, 0.13, 0] },
    { position: [13.4, 0.033, 5.1], scale: [0.6, 1, 2.12], rotation: [0, -0.08, 0] },
  ];
  const coldReflections = new THREE.InstancedMesh(
    reflectionGeometry,
    coldReflectionMaterial,
    coldReflectionPlacements.length,
  );
  coldReflections.name = "arena-local-train-light-reflections";
  coldReflections.renderOrder = 2;
  coldReflectionPlacements.forEach((placement, index) => {
    wetTransform.position.set(...placement.position);
    wetTransform.rotation.set(...(placement.rotation ?? [0, 0, 0]));
    wetTransform.scale.set(...placement.scale);
    wetTransform.updateMatrix();
    coldReflections.setMatrixAt(index, wetTransform.matrix);
  });
  coldReflections.instanceMatrix.needsUpdate = true;
  coldReflections.computeBoundingSphere();
  // Generated wetness and the roughness map carry reflections without colored
  // decal strips that can be mistaken for gameplay information.

  const glintShape = new THREE.Shape();
  glintShape.moveTo(-0.18, -1);
  glintShape.lineTo(0.12, -0.82);
  glintShape.lineTo(0.24, -0.42);
  glintShape.lineTo(0.08, -0.08);
  glintShape.lineTo(0.2, 0.34);
  glintShape.lineTo(0.04, 1);
  glintShape.lineTo(-0.22, 0.7);
  glintShape.lineTo(-0.1, 0.2);
  glintShape.lineTo(-0.28, -0.32);
  glintShape.closePath();
  const glintGeometry = new THREE.ShapeGeometry(glintShape, 1);
  glintGeometry.rotateX(-Math.PI / 2);
  const glintMaterial = new THREE.MeshBasicMaterial({
    color: 0x9ebfc2,
    transparent: true,
    opacity: 0.085,
    depthWrite: false,
    blending: THREE.NormalBlending,
    toneMapped: true,
  });
  const glintPlacements: BoxPlacement[] = [
    { position: [-13.9, 0.034, -7.15], scale: [2.1, 1, 2.15], rotation: [0, 0.08, 0] },
    { position: [8.2, 0.034, -7.55], scale: [1.8, 1, 1.82], rotation: [0, -0.12, 0] },
    { position: [-6.4, 0.034, 4.75], scale: [1.55, 1, 1.45], rotation: [0, 0.24, 0] },
  ];
  const puddleGlints = new THREE.InstancedMesh(glintGeometry, glintMaterial, glintPlacements.length);
  puddleGlints.name = "arena-broken-wet-metal-glints";
  puddleGlints.renderOrder = 2;
  glintPlacements.forEach((placement, index) => {
    wetTransform.position.set(...placement.position);
    wetTransform.rotation.set(...(placement.rotation ?? [0, 0, 0]));
    wetTransform.scale.set(...placement.scale);
    wetTransform.updateMatrix();
    puddleGlints.setMatrixAt(index, wetTransform.matrix);
  });
  puddleGlints.instanceMatrix.needsUpdate = true;
  puddleGlints.computeBoundingSphere();

  const warmReflectionMaterial = new THREE.MeshBasicMaterial({
    color: 0xb85c3d,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
    blending: THREE.NormalBlending,
    toneMapped: true,
  });
  const warmReflectionPlacements: BoxPlacement[] = [
    { position: [-14.2, 0.034, -7.75], scale: [0.4, 1, 2.85], rotation: [0, 0.07, 0] },
    { position: [8.15, 0.034, -8.05], scale: [0.36, 1, 3.15], rotation: [0, -0.1, 0] },
    { position: [-6.55, 0.034, 4.8], scale: [0.28, 1, 2.2], rotation: [0, 0.22, 0] },
    { position: [13.55, 0.034, 5.25], scale: [0.24, 1, 1.75], rotation: [0, -0.08, 0] },
  ];
  const warmReflections = new THREE.InstancedMesh(
    reflectionGeometry,
    warmReflectionMaterial,
    warmReflectionPlacements.length,
  );
  warmReflections.name = "arena-local-maintenance-light-reflections";
  warmReflections.renderOrder = 2;
  warmReflectionPlacements.forEach((placement, index) => {
    wetTransform.position.set(...placement.position);
    wetTransform.rotation.set(...(placement.rotation ?? [0, 0, 0]));
    wetTransform.scale.set(...placement.scale);
    wetTransform.updateMatrix();
    warmReflections.setMatrixAt(index, wetTransform.matrix);
  });
  warmReflections.instanceMatrix.needsUpdate = true;
  warmReflections.computeBoundingSphere();

  const hitMaterial = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  hitMaterial.colorWrite = false;
  const hitSurface = new THREE.Mesh(
    new THREE.PlaneGeometry(ARENA_WIDTH, ARENA_DEPTH),
    hitMaterial,
  );
  hitSurface.name = "arena-hit-surface";
  hitSurface.rotation.x = -Math.PI / 2;
  hitSurface.position.y = 0.055;
  hitSurface.userData.isArenaHitSurface = true;
  hitSurface.userData.arenaBounds = ARENA_BOUNDS;
  root.add(hitSurface);

  return { hitSurface, beaconMaterial };
}

function createTransitArchitecture(root: THREE.Group): TransitRuntime {
  const structuralMaterial = new THREE.MeshStandardMaterial({
    color: 0x293e4a,
    emissive: 0x091a25,
    emissiveIntensity: 0.52,
    metalness: 0.88,
    roughness: 0.36,
    flatShading: true,
  });
  const innerStructureMaterial = new THREE.MeshStandardMaterial({
    color: 0x314957,
    emissive: 0x081824,
    emissiveIntensity: 0.56,
    metalness: 0.78,
    roughness: 0.34,
    flatShading: true,
  });
  const trackMaterial = new THREE.MeshStandardMaterial({
    color: 0x101c24,
    emissive: 0x040b11,
    emissiveIntensity: 0.34,
    metalness: 0.92,
    roughness: 0.3,
  });
  const trackLightMaterial = new THREE.MeshBasicMaterial({
    color: 0x6f9ca5,
    transparent: true,
    opacity: 0.52,
    toneMapped: false,
  });

  const archCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-31, -8, 0),
    new THREE.Vector3(-29, 6, 0),
    new THREE.Vector3(-24, 13.5, 0),
    new THREE.Vector3(-14, 17.2, 0),
    new THREE.Vector3(0, 19.2, 0),
    new THREE.Vector3(14, 17.2, 0),
    new THREE.Vector3(24, 13.5, 0),
    new THREE.Vector3(29, 6, 0),
    new THREE.Vector3(31, -8, 0),
  ]);
  const archGeometry = new THREE.TubeGeometry(archCurve, 80, 1.08, 7, false);
  const arches = new THREE.InstancedMesh(archGeometry, structuralMaterial, 3);
  const archTransform = new THREE.Object3D();
  arches.name = "transit-cathedral-main-arches";
  arches.castShadow = true;
  [-14.8, -39, -69].forEach((z, index) => {
    const scale = 1 + index * 0.13;
    archTransform.position.set(index === 0 ? -1.5 : 0, -index * 1.6, z);
    archTransform.scale.set(scale, scale, scale);
    archTransform.updateMatrix();
    arches.setMatrixAt(index, archTransform.matrix);
  });
  arches.instanceMatrix.needsUpdate = true;
  arches.computeBoundingSphere();
  root.add(arches);

  const innerArchGeometry = new THREE.TubeGeometry(archCurve, 72, 0.17, 5, false);
  const innerArches = new THREE.InstancedMesh(innerArchGeometry, innerStructureMaterial, 3);
  innerArches.name = "transit-cathedral-inner-ribs";
  [-14.25, -38.45, -68.45].forEach((z, index) => {
    const scale = 0.955 + index * 0.122;
    archTransform.position.set(index === 0 ? -1.5 : 0, 0.15 - index * 1.6, z);
    archTransform.scale.set(scale, scale, scale);
    archTransform.updateMatrix();
    innerArches.setMatrixAt(index, archTransform.matrix);
  });
  innerArches.instanceMatrix.needsUpdate = true;
  innerArches.computeBoundingSphere();
  root.add(innerArches);

  const secondaryStartX = -58;
  const secondaryStartZ = -72;
  const secondaryEndX = 46;
  const secondaryEndZ = -14;
  const secondaryDeltaX = secondaryEndX - secondaryStartX;
  const secondaryDeltaZ = secondaryEndZ - secondaryStartZ;
  const secondaryLength = Math.hypot(secondaryDeltaX, secondaryDeltaZ);
  const secondaryDirectionX = secondaryDeltaX / secondaryLength;
  const secondaryDirectionZ = secondaryDeltaZ / secondaryLength;
  const secondaryPerpendicularX = -secondaryDirectionZ;
  const secondaryPerpendicularZ = secondaryDirectionX;
  const secondaryMidX = (secondaryStartX + secondaryEndX) * 0.5;
  const secondaryMidZ = (secondaryStartZ + secondaryEndZ) * 0.5;
  const secondaryAngle = -Math.atan2(secondaryDeltaZ, secondaryDeltaX);
  const secondaryY = 15.8;

  const trackPlacements: BoxPlacement[] = [
    { position: [0, TRACK_Y, TRACK_Z], scale: [128, 0.7, 4.6] },
    { position: [0, TRACK_Y - 0.85, TRACK_Z], scale: [128, 0.62, 1.25] },
    { position: [0, TRACK_Y + 0.48, TRACK_Z - 1.52], scale: [128, 0.28, 0.26] },
    { position: [0, TRACK_Y + 0.48, TRACK_Z + 1.52], scale: [128, 0.28, 0.26] },
    {
      position: [secondaryMidX, secondaryY, secondaryMidZ],
      scale: [secondaryLength, 0.76, 3.8],
      rotation: [0, secondaryAngle, 0],
    },
    {
      position: [secondaryMidX, secondaryY - 0.75, secondaryMidZ],
      scale: [secondaryLength, 0.72, 0.82],
      rotation: [0, secondaryAngle, 0],
    },
    {
      position: [
        secondaryMidX + secondaryPerpendicularX * 1.26,
        secondaryY + 0.43,
        secondaryMidZ + secondaryPerpendicularZ * 1.26,
      ],
      scale: [secondaryLength, 0.2, 0.18],
      rotation: [0, secondaryAngle, 0],
    },
    {
      position: [
        secondaryMidX - secondaryPerpendicularX * 1.26,
        secondaryY + 0.43,
        secondaryMidZ - secondaryPerpendicularZ * 1.26,
      ],
      scale: [secondaryLength, 0.2, 0.18],
      rotation: [0, secondaryAngle, 0],
    },
    { position: [-39, 4.7, -4.5], scale: [28, 0.72, 5.2] },
    { position: [-39, 3.65, -4.5], scale: [28, 0.82, 1.1] },
    { position: [-52.5, 5.35, -4.5], scale: [0.55, 1.15, 6.2] },
    { position: [-25.5, 5.35, -4.5], scale: [0.55, 1.15, 6.2] },
  ];
  root.add(createInstancedBoxes(trackPlacements, trackMaterial, "elevated-transit-track", true, true));

  const trackLightPlacements: BoxPlacement[] = [
    { position: [0, TRACK_Y + 0.16, TRACK_Z + 2.31], scale: [128, 0.055, 0.055] },
    {
      position: [
        secondaryMidX - secondaryPerpendicularX * 1.61,
        secondaryY + 0.12,
        secondaryMidZ - secondaryPerpendicularZ * 1.61,
      ],
      scale: [secondaryLength, 0.045, 0.045],
      rotation: [0, secondaryAngle, 0],
    },
    { position: [-39, 4.94, -1.86], scale: [26.8, 0.04, 0.04] },
  ];
  for (const supportX of [-48, -24, 0, 24, 48]) {
    trackLightPlacements.push(
      { position: [supportX - 0.52, 3.2, TRACK_Z + 1.47], scale: [0.48, 0.04, 0.04] },
      { position: [supportX + 0.52, 8.1, TRACK_Z + 1.47], scale: [0.48, 0.04, 0.04] },
    );
  }
  root.add(createInstancedBoxes(trackLightPlacements, trackLightMaterial, "transit-guide-light"));

  const hangerPlacements: BoxPlacement[] = [];
  for (let index = 1; index <= 7; index += 1) {
    const t = 0.12 + index * 0.095;
    const point = archCurve.getPoint(t);
    if (point.y > TRACK_Y + 2) {
      const height = point.y - TRACK_Y;
      hangerPlacements.push({
        position: [point.x, TRACK_Y + height / 2, TRACK_Z - 0.25],
        scale: [0.12, height, 0.12],
      });
    }
  }
  for (let x = -52; x <= 52; x += 8) {
    hangerPlacements.push({
      position: [x, TRACK_Y - 3.3, TRACK_Z],
      scale: [0.24, 6, 0.24],
      rotation: [0, 0, (Math.floor((x + 52) / 8) % 2 === 0 ? 1 : -1) * 0.52],
    });
  }
  for (const x of [-48, -24, 0, 24, 48]) {
    hangerPlacements.push(
      { position: [x - 0.48, -0.8, TRACK_Z], scale: [0.42, 22.4, 2.45] },
      { position: [x + 0.48, -0.8, TRACK_Z], scale: [0.42, 22.4, 2.45] },
      { position: [x, TRACK_Y - 1.25, TRACK_Z], scale: [5.4, 1.05, 5.2] },
    );
    for (const [level, direction] of [[2.4, 1], [6.4, -1]] as const) {
      hangerPlacements.push(
        { position: [x, level, TRACK_Z + 1.51], scale: [3.15, 0.17, 0.24] },
        { position: [x + direction * 0.65, level + 1.55, TRACK_Z + 1.56], scale: [3.7, 0.14, 0.18], rotation: [0, 0, direction * 0.62] },
      );
    }
  }
  for (const t of [0.13, 0.36, 0.59, 0.82]) {
    const x = secondaryStartX + secondaryDeltaX * t;
    const z = secondaryStartZ + secondaryDeltaZ * t;
    const baseY = -21 + t * 4;
    const height = secondaryY - 1 - baseY;
    hangerPlacements.push(
      { position: [x, baseY + height / 2, z], scale: [1.05, height, 1.8], rotation: [0, secondaryAngle, 0] },
      { position: [x, secondaryY - 1.05, z], scale: [5.2, 0.88, 4.2], rotation: [0, secondaryAngle, 0] },
    );
  }
  hangerPlacements.push(
    { position: [-25, 16.5, -27], scale: [0.34, 0.34, 25], rotation: [0.04, 0, -0.11] },
    { position: [22, 17.5, -27], scale: [0.34, 0.34, 25], rotation: [-0.04, 0, 0.11] },
    { position: [-25.5, 8.5, -14.5], scale: [1.15, 27, 1.5], rotation: [0, 0, -0.18] },
    { position: [22.5, 8.5, -14.5], scale: [1.15, 27, 1.5], rotation: [0, 0, 0.18] },
    { position: [-49, -6.8, -4.5], scale: [1.15, 20.2, 2.1] },
    { position: [-39, -7.8, -4.5], scale: [1.15, 22.2, 2.1] },
    { position: [-29, -5.5, -4.5], scale: [1.15, 17.6, 2.1] },
    { position: [-44, 0.4, -4.5], scale: [0.32, 12.5, 0.42], rotation: [0, 0, 0.58] },
    { position: [-34, 0.4, -4.5], scale: [0.32, 12.5, 0.42], rotation: [0, 0, -0.58] },
  );
  root.add(createInstancedBoxes(hangerPlacements, innerStructureMaterial, "transit-hangers-and-truss"));

  const supportPanelPlacements: BoxPlacement[] = [];
  for (const [supportIndex, supportX] of [-48, -24, 0, 24, 48].entries()) {
    const faceZ = TRACK_Z + 1.27;
    const stagger = supportIndex % 2 === 0 ? 0.65 : -0.4;
    for (const y of [-7.2 + stagger, -1.6 - stagger, 4.4 + stagger]) {
      supportPanelPlacements.push(
        { position: [supportX - 0.48, y, faceZ], scale: [0.3, 2.15, 0.08] },
        { position: [supportX + 0.48, y + 1.2, faceZ], scale: [0.3, 1.35, 0.08] },
      );
    }
    supportPanelPlacements.push(
      { position: [supportX, -4.4 + stagger, faceZ + 0.02], scale: [1.55, 0.16, 0.09] },
      { position: [supportX, 2.1 - stagger, faceZ + 0.02], scale: [1.55, 0.16, 0.09] },
    );
  }
  root.add(createInstancedBoxes(supportPanelPlacements, trackMaterial, "transit-support-recess-panels"));

  const train = createTrain();
  root.add(train);

  const trafficGeometry = new THREE.BoxGeometry(1, 1, 1);
  const trafficMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.46,
    toneMapped: false,
  });
  const trafficCount = 11;
  const trafficFlow = new THREE.InstancedMesh(trafficGeometry, trafficMaterial, trafficCount);
  const trafficTransform = new THREE.Object3D();
  trafficFlow.name = "bridge-under-moving-maintenance-flow";
  trafficFlow.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  trafficFlow.frustumCulled = false;
  for (let index = 0; index < trafficCount; index += 1) {
    const color = index === 4 || index === 9 ? new THREE.Color(0xb66b42) : new THREE.Color(0x6a9eaa);
    trafficFlow.setColorAt(index, color);
  }
  if (trafficFlow.instanceColor) trafficFlow.instanceColor.needsUpdate = true;
  root.add(trafficFlow);

  const updateTraffic = (timeSeconds: number): void => {
    for (let index = 0; index < 6; index += 1) {
      const x = THREE.MathUtils.euclideanModulo(timeSeconds * 8.2 + index * 22, 132) - 66;
      trafficTransform.position.set(x, TRACK_Y - 1.42, TRACK_Z + 1.72);
      trafficTransform.rotation.set(0, 0, 0);
      trafficTransform.scale.set(index % 3 === 0 ? 1.35 : 0.82, 0.075, 0.075);
      trafficTransform.updateMatrix();
      trafficFlow.setMatrixAt(index, trafficTransform.matrix);
    }
    for (let index = 6; index < trafficCount; index += 1) {
      const routeIndex = index - 6;
      const progress = THREE.MathUtils.euclideanModulo(
        timeSeconds * 0.052 + routeIndex / (trafficCount - 6),
        1,
      );
      trafficTransform.position.set(
        secondaryStartX + secondaryDeltaX * progress,
        secondaryY - 0.92,
        secondaryStartZ + secondaryDeltaZ * progress,
      );
      trafficTransform.rotation.set(0, secondaryAngle, 0);
      trafficTransform.scale.set(routeIndex % 2 === 0 ? 1.1 : 0.7, 0.065, 0.065);
      trafficTransform.updateMatrix();
      trafficFlow.setMatrixAt(index, trafficTransform.matrix);
    }
    trafficFlow.instanceMatrix.needsUpdate = true;
  };
  updateTraffic(0);
  return { train, updateTraffic };
}

function createTrain(): THREE.Group {
  const train = new THREE.Group();
  train.name = "looping-transit-train";
  train.position.set(-42, TRACK_Y + 2.18, TRACK_Z);

  const bodyMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x223139,
    emissive: 0x04090c,
    emissiveIntensity: 0.2,
    metalness: 0.9,
    roughness: 0.21,
    clearcoat: 0.2,
    clearcoatRoughness: 0.18,
    anisotropy: 0.42,
    anisotropyRotation: Math.PI / 2,
  });
  const roofMaterial = new THREE.MeshStandardMaterial({
    color: 0x152127,
    emissive: 0x03070a,
    emissiveIntensity: 0.18,
    metalness: 0.95,
    roughness: 0.17,
  });
  const windowMaterial = new THREE.MeshBasicMaterial({
    color: 0x718c90,
    transparent: true,
    opacity: 0.38,
    toneMapped: true,
  });
  const guideMaterial = new THREE.MeshStandardMaterial({
    color: 0x6a8b91,
    emissive: 0x071419,
    emissiveIntensity: 0.32,
    metalness: 0.86,
    roughness: 0.18,
  });
  const headlightMaterial = new THREE.MeshBasicMaterial({
    color: 0xffb77b,
    toneMapped: false,
  });
  const connectorMaterial = new THREE.MeshStandardMaterial({
    color: 0x070c0f,
    emissive: 0x020608,
    emissiveIntensity: 0.24,
    metalness: 0.82,
    roughness: 0.56,
  });
  const wheelMaterial = new THREE.MeshStandardMaterial({
    color: 0x253840,
    emissive: 0x06141a,
    emissiveIntensity: 0.38,
    metalness: 0.9,
    roughness: 0.38,
  });

  const carPositions = [-15.2, -7.6, 0, 7.6, 15.2];
  const carGeometry = new THREE.CylinderGeometry(1, 1, 5.8, 8, 1, false);
  carGeometry.rotateZ(-Math.PI / 2);
  const carBodies = new THREE.InstancedMesh(carGeometry, bodyMaterial, carPositions.length);
  const carTransform = new THREE.Object3D();
  const carTints = [0xb8c8cc, 0xd2dcde, 0xc2d0d3, 0xd6dfe0, 0xbac9cd];
  carBodies.name = "train-five-faceted-car-bodies";
  carBodies.castShadow = true;
  carPositions.forEach((carX, carIndex) => {
    carTransform.position.set(carX, 0, 0);
    carTransform.rotation.set(0, 0, 0);
    carTransform.scale.set(1, 1.03, 1.52);
    carTransform.updateMatrix();
    carBodies.setMatrixAt(carIndex, carTransform.matrix);
    carBodies.setColorAt(carIndex, new THREE.Color(carTints[carIndex] ?? 0xffffff));
  });
  carBodies.instanceMatrix.needsUpdate = true;
  if (carBodies.instanceColor) carBodies.instanceColor.needsUpdate = true;
  carBodies.computeBoundingSphere();
  train.add(carBodies);

  const roofPlacements: BoxPlacement[] = carPositions.map((x) => ({
    position: [x, 1.12, 0],
    scale: [5.15, 0.22, 2.2],
  }));
  carPositions.forEach((carX, carIndex) => {
    roofPlacements.push(
      { position: [carX, -1.2, 0], scale: [4.95, 0.32, 2.16] },
      { position: [carX, -1.48, 0], scale: [1.36, 0.36, 1.56] },
      { position: [carX - 1.72, -1.52, 0], scale: [0.86, 0.54, 2.04] },
      { position: [carX + 1.72, -1.52, 0], scale: [0.86, 0.54, 2.04] },
    );
    const mullions = carIndex % 2 === 0 ? [-1.16, 1.12] : [-1.56, 0.2, 1.62];
    for (const mullionX of mullions) {
      roofPlacements.push(
        { position: [carX + mullionX, 0.18, 1.515], scale: [0.1, 0.74, 0.075] },
        { position: [carX + mullionX, 0.18, -1.515], scale: [0.1, 0.74, 0.075] },
      );
    }

    if (carIndex === 0) {
      roofPlacements.push({ position: [carX - 0.65, 1.43, 0], scale: [1.65, 0.4, 1.05] });
    } else if (carIndex === 1) {
      roofPlacements.push(
        { position: [carX - 1.15, 1.42, 0], scale: [1.05, 0.38, 0.92] },
        { position: [carX + 1.25, 1.42, 0], scale: [1.05, 0.38, 0.92] },
      );
    } else if (carIndex === 2) {
      roofPlacements.push(
        { position: [carX, 1.42, 0], scale: [2.15, 0.3, 1.1] },
        { position: [carX - 0.6, 1.78, 0], scale: [1.7, 0.1, 0.12], rotation: [0, 0, 0.48] },
        { position: [carX + 0.6, 1.78, 0], scale: [1.7, 0.1, 0.12], rotation: [0, 0, -0.48] },
      );
    } else if (carIndex === 3) {
      roofPlacements.push({ position: [carX + 0.45, 1.39, 0], scale: [2.65, 0.28, 0.82] });
    } else {
      roofPlacements.push(
        { position: [carX - 1.05, 1.4, 0], scale: [0.82, 0.34, 0.86] },
        { position: [carX + 1.05, 1.4, 0], scale: [0.82, 0.34, 0.86] },
      );
    }
  });
  train.add(createInstancedBoxes(roofPlacements, roofMaterial, "train-car-roofs"));

  const connectorPlacements: BoxPlacement[] = [];
  for (const jointX of [-11.4, -3.8, 3.8, 11.4]) {
    connectorPlacements.push(
      { position: [jointX, 0, 0], scale: [1.2, 1.7, 2.52] },
      { position: [jointX, -1.14, 0], scale: [1.32, 0.38, 2.02] },
    );
    for (const ribOffset of [-0.48, -0.24, 0, 0.24, 0.48]) {
      connectorPlacements.push(
        { position: [jointX + ribOffset, 0.02, 1.59], scale: [0.07, 1.84, 0.075] },
        { position: [jointX + ribOffset, 0.02, -1.59], scale: [0.07, 1.84, 0.075] },
      );
    }
  }
  for (const carX of carPositions) {
    for (const localX of [-1.72, 1.72]) {
      connectorPlacements.push(
        { position: [carX + localX, -1.16, 2.5], scale: [1.04, 0.42, 0.28] },
        { position: [carX + localX, -1.16, -2.5], scale: [1.04, 0.42, 0.28] },
      );
    }
  }
  train.add(createInstancedBoxes(connectorPlacements, connectorMaterial, "train-articulated-connection-bellows"));

  const wheelGeometry = new THREE.CylinderGeometry(0.42, 0.42, 0.18, 10, 1, false);
  wheelGeometry.rotateX(Math.PI / 2);
  const wheelPlacements: BoxPlacement[] = [];
  for (const carX of carPositions) {
    for (const localX of [-1.72, 1.72]) {
      wheelPlacements.push(
        { position: [carX + localX, -1.18, 2.58], scale: [1, 1, 1] },
        { position: [carX + localX, -1.18, -2.58], scale: [1, 1, 1] },
      );
    }
  }
  const wheels = new THREE.InstancedMesh(wheelGeometry, wheelMaterial, wheelPlacements.length);
  const wheelTransform = new THREE.Object3D();
  wheels.name = "train-visible-bogie-wheels";
  wheelPlacements.forEach((placement, index) => {
    wheelTransform.position.set(...placement.position);
    wheelTransform.updateMatrix();
    wheels.setMatrixAt(index, wheelTransform.matrix);
  });
  wheels.instanceMatrix.needsUpdate = true;
  wheels.computeBoundingSphere();
  train.add(wheels);

  const hubGeometry = new THREE.CylinderGeometry(0.14, 0.14, 0.2, 8, 1, false);
  hubGeometry.rotateX(Math.PI / 2);
  const hubPlacements: BoxPlacement[] = [];
  for (const carX of carPositions) {
    for (const localX of [-1.72, 1.72]) {
      hubPlacements.push({ position: [carX + localX, -1.18, 2.69], scale: [1, 1, 1] });
    }
  }
  const wheelHubs = new THREE.InstancedMesh(hubGeometry, guideMaterial, hubPlacements.length);
  wheelHubs.name = "train-visible-bogie-hubs";
  hubPlacements.forEach((placement, index) => {
    wheelTransform.position.set(...placement.position);
    wheelTransform.updateMatrix();
    wheelHubs.setMatrixAt(index, wheelTransform.matrix);
  });
  wheelHubs.instanceMatrix.needsUpdate = true;
  wheelHubs.computeBoundingSphere();
  train.add(wheelHubs);

  const windowPlacements: BoxPlacement[] = [];
  const carWindowSegments: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
    [[-1.32, 2.25], [1.34, 1.5]],
    [[-0.45, 4.25]],
    [[-1.5, 1.65], [0.72, 2.05]],
    [[-0.8, 3.05], [1.92, 0.95]],
    [[-1.18, 2.45], [1.5, 1.18]],
  ];
  carPositions.forEach((carX, carIndex) => {
    for (const [localX, width] of carWindowSegments[carIndex] ?? []) {
      windowPlacements.push(
        { position: [carX + localX, 0.2, 1.525], scale: [Math.min(width, 2.2), 0.48, 0.035] },
        { position: [carX + localX, 0.2, -1.525], scale: [Math.min(width, 2.2), 0.48, 0.035] },
      );
    }
  });
  windowPlacements.push(
    { position: [18.12, 0.18, 0], scale: [0.055, 0.68, 1.58] },
    { position: [-18.12, 0.18, 0], scale: [0.055, 0.68, 1.58] },
  );
  train.add(createInstancedBoxes(windowPlacements, windowMaterial, "train-windows"));

  const guidePlacements: BoxPlacement[] = [];
  carPositions.forEach((carX, carIndex) => {
    const length = 3.8 + (carIndex % 3) * 0.65;
    const offsetX = carIndex % 2 === 0 ? -0.48 : 0.34;
    guidePlacements.push(
      { position: [carX + offsetX, -0.66, 1.535], scale: [length, 0.052, 0.038] },
      { position: [carX + offsetX, -0.66, -1.535], scale: [length, 0.052, 0.038] },
      { position: [carX - 1.72, -1.18, 2.72], scale: [0.92, 0.055, 0.035] },
      { position: [carX + 1.72, -1.18, 2.72], scale: [0.92, 0.055, 0.035] },
    );
  });
  for (const jointX of [-11.4, -3.8, 3.8, 11.4]) {
    guidePlacements.push(
      { position: [jointX - 0.47, 0, 1.675], scale: [0.035, 1.48, 0.025] },
      { position: [jointX - 0.23, 0, 1.675], scale: [0.026, 1.35, 0.022] },
      { position: [jointX, 0, 1.675], scale: [0.026, 1.35, 0.022] },
      { position: [jointX + 0.23, 0, 1.675], scale: [0.026, 1.35, 0.022] },
      { position: [jointX + 0.47, 0, 1.675], scale: [0.035, 1.48, 0.025] },
    );
  }
  for (const markerX of [-17, -16.1, 13.5, 14.4, 15.3]) {
    guidePlacements.push(
      { position: [markerX, -0.48, 1.545], scale: [0.58, 0.045, 0.034], rotation: [0, 0, -0.42] },
      { position: [markerX, -0.48, -1.545], scale: [0.58, 0.045, 0.034], rotation: [0, 0, -0.42] },
    );
  }
  train.add(createInstancedBoxes(guidePlacements, guideMaterial, "train-guide-stripe"));

  const noseGeometry = new THREE.ConeGeometry(1.55, 4, 6, 1, false);
  const noses = new THREE.InstancedMesh(noseGeometry, bodyMaterial, 2);
  const noseTransform = new THREE.Object3D();
  noses.name = "train-faceted-end-caps";
  noseTransform.position.set(20.05, 0, 0);
  noseTransform.rotation.set(0, 0, -Math.PI / 2);
  noseTransform.scale.set(0.92, 1, 1);
  noseTransform.updateMatrix();
  noses.setMatrixAt(0, noseTransform.matrix);
  noseTransform.position.set(-20.05, 0, 0);
  noseTransform.rotation.set(0, 0, Math.PI / 2);
  noseTransform.updateMatrix();
  noses.setMatrixAt(1, noseTransform.matrix);
  noses.instanceMatrix.needsUpdate = true;
  noses.computeBoundingSphere();
  train.add(noses);

  const headlightPlacements: BoxPlacement[] = [
    { position: [21.92, -0.16, -0.7], scale: [0.08, 0.17, 0.34] },
    { position: [21.92, -0.16, 0.7], scale: [0.08, 0.17, 0.34] },
  ];
  train.add(createInstancedBoxes(headlightPlacements, headlightMaterial, "train-headlights"));
  return train;
}

function createCity(root: THREE.Group): THREE.MeshBasicMaterial {
  const random = mulberry32(0x51a5c17);
  const layerSettings = [
    { count: 10, nearZ: -32, farZ: -82, minX: -94, maxX: 94, minBase: -42, maxBase: -23, minH: 26, maxH: 61, minW: 7, maxW: 17, minD: 8, maxD: 20 },
    { count: 25, nearZ: -65, farZ: -126, minX: -128, maxX: 128, minBase: -58, maxBase: -32, minH: 48, maxH: 106, minW: 9, maxW: 25, minD: 10, maxD: 27 },
    { count: 42, nearZ: -112, farZ: -205, minX: -185, maxX: 185, minBase: -96, maxBase: -55, minH: 95, maxH: 205, minW: 10, maxW: 30, minD: 12, maxD: 34 },
  ] as const;
  const buildingsByLayer: Building[][] = [[], [], []];

  layerSettings.forEach((settings, layer) => {
    for (let index = 0; index < settings.count; index += 1) {
      const depthBias = Math.pow(random(), 1.12 + layer * 0.12);
      const width = THREE.MathUtils.lerp(settings.minW, settings.maxW, Math.pow(random(), 0.82));
      const depth = THREE.MathUtils.lerp(settings.minD, settings.maxD, random());
      const height = THREE.MathUtils.lerp(settings.minH, settings.maxH, Math.pow(random(), 0.72));
      let x = THREE.MathUtils.lerp(settings.minX, settings.maxX, random());
      if (layer === 0 && Math.abs(x) < 27) {
        const side = x < 0 ? -1 : 1;
        x = side * THREE.MathUtils.lerp(28, 48, random());
      }
      if (layer === 0 && x > -72 && x < -27) {
        x = random() > 0.5
          ? THREE.MathUtils.lerp(-92, -76, random())
          : THREE.MathUtils.lerp(32, 52, random());
      }
      buildingsByLayer[layer]?.push({
        x,
        z: THREE.MathUtils.lerp(settings.nearZ, settings.farZ, depthBias),
        width,
        depth,
        height,
        baseY: THREE.MathUtils.lerp(settings.minBase, settings.maxBase, random()),
        layer,
      });
    }
  });

  // Camera-left flank volumes occupy only the void outside the arena footprint.
  buildingsByLayer[0]?.push(
    { x: -34, z: -8, width: 7.5, depth: 12, height: 35, baseY: -25, layer: 0 },
    { x: -78, z: -27, width: 12, depth: 17, height: 57, baseY: -43, layer: 0 },
  );
  buildingsByLayer[1]?.push(
    { x: -94, z: -51, width: 32, depth: 34, height: 132, baseY: -91, layer: 1 },
    { x: -57, z: -83, width: 17, depth: 20, height: 91, baseY: -67, layer: 1 },
    { x: -119, z: -108, width: 26, depth: 31, height: 148, baseY: -108, layer: 1 },
    { x: 72, z: -48, width: 27, depth: 29, height: 105, baseY: -73, layer: 1 },
  );
  buildingsByLayer[2]?.push(
    { x: -84, z: -151, width: 24, depth: 28, height: 178, baseY: -125, layer: 2 },
    { x: -29, z: -184, width: 18, depth: 24, height: 196, baseY: -143, layer: 2 },
    { x: 31, z: -166, width: 21, depth: 29, height: 185, baseY: -132, layer: 2 },
  );

  const buildingMaterials = [
    new THREE.MeshStandardMaterial({ color: 0x0b171e, emissive: 0x020609, emissiveIntensity: 0.15, roughness: 0.72, metalness: 0.28 }),
    new THREE.MeshStandardMaterial({ color: 0x142f3a, emissive: 0x071923, emissiveIntensity: 0.39, roughness: 0.79, metalness: 0.17 }),
    new THREE.MeshStandardMaterial({ color: 0x234653, emissive: 0x102d39, emissiveIntensity: 0.54, roughness: 0.88, metalness: 0.08 }),
  ];

  buildingsByLayer.forEach((buildings, layer) => {
    const placements: BoxPlacement[] = [];
    buildings.forEach((building, index) => {
      const tiered = layer < 2 || index % 3 !== 1;
      if (tiered) {
        const lowerFraction = 0.52 + (index % 4) * 0.055;
        const lowerHeight = building.height * lowerFraction;
        const upperHeight = building.height - lowerHeight;
        const upperSide = index % 2 === 0 ? -1 : 1;
        placements.push(
          {
            position: [building.x, building.baseY + lowerHeight / 2, building.z],
            scale: [building.width, lowerHeight, building.depth],
          },
          {
            position: [
              building.x + upperSide * building.width * (0.045 + (index % 3) * 0.018),
              building.baseY + lowerHeight + upperHeight / 2,
              building.z - building.depth * 0.035,
            ],
            scale: [
              building.width * (0.68 + (index % 4) * 0.055),
              upperHeight,
              building.depth * (0.76 + (index % 3) * 0.08),
            ],
          },
        );
      } else {
        placements.push({
          position: [building.x, building.baseY + building.height / 2, building.z],
          scale: [building.width, building.height, building.depth],
        });
      }
      const podiumHeight = building.height * (0.16 + (index % 3) * 0.035);
      placements.push({
        position: [building.x, building.baseY + podiumHeight / 2, building.z],
        scale: [building.width * (1.18 + (index % 2) * 0.09), podiumHeight, building.depth * 1.15],
      });
      if (index % 3 !== 1) {
        const side = index % 2 === 0 ? -1 : 1;
        placements.push({
          position: [
            building.x + side * building.width * 0.47,
            building.baseY + building.height * 0.43,
            building.z - building.depth * 0.08,
          ],
          scale: [building.width * 0.22, building.height * 0.66, building.depth * 1.06],
        });
      }
    });
    const mesh = createInstancedBoxes(
      placements,
      buildingMaterials[layer] ?? buildingMaterials[2]!,
      `city-depth-layer-${layer + 1}`,
    );
    root.add(mesh);
  });

  const residentialTowers = [
    { x: -57, z: -42, baseY: -29, width: 6.4, depth: 8.8, height: 28, upperSide: -1 },
    { x: -48.5, z: -46, baseY: -28, width: 5.5, depth: 8, height: 24, upperSide: 1 },
    { x: -40.5, z: -49.5, baseY: -30, width: 7.1, depth: 9.4, height: 32, upperSide: -1 },
  ] as const;
  const residentialMaterial = new THREE.MeshStandardMaterial({
    color: 0x262b29,
    emissive: 0x0b100e,
    emissiveIntensity: 0.23,
    metalness: 0.08,
    roughness: 0.9,
    flatShading: true,
  });
  const residentialPlacements: BoxPlacement[] = [];
  for (const tower of residentialTowers) {
    const lowerHeight = tower.height * 0.64;
    const upperHeight = tower.height - lowerHeight;
    residentialPlacements.push(
      {
        position: [tower.x, tower.baseY + lowerHeight / 2, tower.z],
        scale: [tower.width, lowerHeight, tower.depth],
      },
      {
        position: [
          tower.x + tower.upperSide * tower.width * 0.1,
          tower.baseY + lowerHeight + upperHeight / 2,
          tower.z - tower.depth * 0.04,
        ],
        scale: [tower.width * 0.76, upperHeight, tower.depth * 0.82],
      },
      {
        position: [tower.x, tower.baseY + tower.height + 0.28, tower.z],
        scale: [tower.width * 0.88, 0.56, tower.depth * 0.72],
      },
    );
    for (const level of [0.29, 0.48, 0.67, 0.83]) {
      residentialPlacements.push({
        position: [tower.x, tower.baseY + tower.height * level, tower.z + 0.12],
        scale: [tower.width * (level > 0.7 ? 0.92 : 1.12), 0.2, tower.depth * 1.08],
      });
    }
  }
  root.add(createInstancedBoxes(
    residentialPlacements,
    residentialMaterial,
    "city-residential-terrace-family",
  ));

  const serviceCoreSpecs = [
    { x: -31.5, z: -51.5, baseY: -29, height: 21, radius: 3.15 },
    { x: -23.5, z: -54.5, baseY: -28, height: 18, radius: 2.55 },
  ] as const;
  const serviceCoreMaterial = new THREE.MeshStandardMaterial({
    color: 0x0a3030,
    emissive: 0x0a3032,
    emissiveIntensity: 0.52,
    metalness: 0.38,
    roughness: 0.72,
    flatShading: true,
  });
  const serviceCoreGeometry = new THREE.CylinderGeometry(0.78, 1, 1, 10, 1, false);
  const serviceCoreInstanceCount = serviceCoreSpecs.length * 4;
  const serviceCores = new THREE.InstancedMesh(
    serviceCoreGeometry,
    serviceCoreMaterial,
    serviceCoreInstanceCount,
  );
  const serviceTransform = new THREE.Object3D();
  serviceCores.name = "city-industrial-cooling-service-cores";
  let serviceInstance = 0;
  for (const [coreIndex, core] of serviceCoreSpecs.entries()) {
    const coreTint = new THREE.Color(coreIndex === 0 ? 0xa4b8b4 : 0x849d9b);
    const instances = [
      { y: core.baseY + core.height / 2, sx: core.radius, sy: core.height, sz: core.radius },
      { y: core.baseY + core.height * 0.3, sx: core.radius * 1.19, sy: 0.52, sz: core.radius * 1.19 },
      { y: core.baseY + core.height * 0.68, sx: core.radius * 1.13, sy: 0.42, sz: core.radius * 1.13 },
      { y: core.baseY + core.height + 0.18, sx: core.radius * 1.25, sy: 0.62, sz: core.radius * 1.25 },
    ];
    for (const instance of instances) {
      serviceTransform.position.set(core.x, instance.y, core.z);
      serviceTransform.scale.set(instance.sx, instance.sy, instance.sz);
      serviceTransform.updateMatrix();
      serviceCores.setMatrixAt(serviceInstance, serviceTransform.matrix);
      serviceCores.setColorAt(serviceInstance, coreTint);
      serviceInstance += 1;
    }
  }
  serviceCores.instanceMatrix.needsUpdate = true;
  if (serviceCores.instanceColor) serviceCores.instanceColor.needsUpdate = true;
  serviceCores.computeBoundingSphere();
  root.add(serviceCores);

  const landmarkX = -10;
  const landmarkZ = -59;
  const landmarkBaseY = -29;
  const controlMaterial = new THREE.MeshStandardMaterial({
    color: 0x203946,
    emissive: 0x0b2733,
    emissiveIntensity: 0.45,
    metalness: 0.72,
    roughness: 0.34,
    flatShading: true,
  });
  const controlPlacements: BoxPlacement[] = [
    { position: [landmarkX, landmarkBaseY + 14, landmarkZ], scale: [2.7, 28, 3.5] },
    { position: [landmarkX - 0.9, landmarkBaseY + 13, landmarkZ + 1.85], scale: [0.56, 20, 0.36] },
    { position: [landmarkX, landmarkBaseY + 18.8, landmarkZ + 0.25], scale: [13.6, 3.5, 6.2] },
    { position: [landmarkX, landmarkBaseY + 20.85, landmarkZ + 0.2], scale: [15.1, 0.58, 6.9] },
    { position: [landmarkX - 8.1, landmarkBaseY + 16.25, landmarkZ], scale: [5.2, 0.7, 2.3] },
    { position: [landmarkX + 8.1, landmarkBaseY + 16.25, landmarkZ], scale: [5.2, 0.7, 2.3] },
    { position: [landmarkX, landmarkBaseY + 26.6, landmarkZ], scale: [0.48, 11.5, 0.48] },
    { position: [landmarkX + 1.7, landmarkBaseY + 22.35, landmarkZ - 0.4], scale: [2.4, 1.1, 2] },
  ];
  root.add(createInstancedBoxes(
    controlPlacements,
    controlMaterial,
    "city-traffic-control-bridge-family",
  ));

  const allBuildings = buildingsByLayer.flat();
  const detailRandom = mulberry32(0xc17a11);
  const skylineDetailMaterial = new THREE.MeshStandardMaterial({
    color: 0x0d1821,
    emissive: 0x03080c,
    emissiveIntensity: 0.3,
    metalness: 0.48,
    roughness: 0.56,
  });
  const functionalLightMaterial = new THREE.MeshBasicMaterial({
    color: 0x588b91,
    transparent: true,
    opacity: 0.3,
    toneMapped: true,
  });
  const navigationLightMaterial = new THREE.MeshBasicMaterial({
    color: 0xa95432,
    transparent: true,
    opacity: 0.52,
    toneMapped: false,
  });
  const skylineDetailPlacements: BoxPlacement[] = [];
  const functionalLightPlacements: BoxPlacement[] = [];
  const navigationLightPlacements: BoxPlacement[] = [];

  for (const [coreIndex, core] of serviceCoreSpecs.entries()) {
    const frontZ = core.z + core.radius * 0.84;
    skylineDetailPlacements.push(
      {
        position: [core.x - core.radius * 0.5, core.baseY + core.height * 0.51, frontZ],
        scale: [0.22, core.height * 0.62, 0.16],
      },
      {
        position: [core.x + core.radius * 0.5, core.baseY + core.height * 0.51, frontZ],
        scale: [0.22, core.height * 0.62, 0.16],
      },
      {
        position: [core.x, core.baseY + core.height + 1.18, core.z],
        scale: [core.radius * 1.38, 1.45, core.radius * 0.74],
      },
    );
    functionalLightPlacements.push({
      position: [
        core.x + (coreIndex === 0 ? -1 : 1) * core.radius * 0.38,
        core.baseY + core.height * 0.5,
        frontZ + 0.12,
      ],
      scale: [0.11, core.height * 0.42, 0.07],
    });
    navigationLightPlacements.push({
      position: [core.x, core.baseY + core.height + 2.05, core.z],
      scale: [0.12, 0.32, 0.12],
    });
  }
  const serviceBridgeY = Math.min(
    serviceCoreSpecs[0].baseY + serviceCoreSpecs[0].height * 0.62,
    serviceCoreSpecs[1].baseY + serviceCoreSpecs[1].height * 0.62,
  );
  skylineDetailPlacements.push(
    { position: [-27.5, serviceBridgeY, -53], scale: [6.3, 0.68, 1.15], rotation: [0, 0.05, 0] },
    { position: [-27.5, serviceBridgeY - 0.72, -53], scale: [4.4, 0.2, 0.52], rotation: [0, 0.05, 0] },
  );
  functionalLightPlacements.push({
    position: [-27.5, serviceBridgeY + 0.08, -52.38],
    scale: [2.6, 0.065, 0.055],
    rotation: [0, 0.05, 0],
  });

  allBuildings.forEach((building, index) => {
    const roofY = building.baseY + building.height;
    const depthVisibility = 1 - building.layer * 0.12;

    // A shallow overhang breaks the generated-box silhouette without adding a mesh per tower.
    if (building.layer < 2 || detailRandom() > 0.28) {
      skylineDetailPlacements.push({
        position: [building.x, roofY + 0.18, building.z],
        scale: [building.width * 1.09, 0.36, building.depth * 1.08],
      });
    }

    // Uneven, offset mechanical penthouses keep the roofline from reading as a grey blockout.
    if (detailRandom() > 0.22) {
      const mechanicalHeight = THREE.MathUtils.lerp(1.4, 5.5 + building.layer * 2.5, detailRandom()) * depthVisibility;
      const offsetX = (detailRandom() - 0.5) * building.width * 0.24;
      const offsetZ = (detailRandom() - 0.5) * building.depth * 0.18;
      skylineDetailPlacements.push({
        position: [building.x + offsetX, roofY + 0.36 + mechanicalHeight / 2, building.z + offsetZ],
        scale: [building.width * THREE.MathUtils.lerp(0.38, 0.68, detailRandom()), mechanicalHeight, building.depth * THREE.MathUtils.lerp(0.4, 0.7, detailRandom())],
      });

      if (index % 4 === 1) {
        skylineDetailPlacements.push({
          position: [building.x - offsetX * 0.7, roofY + mechanicalHeight + 0.7, building.z - offsetZ * 0.5],
          scale: [building.width * 0.28, 0.95, building.depth * 0.34],
        });
      }
    }

    // Shadow breaks and recessed service slots keep the skyline from reading as repeated cyan prisms.
    if (building.layer < 2 || index % 3 === 0) {
      const facadeZ = building.z + building.depth / 2 + 0.075;
      const bandCount = building.layer === 0 ? 2 : 1 + (index % 2);
      for (let band = 0; band < bandCount; band += 1) {
        skylineDetailPlacements.push({
          position: [
            building.x + (band % 2 === 0 ? -1 : 1) * building.width * 0.06,
            building.baseY + building.height * (0.34 + band * 0.23),
            facadeZ,
          ],
          scale: [building.width * (0.58 + (index % 3) * 0.09), 0.2 + building.layer * 0.06, 0.075],
        });
      }
      if (index % 3 !== 1) {
        skylineDetailPlacements.push({
          position: [
            building.x + (index % 2 === 0 ? -1 : 1) * building.width * 0.28,
            building.baseY + building.height * 0.51,
            facadeZ + 0.015,
          ],
          scale: [0.12, building.height * 0.38, 0.08],
        });
      }
    }

    if (building.layer < 2 && detailRandom() > 0.54) {
      const stripHeight = building.height * THREE.MathUtils.lerp(0.34, 0.58, detailRandom());
      const side = detailRandom() > 0.5 ? -1 : 1;
      if (index % 3 === 0) {
        functionalLightPlacements.push({
          position: [
            building.x + side * building.width * 0.18,
            building.baseY + building.height * 0.62,
            building.z + building.depth / 2 + 0.085,
          ],
          scale: [building.width * 0.28, 0.075, 0.07],
        });
      } else {
        functionalLightPlacements.push({
          position: [
            building.x + side * building.width * 0.31,
            building.baseY + building.height * 0.52,
            building.z + building.depth / 2 + 0.085,
          ],
          scale: [0.085, stripHeight, 0.07],
        });
      }
    }

    if (building.x < -27 && building.z > -56) {
      const sideStripHeight = building.height * THREE.MathUtils.lerp(0.22, 0.38, detailRandom());
      functionalLightPlacements.push(
        {
          position: [
            building.x + building.width / 2 + 0.075,
            building.baseY + building.height * 0.5,
            building.z - building.depth * 0.18,
          ],
          scale: [0.065, sideStripHeight, 0.08],
        },
        {
          position: [
            building.x + building.width / 2 + 0.075,
            building.baseY + building.height * 0.67,
            building.z + building.depth * 0.19,
          ],
          scale: [0.065, sideStripHeight * 0.55, 0.08],
        },
      );
    }

    if (detailRandom() > 0.9) {
      const navigationHeight = THREE.MathUtils.lerp(0.32, 0.72, detailRandom());
      navigationLightPlacements.push({
        position: [building.x + building.width * 0.3, roofY + navigationHeight / 2 + 0.35, building.z],
        scale: [0.1, navigationHeight, 0.1],
      });
    }
  });

  // A few long-lived service bridges create recognizable districts without filling the view with neon.
  skylineDetailPlacements.push(
    { position: [-56, -2.5, -47], scale: [27, 0.72, 2.4], rotation: [0, 0.06, 0] },
    { position: [-54, -3.7, -47], scale: [19, 0.28, 1.25], rotation: [0, 0.06, 0] },
    { position: [47, -8.5, -70], scale: [33, 0.8, 2.6], rotation: [0, -0.05, 0] },
    { position: [48, -9.8, -70], scale: [22, 0.3, 1.3], rotation: [0, -0.05, 0] },
    { position: [-7, 2.2, -112], scale: [38, 0.68, 2.1], rotation: [0, 0.025, 0] },
  );
  functionalLightPlacements.push(
    { position: [-56, -2.08, -45.73], scale: [9.8, 0.06, 0.06], rotation: [0, 0.06, 0] },
    { position: [47, -8.02, -68.62], scale: [12.4, 0.055, 0.06], rotation: [0, -0.05, 0] },
  );

  const districtSignals = [
    { x: -40, y: 8.4, z: -66, width: 8.4 },
    { x: -14, y: 13.2, z: -88, width: 5.8 },
    { x: 18, y: 7.1, z: -72, width: 7.2 },
    { x: 48, y: 15.3, z: -101, width: 9.1 },
  ] as const;
  for (const [districtIndex, district] of districtSignals.entries()) {
    skylineDetailPlacements.push(
      { position: [district.x - district.width * 0.5, district.y - 2.3, district.z], scale: [0.28, 8.4, 0.32] },
      { position: [district.x + district.width * 0.5, district.y - 2.3, district.z], scale: [0.28, 8.4, 0.32] },
      { position: [district.x, district.y - 0.4, district.z], scale: [district.width + 1.2, 0.24, 0.5] },
    );
    functionalLightPlacements.push(
      { position: [district.x - district.width * 0.19, district.y, district.z + 0.27], scale: [district.width * 0.24, 0.07, 0.055] },
      {
        position: [
          district.x + district.width * 0.19,
          district.y + (districtIndex % 2 === 0 ? 1.15 : -1.05),
          district.z + 0.27,
        ],
        scale: [district.width * 0.18, 0.06, 0.055],
      },
    );
  }

  // The visible traffic-control family uses one observation window, one mast spine and sparse amber status lights.
  functionalLightPlacements.push(
    { position: [landmarkX - 3.5, landmarkBaseY + 18.85, landmarkZ + 3.39], scale: [4.8, 0.22, 0.07] },
    { position: [landmarkX + 3.15, landmarkBaseY + 18.85, landmarkZ + 3.39], scale: [3.6, 0.22, 0.07] },
    { position: [landmarkX - 0.9, landmarkBaseY + 12.5, landmarkZ + 1.89], scale: [0.1, 12.5, 0.07] },
  );
  navigationLightPlacements.push(
    { position: [landmarkX, landmarkBaseY + 32.5, landmarkZ], scale: [0.18, 0.46, 0.18] },
    { position: [landmarkX - 7.15, landmarkBaseY + 21.35, landmarkZ + 0.15], scale: [0.12, 0.3, 0.12] },
    { position: [landmarkX + 7.15, landmarkBaseY + 21.35, landmarkZ + 0.15], scale: [0.12, 0.3, 0.12] },
  );

  root.add(createInstancedBoxes(skylineDetailPlacements, skylineDetailMaterial, "city-rooftop-and-control-silhouettes"));
  root.add(createInstancedBoxes(functionalLightPlacements, functionalLightMaterial, "city-functional-light-strips"));
  root.add(createInstancedBoxes(navigationLightPlacements, navigationLightMaterial, "city-navigation-lights"));

  const windowGeometry = new THREE.BoxGeometry(1, 1, 1);
  const windowMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.56,
    toneMapped: false,
  });
  const windowRecords: Array<{ placement: BoxPlacement; color: THREE.Color }> = [];

  allBuildings.forEach((building, buildingIndex) => {
    const fillsCameraLeft = building.x < -27 && building.z > -62;
    const densityThreshold = building.layer === 0 ? 0.58 : building.layer === 1 ? 0.33 : 0.19;
    const hasWindowBands = fillsCameraLeft || random() > densityThreshold;
    if (!hasWindowBands) return;
    const maxBands = building.layer === 0 ? 2 : building.layer === 1 ? 3 : 4;
    const bandCount = 1 + Math.floor(random() * maxBands) + (fillsCameraLeft ? 1 : 0);
    const frontColumns = Math.max(4, Math.min(14, Math.floor(building.width / 0.9)));
    const frontSpacing = building.width / (frontColumns + 1);

    for (let band = 0; band < bandCount; band += 1) {
      const verticalRange = building.height * THREE.MathUtils.lerp(0.22, 0.8, random());
      const y = building.baseY + verticalRange;
      const windowHeight = THREE.MathUtils.lerp(0.1, 0.2, random());
      for (let column = 0; column < frontColumns; column += 1) {
        const litDensity = building.layer === 0 ? 0.46 : building.layer === 1 ? 0.61 : 0.72;
        if (random() > litDensity) continue;
        const xOffset = (column - (frontColumns - 1) / 2) * frontSpacing;
        const isWarm = random() < 0.045;
        const brightness = THREE.MathUtils.lerp(0.34, 0.64, random()) * (1 + building.layer * 0.12);
        const baseColor = isWarm ? new THREE.Color(0xe17a48) : new THREE.Color(0x8dbbc5);
        baseColor.multiplyScalar(brightness);
        windowRecords.push({
          placement: {
            position: [building.x + xOffset, y, building.z + building.depth / 2 + 0.04],
            scale: [frontSpacing * THREE.MathUtils.lerp(0.38, 0.58, random()), windowHeight, 0.065],
          },
          color: baseColor,
        });
      }
    }

    if (buildingIndex % 3 === 0 || fillsCameraLeft) {
      const sideColumns = Math.max(3, Math.min(10, Math.floor(building.depth / 1.25)));
      const sideSpacing = building.depth / (sideColumns + 1);
      const sideY = building.baseY + building.height * THREE.MathUtils.lerp(0.32, 0.72, random());
      for (let column = 0; column < sideColumns; column += 1) {
        if (random() > 0.58) continue;
        const zOffset = (column - (sideColumns - 1) / 2) * sideSpacing;
        const color = new THREE.Color(0x83adb7).multiplyScalar(THREE.MathUtils.lerp(0.25, 0.5, random()));
        windowRecords.push({
          placement: {
            position: [building.x + building.width / 2 + 0.04, sideY, building.z + zOffset],
            scale: [0.065, 0.14, sideSpacing * 0.48],
          },
          color,
        });
      }
    }

    if (building.layer >= 1 && buildingIndex % 5 === 2) {
      const clusterBaseY = building.baseY + building.height * THREE.MathUtils.lerp(0.3, 0.54, random());
      const clusterSpacingX = Math.min(1.1, building.width * 0.12);
      for (let row = 0; row < 4; row += 1) {
        for (let column = 0; column < 2; column += 1) {
          if (random() > 0.78) continue;
          const color = new THREE.Color(0x7fa5ad).multiplyScalar(THREE.MathUtils.lerp(0.26, 0.46, random()));
          windowRecords.push({
            placement: {
              position: [
                building.x + (column === 0 ? -1 : 1) * clusterSpacingX,
                clusterBaseY + row * 1.35,
                building.z + building.depth / 2 + 0.045,
              ],
              scale: [0.42, 0.52, 0.07],
            },
            color,
          });
        }
      }
    }
  });

  for (const [towerIndex, tower] of residentialTowers.entries()) {
    const rowCount = Math.max(4, Math.floor((tower.height - 4) / 3.35));
    const segmentWidth = tower.width / 3.6;
    for (let row = 0; row < rowCount; row += 1) {
      const y = tower.baseY + 2.9 + row * 3.35;
      for (let segment = 0; segment < 3; segment += 1) {
        if ((row * 3 + segment + towerIndex * 2) % 7 === 0) continue;
        const xOffset = (segment - 1) * tower.width * 0.27;
        const isWarm = (row + segment * 2 + towerIndex) % 11 === 0;
        const color = new THREE.Color(isWarm ? 0xc68158 : 0x9db7b2);
        color.multiplyScalar(isWarm ? 0.58 : 0.5 + (row % 3) * 0.03);
        windowRecords.push({
          placement: {
            position: [tower.x + xOffset, y, tower.z + tower.depth / 2 + 0.075],
            scale: [segmentWidth * (segment === 1 ? 0.82 : 0.68), 0.16, 0.065],
          },
          color,
        });
      }
    }
  }

  const windows = new THREE.InstancedMesh(windowGeometry, windowMaterial, windowRecords.length);
  const transform = new THREE.Object3D();
  windows.name = "fog-city-lit-windows";
  windowRecords.forEach((record, index) => {
    transform.position.set(...record.placement.position);
    transform.scale.set(...record.placement.scale);
    transform.rotation.set(0, 0, 0);
    transform.updateMatrix();
    windows.setMatrixAt(index, transform.matrix);
    windows.setColorAt(index, record.color);
  });
  windows.instanceMatrix.needsUpdate = true;
  if (windows.instanceColor) windows.instanceColor.needsUpdate = true;
  windows.computeBoundingSphere();
  root.add(windows);

  const antennaMaterial = new THREE.MeshBasicMaterial({
    color: 0x713122,
    transparent: true,
    opacity: 0.58,
    toneMapped: false,
  });
  const antennaRandom = mulberry32(0xa17e44);
  const antennaPlacements: BoxPlacement[] = [];
  for (const building of allBuildings) {
    if (antennaRandom() < 0.82) continue;
    const height = THREE.MathUtils.lerp(2.8, 8.5, antennaRandom());
    antennaPlacements.push({
      position: [
        building.x + (antennaRandom() - 0.5) * building.width * 0.35,
        building.baseY + building.height + height / 2,
        building.z + (antennaRandom() - 0.5) * building.depth * 0.25,
      ],
      scale: [0.07, height, 0.07],
    });
  }
  root.add(createInstancedBoxes(antennaPlacements, antennaMaterial, "city-rooftop-antennas"));

  return windowMaterial;
}

function createGroundDashReactions(root: THREE.Group): GroundDashReactions {
  const geometry = new THREE.PlaneGeometry(1, 1, 1, 1);
  geometry.rotateX(-Math.PI / 2);
  const alphaAttribute = new THREE.InstancedBufferAttribute(
    new Float32Array(GROUND_DASH_REACTION_CAPACITY),
    1,
  );
  alphaAttribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("instanceAlpha", alphaAttribute);

  const material = new THREE.ShaderMaterial({
    name: "ground-dash-reflection-material",
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending,
    fog: true,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      { uColor: { value: new THREE.Color(0x88c7cd) } },
    ]),
    vertexShader: `
      attribute float instanceAlpha;
      varying float vReactionAlpha;
      varying vec2 vReactionUv;
      #include <fog_pars_vertex>
      void main() {
        vReactionAlpha = instanceAlpha;
        vReactionUv = uv;
        vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      varying float vReactionAlpha;
      varying vec2 vReactionUv;
      #include <fog_pars_fragment>
      void main() {
        float across = 1.0 - smoothstep(0.06, 0.44, abs(vReactionUv.y - 0.5) * 2.0);
        float head = smoothstep(0.0, 0.075, vReactionUv.x);
        float tail = 1.0 - smoothstep(0.925, 1.0, vReactionUv.x);
        float alpha = vReactionAlpha * across * head * tail;
        if (alpha < 0.004) discard;
        gl_FragColor = vec4(uColor, alpha);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  });

  const mesh = new THREE.InstancedMesh(geometry, material, GROUND_DASH_REACTION_CAPACITY);
  const transform = new THREE.Object3D();
  mesh.name = "ground-dash-reflection-pool";
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;

  for (let index = 0; index < GROUND_DASH_REACTION_CAPACITY; index += 1) {
    transform.position.set(0, -2, 0);
    transform.rotation.set(0, 0, 0);
    transform.scale.set(0, 1, 0);
    transform.updateMatrix();
    mesh.setMatrixAt(index, transform.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  root.add(mesh);

  return {
    mesh,
    alphaAttribute,
    remaining: new Float32Array(GROUND_DASH_REACTION_CAPACITY),
    durations: new Float32Array(GROUND_DASH_REACTION_CAPACITY),
    peakAlpha: new Float32Array(GROUND_DASH_REACTION_CAPACITY),
    transform,
    cursor: 0,
  };
}

function triggerGroundDashReaction(
  reactions: GroundDashReactions,
  start: THREE.Vector3,
  end: THREE.Vector3,
  intensity: number,
): void {
  const deltaX = end.x - start.x;
  const deltaZ = end.z - start.z;
  const length = Math.hypot(deltaX, deltaZ);
  if (length < 0.08) return;

  const slot = reactions.cursor;
  reactions.cursor = (slot + 1) % GROUND_DASH_REACTION_CAPACITY;
  const duration = THREE.MathUtils.clamp(0.31 + (intensity - 1) * 0.045, 0.25, 0.42);
  const width = THREE.MathUtils.clamp(0.11 + intensity * 0.025, 0.12, 0.17);
  const angle = -Math.atan2(deltaZ, deltaX);

  reactions.transform.position.set(
    (start.x + end.x) * 0.5,
    0.034,
    (start.z + end.z) * 0.5,
  );
  reactions.transform.rotation.set(0, angle, 0);
  reactions.transform.scale.set(length, 1, width);
  reactions.transform.updateMatrix();
  reactions.mesh.setMatrixAt(slot, reactions.transform.matrix);
  reactions.mesh.instanceMatrix.needsUpdate = true;

  reactions.remaining[slot] = duration;
  reactions.durations[slot] = duration;
  reactions.peakAlpha[slot] = THREE.MathUtils.clamp(0.16 + intensity * 0.045, 0.16, 0.26);
  reactions.alphaAttribute.setX(slot, reactions.peakAlpha[slot]!);
  reactions.alphaAttribute.needsUpdate = true;
}

function updateGroundDashReactions(reactions: GroundDashReactions, dt: number): void {
  let changed = false;
  for (let index = 0; index < reactions.remaining.length; index += 1) {
    const remaining = reactions.remaining[index]!;
    if (remaining <= 0) continue;
    const nextRemaining = Math.max(0, remaining - dt);
    reactions.remaining[index] = nextRemaining;
    const normalized = nextRemaining / Math.max(0.001, reactions.durations[index]!);
    const alpha = reactions.peakAlpha[index]! * normalized * normalized;
    reactions.alphaAttribute.setX(index, alpha);
    changed = true;
  }
  if (changed) reactions.alphaAttribute.needsUpdate = true;
}

function createRain(root: THREE.Group): RainRuntime {
  const random = mulberry32(0x71a16e);
  const count = 760;
  const positions = new Float32Array(count * 3);
  const basePositions = new Float32Array(count * 3);
  const speeds = new Float32Array(count);
  const reactionOffsets = new Float32Array(count * 3);
  const reactionDecayRates = new Float32Array(count);

  for (let index = 0; index < count; index += 1) {
    const offset = index * 3;
    basePositions[offset] = THREE.MathUtils.lerp(-36, 36, random());
    basePositions[offset + 1] = THREE.MathUtils.lerp(0.4, 32, random());
    basePositions[offset + 2] = THREE.MathUtils.lerp(-36, 29, random());
    speeds[index] = THREE.MathUtils.lerp(15, 25, random());
    reactionDecayRates[index] = 8.6 + (index % 7) * 0.55;
  }
  positions.set(basePositions);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.computeBoundingSphere();

  const material = new THREE.ShaderMaterial({
    name: "rain-streak-material",
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    fog: true,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uColor: { value: new THREE.Color(0xa9cad0) },
        uOpacity: { value: 0.34 },
      },
    ]),
    vertexShader: `
      #include <fog_pars_vertex>
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        gl_PointSize = clamp(72.0 / max(1.0, -mvPosition.z), 1.2, 4.8);
        #include <fog_vertex>
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      #include <fog_pars_fragment>
      void main() {
        vec2 point = gl_PointCoord - vec2(0.5);
        float narrow = 1.0 - smoothstep(0.055, 0.2, abs(point.x));
        float caps = 1.0 - smoothstep(0.36, 0.5, abs(point.y));
        float tail = mix(0.42, 1.0, 1.0 - gl_PointCoord.y);
        float alpha = narrow * caps * tail * uOpacity;
        if (alpha < 0.015) discard;
        gl_FragColor = vec4(uColor, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  });
  const points = new THREE.Points(geometry, material);
  points.name = "wind-driven-rain";
  points.frustumCulled = false;
  points.renderOrder = 3;
  root.add(points);
  return { points, positions, basePositions, speeds, reactionOffsets, reactionDecayRates };
}

function createSteam(root: THREE.Group, particleTexture: THREE.Texture): SteamRuntime {
  const origins = [
    new THREE.Vector3(-18.55, 0.14, -9.8),
    new THREE.Vector3(18.45, 0.14, 4.9),
    new THREE.Vector3(-10.8, 0.14, 11.05),
  ] as const;
  const ventMaterial = new THREE.MeshStandardMaterial({
    color: 0x090e12,
    metalness: 0.91,
    roughness: 0.36,
  });
  const ventPlacements: BoxPlacement[] = [
    { position: [origins[0].x, 0.1, origins[0].z], scale: [1.35, 0.18, 0.48], rotation: [0, 0.18, 0] },
    { position: [origins[1].x, 0.1, origins[1].z], scale: [0.72, 0.16, 1.08], rotation: [0, -0.11, 0] },
    { position: [origins[2].x, 0.1, origins[2].z], scale: [1.05, 0.18, 0.62], rotation: [0, 0.42, 0] },
  ];
  root.add(createInstancedBoxes(ventPlacements, ventMaterial, "arena-steam-vents"));

  const random = mulberry32(0x57ea4);
  const count = 126;
  const positions = new Float32Array(count * 3);
  const ages = new Float32Array(count);
  const lives = new Float32Array(count);
  const speeds = new Float32Array(count);
  const phase = new Float32Array(count);
  const ventIndices = new Uint8Array(count);
  const reactionOffsets = new Float32Array(count * 3);
  const reactionVelocities = new Float32Array(count * 3);

  for (let index = 0; index < count; index += 1) {
    const weightedVent = index % 6;
    const ventIndex = weightedVent < 3 ? 0 : weightedVent < 5 ? 1 : 2;
    const origin = origins[ventIndex]!;
    const life = ventIndex === 0
      ? THREE.MathUtils.lerp(2.5, 4.4, random())
      : ventIndex === 1
        ? THREE.MathUtils.lerp(1.5, 2.7, random())
        : THREE.MathUtils.lerp(1.9, 3.3, random());
    const age = random() * life;
    const speed = ventIndex === 0
      ? THREE.MathUtils.lerp(0.72, 1.24, random())
      : ventIndex === 1
        ? THREE.MathUtils.lerp(0.38, 0.72, random())
        : THREE.MathUtils.lerp(0.92, 1.58, random());
    const offset = index * 3;
    ages[index] = age;
    lives[index] = life;
    speeds[index] = speed;
    phase[index] = random() * Math.PI * 2;
    ventIndices[index] = ventIndex;
    positions[offset] = origin.x + (random() - 0.5) * 0.72;
    positions[offset + 1] = origin.y + age * speed;
    positions[offset + 2] = origin.z + (random() - 0.5) * 0.32;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.computeBoundingSphere();
  const material = new THREE.PointsMaterial({
    color: 0xb6c8cb,
    map: particleTexture,
    alphaMap: particleTexture,
    transparent: true,
    opacity: 0.105,
    size: 1.55,
    sizeAttenuation: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    fog: true,
  });
  const points = new THREE.Points(geometry, material);
  points.name = "edge-vent-steam";
  points.frustumCulled = false;
  points.renderOrder = 2;
  root.add(points);

  return {
    points,
    positions,
    ages,
    lives,
    speeds,
    phase,
    ventIndices,
    origins,
    reactionOffsets,
    reactionVelocities,
  };
}

function reactRainToDash(
  rain: RainRuntime,
  start: THREE.Vector3,
  end: THREE.Vector3,
  intensity: number,
): void {
  const segmentX = end.x - start.x;
  const segmentZ = end.z - start.z;
  const lengthSquared = segmentX * segmentX + segmentZ * segmentZ;
  if (lengthSquared < 0.0064) return;

  const inverseLength = 1 / Math.sqrt(lengthSquared);
  const directionX = segmentX * inverseLength;
  const directionZ = segmentZ * inverseLength;
  const radius = THREE.MathUtils.clamp(1.15 + intensity * 0.24, 1.2, 1.8);
  const radiusSquared = radius * radius;

  for (let index = 0; index < rain.speeds.length; index += 1) {
    const offset = index * 3;
    const pointX = rain.basePositions[offset]!;
    const pointZ = rain.basePositions[offset + 2]!;
    const projection = THREE.MathUtils.clamp(
      ((pointX - start.x) * segmentX + (pointZ - start.z) * segmentZ) / lengthSquared,
      0,
      1,
    );
    const closestX = start.x + segmentX * projection;
    const closestZ = start.z + segmentZ * projection;
    const relativeX = pointX - closestX;
    const relativeZ = pointZ - closestZ;
    const distanceSquared = relativeX * relativeX + relativeZ * relativeZ;
    if (distanceSquared > radiusSquared) continue;

    const distance = Math.sqrt(distanceSquared);
    const falloff = smoothStep(1 - distance / radius);
    const cross = directionX * relativeZ - directionZ * relativeX;
    const side = Math.abs(cross) > 0.001 ? Math.sign(cross) : (index % 2 === 0 ? -1 : 1);
    const push = (0.72 + intensity * 0.52) * falloff;
    const perpendicularX = -directionZ * side;
    const perpendicularZ = directionX * side;

    rain.reactionOffsets[offset] = THREE.MathUtils.clamp(
      rain.reactionOffsets[offset]! + perpendicularX * push + directionX * push * 0.24,
      -2.2,
      2.2,
    );
    rain.reactionOffsets[offset + 1] = THREE.MathUtils.clamp(
      rain.reactionOffsets[offset + 1]! + push * 0.18,
      -0.5,
      1.2,
    );
    rain.reactionOffsets[offset + 2] = THREE.MathUtils.clamp(
      rain.reactionOffsets[offset + 2]! + perpendicularZ * push + directionZ * push * 0.24,
      -2.2,
      2.2,
    );
  }
}

function reactSteamToDash(
  steam: SteamRuntime,
  start: THREE.Vector3,
  end: THREE.Vector3,
  intensity: number,
): void {
  const segmentX = end.x - start.x;
  const segmentZ = end.z - start.z;
  const lengthSquared = segmentX * segmentX + segmentZ * segmentZ;
  if (lengthSquared < 0.0064) return;

  const inverseLength = 1 / Math.sqrt(lengthSquared);
  const directionX = segmentX * inverseLength;
  const directionZ = segmentZ * inverseLength;
  const radius = THREE.MathUtils.clamp(1.8 + intensity * 0.42, 2, 2.8);
  const radiusSquared = radius * radius;

  for (let index = 0; index < steam.ages.length; index += 1) {
    const offset = index * 3;
    const pointX = steam.positions[offset]!;
    const pointZ = steam.positions[offset + 2]!;
    const projection = THREE.MathUtils.clamp(
      ((pointX - start.x) * segmentX + (pointZ - start.z) * segmentZ) / lengthSquared,
      0,
      1,
    );
    const closestX = start.x + segmentX * projection;
    const closestZ = start.z + segmentZ * projection;
    const relativeX = pointX - closestX;
    const relativeZ = pointZ - closestZ;
    const distanceSquared = relativeX * relativeX + relativeZ * relativeZ;
    if (distanceSquared > radiusSquared) continue;

    const distance = Math.sqrt(distanceSquared);
    const falloff = smoothStep(1 - distance / radius);
    const cross = directionX * relativeZ - directionZ * relativeX;
    const side = Math.abs(cross) > 0.001 ? Math.sign(cross) : (index % 2 === 0 ? -1 : 1);
    const force = (3.4 + intensity * 2.1) * falloff;
    const perpendicularX = -directionZ * side;
    const perpendicularZ = directionX * side;

    steam.reactionVelocities[offset] = THREE.MathUtils.clamp(
      steam.reactionVelocities[offset]! + perpendicularX * force + directionX * force * 0.3,
      -9,
      9,
    );
    steam.reactionVelocities[offset + 1] = THREE.MathUtils.clamp(
      steam.reactionVelocities[offset + 1]! + force * 0.42,
      -3,
      6,
    );
    steam.reactionVelocities[offset + 2] = THREE.MathUtils.clamp(
      steam.reactionVelocities[offset + 2]! + perpendicularZ * force + directionZ * force * 0.3,
      -9,
      9,
    );
  }
}

function addLighting(root: THREE.Group): void {
  const hemisphere = new THREE.HemisphereLight(0x7c9aab, 0x080b0f, 0.22);
  hemisphere.name = "rainy-night-hemisphere";
  root.add(hemisphere);

  const key = new THREE.DirectionalLight(0xccecff, 0.58);
  key.name = "arena-moon-key";
  key.position.set(16, 31, 19);
  key.target.position.set(0, -1, 0);
  root.add(key, key.target);

  const trackFill = new THREE.PointLight(0x6a9fad, 42, 30, 2);
  trackFill.name = "transit-cool-fill";
  trackFill.position.set(-10, 11, -15.5);
  root.add(trackFill);

  const warmEdge = new THREE.PointLight(0xff5a28, 6, 8, 2);
  warmEdge.name = "arena-warm-edge-fill";
  warmEdge.position.set(15, 2.4, -11.8);
  root.add(warmEdge);
}

export function createEnvironment(scene: THREE.Scene): EnvironmentRuntime {
  const root = new THREE.Group();
  root.name = "slash-environment";
  scene.add(root);

  const previousBackground = scene.background;
  const previousFog = scene.fog;
  const background = new THREE.Color(0x0b1d28);
  const fog = new THREE.FogExp2(0x183b49, 0.0078);
  scene.background = background;
  scene.fog = fog;

  const groundTextures = createGroundTextures();
  const particleTexture = createRadialParticleTexture();
  const platform = createPlatform(root, groundTextures);
  const groundDashReactions = createGroundDashReactions(root);
  const transit = createTransitArchitecture(root);
  const windowMaterial = createCity(root);
  const rain = createRain(root);
  const steam = createSteam(root, particleTexture);
  addLighting(root);

  let disposed = false;

  const reactToDash = (
    start: THREE.Vector3,
    end: THREE.Vector3,
    intensity = 1,
  ): void => {
    if (disposed) return;
    if (
      !Number.isFinite(start.x) ||
      !Number.isFinite(start.z) ||
      !Number.isFinite(end.x) ||
      !Number.isFinite(end.z)
    ) return;

    const safeIntensity = THREE.MathUtils.clamp(Number.isFinite(intensity) ? intensity : 1, 0.25, 2.2);
    triggerGroundDashReaction(groundDashReactions, start, end, safeIntensity);
    reactRainToDash(rain, start, end, safeIntensity);
    reactSteamToDash(steam, start, end, safeIntensity);
  };

  const update = (timeSeconds: number, dt: number): void => {
    if (disposed) return;
    const time = Number.isFinite(timeSeconds) ? timeSeconds : 0;
    const step = THREE.MathUtils.clamp(Number.isFinite(dt) ? dt : 0, 0, 0.05);

    const trainLoopLength = 122;
    transit.train.position.x = THREE.MathUtils.euclideanModulo(time * 10.5 + 42, trainLoopLength) - 61;
    transit.train.position.y = TRACK_Y + 2.18 + Math.sin(time * 4.2) * 0.018;
    transit.updateTraffic(time);

    platform.beaconMaterial.emissiveIntensity = 2.05 + Math.sin(time * 2.5) * 0.38;
    windowMaterial.opacity = 0.6 + Math.sin(time * 0.37) * 0.018;
    updateGroundDashReactions(groundDashReactions, step);

    const rainPositionAttribute = rain.points.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let index = 0; index < rain.speeds.length; index += 1) {
      const offset = index * 3;
      rain.basePositions[offset] = rain.basePositions[offset]! + step * 1.55;
      rain.basePositions[offset + 1] = rain.basePositions[offset + 1]! - rain.speeds[index]! * step;
      rain.basePositions[offset + 2] = rain.basePositions[offset + 2]! - step * 0.48;
      if (rain.basePositions[offset + 1]! < -0.2) {
        rain.basePositions[offset + 1] = 31.5 + (index % 17) * 0.08;
        rain.basePositions[offset + 2] = -36 + ((index * 47) % 650) / 10;
        rain.reactionOffsets[offset] = 0;
        rain.reactionOffsets[offset + 1] = 0;
        rain.reactionOffsets[offset + 2] = 0;
      }
      if (rain.basePositions[offset]! > 36) rain.basePositions[offset] = -36;

      const reactionDecay = Math.exp(-rain.reactionDecayRates[index]! * step);
      rain.reactionOffsets[offset] = rain.reactionOffsets[offset]! * reactionDecay;
      rain.reactionOffsets[offset + 1] = rain.reactionOffsets[offset + 1]! * reactionDecay;
      rain.reactionOffsets[offset + 2] = rain.reactionOffsets[offset + 2]! * reactionDecay;
      rain.positions[offset] = rain.basePositions[offset]! + rain.reactionOffsets[offset]!;
      rain.positions[offset + 1] = rain.basePositions[offset + 1]! + rain.reactionOffsets[offset + 1]!;
      rain.positions[offset + 2] = rain.basePositions[offset + 2]! + rain.reactionOffsets[offset + 2]!;
    }
    rainPositionAttribute.needsUpdate = true;

    const steamPositionAttribute = steam.points.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let index = 0; index < steam.ages.length; index += 1) {
      steam.ages[index] = (steam.ages[index] ?? 0) + step;
      const life = steam.lives[index]!;
      const age = steam.ages[index]!;
      const ventIndex = steam.ventIndices[index]!;
      const origin = steam.origins[ventIndex]!;
      const offset = index * 3;
      let naturalX: number;
      let naturalY: number;
      let naturalZ: number;

      if (age >= life) {
        steam.ages[index] = 0;
        naturalX = origin.x + Math.sin(index * 8.13) * 0.32;
        naturalY = origin.y;
        naturalZ = origin.z + Math.cos(index * 5.37) * 0.15;
        steam.reactionOffsets[offset] = 0;
        steam.reactionOffsets[offset + 1] = 0;
        steam.reactionOffsets[offset + 2] = 0;
        steam.reactionVelocities[offset] = 0;
        steam.reactionVelocities[offset + 1] = 0;
        steam.reactionVelocities[offset + 2] = 0;
      } else {
        const normalizedAge = age / life;
        const spread = ventIndex === 1
          ? 0.18 + normalizedAge * 0.78
          : 0.13 + normalizedAge * (ventIndex === 0 ? 0.48 : 0.34);
        const driftX = ventIndex === 0 ? 0.62 : ventIndex === 1 ? -0.28 : -0.74;
        const driftZ = ventIndex === 0 ? 0.14 : ventIndex === 1 ? 0.66 : -0.18;
        const drift = normalizedAge * normalizedAge;
        naturalX = origin.x + Math.sin(time * 0.72 + steam.phase[index]!) * spread + driftX * drift;
        naturalY = origin.y + age * steam.speeds[index]!;
        naturalZ = origin.z + Math.cos(time * 0.49 + steam.phase[index]!) * spread * 0.46 + driftZ * drift;

        const velocityDecay = Math.exp(-5.2 * step);
        for (let axis = 0; axis < 3; axis += 1) {
          const axisOffset = offset + axis;
          const velocity = (
            steam.reactionVelocities[axisOffset]!
            - steam.reactionOffsets[axisOffset]! * 13 * step
          ) * velocityDecay;
          steam.reactionVelocities[axisOffset] = velocity;
          steam.reactionOffsets[axisOffset] = steam.reactionOffsets[axisOffset]! + velocity * step;
        }
      }

      steam.positions[offset] = naturalX + steam.reactionOffsets[offset]!;
      steam.positions[offset + 1] = naturalY + steam.reactionOffsets[offset + 1]!;
      steam.positions[offset + 2] = naturalZ + steam.reactionOffsets[offset + 2]!;
    }
    steamPositionAttribute.needsUpdate = true;
  };

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    scene.remove(root);

    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    root.traverse((object) => {
      if (
        object instanceof THREE.Mesh ||
        object instanceof THREE.Points ||
        object instanceof THREE.Line
      ) {
        const renderable = object as THREE.Mesh | THREE.Points | THREE.Line;
        geometries.add(renderable.geometry);
        const objectMaterials = Array.isArray(renderable.material)
          ? renderable.material
          : [renderable.material];
        objectMaterials.forEach((material) => materials.add(material));
      }
    });

    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    groundTextures.albedo.dispose();
    groundTextures.roughness.dispose();
    particleTexture.dispose();

    if (scene.background === background) scene.background = previousBackground;
    if (scene.fog === fog) scene.fog = previousFog;
  };

  return {
    root,
    arenaHitSurface: platform.hitSurface,
    arenaBounds: ARENA_BOUNDS,
    reactToDash,
    update,
    dispose,
  };
}
