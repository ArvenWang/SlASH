import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import * as THREE from "three";

const rawBaseUrl = process.argv[2] ?? "http://127.0.0.1:5173/";
const outputDirectory = path.resolve(process.argv[3] ?? "validation/entity-matrix/browser");
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
await page.evaluate(() => window.slash_validation?.setEntityScenario());
const initial = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
await page.evaluate(() => {
  document.documentElement.style.filter = "grayscale(1)";
});
await page.screenshot({ path: path.join(outputDirectory, "00-entity-matrix-grayscale.png") });
await page.evaluate(() => {
  document.documentElement.style.filter = "";
});
const basicTarget = project({ x: 6, z: -5 }, initial.camera);
const refractionTarget = project({ x: -10, z: 10 }, initial.camera);
await page.screenshot({ path: path.join(outputDirectory, "01-entity-matrix.png") });

await page.mouse.click(basicTarget.x, basicTarget.y);
await page.evaluate(() => window.advanceTime?.(45));
const reflectedProjectile = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
await page.screenshot({ path: path.join(outputDirectory, "02-projectile-return.png") });

await page.evaluate(() => window.advanceTime?.(1_255));
const returnedImpact = JSON.parse(await page.evaluate(() => window.render_game_to_text()));

await page.mouse.click(refractionTarget.x, refractionTarget.y);
await page.evaluate(() => window.advanceTime?.(45));
const duringRefraction = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
await page.screenshot({ path: path.join(outputDirectory, "03-refraction.png") });
await page.evaluate(() => window.advanceTime?.(700));
const final = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
await page.screenshot({ path: path.join(outputDirectory, "04-refraction-complete.png") });

const gates = {
  completeEntitySetVisible: initial.projectiles.length === 1 && initial.obstacles.length === 2 && initial.hazards.length === 2,
  nonColorShapeContractsVisible: initial.presentation.readability.projectileMarkerCount === 1 &&
    initial.presentation.readability.obstacleSolidCount === 2 &&
    initial.presentation.readability.hazardGroundMarkerCount === 2,
  realBasicInputCompleted: reflectedProjectile.player.x > 5 && reflectedProjectile.projectiles.some((projectile) => projectile.faction === "player"),
  standardRoundReturned: reflectedProjectile.projectiles.some((projectile) => projectile.faction === "player"),
  returnKilledSource: !returnedImpact.aliveEnemies.some((enemy) => enemy.id === "validation-gunner") && returnedImpact.kills === 1,
  realRefractionInputStarted: duringRefraction.player.x > 10 && duringRefraction.player.z < -7,
  refractionContinuedAwayFromWall: final.player.hp === 1 && final.player.x > 5 && final.player.z < -5,
  browserClean: browserIssues.length === 0,
};
const report = {
  ok: Object.values(gates).every(Boolean),
  inputMethod: "Two real Canvas clicks: Basic cuts/returns a projectile, then a second Basic hits a reflector and follows the computed reflection.",
  gates,
  initial: {
    player: initial.player,
    projectiles: initial.projectiles,
    obstacles: initial.obstacles,
    hazards: initial.hazards,
    readability: initial.presentation.readability,
  },
  reflectedProjectile: {
    player: reflectedProjectile.player,
    projectiles: reflectedProjectile.projectiles,
  },
  returnedImpact: { kills: returnedImpact.kills, aliveEnemies: returnedImpact.aliveEnemies },
  duringRefraction: { player: duringRefraction.player, dash: duringRefraction.dash },
  final: { player: final.player, phase: final.phase },
  browserIssues,
};
await fs.writeFile(path.join(outputDirectory, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
await browser.close();
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exit(1);
