function rounded(value) {
  return Math.round(value * 100) / 100;
}

export function evaluatePerformanceGates({
  frame,
  state,
  browserIssues,
  viewport,
  durationMs,
  cadenceBaseline = null,
}) {
  const is1080 = viewport.width === 1920 && viewport.height === 1080;
  const thresholds = is1080
    ? { averageFpsMin: 59, p95MsMax: 25, p99MsMax: 33.4, worstMsMax: 100 }
    : { averageFpsMin: 55, p95MsMax: 25, p99MsMax: 40, worstMsMax: 120 };
  let p95Passed = frame.p95Ms <= thresholds.p95MsMax;
  let cadenceCalibration = null;

  if (cadenceBaseline) {
    if (
      cadenceBaseline.viewport?.width !== viewport.width
      || cadenceBaseline.viewport?.height !== viewport.height
    ) {
      throw new Error("Performance cadence baseline viewport does not match the game report.");
    }
    const baselineFrame = cadenceBaseline.frame;
    const baselineDurationMs = Number(cadenceBaseline.durationMs ?? 0);
    const baselineHealthy = baselineFrame.sampleCount >= Math.floor((baselineDurationMs / 1000) * 50)
      && baselineFrame.averageFps >= 59
      && baselineFrame.p99Ms < 25;
    const p95AddedOverBaselineMs = rounded(frame.p95Ms - baselineFrame.p95Ms);
    cadenceCalibration = {
      method: "same-machine-visible-blank-rAF",
      baselineCapturedAt: cadenceBaseline.capturedAt,
      baselineFrame,
      baselineHealthy,
      p95AddedOverBaselineMs,
      p95AddedOverBaselineMsMax: 0.5,
      p95NoMissedRefreshMsMax: 25,
    };
    p95Passed = baselineHealthy
      && p95AddedOverBaselineMs <= cadenceCalibration.p95AddedOverBaselineMsMax
      && frame.p95Ms < cadenceCalibration.p95NoMissedRefreshMsMax;
  }

  const gates = {
    averageFps: frame.averageFps >= thresholds.averageFpsMin,
    p95: p95Passed,
    p99: frame.p99Ms <= thresholds.p99MsMax,
    worstFrame: frame.worstMs <= thresholds.worstMsMax,
    sampleDuration: frame.sampleCount >= Math.floor((durationMs / 1000) * 50),
    stressPopulation: state.enemyCount === 20 && state.kills >= 8,
    browserClean: browserIssues.length === 0,
  };

  return {
    thresholds,
    gates,
    cadenceCalibration,
    passed: Object.values(gates).every(Boolean),
  };
}
