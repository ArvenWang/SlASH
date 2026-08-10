import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import * as THREE from "three";

const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const rawBaseUrl = process.argv[2] ?? "http://127.0.0.1:4175/";
const outputDirectory = path.resolve(process.argv[3] ?? "validation/automated/input-latency");
const sampleTarget = Number(process.argv[4] ?? 100);
await mkdir(outputDirectory, { recursive: true });

const viewport = { width: 1920, height: 1080 };
const camera = new THREE.PerspectiveCamera(36, viewport.width / viewport.height, 0.1, 260);
camera.position.set(28, 29.4, 38);
camera.lookAt(new THREE.Vector3(-0.5, 1.35, -3.8));
camera.updateProjectionMatrix();
camera.updateMatrixWorld(true);

function project(target) {
  const point = new THREE.Vector3(target.x, 0.04, target.z).project(camera);
  return {
    x: ((point.x + 1) * 0.5) * viewport.width,
    y: ((1 - point.y) * 0.5) * viewport.height,
  };
}

const screenTargets = [project({ x: -4, z: 0 }), project({ x: 4, z: 0 })];
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
    `--window-size=${viewport.width},${viewport.height}`,
  ],
});

let report;
try {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") browserIssues.push({ type: "console", text: message.text() });
  });
  page.on("pageerror", (error) => browserIssues.push({ type: "pageerror", text: error.message }));
  await page.goto(url.toString(), { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.slash_validation && typeof window.get_slash_diagnostics === "function");
  await page.waitForSelector("#loading.ready");
  await page.evaluate(() => {
    window.slash_validation?.setStage(2);
    window.slash_validation?.setEnemyMotion(false);
    window.reset_slash_diagnostics();
  });
  await page.waitForTimeout(500);

  for (let index = 0; index < sampleTarget; index += 1) {
    const target = screenTargets[index % screenTargets.length];
    await page.mouse.click(target.x, target.y);
    await page.waitForTimeout(158);
    const state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    if (state.phase !== "playing" || state.kills !== 0) {
      throw new Error(`Latency route left its clean state at sample ${index + 1}: ${state.phase}, ${state.kills} kills.`);
    }
  }
  await page.waitForTimeout(250);
  const diagnostics = await page.evaluate(() => window.get_slash_diagnostics());
  const state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  await page.screenshot({ path: path.join(outputDirectory, "final.png") });
  const gates = {
    sampleCount: diagnostics.input.sampleCount === sampleTarget,
    p95Logic: diagnostics.input.p95InputToLogicMs !== null && diagnostics.input.p95InputToLogicMs <= 1000 / 120,
    p95Presented: diagnostics.input.p95InputToPresentedMs !== null && diagnostics.input.p95InputToPresentedMs <= 33,
    cleanState: state.phase === "playing" && state.kills === 0,
    browserClean: browserIssues.length === 0,
  };
  report = {
    capturedAt: new Date().toISOString(),
    url: url.toString(),
    viewport,
    inputMethod: "100 real Playwright pointer clicks on alternating valid Canvas ground targets",
    sampleTarget,
    diagnostics,
    state,
    thresholds: { p95LogicMsMax: 1000 / 120, p95PresentedMsMax: 33 },
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
  input: report.diagnostics.input,
  gates: report.gates,
  browserIssues,
}));
if (!report.passed) process.exitCode = 1;
