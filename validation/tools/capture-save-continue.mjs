import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const rawBaseUrl = process.argv[2] ?? "http://127.0.0.1:5173/";
const outputDirectory = path.resolve(process.argv[3] ?? "validation/save-continue/browser");
const storageKey = "project-slash:run-save:v1";
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

async function waitForApplication() {
  await page.waitForSelector("#loading.ready", { state: "attached" });
  await page.waitForFunction(() => getComputedStyle(document.querySelector("#loading")).visibility === "hidden");
}

await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
await waitForApplication();
await page.evaluate(() => window.localStorage.clear());
await page.reload({ waitUntil: "domcontentloaded" });
await waitForApplication();
const initialContinueCount = await page.locator('[data-action="continue-run"]').count();

await page.locator('[data-action="start-run"]').click();
await page.waitForSelector(".planning-panel");
await page.locator(".route-card").first().click();
await page.locator('[data-skill-id="skill-wide-slash-v1"]').click();
const beforeReload = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
const rawBeforeCombat = await page.evaluate((key) => window.localStorage.getItem(key), storageKey);
await page.screenshot({ path: path.join(outputDirectory, "01-saved-planning.png"), fullPage: true });

await page.reload({ waitUntil: "domcontentloaded" });
await waitForApplication();
await page.waitForSelector('[data-action="continue-run"]');
const continueSummary = await page.locator(".continue-summary").innerText();
await page.screenshot({ path: path.join(outputDirectory, "02-title-continue.png"), fullPage: true });
await page.locator('[data-action="continue-run"]').click();
await page.waitForSelector(".planning-panel");
const afterContinue = JSON.parse(await page.evaluate(() => window.render_game_to_text()));

await page.locator('[data-action="confirm-planning"]').click();
await page.waitForFunction(() => {
  const raw = window.render_game_to_text?.();
  return raw ? JSON.parse(raw).campaign?.phase === "combat" : false;
});
const rawDuringCombat = await page.evaluate((key) => window.localStorage.getItem(key), storageKey);

await page.reload({ waitUntil: "domcontentloaded" });
await waitForApplication();
await page.locator('[data-action="continue-run"]').click();
await page.waitForSelector(".planning-panel");
const resumedFromCombat = JSON.parse(await page.evaluate(() => window.render_game_to_text()));

await page.evaluate((key) => window.localStorage.setItem(key, "{broken-save"), storageKey);
await page.reload({ waitUntil: "domcontentloaded" });
await waitForApplication();
const invalidMessage = await page.locator(".save-error").innerText();
const invalidContinueCount = await page.locator('[data-action="continue-run"]').count();
const invalidRawAfterRender = await page.evaluate((key) => window.localStorage.getItem(key), storageKey);
await page.screenshot({ path: path.join(outputDirectory, "03-invalid-save-preserved.png"), fullPage: true });

const gates = {
  noContinueWithoutSave: initialContinueCount === 0,
  planningSaveWritten: typeof rawBeforeCombat === "string" && rawBeforeCombat.length > 500,
  continueRestoresSeed: afterContinue.run.seed === beforeReload.run.seed,
  continueRestoresRouteDraft: afterContinue.campaign?.provisionalRouteNodeId === beforeReload.campaign?.provisionalRouteNodeId,
  continueRestoresSkillDraft: JSON.stringify(afterContinue.campaign?.draftAddedSkillIds) === JSON.stringify(beforeReload.campaign?.draftAddedSkillIds),
  combatDoesNotOverwriteSafeSave: rawDuringCombat === rawBeforeCombat,
  combatReloadReturnsToSafePlanning: resumedFromCombat.campaign?.phase === "planning" && resumedFromCombat.campaign?.provisionalRouteNodeId === beforeReload.campaign?.provisionalRouteNodeId,
  invalidSaveShowsExplicitError: invalidContinueCount === 1 && invalidMessage.includes("存档不是有效 JSON"),
  invalidSaveRawPreserved: invalidRawAfterRender === "{broken-save",
  browserClean: browserIssues.length === 0,
};
const report = {
  ok: Object.values(gates).every(Boolean),
  gates,
  continueSummary,
  beforeReload: {
    seed: beforeReload.run.seed,
    provisionalRouteNodeId: beforeReload.campaign?.provisionalRouteNodeId,
    draftAddedSkillIds: beforeReload.campaign?.draftAddedSkillIds,
  },
  afterContinue: {
    seed: afterContinue.run.seed,
    phase: afterContinue.campaign?.phase,
    provisionalRouteNodeId: afterContinue.campaign?.provisionalRouteNodeId,
    draftAddedSkillIds: afterContinue.campaign?.draftAddedSkillIds,
  },
  invalidMessage,
  browserIssues,
};

await fs.writeFile(path.join(outputDirectory, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
await browser.close();
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exit(1);
