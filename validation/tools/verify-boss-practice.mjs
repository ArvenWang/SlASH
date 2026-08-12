import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import * as THREE from "three";

const rawBaseUrl = process.argv[2] ?? "http://127.0.0.1:5173/";
const outputDirectory = path.resolve(process.argv[3] ?? "validation/full-game/boss-browser");
await fs.mkdir(outputDirectory, { recursive: true });

const bossIds = [
  "boss-rail-hound-v1",
  "boss-siege-choir-v1",
  "boss-mirror-regent-v1",
  "boss-last-conductor-v1",
];
const viewport = { width: 1280, height: 800 };
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

await openGame(page, null);
await page.locator('[data-action="title-view"][data-view="practice"]').click();
const practiceButtons = await page.locator('[data-action="start-boss-practice"]').allTextContents();
await page.screenshot({ path: path.join(outputDirectory, "00-practice-menu.png"), fullPage: true });

const results = [];
for (const bossId of bossIds) {
  await openGame(page, bossId);
  const canvasBounds = await page.locator("#game-canvas").boundingBox();
  if (!canvasBounds) throw new Error("Game Canvas has no browser bounds.");
  const input = { clicks: 0, chargedHolds: 0, ultimateStarts: 0, ultimatePoints: 0 };
  await waitForState(page, (state) => state.campaign?.boss !== null, 100, 20);
  const initial = await snapshot(page);
  const hud = await page.locator("#enemy-label").innerText();

  if (bossId === bossIds[0]) await solveRailHound(page, canvasBounds, input, outputDirectory);
  else if (bossId === bossIds[1]) await solveSiegeChoir(page, canvasBounds, input, outputDirectory);
  else if (bossId === bossIds[2]) await solveMirrorRegent(page, canvasBounds, input, outputDirectory);
  else await solveLastConductor(page, canvasBounds, input, outputDirectory);

  const terminal = await waitForState(page, (state) => state.campaign?.phase === "victory", 100, 40);
  await page.screenshot({ path: path.join(outputDirectory, `${bossIds.indexOf(bossId) + 1}-${bossId}-victory.png`), fullPage: true });
  results.push({
    bossDefinitionId: bossId,
    initialPhase: initial.campaign?.boss?.phaseId,
    hud,
    input,
    finalPhase: terminal.campaign?.phase,
    breakCount: terminal.campaign?.boss?.breakCount,
    objective: `${terminal.campaign?.boss?.objectiveCurrent}/${terminal.campaign?.boss?.objectiveTarget}`,
    completed: terminal.campaign?.boss?.completed === true,
    playerAlive: terminal.player.hp === 1,
  });
}

await openGame(page, null);
await page.setViewportSize({ width: 390, height: 844 });
await page.locator('[data-action="title-view"][data-view="practice"]').click();
const mobileLayout = await page.evaluate(() => {
  const panel = document.querySelector(".library-panel");
  return {
    viewportWidth: document.documentElement.clientWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
    panelWidth: panel?.getBoundingClientRect().width ?? 0,
    buttonCount: document.querySelectorAll('[data-action="start-boss-practice"]').length,
  };
});
await page.screenshot({ path: path.join(outputDirectory, "05-practice-menu-mobile.png"), fullPage: true });

const gates = {
  practiceMenuListsFourBosses: practiceButtons.length === 4 && practiceButtons.every((text) => text.includes("开始练习")),
  allBossesCompleted: results.length === 4 && results.every((result) => result.completed && result.finalPhase === "victory"),
  allPlayersSurvived: results.every((result) => result.playerAlive),
  liveBossHudVisible: results.every((result) => result.hud.includes("·") && !result.hud.includes("HOSTILES")),
  realPointerUsed: results.every((result) => result.input.clicks > 0),
  realChargedHoldReleaseUsed: results.filter((result) => (
    result.bossDefinitionId === "boss-siege-choir-v1" || result.bossDefinitionId === "boss-last-conductor-v1"
  )).every((result) => result.input.chargedHolds > 0),
  realUltimatePointingUsed: results.find((result) => result.bossDefinitionId === "boss-last-conductor-v1")?.input.ultimatePoints === 3,
  mobilePracticeMenuFits: mobileLayout.documentScrollWidth <= mobileLayout.viewportWidth + 1 && mobileLayout.panelWidth > 0 && mobileLayout.buttonCount === 4,
  browserClean: browserIssues.length === 0,
};
const report = {
  ok: Object.values(gates).every(Boolean),
  inputMethod: "real Playwright mouse click / hold / release and keyboard Space on production Canvas",
  gates,
  practiceButtons,
  bosses: results,
  mobileLayout,
  browserIssues,
};
await fs.writeFile(path.join(outputDirectory, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
await browser.close();
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exit(1);

async function solveRailHound(currentPage, bounds, input, directory) {
  const seen = new Set();
  let telegraphVisible = false;
  for (let hit = 0; hit < 3; hit += 1) {
    await waitForState(currentPage, (state) => {
      const boss = state.campaign?.boss;
      if (boss?.actionPhase === "telegraph" && !seen.has(boss.attackSequence)) {
        return "dodge";
      }
      return boss?.actionPhase === "vulnerable";
    }, 50, 200, async (state, result) => {
      if (result !== "dodge") return;
      const boss = state.campaign.boss;
      telegraphVisible ||= state.presentation.enemyTelegraphs.visibleEnemyIds.includes(boss.entityId);
      if (telegraphVisible && seen.size === 0) {
        await currentPage.screenshot({ path: path.join(directory, "01-rail-hound-telegraph.png"), fullPage: true });
      }
      const bossEnemy = state.aliveEnemies.find((enemy) => enemy.id === boss.entityId);
      if (!bossEnemy || state.player.action !== "ready") return;
      const key = boss.attackSequence;
      seen.add(key);
      const dx = state.player.x - bossEnemy.x;
      const dz = state.player.z - bossEnemy.z;
      const length = Math.max(0.001, Math.hypot(dx, dz));
      await basicTo(currentPage, bounds, {
        x: clamp(state.player.x - dz / length * 10, -18, 18),
        z: clamp(state.player.z + dx / length * 8, -10, 10),
      }, input);
    });
    const state = await snapshot(currentPage);
    const bossEnemy = state.aliveEnemies.find((enemy) => enemy.id === state.campaign.boss.entityId);
    const perpendicular = {
      x: -state.campaign.boss.lockedDirection.z,
      z: state.campaign.boss.lockedDirection.x,
    };
    const side = (state.player.x - bossEnemy.x) * perpendicular.x +
      (state.player.z - bossEnemy.z) * perpendicular.z >= 0 ? 1 : -1;
    await basicTo(currentPage, bounds, {
      x: clamp(bossEnemy.x + perpendicular.x * side * 5, state.arena.minX + 1, state.arena.maxX - 1),
      z: clamp(bossEnemy.z + perpendicular.z * side * 5, state.arena.minZ + 1, state.arena.maxZ - 1),
    }, input);
    await basicTo(currentPage, bounds, {
      x: clamp(bossEnemy.x - perpendicular.x * side * 7, state.arena.minX + 1, state.arena.maxX - 1),
      z: clamp(bossEnemy.z - perpendicular.z * side * 7, state.arena.minZ + 1, state.arena.maxZ - 1),
    }, input);
  }
  if (!telegraphVisible) throw new Error("Rail Hound telegraph was not visible in Presentation state.");
}

async function solveSiegeChoir(currentPage, bounds, input, directory) {
  for (let round = 0; round < 2; round += 1) {
    let state = await snapshot(currentPage);
    for (const id of state.campaign.boss.details.supportEntityIds) {
      state = await snapshot(currentPage);
      const turret = state.aliveEnemies.find((enemy) => enemy.id === id);
      if (turret) await basicThrough(currentPage, bounds, turret, 3, input);
    }
    await basicTo(currentPage, bounds, { x: 10, z: -6 }, input);
    await chargedTo(currentPage, bounds, { x: -10, z: -6 }, input);
    await chargedTo(currentPage, bounds, { x: 10, z: -6 }, input);
    state = await snapshot(currentPage);
    if (!state.campaign.boss.coreExposed || state.campaign.boss.details.armorBreaks !== 2) {
      throw new Error("Siege Choir did not expose its rear core after two coverage breaks.");
    }
    if (!state.presentation.bossMechanics.weakPointVisible) {
      throw new Error("Siege Choir core has no visible shape marker.");
    }
    if (round === 0) await currentPage.screenshot({ path: path.join(directory, "02-siege-choir-rear-core.png"), fullPage: true });
    await basicTo(currentPage, bounds, { x: 0, z: -11 }, input);
    state = await snapshot(currentPage);
    await basicThrough(currentPage, bounds, state.aliveEnemies.find((enemy) => enemy.id === state.campaign.boss.entityId), 7, input);
    if (round === 0) await waitForState(currentPage, (candidate) => candidate.campaign?.boss?.actionPhase === "objective", 50, 100);
  }
}

async function solveMirrorRegent(currentPage, bounds, input, directory) {
  await basicTo(currentPage, bounds, { x: 0, z: 10 }, input);
  let state = await snapshot(currentPage);
  if (state.campaign.boss.details.mirrorSlash?.phase !== "telegraph") throw new Error("Mirror Slash did not record the completed Dash path.");
  await currentPage.screenshot({ path: path.join(directory, "03-mirror-regent-recorded-path.png"), fullPage: true });
  if (!state.presentation.bossMechanics.pathVisible) throw new Error("Mirror Slash path was not visible in Presentation state.");
  await basicTo(currentPage, bounds, { x: 15, z: 10 }, input);
  await waitForState(currentPage, (candidate) => candidate.campaign?.boss?.actionPhase === "objective", 50, 100);
  for (let hit = 0; hit < 3; hit += 1) {
    state = await snapshot(currentPage);
    const real = state.aliveEnemies.find((enemy) => enemy.id === state.campaign.boss.details.realEntityId);
    await basicThrough(currentPage, bounds, real, 6, input);
    if (hit < 2) await waitForState(currentPage, (candidate) => candidate.campaign?.boss?.actionPhase === "objective", 50, 100);
  }
}

async function solveLastConductor(currentPage, bounds, input, directory) {
  await waitForState(currentPage, (state) => state.campaign?.boss?.actionPhase === "objective", 50, 100);
  let state = await snapshot(currentPage);
  for (const id of state.campaign.boss.details.supportEntityIds) {
    state = await snapshot(currentPage);
    const support = state.aliveEnemies.find((enemy) => enemy.id === id);
    if (support) await basicThrough(currentPage, bounds, support, 3, input);
  }
  state = await waitForState(currentPage, (candidate) => candidate.campaign?.boss?.coreExposed === true, 50, 50);
  await basicThrough(currentPage, bounds, state.aliveEnemies.find((enemy) => enemy.id === state.campaign.boss.entityId), 7, input);

  state = await waitForBossPhase(currentPage, 1);
  if (state.presentation.bossMechanics.objectiveNodeCount !== 3) throw new Error("Rail Grid objective nodes are not visible.");
  await currentPage.screenshot({ path: path.join(directory, "04-last-conductor-rail-grid.png"), fullPage: true });
  for (const node of state.campaign.boss.details.objectiveNodes) await basicTo(currentPage, bounds, node.position, input);

  await waitForBossPhase(currentPage, 2);
  await basicTo(currentPage, bounds, { x: 0, z: 6 }, input);
  await chargedTo(currentPage, bounds, { x: 0, z: -11 }, input);
  await basicTo(currentPage, bounds, { x: 10, z: -7 }, input);
  await chargedTo(currentPage, bounds, { x: -10, z: -7 }, input);
  await chargedTo(currentPage, bounds, { x: 10, z: -7 }, input);
  state = await snapshot(currentPage);
  await basicThrough(currentPage, bounds, state.aliveEnemies.find((enemy) => enemy.id === state.campaign.boss.entityId), 7, input);

  state = await waitForBossPhase(currentPage, 3);
  if (state.modules.ultimateEnergy !== 100 || state.presentation.bossMechanics.objectiveNodeCount !== 3) {
    throw new Error("Vector Finale did not force full Energy and three visible nodes.");
  }
  await currentPage.screenshot({ path: path.join(directory, "05-last-conductor-vector-finale.png"), fullPage: true });
  await currentPage.keyboard.press("Space");
  input.ultimateStarts += 1;
  for (const node of state.campaign.boss.details.objectiveNodes) {
    await clickWorld(currentPage, bounds, node.position);
    input.ultimatePoints += 1;
  }
  await settleReady(currentPage);
}

async function waitForBossPhase(currentPage, phaseIndex) {
  return waitForState(currentPage, (state) => (
    state.campaign?.boss?.phaseIndex === phaseIndex && state.campaign.boss.actionPhase === "objective"
  ), 50, 160);
}

async function basicThrough(currentPage, bounds, target, extraDistance, input) {
  if (!target) throw new Error("Missing Basic Dash target.");
  const state = await snapshot(currentPage);
  const dx = target.x - state.player.x;
  const dz = target.z - state.player.z;
  const length = Math.max(0.001, Math.hypot(dx, dz));
  return basicTo(currentPage, bounds, {
    x: clamp(target.x + dx / length * extraDistance, state.arena.minX + 1, state.arena.maxX - 1),
    z: clamp(target.z + dz / length * extraDistance, state.arena.minZ + 1, state.arena.maxZ - 1),
  }, input);
}

async function basicTo(currentPage, bounds, target, input) {
  await settleReady(currentPage);
  await clickWorld(currentPage, bounds, target);
  input.clicks += 1;
  return settleReady(currentPage);
}

async function chargedTo(currentPage, bounds, target, input) {
  await settleReady(currentPage);
  const state = await snapshot(currentPage);
  const screen = projectWorldToViewport(target, state.camera, bounds);
  await currentPage.mouse.move(screen.x, screen.y);
  await currentPage.mouse.down();
  await currentPage.evaluate(() => window.advanceTime(700));
  await currentPage.mouse.up();
  input.chargedHolds += 1;
  return settleReady(currentPage);
}

async function clickWorld(currentPage, bounds, target) {
  const state = await snapshot(currentPage);
  const screen = projectWorldToViewport(target, state.camera, bounds);
  await currentPage.mouse.click(screen.x, screen.y);
}

async function settleReady(currentPage) {
  return waitForState(currentPage, (state) => state.player.action === "ready" || state.phase !== "playing", 50, 80);
}

async function waitForState(currentPage, predicate, stepMs, maximumSteps, onSpecial) {
  for (let step = 0; step < maximumSteps; step += 1) {
    const state = await snapshot(currentPage);
    if (state.phase === "dead") throw new Error(`Browser autoplayer died at ${state.campaign?.boss?.phaseId}/${state.campaign?.boss?.actionPhase}.`);
    const result = predicate(state);
    if (result === true) return state;
    if (result && onSpecial) await onSpecial(state, result);
    await currentPage.evaluate((milliseconds) => window.advanceTime(milliseconds), stepMs);
  }
  const state = await snapshot(currentPage);
  throw new Error(`Browser condition timed out at ${state.campaign?.boss?.phaseId}/${state.campaign?.boss?.actionPhase}/${state.campaign?.boss?.objectiveCurrent}.`);
}

async function snapshot(currentPage) {
  return JSON.parse(await currentPage.evaluate(() => window.render_game_to_text()));
}

async function openGame(currentPage, bossId) {
  const url = new URL(rawBaseUrl);
  url.searchParams.set("campaign", "1");
  url.searchParams.set("validation", "1");
  url.searchParams.set("deterministic", "1");
  url.searchParams.set("quality", "compatibility");
  if (bossId) url.searchParams.set("boss", bossId);
  await currentPage.goto(url.toString(), { waitUntil: "domcontentloaded" });
  await currentPage.waitForSelector("#loading.ready", { state: "attached" });
  await currentPage.waitForFunction(() => getComputedStyle(document.querySelector("#loading")).visibility === "hidden");
  await currentPage.waitForFunction(() => window.slash_validation !== undefined && window.render_game_to_text !== undefined);
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

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}
