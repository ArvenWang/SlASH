import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import * as THREE from "three";

const rawBaseUrl = process.argv[2] ?? "http://127.0.0.1:5173/";
const outputDirectory = path.resolve(process.argv[3] ?? "validation/charged-armor/browser");
await fs.mkdir(outputDirectory, { recursive: true });

const viewport = { width: 1440, height: 900 };
function project(target, cameraState) {
  const camera = new THREE.PerspectiveCamera(
    cameraState.fov,
    viewport.width / viewport.height,
    cameraState.near,
    cameraState.far,
  );
  camera.position.set(cameraState.position.x, cameraState.position.y, cameraState.position.z);
  camera.lookAt(new THREE.Vector3(cameraState.target.x, cameraState.target.y, cameraState.target.z));
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  const point = new THREE.Vector3(target.x, 0.04, target.z).project(camera);
  return {
    x: ((point.x + 1) * 0.5) * viewport.width,
    y: ((1 - point.y) * 0.5) * viewport.height,
  };
}

const url = new URL(rawBaseUrl);
url.searchParams.set("validation", "1");
const browserIssues = [];
const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader"],
});
const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
page.on("console", (message) => {
  if (message.type() === "error") browserIssues.push({ type: "console", text: message.text() });
});
page.on("pageerror", (error) => browserIssues.push({ type: "pageerror", text: String(error) }));

await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.slash_validation !== undefined);
await page.waitForSelector("#loading.ready", { state: "attached" });
await page.waitForFunction(() => getComputedStyle(document.querySelector("#loading")).visibility === "hidden");
await page.evaluate(() => window.slash_validation?.setArmorScenario());
await page.evaluate(() => window.advanceTime?.(1_000));
const initialState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
const frontTarget = project({ x: 8, z: 0 }, initialState.camera);
const returnTarget = project({ x: -8, z: 0 }, initialState.camera);
await page.screenshot({ path: path.join(outputDirectory, "01-armored-front.png") });

await page.mouse.move(frontTarget.x, frontTarget.y);
await page.mouse.down();
await page.evaluate(() => window.advanceTime?.(700));
const chargingState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
await page.screenshot({ path: path.join(outputDirectory, "02-full-charge.png") });
await page.mouse.up();
await page.evaluate(() => window.advanceTime?.(180));
const brokenState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
await page.screenshot({ path: path.join(outputDirectory, "03-armor-broken.png") });

await page.evaluate(() => window.advanceTime?.(260));
await page.mouse.click(returnTarget.x, returnTarget.y);
await page.evaluate(() => window.advanceTime?.(180));
const executedState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
await page.screenshot({ path: path.join(outputDirectory, "04-exposed-kill.png") });

const gates = {
  realHoldEnteredCharging: chargingState.player.action === "charging" && chargingState.modules.charge?.progress === 1,
  rootArmorBreak: brokenState.modules.armoredEnemies[0]?.armorParts[0]?.intact === false,
  armorContactDidNotKill: brokenState.aliveEnemies.length === 1 && brokenState.kills === 0,
  chargedPassedThrough: brokenState.player.x > 0,
  armorEnergy: brokenState.modules.ultimateEnergy === 4,
  exposedFollowupKilled: executedState.kills === 1 && executedState.aliveEnemies.length === 0,
  browserClean: browserIssues.length === 0,
};
const report = {
  ok: Object.values(gates).every(Boolean),
  inputMethod: "Real Playwright left-button hold for 700ms, release, then real quick click through the exposed area.",
  frontTarget,
  returnTarget,
  gates,
  charging: {
    action: chargingState.player.action,
    charge: chargingState.modules.charge,
  },
  afterCharged: {
    player: brokenState.player,
    armor: brokenState.modules.armoredEnemies,
    energy: brokenState.modules.ultimateEnergy,
    kills: brokenState.kills,
  },
  afterBasic: {
    phase: executedState.phase,
    kills: executedState.kills,
    aliveEnemies: executedState.aliveEnemies.length,
  },
  browserIssues,
};
await fs.writeFile(path.join(outputDirectory, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
await browser.close();
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exit(1);
