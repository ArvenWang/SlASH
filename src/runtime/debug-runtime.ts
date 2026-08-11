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
  dashTo(x: number, z: number): string;
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
      get phase() { return options.inspect().gameplay.phase; },
      get action() { return options.inspect().gameplay.action; },
      get enemies() { return options.inspect().gameplay.enemies; },
      get invulnerable() { return options.inspect().gameplay.invulnerable; },
      get animation() { return options.inspect().visual.animation; },
      get activeVfx() { return options.inspect().visual.activeVfx; },
      get drawCalls() { return options.inspect().visual.drawCalls; },
      get level() { return options.inspect().content.level; },
      get ability() { return options.inspect().content.ability; },
      get enemyDefinition() { return options.inspect().content.enemyDefinition; },
    };
    const gameplay = panel.addFolder("GAMEPLAY");
    gameplay.add(live, "phase").listen().disable();
    gameplay.add(live, "action").listen().disable();
    gameplay.add(live, "enemies").listen().disable();
    gameplay.add(live, "invulnerable").listen().disable();
    gameplay.add(options.tuning, "enemyMotion");
    const content = panel.addFolder("CONTENT");
    content.add(live, "level").listen().disable();
    content.add(live, "ability").listen().disable();
    content.add(live, "enemyDefinition").listen().disable();
    content.add({ stage1: () => options.validation.setStage(0) }, "stage1");
    content.add({ stage2: () => options.validation.setStage(1) }, "stage2");
    content.add({ stage3: () => options.validation.setStage(2) }, "stage3");
    content.add({ stress20: () => options.validation.setStressScenario(20) }, "stress20");
    visual.add(live, "animation").listen().disable();
    visual.add(live, "activeVfx").listen().disable();
    visual.add(live, "drawCalls").listen().disable();
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
      if (panelVisible) panel.show();
      else panel.hide();
    },
    dispose() {
      panel?.destroy();
      delete window.slash_validation;
    },
  };
}
