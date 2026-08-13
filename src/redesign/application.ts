import "./styles.css";
import { advance, createGame, dispatch, drainEvents, renderGameToText } from "./game";
import type { GameCommand, GameState } from "./state";
import { createPresentationRuntime } from "./presentation/runtime";
import { backupInvalidSave, clearSave, loadGame, saveGame, type SaveLoadResult, type StoragePort } from "./persistence";
import { createUiRuntime } from "./ui";

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing ${selector}`);
  return element;
}

export function bootstrapRedesignApplication(): void {
  const canvas = required<HTMLCanvasElement>("#game-canvas");
  const uiRoot = required<HTMLElement>("#campaign-ui");
  const reticle = required<HTMLElement>("#reticle");
  const health = required<HTMLElement>("#health-pips");
  const stageLabel = required<HTMLElement>("#stage-label");
  const energyModule = required<HTMLElement>("#energy-module");
  const energyLabel = required<HTMLElement>("#energy-label");
  const energyFill = required<HTMLElement>("#energy-fill");
  const bossModule = required<HTMLElement>("#boss-module");
  const bossLabel = required<HTMLElement>("#boss-label");
  const bossFill = required<HTMLElement>("#boss-fill");
  const touchUltimate = required<HTMLButtonElement>("#touch-ultimate");
  const touchCancel = required<HTMLButtonElement>("#touch-cancel");
  const storage: StoragePort = {
    getItem: (key) => window.localStorage.getItem(key),
    setItem: (key, value) => window.localStorage.setItem(key, value),
    removeItem: (key) => window.localStorage.removeItem(key),
  };
  const parameters = new URLSearchParams(window.location.search);
  const seedParameter = Number(parameters.get("seed"));
  let state = createGame(Number.isSafeInteger(seedParameter) ? seedParameter : undefined);
  let continueState: SaveLoadResult = loadGame(storage);
  const presentation = createPresentationRuntime(canvas, state);
  let simulationEnabled = true;
  let pointerDown = false;
  const movementKeys = new Set<string>();
  let lastTime = performance.now();
  let lastSavedPhase = state.phase;

  function replaceState(next: GameState): void {
    state = structuredClone(next);
    presentation.resize(state);
    presentation.update(0, state);
    lastSavedPhase = state.phase;
  }

  function consumeEvents(): void {
    const events = drainEvents(state);
    presentation.consume(events, state);
  }

  function dispatchCommand(command: GameCommand): void {
    const previousPhase = state.phase;
    if (command.type === "start-run" && !continueState.ok && continueState.raw !== null) {
      backupInvalidSave(storage, continueState.raw);
      continueState = loadGame(storage);
    }
    const result = dispatch(state, command);
    consumeEvents();
    if (result === "returned-to-title") {
      clearSave(storage);
      continueState = loadGame(storage);
    }
    if (result !== "ignored") {
      if (state.phase === "combat" && previousPhase !== "combat") presentation.resize(state);
      maybeSave(previousPhase);
    }
    ui.update(state, continueState);
  }

  function maybeSave(previousPhase: GameState["phase"]): void {
    const becameSafe = (state.phase === "combat" && previousPhase !== "combat") || state.phase === "reward";
    if (!becameSafe || state.phase === lastSavedPhase) return;
    try {
      saveGame(storage, state);
      continueState = loadGame(storage);
      lastSavedPhase = state.phase;
    } catch (error) {
      console.warn("Could not save V2.1 run.", error);
    }
  }

  const ui = createUiRuntime({
    root: uiRoot,
    dispatch: dispatchCommand,
    onContinue() {
      const loaded = loadGame(storage);
      if (loaded.ok) {
        replaceState(loaded.state);
        continueState = loaded;
        presentation.update(0, state);
        ui.update(state, continueState);
        return;
      }
      if (loaded.raw !== null) backupInvalidSave(storage, loaded.raw);
      continueState = loadGame(storage);
      ui.update(state, continueState);
    },
    onPauseChange(paused) {
      simulationEnabled = !paused;
    },
  });

  function pointerTarget(clientX: number, clientY: number): { x: number; z: number } | null {
    reticle.style.left = `${clientX}px`;
    reticle.style.top = `${clientY}px`;
    return presentation.pointerToWorld(clientX, clientY);
  }

  const onPointerMove = (event: PointerEvent): void => {
    const target = pointerTarget(event.clientX, event.clientY);
    if (!target) return;
    dispatch(state, { type: "aim", target });
    if (pointerDown && state.player.action === "charging") dispatch(state, { type: "aim", target });
  };
  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || state.phase !== "combat") return;
    const target = pointerTarget(event.clientX, event.clientY);
    if (!target) return;
    if (state.player.action === "ultimate-planning") {
      dispatchCommand({ type: "add-ultimate-point", target });
      return;
    }
    pointerDown = true;
    canvas.setPointerCapture(event.pointerId);
    dispatchCommand({ type: "begin-primary", target });
  };
  const onPointerUp = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    const target = pointerTarget(event.clientX, event.clientY);
    pointerDown = false;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (target) dispatchCommand({ type: "release-primary", target });
  };
  const onPointerCancel = (): void => {
    pointerDown = false;
    dispatchCommand({ type: "cancel-primary" });
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight"].includes(event.code)) {
      event.preventDefault();
      movementKeys.add(event.code);
      dispatchMovement();
    } else if (event.code === "Space") {
      event.preventDefault();
      if (state.player.action === "ultimate-planning") dispatchCommand({ type: "cancel-ultimate" });
      else dispatchCommand({ type: "start-ultimate" });
    } else if (event.key === "Escape") {
      event.preventDefault();
      if (state.player.action === "ultimate-planning") dispatchCommand({ type: "cancel-ultimate" });
      else ui.setPaused(simulationEnabled);
    } else if (event.key.toLowerCase() === "f") {
      void (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen())
        .finally(() => presentation.resize(state));
    }
  };
  const onKeyUp = (event: KeyboardEvent): void => {
    if (!["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight"].includes(event.code)) return;
    event.preventDefault();
    movementKeys.delete(event.code);
    dispatchMovement();
  };
  const clearMovement = (): void => {
    movementKeys.clear();
    dispatch(state, { type: "set-movement", direction: { x: 0, z: 0 } });
  };
  const dispatchMovement = (): void => {
    const forward = (movementKeys.has("KeyW") || movementKeys.has("ArrowUp") ? 1 : 0)
      - (movementKeys.has("KeyS") || movementKeys.has("ArrowDown") ? 1 : 0);
    const right = (movementKeys.has("KeyD") || movementKeys.has("ArrowRight") ? 1 : 0)
      - (movementKeys.has("KeyA") || movementKeys.has("ArrowLeft") ? 1 : 0);
    const direction = {
      x: forward * -0.565 + right * 0.825,
      z: forward * -0.825 + right * -0.565,
    };
    dispatch(state, { type: "set-movement", direction });
  };
  const onContextMenu = (event: MouseEvent): void => event.preventDefault();
  const onResize = (): void => presentation.resize(state);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerCancel);
  canvas.addEventListener("contextmenu", onContextMenu);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", clearMovement);
  window.addEventListener("resize", onResize);
  touchUltimate.addEventListener("click", () => dispatchCommand({ type: "start-ultimate" }));
  touchCancel.addEventListener("click", () => dispatchCommand({ type: "cancel-ultimate" }));

  function updateHud(): void {
    health.innerHTML = Array.from({ length: state.player.maximumHp }, (_, index) => (
      `<i class="${index < state.player.hp ? "alive" : ""}"></i>`
    )).join("");
    const encounter = state.run.encounterIndex;
    stageLabel.textContent = state.phase === "combat"
      ? `第 ${Math.floor(encounter / 3) + 1} 章 · ${encounter % 3 + 1} / 3`
      : "";
    const energy = Math.round(state.player.ultimateEnergy);
    energyLabel.textContent = energy >= 100 ? "空格发动" : `能量 ${String(energy).padStart(3, "0")}`;
    energyFill.style.transform = `scaleX(${Math.min(1, energy / 100)})`;
    energyModule.classList.toggle("ready", energy >= 100);
    const boss = state.boss;
    bossModule.classList.toggle("visible", state.phase === "combat" && boss !== null && boss.actionPhase !== "defeated");
    if (boss) {
      bossLabel.textContent = bossName(boss.archetype);
      bossFill.style.transform = `scaleX(${boss.currentHp / boss.maximumHp})`;
    }
    reticle.classList.toggle("charged", state.player.action === "charging" && state.player.actionElapsedMs >= 650);
    touchUltimate.classList.toggle("visible", state.phase === "combat" && state.player.ultimateEnergy >= 100 && state.player.action === "ready");
    touchCancel.classList.toggle("visible", state.player.action === "ultimate-planning");
  }

  function frame(now: number): void {
    const deltaSeconds = Math.min(0.1, Math.max(0, (now - lastTime) / 1_000));
    lastTime = now;
    const previousPhase = state.phase;
    if (simulationEnabled && state.phase === "combat") {
      const events = advance(state, deltaSeconds * 1_000);
      presentation.consume(events, state);
      if (state.phase !== previousPhase) {
        maybeSave(previousPhase);
        ui.update(state, continueState);
      }
    }
    presentation.update(deltaSeconds, state);
    presentation.render();
    updateHud();
    ui.update(state, continueState);
    requestAnimationFrame(frame);
  }

  ui.update(state, continueState);
  updateHud();
  requestAnimationFrame(frame);

  const debugWindow = window as Window & {
    render_game_to_text?: () => string;
    advanceTime?: (milliseconds: number) => void;
    __slashV21?: {
      state: () => GameState;
      presentation: () => ReturnType<typeof presentation.snapshot>;
      dispatch: (command: GameCommand) => void;
    };
  };
  debugWindow.render_game_to_text = () => renderGameToText(state);
  debugWindow.advanceTime = (milliseconds: number) => {
    const steps = Math.max(0, Math.ceil(milliseconds / (1_000 / 120)));
    for (let index = 0; index < steps && state.phase === "combat"; index += 1) {
      const events = advance(state, 1_000 / 120);
      presentation.consume(events, state);
    }
    presentation.update(milliseconds / 1_000, state);
    updateHud();
    ui.update(state, continueState);
  };
  debugWindow.__slashV21 = {
    state: () => state,
    presentation: () => presentation.snapshot(),
    dispatch: dispatchCommand,
  };
}

function bossName(archetype: string): string {
  if (archetype === "prism-hound") return "棱镜猎犬";
  if (archetype === "cube-fortress") return "魔方堡垒";
  return "奇点王冠";
}
