import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { createCharacterProviderRegistry } from "./presentation/characters/providers";
import type { CharacterAnimationState } from "./presentation/animation/controller";
import type { CharacterRuntime } from "./presentation/characters/types";
import type { CharacterDistanceLodReport, CharacterLodMode } from "./presentation/characters/distance-lod";

type Actor = "hero" | "enemy" | "both";
type View = "front" | "side" | "right" | "back" | "three-quarter" | "gameplay";
type Mode = "idle" | "walk" | "dash" | "hit" | "threat";
type ProviderMode = "procedural" | "gltf";
type Framing = "full" | "grip";
type StressPose =
  | "apose"
  | "arms-forward"
  | "overhead"
  | "deep-squat"
  | "lunge-left"
  | "lunge-right"
  | "max-stride";

interface WorldBounds {
  min: number[];
  max: number[];
  size: number[];
}

interface CharacterDiagnostics {
  bodyBoundsWorld: WorldBounds;
  ground: {
    groundY: number;
    bodyMinimumY: number;
    contactErrorWorld: number;
    contactErrorHeightRatio: number;
    leftFootBone: number[] | null;
    rightFootBone: number[] | null;
    runtimeCalibration: Record<string, string | number> | null;
  };
  grip: {
    wrist: number[] | null;
    primaryGrip: number[] | null;
    wristToPrimaryGripWorld: number | null;
    wristToPrimaryGripHeightRatio: number | null;
  };
  weapon: {
    bladeBase: number[] | null;
    bladeTip: number[] | null;
    trailEdge: number[] | null;
    bladeLengthWorld: number | null;
    lengthDirection: number[] | null;
    cuttingEdgeDirection: number[] | null;
    axisOrthogonality: number | null;
  };
}

interface CharacterLabSnapshot {
  actor: Actor;
  view: View | null;
  projection: "perspective" | "orthographic";
  mode: Mode;
  provider: ProviderMode;
  framing: Framing;
  debug: boolean;
  stressPose: StressPose | null;
  lodMode: CharacterLodMode;
  requestedAnimation: {
    state: CharacterAnimationState | null;
    variant: string | null;
    sourceProgress: number | null;
  };
  playbackSpeed: number;
  loop: boolean;
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
      distanceLod: CharacterDistanceLodReport | null;
    };
    renderer: RendererStats;
    comparison: CharacterComparisonProjection | null;
    diagnostics: CharacterDiagnostics;
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

interface ValidationRig {
  readonly runtime: CharacterRuntime;
  readonly restQuaternions: ReadonlyMap<THREE.Bone, THREE.Quaternion>;
  readonly restPositions: ReadonlyMap<THREE.Bone, THREE.Vector3>;
}

interface RuntimeDebugOverlay {
  update(): void;
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
const framing = params.get("framing") === "grip" ? "grip" : "full";
const debugOverlays = params.get("debug") === "1";
const stressPose = parseStressPose(params.get("stress"));
const lodMode = parseLodMode(params.get("lod"));
const requestedAnimationState = parseAnimationState(params.get("state"));
const requestedAnimationVariant = parseAnimationVariant(params.get("variant"));
const requestedSourceProgress = parseUnitInterval(params.get("progress"));
const enemyVariant = parseEnemyVariant(params.get("enemyVariant"));
const playbackSpeed = parsePlaybackSpeed(params.get("speed"));
const loop = params.get("loop") !== "0";
const frozenAtMs = parseFreezeMs(params.get("freezeMs"));
const autoTurn = params.get("turn") === "1";
const cleanCapture = params.get("clean") === "1";
const comparisonCapture = params.get("comparison") === "1";
const silhouetteCapture = params.get("silhouette") === "1";
const animationEnabled = params.get("animate") !== "0" && stressPose === null;
const weaponVisible = params.get("weapon") !== "0";
const isEvidenceView = selectedView !== null
  || projection === "orthographic"
  || selectedActor !== "both"
  || framing === "grip"
  || debugOverlays
  || stressPose !== null;

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
scene.background = comparisonCapture
  ? null
  : new THREE.Color(silhouetteCapture ? 0xf2f4f3 : 0x171d21);
scene.fog = comparisonCapture || silhouetteCapture ? null : new THREE.Fog(0x171d21, 10, 24);

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
floor.visible = !comparisonCapture && !silhouetteCapture;
scene.add(floor);
const ring = new THREE.Mesh(
  new THREE.RingGeometry(3.45, 3.47, 96),
  new THREE.MeshBasicMaterial({ color: 0x5e7880, transparent: true, opacity: 0.25, side: THREE.DoubleSide }),
);
ring.rotation.x = -Math.PI / 2;
ring.position.y = 0.004;
ring.visible = !comparisonCapture && !silhouetteCapture;
scene.add(ring);

const characterProviders = createCharacterProviderRegistry();
const heroProviderId = providerMode === "gltf" ? "gltf-hero-v5r" : "procedural-hero-v5";
const enemyProviderId = providerMode === "gltf" ? "gltf-enemy-v5r" : "procedural-enemy-v5";
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
  hero.root.userData.characterLodMode = lodMode;
  setWeaponPresentationVisible(hero, weaponVisible);
  scene.add(hero.root);
}
const enemy: CharacterRuntime | null = selectedActor === "hero"
  ? null
  : characterProviders.get(enemyProviderId).create({ role: "enemy", variant: enemyVariant });
if (enemy) {
  enemy.root.position.x = selectedActor === "both" ? 1.72 : 0;
  enemy.root.userData.characterLodMode = lodMode;
  setWeaponPresentationVisible(enemy, weaponVisible);
  scene.add(enemy.root);
}
if (silhouetteCapture) {
  scene.overrideMaterial = new THREE.MeshBasicMaterial({
    color: 0x111416,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

let last = performance.now();
let time = 0;
let lastRendererStats: RendererStats = rendererStats();
const validationRigs = new Map<CharacterRuntime, ValidationRig>();
for (const runtime of [hero, enemy]) {
  if (!runtime) continue;
  validationRigs.set(runtime, createValidationRig(runtime));
}
const openHandPresentations = new Map<CharacterRuntime, THREE.Object3D>();
for (const runtime of [hero, enemy]) {
  if (!runtime) continue;
  runtime.root.traverse((object) => {
    if (object.userData.presentationAttachment === "open-hand") openHandPresentations.set(runtime, object);
  });
}
const runtimeDebugOverlays = debugOverlays
  ? [hero, enemy].flatMap((runtime) => runtime ? [createRuntimeDebugOverlay(runtime)] : [])
  : [];

function parseActor(value: string | null): Actor {
  return value === "hero" || value === "enemy" ? value : "both";
}

function parseView(value: string | null): View | null {
  return value === "front"
    || value === "side"
    || value === "right"
    || value === "back"
    || value === "three-quarter"
    || value === "gameplay"
    ? value
    : null;
}

function parseMode(value: string | null): Mode {
  return value === "walk" || value === "dash" || value === "hit" || value === "threat" ? value : "idle";
}

function parseProviderMode(value: string | null): ProviderMode {
  return value === "gltf" ? "gltf" : "procedural";
}

function parseAnimationState(value: string | null): CharacterAnimationState | null {
  return value === "idle"
    || value === "anticipation"
    || value === "action"
    || value === "arrival"
    || value === "recovery"
    || value === "hit"
    || value === "death"
    ? value
    : null;
}

function parseAnimationVariant(value: string | null): string | null {
  const safe = value?.trim() ?? "";
  return /^[a-z0-9-]{1,40}$/.test(safe) ? safe : null;
}

function parseUnitInterval(value: string | null): number | null {
  if (value === null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? THREE.MathUtils.clamp(parsed, 0, 1) : null;
}

function parseEnemyVariant(value: string | null): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? THREE.MathUtils.clamp(Math.round(parsed), 0, 12) : 0;
}

function parseStressPose(value: string | null): StressPose | null {
  return value === "apose"
    || value === "arms-forward"
    || value === "overhead"
    || value === "deep-squat"
    || value === "lunge-left"
    || value === "lunge-right"
    || value === "max-stride"
    ? value
    : null;
}

function parseLodMode(value: string | null): CharacterLodMode {
  return value === "near" || value === "far" ? value : "auto";
}

function parsePlaybackSpeed(value: string | null): number {
  const parsed = Number(value ?? 1);
  return Number.isFinite(parsed) ? THREE.MathUtils.clamp(parsed, 0.1, 3) : 1;
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
    right: [9, 1.48, 0],
    back: [0, 1.48, -9],
    "three-quarter": [6.36, 1.48, 6.36],
    gameplay: [6.5, 6.2, 8.8],
  };
  activeCamera.position.set(...positions[view]);
}

function createValidationRig(runtime: CharacterRuntime): ValidationRig {
  const restQuaternions = new Map<THREE.Bone, THREE.Quaternion>();
  const restPositions = new Map<THREE.Bone, THREE.Vector3>();
  runtime.root.traverse((object) => {
    if (!(object instanceof THREE.Bone)) return;
    restQuaternions.set(object, object.quaternion.clone());
    restPositions.set(object, object.position.clone());
  });
  return { runtime, restQuaternions, restPositions };
}

function setWeaponPresentationVisible(runtime: CharacterRuntime, visible: boolean) {
  const mount = runtime.weaponMounts.get("primary-weapon");
  if (!mount) return;
  mount.visible = true;
  mount.traverse((object) => {
    if (object.userData.presentationAttachment === "primary-grip-gauntlet") object.visible = visible;
    if (object.userData.presentationAttachment === "open-hand") object.visible = !visible;
  });
  mount.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    let current: THREE.Object3D | null = object;
    let attachment: "grip" | "open" | null = null;
    while (current && current !== mount) {
      if (current.userData.presentationAttachment === "primary-grip-gauntlet") {
        attachment = "grip";
        break;
      }
      if (current.userData.presentationAttachment === "open-hand") {
        attachment = "open";
        break;
      }
      current = current.parent;
    }
    object.visible = attachment === "grip" ? visible : attachment === "open" ? !visible : visible;
  });
}

function rotateBoneInWorldSpace(bone: THREE.Bone, axis: THREE.Vector3, angle: number) {
  if (Math.abs(angle) < 0.000001) return;
  bone.updateWorldMatrix(true, true);
  const parentWorld = new THREE.Quaternion();
  const boneWorld = new THREE.Quaternion();
  bone.parent?.getWorldQuaternion(parentWorld);
  bone.getWorldQuaternion(boneWorld);
  const worldDelta = new THREE.Quaternion().setFromAxisAngle(axis.clone().normalize(), angle);
  bone.quaternion.copy(parentWorld.invert().multiply(worldDelta.multiply(boneWorld))).normalize();
}

function aimBoneTowardCharacterDirection(
  runtime: CharacterRuntime,
  bone: THREE.Bone | null,
  endpoint: THREE.Object3D | null,
  direction: THREE.Vector3,
) {
  if (!bone || !endpoint || direction.lengthSq() < 0.000001) return;
  runtime.root.updateWorldMatrix(true, true);
  const pivot = bone.getWorldPosition(new THREE.Vector3());
  const current = endpoint.getWorldPosition(new THREE.Vector3()).sub(pivot);
  if (current.lengthSq() < 0.000001) return;
  const rootWorldQuaternion = runtime.root.getWorldQuaternion(new THREE.Quaternion());
  const desired = direction.clone().normalize().applyQuaternion(rootWorldQuaternion);
  const delta = new THREE.Quaternion().setFromUnitVectors(current.normalize(), desired);
  const axis = new THREE.Vector3(delta.x, delta.y, delta.z);
  if (axis.lengthSq() < 0.000001) return;
  axis.normalize();
  rotateBoneInWorldSpace(bone, axis, 2 * Math.atan2(
    Math.sqrt(delta.x * delta.x + delta.y * delta.y + delta.z * delta.z),
    Math.abs(delta.w),
  ));
  runtime.root.updateWorldMatrix(true, true);
}

function rotateBoneEndpointTowardTarget(
  runtime: CharacterRuntime,
  bone: THREE.Bone | null,
  endpoint: THREE.Object3D | null,
  target: THREE.Vector3,
  weight: number,
) {
  if (!bone || !endpoint) return;
  runtime.root.updateWorldMatrix(true, true);
  const pivot = bone.getWorldPosition(new THREE.Vector3());
  const current = endpoint.getWorldPosition(new THREE.Vector3()).sub(pivot);
  const desired = target.clone().sub(pivot);
  if (current.lengthSq() < 0.000001 || desired.lengthSq() < 0.000001) return;
  const delta = new THREE.Quaternion().setFromUnitVectors(current.normalize(), desired.normalize());
  const axis = new THREE.Vector3(delta.x, delta.y, delta.z);
  if (axis.lengthSq() < 0.000001) return;
  axis.normalize();
  const angle = Math.min(
    0.7,
    2 * Math.atan2(
      Math.sqrt(delta.x * delta.x + delta.y * delta.y + delta.z * delta.z),
      Math.abs(delta.w),
    ) * weight,
  );
  rotateBoneInWorldSpace(bone, axis, angle);
}

function translateBoneInWorldSpace(bone: THREE.Bone | null, offset: THREE.Vector3) {
  if (!bone || offset.lengthSq() < 0.000001) return;
  bone.parent?.updateWorldMatrix(true, false);
  const parentQuaternion = bone.parent?.getWorldQuaternion(new THREE.Quaternion()) ?? new THREE.Quaternion();
  const parentScale = bone.parent?.getWorldScale(new THREE.Vector3()) ?? new THREE.Vector3(1, 1, 1);
  const localOffset = offset.clone().applyQuaternion(parentQuaternion.invert());
  localOffset.set(
    localOffset.x / Math.max(0.0001, parentScale.x),
    localOffset.y / Math.max(0.0001, parentScale.y),
    localOffset.z / Math.max(0.0001, parentScale.z),
  );
  bone.position.add(localOffset);
}

function solveTwoBoneToTarget(
  runtime: CharacterRuntime,
  upperLeg: THREE.Bone | null,
  lowerLeg: THREE.Bone | null,
  foot: THREE.Object3D | null,
  target: THREE.Vector3,
  poleDirection: THREE.Vector3,
) {
  if (!upperLeg || !lowerLeg || !foot) return;
  runtime.root.updateWorldMatrix(true, true);
  const hip = upperLeg.getWorldPosition(new THREE.Vector3());
  const knee = lowerLeg.getWorldPosition(new THREE.Vector3());
  const ankle = foot.getWorldPosition(new THREE.Vector3());
  const upperLength = hip.distanceTo(knee);
  const lowerLength = knee.distanceTo(ankle);
  if (upperLength < 0.001 || lowerLength < 0.001) return;
  const towardTarget = target.clone().sub(hip);
  if (towardTarget.lengthSq() < 0.000001) return;
  const targetDirection = towardTarget.normalize();
  const targetDistance = THREE.MathUtils.clamp(
    hip.distanceTo(target),
    Math.abs(upperLength - lowerLength) + 0.002,
    upperLength + lowerLength - 0.002,
  );
  const reachableTarget = hip.clone().addScaledVector(targetDirection, targetDistance);
  const along = (upperLength * upperLength + targetDistance * targetDistance - lowerLength * lowerLength)
    / (2 * targetDistance);
  const height = Math.sqrt(Math.max(0, upperLength * upperLength - along * along));
  let pole = poleDirection.clone().addScaledVector(targetDirection, -poleDirection.dot(targetDirection));
  if (pole.lengthSq() < 0.000001) pole = new THREE.Vector3(1, 0, 0);
  pole.normalize();
  const kneeTarget = hip.clone().addScaledVector(targetDirection, along).addScaledVector(pole, height);
  for (let iteration = 0; iteration < 4; iteration += 1) {
    rotateBoneEndpointTowardTarget(runtime, upperLeg, lowerLeg, kneeTarget, 1);
    rotateBoneEndpointTowardTarget(runtime, lowerLeg, foot, reachableTarget, 1);
  }
}

function landmarkBone(runtime: CharacterRuntime, name: string): THREE.Bone | null {
  const object = runtime.landmarks.get(name);
  return object instanceof THREE.Bone ? object : null;
}

function applyStressPose(rig: ValidationRig, pose: StressPose) {
  rig.restQuaternions.forEach((rest, bone) => bone.quaternion.copy(rest));
  rig.restPositions.forEach((rest, bone) => bone.position.copy(rest));
  const { runtime } = rig;
  const leftUpperArm = landmarkBone(runtime, "left-upper-arm");
  const rightUpperArm = landmarkBone(runtime, "right-upper-arm");
  const leftForearm = landmarkBone(runtime, "left-forearm");
  const rightForearm = landmarkBone(runtime, "right-forearm");
  const leftHand = runtime.landmarks.get("left-palm") ?? null;
  const rightHand = runtime.landmarks.get("right-palm") ?? null;
  if (pose === "apose") {
    const placeArm = (
      upperArm: THREE.Bone | null,
      forearm: THREE.Bone | null,
      hand: THREE.Object3D | null,
      direction: THREE.Vector3,
    ) => {
      if (!upperArm || !forearm || !hand) return;
      runtime.root.updateWorldMatrix(true, true);
      const shoulder = upperArm.getWorldPosition(new THREE.Vector3());
      const elbow = forearm.getWorldPosition(new THREE.Vector3());
      const wrist = hand.getWorldPosition(new THREE.Vector3());
      const reach = shoulder.distanceTo(elbow) + elbow.distanceTo(wrist);
      const target = shoulder.addScaledVector(direction.normalize(), reach * 0.96);
      solveTwoBoneToTarget(runtime, upperArm, forearm, hand, target, new THREE.Vector3(0, 0, -1));
    };
    placeArm(leftUpperArm, leftForearm, leftHand, new THREE.Vector3(-0.5, -0.866, 0));
    if (leftUpperArm && leftHand && rightUpperArm && rightForearm && rightHand) {
      runtime.root.updateWorldMatrix(true, true);
      const leftShoulder = leftUpperArm.getWorldPosition(new THREE.Vector3());
      const leftWrist = leftHand.getWorldPosition(new THREE.Vector3());
      const rightShoulder = rightUpperArm.getWorldPosition(new THREE.Vector3());
      const mirroredDelta = leftWrist.sub(leftShoulder);
      const rightTarget = rightShoulder.add(new THREE.Vector3(-mirroredDelta.x, mirroredDelta.y, mirroredDelta.z));
      solveTwoBoneToTarget(runtime, rightUpperArm, rightForearm, rightHand, rightTarget, new THREE.Vector3(0, 0, -1));
    }
    return;
  }
  if (pose === "arms-forward" || pose === "overhead") {
    const direction = pose === "arms-forward"
      ? new THREE.Vector3(0, 0, 1)
      : new THREE.Vector3(0, 1, 0.08);
    aimBoneTowardCharacterDirection(runtime, leftUpperArm, leftHand, direction);
    aimBoneTowardCharacterDirection(runtime, rightUpperArm, rightHand, direction);
    return;
  }

  const leftUpperLeg = landmarkBone(runtime, "left-upper-leg");
  const rightUpperLeg = landmarkBone(runtime, "right-upper-leg");
  const leftLowerLeg = landmarkBone(runtime, "left-lower-leg");
  const rightLowerLeg = landmarkBone(runtime, "right-lower-leg");
  const leftFoot = runtime.landmarks.get("left-foot") ?? null;
  const rightFoot = runtime.landmarks.get("right-foot") ?? null;
  const skeletonRoot = landmarkBone(runtime, "root");
  runtime.root.updateWorldMatrix(true, true);
  const leftTarget = worldPosition(leftFoot);
  const rightTarget = worldPosition(rightFoot);
  if (!leftTarget || !rightTarget) return;
  const height = runtime.role === "hero" ? 3.3 : 3.157;
  const rootQuaternion = runtime.root.getWorldQuaternion(new THREE.Quaternion());
  const kneePole = new THREE.Vector3(0, 0, 1).applyQuaternion(rootQuaternion).normalize();
  const characterOffset = (x: number, z: number) => new THREE.Vector3(x, 0, z).applyQuaternion(rootQuaternion);
  if (pose === "deep-squat") {
    translateBoneInWorldSpace(skeletonRoot, new THREE.Vector3(0, -height * 0.17, 0));
  } else if (pose === "lunge-left") {
    translateBoneInWorldSpace(skeletonRoot, new THREE.Vector3(0, -height * 0.12, 0));
    leftTarget.add(characterOffset(-height * 0.18, height * 0.08));
    rightTarget.add(characterOffset(height * 0.04, -height * 0.05));
  } else if (pose === "lunge-right") {
    translateBoneInWorldSpace(skeletonRoot, new THREE.Vector3(0, -height * 0.12, 0));
    leftTarget.add(characterOffset(-height * 0.04, -height * 0.05));
    rightTarget.add(characterOffset(height * 0.18, height * 0.08));
  } else if (pose === "max-stride") {
    translateBoneInWorldSpace(skeletonRoot, new THREE.Vector3(0, -height * 0.08, 0));
    leftTarget.add(characterOffset(0, height * 0.24));
    rightTarget.add(characterOffset(0, -height * 0.24));
  }
  solveTwoBoneToTarget(runtime, leftUpperLeg, leftLowerLeg, leftFoot, leftTarget, kneePole);
  solveTwoBoneToTarget(runtime, rightUpperLeg, rightLowerLeg, rightFoot, rightTarget, kneePole);
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
    const orthographicHeight = framing === "grip" ? 1.05 : 4.8;
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
  const playbackTime = frameTime * playbackSpeed;
  const cycle = loop ? playbackTime % 1.65 : Math.min(playbackTime, 1.649);
  const dashProgress = mode === "dash" && cycle < 0.34 ? cycle / 0.34 : null;
  const recoveryProgress = mode === "dash" && cycle >= 0.34 && cycle < 0.68 ? (cycle - 0.34) / 0.34 : null;
  const walking = mode === "walk";
  const hitAge = mode === "hit" ? frameTime % 1.5 : null;
  const derivedHeroState: CharacterAnimationState = hitAge !== null
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
  const heroState = requestedAnimationState ?? derivedHeroState;
  const heroSourceProgress = requestedSourceProgress
    ?? (hitAge === null ? dashProgress ?? recoveryProgress : Math.min(1, hitAge / 0.5));
  hero?.animation.update({
    state: heroState,
    timeSeconds: playbackTime,
    deltaSeconds: dt * playbackSpeed,
    turn: mode === "threat" ? Math.sin(playbackTime * 2.1) : 0,
    sourceProgress: heroSourceProgress,
    variant: requestedAnimationVariant,
  });
  const derivedEnemyState: CharacterAnimationState = hitAge !== null && hitAge < 0.19
    ? "hit"
    : walking || mode === "threat"
      ? "action"
      : "idle";
  const enemyState = requestedAnimationState ?? derivedEnemyState;
  enemy?.animation.update({
    state: enemyState,
    timeSeconds: playbackTime,
    deltaSeconds: dt * playbackSpeed,
    distanceMoved: walking || (requestedAnimationState === "action" && !requestedAnimationVariant) ? dt * 2.8 : 0,
    speedNormalized: walking || requestedAnimationState === "action" ? 0.9 : 0,
    turn: mode === "threat" ? -Math.sin(playbackTime * 1.7) : 0,
    threat: mode === "threat" ? 1 : 0,
    hitAgeSeconds: hitAge !== null && hitAge < 0.19 ? hitAge : null,
    sourceProgress: requestedSourceProgress ?? (hitAge === null ? null : Math.min(1, hitAge / 0.5)),
    variant: requestedAnimationVariant,
  });
  if (enemy) {
    const directCutState = requestedAnimationState === "hit" || requestedAnimationState === "death";
    enemy.deathPresentation?.setCutVisible(
      directCutState || (mode === "hit" && hitAge !== null && hitAge > 0.045 && hitAge < 0.42),
    );
    enemy.deathPresentation?.setCutHeat(
      directCutState ? 1 : hitAge === null ? 0 : THREE.MathUtils.smoothstep(hitAge, 0.04, 0.12),
    );
  }
  if (autoTurn) {
    if (hero) hero.root.rotation.y = playbackTime * 0.35;
    if (enemy) enemy.root.rotation.y = playbackTime * 0.35;
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
    let localBounds: THREE.Box3 | null = null;
    if (object instanceof THREE.SkinnedMesh) {
      object.computeBoundingBox();
      localBounds = object.boundingBox;
    } else {
      if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
      localBounds = object.geometry.boundingBox;
    }
    if (!localBounds) return;
    transformed.copy(localBounds).applyMatrix4(object.matrixWorld);
    bounds.union(transformed);
  });
  if (bounds.isEmpty()) throw new Error(`Character Lab could not measure ${root.name || "character"}.`);
  return bounds;
}

function worldPosition(object: THREE.Object3D | undefined | null): THREE.Vector3 | null {
  return object ? object.getWorldPosition(new THREE.Vector3()) : null;
}

function worldBoundsSnapshot(bounds: THREE.Box3): WorldBounds {
  return {
    min: bounds.min.toArray(),
    max: bounds.max.toArray(),
    size: bounds.getSize(new THREE.Vector3()).toArray(),
  };
}

function runtimeDiagnostics(runtime: CharacterRuntime, height: number): CharacterDiagnostics {
  runtime.root.updateWorldMatrix(true, true);
  const weaponRoot = runtime.weaponMounts.get("primary-weapon") ?? null;
  const bodyBounds = meshBounds(runtime.root, weaponRoot);
  const rootWorld = runtime.root.getWorldPosition(new THREE.Vector3());
  const leftFoot = worldPosition(runtime.landmarks.get("left-foot"));
  const rightFoot = worldPosition(runtime.landmarks.get("right-foot"));
  const wrist = worldPosition(runtime.landmarks.get("right-palm"));
  const primaryGrip = worldPosition(runtime.landmarks.get("weapon-primary-grip"));
  const bladeBase = worldPosition(runtime.landmarks.get("weapon-blade-base"));
  const bladeTip = worldPosition(runtime.landmarks.get("weapon-blade-tip"));
  const trailEdge = worldPosition(runtime.landmarks.get("weapon-trail-edge"));
  const wristToGrip = wrist && primaryGrip ? wrist.distanceTo(primaryGrip) : null;
  let bladeLength: number | null = null;
  let lengthDirection: THREE.Vector3 | null = null;
  let cuttingEdgeDirection: THREE.Vector3 | null = null;
  let axisOrthogonality: number | null = null;
  if (bladeBase && bladeTip) {
    const axis = bladeTip.clone().sub(bladeBase);
    bladeLength = axis.length();
    if (bladeLength > 0.000001) lengthDirection = axis.normalize();
  }
  if (bladeBase && trailEdge && lengthDirection) {
    const projected = bladeBase.clone().addScaledVector(
      lengthDirection,
      trailEdge.clone().sub(bladeBase).dot(lengthDirection),
    );
    const edgeAxis = trailEdge.clone().sub(projected);
    if (edgeAxis.lengthSq() > 0.000001) {
      cuttingEdgeDirection = edgeAxis.normalize();
      axisOrthogonality = Math.abs(cuttingEdgeDirection.dot(lengthDirection));
    }
  }
  const contactError = Math.abs(bodyBounds.min.y - rootWorld.y);
  return {
    bodyBoundsWorld: worldBoundsSnapshot(bodyBounds),
    ground: {
      groundY: rootWorld.y,
      bodyMinimumY: bodyBounds.min.y,
      contactErrorWorld: contactError,
      contactErrorHeightRatio: contactError / height,
      leftFootBone: leftFoot?.toArray() ?? null,
      rightFootBone: rightFoot?.toArray() ?? null,
      runtimeCalibration: runtime.root.userData.groundingCalibration ?? null,
    },
    grip: {
      wrist: wrist?.toArray() ?? null,
      primaryGrip: primaryGrip?.toArray() ?? null,
      wristToPrimaryGripWorld: wristToGrip,
      wristToPrimaryGripHeightRatio: wristToGrip === null ? null : wristToGrip / height,
    },
    weapon: {
      bladeBase: bladeBase?.toArray() ?? null,
      bladeTip: bladeTip?.toArray() ?? null,
      trailEdge: trailEdge?.toArray() ?? null,
      bladeLengthWorld: bladeLength,
      lengthDirection: lengthDirection?.toArray() ?? null,
      cuttingEdgeDirection: cuttingEdgeDirection?.toArray() ?? null,
      axisOrthogonality,
    },
  };
}

function createDiagnosticLine(color: number) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
  const material = new THREE.LineBasicMaterial({ color, depthTest: false, toneMapped: false, fog: false });
  const line = new THREE.Line(geometry, material);
  line.frustumCulled = false;
  line.renderOrder = 100;
  scene.add(line);
  return line;
}

function updateDiagnosticLine(line: THREE.Line, start: THREE.Vector3 | null, end: THREE.Vector3 | null) {
  line.visible = start !== null && end !== null;
  if (!start || !end) return;
  const position = line.geometry.getAttribute("position") as THREE.BufferAttribute;
  position.setXYZ(0, start.x, start.y, start.z);
  position.setXYZ(1, end.x, end.y, end.z);
  position.needsUpdate = true;
  line.geometry.computeBoundingSphere();
}

function createDiagnosticMarker(color: number, radius = 0.025) {
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 10, 8),
    new THREE.MeshBasicMaterial({ color, depthTest: false, toneMapped: false, fog: false }),
  );
  marker.renderOrder = 101;
  marker.frustumCulled = false;
  scene.add(marker);
  return marker;
}

function setDiagnosticMarker(marker: THREE.Object3D, position: THREE.Vector3 | null) {
  marker.visible = position !== null;
  if (position) marker.position.copy(position);
}

function createRuntimeDebugOverlay(runtime: CharacterRuntime): RuntimeDebugOverlay {
  const skeleton = new THREE.SkeletonHelper(runtime.root);
  skeleton.name = `${runtime.role}-validation-skeleton`;
  const skeletonMaterial = skeleton.material as THREE.LineBasicMaterial;
  skeletonMaterial.color.set(runtime.role === "hero" ? 0x66dfff : 0xff713d);
  skeletonMaterial.depthTest = false;
  skeletonMaterial.transparent = true;
  skeletonMaterial.opacity = 0.72;
  skeletonMaterial.fog = false;
  skeleton.renderOrder = 98;
  scene.add(skeleton);

  const box = new THREE.Box3();
  const boundsHelper = new THREE.Box3Helper(box, runtime.role === "hero" ? 0x32ff9a : 0xffd24a);
  const boundsMaterial = boundsHelper.material as THREE.LineBasicMaterial;
  boundsMaterial.depthTest = false;
  boundsMaterial.transparent = true;
  boundsMaterial.opacity = 0.78;
  boundsHelper.renderOrder = 97;
  scene.add(boundsHelper);

  const leftFootLine = createDiagnosticLine(0x32ff9a);
  const rightFootLine = createDiagnosticLine(0x32ff9a);
  const gripLine = createDiagnosticLine(0xffd84c);
  const bladeAxisLine = createDiagnosticLine(0x6bdcff);
  const cuttingEdgeLine = createDiagnosticLine(0xff4f91);
  const leftFootMarker = createDiagnosticMarker(0x32ff9a);
  const rightFootMarker = createDiagnosticMarker(0x32ff9a);
  const wristMarker = createDiagnosticMarker(0xffd84c, 0.022);
  const gripMarker = createDiagnosticMarker(0xff9f32, 0.022);
  const bladeBaseMarker = createDiagnosticMarker(0x6bdcff, 0.02);
  const bladeTipMarker = createDiagnosticMarker(0xffffff, 0.02);
  const edgeMarker = createDiagnosticMarker(0xff4f91, 0.02);

  return {
    update() {
      runtime.root.updateWorldMatrix(true, true);
      const weaponRoot = runtime.weaponMounts.get("primary-weapon") ?? null;
      box.copy(meshBounds(runtime.root, weaponRoot));
      const groundY = runtime.root.getWorldPosition(new THREE.Vector3()).y;
      const leftFoot = worldPosition(runtime.landmarks.get("left-foot"));
      const rightFoot = worldPosition(runtime.landmarks.get("right-foot"));
      const wrist = worldPosition(runtime.landmarks.get("right-palm"));
      const primaryGrip = weaponVisible ? worldPosition(runtime.landmarks.get("weapon-primary-grip")) : null;
      const bladeBase = weaponVisible ? worldPosition(runtime.landmarks.get("weapon-blade-base")) : null;
      const bladeTip = weaponVisible ? worldPosition(runtime.landmarks.get("weapon-blade-tip")) : null;
      const trailEdge = weaponVisible ? worldPosition(runtime.landmarks.get("weapon-trail-edge")) : null;
      updateDiagnosticLine(leftFootLine, leftFoot, leftFoot ? new THREE.Vector3(leftFoot.x, groundY, leftFoot.z) : null);
      updateDiagnosticLine(rightFootLine, rightFoot, rightFoot ? new THREE.Vector3(rightFoot.x, groundY, rightFoot.z) : null);
      updateDiagnosticLine(gripLine, wrist, primaryGrip);
      updateDiagnosticLine(bladeAxisLine, bladeBase, bladeTip);
      let edgeProjection: THREE.Vector3 | null = null;
      if (bladeBase && bladeTip && trailEdge) {
        const axis = bladeTip.clone().sub(bladeBase).normalize();
        edgeProjection = bladeBase.clone().addScaledVector(axis, trailEdge.clone().sub(bladeBase).dot(axis));
      }
      updateDiagnosticLine(cuttingEdgeLine, edgeProjection, trailEdge);
      setDiagnosticMarker(leftFootMarker, leftFoot);
      setDiagnosticMarker(rightFootMarker, rightFoot);
      setDiagnosticMarker(wristMarker, wrist);
      setDiagnosticMarker(gripMarker, primaryGrip);
      setDiagnosticMarker(bladeBaseMarker, bladeBase);
      setDiagnosticMarker(bladeTipMarker, bladeTip);
      setDiagnosticMarker(edgeMarker, trailEdge);
      skeleton.updateMatrixWorld(true);
      boundsHelper.updateMatrixWorld(true);
    },
  };
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

function alignOpenHandPresentation(runtime: CharacterRuntime, hand: THREE.Object3D) {
  const forearm = runtime.landmarks.get("right-forearm");
  const wrist = runtime.landmarks.get("right-palm");
  const parent = hand.parent;
  if (!forearm || !wrist || !parent) return;
  runtime.root.updateWorldMatrix(true, true);
  const elbow = forearm.getWorldPosition(new THREE.Vector3());
  const wristPosition = wrist.getWorldPosition(new THREE.Vector3());
  const direction = wristPosition.clone().sub(elbow).normalize();
  const desiredWorldQuaternion = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction,
  );
  const parentWorldQuaternion = parent.getWorldQuaternion(new THREE.Quaternion());
  hand.position.copy(parent.worldToLocal(wristPosition.clone()));
  hand.quaternion.copy(parentWorldQuaternion.invert().multiply(desiredWorldQuaternion));
  hand.updateWorldMatrix(true, true);
}

function updateGripCamera() {
  if (framing !== "grip") return;
  const runtime = selectedActor === "enemy" ? enemy : hero ?? enemy;
  if (!runtime) return;
  runtime.root.updateWorldMatrix(true, true);
  const wrist = worldPosition(runtime.landmarks.get("right-palm"));
  const guard = worldPosition(runtime.landmarks.get("weapon-guard-center"));
  const bladeBase = worldPosition(runtime.landmarks.get("weapon-blade-base"));
  if (!wrist || !guard || !bladeBase) return;
  const target = wrist.clone().add(guard).add(bladeBase).multiplyScalar(1 / 3);
  const offsets: Record<View, THREE.Vector3> = {
    front: new THREE.Vector3(0, 0.06, 2.15),
    side: new THREE.Vector3(-2.15, 0.06, 0),
    right: new THREE.Vector3(2.15, 0.06, 0),
    back: new THREE.Vector3(0, 0.06, -2.15),
    "three-quarter": new THREE.Vector3(1.52, 0.16, 1.52),
    gameplay: new THREE.Vector3(1.42, 1.18, 1.88),
  };
  cameraTarget.copy(target);
  controls.target.copy(target);
  camera.position.copy(target).add(offsets[selectedView ?? "three-quarter"]);
  camera.lookAt(target);
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
        distanceLod: hero.root.userData.characterDistanceLod ?? null,
      },
      renderer: lastRendererStats,
      comparison: comparisonCapture ? runtimeComparisonProjection(hero) : null,
      diagnostics: runtimeDiagnostics(hero, 3.3),
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
        distanceLod: enemy.root.userData.characterDistanceLod ?? null,
      },
      renderer: lastRendererStats,
      comparison: comparisonCapture ? runtimeComparisonProjection(enemy) : null,
      diagnostics: runtimeDiagnostics(enemy, 3.157),
    };
  }
  return {
    actor: selectedActor,
    view: selectedView,
    projection,
    mode,
    provider: providerMode,
    framing,
    debug: debugOverlays,
    stressPose,
    lodMode,
    requestedAnimation: {
      state: requestedAnimationState,
      variant: requestedAnimationVariant,
      sourceProgress: requestedSourceProgress,
    },
    playbackSpeed,
    loop,
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
  if (frozenAtMs === null && animationEnabled) {
    time += dt;
    applyAnimation(time, dt);
  }
  if (stressPose) validationRigs.forEach((rig) => applyStressPose(rig, stressPose));
  if (!weaponVisible) openHandPresentations.forEach((hand, runtime) => alignOpenHandPresentation(runtime, hand));
  updateGripCamera();
  runtimeDebugOverlays.forEach((overlay) => overlay.update());
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
