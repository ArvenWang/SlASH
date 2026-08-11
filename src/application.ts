import { getGameSnapshot } from "./game/game";
import { levelByIndex } from "./content/levels/definitions";
import { createCharacterProviderRegistry } from "./presentation/characters/providers";
import {
  PLAYER_CHARACTER_PRESENTATION_ID,
  characterPresentationRegistry,
  enemyPresentationRegistry,
} from "./presentation/registry";
import { createPerformanceBudgetSnapshot } from "./presentation/performance/budgets";
import { createDebugRuntime, type RuntimeTuning } from "./runtime/debug-runtime";
import { createFullGameRuntime, createGameRuntime } from "./runtime/game-runtime";
import { createInputRuntime } from "./runtime/input-runtime";
import { createPresentationRuntime } from "./runtime/presentation-runtime";
import { createRendererRuntime } from "./runtime/renderer-runtime";
import { createCampaignUiRuntime } from "./runtime/campaign-ui-runtime";

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Project Slash shell is missing ${selector}.`);
  return element;
}

export async function bootstrapSlashApplication(): Promise<void> {
  const shell = {
    canvas: requiredElement<HTMLCanvasElement>("#game-canvas"),
    reticle: requiredElement<HTMLDivElement>("#reticle"),
    loading: requiredElement<HTMLDivElement>("#loading"),
    stageLabel: requiredElement<HTMLSpanElement>("#stage-label"),
    enemyLabel: requiredElement<HTMLSpanElement>("#enemy-label"),
    chargeLabel: requiredElement<HTMLSpanElement>("#charge-label"),
    chargeFill: requiredElement<HTMLElement>("#charge-fill"),
    energyLabel: requiredElement<HTMLSpanElement>("#energy-label"),
    vectorLabel: requiredElement<HTMLSpanElement>("#vector-label"),
    phaseBanner: requiredElement<HTMLDivElement>("#phase-banner"),
    phaseEyebrow: requiredElement<HTMLSpanElement>("#phase-eyebrow"),
    phaseTitle: requiredElement<HTMLElement>("#phase-title"),
    phaseSubtitle: requiredElement<HTMLElement>("#phase-subtitle"),
    loadingLabel: requiredElement<HTMLParagraphElement>("#loading-label"),
    loadingProgress: requiredElement<HTMLSpanElement>("#loading-progress"),
    campaignUi: requiredElement<HTMLDivElement>("#campaign-ui"),
  };
  const pageParameters = new URLSearchParams(window.location.search);
  const qualityMode = pageParameters.get("quality") === "compatibility"
    ? "compatibility"
    : "high";
  const deterministicCapture = pageParameters.get("deterministic") === "1";
  const validationMode = pageParameters.get("validation") === "1";

  function setLoadingPhase(progress: number, label: string): void {
    const scale = Math.min(1, Math.max(0.05, progress));
    shell.loadingProgress.style.transform = `scaleX(${scale})`;
    shell.loadingLabel.textContent = label;
  }

  setLoadingPhase(0.12, "INITIALIZING RENDERER");
  const useLegacyValidationFixture = validationMode && pageParameters.get("campaign") !== "1";
  const gameRuntime = useLegacyValidationFixture ? createGameRuntime(0) : createFullGameRuntime();
  const gameState = gameRuntime.state;
  const initialLevel = levelByIndex(gameState.stage.index);
  const rendererRuntime = createRendererRuntime({
    canvas: shell.canvas,
    qualityMode,
    environmentId: initialLevel.environmentId,
    lightingProfileId: initialLevel.lightingProfileId,
  });
  setLoadingPhase(0.62, "ASSEMBLING COMBAT SPACE");
  const tuning: RuntimeTuning = {
    exposure: 0.98,
    bloom: 0.34,
    cameraFov: 28.5,
    vfxDensity: 1,
    rainDensity: 1,
    fogDensity: 0.0078,
    enemyMotion: true,
    dashPreview: true,
  };
  const characterProviders = createCharacterProviderRegistry();
  const activeCharacterProviderIds = [
    characterPresentationRegistry.get(PLAYER_CHARACTER_PRESENTATION_ID).providerId,
    ...enemyPresentationRegistry.list().map((presentation) => (
      characterPresentationRegistry.get(presentation.characterId).providerId
    )),
  ];
  await characterProviders.prepare(activeCharacterProviderIds);
  const presentationRuntime = createPresentationRuntime({
    shell,
    rendererRuntime,
    gameState,
    tuning,
    characterProviders,
  });
  const campaignUiRuntime = createCampaignUiRuntime({
    root: shell.campaignUi,
    gameState,
    dispatch: (command) => gameRuntime.dispatch(command),
    onStateTransition(result) {
      if (
        result === "planning-confirmed" ||
        result === "event-resolved" ||
        result === "forge-confirmed" ||
        result === "reward-acknowledged" ||
        result === "restarted" ||
        result === "run-started"
      ) {
        presentationRuntime.resetStage();
      }
    },
  });
  setLoadingPhase(0.78, "LINKING COMBATANTS");

  let lastTime = performance.now();
  let simulationEnabled = true;
  let graphicsContextState: "ready" | "lost" | "restoring" = "ready";
  let audioEnabled = true;
  let chargedPointerActive = false;
  let chargedPointerInputId: number | null = null;
  let ultimatePointPointerActive = false;
  let ultimatePointInputId: number | null = null;

  function dispatchPrimaryAbility(target: { x: number; z: number }): string {
    if (gameState.stage.phase !== "playing") return "ignored";
    const inputId = rendererRuntime.diagnostics.markInput();
    const { result } = gameRuntime.dispatch({
      type: "activate-ability",
      slot: "primary",
      target,
    });
    if (result !== "ignored") presentationRuntime.markPendingAbilityInput(inputId);
    if (result === "started") presentationRuntime.consumeEvents(gameRuntime.drainEvents());
    return result;
  }

  function resetPresentationStage(): void {
    presentationRuntime.resetStage();
    simulationEnabled = true;
  }

  function updateFrame(dt: number): void {
    if (simulationEnabled && gameState.stage.phase === "playing") {
      presentationRuntime.consumeEvents(gameRuntime.advance(dt * 1000, tuning.enemyMotion));
    }
    const lifecycleAction = presentationRuntime.update(dt);
    if (lifecycleAction === "restart-stage") {
      gameRuntime.restartStage();
      resetPresentationStage();
    } else if (lifecycleAction === "advance-stage") {
      gameRuntime.advanceStage();
      resetPresentationStage();
    } else if (lifecycleAction === "reset-run") {
      gameRuntime.resetRun();
      resetPresentationStage();
    }
    campaignUiRuntime.update();
  }

  function renderScene(): void {
    rendererRuntime.render();
  }

  function resize(): void {
    rendererRuntime.resize();
  }

  function performanceSnapshot() {
    return createPerformanceBudgetSnapshot({
      diagnostics: rendererRuntime.diagnostics.snapshot(),
      gameState,
      vfx: presentationRuntime.snapshot().vfx,
    });
  }

  const debugRuntime = await createDebugRuntime({
    enabled: validationMode || import.meta.env.DEV,
    validationMode,
    tuning,
    controls: {
      setExposure(value) {
        rendererRuntime.renderer.toneMappingExposure = value;
      },
      setBloom(value) {
        rendererRuntime.postFx.bloom.strength = value;
      },
      setCameraFov(value) {
        rendererRuntime.camera.fov = value;
        rendererRuntime.camera.updateProjectionMatrix();
      },
      setVfxDensity(value) {
        rendererRuntime.vfx.setDensity(value);
      },
      setRainDensity(value) {
        rendererRuntime.environment.setRainDensity(value);
      },
      setFogDensity(value) {
        rendererRuntime.environment.setFogDensity(value);
      },
    },
    inspect: () => {
      const game = getGameSnapshot(gameState);
      const presentation = presentationRuntime.snapshot();
      return {
        gameplay: {
          phase: game.phase,
          action: game.player.action,
          enemies: game.aliveEnemies.length,
          invulnerable: game.player.invulnerable,
        },
        content: {
          level: game.stage.id,
          ability: game.abilities.primary?.id ?? "none",
          enemyDefinition: gameState.enemies[0]?.definitionId ?? "none",
        },
        visual: {
          animation: presentation.playerAnimation.state,
          activeVfx: presentation.vfx.base.activeEffects,
          drawCalls: rendererRuntime.diagnostics.snapshot().renderer.calls,
        },
      };
    },
    renderGameToText: () => JSON.stringify({
      coordinateSystem: "World ground plane. Origin at arena center; +x is screen-right-ish, +z is toward the near camera edge.",
      qualityMode,
      graphicsContextState,
      camera: {
        fov: rendererRuntime.camera.fov,
        near: rendererRuntime.camera.near,
        far: rendererRuntime.camera.far,
        position: {
          x: rendererRuntime.camera.position.x,
          y: rendererRuntime.camera.position.y,
          z: rendererRuntime.camera.position.z,
        },
        target: {
          x: rendererRuntime.cameraTarget.x,
          y: rendererRuntime.cameraTarget.y,
          z: rendererRuntime.cameraTarget.z,
        },
      },
      ...getGameSnapshot(gameState),
      presentation: presentationRuntime.snapshot(),
      performance: performanceSnapshot(),
      diagnostics: rendererRuntime.diagnostics.snapshot(),
    }),
    diagnostics: rendererRuntime.diagnostics,
    validation: {
      setStage(stageIndex) {
        gameRuntime.loadStage(Math.min(2, Math.max(0, Math.round(stageIndex))));
        resetPresentationStage();
      },
      setStressScenario(enemyCount = 20) {
        gameRuntime.loadStressScenario(enemyCount);
        tuning.enemyMotion = false;
        resetPresentationStage();
      },
      setArmorScenario() {
        gameRuntime.loadArmorScenario();
        tuning.enemyMotion = false;
        resetPresentationStage();
      },
      setUltimateScenario() {
        gameRuntime.loadUltimateScenario();
        tuning.enemyMotion = false;
        resetPresentationStage();
      },
      setEntityScenario() {
        gameRuntime.loadEntityScenario();
        tuning.enemyMotion = false;
        resetPresentationStage();
      },
      setBasicPassiveScenario() {
        gameRuntime.loadBasicPassiveScenario();
        tuning.enemyMotion = false;
        resetPresentationStage();
      },
      setCampaignEventScenario() {
        gameRuntime.loadCampaignEventScenario();
        tuning.enemyMotion = false;
        resetPresentationStage();
      },
      setCampaignForgeScenario() {
        gameRuntime.loadCampaignForgeScenario();
        tuning.enemyMotion = false;
        resetPresentationStage();
      },
      dashTo: (x, z) => dispatchPrimaryAbility({ x, z }),
      beginChargeTo(x, z) {
        return gameRuntime.dispatch({ type: "begin-charge", target: { x, z } }).result;
      },
      updateChargeTo(x, z) {
        return gameRuntime.dispatch({ type: "update-charge-target", target: { x, z } }).result;
      },
      releaseChargeTo(x, z) {
        const result = gameRuntime.dispatch({ type: "release-charge", target: { x, z } }).result;
        presentationRuntime.consumeEvents(gameRuntime.drainEvents());
        return result;
      },
      startUltimate() {
        return gameRuntime.dispatch({ type: "start-ultimate" }).result;
      },
      addUltimatePoint(x, z) {
        const result = gameRuntime.dispatch({ type: "add-ultimate-point", target: { x, z } }).result;
        presentationRuntime.consumeEvents(gameRuntime.drainEvents());
        return result;
      },
      cancelUltimate() {
        return gameRuntime.dispatch({ type: "cancel-ultimate" }).result;
      },
      setEnemyMotion(enabled) {
        tuning.enemyMotion = Boolean(enabled);
      },
      loseGraphicsContext() {
        rendererRuntime.renderer.forceContextLoss();
      },
      restoreGraphicsContext() {
        graphicsContextState = "restoring";
        rendererRuntime.renderer.forceContextRestore();
      },
    },
    advanceTime(milliseconds) {
      const steps = Math.max(1, Math.round(Math.max(0, milliseconds) / (1000 / 60)));
      for (let step = 0; step < steps; step += 1) updateFrame(1 / 60);
      renderScene();
    },
  });

  createInputRuntime({
    canvas: shell.canvas,
    onPointerMove: ({ clientX, clientY }) => {
      presentationRuntime.updatePointer(clientX, clientY);
      if (!chargedPointerActive) return;
      const target = presentationRuntime.getPrimaryTarget();
      if (target) gameRuntime.dispatch({ type: "update-charge-target", target });
    },
    onPrimaryPointerDown: ({ clientX, clientY }) => {
      void rendererRuntime.audio.resume().catch(() => {
        // A later trusted gesture may retry audio without interrupting gameplay.
      });
      if (gameState.stage.phase === "dead") {
        gameRuntime.dispatch({ type: "restart-stage" });
        resetPresentationStage();
        campaignUiRuntime.update();
        return;
      }
      presentationRuntime.updatePointer(clientX, clientY);
      const target = presentationRuntime.getPrimaryTarget();
      if (!target) return;
      const inputId = rendererRuntime.diagnostics.markInput();
      if (gameState.player.ultimatePlanning !== null) {
        ultimatePointPointerActive = true;
        ultimatePointInputId = inputId;
        return;
      }
      const { result } = gameRuntime.dispatch({ type: "begin-charge", target });
      chargedPointerActive = result === "charge-started";
      chargedPointerInputId = chargedPointerActive ? inputId : null;
      if (chargedPointerActive) presentationRuntime.consumeEvents(gameRuntime.drainEvents());
    },
    onPrimaryPointerUp: ({ clientX, clientY }) => {
      presentationRuntime.updatePointer(clientX, clientY);
      const target = presentationRuntime.getPrimaryTarget();
      if (!target) {
        if (chargedPointerActive) gameRuntime.dispatch({ type: "cancel-charge" });
        chargedPointerActive = false;
        chargedPointerInputId = null;
        return;
      }
      if (ultimatePointPointerActive && gameState.player.ultimatePlanning !== null) {
        const { result } = gameRuntime.dispatch({ type: "add-ultimate-point", target });
        if (result === "ultimate-executing" && ultimatePointInputId !== null) {
          presentationRuntime.markPendingAbilityInput(ultimatePointInputId);
        }
        presentationRuntime.consumeEvents(gameRuntime.drainEvents());
        ultimatePointPointerActive = false;
        ultimatePointInputId = null;
        return;
      }
      if (!chargedPointerActive) {
        dispatchPrimaryAbility(target);
        return;
      }
      gameRuntime.dispatch({ type: "update-charge-target", target });
      const { result } = gameRuntime.dispatch({ type: "release-charge", target });
      if ((result === "started" || result === "charged-released") && chargedPointerInputId !== null) {
        presentationRuntime.markPendingAbilityInput(chargedPointerInputId);
      }
      presentationRuntime.consumeEvents(gameRuntime.drainEvents());
      chargedPointerActive = false;
      chargedPointerInputId = null;
    },
    onPrimaryPointerCancel: () => {
      if (chargedPointerActive) {
        gameRuntime.dispatch({ type: "cancel-charge" });
        presentationRuntime.consumeEvents(gameRuntime.drainEvents());
      }
      chargedPointerActive = false;
      chargedPointerInputId = null;
      ultimatePointPointerActive = false;
      ultimatePointInputId = null;
      const ultimateResult = gameRuntime.dispatch({ type: "cancel-ultimate" }).result;
      if (ultimateResult !== "ignored") presentationRuntime.consumeEvents(gameRuntime.drainEvents());
    },
    onSecondaryPointer: () => {
      gameRuntime.dispatch({ type: "cancel-charge" });
      gameRuntime.dispatch({ type: "cancel-ultimate" });
      presentationRuntime.consumeEvents(gameRuntime.drainEvents());
      chargedPointerActive = false;
      chargedPointerInputId = null;
      ultimatePointPointerActive = false;
      ultimatePointInputId = null;
    },
    onUltimate: () => {
      const { result } = gameRuntime.dispatch({ type: "start-ultimate" });
      if (result !== "ignored") presentationRuntime.consumeEvents(gameRuntime.drainEvents());
    },
    onPointerLeave: presentationRuntime.clearPointer,
    onRestart: () => {
      gameRuntime.dispatch({ type: "restart-stage" });
      resetPresentationStage();
    },
    onToggleAudio: () => {
      audioEnabled = !audioEnabled;
      rendererRuntime.audio.setEnabled(audioEnabled);
    },
    onToggleDebug: debugRuntime.togglePanel,
    onResize: resize,
  });

  shell.canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    graphicsContextState = "lost";
    simulationEnabled = false;
    shell.loading.classList.remove("ready");
    setLoadingPhase(0.45, "RESTORING GRAPHICS CONTEXT");
  });
  shell.canvas.addEventListener("webglcontextrestored", () => {
    graphicsContextState = "restoring";
    lastTime = performance.now();
    resize();
    renderScene();
    graphicsContextState = "ready";
    simulationEnabled = gameState.stage.phase === "playing";
    setLoadingPhase(1, "COMBAT SPACE RESTORED");
    requestAnimationFrame(() => shell.loading.classList.add("ready"));
  });
  window.addEventListener("resize", resize);
  document.addEventListener("fullscreenchange", resize);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) lastTime = performance.now();
  });

  function animate(now: number): void {
    if (graphicsContextState !== "ready") {
      lastTime = now;
      requestAnimationFrame(animate);
      return;
    }
    const rawDt = Math.max(0.001, (now - lastTime) / 1000);
    const dt = Math.min(0.05, rawDt);
    lastTime = now;
    rendererRuntime.diagnostics.recordFrame(rawDt * 1000);
    updateFrame(dt);
    renderScene();
    requestAnimationFrame(animate);
  }

  presentationRuntime.resetStage();
  campaignUiRuntime.update();
  resize();
  renderScene();
  setLoadingPhase(0.96, "FINALIZING FIRST FRAME");
  requestAnimationFrame(() => {
    setLoadingPhase(1, "COMBAT SPACE READY");
    requestAnimationFrame(() => shell.loading.classList.add("ready"));
  });
  if (!deterministicCapture) requestAnimationFrame(animate);
}
