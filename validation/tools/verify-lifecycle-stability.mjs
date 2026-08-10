import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const rawBaseUrl = process.argv[2] ?? "http://127.0.0.1:4175/";
const outputDirectory = path.resolve(process.argv[3] ?? "validation/compatibility/lifecycle-stability");
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
    "--window-size=1920,1080",
  ],
});

let report;
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") browserIssues.push({ type: "console", text: message.text() });
  });
  page.on("pageerror", (error) => browserIssues.push({ type: "pageerror", text: error.message }));
  await page.goto(url.toString(), { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.slash_validation && typeof window.render_game_to_text === "function");
  await page.waitForFunction(() => document.querySelector("#loading")?.classList.contains("ready"));
  await page.evaluate(() => {
    window.slash_validation?.setStage(2);
    window.slash_validation?.setEnemyMotion(false);
    window.advanceTime(1000);
  });

  async function snapshot() {
    return page.evaluate(() => {
      const canvas = document.querySelector("#game-canvas");
      if (!(canvas instanceof HTMLCanvasElement)) throw new Error("Missing game canvas.");
      const rect = canvas.getBoundingClientRect();
      return {
        state: JSON.parse(window.render_game_to_text()),
        fullscreen: Boolean(document.fullscreenElement),
        hidden: document.hidden,
        canvas: {
          cssWidth: Math.round(rect.width),
          cssHeight: Math.round(rect.height),
          backingWidth: canvas.width,
          backingHeight: canvas.height,
        },
      };
    });
  }

  const initial = await snapshot();
  await page.screenshot({ path: path.join(outputDirectory, "initial.png") });

  const resizeSamples = [];
  for (const viewport of [{ width: 1366, height: 768 }, { width: 1920, height: 1080 }, { width: 1600, height: 900 }]) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(180);
    resizeSamples.push({ viewport, ...(await snapshot()) });
  }

  await page.keyboard.press("f");
  await page.waitForTimeout(250);
  const fullscreenEntered = await snapshot();
  if (fullscreenEntered.fullscreen) {
    await page.keyboard.press("f");
    await page.waitForTimeout(180);
  }
  const fullscreenExited = await snapshot();

  // Playwright creates independent native windows on macOS, so switching
  // between Page objects does not produce a genuine background-tab
  // visibility state. Exercise Chrome's real renderer lifecycle instead:
  // freeze the page target, leave it suspended, then resume it.
  const lifecycleSession = await context.newCDPSession(page);
  const lifecycleFrozenAt = new Date().toISOString();
  await lifecycleSession.send("Page.setWebLifecycleState", { state: "frozen" });
  await new Promise((resolve) => setTimeout(resolve, 350));
  await lifecycleSession.send("Page.setWebLifecycleState", { state: "active" });
  await page.waitForTimeout(350);
  const afterLifecycleResume = await snapshot();

  await page.evaluate(() => window.slash_validation?.loseGraphicsContext());
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).graphicsContextState === "lost");
  const contextLost = await snapshot();
  await page.evaluate(() => window.slash_validation?.restoreGraphicsContext());
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).graphicsContextState === "ready", null, { timeout: 10_000 });
  await page.waitForFunction(() => document.querySelector("#loading")?.classList.contains("ready"));
  await page.evaluate(() => {
    window.advanceTime(180);
    window.slash_validation?.dashTo(8, 0);
    window.advanceTime(180);
  });
  const afterContextRestore = await snapshot();
  await page.screenshot({ path: path.join(outputDirectory, "after-context-restore.png") });

  const resizeGate = resizeSamples.every(({ viewport, canvas, state }) => (
    canvas.cssWidth === viewport.width
    && canvas.cssHeight === viewport.height
    && canvas.backingWidth >= viewport.width
    && canvas.backingHeight >= viewport.height
    && state.phase === "playing"
  ));
  const gates = {
    initialPlaying: initial.state.phase === "playing",
    resizeAndDpr: resizeGate,
    fullscreenEnterExit: fullscreenEntered.fullscreen && !fullscreenExited.fullscreen,
    lifecycleFreezeResume: afterLifecycleResume.state.phase === "playing",
    contextLostObserved: contextLost.state.graphicsContextState === "lost",
    contextRestored: afterContextRestore.state.graphicsContextState === "ready",
    gameplayAfterRestore: afterContextRestore.state.player.x > 1,
    browserClean: browserIssues.length === 0,
  };
  report = {
    capturedAt: new Date().toISOString(),
    url: url.toString(),
    browser: "system Google Chrome",
    scenario: "Resize/DPR, trusted-key Fullscreen, Chrome renderer lifecycle freeze/resume, WebGL context loss/restore, then gameplay input",
    initial,
    resizeSamples,
    fullscreenEntered,
    fullscreenExited,
    lifecycleFrozenAt,
    afterLifecycleResume,
    contextLost,
    afterContextRestore,
    gates,
    passed: Object.values(gates).every(Boolean),
    browserIssues,
  };
  await context.close();
} finally {
  await browser.close();
}

await writeFile(path.join(outputDirectory, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ outputDirectory, passed: report.passed, gates: report.gates, browserIssues }, null, 2));
if (!report.passed) process.exitCode = 1;
