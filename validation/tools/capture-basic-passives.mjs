import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import * as THREE from "three";

const rawBaseUrl = process.argv[2] ?? "http://127.0.0.1:5173/";
const outputDirectory = path.resolve(process.argv[3] ?? "validation/basic-passives/browser");
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
await page.evaluate(() => window.slash_validation?.setBasicPassiveScenario());
const initial = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
const curveEndpoint = project({ x: 8, z: -4 }, initial.camera);
const curveControl = project({ x: -1, z: 5 }, initial.camera);
const verticalEndpoint = project({ x: 8, z: 6 }, initial.camera);
const reverseEndpoint = project({ x: 8, z: -4 }, initial.camera);
await page.screenshot({ path: path.join(outputDirectory, "01-ready.png") });

await page.mouse.move(curveEndpoint.x, curveEndpoint.y);
await page.mouse.down();
await page.mouse.move(curveControl.x, curveControl.y);
await page.mouse.up();
await page.evaluate(() => window.advanceTime?.(250));
const curveStored = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
await page.screenshot({ path: path.join(outputDirectory, "02-curve-stored.png") });

await page.mouse.click(verticalEndpoint.x, verticalEndpoint.y);
await page.evaluate(() => window.advanceTime?.(200));
const replaced = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
await page.screenshot({ path: path.join(outputDirectory, "03-straight-replaced.png") });

await page.mouse.click(reverseEndpoint.x, reverseEndpoint.y);
await page.evaluate(() => window.advanceTime?.(100));
const crossed = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
await page.screenshot({ path: path.join(outputDirectory, "04-cross-triggered.png") });

const armored = crossed.modules.armoredEnemies.find((enemy) => enemy.id === "validation-cross-armored");
const gates = {
  realCurveDragReachedOriginalEndpoint: Math.abs(curveStored.player.x - 8) < 0.05 && Math.abs(curveStored.player.z + 4) < 0.05,
  curveStoredAsActualSegments: curveStored.modules.storedPath?.segmentCount === 10,
  nonCrossingPathReplacedStoredLine: replaced.modules.storedPath?.segmentCount === 1 && Math.abs(replaced.player.z - 6) < 0.05,
  reverseOverlapTriggeredCross: crossed.modules.storedPath === null && crossed.kills === 1,
  crossKilledOffPathVictim: !crossed.aliveEnemies.some((enemy) => enemy.id === "validation-cross-victim"),
  crossPurgeDestroyedProjectile: crossed.projectiles.length === 0,
  crossPurgeInterruptedArmorWithoutBreakingIt: Boolean(armored && armored.staggerMs > 0 && armored.armorParts.every((part) => part.intact)),
  browserClean: browserIssues.length === 0,
};
const report = {
  ok: Object.values(gates).every(Boolean),
  inputMethod: "Real pointer drag creates Curve Dash; real click replaces Stored Path; real reverse click overlaps 1.5m and triggers Cross.",
  gates,
  curveStored: { player: curveStored.player, storedPath: curveStored.modules.storedPath },
  replaced: { player: replaced.player, storedPath: replaced.modules.storedPath },
  crossed: {
    player: crossed.player,
    kills: crossed.kills,
    aliveEnemies: crossed.aliveEnemies,
    projectiles: crossed.projectiles,
    storedPath: crossed.modules.storedPath,
    armored,
  },
  browserIssues,
};
await fs.writeFile(path.join(outputDirectory, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
await browser.close();
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exit(1);
