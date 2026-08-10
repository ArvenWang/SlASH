import * as THREE from "three";
import type GUI from "lil-gui";
import "./styles.css";
import { createAudioRuntime } from "./audio";
import {
  createEnemyAnimator,
  createHeroAnimator,
  dampAngle,
  signedAngleDelta,
  type EnemyAnimator,
} from "./characters/animation";
import { createCorpseRuntime, type CorpseRuntime } from "./characters/corpse";
import { createEnemyCharacter, type EnemyCharacter } from "./characters/enemy";
import { createHeroCharacter } from "./characters/hero";
import { createDiagnostics } from "./diagnostics";
import {
  advanceGame,
  advanceStage,
  createGame,
  createStressGame,
  getGameSnapshot,
  queueDash,
  restartStage,
  segmentIntersectsCircle,
  DASH_HIT_RADIUS,
  type EnemyState,
  type GameEvent,
  type GameState,
} from "./game/game";
import { createPostFx } from "./postfx";
import { createEnvironment } from "./scene/environment";
import { createVfxRuntime } from "./vfx";

declare global {
  interface Window {
    render_game_to_text: () => string;
    advanceTime: (milliseconds: number) => void;
    get_slash_diagnostics: () => ReturnType<ReturnType<typeof createDiagnostics>["snapshot"]>;
    reset_slash_diagnostics: () => void;
    slash_validation?: {
      setStage(stageIndex: number): void;
      setStressScenario(enemyCount?: number): void;
      dashTo(x: number, z: number): string;
      setEnemyMotion(enabled: boolean): void;
      loseGraphicsContext(): void;
      restoreGraphicsContext(): void;
    };
  }
}

interface EnemyVisualRuntime {
  actor: EnemyCharacter;
  animator: EnemyAnimator;
  deathAge: number | null;
  phase: number;
  heading: number;
  lastPosition: THREE.Vector3;
  slashDirection: THREE.Vector3;
  contactSpawned: boolean;
  impactSpawned: boolean;
  separated: boolean;
  corpse: CorpseRuntime | null;
}

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Project Slash shell is missing ${selector}.`);
  return element;
}

const canvas = requiredElement<HTMLCanvasElement>("#game-canvas");
const reticle = requiredElement<HTMLDivElement>("#reticle");
const loading = requiredElement<HTMLDivElement>("#loading");
const stageLabel = requiredElement<HTMLSpanElement>("#stage-label");
const enemyLabel = requiredElement<HTMLSpanElement>("#enemy-label");
const phaseBanner = requiredElement<HTMLDivElement>("#phase-banner");
const phaseEyebrow = requiredElement<HTMLSpanElement>("#phase-eyebrow");
const phaseTitle = requiredElement<HTMLElement>("#phase-title");
const phaseSubtitle = requiredElement<HTMLElement>("#phase-subtitle");
const loadingLabel = requiredElement<HTMLParagraphElement>("#loading-label");
const loadingProgress = requiredElement<HTMLSpanElement>("#loading-progress");
const pageParameters = new URLSearchParams(window.location.search);
const compatibilityMode = pageParameters.get("quality") === "compatibility";

function setLoadingPhase(progress: number, label: string) {
  loadingProgress.style.transform = `scaleX(${THREE.MathUtils.clamp(progress, 0.05, 1)})`;
  loadingLabel.textContent = label;
}

setLoadingPhase(0.12, "INITIALIZING RENDERER");

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  powerPreference: "high-performance",
  stencil: false,
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.98;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.info.autoReset = false;
const diagnostics = createDiagnostics(renderer);
setLoadingPhase(0.3, "ESTABLISHING LIGHT GRID");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07111c);
scene.fog = new THREE.FogExp2(0x0a1622, 0.0058);

// Framing budget: keep the complete 40 x 25 m deck in view while giving the
// 3.15 m combatants enough pixels to read head, chest and legs at 1080p.
const camera = new THREE.PerspectiveCamera(28.5, 1, 0.1, 260);
const cameraBase = new THREE.Vector3(32.2, 31, 43.7);
const cameraTarget = new THREE.Vector3(-0.5, -3, -3.5);
camera.position.copy(cameraBase);
camera.lookAt(cameraTarget);

// Brightness budget: environment stays in graphite/blue-grey, enemies own
// the controlled orange-red accent, and the hero gets a local cool key. The
// blade remains the sole deliberately over-range highlight.
const hemisphere = new THREE.HemisphereLight(0xb8dbe2, 0x080d12, 0.46);
scene.add(hemisphere);

const keyLight = new THREE.DirectionalLight(0xd9f7ff, 2.25);
keyLight.position.set(-18, 34, 19);
keyLight.target.position.set(0, 0, 0);
keyLight.castShadow = true;
// 1536 preserves the broad, soft grounding shadow at the fixed gameplay
// camera while avoiding the unnecessary 4M-texel shadow pass of a 2048 map.
// This matters in the 20-enemy stress scene because every visible combatant
// participates in that pass.
keyLight.shadow.mapSize.set(compatibilityMode ? 1024 : 1536, compatibilityMode ? 1024 : 1536);
keyLight.shadow.camera.left = -26;
keyLight.shadow.camera.right = 26;
keyLight.shadow.camera.top = 21;
keyLight.shadow.camera.bottom = -21;
keyLight.shadow.camera.near = 3;
keyLight.shadow.camera.far = 90;
keyLight.shadow.bias = -0.00035;
keyLight.shadow.normalBias = 0.045;
scene.add(keyLight, keyLight.target);

const coldRim = new THREE.SpotLight(0x62dfff, 610, 90, Math.PI * 0.23, 0.86, 1.7);
coldRim.position.set(20, 20, -24);
coldRim.target.position.set(-2, 0, 1);
scene.add(coldRim, coldRim.target);

const cityFill = new THREE.DirectionalLight(0x5a86a0, 1.08);
cityFill.position.set(5, 38, -86);
cityFill.target.position.set(0, 2, -52);
scene.add(cityFill, cityFill.target);

const arenaFill = new THREE.PointLight(0xa8d8df, 82, 58, 1.8);
arenaFill.position.set(0, 13, 5);
scene.add(arenaFill);

const hostileRim = new THREE.PointLight(0xff3b1c, 58, 28, 2.2);
hostileRim.position.set(-17, 4.5, -7);
scene.add(hostileRim);

// A restrained moving suit light keeps the real hero readable against the
// blue-black deck without turning every afterimage into an equally strong cue.
const heroAnchorLight = new THREE.PointLight(0xb9f7ff, 2.2, 5.5, 2.2);
heroAnchorLight.position.set(0, 1.85, 0);
scene.add(heroAnchorLight);

// This is intentionally a tight, no-shadow key rather than a global exposure
// increase: it exposes the hero's graphite head/chest/legs without bleaching
// the arena or making the already-bright sword look like the whole character.
const heroKeyTarget = new THREE.Object3D();
const heroKeyLight = new THREE.SpotLight(0xbfd9e6, 380, 10, Math.PI * 0.105, 0.82, 2);
heroKeyLight.castShadow = false;
heroKeyLight.position.set(2.8, 5.2, 3.8);
heroKeyTarget.position.set(0, 1.45, 0);
heroKeyLight.target = heroKeyTarget;
scene.add(heroKeyLight, heroKeyTarget);

const environment = createEnvironment(scene);
const postFx = createPostFx(
  renderer,
  scene,
  camera,
  compatibilityMode ? { bloomStrength: 0.28, bloomRadius: 0.25 } : undefined,
);
const vfx = createVfxRuntime(scene);
const audio = createAudioRuntime();
setLoadingPhase(0.62, "ASSEMBLING COMBAT SPACE");
const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();
const pointerWorld = new THREE.Vector3();
const cameraImpulse = new THREE.Vector3();

const previewGeometry = new THREE.BufferGeometry();
previewGeometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0.06, 0, 0, 0.06, 0], 3));
const previewLine = new THREE.Line(
  previewGeometry,
  new THREE.LineBasicMaterial({ color: 0x7199a0, transparent: true, opacity: 0.075, depthWrite: false }),
);
previewLine.visible = false;
previewLine.renderOrder = 4;
scene.add(previewLine);

const playerActor = createHeroCharacter();
const playerAnimator = createHeroAnimator(playerActor.rig);
scene.add(playerActor.root);
// Twenty articulated enemies would otherwise render every body piece again in
// the directional shadow pass. A single instanced, soft contact layer gives the
// overhead camera a clearer grounding cue at a fraction of the draw cost while
// the hero and architecture retain authored real-time shadows.
const enemyContactShadowSize = 48;
const enemyContactShadowPixels = new Uint8Array(enemyContactShadowSize * enemyContactShadowSize * 4);
for (let y = 0; y < enemyContactShadowSize; y += 1) {
  for (let x = 0; x < enemyContactShadowSize; x += 1) {
    const nx = ((x + 0.5) / enemyContactShadowSize) * 2 - 1;
    const ny = ((y + 0.5) / enemyContactShadowSize) * 2 - 1;
    const radial = Math.max(0, 1 - Math.hypot(nx, ny));
    const alpha = Math.round(255 * radial * radial * (3 - 2 * radial));
    const offset = (y * enemyContactShadowSize + x) * 4;
    enemyContactShadowPixels[offset] = 255;
    enemyContactShadowPixels[offset + 1] = 255;
    enemyContactShadowPixels[offset + 2] = 255;
    enemyContactShadowPixels[offset + 3] = alpha;
  }
}
const enemyContactShadowTexture = new THREE.DataTexture(
  enemyContactShadowPixels,
  enemyContactShadowSize,
  enemyContactShadowSize,
  THREE.RGBAFormat,
);
enemyContactShadowTexture.colorSpace = THREE.NoColorSpace;
enemyContactShadowTexture.minFilter = THREE.LinearFilter;
enemyContactShadowTexture.magFilter = THREE.LinearFilter;
enemyContactShadowTexture.needsUpdate = true;
const enemyContactShadowGeometry = new THREE.CircleGeometry(1, 18);
enemyContactShadowGeometry.rotateX(-Math.PI / 2);
const enemyContactShadowMaterial = new THREE.MeshBasicMaterial({
  color: 0x010305,
  map: enemyContactShadowTexture,
  transparent: true,
  opacity: 0.48,
  depthWrite: false,
  toneMapped: true,
  polygonOffset: true,
  polygonOffsetFactor: -1,
  polygonOffsetUnits: -1,
});
const enemyContactShadows = new THREE.InstancedMesh(
  enemyContactShadowGeometry,
  enemyContactShadowMaterial,
  20,
);
enemyContactShadows.name = "enemy-instanced-contact-shadows";
enemyContactShadows.count = 0;
enemyContactShadows.castShadow = false;
enemyContactShadows.receiveShadow = false;
enemyContactShadows.frustumCulled = false;
enemyContactShadows.renderOrder = 1;
scene.add(enemyContactShadows);
const enemyContactShadowTransform = new THREE.Object3D();
const enemyVisuals = new Map<string, EnemyVisualRuntime>();
const frozenEnemySpeeds: number[] = [];
let renderedStageIndex = -1;
let renderedStageName = "";
let renderedAliveCount = -1;
let renderedBannerVisible: boolean | null = null;
let renderedBannerTone = "";
let renderedBannerEyebrow = "";
let renderedBannerTitle = "";
let renderedBannerSubtitle = "";
let gameState: GameState = createGame(0);
let lastTime = performance.now();
let worldTime = 0;
let phaseAge = 0;
let stageIntroAge = 0;
let simulationEnabled = true;
let graphicsContextState: "ready" | "lost" | "restoring" = "ready";
let hoverValid = false;
let pointerSeen = false;
let previewSuppressedUntil = 0;
let playerHeading = Math.PI;
let pendingDashInputId: number | null = null;
const deterministicCapture = pageParameters.get("deterministic") === "1";
const validationMode = pageParameters.get("validation") === "1";

const tuning = {
  exposure: 0.98,
  bloom: 0.34,
  cameraFov: 28.5,
  enemyMotion: true,
  dashPreview: true,
};
let gui: GUI | null = null;
if (validationMode || import.meta.env.DEV) {
  const { default: GuiConstructor } = await import("lil-gui");
  gui = new GuiConstructor({ title: "PROJECT SLASH / TUNING" });
}
if (gui) {
  gui.add(tuning, "exposure", 0.5, 1.4, 0.01).onChange((value: number) => { renderer.toneMappingExposure = value; });
  gui.add(tuning, "bloom", 0, 1.8, 0.01).onChange((value: number) => { postFx.bloom.strength = value; });
  gui.add(tuning, "cameraFov", 26, 38, 0.1).onChange((value: number) => { camera.fov = value; camera.updateProjectionMatrix(); });
  gui.add(tuning, "enemyMotion");
  gui.add(tuning, "dashPreview");
  gui.hide();
}
let audioEnabled = true;
setLoadingPhase(0.78, "LINKING COMBATANTS");

function rebuildEnemyVisuals() {
  for (const visual of enemyVisuals.values()) {
    scene.remove(visual.actor.root);
    visual.corpse?.dispose();
  }
  enemyVisuals.clear();
  gameState.enemies.forEach((enemy, index) => {
    const actor = createEnemyCharacter(index);
    actor.root.position.set(enemy.position.x, 0, enemy.position.z);
    const heading = (index * 2.399) % (Math.PI * 2);
    actor.root.rotation.y = heading;
    actor.cutSeam.setVisible(false);
    actor.cutSeam.setHeat(0);
    scene.add(actor.root);
    enemyVisuals.set(enemy.id, {
      actor,
      animator: createEnemyAnimator(actor.rig, index * 0.77),
      deathAge: null,
      phase: index * 0.77,
      heading,
      lastPosition: new THREE.Vector3(enemy.position.x, 0, enemy.position.z),
      slashDirection: new THREE.Vector3(1, 0, 0),
      contactSpawned: false,
      impactSpawned: false,
      separated: false,
      corpse: null,
    });
  });
}

function resetVisualStage() {
  vfx.clearStage();
  rebuildEnemyVisuals();
  playerAnimator.reset();
  playerActor.root.visible = true;
  playerActor.root.position.set(gameState.player.position.x, 0, gameState.player.position.z);
  playerHeading = Math.atan2(gameState.player.facing.x, gameState.player.facing.z);
  playerActor.root.rotation.set(0, playerHeading, 0);
  phaseAge = 0;
  stageIntroAge = 0;
  updateHud();
}

function enemyKillPositions(from: { x: number; z: number }, to: { x: number; z: number }) {
  return gameState.enemies
    .filter((enemy) => enemy.alive && segmentIntersectsCircle(from, to, enemy.position, DASH_HIT_RADIUS + enemy.radius))
    .map((enemy) => new THREE.Vector3(enemy.position.x, 0, enemy.position.z));
}

function triggerDashVisual(event: Extract<GameEvent, { type: "dash-started" }>) {
  const start = new THREE.Vector3(event.from.x, 0, event.from.z);
  const end = new THREE.Vector3(event.to.x, 0, event.to.z);
  const direction = end.clone().sub(start).setY(0).normalize();
  const kills = enemyKillPositions(event.from, event.to);
  environment.reactToDash(start, end, Math.min(1.6, 1 + kills.length * 0.08));
  playerHeading = Math.atan2(direction.x, direction.z);
  playerActor.root.rotation.y = playerHeading;
  playerAnimator.update({
    time: worldTime,
    dt: 1 / 30,
    turn: 0,
    // Commit the authored low transit pose before baking the afterimages.  The
    // gameplay dash still starts immediately; this is visual anticipation only.
    dashProgress: 0.43,
    recoveryProgress: null,
    deathProgress: null,
  });
  if (pendingDashInputId !== null) {
    diagnostics.markDashLogic(pendingDashInputId);
    pendingDashInputId = null;
  }
  vfx.spawnSlash({ start, end, killPositions: kills, actor: playerActor.root });
  audio.playDash(kills.length);
  postFx.impact = Math.min(0.62, 0.15 + kills.length * 0.055);
  heroAnchorLight.intensity = Math.min(34, 18 + kills.length * 2.6);
  cameraImpulse.add(new THREE.Vector3(direction.x * 0.16, 0.065 + kills.length * 0.009, direction.z * 0.13));
  previewSuppressedUntil = worldTime + 0.42;
  reticle.classList.add("active");
  window.setTimeout(() => reticle.classList.remove("active"), 100);
}

function consumeEvents(events: readonly GameEvent[]) {
  for (const event of events) {
    if (event.type === "dash-started") {
      triggerDashVisual(event);
      continue;
    }
    if (event.type === "enemy-killed") {
      const visual = enemyVisuals.get(event.enemyId);
      if (visual && visual.deathAge === null) {
        visual.deathAge = 0;
        visual.slashDirection.set(gameState.player.facing.x, 0, gameState.player.facing.z).normalize();
        visual.contactSpawned = false;
        visual.impactSpawned = false;
        visual.separated = false;
        visual.actor.cutSeam.setVisible(false);
        visual.actor.cutSeam.setHeat(0);
      }
      continue;
    }
    if (event.type === "player-died") {
      phaseAge = 0;
      postFx.impact = 1;
      hostileRim.intensity = 180;
      audio.playDeath();
      continue;
    }
    if (event.type === "stage-cleared" || event.type === "game-complete") phaseAge = 0;
  }
}

function updateHud() {
  // The simulation resolves hits immediately, but the HUD waits for the visual
  // cut to open so the counter never announces a kill before the player sees it.
  let alive = 0;
  if (enemyVisuals.size > 0) {
    for (const visual of enemyVisuals.values()) {
      if (visual.deathAge === null || visual.deathAge < 0.12) alive += 1;
    }
  } else {
    for (const enemy of gameState.enemies) {
      if (enemy.alive) alive += 1;
    }
  }
  if (renderedStageIndex !== gameState.stageIndex || renderedStageName !== gameState.stageName) {
    stageLabel.textContent = `STAGE ${String(gameState.stageIndex + 1).padStart(2, "0")} / ${gameState.stageName}`;
    renderedStageIndex = gameState.stageIndex;
    renderedStageName = gameState.stageName;
  }
  if (renderedAliveCount !== alive) {
    enemyLabel.textContent = `${String(alive).padStart(2, "0")} HOSTILES`;
    renderedAliveCount = alive;
  }
}

function updatePhaseBanner() {
  let visible = false;
  let tone = "clear";
  let eyebrow = `STAGE ${String(gameState.stageIndex + 1).padStart(2, "0")}`;
  let title = gameState.stageName;
  let subtitle = `ELIMINATE ${String(gameState.totalEnemies).padStart(2, "0")} HOSTILES`;

  if (gameState.phase === "playing") {
    visible = stageIntroAge < 0.86;
  } else if (gameState.phase === "dead") {
    visible = true;
    tone = "danger";
    eyebrow = "COMBAT LINK";
    title = "SIGNAL LOST";
    subtitle = `REBOOTING // ATTEMPT ${String(gameState.attempt + 1).padStart(2, "0")}`;
  } else if (gameState.phase === "stage-cleared") {
    visible = true;
    eyebrow = `STAGE ${String(gameState.stageIndex + 1).padStart(2, "0")}`;
    title = "SECTOR CLEARED";
    subtitle = "NEXT STAGE INBOUND";
  } else {
    visible = true;
    eyebrow = "COMBAT SEQUENCE";
    title = "SEQUENCE COMPLETE";
    subtitle = "ALL HOSTILES ELIMINATED";
  }

  if (renderedBannerTone !== tone) {
    phaseBanner.dataset.tone = tone;
    renderedBannerTone = tone;
  }
  if (renderedBannerVisible !== visible) {
    phaseBanner.classList.toggle("visible", visible);
    renderedBannerVisible = visible;
  }
  if (renderedBannerEyebrow !== eyebrow) {
    phaseEyebrow.textContent = eyebrow;
    renderedBannerEyebrow = eyebrow;
  }
  if (renderedBannerTitle !== title) {
    phaseTitle.textContent = title;
    renderedBannerTitle = title;
  }
  if (renderedBannerSubtitle !== subtitle) {
    phaseSubtitle.textContent = subtitle;
    renderedBannerSubtitle = subtitle;
  }
}

function updatePreview() {
  previewLine.visible = pointerSeen && hoverValid && tuning.dashPreview && gameState.phase === "playing" && worldTime >= previewSuppressedUntil;
  if (!previewLine.visible) return;
  const positions = previewGeometry.getAttribute("position") as THREE.BufferAttribute;
  positions.setXYZ(0, gameState.player.position.x, 0.08, gameState.player.position.z);
  positions.setXYZ(1, pointerWorld.x, 0.08, pointerWorld.z);
  positions.needsUpdate = true;
  previewGeometry.computeBoundingSphere();
}

function updatePointer(clientX: number, clientY: number) {
  pointerSeen = true;
  reticle.style.left = `${clientX}px`;
  reticle.style.top = `${clientY}px`;
  const rect = canvas.getBoundingClientRect();
  pointerNdc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(pointerNdc, camera);
  const hit = raycaster.intersectObject(environment.arenaHitSurface, false)[0];
  hoverValid = Boolean(hit);
  reticle.classList.toggle("invalid", !hoverValid);
  if (hit) pointerWorld.copy(hit.point);
  updatePreview();
}

function requestDashAtPointer() {
  if (!hoverValid || gameState.phase !== "playing") return;
  const inputId = diagnostics.markInput();
  const result = queueDash(gameState, { x: pointerWorld.x, z: pointerWorld.z });
  if (result !== "ignored") pendingDashInputId = inputId;
  if (result === "started") {
    consumeEvents(gameState.lastEvents);
    gameState.lastEvents = [];
  }
}

function updateEnemyVisual(enemy: EnemyState, visual: EnemyVisualRuntime, dt: number) {
  const root = visual.actor.root;
  if (visual.deathAge !== null) {
    visual.deathAge += dt;
    const t = visual.deathAge;
    const heatIn = THREE.MathUtils.smoothstep(t, 0.006, 0.042);
    const heatOut = 1 - THREE.MathUtils.smoothstep(t, 0.24, 0.72);
    const instantHeat = 1 - THREE.MathUtils.smoothstep(t, 0.028, 0.075);
    visual.actor.cutSeam.setVisible(t >= 0.006);
    visual.actor.cutSeam.setHeat(Math.max(instantHeat * 0.92, heatIn * heatOut));

    if (!visual.separated) {
      visual.animator.update({
        time: worldTime,
        dt,
        distanceMoved: 0,
        speedNormalized: 0,
        turn: 0,
        threat: 0,
        deathAge: t,
      });
    }

    if (!visual.contactSpawned && t >= 0.012) {
      vfx.spawnCutContact({
        position: new THREE.Vector3(root.position.x, 0, root.position.z),
        direction: visual.slashDirection,
        intensity: 0.82,
      });
      visual.contactSpawned = true;
    }

    if (!visual.impactSpawned && t >= 0.052) {
      vfx.spawnKillImpact({
        position: new THREE.Vector3(root.position.x, 0, root.position.z),
        direction: visual.slashDirection,
        intensity: 1.05,
      });
      visual.impactSpawned = true;
    }

    if (!visual.separated && t >= 0.12) {
      visual.corpse = createCorpseRuntime(
        scene,
        root,
        visual.actor.deathModules,
        visual.slashDirection,
        visual.phase * 101 + gameState.stageIndex * 17,
      );
      visual.separated = true;
    }
    visual.corpse?.update(dt);
    return;
  }
  root.visible = enemy.alive;
  if (!enemy.alive) return;

  const distanceMoved = Math.hypot(
    enemy.position.x - visual.lastPosition.x,
    enemy.position.z - visual.lastPosition.z,
  );
  visual.lastPosition.set(enemy.position.x, 0, enemy.position.z);
  root.position.x = THREE.MathUtils.damp(root.position.x, enemy.position.x, 18, dt);
  root.position.z = THREE.MathUtils.damp(root.position.z, enemy.position.z, 18, dt);
  root.position.y = 0;

  const toPlayerX = gameState.player.position.x - enemy.position.x;
  const toPlayerZ = gameState.player.position.z - enemy.position.z;
  const targetHeading = Math.atan2(toPlayerX, toPlayerZ);
  const turnDelta = signedAngleDelta(visual.heading, targetHeading);
  visual.heading = dampAngle(visual.heading, targetHeading, 11, dt);
  root.rotation.y = visual.heading;
  const distanceToPlayer = Math.hypot(toPlayerX, toPlayerZ);
  const speedNormalized = THREE.MathUtils.clamp(distanceMoved / Math.max(0.0001, enemy.speed * dt), 0, 1);
  const threat = 1 - THREE.MathUtils.smoothstep(distanceToPlayer, 1.2, 3.1);
  visual.animator.update({
    time: worldTime,
    dt,
    distanceMoved,
    speedNormalized,
    turn: THREE.MathUtils.clamp(turnDelta / 0.72, -1, 1),
    threat,
    deathAge: null,
  });
}

function updateEnemyContactShadows() {
  let instanceIndex = 0;
  for (const enemy of gameState.enemies) {
    if (!enemy.alive || instanceIndex >= enemyContactShadows.instanceMatrix.count) continue;
    const visual = enemyVisuals.get(enemy.id);
    if (!visual) continue;
    enemyContactShadowTransform.position.set(visual.actor.root.position.x, 0.012, visual.actor.root.position.z);
    enemyContactShadowTransform.rotation.set(0, visual.heading, 0);
    enemyContactShadowTransform.scale.set(0.86, 1, 0.5);
    enemyContactShadowTransform.updateMatrix();
    enemyContactShadows.setMatrixAt(instanceIndex, enemyContactShadowTransform.matrix);
    instanceIndex += 1;
  }
  enemyContactShadows.count = instanceIndex;
  enemyContactShadows.instanceMatrix.needsUpdate = true;
}

function updateSimulation(dt: number) {
  worldTime += dt;
  stageIntroAge += dt;
  environment.update(worldTime, dt);
  postFx.update(worldTime, dt);
  hostileRim.intensity = THREE.MathUtils.damp(hostileRim.intensity, 52, 5, dt);
  heroAnchorLight.intensity = THREE.MathUtils.damp(heroAnchorLight.intensity, 2.6, 11, dt);

  if (simulationEnabled && gameState.phase === "playing") {
    if (tuning.enemyMotion) {
      advanceGame(gameState, dt * 1000);
    } else {
      // Validation/tuning may freeze enemy locomotion, but the real player
      // timeline, collision and recovery must continue at full speed.
      frozenEnemySpeeds.length = gameState.enemies.length;
      gameState.enemies.forEach((enemy, index) => {
        frozenEnemySpeeds[index] = enemy.speed;
        enemy.speed = 0;
      });
      advanceGame(gameState, dt * 1000);
      gameState.enemies.forEach((enemy, index) => { enemy.speed = frozenEnemySpeeds[index] ?? 0; });
    }
    consumeEvents(gameState.lastEvents);
    gameState.lastEvents.length = 0;
  } else if (!simulationEnabled) {
    phaseAge += dt;
    if (phaseAge > 0.82) simulationEnabled = true;
  }

  const player = gameState.player;
  if (player.dash) {
    // During a 35–110 ms transit the rendered actor must match the swept
    // gameplay position exactly.  Damping here made the body lag behind its hit
    // capsule and compressed all three afterimages into the start of the route.
    playerActor.root.position.x = player.position.x;
    playerActor.root.position.z = player.position.z;
  } else {
    playerActor.root.position.x = THREE.MathUtils.damp(playerActor.root.position.x, player.position.x, 22, dt);
    playerActor.root.position.z = THREE.MathUtils.damp(playerActor.root.position.z, player.position.z, 22, dt);
  }
  playerActor.root.position.y = 0;
  heroAnchorLight.position.set(playerActor.root.position.x, 1.85, playerActor.root.position.z);
  heroKeyLight.position.set(
    playerActor.root.position.x + 2.8,
    5.2,
    playerActor.root.position.z + 3.8,
  );
  heroKeyTarget.position.set(playerActor.root.position.x, 1.45, playerActor.root.position.z);
  const targetPlayerHeading = Math.atan2(player.facing.x, player.facing.z);
  const playerTurnDelta = signedAngleDelta(playerHeading, targetPlayerHeading);
  playerHeading = dampAngle(playerHeading, targetPlayerHeading, player.dash ? 72 : 19, dt);
  playerActor.root.rotation.y = playerHeading;
  const dashProgress = player.dash
    ? THREE.MathUtils.clamp(player.dash.elapsedMs / player.dash.durationMs, 0, 1)
    : null;
  const recoveryProgress = !player.dash && player.recoveryRemainingMs > 0
    ? 1 - THREE.MathUtils.clamp(player.recoveryRemainingMs / gameState.rules.recoveryMs, 0, 1)
    : null;
  playerAnimator.update({
    time: worldTime,
    dt,
    turn: THREE.MathUtils.clamp(playerTurnDelta / 0.65, -1, 1),
    dashProgress,
    recoveryProgress,
    deathProgress: gameState.phase === "dead" ? THREE.MathUtils.clamp(phaseAge / 0.78, 0, 1) : null,
  });

  for (const enemy of gameState.enemies) {
    const visual = enemyVisuals.get(enemy.id);
    if (visual) updateEnemyVisual(enemy, visual, dt);
  }
  updateEnemyContactShadows();

  // Actor-following sword wakes and afterimages must sample the pose after the
  // gameplay actor has moved this frame.  Updating them earlier creates a
  // one-frame overlap that turns the first trail image into a bright clump.
  vfx.update(dt);

  if (gameState.phase !== "playing") {
    phaseAge += dt;
    if (gameState.phase === "dead" && phaseAge > 0.78) {
      restartStage(gameState);
      resetVisualStage();
      simulationEnabled = true;
    } else if (gameState.phase === "stage-cleared" && phaseAge > 1.05) {
      advanceStage(gameState);
      resetVisualStage();
      simulationEnabled = true;
    } else if (gameState.phase === "game-complete" && phaseAge > 1.8) {
      gameState = createGame(0);
      resetVisualStage();
      simulationEnabled = true;
    }
  }

  cameraImpulse.multiplyScalar(Math.exp(-dt * 8.5));
  camera.position.copy(cameraBase).add(cameraImpulse);
  camera.position.y += Math.sin(worldTime * 0.21) * 0.07;
  camera.lookAt(cameraTarget);
  updatePreview();
  updateHud();
  updatePhaseBanner();
}

function renderScene() {
  renderer.info.reset();
  postFx.composer.render();
  diagnostics.markPresented();
}

function resize() {
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);
  const mobile = Math.min(width, height) < 700;
  const pixelRatio = Math.min(
    window.devicePixelRatio,
    compatibilityMode ? (mobile ? 0.85 : 1) : (mobile ? 1.15 : 1.65),
  );
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  postFx.resize(width, height, pixelRatio);
}

function animate(now: number) {
  if (graphicsContextState !== "ready") {
    // Do not feed a long lost-context gap into simulation or diagnostics. The
    // renderer restores its GPU resources internally; we resume from a fresh
    // wall-clock baseline when the browser emits webglcontextrestored.
    lastTime = now;
    requestAnimationFrame(animate);
    return;
  }
  const rawDt = Math.max(0.001, (now - lastTime) / 1000);
  const dt = Math.min(0.05, rawDt);
  lastTime = now;
  diagnostics.recordFrame(rawDt * 1000);
  updateSimulation(dt);
  renderScene();
  requestAnimationFrame(animate);
}

canvas.addEventListener("pointermove", (event) => updatePointer(event.clientX, event.clientY));
canvas.addEventListener("pointerdown", (event) => {
  // Some Firefox/WebKit configurations keep AudioContext.resume() pending even
  // after a trusted pointer event.  Combat input must never wait on audio
  // policy; unlock sound in parallel and keep the click deterministic.
  void audio.resume().catch(() => {
    // Audio is optional for input continuity. A later gesture may retry.
  });
  if (gameState.phase === "dead") {
    restartStage(gameState);
    resetVisualStage();
    simulationEnabled = true;
    pendingDashInputId = null;
    return;
  }
  updatePointer(event.clientX, event.clientY);
  requestDashAtPointer();
});
canvas.addEventListener("pointerleave", () => {
  pointerSeen = false;
  previewLine.visible = false;
});
canvas.addEventListener("webglcontextlost", (event) => {
  event.preventDefault();
  graphicsContextState = "lost";
  simulationEnabled = false;
  loading.classList.remove("ready");
  setLoadingPhase(0.45, "RESTORING GRAPHICS CONTEXT");
});
canvas.addEventListener("webglcontextrestored", () => {
  graphicsContextState = "restoring";
  lastTime = performance.now();
  resize();
  renderScene();
  graphicsContextState = "ready";
  simulationEnabled = gameState.phase === "playing";
  setLoadingPhase(1, "COMBAT SPACE RESTORED");
  requestAnimationFrame(() => loading.classList.add("ready"));
});

window.addEventListener("keydown", async (event) => {
  if (event.key.toLowerCase() === "f") {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      // Browsers may reject Fullscreen when policy or embedding disallows it;
      // gameplay input and rendering must continue without an unhandled error.
    } finally {
      resize();
    }
  }
  if (event.key === "`" && gui) gui.show(gui._hidden);
  if (event.key.toLowerCase() === "m") {
    audioEnabled = !audioEnabled;
    audio.setEnabled(audioEnabled);
  }
  if (event.key.toLowerCase() === "r") {
    restartStage(gameState);
    resetVisualStage();
  }
});

window.addEventListener("resize", resize);
document.addEventListener("fullscreenchange", resize);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) lastTime = performance.now();
});

window.render_game_to_text = () => JSON.stringify({
  coordinateSystem: "World ground plane. Origin at arena center; +x is screen-right-ish, +z is toward the near camera edge.",
  qualityMode: compatibilityMode ? "compatibility" : "high",
  graphicsContextState,
  ...getGameSnapshot(gameState),
  diagnostics: diagnostics.snapshot(),
});

window.get_slash_diagnostics = () => diagnostics.snapshot();
window.reset_slash_diagnostics = () => diagnostics.reset();

if (validationMode) {
  window.slash_validation = {
    setStage(stageIndex) {
      const safeIndex = THREE.MathUtils.clamp(Math.round(stageIndex), 0, 2);
      gameState = createGame(safeIndex);
      resetVisualStage();
      simulationEnabled = true;
    },
    setStressScenario(enemyCount = 20) {
      gameState = createStressGame(enemyCount, gameState.rules);
      resetVisualStage();
      simulationEnabled = true;
      tuning.enemyMotion = false;
    },
    dashTo(x, z) {
      if (gameState.phase !== "playing") return "ignored";
      const inputId = diagnostics.markInput();
      const result = queueDash(gameState, { x, z });
      if (result !== "ignored") pendingDashInputId = inputId;
      if (result === "started") {
        consumeEvents(gameState.lastEvents);
        gameState.lastEvents = [];
      }
      return result;
    },
    setEnemyMotion(enabled) {
      tuning.enemyMotion = Boolean(enabled);
    },
    loseGraphicsContext() {
      renderer.forceContextLoss();
    },
    restoreGraphicsContext() {
      graphicsContextState = "restoring";
      renderer.forceContextRestore();
    },
  };
}

window.advanceTime = (milliseconds: number) => {
  const steps = Math.max(1, Math.round(Math.max(0, milliseconds) / (1000 / 60)));
  for (let i = 0; i < steps; i += 1) updateSimulation(1 / 60);
  renderScene();
};

resetVisualStage();
resize();
renderScene();
setLoadingPhase(0.96, "FINALIZING FIRST FRAME");
requestAnimationFrame(() => {
  setLoadingPhase(1, "COMBAT SPACE READY");
  requestAnimationFrame(() => loading.classList.add("ready"));
});
if (!deterministicCapture) requestAnimationFrame(animate);
