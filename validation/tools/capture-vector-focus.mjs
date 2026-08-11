import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import * as THREE from "three";

const rawBaseUrl = process.argv[2] ?? "http://127.0.0.1:5173/";
const outputDirectory = path.resolve(process.argv[3] ?? "validation/vector-focus/browser");
await fs.mkdir(outputDirectory, { recursive: true });
const viewport = { width: 1440, height: 900 };

function project(target, cameraState) {
  const camera = new THREE.PerspectiveCamera(cameraState.fov, viewport.width / viewport.height, cameraState.near, cameraState.far);
  camera.position.set(cameraState.position.x, cameraState.position.y, cameraState.position.z);
  camera.lookAt(new THREE.Vector3(cameraState.target.x, cameraState.target.y, cameraState.target.z));
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  const point = new THREE.Vector3(target.x, 0.04, target.z).project(camera);
  return { x: (point.x + 1) * 0.5 * viewport.width, y: (1 - point.y) * 0.5 * viewport.height };
}

const url = new URL(rawBaseUrl);
url.searchParams.set("validation", "1");
const browserIssues = [];
const browser = await chromium.launch({ headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader"] });
const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
page.on("console", (message) => {
  if (message.type() === "error") browserIssues.push({ type: "console", text: message.text() });
});
page.on("pageerror", (error) => browserIssues.push({ type: "pageerror", text: String(error) }));

await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.slash_validation !== undefined);
await page.waitForSelector("#loading.ready", { state: "attached" });
await page.waitForFunction(() => getComputedStyle(document.querySelector("#loading")).visibility === "hidden");
await page.evaluate(() => window.slash_validation?.setUltimateScenario());
await page.evaluate(() => window.advanceTime?.(1_000));
const initialState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
const worldPoints = [{ x: 8, z: 0 }, { x: 8, z: 8 }, { x: -8, z: 8 }];
const screenPoints = worldPoints.map((point) => project(point, initialState.camera));
await page.screenshot({ path: path.join(outputDirectory, "01-energy-ready.png") });

await page.keyboard.press("Space");
await page.mouse.click(screenPoints[0].x, screenPoints[0].y);
await page.mouse.click(screenPoints[1].x, screenPoints[1].y);
const planningState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
await page.screenshot({ path: path.join(outputDirectory, "02-two-point-plan.png") });
await page.keyboard.press("Escape");
const cancelledState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));

await page.keyboard.press("Space");
for (const point of screenPoints) await page.mouse.click(point.x, point.y);
const executingState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
await page.screenshot({ path: path.join(outputDirectory, "03-executing.png") });
await page.evaluate(() => window.advanceTime?.(500));
const finalState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
await page.screenshot({ path: path.join(outputDirectory, "04-complete.png") });

const gates = {
  planningHasTwoPoints: planningState.modules.ultimate?.phase === "planning" && planningState.modules.ultimate.points.length === 2,
  planningSlowWorld: planningState.modules.ultimate?.durationMs === 3_000,
  cancelPreservesEnergy: cancelledState.modules.ultimate === null && cancelledState.modules.ultimateEnergy === 100,
  finalPointStartsExecution: executingState.modules.ultimate?.phase === "executing" && executingState.player.invulnerable === true,
  commitSpendsEnergy: executingState.modules.ultimateEnergy === 0,
  orderedExecutionCompleted: finalState.modules.ultimate === null && Math.abs(finalState.player.x + 8) < 0.05 && Math.abs(finalState.player.z - 8) < 0.05,
  noSelfCharge: finalState.modules.ultimateEnergy === 0,
  threeKills: finalState.kills === 3 && finalState.aliveEnemies.length === 0,
  browserClean: browserIssues.length === 0,
};
const report = {
  ok: Object.values(gates).every(Boolean),
  inputMethod: "Real Space key, real Canvas clicks for planning points, real Escape cancel, then real Space and three clicks to commit.",
  worldPoints,
  screenPoints,
  gates,
  planning: planningState.modules.ultimate,
  cancelledEnergy: cancelledState.modules.ultimateEnergy,
  executing: {
    player: executingState.player,
    ultimate: executingState.modules.ultimate,
    energy: executingState.modules.ultimateEnergy,
  },
  final: {
    phase: finalState.phase,
    player: finalState.player,
    kills: finalState.kills,
    energy: finalState.modules.ultimateEnergy,
  },
  browserIssues,
};
await fs.writeFile(path.join(outputDirectory, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
await browser.close();
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exit(1);
