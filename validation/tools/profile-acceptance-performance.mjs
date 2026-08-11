import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { evaluatePerformanceGates } from "./performance-gates.mjs";

const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const rawBaseUrl = process.argv[2] ?? "http://127.0.0.1:4175/";
const outputDirectory = path.resolve(process.argv[3] ?? "validation/performance/high-1080p");
const width = Number(process.argv[4] ?? 1920);
const height = Number(process.argv[5] ?? 1080);
const durationMs = Number(process.argv[6] ?? 60_000);
const cadenceBaselinePath = process.argv[7] ? path.resolve(process.argv[7]) : null;
const cadenceBaseline = cadenceBaselinePath
  ? JSON.parse(await readFile(cadenceBaselinePath, "utf8"))
  : null;
await mkdir(outputDirectory, { recursive: true });

const url = new URL(rawBaseUrl);
url.searchParams.set("validation", "1");
const browserIssues = [];
const browser = await chromium.launch({
  executablePath: chromePath,
  headless: false,
  args: [
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
    "--enable-precise-memory-info",
    `--window-size=${width},${height}`,
  ],
});

let report;
try {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") browserIssues.push({ type: "console", text: message.text() });
  });
  page.on("pageerror", (error) => browserIssues.push({ type: "pageerror", text: error.message }));
  await page.goto(url.toString(), { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.slash_validation && typeof window.get_slash_diagnostics === "function");
  await page.waitForSelector("#loading.ready");
  await page.evaluate(() => {
    window.slash_validation?.setStressScenario(20);
    window.slash_validation?.setEnemyMotion(false);
  });
  await page.waitForTimeout(1_500);
  await page.evaluate(() => window.reset_slash_diagnostics());
  const heapStart = await page.evaluate(() => performance.memory?.usedJSHeapSize ?? null);
  const dashResult = await page.evaluate(() => window.slash_validation?.dashTo(19, -8));
  await page.waitForTimeout(durationMs);
  const diagnostics = await page.evaluate(() => window.get_slash_diagnostics());
  const state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  const heapEnd = await page.evaluate(() => performance.memory?.usedJSHeapSize ?? null);
  await page.screenshot({ path: path.join(outputDirectory, "worst-case-final.png") });
  const is1080 = width === 1920 && height === 1080;
  const evaluation = evaluatePerformanceGates({
    frame: diagnostics.frame,
    state,
    browserIssues,
    viewport: { width, height },
    durationMs,
    cadenceBaseline,
  });
  report = {
    capturedAt: new Date().toISOString(),
    url: url.toString(),
    viewport: { width, height },
    durationMs,
    scenario: "20 enemies; one real eight-target swept dash; rain, steam, blood, corpses, camera and post FX enabled",
    frameCadenceMethod: cadenceBaseline
      ? "Visible Chrome raw rAF intervals, calibrated against a same-machine visible blank rAF capture; absolute P99 and worst-frame gates remain enforced."
      : is1080
        ? "Visible 60 Hz Chrome. P95 gate is one 16.67 ms refresh interval plus 10% scheduling tolerance (18.33 ms); raw intervals remain unmodified."
      : "Visible Chrome at the requested viewport; raw requestAnimationFrame intervals remain unmodified.",
    dashResult,
    state,
    diagnostics,
    memory: {
      heapStart,
      heapEnd,
      heapDelta: heapStart === null || heapEnd === null ? null : heapEnd - heapStart,
    },
    ...evaluation,
    browserIssues,
  };
  await context.close();
} finally {
  await browser.close();
}

await writeFile(path.join(outputDirectory, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  outputDirectory,
  passed: report.passed,
  frame: report.diagnostics.frame,
  state: { enemyCount: report.state.enemyCount, kills: report.state.kills },
  gates: report.gates,
  browserIssues,
}));
if (!report.passed) process.exitCode = 1;
