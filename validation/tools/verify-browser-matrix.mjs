import { existsSync, readdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, firefox, webkit } from "playwright";

const rawBaseUrl = process.argv[2] ?? "http://127.0.0.1:4175/";
const outputDirectory = path.resolve(process.argv[3] ?? "validation/compatibility/browser-matrix");
const systemChromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
await mkdir(outputDirectory, { recursive: true });

const configurations = [
  { name: "chrome-1920x1080", browserType: chromium, executablePath: systemChromePath, viewport: { width: 1920, height: 1080 } },
  { name: "chrome-2560x1440", browserType: chromium, executablePath: systemChromePath, viewport: { width: 2560, height: 1440 } },
  { name: "chrome-1366x768", browserType: chromium, executablePath: systemChromePath, viewport: { width: 1366, height: 768 } },
  { name: "firefox-1600x900", browserType: firefox, viewport: { width: 1600, height: 900 } },
  { name: "webkit-1600x900", browserType: webkit, viewport: { width: 1600, height: 900 } },
  {
    name: "chrome-compatibility-1600x900",
    browserType: chromium,
    executablePath: systemChromePath,
    viewport: { width: 1600, height: 900 },
    quality: "compatibility",
  },
  {
    name: "chrome-touch-390x844",
    browserType: chromium,
    executablePath: systemChromePath,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
  },
];

function cachedBrowserExecutable(name) {
  const cacheRoot = path.join(os.homedir(), "Library", "Caches", "ms-playwright");
  if (!existsSync(cacheRoot)) return null;
  const candidates = readdirSync(cacheRoot)
    .filter((entry) => entry.startsWith(`${name}-`))
    .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));
  for (const candidate of candidates) {
    const executable = name === "firefox"
      ? path.join(cacheRoot, candidate, "firefox", "Nightly.app", "Contents", "MacOS", "firefox")
      : path.join(cacheRoot, candidate, "pw_run.sh");
    if (existsSync(executable)) return executable;
  }
  return null;
}

const results = [];
async function writeReport() {
  const report = {
    baseUrl: rawBaseUrl,
    capturedAt: new Date().toISOString(),
    scopeNote: "This matrix validates rendering and real pointer/touch functionality. Its single input-to-presented sample includes Playwright command round-trip time and is not the latency acceptance measurement; use the visible-GPU performance report for that gate.",
    results,
  };
  await writeFile(path.join(outputDirectory, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

for (const configuration of configurations) {
  console.log(`[browser-matrix] starting ${configuration.name}`);
  const browserIssues = [];
  let browser = null;
  try {
    const expectedExecutable = configuration.browserType.executablePath();
    const fallbackExecutable = configuration.browserType === firefox
      ? cachedBrowserExecutable("firefox")
      : configuration.browserType === webkit
        ? cachedBrowserExecutable("webkit")
        : null;
    const configuredExecutable = configuration.executablePath && existsSync(configuration.executablePath)
      ? configuration.executablePath
      : null;
    browser = await configuration.browserType.launch({
      headless: true,
      timeout: 20_000,
      executablePath: configuredExecutable ?? (existsSync(expectedExecutable) ? expectedExecutable : (fallbackExecutable ?? undefined)),
    });
    const context = await browser.newContext({
      viewport: configuration.viewport,
      deviceScaleFactor: configuration.deviceScaleFactor ?? 1,
      hasTouch: configuration.hasTouch ?? false,
      isMobile: configuration.isMobile ?? false,
    });
    const page = await context.newPage();
    page.on("console", (message) => {
      if (message.type() === "error") browserIssues.push({ type: "console", text: message.text() });
    });
    page.on("pageerror", (error) => browserIssues.push({ type: "pageerror", text: error.message }));

    const url = new URL(rawBaseUrl);
    url.searchParams.set("deterministic", "1");
    url.searchParams.set("validation", "1");
    if (configuration.quality) url.searchParams.set("quality", configuration.quality);
    await page.goto(url.toString(), { waitUntil: "networkidle", timeout: 30_000 });
    await page.waitForFunction(
      () => window.slash_validation && typeof window.render_game_to_text === "function",
      null,
      { timeout: 20_000 },
    );
    await page.evaluate(() => {
      window.slash_validation?.setStage(2);
      window.slash_validation?.setEnemyMotion(false);
      window.advanceTime(1000);
    });

    const before = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    await page.screenshot({ path: path.join(outputDirectory, `${configuration.name}-idle.png`) });
    const canvas = page.locator("#game-canvas");
    const bounds = await canvas.boundingBox();
    if (!bounds) throw new Error("Game canvas has no rendered bounds.");
    const targetX = bounds.x + bounds.width * 0.72;
    const targetY = bounds.y + bounds.height * 0.62;
    if (configuration.hasTouch) await page.touchscreen.tap(targetX, targetY);
    else {
      await canvas.click({
        position: { x: bounds.width * 0.72, y: bounds.height * 0.62 },
      });
    }
    await page.evaluate(() => window.advanceTime(180));
    const after = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    await page.screenshot({ path: path.join(outputDirectory, `${configuration.name}-after-input.png`) });

    const runtime = await page.evaluate(() => {
      const canvasElement = document.querySelector("#game-canvas");
      if (!(canvasElement instanceof HTMLCanvasElement)) throw new Error("Missing canvas.");
      const rect = canvasElement.getBoundingClientRect();
      return {
        canvas: {
          cssWidth: rect.width,
          cssHeight: rect.height,
          backingWidth: canvasElement.width,
          backingHeight: canvasElement.height,
        },
        devicePixelRatio: window.devicePixelRatio,
      coarsePointer: window.matchMedia("(pointer: coarse)").matches,
      qualityMode: JSON.parse(window.render_game_to_text()).qualityMode,
      diagnostics: window.get_slash_diagnostics?.() ?? null,
      };
    });
    const moved = Math.hypot(
      after.player.x - before.player.x,
      after.player.z - before.player.z,
    );
    results.push({
      name: configuration.name,
      status: browserIssues.length === 0 && moved > 0.5 ? "passed" : "failed",
      browserVersion: browser.version(),
      viewport: configuration.viewport,
      browserIssues,
      movedWorldUnits: Math.round(moved * 1000) / 1000,
      beforePhase: before.phase,
      afterPhase: after.phase,
      runtime,
    });
    await context.close();
  } catch (error) {
    results.push({
      name: configuration.name,
      status: "failed",
      viewport: configuration.viewport,
      browserIssues,
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    if (browser) {
      await Promise.race([
        browser.close(),
        new Promise((resolve) => setTimeout(resolve, 5000)),
      ]);
    }
  }
  await writeReport();
  console.log(`[browser-matrix] completed ${configuration.name}: ${results.at(-1)?.status}`);
}

const report = await writeReport();
console.log(JSON.stringify(report, null, 2));
if (results.some((result) => result.status !== "passed")) process.exitCode = 1;
