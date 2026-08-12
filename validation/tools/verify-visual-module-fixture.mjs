import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://127.0.0.1:4176/validation/tools/visual-module-fixture.html";
const outputDirectory = path.resolve("validation/visual-redesign/integration");
await mkdir(outputDirectory, { recursive: true });
const source = await readFile("src/visual-module-fixture.ts", "utf8");
const forbiddenPresentationImports = ["/game/", "abilities/", "enemy-behavior", "level/"]
  .filter((needle) => source.includes(needle));

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const browserIssues = [];
page.on("console", (message) => {
  if (message.type() === "error") browserIssues.push({ type: "console", message: message.text() });
});
page.on("pageerror", (error) => browserIssues.push({ type: "pageerror", message: error.message }));
try {
  await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
  await page.waitForFunction(
    () => document.documentElement.dataset.ready === "ready" || document.documentElement.dataset.ready === "error",
    null,
    { timeout: 30_000 },
  );
  const snapshot = JSON.parse(await page.evaluate(() => window.render_visual_module_fixture_to_text()));
  await page.screenshot({ path: path.join(outputDirectory, "model-replacement-fixture.png") });
  const checks = {
    ready: snapshot.status === "ready",
    fixtureProvider: snapshot.providerId === "fixture-hero-v5r-replacement",
    geometryActuallyChanged: Math.abs(
      (snapshot.replacement?.replacementChecksum ?? 0) - (snapshot.replacement?.sourceChecksum ?? 0),
    ) > 1,
    statesResolved: ["idle", "action", "hit", "death"].every(
      (state) => snapshot.states?.[state]?.activeState === state && snapshot.states?.[state]?.activeClip,
    ),
    weaponMounted: snapshot.weapon?.mounted === true && (snapshot.weapon?.bladeLength ?? 0) > 0.5,
    noGameplayImports: forbiddenPresentationImports.length === 0,
    browserClean: browserIssues.length === 0,
  };
  const status = Object.values(checks).every(Boolean) ? "passed" : "failed";
  const report = {
    generatedAt: new Date().toISOString(),
    status,
    purpose: "Non-production same-spec model geometry replacement through presentation provider only",
    checks,
    forbiddenPresentationImports,
    browserIssues,
    snapshot,
  };
  await writeFile(path.join(outputDirectory, "model-replacement-fixture-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ status, checks, report: path.join(outputDirectory, "model-replacement-fixture-report.json") }, null, 2));
  if (status !== "passed") process.exitCode = 1;
} finally {
  await context.close();
  await browser.close();
}
