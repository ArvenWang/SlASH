import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const outputDirectory = path.resolve(process.argv[2] ?? "validation/performance/blank-raf-baseline");
const durationMs = Number(process.argv[3] ?? 30_000);
const width = Number(process.argv[4] ?? 1920);
const height = Number(process.argv[5] ?? 1080);
await mkdir(outputDirectory, { recursive: true });

function percentile(sorted, quantile) {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * quantile) - 1))];
}

function rounded(value) {
  return Math.round(value * 100) / 100;
}

const browser = await chromium.launch({
  executablePath: chromePath,
  headless: false,
  args: [
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
    `--window-size=${width},${height}`,
  ],
});

let report;
try {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto("data:text/html,<meta charset=utf-8><title>rAF baseline</title><canvas width=1 height=1></canvas>");
  const browserVersion = browser.version();
  await page.evaluate(() => {
    window.__rafSamples = [];
    let previous = performance.now();
    function frame(now) {
      window.__rafSamples.push(now - previous);
      previous = now;
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });
  await page.waitForTimeout(1_000);
  await page.evaluate(() => { window.__rafSamples.length = 0; });
  await page.waitForTimeout(durationMs);
  const samples = await page.evaluate(() => window.__rafSamples.slice());
  const sorted = [...samples].sort((a, b) => a - b);
  const averageMs = samples.reduce((sum, value) => sum + value, 0) / Math.max(1, samples.length);
  const frame = {
    sampleCount: samples.length,
    averageFps: rounded(1000 / averageMs),
    averageMs: rounded(averageMs),
    p95Ms: rounded(percentile(sorted, 0.95)),
    p99Ms: rounded(percentile(sorted, 0.99)),
    worstMs: rounded(sorted.at(-1) ?? 0),
  };
  const gates = {
    sampleDuration: samples.length >= Math.floor((durationMs / 1000) * 50),
    averageFps: frame.averageFps >= 59,
    p95NoMissedRefresh: frame.p95Ms < 25,
    p99NoMissedRefresh: frame.p99Ms < 25,
  };
  report = {
    capturedAt: new Date().toISOString(),
    browser: "system Google Chrome",
    browserVersion,
    viewport: { width, height },
    durationMs,
    scenario: "Blank visible page; requestAnimationFrame cadence only; same launch flags as the game performance gate.",
    frame,
    gates,
    passed: Object.values(gates).every(Boolean),
  };
  await context.close();
} finally {
  await browser.close();
}

await writeFile(path.join(outputDirectory, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ outputDirectory, ...report }, null, 2));
if (!report.passed) process.exitCode = 1;
