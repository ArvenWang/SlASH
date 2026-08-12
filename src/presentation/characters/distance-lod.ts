import * as THREE from "three";
import { MeshoptSimplifier } from "meshoptimizer";

export type CharacterLodMode = "auto" | "near" | "far";

export interface CharacterDistanceLodReport {
  readonly id: string;
  readonly mode: CharacterLodMode;
  readonly switchDistance: number;
  readonly highTriangles: number;
  readonly lowTriangles: number;
  readonly triangleReductionRatio: number;
  readonly maximumSimplificationError: number;
}

export interface CharacterDistanceLodRuntime {
  readonly report: CharacterDistanceLodReport;
  setMode(mode: CharacterLodMode): void;
  dispose(): void;
}

interface MeshLodEntry {
  readonly mesh: THREE.SkinnedMesh;
  readonly highGeometry: THREE.BufferGeometry;
  readonly lowGeometry: THREE.BufferGeometry;
  readonly previousOnBeforeRender: THREE.Object3D["onBeforeRender"];
  readonly highTriangles: number;
  readonly lowTriangles: number;
  readonly error: number;
}

function indexedTriangles(geometry: THREE.BufferGeometry) {
  const count = geometry.index?.count ?? 0;
  return Math.floor(count / 3);
}

function simplifyGeometry(
  geometry: THREE.BufferGeometry,
  targetRatio: number,
  targetError: number,
) {
  const index = geometry.index;
  const position = geometry.getAttribute("position");
  if (!index || !(position instanceof THREE.BufferAttribute) || !(position.array instanceof Float32Array)) return null;
  const sourceIndices = Uint32Array.from({ length: index.count }, (_, offset) => index.getX(offset));
  const targetIndexCount = Math.max(3, Math.floor(sourceIndices.length * targetRatio / 3) * 3);
  const [simplifiedIndices, error] = MeshoptSimplifier.simplify(
    sourceIndices,
    position.array,
    position.itemSize,
    targetIndexCount,
    targetError,
    ["LockBorder", "Permissive"],
  );
  if (simplifiedIndices.length >= sourceIndices.length) return null;
  const lowGeometry = geometry.clone();
  lowGeometry.name = `${geometry.name || "character-geometry"}-lod1`;
  lowGeometry.setIndex(new THREE.BufferAttribute(simplifiedIndices, 1));
  lowGeometry.computeBoundingBox();
  lowGeometry.computeBoundingSphere();
  return { lowGeometry, error };
}

export function createCharacterDistanceLod(
  root: THREE.Object3D,
  options: {
    readonly id: string;
    readonly targetHeight: number;
    readonly targetTriangleRatio?: number;
    readonly switchDistanceRatio?: number;
    readonly targetError?: number;
  },
): CharacterDistanceLodRuntime {
  const targetRatio = THREE.MathUtils.clamp(options.targetTriangleRatio ?? 0.42, 0.2, 0.8);
  const switchDistance = options.targetHeight * (options.switchDistanceRatio ?? 4.2);
  const targetError = options.targetError ?? 0.025;
  const entries: MeshLodEntry[] = [];
  let mode: CharacterLodMode = "auto";
  const cameraPosition = new THREE.Vector3();
  const meshPosition = new THREE.Vector3();
  root.userData.characterLodMode = mode;
  const activeMode = () => {
    const requested = root.userData.characterLodMode;
    return requested === "near" || requested === "far" || requested === "auto" ? requested : mode;
  };

  root.traverse((object) => {
    if (!(object instanceof THREE.SkinnedMesh)) return;
    const highGeometry = object.geometry;
    const simplified = simplifyGeometry(highGeometry, targetRatio, targetError);
    if (!simplified) return;
    const previousOnBeforeRender = object.onBeforeRender;
    const entry: MeshLodEntry = {
      mesh: object,
      highGeometry,
      lowGeometry: simplified.lowGeometry,
      previousOnBeforeRender,
      highTriangles: indexedTriangles(highGeometry),
      lowTriangles: indexedTriangles(simplified.lowGeometry),
      error: simplified.error,
    };
    object.onBeforeRender = function onBeforeCharacterLodRender(renderer, scene, camera, _geometry, material, group) {
      camera.getWorldPosition(cameraPosition);
      object.getWorldPosition(meshPosition);
      const selectedMode = activeMode();
      const useLow = selectedMode === "far"
        || (selectedMode === "auto" && cameraPosition.distanceTo(meshPosition) >= switchDistance);
      object.geometry = useLow ? entry.lowGeometry : entry.highGeometry;
      object.userData.characterLodLevel = useLow ? 1 : 0;
      previousOnBeforeRender.call(this, renderer, scene, camera, object.geometry, material, group);
    };
    object.userData.characterLodLevel = 0;
    entries.push(entry);
  });

  const highTriangles = entries.reduce((sum, entry) => sum + entry.highTriangles, 0);
  const lowTriangles = entries.reduce((sum, entry) => sum + entry.lowTriangles, 0);
  const report = {
    id: options.id,
    get mode() {
      return activeMode();
    },
    switchDistance,
    highTriangles,
    lowTriangles,
    triangleReductionRatio: highTriangles > 0 ? 1 - lowTriangles / highTriangles : 0,
    maximumSimplificationError: Math.max(0, ...entries.map((entry) => entry.error)),
  } satisfies CharacterDistanceLodReport;
  root.userData.characterDistanceLod = report;

  return {
    report,
    setMode(nextMode) {
      mode = nextMode;
      root.userData.characterLodMode = nextMode;
    },
    dispose() {
      entries.forEach((entry) => {
        entry.mesh.geometry = entry.highGeometry;
        entry.mesh.onBeforeRender = entry.previousOnBeforeRender;
        entry.lowGeometry.dispose();
        delete entry.mesh.userData.characterLodLevel;
      });
      delete root.userData.characterDistanceLod;
      delete root.userData.characterLodMode;
    },
  };
}
