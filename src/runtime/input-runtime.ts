export interface PointerCoordinates {
  readonly clientX: number;
  readonly clientY: number;
}

export interface InputRuntimeOptions {
  readonly canvas: HTMLCanvasElement;
  readonly onPointerMove: (coordinates: PointerCoordinates) => void;
  readonly onPrimaryPointerDown: (coordinates: PointerCoordinates) => void;
  readonly onPrimaryPointerUp: (coordinates: PointerCoordinates) => void;
  readonly onPrimaryPointerCancel: () => void;
  readonly onSecondaryPointer: (coordinates: PointerCoordinates) => void;
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
    options.onPointerMove({ clientX: event.clientX, clientY: event.clientY });
  };
  const onPointerDown = (event: PointerEvent) => {
    if (event.button === 2) {
      options.onSecondaryPointer({ clientX: event.clientX, clientY: event.clientY });
      return;
    }
    if (event.button !== 0) return;
    options.canvas.setPointerCapture(event.pointerId);
    options.onPrimaryPointerDown({ clientX: event.clientX, clientY: event.clientY });
  };
  const onPointerUp = (event: PointerEvent) => {
    if (event.button !== 0) return;
    options.onPrimaryPointerUp({ clientX: event.clientX, clientY: event.clientY });
    if (options.canvas.hasPointerCapture(event.pointerId)) options.canvas.releasePointerCapture(event.pointerId);
  };
  const onContextMenu = (event: MouseEvent) => event.preventDefault();
  const onKeyDown = async (event: KeyboardEvent) => {
    const key = event.key.toLowerCase();
    if (key === "f") {
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
    } else if (event.code === "Space") {
      event.preventDefault();
      options.onUltimate();
    } else if (event.key === "Escape") {
      options.onPrimaryPointerCancel();
    }
  };

  options.canvas.addEventListener("pointermove", onPointerMove);
  options.canvas.addEventListener("pointerdown", onPointerDown);
  options.canvas.addEventListener("pointerup", onPointerUp);
  options.canvas.addEventListener("pointercancel", options.onPrimaryPointerCancel);
  options.canvas.addEventListener("contextmenu", onContextMenu);
  options.canvas.addEventListener("pointerleave", options.onPointerLeave);
  window.addEventListener("keydown", onKeyDown);

  return {
    dispose() {
      options.canvas.removeEventListener("pointermove", onPointerMove);
      options.canvas.removeEventListener("pointerdown", onPointerDown);
      options.canvas.removeEventListener("pointerup", onPointerUp);
      options.canvas.removeEventListener("pointercancel", options.onPrimaryPointerCancel);
      options.canvas.removeEventListener("contextmenu", onContextMenu);
      options.canvas.removeEventListener("pointerleave", options.onPointerLeave);
      window.removeEventListener("keydown", onKeyDown);
    },
  };
}
