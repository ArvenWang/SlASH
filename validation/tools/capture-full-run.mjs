import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import * as THREE from "three";

const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const rawBaseUrl = process.argv[2] ?? "http://127.0.0.1:4175/";
const outputRoot = path.resolve(process.argv[3] ?? "validation");
const videoDirectory = path.join(outputRoot, "video");
const screenshotDirectory = path.join(outputRoot, "screenshots");
const automatedDirectory = path.join(outputRoot, "automated");
const rawVideoDirectory = path.join(outputRoot, ".raw-full-run");
await Promise.all([
  mkdir(videoDirectory, { recursive: true }),
  mkdir(screenshotDirectory, { recursive: true }),
  mkdir(automatedDirectory, { recursive: true }),
  mkdir(rawVideoDirectory, { recursive: true }),
]);

const viewport = { width: 1920, height: 1080 };
// Keep the QA projection exactly aligned with the production gameplay camera;
// otherwise a click can be visually on an enemy while its reconstructed world
// ray targets a different point.
const camera = new THREE.PerspectiveCamera(28.5, viewport.width / viewport.height, 0.1, 260);
camera.position.set(32.2, 31, 43.7);
camera.lookAt(new THREE.Vector3(-0.5, -3, -3.5));
camera.updateProjectionMatrix();
camera.updateMatrixWorld(true);

function projectWorldToViewport(target) {
  const projected = new THREE.Vector3(target.x, 0.04, target.z).project(camera);
  return {
    x: ((projected.x + 1) * 0.5) * viewport.width,
    y: ((1 - projected.y) * 0.5) * viewport.height,
  };
}

function distanceSquaredPointToSegment(point, start, end) {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared <= 1e-8) return Number.POSITIVE_INFINITY;
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSquared));
  const x = start.x + dx * t;
  const z = start.z + dz * t;
  return (point.x - x) ** 2 + (point.z - z) ** 2;
}

function extendToArenaBoundary(player, enemy, arena) {
  const dx = enemy.x - player.x;
  const dz = enemy.z - player.z;
  const length = Math.hypot(dx, dz);
  if (length <= 1e-6) return null;
  const dirX = dx / length;
  const dirZ = dz / length;
  const margin = 0.5;
  const candidates = [];
  if (dirX > 1e-6) candidates.push((arena.maxX - margin - player.x) / dirX);
  if (dirX < -1e-6) candidates.push((arena.minX + margin - player.x) / dirX);
  if (dirZ > 1e-6) candidates.push((arena.maxZ - margin - player.z) / dirZ);
  if (dirZ < -1e-6) candidates.push((arena.minZ + margin - player.z) / dirZ);
  const distance = Math.min(...candidates.filter((value) => value > 0));
  if (!Number.isFinite(distance)) return null;
  return { x: player.x + dirX * distance, z: player.z + dirZ * distance };
}

function chooseDashTarget(state) {
  const player = { x: state.player.x, z: state.player.z };
  let best = null;
  for (const enemy of state.aliveEnemies) {
    const target = extendToArenaBoundary(player, enemy, state.arena);
    if (!target) continue;
    const score = state.aliveEnemies.reduce(
      (count, candidate) => count + (distanceSquaredPointToSegment(candidate, player, target) <= 1.02 ** 2 ? 1 : 0),
      0,
    );
    const travel = Math.hypot(target.x - player.x, target.z - player.z);
    if (!best || score > best.score || (score === best.score && travel > best.travel)) {
      best = { target, score, travel };
    }
  }
  return best?.target ?? { x: -player.x, z: -player.z };
}

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

let videoPath = null;
let report;
try {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    recordVideo: { dir: rawVideoDirectory, size: viewport },
  });
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") browserIssues.push({ type: "console", text: message.text() });
  });
  page.on("pageerror", (error) => browserIssues.push({ type: "pageerror", text: error.message }));
  await page.goto(rawBaseUrl, { waitUntil: "networkidle" });
  await page.waitForFunction(() => typeof window.render_game_to_text === "function");
  await page.waitForFunction(() => document.querySelector("#loading")?.classList.contains("ready"));

  const startedAt = performance.now();
  const initialState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  // Exercise the release build's real death interaction before the clear run.
  // This deliberately uses no validation API or keyboard shortcut: enemies must
  // make contact, then the same Canvas pointer handler a player uses restarts.
  await page.waitForFunction(
    () => JSON.parse(window.render_game_to_text()).phase === "dead",
    undefined,
    { timeout: 10_000 },
  );
  const deathState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  await page.screenshot({ path: path.join(screenshotDirectory, "death-click-skip.png") });
  const restartClickAt = await page.evaluate(() => performance.now());
  await page.mouse.click(viewport.width * 0.5, viewport.height * 0.5);
  await page.waitForFunction(
    (attempt) => {
      const state = JSON.parse(window.render_game_to_text());
      return state.phase === "playing" && state.attempt === attempt + 1;
    },
    deathState.attempt,
    { timeout: 900 },
  );
  const restartedState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  const deathClickSkip = {
    inputMethod: "real Playwright mouse click on the production Canvas while dead",
    initialAttempt: initialState.attempt,
    deathState,
    restartedState,
    restartLatencyMs: Math.round((await page.evaluate(() => performance.now())) - restartClickAt),
    passed:
      deathState.phase === "dead" &&
      restartedState.phase === "playing" &&
      restartedState.stage.index === deathState.stage.index &&
      restartedState.attempt === deathState.attempt + 1,
  };
  const stageEntries = [];
  const stageClears = [];
  const deaths = [];
  let clicks = 0;
  let lastStage = -1;
  let completedState = null;

  for (let iteration = 0; iteration < 320; iteration += 1) {
    const state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    if (state.stage.index !== lastStage) {
      lastStage = state.stage.index;
      stageEntries.push({ stageIndex: lastStage, atMs: Math.round(performance.now() - startedAt) });
      await page.screenshot({
        path: path.join(screenshotDirectory, `stage-${String(lastStage + 1).padStart(2, "0")}-entry.png`),
      });
    }
    if (state.phase === "game-complete") {
      completedState = state;
      if (!stageClears.some((entry) => entry.stageIndex === state.stage.index)) {
        stageClears.push({ stageIndex: state.stage.index, atMs: Math.round(performance.now() - startedAt) });
        await page.screenshot({
          path: path.join(screenshotDirectory, `stage-${String(state.stage.number).padStart(2, "0")}-clear.png`),
        });
      }
      await page.screenshot({ path: path.join(screenshotDirectory, "game-complete.png") });
      break;
    }
    if (state.phase === "dead") {
      if (!deaths.some((entry) => entry.stageIndex === state.stage.index && entry.attempt === state.attempt)) {
        deaths.push({ stageIndex: state.stage.index, attempt: state.attempt, atMs: Math.round(performance.now() - startedAt) });
        await page.screenshot({ path: path.join(screenshotDirectory, "death-1080p.png") });
      }
      await page.waitForTimeout(90);
      continue;
    }
    if (state.phase === "stage-cleared") {
      if (!stageClears.some((entry) => entry.stageIndex === state.stage.index)) {
        stageClears.push({ stageIndex: state.stage.index, atMs: Math.round(performance.now() - startedAt) });
        await page.screenshot({
          path: path.join(screenshotDirectory, `stage-${String(state.stage.number).padStart(2, "0")}-clear.png`),
        });
      }
      await page.waitForTimeout(120);
      continue;
    }

    const target = chooseDashTarget(state);
    const screen = projectWorldToViewport(target);
    await page.mouse.click(screen.x, screen.y);
    clicks += 1;
    await page.waitForTimeout(155);
  }

  const finalState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  const elapsedMs = Math.round(performance.now() - startedAt);
  const video = page.video();
  await context.close();
  if (!video) throw new Error("Playwright did not create a full-run video.");
  const rawPath = await video.path();
  videoPath = path.join(videoDirectory, "full-run.webm");
  await copyFile(rawPath, videoPath);

  report = {
    capturedAt: new Date().toISOString(),
    url: rawBaseUrl,
    viewport,
    usedValidationApi: false,
    inputMethod: "real Playwright mouse clicks projected onto the production Canvas",
    clicks,
    elapsedMs,
    stageEntries,
    stageClears,
    deaths,
    deathClickSkip,
    completed: completedState !== null,
    completedState,
    finalState,
    browserIssues,
    videoPath,
  };
} finally {
  await browser.close();
  await rm(rawVideoDirectory, { recursive: true, force: true });
}

await writeFile(
  path.join(automatedDirectory, "full-run.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log(JSON.stringify({
  completed: report.completed,
  elapsedMs: report.elapsedMs,
  clicks: report.clicks,
  stageClears: report.stageClears,
  deathClickSkip: report.deathClickSkip,
  browserIssues,
  videoPath,
}));
if (!report.completed || !report.deathClickSkip.passed || browserIssues.length > 0) process.exitCode = 1;
