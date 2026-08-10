import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const rawBaseUrl = process.argv[2] ?? "http://127.0.0.1:4174/";
const outputDirectory = path.resolve(process.argv[3] ?? "validation/video/round5");
const outputFileName = process.argv[4] ?? "five-kill-gameplay.webm";
const liveEnemyMotion = process.argv[5] === "live";
const rawVideoDirectory = path.join(outputDirectory, "raw");
await mkdir(rawVideoDirectory, { recursive: true });

const url = new URL(rawBaseUrl);
url.searchParams.set("validation", "1");
const browserIssues = [];
const browser = await chromium.launch({
  executablePath: chromePath,
  headless: false,
  args: [
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
    "--window-size=1600,900",
  ],
});

let recordedPath = null;
let finalState = null;
try {
  const context = await browser.newContext({
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 1,
    recordVideo: { dir: rawVideoDirectory, size: { width: 1600, height: 900 } },
  });
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") browserIssues.push({ type: "console", text: message.text() });
  });
  page.on("pageerror", (error) => browserIssues.push({ type: "pageerror", text: error.message }));

  await page.goto(url.toString(), { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.slash_validation && typeof window.render_game_to_text === "function");
  await page.evaluate(() => {
    window.slash_validation?.setStage(2);
    window.slash_validation?.setEnemyMotion(true);
  });
  if (!liveEnemyMotion) {
    await page.evaluate(() => window.slash_validation?.setEnemyMotion(false));
  }
  await page.waitForTimeout(liveEnemyMotion ? 1250 : 1050);

  if (liveEnemyMotion) {
    // Preserve the real chase animation long enough to make the crowd motion
    // readable, then use two live gameplay dashes through the converging field.
    await page.evaluate(() => window.slash_validation?.dashTo(-17.5, -7));
    await page.waitForTimeout(720);
    await page.evaluate(() => window.slash_validation?.dashTo(17.5, 7));
  } else {
    // A deterministic setup dash places the player at the row boundary; the
    // following input crosses the frozen validation row for repeatable gore.
    await page.evaluate(() => window.slash_validation?.dashTo(-19, -8));
    await page.waitForTimeout(760);
    await page.evaluate(() => window.slash_validation?.dashTo(19, -8));
  }
  await page.waitForTimeout(1450);
  finalState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));

  const video = page.video();
  await context.close();
  if (!video) throw new Error("Playwright did not create a gameplay video.");
  const rawPath = await video.path();
  recordedPath = path.join(outputDirectory, outputFileName);
  await copyFile(rawPath, recordedPath);
} finally {
  await browser.close();
}

await writeFile(
  path.join(outputDirectory, "report.json"),
  `${JSON.stringify({
    capturedAt: new Date().toISOString(),
    url: url.toString(),
    video: recordedPath,
    finalState,
    browserIssues,
    note: liveEnemyMotion
      ? "Visible Google Chrome recording with real Stage 3 enemy chase motion enabled and two live gameplay dashes. Video is visual-only; Playwright does not capture Web Audio in this artifact."
      : "Visible Google Chrome recording of the deterministic Stage 3 setup dash followed by a line kill. Video is visual-only; Playwright does not capture Web Audio in this artifact.",
  }, null, 2)}\n`,
);
await rm(rawVideoDirectory, { recursive: true, force: true });

console.log(JSON.stringify({ recordedPath, kills: finalState?.kills, browserIssues }));
if (browserIssues.length > 0) process.exitCode = 1;
