import type { GameState } from "../game/domain/types";
import {
  RUN_SAVE_STORAGE_KEY,
  RunSaveError,
  createRunSave,
  inspectRunSave,
  restoreRunSave,
  type RunSaveSummary,
} from "../game/save/run-save";

export interface RunSaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type RunSaveStatus =
  | { readonly kind: "empty" }
  | { readonly kind: "ready"; readonly summary: RunSaveSummary }
  | { readonly kind: "error"; readonly message: string };

export interface RunSaveRuntime {
  status(): RunSaveStatus;
  write(state: GameState): { readonly ok: true } | { readonly ok: false; readonly message: string };
  restore(): { readonly ok: true; readonly state: GameState } | { readonly ok: false; readonly message: string };
}

export function createRunSaveRuntime(storage: RunSaveStorage): RunSaveRuntime {
  return {
    status() {
      const read = readRaw(storage);
      if (!read.ok) return { kind: "error", message: read.message };
      if (read.value === null) return { kind: "empty" };
      try {
        return { kind: "ready", summary: inspectRunSave(read.value) };
      } catch (error) {
        return { kind: "error", message: saveErrorMessage(error) };
      }
    },
    write(state) {
      try {
        storage.setItem(RUN_SAVE_STORAGE_KEY, createRunSave(state));
        return { ok: true };
      } catch (error) {
        return { ok: false, message: saveErrorMessage(error) };
      }
    },
    restore() {
      const read = readRaw(storage);
      if (!read.ok) return read;
      if (read.value === null) return { ok: false, message: "没有可继续的本地 Run 存档。" };
      try {
        return { ok: true, state: restoreRunSave(read.value) };
      } catch (error) {
        return { ok: false, message: saveErrorMessage(error) };
      }
    },
  };
}

function readRaw(storage: RunSaveStorage):
  | { readonly ok: true; readonly value: string | null }
  | { readonly ok: false; readonly message: string } {
  try {
    return { ok: true, value: storage.getItem(RUN_SAVE_STORAGE_KEY) };
  } catch (error) {
    return { ok: false, message: `无法读取本地存档：${error instanceof Error ? error.message : String(error)}` };
  }
}

function saveErrorMessage(error: unknown): string {
  if (error instanceof RunSaveError) return error.message;
  return `本地存档操作失败：${error instanceof Error ? error.message : String(error)}`;
}
