import { describe, expect, test } from "vitest";
import { evaluatePerformanceGates } from "../validation/tools/performance-gates.mjs";

const viewport = { width: 1920, height: 1080 };
const baseline = {
  capturedAt: "2026-08-11T00:00:00.000Z",
  viewport,
  durationMs: 30_000,
  frame: {
    sampleCount: 1_800,
    averageFps: 59.98,
    averageMs: 16.67,
    p95Ms: 18.6,
    p99Ms: 18.7,
    worstMs: 18.7,
  },
};

function evaluate(p95Ms: number, p99Ms = 18.7, cadenceBaseline: typeof baseline | null = baseline) {
  return evaluatePerformanceGates({
    frame: {
      sampleCount: 3_600,
      averageFps: 59.95,
      averageMs: 16.68,
      p95Ms,
      p99Ms,
      worstMs: 50,
    },
    state: { enemyCount: 20, kills: 8 },
    browserIssues: [],
    viewport,
    durationMs: 60_000,
    cadenceBaseline,
  });
}

describe("performance cadence gates", () => {
  test("uses a same-machine blank rAF baseline without hiding raw cadence", () => {
    const result = evaluate(18.6);
    expect(result.passed).toBe(true);
    expect(result.cadenceCalibration).toMatchObject({
      baselineHealthy: true,
      p95AddedOverBaselineMs: 0,
      p95AddedOverBaselineMsMax: 0.5,
    });
  });

  test("keeps the legacy absolute gate when no baseline is supplied", () => {
    expect(evaluate(18.6, 18.7, null).gates.p95).toBe(false);
  });

  test("rejects application jitter and missed-refresh tails even with a healthy baseline", () => {
    expect(evaluate(19.2).gates.p95).toBe(false);
    expect(evaluate(18.6, 25).gates.p99).toBe(false);
  });
});
