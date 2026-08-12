import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import * as THREE from "three";

const rawBaseUrl = process.argv[2] ?? "http://127.0.0.1:4175/";
const outputDirectory = path.resolve(process.argv[3] ?? "validation/start-vector-focus");
const viewport = { width: 1600, height: 900 };
await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader"],
});
const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
const browserIssues = [];
page.on("console", (message) => {
  if (message.type() === "error") browserIssues.push({ type: "console", text: message.text() });
});
page.on("pageerror", (error) => browserIssues.push({ type: "pageerror", text: error.message }));

async function state() {
  return JSON.parse(await page.evaluate(() => window.render_game_to_text()));
}

function projectWorldToViewport(target, snapshot) {
  const camera = new THREE.PerspectiveCamera(
    snapshot.camera.fov,
    viewport.width / viewport.height,
    snapshot.camera.near,
    snapshot.camera.far,
  );
  camera.position.set(snapshot.camera.position.x, snapshot.camera.position.y, snapshot.camera.position.z);
  camera.lookAt(new THREE.Vector3(
    snapshot.camera.target.x,
    snapshot.camera.target.y,
    snapshot.camera.target.z,
  ));
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  const projected = new THREE.Vector3(target.x, 0.04, target.z).project(camera);
  return {
    x: ((projected.x + 1) * 0.5) * viewport.width,
    y: ((1 - projected.y) * 0.5) * viewport.height,
  };
}

const checks = {};

await page.goto(rawBaseUrl, { waitUntil: "networkidle" });
await page.waitForFunction(() => typeof window.render_game_to_text === "function");
await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).applicationPhase === "title");
const titleBefore = await state();
await page.waitForTimeout(500);
const titleAfter = await state();
checks.titleDefault = titleAfter.applicationPhase === "title";
checks.titleSimulationPaused = titleBefore.run.tick === titleAfter.run.tick
  && titleBefore.timeMs === titleAfter.timeMs
  && JSON.stringify(titleBefore.aliveEnemies) === JSON.stringify(titleAfter.aliveEnemies);
await page.screenshot({ path: path.join(outputDirectory, "01-title.png") });

await page.click("#start-button");
await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).applicationPhase === "playing");
await page.evaluate(() => window.advanceTime(32));
const started = await state();
checks.startButtonEntersPlaying = started.applicationPhase === "playing" && started.run.tick > 0;
await page.screenshot({ path: path.join(outputDirectory, "02-started.png") });

const validationUrl = new URL(rawBaseUrl);
validationUrl.searchParams.set("validation", "1");
validationUrl.searchParams.set("deterministic", "1");
await page.goto(validationUrl.toString(), { waitUntil: "networkidle" });
await page.waitForFunction(() => window.slash_validation && typeof window.advanceTime === "function");
await page.evaluate(() => {
  window.slash_validation.setStage(0);
  window.slash_validation.setEnemyMotion(false);
  window.slash_validation.setVectorFocusEnergy(100);
  window.advanceTime(32);
});
const ready = await state();
checks.energyHudReady = ready.abilities.ultimate.resource.current === 100
  && documentReadyText(await page.textContent("#focus-prompt")).includes("READY");
await page.screenshot({ path: path.join(outputDirectory, "03-energy-ready.png") });

await page.keyboard.press("Space");
await page.evaluate(() => window.advanceTime(32));
const selecting = await state();
checks.spaceStartsSelection = selecting.activeAbility?.phase === "target-selection"
  && selecting.activeAbility?.targets.length === 0
  && selecting.abilities.ultimate.resource.current === 100;

await page.keyboard.press("Space");
await page.evaluate(() => window.advanceTime(16));
const cancelled = await state();
checks.spaceCancelsSelection = cancelled.activeAbility === null
  && cancelled.abilities.ultimate.resource.current === 100;
await page.keyboard.press("Space");
await page.evaluate(() => window.advanceTime(16));

const route = [{ x: 19, z: 0 }, { x: 0, z: 11 }, { x: -19, z: 0 }];
for (let index = 0; index < 2; index += 1) {
  const current = await state();
  const screen = projectWorldToViewport(route[index], current);
  await page.mouse.click(screen.x, screen.y);
  await page.evaluate(() => window.advanceTime(16));
}
const thirdScreen = projectWorldToViewport(route[2], await state());
await page.mouse.move(thirdScreen.x, thirdScreen.y);
await page.evaluate(() => window.advanceTime(16));
const twoTargets = await state();
checks.pointerAddsTargets = twoTargets.activeAbility?.phase === "target-selection"
  && twoTargets.activeAbility?.targets.length === 2;
await page.screenshot({ path: path.join(outputDirectory, "04-route-selection.png") });

await page.mouse.click(thirdScreen.x, thirdScreen.y);
await page.evaluate(() => window.advanceTime(33));
const executing = await state();
checks.thirdTargetExecutes = executing.player.action === "route-dashing"
  && executing.abilities.ultimate.resource.current === 0;
await page.screenshot({ path: path.join(outputDirectory, "05-route-executing.png") });

await page.evaluate(() => window.advanceTime(600));
const completed = await state();
checks.routeCompletes = completed.activeAbility === null
  && completed.dash === null
  && completed.abilities.ultimate.resource.current === 0;
checks.profiledFeedback = (completed.presentation.vfx.triggerCounts["vector-focus-chain-v1"] ?? 0) >= 3
  && (completed.presentation.audio.triggerCounts["vector-focus-start-v1"] ?? 0) >= 1
  && (completed.presentation.audio.triggerCounts["vector-focus-chain-v1"] ?? 0) >= 3
  && completed.presentation.postFx.activeProfileId === "vector-focus-impact-v1";
await page.screenshot({ path: path.join(outputDirectory, "06-route-complete.png") });

const report = {
  url: rawBaseUrl,
  capturedAt: new Date().toISOString(),
  viewport,
  checks,
  browserIssues,
  states: { titleBefore, titleAfter, started, ready, selecting, cancelled, twoTargets, executing, completed },
};
await writeFile(path.join(outputDirectory, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
await browser.close();

const passed = Object.values(checks).every(Boolean) && browserIssues.length === 0;
console.log(JSON.stringify({ outputDirectory, passed, checks, browserIssues }));
if (!passed) process.exitCode = 1;

function documentReadyText(value) {
  return value ?? "";
}
