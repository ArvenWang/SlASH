import * as THREE from "three";
import { createPostFx } from "./postfx";
import { createProfiledPostFxRuntime } from "./presentation/postfx/profiled-postfx-runtime";
import { postFxProfileRegistry, vfxProfileRegistry } from "./presentation/profiles/definitions";
import { createProceduralHeroProvider } from "./presentation/characters/procedural-provider";
import { createProfiledVfxRuntime } from "./presentation/vfx/profiled-vfx-runtime";
import { createVfxRuntime } from "./vfx";

type LabEffect = "dash" | "hit" | "kill" | "blood" | "camera-impact" | "all";

declare global {
  interface Window {
    render_vfx_lab_to_text: () => string;
    vfx_lab_validation: { trigger(effect: LabEffect): void; snapshot(): unknown };
  }
}

const canvas = document.querySelector<HTMLCanvasElement>("#vfx-lab");
if (!canvas) throw new Error("VFX Lab canvas is missing.");
const labCanvas: HTMLCanvasElement = canvas;
const renderer = new THREE.WebGLRenderer({ canvas: labCanvas, antialias: true, powerPreference: "high-performance" });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x071018);
scene.fog = new THREE.FogExp2(0x071018, 0.018);
const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 80);
camera.position.set(9, 7.2, 12);
camera.lookAt(0, 1.2, 0);
scene.add(new THREE.HemisphereLight(0xc9edf0, 0x080b0e, 1.1));
const key = new THREE.DirectionalLight(0xe8fbff, 2.8);
key.position.set(-5, 10, 7);
scene.add(key);
const floor = new THREE.Mesh(
  new THREE.CircleGeometry(10, 64),
  new THREE.MeshStandardMaterial({ color: 0x142129, roughness: 0.42, metalness: 0.5 }),
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

const baseProfile = postFxProfileRegistry.get("cinematic-current-v1");
const postFx = createProfiledPostFxRuntime(createPostFx(renderer, scene, camera, {
  bloomStrength: baseProfile.bloomStrength.high,
  bloomRadius: baseProfile.bloomRadius.high,
  bloomThreshold: baseProfile.bloomThreshold,
}));
const vfx = createProfiledVfxRuntime(createVfxRuntime(scene));
const heroProvider = createProceduralHeroProvider();
await heroProvider.prepare();
const hero = heroProvider.create({ role: "hero" });
hero.setPosition({ x: -5.5, z: 0 });
hero.setFacingRadians(Math.PI / 2);
scene.add(hero.root);
let time = 0;
let triggerSequence = 0;
let activeEffect: LabEffect = "dash";

function trigger(effect: LabEffect): void {
  activeEffect = effect;
  triggerSequence += 1;
  const start = new THREE.Vector3(-5.5, 0, 0);
  const end = new THREE.Vector3(5.5, 0, 0);
  const hit = new THREE.Vector3(0, 0, 0);
  const direction = new THREE.Vector3(1, 0, 0);
  if (effect === "dash" || effect === "all") {
    hero.animation.update({ state: "action", timeSeconds: time, deltaSeconds: 1 / 30, sourceProgress: 0.43 });
    vfx.spawnSlash("dash-slash-current-v1", { start, end, killPositions: [hit], actor: hero.afterimageSource });
  }
  if (effect === "hit" || effect === "all") {
    vfx.spawnCutContact("enemy-cut-contact-v1", { position: hit, direction, intensity: 1 });
  }
  if (effect === "kill" || effect === "all") {
    vfx.spawnKillImpact("enemy-cut-humanoid-v1", { position: hit, direction, intensity: 1.05 });
  }
  if (effect === "blood") vfx.seedBlood("blood-current-v1", hit, direction);
  if (effect === "camera-impact" || effect === "all") postFx.triggerImpact("kill-impact-current-v1", 0.2);
}

function resize(): void {
  const width = Math.max(1, labCanvas.clientWidth);
  const height = Math.max(1, labCanvas.clientHeight);
  const pixelRatio = Math.min(window.devicePixelRatio, 1.5);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  postFx.resize(width, height, pixelRatio);
}

function snapshot() {
  return {
    activeEffect,
    triggerSequence,
    profiles: vfxProfileRegistry.list(),
    vfx: vfx.snapshot(),
    postFx: postFx.snapshot(),
    renderer: {
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      textures: renderer.info.memory.textures,
    },
  };
}

for (const button of document.querySelectorAll<HTMLButtonElement>("[data-effect]")) {
  button.addEventListener("click", () => trigger(button.dataset.effect as LabEffect));
}
window.render_vfx_lab_to_text = () => JSON.stringify(snapshot());
window.vfx_lab_validation = { trigger, snapshot };
window.addEventListener("resize", resize);
resize();
trigger((new URLSearchParams(window.location.search).get("effect") as LabEffect | null) ?? "dash");
let previous = performance.now();
function animate(now: number): void {
  const dt = Math.min(0.05, Math.max(0.001, (now - previous) / 1000));
  previous = now;
  time += dt;
  hero.animation.update({ state: "idle", timeSeconds: time, deltaSeconds: dt });
  vfx.update(dt);
  postFx.update(time, dt);
  postFx.composer.render();
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
