import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const rawBaseUrl = process.argv[2] ?? "http://127.0.0.1:5173/";
const outputDirectory = path.resolve(process.argv[3] ?? "validation/encounter-content/browser");
await fs.mkdir(outputDirectory, { recursive: true });

const url = new URL(rawBaseUrl);
url.searchParams.set("campaign", "1");
url.searchParams.set("validation", "1");
const browserIssues = [];
const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
page.on("console", (message) => {
  if (message.type() === "error") browserIssues.push({ type: "console", text: message.text() });
});
page.on("pageerror", (error) => browserIssues.push({ type: "pageerror", text: String(error) }));

await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
await page.waitForSelector("#loading.ready", { state: "attached" });
await page.waitForFunction(() => getComputedStyle(document.querySelector("#loading")).visibility === "hidden");
await page.waitForFunction(() => window.slash_validation !== undefined);

await page.evaluate(() => window.slash_validation?.setCampaignChallengeScenario("encounter-act3-silent-mirror-v1"));
await page.waitForSelector(".planning-panel .route-card.selected");
const planningCopy = await page.locator(".route-card.selected").innerText();
const challengeContract = await page.locator(".route-card.selected .challenge-contract").innerText();
const exactThreatLines = await page.locator(".route-card.selected small").allTextContents();
await page.screenshot({ path: path.join(outputDirectory, "01-challenge-planning.png"), fullPage: true });

await clickCampaign(page, '[data-action="confirm-planning"]');
await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).campaign?.phase === "combat");
await page.evaluate(() => window.advanceTime(800));
const combatStart = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
const hudAtStart = await page.locator("#enemy-label").innerText();
await page.screenshot({ path: path.join(outputDirectory, "02-challenge-hud.png"), fullPage: true });

let combatSteps = 0;
for (; combatSteps < 120; combatSteps += 1) {
  const snapshot = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  if (snapshot.campaign?.phase === "reward") break;
  if (snapshot.phase === "dead") throw new Error(`Challenge browser run died after ${combatSteps} steps.`);
  const target = snapshot.aliveEnemies[0];
  if (target && snapshot.player.action === "ready") {
    const extended = extendThroughTarget(snapshot.player, target, snapshot.arena);
    await page.evaluate(({ x, z }) => window.slash_validation?.dashTo(x, z), extended);
  }
  await page.evaluate(() => window.advanceTime(250));
}

await page.waitForSelector(".reward-panel");
const reward = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
const rewardCopy = await page.locator(".challenge-result").innerText();
await page.screenshot({ path: path.join(outputDirectory, "03-challenge-reward.png"), fullPage: true });

await page.setViewportSize({ width: 390, height: 844 });
await page.evaluate(() => window.slash_validation?.setCampaignChallengeScenario("encounter-act4-breach-terminal-v1"));
await page.waitForSelector(".planning-panel .route-card.selected");
const mobileLayout = await page.evaluate(() => {
  const root = document.querySelector("#campaign-ui");
  const selectedCard = document.querySelector(".route-card.selected");
  return {
    viewportWidth: document.documentElement.clientWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
    rootClientWidth: root?.clientWidth ?? 0,
    rootScrollWidth: root?.scrollWidth ?? 0,
    selectedCardWidth: selectedCard?.getBoundingClientRect().width ?? 0,
  };
});
await page.screenshot({ path: path.join(outputDirectory, "04-mobile-challenge-planning.png"), fullPage: true });

const gates = {
  planningShowsCondition: planningCopy.includes("不执行 Ultimate") && challengeContract.includes("CONDITION"),
  planningShowsExactReward: challengeContract.includes("Intel +1"),
  planningShowsExactThreatCounts: exactThreatLines.some((line) => line.includes("HOSTILES") && line.includes("PRESSURE")) &&
    exactThreatLines.some((line) => line.includes("ARMOR") && line.includes("PROJECTILE") && line.includes("OBSTACLE") && line.includes("HAZARD")),
  combatUsesExactTemplate: combatStart.encounter.id === "encounter-act3-silent-mirror-v1",
  combatShowsLiveChallengeHud: hudAtStart.includes("SILENT MIRROR") && hudAtStart.includes("ULTIMATE UNUSED"),
  realCombatReachedReward: reward.campaign?.phase === "reward" && combatSteps < 120,
  challengeSucceededWithoutUltimate: rewardCopy.includes("CHALLENGE SUCCEEDED") && reward.campaign?.challenge === null,
  exactResourceGranted: reward.campaign?.resources.intel === 1,
  mobileLayoutFits: mobileLayout.documentScrollWidth <= mobileLayout.viewportWidth + 1 &&
    mobileLayout.rootScrollWidth <= mobileLayout.rootClientWidth + 1 && mobileLayout.selectedCardWidth > 0,
  browserClean: browserIssues.length === 0,
};
const report = {
  ok: Object.values(gates).every(Boolean),
  gates,
  planning: { challengeContract, exactThreatLines },
  combat: {
    encounterId: combatStart.encounter.id,
    challenge: combatStart.campaign?.challenge,
    hudAtStart,
    combatSteps,
  },
  reward: {
    copy: rewardCopy,
    resources: reward.campaign?.resources,
  },
  mobileLayout,
  browserIssues,
};

await fs.writeFile(path.join(outputDirectory, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
await browser.close();
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exit(1);

async function clickCampaign(currentPage, selector) {
  const locator = currentPage.locator(selector);
  await locator.waitFor({ state: "visible" });
  await locator.scrollIntoViewIfNeeded();
  await locator.click({ force: true });
}

function extendThroughTarget(player, target, arena) {
  const dx = target.x - player.x;
  const dz = target.z - player.z;
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

