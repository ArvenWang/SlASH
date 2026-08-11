import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = new URL(process.argv[2] ?? "http://127.0.0.1:4177/");
const outputDirectory = path.resolve(process.argv[3] ?? "validation/presentation-labs");
await mkdir(outputDirectory, { recursive: true });
const browser = await chromium.launch({ headless: true });
const issues = [];
const results = {};

async function openLab(id, pathname, search, readyExpression) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") issues.push({ lab: id, type: "console", text: message.text() });
  });
  page.on("pageerror", (error) => issues.push({ lab: id, type: "pageerror", text: error.message }));
  const url = new URL(pathname, baseUrl);
  for (const [key, value] of Object.entries(search)) url.searchParams.set(key, String(value));
  await page.goto(url.toString(), { waitUntil: "networkidle", timeout: 45_000 });
  await page.waitForFunction(readyExpression, null, { timeout: 30_000 });
  return { context, page, url };
}

try {
  {
    const opened = await openLab(
      "vfx",
      "/validation/tools/vfx-lab.html",
      { effect: "dash" },
      () => typeof window.render_vfx_lab_to_text === "function" && Boolean(window.vfx_lab_validation),
    );
    await opened.page.evaluate(() => window.vfx_lab_validation.trigger("all"));
    await opened.page.waitForTimeout(180);
    const snapshot = JSON.parse(await opened.page.evaluate(() => window.render_vfx_lab_to_text()));
    if (snapshot.triggerSequence < 2 || snapshot.vfx.base.pools[0]?.category !== "impact-vfx") {
      throw new Error("VFX Lab did not trigger profiles through the pooled runtime.");
    }
    await opened.page.screenshot({ path: path.join(outputDirectory, "vfx-lab.png") });
    results.vfx = { url: opened.url.toString(), snapshot };
    await opened.context.close();
  }
  for (const profile of ["night", "day-inspection"]) {
    const opened = await openLab(
      `environment-${profile}`,
      "/validation/tools/environment-lab.html",
      { profile, rain: profile === "night" ? 0.4 : 0.2 },
      () => typeof window.render_environment_lab_to_text === "function" && Boolean(window.environment_lab_validation),
    );
    await opened.page.waitForTimeout(120);
    const snapshot = JSON.parse(await opened.page.evaluate(() => window.render_environment_lab_to_text()));
    if (snapshot.environment.activeModules.length !== 5 || snapshot.environment.rainParticles <= 0) {
      throw new Error(`Environment Lab ${profile} did not expose the composed modules.`);
    }
    await opened.page.screenshot({ path: path.join(outputDirectory, `environment-${profile}.png`) });
    results[`environment-${profile}`] = { url: opened.url.toString(), snapshot };
    await opened.context.close();
  }
  {
    const opened = await openLab(
      "content",
      "/validation/tools/content-lab.html",
      {},
      () => typeof window.render_content_lab_to_text === "function" && Boolean(window.content_lab_validation),
    );
    await opened.page.evaluate(() => {
      window.content_lab_validation.loadLevel(1);
      window.content_lab_validation.applyEnemy("debug-stationary-target");
      window.content_lab_validation.applyTestUpgrades(true);
      window.content_lab_validation.activateAbility("debug-target-blink");
    });
    const snapshot = JSON.parse(await opened.page.evaluate(() => window.render_content_lab_to_text()));
    if (
      snapshot.selected.levelId !== "stage-02-compression"
      || snapshot.selected.enemyDefinitionId !== "debug-stationary-target"
      || snapshot.selected.upgrades.length !== 2
    ) {
      throw new Error("Content Lab did not apply real Level, Enemy and Upgrade content.");
    }
    results.content = { url: opened.url.toString(), snapshot };
    await opened.context.close();
  }
  {
    const opened = await openLab(
      "animation",
      "/validation/tools/character-lab.html",
      { actor: "hero", mode: "dash", view: "gameplay", speed: 1.5, loop: 0, freezeMs: 100 },
      () => typeof window.render_character_lab_to_text === "function" && Boolean(window.character_lab_validation),
    );
    const snapshot = JSON.parse(await opened.page.evaluate(() => window.render_character_lab_to_text()));
    if (snapshot.view !== "gameplay" || snapshot.playbackSpeed !== 1.5 || snapshot.loop !== false) {
      throw new Error("Animation Lab did not apply gameplay camera, speed and loop controls.");
    }
    results.animation = { url: opened.url.toString(), snapshot };
    await opened.context.close();
  }
} finally {
  await browser.close();
}

const report = {
  schemaVersion: 1,
  capturedAt: new Date().toISOString(),
  status: issues.length === 0 ? "passed" : "failed",
  results,
  browserIssues: issues,
};
await writeFile(path.join(outputDirectory, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ outputDirectory, status: report.status, labs: Object.keys(results), browserIssues: issues }, null, 2));
if (report.status !== "passed") process.exitCode = 1;
