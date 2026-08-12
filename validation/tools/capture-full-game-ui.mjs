import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.argv[2] ?? "http://127.0.0.1:5173/?campaign=1";
const outputDirectory = path.resolve(process.argv[3] ?? "validation/redesign-v2/skill-ui");
await fs.mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const browserIssues = [];
page.on("console", (message) => {
  if (message.type() === "error") browserIssues.push({ type: "console", text: message.text() });
});
page.on("pageerror", (error) => browserIssues.push({ type: "pageerror", text: String(error) }));

const desktopUrl = new URL(baseUrl);
desktopUrl.searchParams.set("deterministic", "1");
desktopUrl.searchParams.set("validation", "1");
desktopUrl.searchParams.set("campaign", "1");
await page.goto(desktopUrl.toString(), { waitUntil: "domcontentloaded" });
await page.waitForSelector("#loading.ready", { state: "attached" });
await page.waitForFunction(() => getComputedStyle(document.querySelector("#loading")).visibility === "hidden");
const titleBefore = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
await page.waitForTimeout(1_000);
const titleAfter = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
await page.screenshot({ path: path.join(outputDirectory, "01-title.png") });

await page.locator('[data-action="start-run"]').click();
await page.waitForFunction(() => document.querySelector("#campaign-ui")?.childElementCount === 0);
await page.evaluate(() => window.advanceTime?.(800));
const combat = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
const hud = await page.evaluate(() => ({
  energyText: document.querySelector("#energy-label")?.textContent ?? "",
  energyFill: getComputedStyle(document.querySelector("#energy-fill")).transform,
  vectorText: document.querySelector("#vector-label")?.textContent ?? "",
}));
const forbiddenTerms = ["Draft", "Committed", "SP", "Seed", "Effect", "Trigger", "Limit", "Prerequisite", "INBOUND"];
const documentTermsAbsent = await page.evaluate((terms) => (
  terms.every((term) => !document.body.innerText.includes(term))
), forbiddenTerms);
await page.screenshot({ path: path.join(outputDirectory, "02-combat.png") });

await page.evaluate(() => window.slash_validation?.clearCampaignEncounter());
await page.waitForSelector(".upgrade-choice-panel");
const rewardBefore = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
const rewardCards = await page.locator(".upgrade-choice-card").count();
const rewardCopy = await page.locator(".upgrade-choice-card").evaluateAll((cards) => cards.map((card) => ({
  name: card.querySelector("strong")?.textContent?.trim() ?? "",
  effect: card.querySelector("span")?.textContent?.trim() ?? "",
})));
await page.screenshot({ path: path.join(outputDirectory, "03-upgrade-choice.png") });
await page.locator(".upgrade-choice-card").first().click();
await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).campaign?.phase === "combat");
const afterChoice = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
await page.screenshot({ path: path.join(outputDirectory, "04-next-combat.png") });
await page.close();

const mobilePage = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
mobilePage.on("console", (message) => {
  if (message.type() === "error") browserIssues.push({ type: "mobile-console", text: message.text() });
});
mobilePage.on("pageerror", (error) => browserIssues.push({ type: "mobile-pageerror", text: String(error) }));
await mobilePage.goto(desktopUrl.toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
await mobilePage.waitForSelector("#loading.ready", { state: "attached" });
await mobilePage.waitForFunction(() => getComputedStyle(document.querySelector("#loading")).visibility === "hidden");
await mobilePage.locator('[data-action="start-run"]').click();
await mobilePage.waitForFunction(() => document.querySelector("#campaign-ui")?.childElementCount === 0);
const mobileLayout = await mobilePage.evaluate(() => {
  return {
    viewportWidth: document.documentElement.clientWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
  };
});
await mobilePage.screenshot({ path: path.join(outputDirectory, "05-mobile-combat.png") });

const mobileFits = mobileLayout.documentScrollWidth <= mobileLayout.viewportWidth + 1;

const report = {
  ok: browserIssues.length === 0 &&
    titleBefore.campaign?.phase === "title" &&
    titleAfter.campaign?.phase === "title" &&
    combat.campaign?.phase === "combat" &&
    combat.aliveEnemies.length > 0 &&
    documentTermsAbsent &&
    rewardBefore.campaign?.phase === "upgrade-choice" &&
    rewardCards === 3 &&
    rewardCopy.every((card) => card.name && card.effect) &&
    afterChoice.campaign?.phase === "combat" &&
    afterChoice.run.selectedUpgrades.length === 1 &&
    hud.energyText.includes("能量") &&
    mobileFits,
  titleStayedIdle: titleBefore.campaign?.phase === "title" && titleAfter.campaign?.phase === "title",
  campaignPhase: combat.campaign?.phase,
  aliveEnemies: combat.aliveEnemies.length,
  waveStates: combat.campaign?.encounter?.waves.map((wave) => wave.status),
  hud,
  rewardCards,
  rewardCopy,
  selectedSkillIds: afterChoice.run.selectedUpgrades,
  mobileLayout,
  mobileFits,
  browserIssues,
};
await fs.writeFile(path.join(outputDirectory, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
await browser.close();

if (!report.ok) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
console.log(JSON.stringify(report, null, 2));
