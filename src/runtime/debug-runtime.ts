import type { DiagnosticsSnapshot } from "../diagnostics";

export interface RuntimeTuning {
  exposure: number;
  bloom: number;
  cameraFov: number;
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
    panel.add(options.tuning, "exposure", 0.5, 1.4, 0.01).onChange(options.controls.setExposure);
    panel.add(options.tuning, "bloom", 0, 1.8, 0.01).onChange(options.controls.setBloom);
    panel.add(options.tuning, "cameraFov", 26, 38, 0.1).onChange(options.controls.setCameraFov);
    panel.add(options.tuning, "enemyMotion");
    panel.add(options.tuning, "dashPreview");
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
