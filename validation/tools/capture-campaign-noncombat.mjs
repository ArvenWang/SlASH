import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const rawBaseUrl = process.argv[2] ?? "http://127.0.0.1:5173/";
const outputDirectory = path.resolve(process.argv[3] ?? "validation/campaign-noncombat/browser");
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

async function clickCampaign(selector) {
  const locator = page.locator(selector);
  await locator.waitFor({ state: "visible" });
  await locator.evaluate((element) => {
    const root = document.querySelector("#campaign-ui");
    if (!(root instanceof HTMLElement)) return;
    const rootBounds = root.getBoundingClientRect();
    const bounds = element.getBoundingClientRect();
    root.scrollTop += bounds.top - rootBounds.top - root.clientHeight * 0.45;
    root.scrollLeft += bounds.left - rootBounds.left - root.clientWidth * 0.45;
  });
  await page.waitForTimeout(50);
  const bounds = await locator.boundingBox();
  if (!bounds) throw new Error(`Campaign control has no click bounds: ${selector}`);
  if (
    bounds.x + bounds.width <= 0 || bounds.x >= page.viewportSize().width ||
    bounds.y + bounds.height <= 0 || bounds.y >= page.viewportSize().height
  ) {
    const scroll = await page.locator("#campaign-ui").evaluate((root) => ({
      top: root.scrollTop,
      left: root.scrollLeft,
      height: root.clientHeight,
      width: root.clientWidth,
      scrollHeight: root.scrollHeight,
      scrollWidth: root.scrollWidth,
    }));
    throw new Error(`Campaign control remained outside the viewport after scrolling: ${selector} ${JSON.stringify({ bounds, scroll })}`);
  }
  await locator.click({ force: true });
}

await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
await page.waitForSelector("#loading.ready", { state: "attached" });
await page.waitForFunction(() => getComputedStyle(document.querySelector("#loading")).visibility === "hidden");
await page.waitForFunction(() => window.slash_validation !== undefined);

await page.evaluate(() => window.slash_validation?.setCampaignEventScenario());
await page.waitForSelector(".event-panel");
const eventChoiceCount = await page.locator(".event-choice").count();
const eventDescriptions = await page.locator(".event-choice p").count();
const eventBefore = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
await page.screenshot({ path: path.join(outputDirectory, "01-event-choice.png"), fullPage: true });
await clickCampaign(".event-choice:first-of-type");
await page.waitForSelector(".reward-panel");
const eventAfter = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
await page.screenshot({ path: path.join(outputDirectory, "02-event-reward.png"), fullPage: true });

await page.evaluate(() => window.slash_validation?.setCampaignForgeScenario());
await page.waitForSelector(".forge-panel");
const forgeNodeCount = await page.locator(".forge-panel .skill-node").count();
const forgeDescriptionCount = await page.locator(".forge-panel .skill-node dl").count();
const forgeInitial = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
await page.screenshot({ path: path.join(outputDirectory, "03-forge-initial.png"), fullPage: true });

await clickCampaign('[data-skill-id="skill-wide-slash-v1"]');
const forgeAfterCascade = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
await clickCampaign('[data-skill-id="skill-refraction-v1"]');
const forgeBlockedAtLimit = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
await clickCampaign('[data-action="use-forge-token"]');
await clickCampaign('[data-skill-id="skill-refraction-v1"]');
await clickCampaign('[data-skill-id="skill-curve-dash-v1"]');
await clickCampaign('[data-skill-id="skill-cross-execution-v1"]');
await clickCampaign('[data-skill-id="skill-echo-slash-v1"]');
const forgeDraft = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
await page.screenshot({ path: path.join(outputDirectory, "04-forge-rewired.png"), fullPage: true });
await clickCampaign('[data-action="confirm-forge"]');
await page.waitForSelector(".reward-panel");
const forgeAfter = JSON.parse(await page.evaluate(() => window.render_game_to_text()));

await page.setViewportSize({ width: 390, height: 844 });
await page.evaluate(() => window.slash_validation?.setCampaignForgeScenario());
await page.waitForSelector(".forge-panel");
const mobileLayout = await page.evaluate(() => {
  const root = document.querySelector("#campaign-ui");
  const visibleButtons = [...document.querySelectorAll("#campaign-ui button")]
    .map((button) => button.getBoundingClientRect())
    .filter((bounds) => bounds.width > 0 && bounds.height > 0);
  return {
    viewportWidth: document.documentElement.clientWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
    rootClientWidth: root?.clientWidth ?? 0,
    rootScrollWidth: root?.scrollWidth ?? 0,
    smallestTarget: Math.min(...visibleButtons.map((bounds) => Math.min(bounds.width, bounds.height))),
  };
});
await page.screenshot({ path: path.join(outputDirectory, "05-forge-mobile.png"), fullPage: true });

const mobileFits = mobileLayout.documentScrollWidth <= mobileLayout.viewportWidth + 1 &&
  mobileLayout.rootScrollWidth <= mobileLayout.rootClientWidth + 1 &&
  mobileLayout.smallestTarget >= 44;
const gates = {
  eventHasTwoFullyDescribedChoices: eventChoiceCount === 2 && eventDescriptions === 2,
  eventStartsWithoutHostiles: eventBefore.campaign?.phase === "event" && eventBefore.aliveEnemies.length === 0,
  eventResolvesOnceIntoReward: eventAfter.campaign?.phase === "reward" && eventAfter.campaign?.eventHistoryCount === 1,
  forgeShowsCompleteTreeCopy: forgeNodeCount === 28 && forgeDescriptionCount === 28,
  forgeStartsWithRealCommittedBuild: forgeInitial.campaign?.committedSkillIds.length === 3,
  forgeCascadeConsumesTwoMoves: forgeAfterCascade.campaign?.forge.movesUsed === 2,
  forgeBlocksThirdMoveBeforeToken: forgeBlockedAtLimit.campaign?.forge.movesUsed === 2,
  forgeTokenAddsOneMove: forgeDraft.campaign?.forge.moveLimit === 3 && forgeDraft.campaign?.resources.rerouteTokens === 0,
  forgeRewirePreservesThreePoints: forgeDraft.campaign?.skillPoints.spent === 3 && forgeDraft.campaign?.skillPoints.unspent === 0,
  forgeCommitContinuesToReward: forgeAfter.campaign?.phase === "reward" && forgeAfter.campaign?.committedSkillIds.length === 3,
  mobileLayoutFits: mobileFits,
  browserClean: browserIssues.length === 0,
};
const report = {
  ok: Object.values(gates).every(Boolean),
  gates,
  event: {
    definitionId: eventBefore.campaign?.activeEventDefinitionId,
    resourceAfter: eventAfter.campaign?.resources,
    historyCount: eventAfter.campaign?.eventHistoryCount,
  },
  forge: {
    initialCommitted: forgeInitial.campaign?.committedSkillIds,
    cascade: forgeAfterCascade.campaign?.forge,
    blocked: forgeBlockedAtLimit.campaign?.forge,
    draft: {
      forge: forgeDraft.campaign?.forge,
      resources: forgeDraft.campaign?.resources,
      added: forgeDraft.campaign?.draftAddedSkillIds,
      removed: forgeDraft.campaign?.draftRemovedSkillIds,
    },
    finalCommitted: forgeAfter.campaign?.committedSkillIds,
  },
  mobileLayout,
  browserIssues,
};

await fs.writeFile(path.join(outputDirectory, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
await browser.close();
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exit(1);
