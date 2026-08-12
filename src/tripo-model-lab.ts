import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

type ModelView = "front" | "side" | "back" | "right" | "three-quarter";
type SurfaceMode = "source" | "normal" | "wireframe";

interface GeneratedModelStats {
  meshes: number;
  skinnedMeshes: number;
  triangles: number;
  geometries: number;
  materials: number;
  textures: number;
  skeletons: number;
  bones: number;
  animations: Array<{ name: string; durationSeconds: number; tracks: number }>;
  dimensions: { width: number; height: number; depth: number };
  normalizationScale: number;
}

interface GeneratedModelSnapshot {
  status: "waiting" | "loading" | "ready" | "error";
  modelUrl: string | null;
  view: ModelView;
  sourceYawDegrees: number;
  surfaceMode: SurfaceMode;
  requestedClip: string | null;
  samplePhase: number | null;
  activeClip: string | null;
  progressPercent: number | null;
  error: string | null;
  stats: GeneratedModelStats | null;
  renderer: { calls: number; triangles: number; geometries: number; textures: number };
}

declare global {
  interface Window {
    render_tripo_model_to_text: () => string;
    tripo_model_validation: { snapshot: () => GeneratedModelSnapshot };
  }
}

const canvasElement = document.querySelector<HTMLCanvasElement>("#tripo-model-lab");
const statusElement = document.querySelector<HTMLElement>("#model-status");
const statsElement = document.querySelector<HTMLElement>("#model-stats");
if (!canvasElement || !statusElement || !statsElement) throw new Error("Generated Model Lab markup is incomplete.");

const canvas: HTMLCanvasElement = canvasElement;
const statusLabel: HTMLElement = statusElement;
const statsLabel: HTMLElement = statsElement;
const params = new URLSearchParams(window.location.search);
const modelUrl = params.get("model");
const requestedClip = params.get("clip");
const samplePhase = parseOptionalUnitInterval(params.get("phase"));
const selectedView = parseView(params.get("view"));
const sourceYawDegrees = parseFiniteNumber(params.get("yaw"), 0);
const surfaceMode = parseSurfaceMode(params.get("surface"));
const cleanCapture = params.get("clean") === "1";
if (cleanCapture) document.documentElement.classList.add("clean");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x11181c);
scene.fog = new THREE.Fog(0x11181c, 11, 24);
const pmrem = new THREE.PMREMGenerator(renderer);
const environment = pmrem.fromScene(new RoomEnvironment(), 0.04);
scene.environment = environment.texture;

const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
const target = new THREE.Vector3(0, 1.52, 0);
setCamera(selectedView);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(target);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.minDistance = 4.5;
controls.maxDistance = 15;
controls.maxPolarAngle = Math.PI * 0.54;

scene.add(new THREE.HemisphereLight(0xbfe3e8, 0x111518, 1.05));
const key = new THREE.DirectionalLight(0xe8fbff, 3.25);
key.position.set(-4.5, 8.2, 6.4);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -4;
key.shadow.camera.right = 4;
key.shadow.camera.top = 5;
key.shadow.camera.bottom = -2;
scene.add(key);
const coolRim = new THREE.SpotLight(0x59dffc, 145, 18, 0.5, 0.72, 1.5);
coolRim.position.set(-4.8, 4.2, -4.4);
coolRim.target.position.set(0, 1.5, 0);
scene.add(coolRim, coolRim.target);
const warmRim = new THREE.SpotLight(0xff5a32, 90, 16, 0.55, 0.74, 1.6);
warmRim.position.set(4.6, 3.8, -3.6);
warmRim.target.position.set(0, 1.35, 0);
scene.add(warmRim, warmRim.target);

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(6.5, 64),
  new THREE.MeshStandardMaterial({ color: 0x151d21, roughness: 0.48, metalness: 0.28 }),
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

let mixer: THREE.AnimationMixer | null = null;
const inspectionMaterials = new Set<THREE.Material>();
let previousTime = performance.now();
let snapshot: GeneratedModelSnapshot = {
  status: modelUrl ? "loading" : "waiting",
  modelUrl,
  view: selectedView,
  sourceYawDegrees,
  surfaceMode,
  requestedClip,
  samplePhase,
  activeClip: null,
  progressPercent: modelUrl ? 0 : null,
  error: null,
  stats: null,
  renderer: rendererSnapshot(),
};

window.render_tripo_model_to_text = () => JSON.stringify(snapshot);
window.tripo_model_validation = { snapshot: () => snapshot };

if (modelUrl) {
  statusLabel.textContent = "Loading generated GLB…";
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  loader.load(
    modelUrl,
    handleModelLoaded,
    (event) => {
      const progress = event.total > 0 ? Math.min(100, (event.loaded / event.total) * 100) : null;
      snapshot.progressPercent = progress;
      statusLabel.textContent = progress === null ? "Loading generated GLB…" : `Loading generated GLB… ${progress.toFixed(0)}%`;
    },
    (reason) => {
      const message = reason instanceof Error ? reason.message : String(reason);
      snapshot = { ...snapshot, status: "error", error: message, progressPercent: null };
      statusLabel.textContent = `Model load failed: ${message}`;
      statsLabel.textContent = "No model loaded";
      document.documentElement.dataset.ready = "error";
    },
  );
} else {
  statusLabel.textContent = "Add ?model=/path/to/model.glb to inspect a downloaded Tripo model.";
  document.documentElement.dataset.ready = "waiting";
}

function handleModelLoaded(gltf: GLTF) {
  const root = gltf.scene;
  root.rotation.y = THREE.MathUtils.degToRad(sourceYawDegrees);
  root.updateWorldMatrix(true, true);
  const normalization = normalizeModel(root, 3.3);
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    if (surfaceMode === "normal") {
      const material = new THREE.MeshNormalMaterial({ flatShading: false });
      inspectionMaterials.add(material);
      object.material = material;
    } else if (surfaceMode === "wireframe") {
      const material = new THREE.MeshBasicMaterial({ color: 0xd9f6f8, wireframe: true });
      inspectionMaterials.add(material);
      object.material = material;
    }
    object.castShadow = true;
    object.receiveShadow = true;
    object.frustumCulled = true;
  });
  scene.add(root);

  let activeClip: string | null = null;
  if (gltf.animations.length > 0) {
    const clip = requestedClip
      ? gltf.animations.find((candidate) => candidate.name === requestedClip) ?? null
      : gltf.animations[0] ?? null;
    if (clip) {
      mixer = new THREE.AnimationMixer(root);
      const action = mixer.clipAction(clip);
      action.play();
      if (samplePhase !== null) {
        action.time = clip.duration * samplePhase;
        action.paused = true;
        mixer.update(0);
      }
      activeClip = clip.name;
    }
  }

  const stats = collectStats(root, gltf, normalization.scale, normalization.dimensions);
  snapshot = {
    ...snapshot,
    status: "ready",
    activeClip,
    progressPercent: 100,
    error: null,
    stats,
  };
  statusLabel.textContent = activeClip
    ? `Ready · playing “${activeClip}”`
    : "Ready · static generated model";
  statsLabel.textContent = formatStats(stats);
  document.documentElement.dataset.ready = "ready";
}

function normalizeModel(root: THREE.Object3D, targetHeight: number) {
  root.updateWorldMatrix(true, true);
  const initialBounds = new THREE.Box3().setFromObject(root);
  const initialHeight = initialBounds.max.y - initialBounds.min.y;
  if (!Number.isFinite(initialHeight) || initialHeight <= 0.0001) throw new Error("Generated model has invalid bounds.");
  const scale = targetHeight / initialHeight;
  root.scale.multiplyScalar(scale);
  root.updateWorldMatrix(true, true);

  const scaledBounds = new THREE.Box3().setFromObject(root);
  const center = scaledBounds.getCenter(new THREE.Vector3());
  root.position.x -= center.x;
  root.position.y -= scaledBounds.min.y;
  root.position.z -= center.z;
  root.updateWorldMatrix(true, true);

  const normalizedBounds = new THREE.Box3().setFromObject(root);
  const size = normalizedBounds.getSize(new THREE.Vector3());
  return {
    scale,
    dimensions: { width: size.x, height: size.y, depth: size.z },
  };
}

function collectStats(
  root: THREE.Object3D,
  gltf: GLTF,
  normalizationScale: number,
  dimensions: { width: number; height: number; depth: number },
): GeneratedModelStats {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const skeletons = new Set<THREE.Skeleton>();
  let meshes = 0;
  let skinnedMeshes = 0;
  let triangles = 0;
  let bones = 0;

  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    meshes += 1;
    geometries.add(object.geometry);
    const indexCount = object.geometry.index?.count;
    const positionCount = object.geometry.getAttribute("position")?.count ?? 0;
    triangles += Math.floor((indexCount ?? positionCount) / 3);

    const meshMaterials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of meshMaterials) {
      materials.add(material);
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) textures.add(value);
      }
    }

    if (object instanceof THREE.SkinnedMesh) {
      skinnedMeshes += 1;
      skeletons.add(object.skeleton);
      bones = Math.max(bones, object.skeleton.bones.length);
    }
  });

  return {
    meshes,
    skinnedMeshes,
    triangles,
    geometries: geometries.size,
    materials: materials.size,
    textures: textures.size,
    skeletons: skeletons.size,
    bones,
    animations: gltf.animations.map((clip) => ({
      name: clip.name || "unnamed",
      durationSeconds: clip.duration,
      tracks: clip.tracks.length,
    })),
    dimensions,
    normalizationScale,
  };
}

function formatStats(stats: GeneratedModelStats) {
  const animationSummary = stats.animations.length > 0
    ? stats.animations.map((clip) => `${clip.name} · ${clip.durationSeconds.toFixed(2)}s · ${clip.tracks} tracks`).join("\n")
    : "none";
  return [
    `meshes          ${stats.meshes}`,
    `skinned meshes  ${stats.skinnedMeshes}`,
    `triangles       ${stats.triangles.toLocaleString()}`,
    `geometries      ${stats.geometries}`,
    `materials       ${stats.materials}`,
    `textures        ${stats.textures}`,
    `skeletons       ${stats.skeletons}`,
    `max bones       ${stats.bones}`,
    `size            ${stats.dimensions.width.toFixed(2)} × ${stats.dimensions.height.toFixed(2)} × ${stats.dimensions.depth.toFixed(2)}`,
    `scale           ${stats.normalizationScale.toFixed(5)}`,
    "",
    "animations",
    animationSummary,
  ].join("\n");
}

function parseView(value: string | null): ModelView {
  return value === "front" || value === "side" || value === "back" || value === "right" || value === "three-quarter"
    ? value
    : "three-quarter";
}

function parseFiniteNumber(value: string | null, fallback: number): number {
  if (value === null || value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseOptionalUnitInterval(value: string | null): number | null {
  if (value === null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? THREE.MathUtils.clamp(parsed, 0, 1) : null;
}

function parseSurfaceMode(value: string | null): SurfaceMode {
  return value === "normal" || value === "wireframe" ? value : "source";
}

function setCamera(view: ModelView) {
  const positions: Record<ModelView, [number, number, number]> = {
    front: [0, 1.52, 8.6],
    side: [-8.6, 1.52, 0],
    back: [0, 1.52, -8.6],
    right: [8.6, 1.52, 0],
    "three-quarter": [6.1, 2.45, 6.1],
  };
  camera.position.set(...positions[view]);
  camera.lookAt(target);
}

function rendererSnapshot() {
  return {
    calls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    geometries: renderer.info.memory.geometries,
    textures: renderer.info.memory.textures,
  };
}

function resize() {
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function animate(now: number) {
  resize();
  const dt = Math.min(0.05, Math.max(0, (now - previousTime) / 1000));
  previousTime = now;
  mixer?.update(dt);
  controls.update();
  renderer.render(scene, camera);
  snapshot.renderer = rendererSnapshot();
  requestAnimationFrame(animate);
}

window.addEventListener("beforeunload", () => {
  mixer?.stopAllAction();
  inspectionMaterials.forEach((material) => material.dispose());
  controls.dispose();
  environment.dispose();
  pmrem.dispose();
  renderer.dispose();
});

requestAnimationFrame(animate);
