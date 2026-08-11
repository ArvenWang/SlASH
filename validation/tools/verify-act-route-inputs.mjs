import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import * as THREE from "three";

const rawBaseUrl = process.argv[2] ?? "http://127.0.0.1:5173/";
const outputDirectory = path.resolve(process.argv[3] ?? "validation/encounter-content/route-inputs");
await fs.mkdir(outputDirectory, { recursive: true });

const fullRouteMatrix = [
  ["encounter-act1-arrival-pincer-v1", "encounter-act1-cross-platform-fire-v1", "encounter-act1-first-lance-v1"],
  ["encounter-act2-minefield-shift-v1", "encounter-act2-long-sightline-v1", "encounter-act2-bullet-archive-v1"],
  ["encounter-act3-vanguard-front-v1", "encounter-act3-blink-intercept-v1", "encounter-act3-mirror-fire-v1"],
  ["encounter-act4-conductor-debut-v1", "encounter-act4-armored-barrage-v1", "encounter-act4-sniper-choir-v1"],
];
const routeOnly = process.env.SLASH_ROUTE_ONLY;
const routes = routeOnly
  ? [[routeOnly]]
  : fullRouteMatrix;
const viewport = { width: 960, height: 600 };

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

const url = new URL(rawBaseUrl);
url.searchParams.set("campaign", "1");
url.searchParams.set("validation", "1");
url.searchParams.set("quality", "compatibility");
await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
await page.waitForSelector("#loading.ready", { state: "attached" });
await page.waitForFunction(() => getComputedStyle(document.querySelector("#loading")).visibility === "hidden");
await page.waitForFunction(() => window.slash_validation !== undefined);
const canvasBounds = await page.locator("#game-canvas").boundingBox();
if (!canvasBounds) throw new Error("Game Canvas has no browser bounds.");

const results = [];
for (let actIndex = 0; actIndex < routes.length; actIndex += 1) {
  for (const encounterId of routes[actIndex]) {
    await page.evaluate((id) => window.slash_validation?.setCampaignEncounterScenario(id), encounterId);
    await page.waitForSelector(".planning-panel .route-card.selected");
    const planningTitle = await page.locator(".route-card.selected strong").innerText();
    await clickCampaign(page, '[data-skill-id="skill-wide-slash-v1"]');
    await clickCampaign(page, '[data-skill-id="skill-curve-dash-v1"]');
    await clickCampaign(page, '[data-action="confirm-planning"]');
    await page.waitForFunction((id) => {
      const state = JSON.parse(window.render_game_to_text());
      return state.campaign?.phase === "combat" && state.encounter.id === id;
    }, encounterId);

    const input = { clicks: 0, charges: 0, retries: 0 };
    let terminal = null;
    for (let iteration = 0; iteration < 240; iteration += 1) {
      const state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
      if (iteration % 20 === 0) {
        console.log(JSON.stringify({ encounterId, iteration, phase: state.phase, campaign: state.campaign?.phase, alive: state.aliveEnemies.length, kills: state.kills, action: state.player.action, attempt: state.attempt }));
      }
      if (state.campaign?.phase === "reward") {
        terminal = state;
        break;
      }
      if (state.phase === "dead") {
        if (input.retries >= 3) {
          terminal = state;
          break;
        }
        await page.mouse.click(viewport.width * 0.5, viewport.height * 0.5);
        input.retries += 1;
        await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).campaign?.phase === "combat");
        await page.evaluate(() => window.advanceTime(100));
        continue;
      }
      if (state.player.action !== "ready" || state.aliveEnemies.length === 0) {
        await page.evaluate((milliseconds) => window.advanceTime(milliseconds), state.aliveEnemies.length === 0 ? 900 : 320);
        continue;
      }

      const target = chooseTarget(state);
      const worldTarget = target.worldTarget;
      const screen = projectWorldToViewport(worldTarget, state.camera, canvasBounds);
      if (routeOnly) console.log(JSON.stringify({ input: target.requiresCharge ? "charge" : "click", player: { x: state.player.x, z: state.player.z }, enemy: target.enemy, worldTarget, screen }));
      if (target.requiresCharge) {
        await page.mouse.move(screen.x, screen.y);
        await page.mouse.down();
        await page.evaluate(() => window.advanceTime(700));
        await page.mouse.up();
        input.charges += 1;
        await page.evaluate(() => window.advanceTime(380));
      } else {
        await page.mouse.click(screen.x, screen.y);
        input.clicks += 1;
        await page.evaluate(() => window.advanceTime(380));
      }
    }
    if (!terminal) terminal = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    const result = {
      act: actIndex + 1,
      encounterId,
      planningTitle,
      inputMethod: "real Playwright pointer click / hold / release on production Canvas",
      ...input,
      phase: terminal.campaign?.phase ?? terminal.phase,
      kills: terminal.kills,
      totalEnemies: terminal.enemyCount,
      completed: terminal.campaign?.phase === "reward",
      playerAlive: terminal.player.hp === 1,
    };
    results.push(result);
    console.log(JSON.stringify(result));
    if (!result.completed) break;
  }
  await page.screenshot({
    path: path.join(outputDirectory, `act-${actIndex + 1}-third-route-complete.png`),
    fullPage: true,
  });
}

const gates = {
  threeRoutesPerAct: routeOnly
    ? results.length === 1 && results[0]?.completed === true
    : [1, 2, 3, 4].every((act) => results.filter((entry) => entry.act === act && entry.completed).length === 3),
  allPlayersSurvived: results.every((entry) => entry.playerAlive),
  realPointerInputsUsed: results.every((entry) => entry.clicks + entry.charges > 0),
  armorRoutesUsedChargedDash: routeOnly ? true : [
    "encounter-act3-vanguard-front-v1",
    "encounter-act4-conductor-debut-v1",
    "encounter-act4-armored-barrage-v1",
    "encounter-act4-sniper-choir-v1",
  ].every((id) => results.find((entry) => entry.encounterId === id)?.charges > 0),
  browserClean: browserIssues.length === 0,
};
const report = {
  ok: Object.values(gates).every(Boolean),
  gates,
  routes: results,
  browserIssues,
};
await fs.writeFile(path.join(outputDirectory, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
await browser.close();
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exit(1);

function chooseTarget(state) {
  const armorById = new Map(state.modules.armoredEnemies.map((enemy) => [enemy.id, enemy]));
  const unarmored = state.aliveEnemies.filter((enemy) => {
    const armor = armorById.get(enemy.id);
    return !armor || armor.armorParts.every((part) => !part.intact);
  });
  if (unarmored.length > 0) return bestLineTarget(state, unarmored, false);
  const armored = state.aliveEnemies.filter((enemy) => (
    armorById.get(enemy.id)?.armorParts.some((part) => part.intact)
  ));
  return bestLineTarget(state, armored.length > 0 ? armored : state.aliveEnemies, armored.length > 0);
}

function bestLineTarget(state, candidates, requiresCharge) {
  let best = null;
  for (const enemy of candidates) {
    const worldTarget = extendToArenaBoundary(state.player, enemy, state.arena);
    const score = state.aliveEnemies.reduce((count, candidate) => (
      count + (distanceSquaredPointToSegment(candidate, state.player, worldTarget) <= 1.15 ** 2 ? 1 : 0)
    ), 0);
    const travel = Math.hypot(worldTarget.x - state.player.x, worldTarget.z - state.player.z);
    if (!best || score > best.score || (score === best.score && travel > best.travel)) {
      best = { enemy, worldTarget, requiresCharge, score, travel };
    }
  }
  return best;
}

function extendToArenaBoundary(player, enemy, arena) {
  const dx = enemy.x - player.x;
  const dz = enemy.z - player.z;
  const length = Math.hypot(dx, dz);
  if (length <= 1e-6) return { x: -player.x, z: -player.z };
  const dirX = dx / length;
  const dirZ = dz / length;
  const margin = 0.7;
  const distances = [];
  if (dirX > 1e-6) distances.push((arena.maxX - margin - player.x) / dirX);
  if (dirX < -1e-6) distances.push((arena.minX + margin - player.x) / dirX);
  if (dirZ > 1e-6) distances.push((arena.maxZ - margin - player.z) / dirZ);
  if (dirZ < -1e-6) distances.push((arena.minZ + margin - player.z) / dirZ);
  const distance = Math.min(...distances.filter((value) => value > 0));
  return { x: player.x + dirX * distance, z: player.z + dirZ * distance };
}

function projectWorldToViewport(target, cameraState, bounds) {
  const camera = new THREE.PerspectiveCamera(cameraState.fov, bounds.width / bounds.height, cameraState.near, cameraState.far);
  camera.position.set(cameraState.position.x, cameraState.position.y, cameraState.position.z);
  camera.lookAt(new THREE.Vector3(cameraState.target.x, cameraState.target.y, cameraState.target.z));
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  const projected = new THREE.Vector3(target.x, 0.04, target.z).project(camera);
  return {
    x: bounds.x + ((projected.x + 1) * 0.5) * bounds.width,
    y: bounds.y + ((1 - projected.y) * 0.5) * bounds.height,
  };
}

function distanceSquaredPointToSegment(point, start, end) {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared <= 1e-8) return Number.POSITIVE_INFINITY;
  const ratio = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSquared));
  const x = start.x + dx * ratio;
  const z = start.z + dz * ratio;
  return (point.x - x) ** 2 + (point.z - z) ** 2;
}

async function clickCampaign(currentPage, selector) {
  const locator = currentPage.locator(selector);
  await locator.waitFor({ state: "visible" });
  await locator.scrollIntoViewIfNeeded();
  await locator.click({ force: true });
}
