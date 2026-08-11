import * as THREE from "three";
import {
  dampAngle,
  signedAngleDelta,
} from "../characters/animation";
import type { Vec2 } from "../core/math/vec2";
import type { EnemyState, GameEvent, GameState } from "../game/domain/types";
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
}

export interface PresentationShell {
  readonly canvas: HTMLCanvasElement;
  readonly reticle: HTMLDivElement;
  readonly stageLabel: HTMLSpanElement;
  readonly enemyLabel: HTMLSpanElement;
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
    new THREE.Float32BufferAttribute([0, 0.06, 0, 0, 0.06, 0], 3),
  );
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
  const enemyVisuals = new Map<string, EnemyVisualRuntime>();
  let renderedStageIndex = -1;
  let renderedStageName = "";
  let renderedAliveCount = -1;
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

  function rebuildEnemyVisuals(): void {
    for (const visual of enemyVisuals.values()) {
      visual.corpse?.dispose();
      visual.actor.dispose();
    }
    enemyVisuals.clear();
    gameState.enemies.forEach((enemy, index) => {
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
      scene.add(actor.root);
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
      });
    });
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
      shell.stageLabel.textContent = `STAGE ${String(gameState.stage.index + 1).padStart(2, "0")} / ${gameState.stage.name}`;
      renderedStageIndex = gameState.stage.index;
      renderedStageName = gameState.stage.name;
    }
    if (renderedAliveCount !== alive) {
      shell.enemyLabel.textContent = `${String(alive).padStart(2, "0")} HOSTILES`;
      renderedAliveCount = alive;
    }
  }

  function updatePhaseBanner(): void {
    let visible = false;
    let tone = "clear";
    let eyebrow = `STAGE ${String(gameState.stage.index + 1).padStart(2, "0")}`;
    let title = gameState.stage.name;
    let subtitle = `ELIMINATE ${String(gameState.combat.totalEnemies).padStart(2, "0")} HOSTILES`;
    if (gameState.stage.phase === "playing") {
      visible = stageIntroAge < 0.86;
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
      && worldTime >= previewSuppressedUntil;
    if (!previewLine.visible) return;
    const positions = previewGeometry.getAttribute("position") as THREE.BufferAttribute;
    positions.setXYZ(0, gameState.player.position.x, 0.08, gameState.player.position.z);
    positions.setXYZ(1, pointerWorld.x, 0.08, pointerWorld.z);
    positions.needsUpdate = true;
    previewGeometry.computeBoundingSphere();
  }

  function triggerDashVisual(event: Extract<GameEvent, { type: "dash-started" }>): void {
    const presentation = abilityPresentationRegistry.get(event.abilityId);
    const cameraProfile = cameraProfileRegistry.get(presentation.cameraProfileId);
    if (cameraProfile.runtimeId !== "gameplay-camera-impulse-v1") {
      throw new Error(`Unsupported dash camera runtime: ${cameraProfile.runtimeId}`);
    }
    const start = new THREE.Vector3(event.from.x, 0, event.from.z);
    const end = new THREE.Vector3(event.to.x, 0, event.to.z);
    const direction = end.clone().sub(start).setY(0).normalize();
    const kills = event.anticipatedHits.map(({ position }) => (
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
    if (pendingAbilityInputId !== null) {
      diagnostics.markDashLogic(pendingAbilityInputId);
      pendingAbilityInputId = null;
    }
    vfx.spawnSlash(
      presentation.vfxProfileId,
      { start, end, killPositions: kills, actor: playerActor.afterimageSource },
    );
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

  function updateEnemyVisual(enemy: EnemyState, visual: EnemyVisualRuntime, dt: number): void {
    const root = visual.actor.root;
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
    playerActor.animation.reset();
    playerActor.setVisible(true);
    playerActor.setPosition(gameState.player.position);
    playerHeading = Math.atan2(gameState.player.facing.x, gameState.player.facing.z);
    playerActor.root.rotation.set(0, playerHeading, 0);
    phaseAge = 0;
    stageIntroAge = 0;
    updateHud();
  }

  function consumeEvents(events: readonly GameEvent[]): void {
    for (const event of events) {
      if (event.type === "dash-started") {
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
      } else if (event.type === "stage-cleared" || event.type === "game-complete") {
        phaseAge = 0;
      }
    }
  }

  function update(dt: number): PresentationLifecycleAction | null {
    worldTime += dt;
    stageIntroAge += dt;
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
    const recoveryProgress = !player.dash && player.recoveryRemainingMs > 0
      ? 1 - THREE.MathUtils.clamp(player.recoveryRemainingMs / gameState.rules.recoveryMs, 0, 1)
      : null;
    const playerAnimationState = gameState.stage.phase === "dead"
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
    playerActor.animation.update({
      state: playerAnimationState,
      timeSeconds: worldTime,
      deltaSeconds: dt,
      turn: THREE.MathUtils.clamp(playerTurnDelta / 0.65, -1, 1),
      sourceProgress: gameState.stage.phase === "dead"
        ? THREE.MathUtils.clamp(phaseAge / 0.78, 0, 1)
        : dashProgress ?? recoveryProgress,
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
        visual.actor.dispose();
      }
      enemyVisuals.clear();
      playerActor.dispose();
      scene.remove(previewLine, enemyContactShadows);
      previewGeometry.dispose();
      previewMaterial.dispose();
      enemyContactShadowGeometry.dispose();
      enemyContactShadowMaterial.dispose();
      enemyContactShadowTexture.dispose();
    },
  };
}
