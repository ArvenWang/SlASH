import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.argv[2] ?? "http://127.0.0.1:4174/";
const outputDirectory = path.resolve(process.argv[3] ?? "validation/current");
await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
const browserIssues = [];
page.on("console", (message) => {
  if (message.type() === "error") browserIssues.push({ type: "console", text: message.text() });
});
page.on("pageerror", (error) => browserIssues.push({ type: "pageerror", text: error.message }));

await page.goto(baseUrl, { waitUntil: "networkidle" });
await page.waitForFunction(() => typeof window.render_game_to_text === "function");
await page.waitForTimeout(1250);
await page.screenshot({ path: path.join(outputDirectory, "idle.png") });
const idleState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));

await page.mouse.move(1110, 650);
await page.mouse.down();
await page.waitForTimeout(28);
await page.screenshot({ path: path.join(outputDirectory, "dash.png") });
await page.mouse.up();
await page.waitForTimeout(260);
const postDashState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
await page.screenshot({ path: path.join(outputDirectory, "post-dash.png") });

const report = {
  baseUrl,
  capturedAt: new Date().toISOString(),
  viewport: { width: 1600, height: 900, deviceScaleFactor: 1 },
  idleState,
  postDashState,
  browserIssues,
};
await writeFile(path.join(outputDirectory, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
await browser.close();

console.log(JSON.stringify({ outputDirectory, browserIssues, idlePhase: idleState.phase, postDashPhase: postDashState.phase }));
if (browserIssues.length > 0) process.exitCode = 1;
