import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const rawBaseUrl = process.argv[2] ?? "http://127.0.0.1:5173/";
const outputDirectory = path.resolve(process.argv[3] ?? "validation/enemy-roster/browser");
await fs.mkdir(outputDirectory, { recursive: true });

const roster = [
  "enemy-striker-v1",
  "enemy-gunner-v1",
  "enemy-lancer-v1",
  "enemy-constructor-v1",
  "enemy-minelayer-v1",
  "enemy-sniper-v1",
  "enemy-vanguard-v1",
  "enemy-bastion-v1",
  "enemy-blink-stalker-v1",
  "enemy-conductor-v1",
  "elite-redline-lancer-v1",
  "elite-twin-gunner-v1",
  "elite-architect-v1",
  "elite-fortress-v1",
];
const url = new URL(rawBaseUrl);
url.searchParams.set("validation", "1");
const browserIssues = [];
const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
page.on("console", (message) => {
  if (message.type() === "error") browserIssues.push({ type: "console", text: message.text() });
});
page.on("pageerror", (error) => browserIssues.push({ type: "pageerror", text: String(error) }));

await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
await page.waitForSelector("#loading.ready", { state: "attached" });
await page.waitForFunction(() => getComputedStyle(document.querySelector("#loading")).visibility === "hidden");
await page.waitForFunction(() => window.slash_validation !== undefined);

async function snapshot() {
  return JSON.parse(await page.evaluate(() => window.render_game_to_text()));
}

async function advanceUntil(predicate, limit = 40) {
  for (let step = 0; step < limit; step += 1) {
    const current = await snapshot();
    if (predicate(current)) return current;
    await page.evaluate(() => window.advanceTime?.(200));
  }
  throw new Error("Enemy browser scenario did not reach the expected state.");
}

function actionOutputReady(definitionId, state, initialPosition) {
  if (definitionId === "enemy-gunner-v1" || definitionId === "enemy-sniper-v1") return state.projectiles.length >= 1;
  if (definitionId === "elite-twin-gunner-v1") return state.projectiles.length >= 3;
  if (definitionId === "enemy-constructor-v1") return state.obstacles.length >= 1;
  if (definitionId === "elite-architect-v1") return state.obstacles.length >= 2;
  if (definitionId === "enemy-minelayer-v1") return state.hazards.length >= 1;
  if (definitionId === "enemy-blink-stalker-v1") {
    const subject = state.aliveEnemies.find((enemy) => enemy.id === "validation-enemy-subject");
    return subject && Math.hypot(subject.x - initialPosition.x, subject.z - initialPosition.z) > 1;
  }
  if (definitionId === "enemy-conductor-v1") {
    return state.modules.enemyTactics.some((enemy) => (
      enemy.enemyId === "validation-support-target" && enemy.nextTelegraphMultiplier === 0.8
    ));
  }
  const tactic = state.modules.enemyTactics.find((enemy) => enemy.enemyId === "validation-enemy-subject");
  return tactic?.phase === "active" || tactic?.phase === "recovery";
}

const cases = [];
for (const definitionId of roster) {
  await page.evaluate((id) => window.slash_validation?.setEnemyAttackScenario(id), definitionId);
  const initial = await snapshot();
  const initialSubject = initial.aliveEnemies.find((enemy) => enemy.id === "validation-enemy-subject");
  if (!initialSubject) throw new Error(`Missing browser subject for ${definitionId}.`);
  let sawVisibleTelegraph = false;
  let telegraphDurationMs = null;
  let resolved = null;
  for (let step = 0; step < 40; step += 1) {
    const current = await snapshot();
    const tactic = current.modules.enemyTactics.find((enemy) => enemy.enemyId === "validation-enemy-subject");
    if (tactic?.phase === "telegraph") {
      sawVisibleTelegraph ||= current.presentation.enemyTelegraphs.visibleEnemyIds.includes("validation-enemy-subject");
      telegraphDurationMs ??= tactic.remainingMs;
    }
    if (tactic?.sequence >= 1 && actionOutputReady(definitionId, current, initialSubject)) {
      resolved = current;
      break;
    }
    await page.evaluate(() => window.advanceTime?.(200));
  }
  const tactic = resolved?.modules.enemyTactics.find((enemy) => enemy.enemyId === "validation-enemy-subject");
  cases.push({
    definitionId,
    passed: Boolean(resolved && sawVisibleTelegraph && tactic?.sequence >= 1),
    sawVisibleTelegraph,
    telegraphRemainingWhenObservedMs: telegraphDurationMs,
    resolvedPhase: tactic?.phase ?? null,
    attackSequence: tactic?.sequence ?? 0,
    projectiles: resolved?.projectiles.length ?? 0,
    obstacles: resolved?.obstacles.length ?? 0,
    hazards: resolved?.hazards.length ?? 0,
  });
  console.log(`${definitionId}: ${resolved && sawVisibleTelegraph ? "passed" : "failed"}`);
}

await page.evaluate(() => window.slash_validation?.setEnemyAttackScenario("enemy-gunner-v1"));
await advanceUntil((state) => state.modules.enemyTactics.some((enemy) => (
  enemy.enemyId === "validation-enemy-subject" && enemy.phase === "telegraph"
)));
await page.screenshot({ path: path.join(outputDirectory, "01-gunner-telegraph.png") });
await advanceUntil((state) => state.projectiles.length >= 1);
await page.screenshot({ path: path.join(outputDirectory, "02-gunner-projectile.png") });

await page.evaluate(() => window.slash_validation?.setEnemyAttackScenario("enemy-constructor-v1"));
await advanceUntil((state) => state.obstacles.length >= 1);
await page.screenshot({ path: path.join(outputDirectory, "03-constructor-barrier.png") });

await page.evaluate(() => window.slash_validation?.setEnemyAttackScenario("elite-fortress-v1"));
await advanceUntil((state) => state.modules.enemyTactics.some((enemy) => (
  enemy.enemyId === "validation-enemy-subject" && enemy.phase === "telegraph"
)));
await page.screenshot({ path: path.join(outputDirectory, "04-fortress-armor-telegraph.png") });

const report = {
  ok: cases.length === 14 && cases.every((entry) => entry.passed) && browserIssues.length === 0,
  cases,
  browserIssues,
};
await fs.writeFile(path.join(outputDirectory, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
await browser.close();
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exit(1);
