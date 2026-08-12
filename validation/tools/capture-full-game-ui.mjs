import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.argv[2] ?? "http://127.0.0.1:5173/?campaign=1";
const outputDirectory = path.resolve(process.argv[3] ?? "validation/full-game-planning/browser");
await fs.mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const browserIssues = [];
page.on("console", (message) => {
  if (message.type() === "error") browserIssues.push({ type: "console", text: message.text() });
});
page.on("pageerror", (error) => browserIssues.push({ type: "pageerror", text: String(error) }));

const desktopUrl = new URL(baseUrl);
desktopUrl.searchParams.set("deterministic", "1");
await page.goto(desktopUrl.toString(), { waitUntil: "domcontentloaded" });
await page.waitForSelector("#loading.ready", { state: "attached" });
await page.waitForFunction(() => getComputedStyle(document.querySelector("#loading")).visibility === "hidden");
await page.screenshot({ path: path.join(outputDirectory, "01-title.png") });

await page.locator('[data-action="start-run"]').click();
await page.waitForSelector(".planning-panel");
const initialNodeCount = await page.locator(".skill-node").count();
const completeCopyCount = await page.locator(".skill-node dl").evaluateAll((lists) => (
  lists.filter((list) => list.querySelectorAll("div").length === 4).length
));
const moduleCount = await page.locator(".skill-module").count();
const routeCount = await page.locator(".route-card:not(:disabled)").count();
const map = await page.evaluate(() => ({
  acts: document.querySelectorAll(".run-map-act").length,
  nodes: document.querySelectorAll(".map-node").length,
  available: document.querySelectorAll(".map-node.state-available").length,
  legend: document.querySelector(".run-map > small")?.textContent?.trim() ?? "",
}));
await page.screenshot({ path: path.join(outputDirectory, "02-planning-board.png") });

await page.locator('.route-card:not(:disabled)').first().click();
await page.locator('[data-skill-id="skill-wide-slash-v1"]').click();
await page.locator('[data-skill-id="skill-gravity-slash-v1"]').click();
const draftCount = await page.locator(".skill-node.state-draft").count();
const pointText = await page.locator(".point-counter").innerText();
await page.screenshot({ path: path.join(outputDirectory, "03-route-and-draft.png") });

await page.locator('[data-action="confirm-planning"]').click();
await page.waitForFunction(() => document.querySelector("#campaign-ui")?.childElementCount === 0);
await page.evaluate(() => window.advanceTime?.(800));
const state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
await page.screenshot({ path: path.join(outputDirectory, "04-first-wave.png") });
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
await mobilePage.waitForSelector(".planning-panel");
const mobileLayout = await mobilePage.evaluate(() => {
  const root = document.querySelector("#campaign-ui");
  const targetSizes = [...document.querySelectorAll("#campaign-ui button")].map((button) => {
    const bounds = button.getBoundingClientRect();
    return Math.min(bounds.width, bounds.height);
  }).filter((size) => size > 0);
  const smallestTarget = Math.min(...targetSizes);
  return {
    viewportWidth: document.documentElement.clientWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
    rootClientWidth: root?.clientWidth ?? 0,
    rootScrollWidth: root?.scrollWidth ?? 0,
    smallestTarget,
  };
});
await mobilePage.screenshot({ path: path.join(outputDirectory, "05-mobile-planning.png") });

const mobileFits = mobileLayout.documentScrollWidth <= mobileLayout.viewportWidth + 1 &&
  mobileLayout.rootScrollWidth <= mobileLayout.rootClientWidth + 1 &&
  mobileLayout.smallestTarget >= 44;

const report = {
  ok: browserIssues.length === 0 && initialNodeCount === 28 && completeCopyCount === 28 && moduleCount === 4 && routeCount === 2 && draftCount === 2 && state.campaign?.phase === "combat" && state.aliveEnemies.length > 0 && mobileFits,
  initialNodeCount,
  completeCopyCount,
  moduleCount,
  routeCount,
  draftCount,
  pointText,
  campaignPhase: state.campaign?.phase,
  aliveEnemies: state.aliveEnemies.length,
  waveStates: state.campaign?.encounter?.waves.map((wave) => wave.status),
  mobileLayout,
  mobileFits,
  browserIssues,
  map,
};
report.ok = report.ok && map.acts === 4 && map.nodes >= 48 && map.available === 2 && map.legend.includes("首领");
await fs.writeFile(path.join(outputDirectory, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
await browser.close();

if (!report.ok) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
console.log(JSON.stringify(report, null, 2));
