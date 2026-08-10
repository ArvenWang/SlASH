import * as THREE from "three";

interface InputSample {
  id: number;
  inputAtMs: number;
  logicAtMs: number | null;
  presentedAtMs: number | null;
}

export interface DiagnosticsSnapshot {
  frame: {
    sampleCount: number;
    averageFps: number;
    averageMs: number;
    p95Ms: number;
    p99Ms: number;
    worstMs: number;
  };
  renderer: {
    calls: number;
    triangles: number;
    points: number;
    lines: number;
    geometries: number;
    textures: number;
  };
  input: {
    sampleCount: number;
    latestInputToLogicMs: number | null;
    latestInputToPresentedMs: number | null;
    p95InputToLogicMs: number | null;
    p95InputToPresentedMs: number | null;
  };
}

function percentile(sorted: readonly number[], quantile: number) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * quantile) - 1));
  return sorted[index];
}

function rounded(value: number) {
  return Math.round(value * 100) / 100;
}

export function createDiagnostics(renderer: THREE.WebGLRenderer) {
  // Keep enough samples for the formal 60-second worst-case performance gate
  // while remaining a small bounded array (about two minutes at 60 Hz).
  const maximumFrameSamples = 7_200;
  const frameTimes: number[] = [];
  const inputSamples: InputSample[] = [];
  let nextInputId = 1;
  let waitingForPresentation: InputSample | null = null;

  function recordFrame(deltaMs: number) {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) return;
    frameTimes.push(deltaMs);
    if (frameTimes.length > maximumFrameSamples) frameTimes.shift();
  }

  function markInput() {
    const sample: InputSample = {
      id: nextInputId,
      inputAtMs: performance.now(),
      logicAtMs: null,
      presentedAtMs: null,
    };
    nextInputId += 1;
    inputSamples.push(sample);
    if (inputSamples.length > 100) inputSamples.shift();
    performance.mark("slash-input");
    return sample.id;
  }

  function markDashLogic(inputId: number) {
    const sample = [...inputSamples].reverse().find((candidate) => candidate.id === inputId);
    if (!sample) return;
    sample.logicAtMs = performance.now();
    waitingForPresentation = sample;
    performance.mark("slash-dash-logic");
    performance.measure("slash-input-to-logic", "slash-input", "slash-dash-logic");
  }

  function markPresented() {
    if (!waitingForPresentation) return;
    waitingForPresentation.presentedAtMs = performance.now();
    performance.mark("slash-dash-presented");
    performance.measure("slash-input-to-presented", "slash-input", "slash-dash-presented");
    waitingForPresentation = null;
  }

  function snapshot(): DiagnosticsSnapshot {
    const sortedFrames = [...frameTimes].sort((a, b) => a - b);
    const averageMs = frameTimes.length > 0
      ? frameTimes.reduce((sum, value) => sum + value, 0) / frameTimes.length
      : 0;
    const presentedDurations = inputSamples
      .filter((sample) => sample.presentedAtMs !== null)
      .map((sample) => (sample.presentedAtMs as number) - sample.inputAtMs)
      .sort((a, b) => a - b);
    const logicDurations = inputSamples
      .filter((sample) => sample.logicAtMs !== null)
      .map((sample) => (sample.logicAtMs as number) - sample.inputAtMs)
      .sort((a, b) => a - b);
    const latest = inputSamples.at(-1) ?? null;
    return {
      frame: {
        sampleCount: frameTimes.length,
        averageFps: averageMs > 0 ? rounded(1000 / averageMs) : 0,
        averageMs: rounded(averageMs),
        p95Ms: rounded(percentile(sortedFrames, 0.95)),
        p99Ms: rounded(percentile(sortedFrames, 0.99)),
        worstMs: rounded(sortedFrames.at(-1) ?? 0),
      },
      renderer: {
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        points: renderer.info.render.points,
        lines: renderer.info.render.lines,
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
      },
      input: {
        sampleCount: presentedDurations.length,
        latestInputToLogicMs: latest?.logicAtMs === null || latest === null
          ? null
          : rounded(latest.logicAtMs - latest.inputAtMs),
        latestInputToPresentedMs: latest?.presentedAtMs === null || latest === null
          ? null
          : rounded(latest.presentedAtMs - latest.inputAtMs),
        p95InputToLogicMs: logicDurations.length > 0
          ? rounded(percentile(logicDurations, 0.95))
          : null,
        p95InputToPresentedMs: presentedDurations.length > 0
          ? rounded(percentile(presentedDurations, 0.95))
          : null,
      },
    };
  }

  function reset() {
    frameTimes.length = 0;
    inputSamples.length = 0;
    waitingForPresentation = null;
    performance.clearMarks("slash-input");
    performance.clearMarks("slash-dash-logic");
    performance.clearMarks("slash-dash-presented");
    performance.clearMeasures("slash-input-to-logic");
    performance.clearMeasures("slash-input-to-presented");
  }

  return { recordFrame, markInput, markDashLogic, markPresented, snapshot, reset };
}
