export interface PointerCoordinates {
  readonly clientX: number;
  readonly clientY: number;
}

export interface InputRuntimeOptions {
  readonly canvas: HTMLCanvasElement;
  readonly onPointerMove: (coordinates: PointerCoordinates) => void;
  readonly onPrimaryPointer: (coordinates: PointerCoordinates) => void;
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
    options.onPrimaryPointer({ clientX: event.clientX, clientY: event.clientY });
  };
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
    }
  };

  options.canvas.addEventListener("pointermove", onPointerMove);
  options.canvas.addEventListener("pointerdown", onPointerDown);
  options.canvas.addEventListener("pointerleave", options.onPointerLeave);
  window.addEventListener("keydown", onKeyDown);

  return {
    dispose() {
      options.canvas.removeEventListener("pointermove", onPointerMove);
      options.canvas.removeEventListener("pointerdown", onPointerDown);
      options.canvas.removeEventListener("pointerleave", options.onPointerLeave);
      window.removeEventListener("keydown", onKeyDown);
    },
  };
}
