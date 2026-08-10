import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const rawBaseUrl = process.argv[2] ?? "http://127.0.0.1:4175/";
const outputDirectory = path.resolve(process.argv[3] ?? "validation/performance/memory-10min");
const durationMs = Number(process.argv[4] ?? 600_000);
const intervalMs = Number(process.argv[5] ?? 30_000);
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
    "--window-size=1920,1080",
  ],
});

let report;
try {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") browserIssues.push({ type: "console", text: message.text() });
  });
  page.on("pageerror", (error) => browserIssues.push({ type: "pageerror", text: error.message }));
  await page.goto(url.toString(), { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.slash_validation && typeof window.get_slash_diagnostics === "function");
  await page.waitForFunction(() => document.querySelector("#loading")?.classList.contains("ready"));
  await page.evaluate(() => {
    window.slash_validation?.setStressScenario(20);
    window.slash_validation?.setEnemyMotion(false);
    window.slash_validation?.dashTo(19, -8);
  });
  await page.waitForTimeout(2_000);

  const cdp = await context.newCDPSession(page);
  await cdp.send("HeapProfiler.enable");
  const samples = [];
  const startedAt = performance.now();
  // Always take one sample after the final wait. A conditional loop can exit at
  // 600000 ms with its last retained-heap sample still at 570000 ms.
  while (true) {
    await cdp.send("HeapProfiler.collectGarbage");
    const sample = await page.evaluate(() => ({
      heapBytes: performance.memory?.usedJSHeapSize ?? null,
      diagnostics: window.get_slash_diagnostics(),
      state: JSON.parse(window.render_game_to_text()),
    }));
    samples.push({ atMs: Math.round(performance.now() - startedAt), ...sample });
    const remaining = durationMs - (performance.now() - startedAt);
    if (remaining <= 0) break;
    await page.waitForTimeout(Math.min(intervalMs, remaining));
  }
  await page.screenshot({ path: path.join(outputDirectory, "final.png") });
  const heaps = samples.map((sample) => sample.heapBytes).filter((value) => value !== null);
  const geometries = samples.map((sample) => sample.diagnostics.renderer.geometries);
  const textures = samples.map((sample) => sample.diagnostics.renderer.textures);
  const heapDelta = heaps.length >= 2 ? heaps.at(-1) - heaps[0] : null;
  const gates = {
    duration: samples.at(-1)?.atMs >= durationMs - 1_000,
    retainedHeap: heapDelta !== null && heapDelta <= 4 * 1024 * 1024,
    geometryBounded: Math.max(...geometries) - Math.min(...geometries) <= 4,
    texturesBounded: Math.max(...textures) - Math.min(...textures) <= 2,
    stressState: samples.every((sample) => sample.state.enemyCount === 20 && sample.state.kills >= 8),
    browserClean: browserIssues.length === 0,
  };
  report = {
    capturedAt: new Date().toISOString(),
    url: url.toString(),
    durationMs,
    intervalMs,
    scenario: "20-enemy stress state after an eight-target dash; retained heap sampled after explicit DevTools GC",
    samples,
    summary: {
      heapStart: heaps[0] ?? null,
      heapEnd: heaps.at(-1) ?? null,
      heapDelta,
      geometryRange: [Math.min(...geometries), Math.max(...geometries)],
      textureRange: [Math.min(...textures), Math.max(...textures)],
    },
    gates,
    passed: Object.values(gates).every(Boolean),
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
  summary: report.summary,
  gates: report.gates,
  browserIssues,
}));
if (!report.passed) process.exitCode = 1;
