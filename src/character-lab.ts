import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { createCharacterProviderRegistry } from "./presentation/characters/providers";
import type { CharacterRuntime } from "./presentation/characters/types";

type Actor = "hero" | "enemy" | "both";
type View = "front" | "side" | "back" | "three-quarter";
type Mode = "idle" | "walk" | "dash" | "hit" | "threat";
type ProviderMode = "procedural" | "gltf";

interface CharacterLabSnapshot {
  actor: Actor;
  view: View | null;
  projection: "perspective" | "orthographic";
  mode: Mode;
  provider: ProviderMode;
  frozenAtMs: number | null;
  canvas: { cssWidth: number; cssHeight: number; backingWidth: number; backingHeight: number; devicePixelRatio: number };
  camera: { type: string; position: number[]; target: number[]; orthographicHeight: number | null };
  characters: Record<string, {
    heightWorldUnits: number;
    position: number[];
    asset: CharacterAssetStats;
    runtime: {
      providerId: string;
      source: "procedural" | "gltf";
      animationState: string;
      animationClipNames: readonly string[];
      skeletonBoneCount: number;
      forwardAxis: "+Z";
      groundAligned: boolean;
      inspection: CharacterRuntime["asset"]["inspection"] | null;
    };
    renderer: RendererStats;
    comparison: CharacterComparisonProjection | null;
  }>;
}

interface NormalizedPoint {
  x: number;
  y: number;
}

interface NormalizedBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface CharacterComparisonProjection {
  coordinateSpace: "canvas-normalized";
  bodyBounds: NormalizedBounds;
  shoulderLine: [NormalizedPoint, NormalizedPoint];
  hipPoints: [NormalizedPoint, NormalizedPoint];
  kneePoints: [NormalizedPoint, NormalizedPoint];
  weaponBounds: NormalizedBounds;
}

interface CharacterAssetStats {
  meshes: number;
  triangles: number;
  geometries: number;
  materials: number;
}

interface RendererStats {
  calls: number;
  triangles: number;
  points: number;
  lines: number;
  geometries: number;
  textures: number;
}

declare global {
  interface Window {
    render_character_lab_to_text: () => string;
    character_lab_validation: { snapshot: () => CharacterLabSnapshot };
  }
}

const canvasElement = document.querySelector<HTMLCanvasElement>("#character-lab");
if (!canvasElement) throw new Error("Character Lab canvas is missing.");
const canvas: HTMLCanvasElement = canvasElement;
const params = new URLSearchParams(window.location.search);
const selectedActor = parseActor(params.get("actor"));
const selectedView = parseView(params.get("view"));
const projection = params.get("projection") === "orthographic" ? "orthographic" : "perspective";
const mode = parseMode(params.get("mode"));
const providerMode = parseProviderMode(params.get("provider"));
const frozenAtMs = parseFreezeMs(params.get("freezeMs"));
const autoTurn = params.get("turn") === "1";
const cleanCapture = params.get("clean") === "1";
const comparisonCapture = params.get("comparison") === "1";
const isEvidenceView = selectedView !== null || projection === "orthographic" || selectedActor !== "both";

if (cleanCapture) document.documentElement.classList.add("character-lab-clean-capture");
if (comparisonCapture) {
  document.documentElement.style.background = "transparent";
  document.body.style.background = "transparent";
  canvas.style.background = "transparent";
}

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: comparisonCapture,
  powerPreference: "high-performance",
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.background = comparisonCapture ? null : new THREE.Color(0x171d21);
scene.fog = comparisonCapture ? null : new THREE.Fog(0x171d21, 10, 24);

const perspectiveCamera = new THREE.PerspectiveCamera(31, 1, 0.1, 60);
const orthographicCamera = new THREE.OrthographicCamera(-2.4, 2.4, 2.4, -2.4, 0.1, 60);
const camera: THREE.PerspectiveCamera | THREE.OrthographicCamera = projection === "orthographic" ? orthographicCamera : perspectiveCamera;
const cameraTarget = new THREE.Vector3(0, 1.45, 0);

// Preserve the original Lab composition for its default URL. Evidence URLs
// deliberately centre one actor and use a measured, non-perspective camera.
if (!isEvidenceView) {
  camera.position.set(6.15, 3.35, 8.75);
  cameraTarget.set(0, 1.45, 0);
} else {
  setEvidenceCamera(camera, selectedView ?? "three-quarter", cameraTarget);
}
camera.lookAt(cameraTarget);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(cameraTarget);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.minDistance = 4.4;
controls.maxDistance = 16;
controls.maxPolarAngle = Math.PI * 0.54;
controls.enabled = projection !== "orthographic" && !isEvidenceView;

scene.add(new THREE.HemisphereLight(0xc9e8ec, 0x111619, 1.05));
const key = new THREE.DirectionalLight(0xe5fbff, 3.45);
key.position.set(-4.5, 8.5, 6.2);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -6;
key.shadow.camera.right = 6;
key.shadow.camera.top = 6;
key.shadow.camera.bottom = -3;
scene.add(key);
const cameraFill = new THREE.DirectionalLight(0xa8bac1, 1.15);
cameraFill.position.set(0, 3.5, 8);
scene.add(cameraFill);
const cyanRim = new THREE.SpotLight(0x62deff, 185, 22, 0.55, 0.7, 1.6);
cyanRim.position.set(-5, 4, -4);
cyanRim.target.position.set(-1.75, 1.4, 0);
scene.add(cyanRim, cyanRim.target);
const warmRim = new THREE.SpotLight(0xff4b25, 155, 20, 0.55, 0.72, 1.6);
warmRim.position.set(5, 3.6, -3.5);
warmRim.target.position.set(1.75, 1.35, 0);
scene.add(warmRim, warmRim.target);

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(7.5, 64),
  new THREE.MeshStandardMaterial({ color: 0x151c20, roughness: 0.5, metalness: 0.32 }),
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
floor.visible = !comparisonCapture;
scene.add(floor);
const ring = new THREE.Mesh(
  new THREE.RingGeometry(3.45, 3.47, 96),
  new THREE.MeshBasicMaterial({ color: 0x5e7880, transparent: true, opacity: 0.25, side: THREE.DoubleSide }),
);
ring.rotation.x = -Math.PI / 2;
ring.position.y = 0.004;
ring.visible = !comparisonCapture;
scene.add(ring);

const characterProviders = createCharacterProviderRegistry();
const heroProviderId = providerMode === "gltf" ? "gltf-tripo-hero-v5" : "procedural-hero-v5";
const enemyProviderId = providerMode === "gltf" ? "gltf-tripo-enemy-v5" : "procedural-enemy-v5";
const requiredProviderIds = [
  ...(selectedActor === "enemy" ? [] : [heroProviderId]),
  ...(selectedActor === "hero" ? [] : [enemyProviderId]),
];
await characterProviders.prepare(requiredProviderIds);

const hero: CharacterRuntime | null = selectedActor === "enemy"
  ? null
  : characterProviders.get(heroProviderId).create({ role: "hero" });
if (hero) {
  hero.root.position.x = selectedActor === "both" ? -1.72 : 0;
  scene.add(hero.root);
}
const enemy: CharacterRuntime | null = selectedActor === "hero"
  ? null
  : characterProviders.get(enemyProviderId).create({ role: "enemy", variant: 0 });
if (enemy) {
  enemy.root.position.x = selectedActor === "both" ? 1.72 : 0;
  scene.add(enemy.root);
}

let last = performance.now();
let time = 0;
let lastRendererStats: RendererStats = rendererStats();

function parseActor(value: string | null): Actor {
  return value === "hero" || value === "enemy" ? value : "both";
}

function parseView(value: string | null): View | null {
  return value === "front" || value === "side" || value === "back" || value === "three-quarter" ? value : null;
}

function parseMode(value: string | null): Mode {
  return value === "walk" || value === "dash" || value === "hit" || value === "threat" ? value : "idle";
}

function parseProviderMode(value: string | null): ProviderMode {
  return value === "gltf" ? "gltf" : "procedural";
}

function parseFreezeMs(value: string | null) {
  if (value === null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.min(parsed, 60_000) : null;
}

function setEvidenceCamera(activeCamera: THREE.Camera, view: View, target: THREE.Vector3) {
  target.set(0, 1.48, 0);
  const positions: Record<View, [number, number, number]> = {
    front: [0, 1.48, 9],
    side: [-9, 1.48, 0],
    back: [0, 1.48, -9],
    "three-quarter": [6.36, 1.48, 6.36],
  };
  activeCamera.position.set(...positions[view]);
}

function resize() {
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);
  const pixelRatio = Math.min(window.devicePixelRatio, 1.75);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height, false);
  if (camera instanceof THREE.PerspectiveCamera) {
    camera.aspect = width / height;
  } else {
    const orthographicHeight = 4.8;
    const halfHeight = orthographicHeight / 2;
    const halfWidth = halfHeight * (width / height);
    camera.left = -halfWidth;
    camera.right = halfWidth;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
  }
  camera.updateProjectionMatrix();
}

function applyAnimation(frameTime: number, dt: number) {
  const cycle = frameTime % 1.65;
  const dashProgress = mode === "dash" && cycle < 0.34 ? cycle / 0.34 : null;
  const recoveryProgress = mode === "dash" && cycle >= 0.34 && cycle < 0.68 ? (cycle - 0.34) / 0.34 : null;
  const walking = mode === "walk";
  const hitAge = mode === "hit" ? frameTime % 1.5 : null;
  const heroState = hitAge !== null
    ? "death"
    : dashProgress !== null && dashProgress < 0.18
      ? "anticipation"
      : dashProgress !== null && dashProgress < 0.72
        ? "action"
        : dashProgress !== null
          ? "arrival"
          : recoveryProgress !== null
            ? "recovery"
            : "idle";
  hero?.animation.update({
    state: heroState,
    timeSeconds: frameTime,
    deltaSeconds: dt,
    turn: mode === "threat" ? Math.sin(frameTime * 2.1) : 0,
    sourceProgress: hitAge === null
      ? dashProgress ?? recoveryProgress
      : Math.min(1, hitAge / 0.5),
  });
  enemy?.animation.update({
    state: hitAge !== null && hitAge < 0.19
      ? "hit"
      : walking || mode === "threat"
        ? "action"
        : "idle",
    timeSeconds: frameTime,
    deltaSeconds: dt,
    distanceMoved: walking ? dt * 2.8 : 0,
    speedNormalized: walking ? 0.9 : 0,
    turn: mode === "threat" ? -Math.sin(frameTime * 1.7) : 0,
    threat: mode === "threat" ? 1 : 0,
    hitAgeSeconds: hitAge !== null && hitAge < 0.19 ? hitAge : null,
    sourceProgress: hitAge === null ? null : Math.min(1, hitAge / 0.5),
  });
  if (enemy) {
    enemy.deathPresentation?.setCutVisible(
      mode === "hit" && hitAge !== null && hitAge > 0.045 && hitAge < 0.42,
    );
    enemy.deathPresentation?.setCutHeat(
      hitAge === null ? 0 : THREE.MathUtils.smoothstep(hitAge, 0.04, 0.12),
    );
  }
  if (autoTurn) {
    if (hero) hero.root.rotation.y = frameTime * 0.35;
    if (enemy) enemy.root.rotation.y = frameTime * 0.35;
  }
}

function prepareFrozenPose(freezeMs: number) {
  hero?.animation.reset();
  enemy?.animation.reset();
  const fixedStep = 1000 / 60;
  const steps = Math.max(1, Math.ceil(freezeMs / fixedStep));
  for (let index = 1; index <= steps; index += 1) {
    const stepTimeMs = Math.min(index * fixedStep, freezeMs);
    applyAnimation(stepTimeMs / 1000, index === 1 ? stepTimeMs / 1000 : fixedStep / 1000);
  }
  time = freezeMs / 1000;
}

function rendererStats(): RendererStats {
  return {
    calls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    points: renderer.info.render.points,
    lines: renderer.info.render.lines,
    geometries: renderer.info.memory.geometries,
    textures: renderer.info.memory.textures,
  };
}

function assetStats(root: THREE.Object3D): CharacterAssetStats {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  let meshes = 0;
  let triangles = 0;
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    meshes += 1;
    geometries.add(object.geometry);
    const position = object.geometry.getAttribute("position");
    triangles += object.geometry.index ? object.geometry.index.count / 3 : (position?.count ?? 0) / 3;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
  });
  return { meshes, triangles, geometries: geometries.size, materials: materials.size };
}

function isWithin(object: THREE.Object3D, possibleAncestor: THREE.Object3D) {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (current === possibleAncestor) return true;
    current = current.parent;
  }
  return false;
}

function isEffectivelyVisible(object: THREE.Object3D, root: THREE.Object3D) {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (!current.visible) return false;
    if (current === root) return true;
    current = current.parent;
  }
  return false;
}

function meshBounds(root: THREE.Object3D, excludedRoot: THREE.Object3D | null) {
  root.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3();
  const transformed = new THREE.Box3();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    if (!isEffectivelyVisible(object, root)) return;
    if (excludedRoot && isWithin(object, excludedRoot)) return;
    if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
    if (!object.geometry.boundingBox) return;
    transformed.copy(object.geometry.boundingBox).applyMatrix4(object.matrixWorld);
    bounds.union(transformed);
  });
  if (bounds.isEmpty()) throw new Error(`Character Lab could not measure ${root.name || "character"}.`);
  return bounds;
}

function projectPoint(point: THREE.Vector3): NormalizedPoint {
  const projected = point.clone().project(camera);
  return { x: (projected.x + 1) / 2, y: (1 - projected.y) / 2 };
}

function projectObject(object: THREE.Object3D) {
  return projectPoint(object.getWorldPosition(new THREE.Vector3()));
}

function projectBounds(bounds: THREE.Box3): NormalizedBounds {
  const projected = [
    new THREE.Vector3(bounds.min.x, bounds.min.y, bounds.min.z),
    new THREE.Vector3(bounds.min.x, bounds.min.y, bounds.max.z),
    new THREE.Vector3(bounds.min.x, bounds.max.y, bounds.min.z),
    new THREE.Vector3(bounds.min.x, bounds.max.y, bounds.max.z),
    new THREE.Vector3(bounds.max.x, bounds.min.y, bounds.min.z),
    new THREE.Vector3(bounds.max.x, bounds.min.y, bounds.max.z),
    new THREE.Vector3(bounds.max.x, bounds.max.y, bounds.min.z),
    new THREE.Vector3(bounds.max.x, bounds.max.y, bounds.max.z),
  ].map(projectPoint);
  return {
    left: Math.min(...projected.map((point) => point.x)),
    top: Math.min(...projected.map((point) => point.y)),
    right: Math.max(...projected.map((point) => point.x)),
    bottom: Math.max(...projected.map((point) => point.y)),
  };
}

function comparisonProjection(
  root: THREE.Object3D,
  rig: {
    leftShoulder: THREE.Object3D;
    rightShoulder: THREE.Object3D;
    leftUpperLeg: THREE.Object3D;
    rightUpperLeg: THREE.Object3D;
    leftShin: THREE.Object3D;
    rightShin: THREE.Object3D;
  },
  weaponRoot: THREE.Object3D,
): CharacterComparisonProjection {
  root.updateWorldMatrix(true, true);
  return {
    coordinateSpace: "canvas-normalized",
    bodyBounds: projectBounds(meshBounds(root, weaponRoot)),
    shoulderLine: [projectObject(rig.leftShoulder), projectObject(rig.rightShoulder)],
    hipPoints: [projectObject(rig.leftUpperLeg), projectObject(rig.rightUpperLeg)],
    kneePoints: [projectObject(rig.leftShin), projectObject(rig.rightShin)],
    weaponBounds: projectBounds(meshBounds(weaponRoot, null)),
  };
}

function runtimeComparisonProjection(runtime: CharacterRuntime): CharacterComparisonProjection | null {
  const leftShoulder = runtime.landmarks.get("left-shoulder");
  const rightShoulder = runtime.landmarks.get("right-shoulder");
  const leftUpperLeg = runtime.landmarks.get("left-upper-leg");
  const rightUpperLeg = runtime.landmarks.get("right-upper-leg");
  const leftShin = runtime.landmarks.get("left-shin");
  const rightShin = runtime.landmarks.get("right-shin");
  const weaponRoot = runtime.weaponMounts.get("primary-weapon");
  if (
    !leftShoulder
    || !rightShoulder
    || !leftUpperLeg
    || !rightUpperLeg
    || !leftShin
    || !rightShin
    || !weaponRoot
  ) {
    return null;
  }
  return comparisonProjection(runtime.root, {
    leftShoulder,
    rightShoulder,
    leftUpperLeg,
    rightUpperLeg,
    leftShin,
    rightShin,
  }, weaponRoot);
}

function snapshot(): CharacterLabSnapshot {
  const rect = canvas.getBoundingClientRect();
  const characters: CharacterLabSnapshot["characters"] = {};
  if (hero) {
    characters.hero = {
      heightWorldUnits: 3.3,
      position: hero.root.position.toArray(),
      asset: assetStats(hero.root),
      runtime: {
        providerId: hero.asset.providerId,
        source: hero.asset.source,
        animationState: hero.animation.snapshot().state,
        animationClipNames: hero.asset.animationClipNames,
        skeletonBoneCount: hero.asset.skeletonBoneCount,
        forwardAxis: hero.asset.forwardAxis,
        groundAligned: hero.asset.groundAligned,
        inspection: hero.asset.inspection ?? null,
      },
      renderer: lastRendererStats,
      comparison: comparisonCapture ? runtimeComparisonProjection(hero) : null,
    };
  }
  if (enemy) {
    characters.enemy = {
      heightWorldUnits: 3.15,
      position: enemy.root.position.toArray(),
      asset: assetStats(enemy.root),
      runtime: {
        providerId: enemy.asset.providerId,
        source: enemy.asset.source,
        animationState: enemy.animation.snapshot().state,
        animationClipNames: enemy.asset.animationClipNames,
        skeletonBoneCount: enemy.asset.skeletonBoneCount,
        forwardAxis: enemy.asset.forwardAxis,
        groundAligned: enemy.asset.groundAligned,
        inspection: enemy.asset.inspection ?? null,
      },
      renderer: lastRendererStats,
      comparison: comparisonCapture ? runtimeComparisonProjection(enemy) : null,
    };
  }
  return {
    actor: selectedActor,
    view: selectedView,
    projection,
    mode,
    provider: providerMode,
    frozenAtMs,
    canvas: {
      cssWidth: rect.width,
      cssHeight: rect.height,
      backingWidth: canvas.width,
      backingHeight: canvas.height,
      devicePixelRatio: window.devicePixelRatio,
    },
    camera: {
      type: camera.type,
      position: camera.position.toArray(),
      target: controls.target.toArray(),
      orthographicHeight: camera instanceof THREE.OrthographicCamera ? camera.top - camera.bottom : null,
    },
    characters,
  };
}

function animate(now: number) {
  const dt = Math.min(0.04, Math.max(0.001, (now - last) / 1000));
  last = now;
  if (frozenAtMs === null) {
    time += dt;
    applyAnimation(time, dt);
  }
  controls.update();
  renderer.render(scene, camera);
  lastRendererStats = rendererStats();
  requestAnimationFrame(animate);
}

window.render_character_lab_to_text = () => JSON.stringify(snapshot());
window.character_lab_validation = { snapshot };

window.addEventListener("resize", resize);
resize();
if (frozenAtMs !== null) prepareFrozenPose(frozenAtMs);
requestAnimationFrame(animate);
