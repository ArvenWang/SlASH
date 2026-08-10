import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const rawBaseUrl = process.argv[2] ?? "http://127.0.0.1:4174/";
const url = new URL(rawBaseUrl);
url.searchParams.set("deterministic", "1");
url.searchParams.set("validation", "1");
const outputDirectory = path.resolve(process.argv[3] ?? "validation/kill-timeline");
await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
const browserIssues = [];
page.on("console", (message) => {
  if (message.type() === "error") browserIssues.push({ type: "console", text: message.text() });
});
page.on("pageerror", (error) => browserIssues.push({ type: "pageerror", text: error.message }));

await page.goto(url.toString(), { waitUntil: "networkidle" });
await page.waitForFunction(() => window.slash_validation && typeof window.render_game_to_text === "function");
await page.evaluate(() => {
  window.slash_validation?.setStage(2);
  window.slash_validation?.setEnemyMotion(false);
  window.advanceTime(1000);
});
await page.screenshot({ path: path.join(outputDirectory, "t-clean-stage3.png") });
const cleanState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));

await page.evaluate(() => {
  window.slash_validation?.dashTo(-19, -8);
  window.advanceTime(700);
});
await page.screenshot({ path: path.join(outputDirectory, "t-000-ready-at-row.png") });
const setupState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));

await page.evaluate(() => window.slash_validation?.dashTo(19, -8));
await page.screenshot({ path: path.join(outputDirectory, "t-000-input.png") });

const captures = [
  { label: "t-033-dash", deltaMs: 33 },
  { label: "t-083-cut", deltaMs: 50 },
  { label: "t-150-separation", deltaMs: 67 },
  { label: "t-317-corpse", deltaMs: 167 },
  { label: "t-650-settle", deltaMs: 333 },
];
const states = [];
let elapsedMs = 0;
for (const capture of captures) {
  elapsedMs += capture.deltaMs;
  await page.evaluate((deltaMs) => window.advanceTime(deltaMs), capture.deltaMs);
  await page.screenshot({ path: path.join(outputDirectory, `${capture.label}.png`) });
  states.push({
    elapsedMs,
    label: capture.label,
    state: JSON.parse(await page.evaluate(() => window.render_game_to_text())),
  });
}

const report = {
  url: url.toString(),
  capturedAt: new Date().toISOString(),
  viewport: { width: 1600, height: 900, deviceScaleFactor: 1 },
  cleanState,
  setupState,
  captures: states,
  browserIssues,
};
await writeFile(path.join(outputDirectory, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
await browser.close();

console.log(JSON.stringify({ outputDirectory, browserIssues, frames: states.map(({ elapsedMs, label }) => ({ elapsedMs, label })) }));
if (browserIssues.length > 0) process.exitCode = 1;
