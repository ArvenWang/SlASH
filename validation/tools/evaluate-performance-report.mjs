import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { evaluatePerformanceGates } from "./performance-gates.mjs";

const gameReportPath = path.resolve(process.argv[2]);
const baselineReportPath = path.resolve(process.argv[3]);
const outputPath = path.resolve(
  process.argv[4] ?? path.join(path.dirname(gameReportPath), "calibrated-report.json"),
);
const gameReport = JSON.parse(await readFile(gameReportPath, "utf8"));
const cadenceBaseline = JSON.parse(await readFile(baselineReportPath, "utf8"));
const evaluation = evaluatePerformanceGates({
  frame: gameReport.diagnostics.frame,
  state: gameReport.state,
  browserIssues: gameReport.browserIssues,
  viewport: gameReport.viewport,
  durationMs: gameReport.durationMs,
  cadenceBaseline,
});
const report = {
  ...gameReport,
  evaluatedAt: new Date().toISOString(),
  rawReportPassed: gameReport.passed,
  frameCadenceMethod: "Visible Chrome raw rAF intervals, calibrated against a same-machine visible blank rAF capture; absolute P99 and worst-frame gates remain enforced.",
  ...evaluation,
};
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  outputPath,
  passed: report.passed,
  frame: report.diagnostics.frame,
  cadenceCalibration: report.cadenceCalibration,
  gates: report.gates,
}, null, 2));
if (!report.passed) process.exitCode = 1;
