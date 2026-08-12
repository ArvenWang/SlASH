import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.argv[2] ?? "http://127.0.0.1:5173/";
const outputDirectory = path.resolve(process.argv[3] ?? "validation/full-game/profile-protocol-browser");
await fs.mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader"],
});
const browserIssues = [];
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
page.on("console", (message) => {
  if (message.type() === "error") browserIssues.push({ type: "console", text: message.text() });
});
page.on("pageerror", (error) => browserIssues.push({ type: "pageerror", text: String(error) }));

await openGame(page);
const title = await layoutSnapshot(page);
const threatButtonsLocked = await page.locator(".threat-level").evaluateAll((buttons) => (
  buttons.length === 5 && buttons.every((button) => button.disabled)
));
await page.screenshot({ path: path.join(outputDirectory, "01-title-protocols.png"), fullPage: true });

await page.locator('[data-action="configure-protocol"][data-mode="assist"]').click();
const assistConfigured = (await snapshot(page)).campaign?.protocol;
await page.locator('[data-action="start-run"]').click();
await page.locator('[data-action="select-route"]').first().click();
await page.locator('[data-action="confirm-planning"]').click();
const assistCombat = await snapshot(page);
const assistDefeat = await advanceUntil(page, (state) => state.phase === "dead", 500, 50);
const assistDefeatText = await page.locator("#campaign-ui").innerText();
await page.screenshot({ path: path.join(outputDirectory, "02-assist-reboot.png"), fullPage: true });
await page.locator('[data-action="restart-encounter"]').click();
const assistRestarted = await snapshot(page);
await advanceUntil(page, (state) => state.phase === "dead", 500, 50);
const noSecondReboot = await page.locator('[data-action="restart-encounter"]').count() === 0;
await page.locator('[data-action="return-to-title"]').click();

await page.locator('[data-action="title-view"][data-view="dossier"]').click();
const dossier = {
  cards: await page.locator(".dossier-card").count(),
  lockedCards: await page.locator(".dossier-card.locked").count(),
  copy: await page.locator(".library-header").innerText(),
};
await page.screenshot({ path: path.join(outputDirectory, "03-dossier.png"), fullPage: true });
await page.locator('[data-action="title-view"][data-view="main"]').click();
await page.locator('[data-action="title-view"][data-view="settings"]').click();
await page.locator('[data-action="setting"][data-setting="highContrast"]').click();
await page.locator('[data-action="setting"][data-setting="reducedMotion"]').click();
await page.locator('[data-action="setting"][data-setting="audioEnabled"]').click();
const settings = await page.evaluate(() => ({
  highContrast: document.body.classList.contains("high-contrast"),
  reducedMotion: document.body.classList.contains("reduced-motion"),
  profileRaw: localStorage.getItem("project-slash:profile:v1"),
}));
await page.screenshot({ path: path.join(outputDirectory, "04-settings.png"), fullPage: true });

await page.setViewportSize({ width: 390, height: 844 });
await page.locator('[data-action="title-view"][data-view="main"]').click();
const mobile = await layoutSnapshot(page);
await page.screenshot({ path: path.join(outputDirectory, "05-title-mobile.png"), fullPage: true });

const corruptionContext = await browser.newContext({ viewport: { width: 900, height: 720 } });
await corruptionContext.addInitScript(() => localStorage.setItem("project-slash:profile:v1", "{broken"));
const corruptionPage = await corruptionContext.newPage();
corruptionPage.on("dialog", (dialog) => dialog.accept());
corruptionPage.on("console", (message) => {
  if (message.type() === "error") browserIssues.push({ type: "corrupt-console", text: message.text() });
});
corruptionPage.on("pageerror", (error) => browserIssues.push({ type: "corrupt-pageerror", text: String(error) }));
await openGame(corruptionPage);
await corruptionPage.locator('[data-action="title-view"][data-view="settings"]').click();
const corruptionMessage = await corruptionPage.locator(".profile-recovery").innerText();
await corruptionPage.locator('[data-action="rebuild-profile"]').click();
const corruptionRecovery = await corruptionPage.evaluate(() => ({
  current: localStorage.getItem("project-slash:profile:v1"),
  backupKeys: Object.keys(localStorage).filter((key) => key.startsWith("project-slash:profile:corrupt-backup:")),
}));
await corruptionContext.close();

const gates = {
  titleFits: title.documentScrollWidth <= title.viewportWidth + 1 && title.minimumButtonSide >= 44,
  threatLockedBeforeStandardClear: threatButtonsLocked,
  assistConfiguredExactly: assistConfigured?.mode === "assist" &&
    assistConfigured.assistRebootsRemaining === 1 &&
    assistConfigured.leaderboardEligible === false,
  assistCombatKeepsProtocol: assistCombat.campaign?.protocol?.mode === "assist",
  assistDeathShowsExplicitReboot: assistDefeat.phase === "dead" && assistDefeatText.includes("可以重启"),
  assistRebootConsumedOnce: assistRestarted.phase === "playing" &&
    assistRestarted.attempt === 2 &&
    assistRestarted.campaign?.protocol?.assistRebootsRemaining === 0 &&
    noSecondReboot,
  dossierCompleteAndLockedByDiscovery: dossier.cards === 18 && dossier.lockedCards >= 16 && dossier.copy.includes("不提供永久战斗加成"),
  settingsApplyAndPersist: settings.highContrast && settings.reducedMotion && typeof settings.profileRaw === "string" && settings.profileRaw.includes('"audioEnabled":false'),
  mobileFits: mobile.documentScrollWidth <= mobile.viewportWidth + 1 && mobile.minimumButtonSide >= 44,
  corruptProfilePreservedThenBackedUp: corruptionMessage.includes("原始档案已保留") &&
    corruptionRecovery.backupKeys.length === 1 &&
    typeof corruptionRecovery.current === "string" &&
    corruptionRecovery.current !== "{broken",
  browserClean: browserIssues.length === 0,
};
const report = {
  ok: Object.values(gates).every(Boolean),
  gates,
  title,
  assistConfigured,
  assistRestarted: {
    phase: assistRestarted.phase,
    attempt: assistRestarted.attempt,
    protocol: assistRestarted.campaign?.protocol,
  },
  dossier,
  settings: { highContrast: settings.highContrast, reducedMotion: settings.reducedMotion },
  mobile,
  corruptionRecovery: { backupCount: corruptionRecovery.backupKeys.length },
  browserIssues,
};
await fs.writeFile(path.join(outputDirectory, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
await context.close();
await browser.close();
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exit(1);

async function openGame(targetPage) {
  const url = new URL(baseUrl);
  url.searchParams.set("campaign", "1");
  url.searchParams.set("validation", "1");
  url.searchParams.set("deterministic", "1");
  url.searchParams.set("quality", "compatibility");
  await targetPage.goto(url.toString(), { waitUntil: "domcontentloaded" });
  await targetPage.waitForFunction(() => document.querySelector("#loading")?.classList.contains("ready"));
}

async function snapshot(targetPage) {
  return JSON.parse(await targetPage.evaluate(() => window.render_game_to_text()));
}

async function advanceUntil(targetPage, predicate, stepMs, maximumSteps) {
  for (let step = 0; step < maximumSteps; step += 1) {
    const state = await snapshot(targetPage);
    if (predicate(state)) return state;
    await targetPage.evaluate((milliseconds) => window.advanceTime(milliseconds), stepMs);
  }
  throw new Error(`Browser state condition timed out at ${(await snapshot(targetPage)).phase}.`);
}

async function layoutSnapshot(targetPage) {
  return targetPage.evaluate(() => {
    const buttonSides = [...document.querySelectorAll("#campaign-ui button")].map((button) => {
      const bounds = button.getBoundingClientRect();
      return Math.min(bounds.width, bounds.height);
    });
    return {
      viewportWidth: document.documentElement.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      minimumButtonSide: buttonSides.length > 0 ? Math.min(...buttonSides) : 0,
    };
  });
}
