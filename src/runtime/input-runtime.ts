export interface PointerCoordinates {
  readonly clientX: number;
  readonly clientY: number;
}

export interface InputRuntimeOptions {
  readonly canvas: HTMLCanvasElement;
  readonly startSurface: HTMLElement;
  readonly isGameStarted: () => boolean;
  readonly onStartRequest: () => void;
  readonly onPointerMove: (coordinates: PointerCoordinates) => void;
  readonly onPrimaryPointer: (coordinates: PointerCoordinates) => void;
  readonly onCancelAbility: () => void;
  readonly onUltimate: () => void;
  readonly onPointerLeave: () => void;
  readonly onRestart: () => void;
  readonly onToggleAudio: () => void;
  readonly onToggleDebug: () => void;
  readonly onResize: () => void;
}

export interface InputRuntime {
  dispose(): void;
}

export function createInputRuntime(options: InputRuntimeOptions): InputRuntime {
  const onPointerMove = (event: PointerEvent) => {
    if (!options.isGameStarted()) return;
    options.onPointerMove({ clientX: event.clientX, clientY: event.clientY });
  };
  const onPointerDown = (event: PointerEvent) => {
    if (!options.isGameStarted()) return;
    if (event.button === 2) {
      options.onCancelAbility();
      return;
    }
    options.onPrimaryPointer({ clientX: event.clientX, clientY: event.clientY });
  };
  const onStartPointer = () => {
    if (!options.isGameStarted()) options.onStartRequest();
  };
  const onContextMenu = (event: MouseEvent) => event.preventDefault();
  const onKeyDown = async (event: KeyboardEvent) => {
    const key = event.key.toLowerCase();
    if (!options.isGameStarted() && (event.code === "Space" || event.key === "Enter")) {
      event.preventDefault();
      options.onStartRequest();
      return;
    }
    if (event.code === "Space") {
      event.preventDefault();
      options.onUltimate();
    } else if (event.key === "Escape") {
      options.onCancelAbility();
    } else if (key === "f") {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await document.documentElement.requestFullscreen();
      } catch {
        // Fullscreen can be denied by browser policy; input remains active.
      } finally {
        options.onResize();
      }
    } else if (event.key === "`") {
      options.onToggleDebug();
    } else if (key === "m") {
      options.onToggleAudio();
    } else if (key === "r") {
      options.onRestart();
    }
  };

  options.canvas.addEventListener("pointermove", onPointerMove);
  options.canvas.addEventListener("pointerdown", onPointerDown);
  options.canvas.addEventListener("contextmenu", onContextMenu);
  options.canvas.addEventListener("pointerleave", options.onPointerLeave);
  options.startSurface.addEventListener("pointerdown", onStartPointer);
  window.addEventListener("keydown", onKeyDown);

  return {
    dispose() {
      options.canvas.removeEventListener("pointermove", onPointerMove);
      options.canvas.removeEventListener("pointerdown", onPointerDown);
      options.canvas.removeEventListener("contextmenu", onContextMenu);
      options.canvas.removeEventListener("pointerleave", options.onPointerLeave);
      options.startSurface.removeEventListener("pointerdown", onStartPointer);
      window.removeEventListener("keydown", onKeyDown);
    },
  };
}
