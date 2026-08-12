import * as THREE from "three";
import type {
  EnvironmentArenaBounds,
  EnvironmentCreateOptions,
  EnvironmentProvider,
  EnvironmentResourceSnapshot,
  EnvironmentRuntime,
} from "./environment-provider";

export const CLEAN_ARENA_PROVIDER_ID = "clean-arena-v2";
export const CLEAN_ARENA_VISUAL_SIZE = Object.freeze({ width: 1600, depth: 1400 });

const CLEAN_ARENA_MODULES = Object.freeze([
  "clean-arena/surface",
  "clean-arena/surface-detail",
  "clean-arena/boundary-light",
  "clean-arena/lighting",
] as const);

const SURFACE_Y = 0;

function validateGameplayArena(bounds: EnvironmentArenaBounds): void {
  const values = [bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ];
  if (values.some((value) => !Number.isFinite(value))) {
    throw new Error("Clean Arena requires finite gameplay bounds.");
  }
  if (bounds.minX >= bounds.maxX || bounds.minZ >= bounds.maxZ) {
    throw new Error("Clean Arena requires positive gameplay arena dimensions.");
  }
}

function copyBounds(bounds: EnvironmentArenaBounds): EnvironmentArenaBounds {
  return Object.freeze({
    minX: bounds.minX,
    maxX: bounds.maxX,
    minZ: bounds.minZ,
    maxZ: bounds.maxZ,
  });
}

function collectResources(root: THREE.Object3D): EnvironmentResourceSnapshot {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  let objects = 0;
  let meshes = 0;
  let lines = 0;
  let lights = 0;

  root.traverse((object) => {
    objects += 1;
    if (object instanceof THREE.Light) lights += 1;
    if (object instanceof THREE.Mesh) meshes += 1;
    if (object instanceof THREE.Line) lines += 1;
    if (!(object instanceof THREE.Mesh || object instanceof THREE.Line)) return;

    geometries.add(object.geometry);
    const entries = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of entries) {
      materials.add(material);
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) textures.add(value);
      }
    }
  });

  return {
    objects,
    meshes,
    lines,
    lights,
    geometries: geometries.size,
    materials: materials.size,
    textures: textures.size,
  };
}

function createSurfaceDetail(
  width: number,
  depth: number,
  bounds: EnvironmentArenaBounds,
): THREE.LineSegments {
  const positions: number[] = [];
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerZ = (bounds.minZ + bounds.maxZ) / 2;
  const gameplayWidth = bounds.maxX - bounds.minX;
  const gameplayDepth = bounds.maxZ - bounds.minZ;
  const detailWidth = Math.min(width - 2.4, gameplayWidth * 2.8);
  const detailDepth = Math.min(depth - 2.4, gameplayDepth * 2.8);
  for (const ratio of [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1]) {
    const x = centerX + detailWidth * 0.5 * ratio;
    positions.push(
      x, SURFACE_Y + 0.012, centerZ - detailDepth / 2,
      x, SURFACE_Y + 0.012, centerZ + detailDepth / 2,
    );
  }
  for (const ratio of [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1]) {
    const z = centerZ + detailDepth * 0.5 * ratio;
    positions.push(
      centerX - detailWidth / 2, SURFACE_Y + 0.012, z,
      centerX + detailWidth / 2, SURFACE_Y + 0.012, z,
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({
    color: 0x91a3a8,
    transparent: true,
    opacity: 0.075,
    depthWrite: false,
  });
  const detail = new THREE.LineSegments(geometry, material);
  detail.name = "clean-arena-surface-detail";
  detail.renderOrder = 1;
  return detail;
}

function createBoundaryLight(bounds: EnvironmentArenaBounds): {
  readonly root: THREE.Group;
  readonly material: THREE.MeshBasicMaterial;
} {
  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxZ - bounds.minZ;
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerZ = (bounds.minZ + bounds.maxZ) / 2;
  const root = new THREE.Group();
  root.name = "clean-arena-gameplay-boundary";

  const geometry = new THREE.BoxGeometry(1, 0.018, 1);
  const material = new THREE.MeshBasicMaterial({
    color: 0x82d9df,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
    toneMapped: false,
  });

  const addBar = (name: string, x: number, z: number, scaleX: number, scaleZ: number): void => {
    const bar = new THREE.Mesh(geometry, material);
    bar.name = name;
    bar.position.set(x, SURFACE_Y + 0.025, z);
    bar.scale.set(scaleX, 1, scaleZ);
    bar.renderOrder = 2;
    root.add(bar);
  };

  addBar("clean-arena-boundary-north", centerX, bounds.minZ, width, 0.055);
  addBar("clean-arena-boundary-south", centerX, bounds.maxZ, width, 0.055);
  addBar("clean-arena-boundary-west", bounds.minX, centerZ, 0.055, depth);
  addBar("clean-arena-boundary-east", bounds.maxX, centerZ, 0.055, depth);
  return { root, material };
}

function createCleanArena(options: EnvironmentCreateOptions): EnvironmentRuntime {
  validateGameplayArena(options.gameplayArena);
  const gameplayArena = copyBounds(options.gameplayArena);
  const gameplayWidth = gameplayArena.maxX - gameplayArena.minX;
  const gameplayDepth = gameplayArena.maxZ - gameplayArena.minZ;
  const visualWidth = Math.max(CLEAN_ARENA_VISUAL_SIZE.width, gameplayWidth * 1.8);
  const visualDepth = Math.max(CLEAN_ARENA_VISUAL_SIZE.depth, gameplayDepth * 1.8);

  const root = new THREE.Group();
  root.name = "clean-arena-v2-root";

  const topGeometry = new THREE.PlaneGeometry(visualWidth - 0.4, visualDepth - 0.4, 1, 1);
  const topMaterial = new THREE.MeshStandardMaterial({
    color: 0x172126,
    roughness: 0.93,
    metalness: 0.07,
  });
  const top = new THREE.Mesh(topGeometry, topMaterial);
  top.name = "clean-arena-visible-surface";
  top.rotation.x = -Math.PI / 2;
  top.position.y = SURFACE_Y + 0.004;
  top.receiveShadow = true;
  top.frustumCulled = false;
  root.add(top);

  const pointerGeometry = new THREE.PlaneGeometry(visualWidth, visualDepth, 1, 1);
  const pointerMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    colorWrite: false,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
  });
  const surface = new THREE.Mesh(pointerGeometry, pointerMaterial);
  surface.name = "clean-arena-pointer-projection-surface";
  surface.rotation.x = -Math.PI / 2;
  surface.position.y = SURFACE_Y + 0.018;
  surface.frustumCulled = false;
  surface.userData.isArenaHitSurface = true;
  surface.userData.arenaBounds = gameplayArena;
  root.add(surface);

  root.add(createSurfaceDetail(visualWidth, visualDepth, gameplayArena));
  const boundary = createBoundaryLight(gameplayArena);
  root.add(boundary.root);

  const previousBackground = options.scene.background;
  const previousFog = options.scene.fog;
  const cleanBackground = new THREE.Color(0x111b20);
  options.scene.background = cleanBackground;
  options.scene.fog = null;
  options.scene.add(root);

  const resources = collectResources(root);
  let disposed = false;
  let dashPulse = 0;

  return {
    root,
    arenaHitSurface: surface,
    arenaBounds: gameplayArena,
    pointerProjectionSurface: surface,
    reactToDash(start, end, intensity = 1) {
      if (disposed) return;
      if (
        !Number.isFinite(start.x)
        || !Number.isFinite(start.z)
        || !Number.isFinite(end.x)
        || !Number.isFinite(end.z)
      ) return;
      const distance = Math.hypot(end.x - start.x, end.z - start.z);
      const safeIntensity = THREE.MathUtils.clamp(
        Number.isFinite(intensity) ? intensity : 1,
        0,
        2,
      );
      dashPulse = Math.max(dashPulse, THREE.MathUtils.clamp(distance / 20, 0.15, 1) * safeIntensity);
    },
    setRainDensity(_density) {
      // Compatibility-only. Clean Arena intentionally has no weather module.
    },
    setFogDensity(_density) {
      // Compatibility-only. Clean Arena intentionally has no fog object.
    },
    update(timeSeconds, deltaSeconds) {
      if (disposed) return;
      const time = Number.isFinite(timeSeconds) ? timeSeconds : 0;
      const step = THREE.MathUtils.clamp(Number.isFinite(deltaSeconds) ? deltaSeconds : 0, 0, 0.05);
      const targetOpacity = 0.31 + Math.sin(time * 0.72) * 0.025;
      const blend = 1 - Math.exp(-4 * step);
      boundary.material.opacity = THREE.MathUtils.lerp(boundary.material.opacity, targetOpacity, blend);
      dashPulse *= Math.exp(-5.5 * step);
      topMaterial.emissive.setHex(0x18363a);
      topMaterial.emissiveIntensity = dashPulse * 0.085;
    },
    snapshot: () => ({
      runtimeId: CLEAN_ARENA_PROVIDER_ID,
      providerId: CLEAN_ARENA_PROVIDER_ID,
      visualProfileId: CLEAN_ARENA_PROVIDER_ID,
      source: "procedural",
      disposed,
      activeModules: [...CLEAN_ARENA_MODULES],
      rainDensity: 0,
      fogDensity: 0,
      rainParticles: 0,
      legacyFeatures: {
        city: false,
        transit: false,
        weather: false,
        train: false,
      },
      visualPlane: {
        width: visualWidth,
        depth: visualDepth,
        surfaceY: SURFACE_Y,
      },
      gameplayArena,
      visualPlaneExceedsGameplayArena:
        visualWidth > gameplayWidth && visualDepth > gameplayDepth,
      gameplayCollisionOwnedByProvider: false,
      resources,
    }),
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();

      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      const textures = new Set<THREE.Texture>();
      root.traverse((object) => {
        if (!(object instanceof THREE.Mesh || object instanceof THREE.Line)) return;
        geometries.add(object.geometry);
        const entries = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of entries) {
          materials.add(material);
          for (const value of Object.values(material)) {
            if (value instanceof THREE.Texture) textures.add(value);
          }
        }
      });
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      textures.forEach((texture) => texture.dispose());

      if (options.scene.background === cleanBackground) {
        options.scene.background = previousBackground;
      }
      if (options.scene.fog === null) options.scene.fog = previousFog;
    },
  };
}

export const cleanArenaProvider: EnvironmentProvider = Object.freeze({
  id: CLEAN_ARENA_PROVIDER_ID,
  create: createCleanArena,
});
