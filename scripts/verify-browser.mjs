import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const baseUrl = process.env.SLASH_URL ?? "http://127.0.0.1:4177/";
const outputDir = process.env.SLASH_ARTIFACT_DIR ?? "/tmp/project-slash-v2.1-browser";
mkdirSync(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const report = { ok: false, url: baseUrl, viewports: [], issues: [] };
try {
  for (const viewport of [
    { name: "desktop", width: 1440, height: 900 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1,
      hasTouch: viewport.name === "mobile",
      isMobile: viewport.name === "mobile",
    });
    const page = await context.newPage();
    const issues = [];
    page.on("console", (message) => {
      if (message.type() === "error") issues.push(`console:${message.text()}`);
    });
    page.on("pageerror", (error) => issues.push(`pageerror:${error.message}`));
    await page.goto(`${baseUrl}?seed=911`, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof window.render_game_to_text === "function");

    const titleBefore = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    await page.waitForTimeout(1_100);
    const titleAfter = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    if (titleBefore.phase !== "title" || titleAfter.phase !== "title" || titleBefore.player.position.x !== titleAfter.player.position.x) {
      issues.push("title-did-not-remain-idle");
    }
    const titleText = await page.locator("#campaign-ui").innerText();
    if (!titleText.includes("开始游戏") || /技能树|路线|Planning|Seed|Boss Practice/i.test(titleText)) {
      issues.push("title-copy-boundary");
    }
    await page.getByRole("button", { name: "开始游戏" }).click();
    await page.waitForTimeout(300);
    if (viewport.name === "desktop") await page.mouse.move(viewport.width * 0.72, viewport.height * 0.42);
    const combat = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    const presentation = await page.evaluate(() => window.__slashV21.presentation());
    const overflow = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      viewport: innerWidth,
      height: document.documentElement.scrollHeight,
      viewportHeight: innerHeight,
    }));
    if (combat.phase !== "combat" || combat.coordinateSystem !== "x right, z down-screen, height up; continuous arena x -120..120 z -72..72") {
      issues.push("combat-state-boundary");
    }
    if (presentation.providerId !== "geometric-forms-v2.1" || presentation.playerKind !== "cursor-craft") {
      issues.push("presentation-provider-boundary");
    }
    if (presentation.environmentId !== "continuous-geometric-field-v2.2") issues.push("continuous-field-boundary");
    if (presentation.previewSegmentCount < 1 || presentation.previewWidth < 0.95) issues.push("dash-preview-boundary");
    if (viewport.name === "desktop") {
      const beforeMovement = combat.player.position;
      await page.keyboard.down("KeyW");
      await page.keyboard.down("KeyD");
      await page.waitForTimeout(650);
      await page.keyboard.up("KeyD");
      await page.keyboard.up("KeyW");
      await page.waitForTimeout(80);
      const afterMovement = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
      const movementDistance = Math.hypot(
        afterMovement.player.position.x - beforeMovement.x,
        afterMovement.player.position.z - beforeMovement.z,
      );
      if (movementDistance < 2.4 || movementDistance > 5.2) issues.push("wasd-movement-boundary");
      if (Math.hypot(afterMovement.player.movement.velocity.x, afterMovement.player.movement.velocity.z) > 0.1) {
        issues.push("wasd-release-boundary");
      }
    }
    if (overflow.width > overflow.viewport || overflow.height > overflow.viewportHeight) issues.push("page-overflow");
    if (await page.locator('.skill-tree, .run-map, .route-card').count() > 0) issues.push("retired-ui-present");
    await page.screenshot({ path: `${outputDir}/${viewport.name}.png`, fullPage: true });
    report.viewports.push({ ...viewport, combat, presentation, overflow, issues });
    report.issues.push(...issues.map((issue) => `${viewport.name}:${issue}`));
    await context.close();
  }
  report.ok = report.issues.length === 0;
  writeFileSync(`${outputDir}/report.json`, JSON.stringify(report, null, 2));
  if (!report.ok) throw new Error(JSON.stringify(report.issues));
  console.log(JSON.stringify({ ok: true, viewports: report.viewports.length, issues: 0, outputDir }));
} finally {
  await browser.close();
}
