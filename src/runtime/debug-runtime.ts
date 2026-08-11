import type { DiagnosticsSnapshot } from "../diagnostics";

export interface RuntimeTuning {
  exposure: number;
  bloom: number;
  cameraFov: number;
  vfxDensity: number;
  rainDensity: number;
  fogDensity: number;
  enemyMotion: boolean;
  dashPreview: boolean;
}

export interface SlashValidationApi {
  setStage(stageIndex: number): void;
  setStressScenario(enemyCount?: number): void;
  setArmorScenario(): void;
  setUltimateScenario(): void;
  setEntityScenario(): void;
  dashTo(x: number, z: number): string;
  beginChargeTo(x: number, z: number): string;
  updateChargeTo(x: number, z: number): string;
  releaseChargeTo(x: number, z: number): string;
  startUltimate(): string;
  addUltimatePoint(x: number, z: number): string;
  cancelUltimate(): string;
  setEnemyMotion(enabled: boolean): void;
  loseGraphicsContext(): void;
  restoreGraphicsContext(): void;
}

declare global {
  interface Window {
    render_game_to_text: () => string;
    advanceTime: (milliseconds: number) => void;
    get_slash_diagnostics: () => DiagnosticsSnapshot;
    reset_slash_diagnostics: () => void;
    slash_validation?: SlashValidationApi;
  }
}

export interface DebugRuntimeOptions {
  readonly enabled: boolean;
  readonly validationMode: boolean;
  readonly tuning: RuntimeTuning;
  readonly controls: {
    setExposure(value: number): void;
    setBloom(value: number): void;
    setCameraFov(value: number): void;
    setVfxDensity(value: number): void;
    setRainDensity(value: number): void;
    setFogDensity(value: number): void;
  };
  readonly inspect: () => {
    gameplay: { phase: string; action: string; enemies: number; invulnerable: boolean };
    content: { level: string; ability: string; enemyDefinition: string };
    visual: { animation: string; activeVfx: number; drawCalls: number };
  };
  readonly renderGameToText: () => string;
  readonly diagnostics: {
    snapshot(): DiagnosticsSnapshot;
    reset(): void;
  };
  readonly validation: SlashValidationApi;
  readonly advanceTime: (milliseconds: number) => void;
}

export interface DebugRuntime {
  togglePanel(): void;
  dispose(): void;
}

export async function createDebugRuntime(options: DebugRuntimeOptions): Promise<DebugRuntime> {
  let panel: import("lil-gui").default | null = null;
  let panelVisible = false;
  let panelRefreshFrame: number | null = null;
  const liveControllers: Array<{ updateDisplay(): unknown }> = [];
  let liveSnapshot = options.inspect();

  function stopPanelRefresh(): void {
    if (panelRefreshFrame === null) return;
    cancelAnimationFrame(panelRefreshFrame);
    panelRefreshFrame = null;
  }

  function refreshVisiblePanel(): void {
    if (!panelVisible) {
      panelRefreshFrame = null;
      return;
    }
    liveSnapshot = options.inspect();
    for (const controller of liveControllers) controller.updateDisplay();
    panelRefreshFrame = requestAnimationFrame(refreshVisiblePanel);
  }

  if (options.enabled) {
    const { default: GuiConstructor } = await import("lil-gui");
    panel = new GuiConstructor({ title: "PROJECT SLASH / TUNING" });
    const visual = panel.addFolder("VISUAL");
    visual.add(options.tuning, "exposure", 0.5, 1.4, 0.01).onChange(options.controls.setExposure);
    visual.add(options.tuning, "bloom", 0, 1.8, 0.01).onChange(options.controls.setBloom);
    visual.add(options.tuning, "cameraFov", 26, 38, 0.1).onChange(options.controls.setCameraFov);
    visual.add(options.tuning, "vfxDensity", 0, 1, 0.05).onChange(options.controls.setVfxDensity);
    visual.add(options.tuning, "rainDensity", 0, 1, 0.05).onChange(options.controls.setRainDensity);
    visual.add(options.tuning, "fogDensity", 0, 0.02, 0.0001).onChange(options.controls.setFogDensity);
    visual.add(options.tuning, "dashPreview");
    const live = {
      get phase() { return liveSnapshot.gameplay.phase; },
      get action() { return liveSnapshot.gameplay.action; },
      get enemies() { return liveSnapshot.gameplay.enemies; },
      get invulnerable() { return liveSnapshot.gameplay.invulnerable; },
      get animation() { return liveSnapshot.visual.animation; },
      get activeVfx() { return liveSnapshot.visual.activeVfx; },
      get drawCalls() { return liveSnapshot.visual.drawCalls; },
      get level() { return liveSnapshot.content.level; },
      get ability() { return liveSnapshot.content.ability; },
      get enemyDefinition() { return liveSnapshot.content.enemyDefinition; },
    };
    const gameplay = panel.addFolder("GAMEPLAY");
    liveControllers.push(gameplay.add(live, "phase").disable());
    liveControllers.push(gameplay.add(live, "action").disable());
    liveControllers.push(gameplay.add(live, "enemies").disable());
    liveControllers.push(gameplay.add(live, "invulnerable").disable());
    gameplay.add(options.tuning, "enemyMotion");
    const content = panel.addFolder("CONTENT");
    liveControllers.push(content.add(live, "level").disable());
    liveControllers.push(content.add(live, "ability").disable());
    liveControllers.push(content.add(live, "enemyDefinition").disable());
    content.add({ stage1: () => options.validation.setStage(0) }, "stage1");
    content.add({ stage2: () => options.validation.setStage(1) }, "stage2");
    content.add({ stage3: () => options.validation.setStage(2) }, "stage3");
    content.add({ stress20: () => options.validation.setStressScenario(20) }, "stress20");
    liveControllers.push(visual.add(live, "animation").disable());
    liveControllers.push(visual.add(live, "activeVfx").disable());
    liveControllers.push(visual.add(live, "drawCalls").disable());
    panel.hide();
  }

  window.render_game_to_text = options.renderGameToText;
  window.get_slash_diagnostics = options.diagnostics.snapshot;
  window.reset_slash_diagnostics = options.diagnostics.reset;
  window.advanceTime = options.advanceTime;
  if (options.validationMode) window.slash_validation = options.validation;

  return {
    togglePanel() {
      if (!panel) return;
      panelVisible = !panelVisible;
      if (panelVisible) {
        panel.show();
        refreshVisiblePanel();
      } else {
        panel.hide();
        stopPanelRefresh();
      }
    },
    dispose() {
      panelVisible = false;
      stopPanelRefresh();
      panel?.destroy();
      delete window.slash_validation;
    },
  };
}
