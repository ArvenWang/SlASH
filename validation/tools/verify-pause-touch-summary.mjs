import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.argv[2] ?? "http://127.0.0.1:5173/";
const outputDirectory = path.resolve(process.argv[3] ?? "validation/full-game/pause-touch-summary");
await fs.mkdir(outputDirectory, { recursive: true });
const issues = [];
const browser = await chromium.launch({ headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader"] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const page = await context.newPage();
page.on("console", (message) => { if (message.type() === "error") issues.push(message.text()); });
page.on("pageerror", (error) => issues.push(String(error)));

const url = new URL(baseUrl);
url.searchParams.set("campaign", "1");
url.searchParams.set("validation", "1");
url.searchParams.set("deterministic", "1");
url.searchParams.set("quality", "compatibility");
await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => document.querySelector("#loading")?.classList.contains("ready"));
await page.locator('[data-action="start-run"]').click();
await page.locator('[data-action="select-route"]').first().click();
await page.locator('[data-action="skill"][data-node-state="available"]').first().click();
await page.locator('[data-action="confirm-planning"]').click();
await page.keyboard.press("Escape");
const pause = await page.evaluate(() => ({
  visible: Boolean(document.querySelector(".pause-panel")),
  text: document.querySelector(".pause-panel")?.textContent ?? "",
  width: document.querySelector(".pause-panel")?.getBoundingClientRect().width ?? 0,
  documentWidth: document.documentElement.scrollWidth,
  viewportWidth: document.documentElement.clientWidth,
  minimumButton: Math.min(...[...document.querySelectorAll(".pause-panel button")].map((button) => {
    const rect = button.getBoundingClientRect();
    return Math.min(rect.width, rect.height);
  })),
}));
await page.screenshot({ path: path.join(outputDirectory, "01-pause-mobile.png"), fullPage: true });
await page.locator('[data-action="resume-game"]').click();
const resumed = JSON.parse(await page.evaluate(() => window.render_game_to_text()));

await page.evaluate(() => {
  window.slash_validation.setUltimateScenario();
  window.advanceTime(1);
});
const ultimateSize = await page.evaluate(() => {
  const rect = document.querySelector("#touch-ultimate").getBoundingClientRect();
  return { width: rect.width, height: rect.height };
});
await page.locator("#touch-ultimate").click();
await page.evaluate(() => window.advanceTime(1));
const cancelSize = await page.evaluate(() => {
  const rect = document.querySelector("#touch-cancel").getBoundingClientRect();
  return { width: rect.width, height: rect.height };
});
await page.locator("#touch-cancel").click();
const touchButtons = { ultimateSize, cancelSize };

await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForFunction(() => document.querySelector("#loading")?.classList.contains("ready"));
await page.locator('[data-action="start-run"]').click();
await page.locator('[data-action="select-route"]').first().click();
await page.locator('[data-action="confirm-planning"]').click();
await page.keyboard.press("Escape");
await page.locator('[data-action="abandon-run"]').click();
const abandoned = JSON.parse(await page.evaluate(() => window.render_game_to_text()));

const gates = {
  pauseVisibleAndClear: pause.visible && pause.text.includes("当前构筑") && pause.text.includes("放弃本局"),
  pauseMobileFits: pause.documentWidth <= pause.viewportWidth + 1 && pause.width > 0 && pause.minimumButton >= 44,
  resumeReturnsToCombat: resumed.phase === "playing" && !await page.locator(".pause-panel").count(),
  touchControlsMeetTarget: touchButtons.ultimateSize.width >= 44 && touchButtons.ultimateSize.height >= 44 && touchButtons.cancelSize.width >= 44 && touchButtons.cancelSize.height >= 44,
  abandonReturnsToTitle: abandoned.campaign?.phase === "title",
  browserClean: issues.length === 0,
};
const report = { ok: Object.values(gates).every(Boolean), gates, pause, touchButtons, issues };
await fs.writeFile(path.join(outputDirectory, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
await browser.close();
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exit(1);
