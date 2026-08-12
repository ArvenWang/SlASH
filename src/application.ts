import { getGameSnapshot, setVectorFocusEnergy } from "./game/game";
import { levelByIndex } from "./content/levels/definitions";
import { createCharacterProviderRegistry } from "./presentation/characters/providers";
import {
  PLAYER_CHARACTER_PRESENTATION_ID,
  characterPresentationRegistry,
  enemyPresentationRegistry,
} from "./presentation/registry";
import { createPerformanceBudgetSnapshot } from "./presentation/performance/budgets";
import { createDebugRuntime, type RuntimeTuning } from "./runtime/debug-runtime";
import { createGameRuntime } from "./runtime/game-runtime";
import { createInputRuntime } from "./runtime/input-runtime";
import { createPresentationRuntime } from "./runtime/presentation-runtime";
import { createRendererRuntime } from "./runtime/renderer-runtime";

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Project Slash shell is missing ${selector}.`);
  return element;
}

export async function bootstrapSlashApplication(): Promise<void> {
  const shell = {
    gameShell: requiredElement<HTMLElement>("#game-shell"),
    canvas: requiredElement<HTMLCanvasElement>("#game-canvas"),
    reticle: requiredElement<HTMLDivElement>("#reticle"),
    loading: requiredElement<HTMLDivElement>("#loading"),
    stageLabel: requiredElement<HTMLSpanElement>("#stage-label"),
    enemyLabel: requiredElement<HTMLSpanElement>("#enemy-label"),
    phaseBanner: requiredElement<HTMLDivElement>("#phase-banner"),
    phaseEyebrow: requiredElement<HTMLSpanElement>("#phase-eyebrow"),
    phaseTitle: requiredElement<HTMLElement>("#phase-title"),
    phaseSubtitle: requiredElement<HTMLElement>("#phase-subtitle"),
    loadingLabel: requiredElement<HTMLParagraphElement>("#loading-label"),
    loadingProgress: requiredElement<HTMLSpanElement>("#loading-progress"),
    titleScreen: requiredElement<HTMLElement>("#title-screen"),
    startButton: requiredElement<HTMLButtonElement>("#start-button"),
    focusHud: requiredElement<HTMLDivElement>("#focus-hud"),
    focusValue: requiredElement<HTMLElement>("#focus-value"),
    focusPrompt: requiredElement<HTMLElement>("#focus-prompt"),
    focusSlots: [...document.querySelectorAll<HTMLElement>("[data-focus-slot]")],
  };
  const pageParameters = new URLSearchParams(window.location.search);
  const qualityMode = pageParameters.get("quality") === "compatibility"
    ? "compatibility"
    : "high";
  const deterministicCapture = pageParameters.get("deterministic") === "1";
  const validationMode = pageParameters.get("validation") === "1";
  const shouldAutostart = pageParameters.get("autostart") === "1" || validationMode;

  function setLoadingPhase(progress: number, label: string): void {
    const scale = Math.min(1, Math.max(0.05, progress));
    shell.loadingProgress.style.transform = `scaleX(${scale})`;
    shell.loadingLabel.textContent = label;
  }

  setLoadingPhase(0.12, "INITIALIZING RENDERER");
  const gameRuntime = createGameRuntime(0);
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
    rainDensity: rendererRuntime.environment.snapshot().rainDensity,
    fogDensity: rendererRuntime.environment.snapshot().fogDensity,
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
  setLoadingPhase(0.78, "LINKING COMBATANTS");

  type ApplicationPhase = "loading" | "title" | "playing";
  let applicationPhase: ApplicationPhase = "loading";
  let lastTime = performance.now();
  let simulationEnabled = false;
  let graphicsContextState: "ready" | "lost" | "restoring" = "ready";
  let audioEnabled = true;

  function dispatchPrimaryAbility(target: { x: number; z: number }): string {
    if (applicationPhase !== "playing" || gameState.stage.phase !== "playing") return "ignored";
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

  function consumeImmediateEvents(): void {
    presentationRuntime.consumeEvents(gameRuntime.drainEvents());
  }

  function dispatchUltimate(): string {
    if (applicationPhase !== "playing" || gameState.stage.phase !== "playing") return "ignored";
    const active = gameState.player.activeAbility;
    const { result } = active?.phase === "target-selection"
      ? gameRuntime.dispatch({ type: "cancel-active-ability" })
      : gameRuntime.dispatch({ type: "activate-ability", slot: "ultimate" });
    if (result !== "ignored") consumeImmediateEvents();
    return result;
  }

  function dispatchAbilityTarget(target: { x: number; z: number }): string {
    if (gameState.player.activeAbility?.phase !== "target-selection") {
      return dispatchPrimaryAbility(target);
    }
    const { result } = gameRuntime.dispatch({ type: "submit-ability-target", target });
    if (result !== "ignored") consumeImmediateEvents();
    return result;
  }

  function cancelAbility(): string {
    if (applicationPhase !== "playing") return "ignored";
    const { result } = gameRuntime.dispatch({ type: "cancel-active-ability" });
    if (result !== "ignored") consumeImmediateEvents();
    return result;
  }

  function setApplicationPhase(nextPhase: ApplicationPhase): void {
    applicationPhase = nextPhase;
    shell.gameShell.dataset.applicationPhase = nextPhase;
    const titleVisible = nextPhase === "title";
    shell.titleScreen.classList.toggle("visible", titleVisible);
    shell.titleScreen.setAttribute("aria-hidden", String(!titleVisible));
    presentationRuntime.clearPointer();
  }

  function startGame(unlockAudio: boolean): void {
    if (applicationPhase === "playing") return;
    if (unlockAudio) {
      void rendererRuntime.audio.resume().catch(() => {
        // A later trusted gesture can retry audio without blocking combat.
      });
    }
    gameRuntime.resetRun();
    gameRuntime.drainEvents();
    presentationRuntime.resetStage();
    setApplicationPhase("playing");
    simulationEnabled = true;
    lastTime = performance.now();
  }

  function resetPresentationStage(): void {
    presentationRuntime.resetStage();
    simulationEnabled = applicationPhase === "playing";
  }

  function updateFrame(dt: number): void {
    if (simulationEnabled && gameState.stage.phase === "playing") {
      presentationRuntime.consumeEvents(gameRuntime.advance(dt * 1000, tuning.enemyMotion));
    }
    const lifecycleAction = presentationRuntime.update(dt);
    if (applicationPhase !== "playing") return;
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
          phase: applicationPhase === "playing" ? game.phase : applicationPhase,
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
      applicationPhase,
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
      dashTo: (x, z) => dispatchPrimaryAbility({ x, z }),
      setVectorFocusEnergy(value) {
        return setVectorFocusEnergy(gameState, value);
      },
      activateUltimate: dispatchUltimate,
      addAbilityTarget(x, z) {
        const { result } = gameRuntime.dispatch({ type: "submit-ability-target", target: { x, z } });
        if (result !== "ignored") consumeImmediateEvents();
        return result;
      },
      cancelActiveAbility: cancelAbility,
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
    startSurface: shell.titleScreen,
    isGameStarted: () => applicationPhase === "playing",
    onStartRequest: () => startGame(true),
    onPointerMove: ({ clientX, clientY }) => presentationRuntime.updatePointer(clientX, clientY),
    onPrimaryPointer: ({ clientX, clientY }) => {
      void rendererRuntime.audio.resume().catch(() => {
        // A later trusted gesture may retry audio without interrupting gameplay.
      });
      if (gameState.stage.phase === "dead") {
        gameRuntime.dispatch({ type: "restart-stage" });
        resetPresentationStage();
        return;
      }
      presentationRuntime.updatePointer(clientX, clientY);
      const target = presentationRuntime.getPrimaryTarget();
      if (target) dispatchAbilityTarget(target);
    },
    onCancelAbility: () => { cancelAbility(); },
    onUltimate: () => { dispatchUltimate(); },
    onPointerLeave: presentationRuntime.clearPointer,
    onRestart: () => {
      if (applicationPhase === "playing") {
        gameRuntime.dispatch({ type: "restart-stage" });
        resetPresentationStage();
      }
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
    simulationEnabled = applicationPhase === "playing" && gameState.stage.phase === "playing";
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
  if (shouldAutostart) startGame(false);
  else setApplicationPhase("title");
  resize();
  renderScene();
  setLoadingPhase(0.96, "FINALIZING FIRST FRAME");
  requestAnimationFrame(() => {
    setLoadingPhase(1, "COMBAT SPACE READY");
    requestAnimationFrame(() => shell.loading.classList.add("ready"));
  });
  if (!deterministicCapture) requestAnimationFrame(animate);
}
