import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const rawBaseUrl = process.argv[2] ?? "http://127.0.0.1:4174/";
const outputDirectory = path.resolve(process.argv[3] ?? "validation/performance/gpu-visible");
await mkdir(outputDirectory, { recursive: true });
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
    "--window-size=1920,1080",
  ],
});

try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on("console", (message) => {
    if (message.type() === "error") browserIssues.push({ type: "console", text: message.text() });
  });
  page.on("pageerror", (error) => browserIssues.push({ type: "pageerror", text: error.message }));
  await page.goto(url.toString(), { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.slash_validation && typeof window.get_slash_diagnostics === "function");
  await page.bringToFront();
  await page.waitForTimeout(1800);

  const platform = await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    const gl = canvas?.getContext("webgl2");
    const extension = gl?.getExtension("WEBGL_debug_renderer_info");
    return {
      userAgent: navigator.userAgent,
      devicePixelRatio: window.devicePixelRatio,
      webglVendor: gl && extension ? gl.getParameter(extension.UNMASKED_VENDOR_WEBGL) : null,
      webglRenderer: gl && extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : null,
    };
  });

  await page.evaluate(() => {
    window.slash_validation?.setStage(2);
    window.slash_validation?.setEnemyMotion(true);
    window.reset_slash_diagnostics();
  });
  await page.waitForTimeout(8000);
  const stage3Live = await page.evaluate(() => window.get_slash_diagnostics());
  await page.screenshot({ path: path.join(outputDirectory, "stage3-live.png") });

  await page.evaluate(() => {
    window.slash_validation?.setStage(2);
    window.slash_validation?.setEnemyMotion(false);
  });
  await page.waitForTimeout(180);
  await page.evaluate(() => window.slash_validation?.dashTo(-19, -8));
  await page.waitForTimeout(720);
  await page.evaluate(() => window.reset_slash_diagnostics());
  await page.evaluate(() => window.slash_validation?.dashTo(19, -8));
  await page.waitForTimeout(1200);
  const fiveKillBurst = await page.evaluate(() => window.get_slash_diagnostics());
  await page.screenshot({ path: path.join(outputDirectory, "five-kill-burst.png") });

  const report = {
    capturedAt: new Date().toISOString(),
    url: url.toString(),
    chromeVersion: await browser.version(),
    viewport: { width: 1920, height: 1080, deviceScaleFactor: 1 },
    platform,
    stage3Live,
    fiveKillBurst,
    browserIssues,
    note: "Visible non-headless Google Chrome run. Stage 3 live is an 8-second moving 18-enemy sample. Five-kill burst starts at the left boundary, crosses the Stage 3 rear row, and measures the real dash, blood, two-mass corpses, rain and post-FX without including debug stage rebuilds in the sample.",
  };
  await writeFile(path.join(outputDirectory, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ outputDirectory, platform, stage3Live, fiveKillBurst, browserIssues }));
  if (browserIssues.length > 0) process.exitCode = 1;
} finally {
  await browser.close();
}
