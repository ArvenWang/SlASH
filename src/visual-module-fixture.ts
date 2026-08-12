import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { GltfCharacterProvider } from "./presentation/characters/gltf-provider";
import { createHeroV5RVisual } from "./presentation/characters/v5r-runtime";

interface FixtureSnapshot {
  status: "loading" | "ready" | "error";
  providerId: string | null;
  replacement: {
    meshes: number;
    vertices: number;
    sourceChecksum: number;
    replacementChecksum: number;
  } | null;
  states: Record<string, { activeState: string; activeClip: string | null }>;
  weapon: { mounted: boolean; bladeLength: number | null } | null;
  distanceLod: Record<string, unknown> | null;
  error: string | null;
}

declare global {
  interface Window {
    render_visual_module_fixture_to_text: () => string;
    visual_module_fixture_validation: { snapshot: () => FixtureSnapshot };
  }
}

const canvasElement = document.querySelector<HTMLCanvasElement>("#visual-module-fixture");
if (!canvasElement) throw new Error("Visual module fixture canvas is missing.");
const canvas: HTMLCanvasElement = canvasElement;

let snapshot: FixtureSnapshot = {
  status: "loading",
  providerId: null,
  replacement: null,
  states: {},
  weapon: null,
  distanceLod: null,
  error: null,
};
window.render_visual_module_fixture_to_text = () => JSON.stringify(snapshot);
window.visual_module_fixture_validation = { snapshot: () => snapshot };

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x11181c);
const camera = new THREE.PerspectiveCamera(31, 1, 0.1, 50);
camera.position.set(5.4, 3.2, 7.2);
camera.lookAt(0, 1.45, 0);
scene.add(new THREE.HemisphereLight(0xc6edf2, 0x111619, 1.15));
const key = new THREE.DirectionalLight(0xe9fbff, 3.4);
key.position.set(-4, 8, 5);
scene.add(key);
const rim = new THREE.DirectionalLight(0x5cdfff, 2.2);
rim.position.set(4, 3, -5);
scene.add(rim);
const floor = new THREE.Mesh(
  new THREE.CircleGeometry(5.5, 48),
  new THREE.MeshStandardMaterial({ color: 0x182126, roughness: 0.62, metalness: 0.24 }),
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

function resize() {
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);
  renderer.setSize(width, height, false);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function createReplacementModel(asset: GLTF) {
  let meshes = 0;
  let vertices = 0;
  let sourceChecksum = 0;
  let replacementChecksum = 0;
  asset.scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const sourcePosition = object.geometry.getAttribute("position");
    if (!(sourcePosition instanceof THREE.BufferAttribute)) return;
    const geometry = object.geometry.clone();
    const position = geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let index = 0; index < position.count; index += 1) {
      const x = position.getX(index);
      const y = position.getY(index);
      const z = position.getZ(index);
      sourceChecksum += Math.abs(x) + Math.abs(y) * 0.5 + Math.abs(z) * 0.25;
      const shoulderBias = 1 + Math.max(0, y) * 0.0008;
      position.setXYZ(index, x * 0.94 * shoulderBias, y, z * 1.08);
      replacementChecksum += Math.abs(position.getX(index))
        + Math.abs(position.getY(index)) * 0.5
        + Math.abs(position.getZ(index)) * 0.25;
    }
    position.needsUpdate = true;
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    geometry.userData.fixtureReplacement = "narrow-x-deep-z-v1";
    object.geometry = geometry;
    meshes += 1;
    vertices += position.count;
  });
  return { meshes, vertices, sourceChecksum, replacementChecksum };
}

async function main() {
  const asset = await new GLTFLoader().loadAsync("/models/characters/hero-v5r-rig-v25.glb");
  const replacement = createReplacementModel(asset);
  const provider = new GltfCharacterProvider({
    id: "fixture-hero-v5r-replacement",
    role: "hero",
    animationSetId: "hero-v5r-authored",
    targetHeight: 3.3,
    load: async () => asset,
    instantiate(template) {
      const visual = createHeroV5RVisual(template);
      visual.distanceLod.setMode("near");
      return {
        root: visual.root,
        weaponMount: visual.weaponMount,
        landmarks: visual.landmarks,
        clips: visual.clips,
        groundReference: visual.model,
        proceduralDriver: visual.proceduralDriver,
        animationTimeOffsetSeconds: visual.animationTimeOffsetSeconds,
        dispose: visual.dispose,
      };
    },
  });
  await provider.prepare();
  const runtime = provider.create({ role: "hero" });
  scene.add(runtime.root);

  const states: FixtureSnapshot["states"] = {};
  let timeSeconds = 0;
  for (const state of ["idle", "action", "hit", "death"] as const) {
    timeSeconds += 0.18;
    runtime.animation.update({
      state,
      timeSeconds,
      deltaSeconds: 0.18,
      sourceProgress: state === "idle" ? null : 0.62,
    });
    const animation = runtime.animation.snapshot();
    states[state] = { activeState: animation.state, activeClip: animation.activeClip };
  }
  runtime.animation.reset("idle");
  runtime.animation.update({ state: "idle", timeSeconds: timeSeconds + 0.24, deltaSeconds: 0.24 });

  const bladeBase = runtime.landmarks.get("weapon-blade-base")?.getWorldPosition(new THREE.Vector3()) ?? null;
  const bladeTip = runtime.landmarks.get("weapon-blade-tip")?.getWorldPosition(new THREE.Vector3()) ?? null;
  snapshot = {
    status: "ready",
    providerId: runtime.asset.providerId,
    replacement,
    states,
    weapon: {
      mounted: runtime.weaponMounts.has("primary-weapon"),
      bladeLength: bladeBase && bladeTip ? bladeBase.distanceTo(bladeTip) : null,
    },
    distanceLod: runtime.root.userData.characterDistanceLod ?? null,
    error: null,
  };
  document.documentElement.dataset.ready = "ready";

  const frame = () => {
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  window.addEventListener("beforeunload", () => {
    runtime.dispose();
    provider.dispose();
    renderer.dispose();
  }, { once: true });
}

window.addEventListener("resize", resize);
resize();
main().catch((error: unknown) => {
  snapshot = { ...snapshot, status: "error", error: error instanceof Error ? error.message : String(error) };
  document.documentElement.dataset.ready = "error";
});
