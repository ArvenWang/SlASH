import * as THREE from "three";
import {
  dampAngle,
  signedAngleDelta,
} from "../characters/animation";
import type { Vec2 } from "../core/math/vec2";
import type {
  EnemyState,
  GameEvent,
  GameState,
  HazardState,
  ObstacleState,
  ProjectileState,
} from "../game/domain/types";
import { enemyDefinitions } from "../content/enemies/definitions";
import {
  hazardDefinitions,
  obstacleDefinitions,
} from "../content/entities/definitions";
import { armorProfileDefinitions } from "../content/enemies/armor-definitions";
import {
  PLAYER_CHARACTER_PRESENTATION_ID,
  abilityPresentationRegistry,
  cameraProfileRegistry,
  characterPresentationRegistry,
  enemyPresentationRegistry,
} from "../presentation/registry";
import type { CharacterProviderRegistry } from "../presentation/characters/provider-registry";
import type {
  CharacterRuntime,
  CorpsePresentationRuntime,
} from "../presentation/characters/types";
import type { RuntimeTuning } from "./debug-runtime";
import type { RendererRuntime } from "./renderer-runtime";
import {
  CURVE_DRAG_MIN_DISTANCE,
  curveDashPathPoints,
} from "../game/abilities/dash-slash";
import { STORED_PATH_DURATION_MS } from "../game/abilities/path-passives";

const EPSILON_PRESENTATION = 1e-6;

interface EnemyVisualRuntime {
  actor: CharacterRuntime;
  deathAge: number | null;
  phase: number;
  heading: number;
  lastPosition: THREE.Vector3;
  slashDirection: THREE.Vector3;
  contactSpawned: boolean;
  impactSpawned: boolean;
  separated: boolean;
  corpseAttempted: boolean;
  corpse: CorpsePresentationRuntime | null;
  armorRoot: THREE.Group;
  armorMeshes: Map<string, THREE.Mesh>;
}

interface SimpleEntityVisualRuntime {
  readonly root: THREE.Object3D;
  readonly ownedMaterial: THREE.Material | null;
}

export interface PresentationShell {
  readonly canvas: HTMLCanvasElement;
  readonly reticle: HTMLDivElement;
  readonly stageLabel: HTMLSpanElement;
  readonly enemyLabel: HTMLSpanElement;
  readonly chargeLabel: HTMLSpanElement;
  readonly chargeFill: HTMLElement;
  readonly energyLabel: HTMLSpanElement;
  readonly vectorLabel: HTMLSpanElement;
  readonly phaseBanner: HTMLDivElement;
  readonly phaseEyebrow: HTMLSpanElement;
  readonly phaseTitle: HTMLElement;
  readonly phaseSubtitle: HTMLElement;
}

export type PresentationLifecycleAction = "restart-stage" | "advance-stage" | "reset-run";

export interface PresentationRuntime {
  resetStage(): void;
  consumeEvents(events: readonly GameEvent[]): void;
  update(dt: number): PresentationLifecycleAction | null;
  updatePointer(clientX: number, clientY: number): void;
  clearPointer(): void;
  getPrimaryTarget(): Vec2 | null;
  markPendingAbilityInput(inputId: number): void;
  snapshot(): {
    playerAnimation: ReturnType<CharacterRuntime["animation"]["snapshot"]>;
    vfx: ReturnType<RendererRuntime["vfx"]["snapshot"]>;
    audio: ReturnType<RendererRuntime["audio"]["snapshot"]>;
    postFx: ReturnType<RendererRuntime["postFx"]["snapshot"]>;
    environment: ReturnType<RendererRuntime["environment"]["snapshot"]>;
  };
  dispose(): void;
}

export interface PresentationRuntimeOptions {
  readonly shell: PresentationShell;
  readonly rendererRuntime: RendererRuntime;
  readonly gameState: GameState;
  readonly tuning: RuntimeTuning;
  readonly characterProviders: CharacterProviderRegistry;
}

export function createPresentationRuntime(options: PresentationRuntimeOptions): PresentationRuntime {
  const { shell, rendererRuntime, gameState, tuning, characterProviders } = options;
  const {
    scene,
    camera,
    cameraBase,
    cameraTarget,
    environment,
    postFx,
    vfx,
    audio,
    diagnostics,
  } = rendererRuntime;
  const {
    hostileRim,
    heroAnchor: heroAnchorLight,
    heroKey: heroKeyLight,
    heroKeyTarget,
  } = rendererRuntime.lighting;

  const playerPresentation = characterPresentationRegistry.get(PLAYER_CHARACTER_PRESENTATION_ID);
  const playerProvider = characterProviders.get(playerPresentation.providerId);
  if (!playerProvider.ready) throw new Error(`${playerProvider.id} is not prepared.`);

  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();
  const pointerWorld = new THREE.Vector3();
  const cameraImpulse = new THREE.Vector3();
  const previewGeometry = new THREE.BufferGeometry();
  previewGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(new Float32Array(17 * 3), 3),
  );
  previewGeometry.setDrawRange(0, 2);
  const previewMaterial = new THREE.LineBasicMaterial({
    color: 0x7199a0,
    transparent: true,
    opacity: 0.075,
    depthWrite: false,
  });
  const previewLine = new THREE.Line(previewGeometry, previewMaterial);
  previewLine.visible = false;
  previewLine.renderOrder = 4;
  scene.add(previewLine);

  const storedPathGeometry = new THREE.BufferGeometry();
  storedPathGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(new Float32Array(18 * 3), 3),
  );
  storedPathGeometry.setDrawRange(0, 0);
  const storedPathMaterial = new THREE.LineBasicMaterial({
    color: 0xff8e6f,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  });
  const storedPathLine = new THREE.Line(storedPathGeometry, storedPathMaterial);
  storedPathLine.visible = false;
  storedPathLine.renderOrder = 4;
  scene.add(storedPathLine);

  const ultimatePlanGeometry = new THREE.BufferGeometry();
  ultimatePlanGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(new Float32Array(6 * 3), 3),
  );
  ultimatePlanGeometry.setDrawRange(0, 0);
  const ultimatePlanMaterial = new THREE.LineBasicMaterial({
    color: 0xe6ffff,
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
  });
  const ultimatePlanLine = new THREE.Line(ultimatePlanGeometry, ultimatePlanMaterial);
  ultimatePlanLine.visible = false;
  ultimatePlanLine.renderOrder = 5;
  scene.add(ultimatePlanLine);

  const playerActor = playerProvider.create({ role: "hero" });
  scene.add(playerActor.root);
  vfx.setDensity(tuning.vfxDensity);
  environment.setRainDensity(tuning.rainDensity);
  environment.setFogDensity(tuning.fogDensity);

  const enemyContactShadowSize = 48;
  const enemyContactShadowPixels = new Uint8Array(enemyContactShadowSize ** 2 * 4);
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
  const armorPlateGeometry = new THREE.BoxGeometry(1.14, 0.82, 0.2);
  const armorPlateMaterial = new THREE.MeshStandardMaterial({
    color: 0xd7eef0,
    emissive: 0x6f9da4,
    emissiveIntensity: 1.8,
    metalness: 0.86,
    roughness: 0.24,
  });
  const projectileGeometry = new THREE.SphereGeometry(1, 10, 8);
  const hostileProjectileMaterial = new THREE.MeshBasicMaterial({ color: 0xff4c39, toneMapped: false });
  const returnedProjectileMaterial = new THREE.MeshBasicMaterial({ color: 0xc7ffff, toneMapped: false });
  const obstacleBoxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const obstacleCylinderGeometry = new THREE.CylinderGeometry(1, 1, 1.8, 20);
  const obstacleActiveMaterial = new THREE.MeshStandardMaterial({
    color: 0x344d52,
    emissive: 0x376e78,
    emissiveIntensity: 0.65,
    metalness: 0.88,
    roughness: 0.3,
  });
  const obstacleTelegraphMaterial = new THREE.MeshBasicMaterial({
    color: 0x68a1a8,
    wireframe: true,
    transparent: true,
    opacity: 0.46,
  });
  const hazardRingGeometry = new THREE.RingGeometry(0.72, 1, 40);
  hazardRingGeometry.rotateX(-Math.PI / 2);
  const hazardPlaneGeometry = new THREE.PlaneGeometry(2, 2);
  hazardPlaneGeometry.rotateX(-Math.PI / 2);
  const enemyVisuals = new Map<string, EnemyVisualRuntime>();
  const projectileVisuals = new Map<string, SimpleEntityVisualRuntime>();
  const obstacleVisuals = new Map<string, SimpleEntityVisualRuntime>();
  const hazardVisuals = new Map<string, SimpleEntityVisualRuntime>();
  let renderedStageIndex = -1;
  let renderedStageName = "";
  let renderedAliveCount = -1;
  let renderedChargeProgress = -1;
  let renderedChargeLabel = "";
  let renderedEnergy = -1;
  let renderedVectorLabel = "";
  let renderedBannerVisible: boolean | null = null;
  let renderedBannerTone = "";
  let renderedBannerEyebrow = "";
  let renderedBannerTitle = "";
  let renderedBannerSubtitle = "";
  let worldTime = 0;
  let phaseAge = 0;
  let stageIntroAge = 0;
  let hoverValid = false;
  let pointerSeen = false;
  let previewSuppressedUntil = 0;
  let playerHeading = Math.PI;
  let pendingAbilityInputId: number | null = null;
  let waveWarningLabel: string | null = null;
  let waveWarningRemaining = 0;

  function createEnemyVisual(enemy: EnemyState, index: number): void {
    const enemyPresentation = enemyPresentationRegistry.get(enemy.definitionId);
    const characterPresentation = characterPresentationRegistry.get(enemyPresentation.characterId);
    const provider = characterProviders.get(characterPresentation.providerId);
    if (!provider.ready) throw new Error(`${provider.id} is not prepared.`);
    const actor = provider.create({ role: "enemy", variant: index });
    actor.root.position.set(enemy.position.x, 0, enemy.position.z);
    const heading = (index * 2.399) % (Math.PI * 2);
    actor.root.rotation.y = heading;
    actor.deathPresentation?.setCutVisible(false);
    actor.deathPresentation?.setCutHeat(0);
    const armorRoot = new THREE.Group();
    armorRoot.name = `armor-presentation/${enemy.id}`;
    const armorMeshes = createArmorMeshes(enemy, armorRoot);
    scene.add(actor.root);
    scene.add(armorRoot);
    enemyVisuals.set(enemy.id, {
      actor,
      deathAge: null,
      phase: index * 0.77,
      heading,
      lastPosition: new THREE.Vector3(enemy.position.x, 0, enemy.position.z),
      slashDirection: new THREE.Vector3(1, 0, 0),
      contactSpawned: false,
      impactSpawned: false,
      separated: false,
      corpseAttempted: false,
      corpse: null,
      armorRoot,
      armorMeshes,
    });
  }

  function createArmorMeshes(enemy: EnemyState, actorRoot: THREE.Object3D): Map<string, THREE.Mesh> {
    const meshes = new Map<string, THREE.Mesh>();
    const definition = enemyDefinitions.get(enemy.definitionId);
    if (!definition.armorProfileId) return meshes;
    const profile = armorProfileDefinitions.get(definition.armorProfileId);
    for (const part of profile.parts) {
      const mesh = new THREE.Mesh(armorPlateGeometry, armorPlateMaterial);
      mesh.name = `armor-part/${enemy.id}/${part.id}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      if (part.presentationSlot === "front") {
        mesh.position.set(0, 1.68, 0.4);
      } else if (part.presentationSlot === "rear") {
        mesh.position.set(0, 1.68, -0.4);
      } else if (part.presentationSlot === "left") {
        mesh.position.set(-0.43, 1.58, 0);
        mesh.rotation.y = Math.PI / 2;
        mesh.scale.set(0.74, 1, 1);
      } else {
        mesh.position.set(0.43, 1.58, 0);
        mesh.rotation.y = Math.PI / 2;
        mesh.scale.set(0.74, 1, 1);
      }
      actorRoot.add(mesh);
      meshes.set(part.id, mesh);
    }
    return meshes;
  }

  function rebuildEnemyVisuals(): void {
    for (const visual of enemyVisuals.values()) {
      visual.corpse?.dispose();
      visual.armorRoot.removeFromParent();
      visual.actor.dispose();
    }
    enemyVisuals.clear();
    gameState.enemies.forEach(createEnemyVisual);
  }

  function syncEnemyVisuals(): void {
    gameState.enemies.forEach((enemy, index) => {
      if (!enemyVisuals.has(enemy.id)) createEnemyVisual(enemy, index);
    });
  }

  function createProjectileVisual(projectile: ProjectileState): void {
    const mesh = new THREE.Mesh(
      projectileGeometry,
      projectile.faction === "player" ? returnedProjectileMaterial : hostileProjectileMaterial,
    );
    mesh.name = `projectile/${projectile.id}`;
    mesh.scale.setScalar(projectile.radius);
    mesh.position.set(projectile.position.x, 0.72, projectile.position.z);
    mesh.renderOrder = 6;
    scene.add(mesh);
    projectileVisuals.set(projectile.id, { root: mesh, ownedMaterial: null });
  }

  function createObstacleVisual(obstacle: ObstacleState): void {
    const definition = obstacleDefinitions.get(obstacle.definitionId);
    const shape = definition.shape;
    const geometry = shape.kind === "circle" ? obstacleCylinderGeometry : obstacleBoxGeometry;
    const mesh = new THREE.Mesh(
      geometry,
      obstacle.active ? obstacleActiveMaterial : obstacleTelegraphMaterial,
    );
    mesh.name = `obstacle/${obstacle.id}`;
    if (shape.kind === "circle") {
      mesh.scale.set(shape.radius, 1, shape.radius);
      mesh.position.y = 0.9;
    } else if (shape.kind === "obb") {
      mesh.scale.set(shape.halfExtents.x * 2, 1.8, shape.halfExtents.z * 2);
      mesh.position.y = 0.9;
      mesh.rotation.y = -(shape.rotationRadians + obstacle.rotationRadians);
    } else if (shape.kind === "aabb") {
      mesh.scale.set(shape.max.x - shape.min.x, 1.8, shape.max.z - shape.min.z);
      mesh.position.y = 0.9;
      mesh.rotation.y = -obstacle.rotationRadians;
    }
    mesh.position.x = obstacle.position.x;
    mesh.position.z = obstacle.position.z;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    obstacleVisuals.set(obstacle.id, { root: mesh, ownedMaterial: null });
  }

  function createHazardVisual(hazard: HazardState): void {
    const definition = hazardDefinitions.get(hazard.definitionId);
    const shape = definition.shape;
    const material = new THREE.MeshBasicMaterial({
      color: hazard.phase === "active" ? 0xff382e : 0xffb34d,
      transparent: true,
      opacity: hazard.phase === "active" ? 0.5 : 0.22,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(shape.kind === "circle" ? hazardRingGeometry : hazardPlaneGeometry, material);
    mesh.name = `hazard/${hazard.id}`;
    if (shape.kind === "circle") {
      mesh.scale.setScalar(shape.radius);
    } else if (shape.kind === "obb") {
      mesh.scale.set(shape.halfExtents.x, shape.halfExtents.z, 1);
      mesh.rotation.y = -(shape.rotationRadians + hazard.rotationRadians);
    } else if (shape.kind === "aabb") {
      mesh.scale.set((shape.max.x - shape.min.x) * 0.5, (shape.max.z - shape.min.z) * 0.5, 1);
      mesh.rotation.y = -hazard.rotationRadians;
    }
    mesh.position.set(hazard.position.x, 0.055, hazard.position.z);
    mesh.renderOrder = 3;
    scene.add(mesh);
    hazardVisuals.set(hazard.id, { root: mesh, ownedMaterial: material });
  }

  function removeSimpleVisual(map: Map<string, SimpleEntityVisualRuntime>, id: string): void {
    const visual = map.get(id);
    if (!visual) return;
    visual.root.removeFromParent();
    visual.ownedMaterial?.dispose();
    map.delete(id);
  }

  function clearWorldEntityVisuals(): void {
    for (const id of [...projectileVisuals.keys()]) removeSimpleVisual(projectileVisuals, id);
    for (const id of [...obstacleVisuals.keys()]) removeSimpleVisual(obstacleVisuals, id);
    for (const id of [...hazardVisuals.keys()]) removeSimpleVisual(hazardVisuals, id);
  }

  function syncWorldEntityVisuals(): void {
    const projectileIds = new Set(gameState.projectiles.map((projectile) => projectile.id));
    for (const id of [...projectileVisuals.keys()]) if (!projectileIds.has(id)) removeSimpleVisual(projectileVisuals, id);
    for (const projectile of gameState.projectiles) {
      if (!projectileVisuals.has(projectile.id)) createProjectileVisual(projectile);
      const visual = projectileVisuals.get(projectile.id);
      if (!visual) continue;
      visual.root.position.set(projectile.position.x, 0.72, projectile.position.z);
      if (visual.root instanceof THREE.Mesh) {
        visual.root.material = projectile.faction === "player" ? returnedProjectileMaterial : hostileProjectileMaterial;
      }
    }

    const obstacleIds = new Set(gameState.obstacles.map((obstacle) => obstacle.id));
    for (const id of [...obstacleVisuals.keys()]) if (!obstacleIds.has(id)) removeSimpleVisual(obstacleVisuals, id);
    for (const obstacle of gameState.obstacles) {
      if (!obstacleVisuals.has(obstacle.id)) createObstacleVisual(obstacle);
      const visual = obstacleVisuals.get(obstacle.id);
      if (!visual) continue;
      visual.root.position.x = obstacle.position.x;
      visual.root.position.z = obstacle.position.z;
      if (visual.root instanceof THREE.Mesh) {
        visual.root.material = obstacle.active ? obstacleActiveMaterial : obstacleTelegraphMaterial;
      }
    }

    const hazardIds = new Set(gameState.hazards.map((hazard) => hazard.id));
    for (const id of [...hazardVisuals.keys()]) if (!hazardIds.has(id)) removeSimpleVisual(hazardVisuals, id);
    for (const hazard of gameState.hazards) {
      if (!hazardVisuals.has(hazard.id)) createHazardVisual(hazard);
      const visual = hazardVisuals.get(hazard.id);
      if (!visual || !(visual.ownedMaterial instanceof THREE.MeshBasicMaterial)) continue;
      visual.root.position.x = hazard.position.x;
      visual.root.position.z = hazard.position.z;
      visual.ownedMaterial.color.setHex(hazard.phase === "active" ? 0xff382e : 0xffb34d);
      visual.ownedMaterial.opacity = hazard.phase === "active" ? 0.5 : hazard.phase === "triggered" ? 0.38 : 0.22;
      const pulse = 1 + Math.sin(worldTime * (hazard.phase === "active" ? 24 : 8)) * 0.04;
      visual.root.scale.multiplyScalar(pulse / Math.max(EPSILON_PRESENTATION, visual.root.userData.lastPulse ?? 1));
      visual.root.userData.lastPulse = pulse;
    }
  }

  function updateHud(): void {
    let alive = 0;
    if (enemyVisuals.size > 0) {
      for (const visual of enemyVisuals.values()) {
        if (visual.deathAge === null || visual.deathAge < 0.12) alive += 1;
      }
    } else {
      for (const enemy of gameState.enemies) if (enemy.alive) alive += 1;
    }
    if (renderedStageIndex !== gameState.stage.index || renderedStageName !== gameState.stage.name) {
      const campaign = gameState.run.fullGame;
      shell.stageLabel.textContent = campaign
        ? `ACT ${campaign.routeProgress.actIndex + 1} / LAYER ${campaign.routeProgress.layerIndex + 1}`
        : `STAGE ${String(gameState.stage.index + 1).padStart(2, "0")} / ${gameState.stage.name}`;
      renderedStageIndex = gameState.stage.index;
      renderedStageName = gameState.stage.name;
    }
    if (renderedAliveCount !== alive) {
      shell.enemyLabel.textContent = `${String(alive).padStart(2, "0")} HOSTILES`;
      renderedAliveCount = alive;
    }
    const charge = gameState.player.charge;
    const chargeProgress = charge === null ? 0 : Math.min(1, charge.heldMs / charge.thresholdMs);
    const roundedCharge = Math.round(chargeProgress * 100);
    if (renderedChargeProgress !== roundedCharge) {
      shell.chargeFill.style.transform = `scaleX(${chargeProgress})`;
      renderedChargeProgress = roundedCharge;
    }
    const chargeLabel = charge === null
      ? "CHARGED READY"
      : chargeProgress >= 1 ? "CHARGED RELEASE" : `CHARGING ${String(roundedCharge).padStart(3, "0")}%`;
    if (renderedChargeLabel !== chargeLabel) {
      shell.chargeLabel.textContent = chargeLabel;
      renderedChargeLabel = chargeLabel;
    }
    const energy = Math.round(gameState.player.ultimateEnergy);
    if (renderedEnergy !== energy) {
      shell.energyLabel.textContent = `ENERGY ${String(energy).padStart(3, "0")} / 100`;
      renderedEnergy = energy;
    }
    const planning = gameState.player.ultimatePlanning;
    const execution = gameState.player.ultimateExecution;
    const vectorLabel = planning
      ? `VECTOR PLAN ${planning.points.length} / ${planning.requiredPointCount} · ${Math.max(0, (planning.durationMs - planning.elapsedMs) / 1000).toFixed(1)}s`
      : execution
        ? `VECTOR EXECUTE ${execution.segmentIndex + 1} / ${execution.points.length}`
        : energy >= 100 ? "SPACE / VECTOR READY" : "SPACE / VECTOR LOCKED";
    if (renderedVectorLabel !== vectorLabel) {
      shell.vectorLabel.textContent = vectorLabel;
      renderedVectorLabel = vectorLabel;
    }
  }

  function updatePhaseBanner(): void {
    const campaign = gameState.run.fullGame;
    let visible = false;
    let tone = "clear";
    let eyebrow = `STAGE ${String(gameState.stage.index + 1).padStart(2, "0")}`;
    let title = gameState.stage.name;
    let subtitle = `ELIMINATE ${String(gameState.combat.totalEnemies).padStart(2, "0")} HOSTILES`;
    if (gameState.stage.phase === "playing") {
      if (waveWarningRemaining > 0 && waveWarningLabel) {
        visible = true;
        tone = "danger";
        eyebrow = "HOSTILE SIGNAL";
        title = "INBOUND";
        subtitle = `${waveWarningLabel} // ${Math.ceil(waveWarningRemaining * 10) / 10}s`;
      } else {
        visible = stageIntroAge < 0.86;
      }
    } else if (gameState.stage.phase === "dead") {
      visible = true;
      tone = "danger";
      eyebrow = "COMBAT LINK";
      title = "SIGNAL LOST";
      subtitle = `REBOOTING // ATTEMPT ${String(gameState.stage.attempt + 1).padStart(2, "0")}`;
    } else if (gameState.stage.phase === "stage-cleared") {
      visible = true;
      title = "SECTOR CLEARED";
      subtitle = "NEXT STAGE INBOUND";
    } else if (campaign !== null) {
      visible = false;
    } else {
      visible = true;
      eyebrow = "COMBAT SEQUENCE";
      title = "SEQUENCE COMPLETE";
      subtitle = "ALL HOSTILES ELIMINATED";
    }
    if (renderedBannerTone !== tone) {
      shell.phaseBanner.dataset.tone = tone;
      renderedBannerTone = tone;
    }
    if (renderedBannerVisible !== visible) {
      shell.phaseBanner.classList.toggle("visible", visible);
      renderedBannerVisible = visible;
    }
    if (renderedBannerEyebrow !== eyebrow) {
      shell.phaseEyebrow.textContent = eyebrow;
      renderedBannerEyebrow = eyebrow;
    }
    if (renderedBannerTitle !== title) {
      shell.phaseTitle.textContent = title;
      renderedBannerTitle = title;
    }
    if (renderedBannerSubtitle !== subtitle) {
      shell.phaseSubtitle.textContent = subtitle;
      renderedBannerSubtitle = subtitle;
    }
  }

  function updatePreview(): void {
    previewLine.visible = pointerSeen
      && hoverValid
      && tuning.dashPreview
      && gameState.stage.phase === "playing"
      && gameState.player.ultimatePlanning === null
      && worldTime >= previewSuppressedUntil;
    if (!previewLine.visible) return;
    const positions = previewGeometry.getAttribute("position") as THREE.BufferAttribute;
    const charge = gameState.player.charge;
    const curveGesture = charge &&
      charge.heldMs <= 180 &&
      gameState.run.selectedUpgrades.includes("skill-curve-dash-v1") &&
      Math.hypot(
        charge.currentTarget.x - charge.initialTarget.x,
        charge.currentTarget.z - charge.initialTarget.z,
      ) >= CURVE_DRAG_MIN_DISTANCE;
    if (charge && curveGesture) {
      const points = curveDashPathPoints(gameState.player.position, charge.initialTarget, charge.currentTarget);
      points.slice(0, 17).forEach((point, index) => positions.setXYZ(index, point.x, 0.08, point.z));
      previewGeometry.setDrawRange(0, Math.min(17, points.length));
    } else if (charge) {
      positions.setXYZ(0, gameState.player.position.x, 0.08, gameState.player.position.z);
      const distance = Math.hypot(
        charge.currentTarget.x - gameState.player.position.x,
        charge.currentTarget.z - gameState.player.position.z,
      );
      positions.setXYZ(
        1,
        gameState.player.position.x + charge.direction.x * distance,
        0.08,
        gameState.player.position.z + charge.direction.z * distance,
      );
      previewGeometry.setDrawRange(0, 2);
    } else {
      positions.setXYZ(0, gameState.player.position.x, 0.08, gameState.player.position.z);
      positions.setXYZ(1, pointerWorld.x, 0.08, pointerWorld.z);
      previewGeometry.setDrawRange(0, 2);
    }
    positions.needsUpdate = true;
    previewGeometry.computeBoundingSphere();
  }

  function updateStoredPath(): void {
    const stored = gameState.combat.storedPath;
    storedPathLine.visible = stored !== null;
    if (!stored) {
      storedPathGeometry.setDrawRange(0, 0);
      return;
    }
    const points = stored.segments.length === 0
      ? []
      : [stored.segments[0]!.from, ...stored.segments.map((segment) => segment.to)];
    const positions = storedPathGeometry.getAttribute("position") as THREE.BufferAttribute;
    points.slice(0, 18).forEach((point, index) => positions.setXYZ(index, point.x, 0.075, point.z));
    positions.needsUpdate = true;
    storedPathGeometry.setDrawRange(0, Math.min(18, points.length));
    storedPathGeometry.computeBoundingSphere();
    storedPathMaterial.opacity = 0.16 + 0.42 * Math.min(1, stored.remainingMs / STORED_PATH_DURATION_MS);
  }

  function updateUltimatePlan(): void {
    const planning = gameState.player.ultimatePlanning;
    ultimatePlanLine.visible = planning !== null;
    if (!planning) {
      ultimatePlanGeometry.setDrawRange(0, 0);
      return;
    }
    const points = [gameState.player.position, ...planning.points];
    if (pointerSeen && hoverValid && points.length < 6) {
      points.push({ x: pointerWorld.x, z: pointerWorld.z });
    }
    const positions = ultimatePlanGeometry.getAttribute("position") as THREE.BufferAttribute;
    points.slice(0, 6).forEach((point, index) => positions.setXYZ(index, point.x, 0.1, point.z));
    positions.needsUpdate = true;
    ultimatePlanGeometry.setDrawRange(0, Math.min(6, points.length));
    ultimatePlanGeometry.computeBoundingSphere();
  }

  function triggerDashVisual(event: Extract<GameEvent, { type: "dash-started" | "dash-reflected" | "dash-path-segment-started" }>): void {
    const presentation = abilityPresentationRegistry.get(event.abilityId);
    const cameraProfile = cameraProfileRegistry.get(presentation.cameraProfileId);
    if (cameraProfile.runtimeId !== "gameplay-camera-impulse-v1") {
      throw new Error(`Unsupported dash camera runtime: ${cameraProfile.runtimeId}`);
    }
    const start = new THREE.Vector3(event.from.x, 0, event.from.z);
    const end = new THREE.Vector3(event.to.x, 0, event.to.z);
    const direction = end.clone().sub(start).setY(0).normalize();
    const anticipatedHits = "anticipatedHits" in event ? event.anticipatedHits : [];
    const curveContinuation = event.type === "dash-path-segment-started";
    const kills = anticipatedHits.map(({ position }) => (
      new THREE.Vector3(position.x, 0, position.z)
    ));
    environment.reactToDash(start, end, Math.min(1.6, 1 + kills.length * 0.08));
    playerHeading = Math.atan2(direction.x, direction.z);
    playerActor.root.rotation.y = playerHeading;
    playerActor.animation.update({
      state: "action",
      timeSeconds: worldTime,
      deltaSeconds: 1 / 30,
      turn: 0,
      sourceProgress: 0.43,
    });
    if (curveContinuation && event.segmentIndex % 2 !== 0) return;
    if (!curveContinuation && pendingAbilityInputId !== null) {
      diagnostics.markDashLogic(pendingAbilityInputId);
      pendingAbilityInputId = null;
    }
    vfx.spawnSlash(
      presentation.vfxProfileId,
      { start, end, killPositions: kills, actor: playerActor.afterimageSource },
    );
    if (!curveContinuation) {
      audio.playDash(presentation.audioProfileId, kills.length);
      postFx.triggerImpact(presentation.cameraProfileId, kills.length * 0.055);
      heroAnchorLight.intensity = Math.min(34, 18 + kills.length * 2.6);
      cameraImpulse.add(new THREE.Vector3(
        direction.x * 0.16,
        0.065 + kills.length * 0.009,
        direction.z * 0.13,
      ));
      previewSuppressedUntil = worldTime + 0.42;
      shell.reticle.classList.add("active");
      window.setTimeout(() => shell.reticle.classList.remove("active"), 100);
    }
  }

  function updateEnemyVisual(enemy: EnemyState, visual: EnemyVisualRuntime, dt: number): void {
    const root = visual.actor.root;
    visual.armorRoot.position.copy(root.position);
    visual.armorRoot.rotation.copy(root.rotation);
    visual.armorRoot.scale.copy(root.scale);
    for (const armorPart of enemy.armorParts) {
      const mesh = visual.armorMeshes.get(armorPart.id);
      if (mesh) mesh.visible = armorPart.intact && enemy.alive;
    }
    if (visual.deathAge !== null) {
      visual.deathAge += dt;
      const t = visual.deathAge;
      const heatIn = THREE.MathUtils.smoothstep(t, 0.006, 0.042);
      const heatOut = 1 - THREE.MathUtils.smoothstep(t, 0.24, 0.72);
      const instantHeat = 1 - THREE.MathUtils.smoothstep(t, 0.028, 0.075);
      visual.actor.deathPresentation?.setCutVisible(t >= 0.006);
      visual.actor.deathPresentation?.setCutHeat(Math.max(instantHeat * 0.92, heatIn * heatOut));
      if (!visual.separated) {
        visual.actor.animation.update({
          state: t < 0.12 ? "hit" : "death",
          timeSeconds: worldTime,
          deltaSeconds: dt,
          distanceMoved: 0,
          speedNormalized: 0,
          turn: 0,
          threat: 0,
          hitAgeSeconds: t,
          sourceProgress: THREE.MathUtils.clamp(t / 0.72, 0, 1),
        });
      }
      if (!visual.contactSpawned && t >= 0.012) {
        vfx.spawnCutContact("enemy-cut-contact-v1", {
          position: new THREE.Vector3(root.position.x, 0, root.position.z),
          direction: visual.slashDirection,
          intensity: 0.82,
        });
        visual.contactSpawned = true;
      }
      if (!visual.impactSpawned && t >= 0.052) {
        const enemyPresentation = enemyPresentationRegistry.get(enemy.definitionId);
        vfx.spawnKillImpact(enemyPresentation.vfxProfileId, {
          position: new THREE.Vector3(root.position.x, 0, root.position.z),
          direction: visual.slashDirection,
          intensity: 1.05,
        });
        visual.impactSpawned = true;
      }
      if (!visual.corpseAttempted && t >= 0.12) {
        visual.corpseAttempted = true;
        visual.corpse = visual.actor.deathPresentation?.separate(
          scene,
          visual.slashDirection,
          visual.phase * 101 + gameState.stage.index * 17,
        ) ?? null;
        visual.separated = visual.corpse !== null;
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
    const speedNormalized = THREE.MathUtils.clamp(
      distanceMoved / Math.max(0.0001, enemy.speed * dt),
      0,
      1,
    );
    const threat = 1 - THREE.MathUtils.smoothstep(distanceToPlayer, 1.2, 3.1);
    visual.actor.animation.update({
      state: speedNormalized > 0.05 || threat > 0.05 ? "action" : "idle",
      timeSeconds: worldTime,
      deltaSeconds: dt,
      distanceMoved,
      speedNormalized,
      turn: THREE.MathUtils.clamp(turnDelta / 0.72, -1, 1),
      threat,
    });
  }

  function updateEnemyContactShadows(): void {
    let instanceIndex = 0;
    for (const enemy of gameState.enemies) {
      if (!enemy.alive || instanceIndex >= enemyContactShadows.instanceMatrix.count) continue;
      const visual = enemyVisuals.get(enemy.id);
      if (!visual) continue;
      enemyContactShadowTransform.position.set(
        visual.actor.root.position.x,
        0.012,
        visual.actor.root.position.z,
      );
      enemyContactShadowTransform.rotation.set(0, visual.heading, 0);
      enemyContactShadowTransform.scale.set(0.86, 1, 0.5);
      enemyContactShadowTransform.updateMatrix();
      enemyContactShadows.setMatrixAt(instanceIndex, enemyContactShadowTransform.matrix);
      instanceIndex += 1;
    }
    enemyContactShadows.count = instanceIndex;
    enemyContactShadows.instanceMatrix.needsUpdate = true;
  }

  function resetStage(): void {
    vfx.clearStage();
    rebuildEnemyVisuals();
    clearWorldEntityVisuals();
    syncWorldEntityVisuals();
    playerActor.animation.reset();
    playerActor.setVisible(true);
    playerActor.setPosition(gameState.player.position);
    playerHeading = Math.atan2(gameState.player.facing.x, gameState.player.facing.z);
    playerActor.root.rotation.set(0, playerHeading, 0);
    phaseAge = 0;
    stageIntroAge = 0;
    waveWarningLabel = null;
    waveWarningRemaining = 0;
    updateHud();
  }

  function consumeEvents(events: readonly GameEvent[]): void {
    for (const event of events) {
      if (event.type === "dash-started" || event.type === "dash-reflected" || event.type === "dash-path-segment-started") {
        triggerDashVisual(event);
      } else if (event.type === "enemy-killed") {
        const visual = enemyVisuals.get(event.enemyId);
        if (visual && visual.deathAge === null) {
          visual.deathAge = 0;
          visual.slashDirection.set(event.direction.x, 0, event.direction.z).normalize();
          visual.contactSpawned = false;
          visual.impactSpawned = false;
          visual.separated = false;
          visual.corpseAttempted = false;
          visual.actor.deathPresentation?.setCutVisible(false);
          visual.actor.deathPresentation?.setCutHeat(0);
        }
      } else if (event.type === "player-died") {
        phaseAge = 0;
        postFx.triggerImpact("death-impact-current-v1");
        hostileRim.intensity = 180;
        audio.playDeath("player-death-current-v1");
      } else if (event.type === "armor-broken") {
        const visual = enemyVisuals.get(event.enemyId);
        const mesh = visual?.armorMeshes.get(event.armorPartId);
        if (mesh) mesh.visible = false;
        vfx.spawnCutContact("enemy-cut-contact-v1", {
          position: new THREE.Vector3(event.position.x, 1.4, event.position.z),
          direction: new THREE.Vector3(gameState.player.facing.x, 0, gameState.player.facing.z),
          intensity: 1.2,
        });
      } else if (event.type === "dash-obstacle-impact") {
        vfx.spawnCutContact("enemy-cut-contact-v1", {
          position: new THREE.Vector3(event.position.x, 0.72, event.position.z),
          direction: new THREE.Vector3(event.normal.x, 0, event.normal.z),
          intensity: 0.95,
        });
        postFx.triggerImpact(abilityPresentationRegistry.get(event.abilityId).cameraProfileId);
      } else if (event.type === "scheduled-slash-triggered") {
        const presentation = abilityPresentationRegistry.get("dash-slash");
        vfx.spawnSlash(presentation.vfxProfileId, {
          start: new THREE.Vector3(event.from.x, 0, event.from.z),
          end: new THREE.Vector3(event.to.x, 0, event.to.z),
          killPositions: [],
          actor: playerActor.afterimageSource,
        });
      } else if (event.type === "cross-execution-triggered" || event.type === "impact-burst-triggered") {
        vfx.spawnCutContact("enemy-cut-contact-v1", {
          position: new THREE.Vector3(event.position.x, 0.3, event.position.z),
          direction: new THREE.Vector3(0, 1, 0),
          intensity: event.type === "cross-execution-triggered" ? 1.45 : 1.1,
        });
        postFx.triggerImpact("dash-impact-current-v1", event.type === "cross-execution-triggered" ? 0.28 : 0.18);
      } else if (event.type === "gravity-pull-started") {
        vfx.spawnCutContact("enemy-cut-contact-v1", {
          position: new THREE.Vector3(event.to.x, 0.15, event.to.z),
          direction: new THREE.Vector3(event.to.x - event.from.x, 0, event.to.z - event.from.z).normalize(),
          intensity: 0.42,
        });
      } else if (event.type === "stage-cleared" || event.type === "game-complete") {
        phaseAge = 0;
      } else if (event.type === "encounter-wave-warning") {
        waveWarningLabel = event.waveId.toUpperCase();
        waveWarningRemaining = Math.max(0, (event.activationAtMs - event.atMs) / 1000);
      } else if (event.type === "encounter-wave-started") {
        waveWarningLabel = null;
        waveWarningRemaining = 0;
      }
    }
  }

  function update(dt: number): PresentationLifecycleAction | null {
    worldTime += dt;
    stageIntroAge += dt;
    waveWarningRemaining = Math.max(0, waveWarningRemaining - dt);
    syncEnemyVisuals();
    syncWorldEntityVisuals();
    environment.update(worldTime, dt);
    postFx.update(worldTime, dt);
    hostileRim.intensity = THREE.MathUtils.damp(hostileRim.intensity, 52, 5, dt);
    heroAnchorLight.intensity = THREE.MathUtils.damp(heroAnchorLight.intensity, 2.6, 11, dt);

    const player = gameState.player;
    if (player.dash) {
      playerActor.root.position.x = player.position.x;
      playerActor.root.position.z = player.position.z;
    } else {
      playerActor.root.position.x = THREE.MathUtils.damp(
        playerActor.root.position.x,
        player.position.x,
        22,
        dt,
      );
      playerActor.root.position.z = THREE.MathUtils.damp(
        playerActor.root.position.z,
        player.position.z,
        22,
        dt,
      );
    }
    playerActor.root.position.y = 0;
    heroAnchorLight.position.set(playerActor.root.position.x, 1.85, playerActor.root.position.z);
    heroKeyLight.position.set(playerActor.root.position.x + 2.8, 5.2, playerActor.root.position.z + 3.8);
    heroKeyTarget.position.set(playerActor.root.position.x, 1.45, playerActor.root.position.z);
    const targetPlayerHeading = Math.atan2(player.facing.x, player.facing.z);
    const playerTurnDelta = signedAngleDelta(playerHeading, targetPlayerHeading);
    playerHeading = dampAngle(playerHeading, targetPlayerHeading, player.dash ? 72 : 19, dt);
    playerActor.root.rotation.y = playerHeading;
    const dashProgress = player.dash
      ? THREE.MathUtils.clamp(player.dash.elapsedMs / player.dash.durationMs, 0, 1)
      : null;
    const chargeProgress = player.charge
      ? THREE.MathUtils.clamp(player.charge.heldMs / player.charge.thresholdMs, 0, 1)
      : null;
    const ultimatePlanningProgress = player.ultimatePlanning
      ? THREE.MathUtils.clamp(player.ultimatePlanning.elapsedMs / player.ultimatePlanning.durationMs, 0, 1)
      : null;
    const recoveryProgress = !player.dash && player.recoveryRemainingMs > 0
      ? 1 - THREE.MathUtils.clamp(player.recoveryRemainingMs / gameState.rules.recoveryMs, 0, 1)
      : null;
    const playerAnimationState = gameState.stage.phase === "dead"
      ? "death"
      : ultimatePlanningProgress !== null
        ? "anticipation"
      : chargeProgress !== null
        ? "anticipation"
      : dashProgress !== null && dashProgress < 0.18
        ? "anticipation"
        : dashProgress !== null && dashProgress < 0.72
          ? "action"
          : dashProgress !== null
            ? "arrival"
            : recoveryProgress !== null
              ? "recovery"
              : "idle";
    playerActor.animation.update({
      state: playerAnimationState,
      timeSeconds: worldTime,
      deltaSeconds: dt,
      turn: THREE.MathUtils.clamp(playerTurnDelta / 0.65, -1, 1),
      sourceProgress: gameState.stage.phase === "dead"
        ? THREE.MathUtils.clamp(phaseAge / 0.78, 0, 1)
        : ultimatePlanningProgress ?? chargeProgress ?? dashProgress ?? recoveryProgress,
    });
    for (const enemy of gameState.enemies) {
      const visual = enemyVisuals.get(enemy.id);
      if (visual) updateEnemyVisual(enemy, visual, dt);
    }
    updateEnemyContactShadows();
    vfx.update(dt);

    let lifecycleAction: PresentationLifecycleAction | null = null;
    if (gameState.stage.phase !== "playing") {
      phaseAge += dt;
      if (gameState.stage.phase === "dead" && phaseAge > 0.78) lifecycleAction = "restart-stage";
      else if (gameState.stage.phase === "stage-cleared" && phaseAge > 1.05) lifecycleAction = "advance-stage";
      else if (gameState.stage.phase === "game-complete" && phaseAge > 1.8) lifecycleAction = "reset-run";
    }

    cameraImpulse.multiplyScalar(Math.exp(-dt * 8.5));
    camera.position.copy(cameraBase).add(cameraImpulse);
    camera.position.y += Math.sin(worldTime * 0.21) * 0.07;
    camera.lookAt(cameraTarget);
    updatePreview();
    updateStoredPath();
    updateUltimatePlan();
    updateHud();
    updatePhaseBanner();
    return lifecycleAction;
  }

  return {
    resetStage,
    consumeEvents,
    update,
    updatePointer(clientX, clientY) {
      pointerSeen = true;
      shell.reticle.style.left = `${clientX}px`;
      shell.reticle.style.top = `${clientY}px`;
      const rect = shell.canvas.getBoundingClientRect();
      pointerNdc.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointerNdc, camera);
      const hit = raycaster.intersectObject(environment.arenaHitSurface, false)[0];
      hoverValid = Boolean(hit);
      shell.reticle.classList.toggle("invalid", !hoverValid);
      if (hit) pointerWorld.copy(hit.point);
      updatePreview();
    },
    clearPointer() {
      pointerSeen = false;
      previewLine.visible = false;
    },
    getPrimaryTarget() {
      if (!hoverValid || gameState.stage.phase !== "playing") return null;
      return { x: pointerWorld.x, z: pointerWorld.z };
    },
    markPendingAbilityInput(inputId) {
      pendingAbilityInputId = inputId;
    },
    snapshot() {
      return {
        playerAnimation: playerActor.animation.snapshot(),
        vfx: vfx.snapshot(),
        audio: audio.snapshot(),
        postFx: postFx.snapshot(),
        environment: environment.snapshot(),
      };
    },
    dispose() {
      for (const visual of enemyVisuals.values()) {
        visual.corpse?.dispose();
        visual.armorRoot.removeFromParent();
        visual.actor.dispose();
      }
      enemyVisuals.clear();
      clearWorldEntityVisuals();
      playerActor.dispose();
      scene.remove(previewLine, storedPathLine, ultimatePlanLine, enemyContactShadows);
      previewGeometry.dispose();
      previewMaterial.dispose();
      storedPathGeometry.dispose();
      storedPathMaterial.dispose();
      ultimatePlanGeometry.dispose();
      ultimatePlanMaterial.dispose();
      enemyContactShadowGeometry.dispose();
      enemyContactShadowMaterial.dispose();
      enemyContactShadowTexture.dispose();
      armorPlateGeometry.dispose();
      armorPlateMaterial.dispose();
      projectileGeometry.dispose();
      hostileProjectileMaterial.dispose();
      returnedProjectileMaterial.dispose();
      obstacleBoxGeometry.dispose();
      obstacleCylinderGeometry.dispose();
      obstacleActiveMaterial.dispose();
      obstacleTelegraphMaterial.dispose();
      hazardRingGeometry.dispose();
      hazardPlaneGeometry.dispose();
    },
  };
}
