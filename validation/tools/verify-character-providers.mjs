import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = new URL(process.argv[2] ?? "http://127.0.0.1:4177/validation/tools/character-lab.html");
const outputDirectory = path.resolve(process.argv[3] ?? "validation/character-providers");
await mkdir(outputDirectory, { recursive: true });

const cases = [
  { id: "procedural-idle", provider: "procedural", actor: "both", mode: "idle", freezeMs: 0 },
  { id: "gltf-idle", provider: "gltf", actor: "both", mode: "idle", freezeMs: 0 },
  { id: "gltf-action", provider: "gltf", actor: "hero", mode: "dash", freezeMs: 100 },
  { id: "gltf-recovery", provider: "gltf", actor: "hero", mode: "dash", freezeMs: 500 },
];
const browser = await chromium.launch({ headless: true });
const browserIssues = [];
const results = [];
try {
  for (const definition of cases) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    page.on("console", (message) => {
      if (message.type() === "error") browserIssues.push({ case: definition.id, type: "console", text: message.text() });
    });
    page.on("pageerror", (error) => {
      browserIssues.push({ case: definition.id, type: "pageerror", text: error.message });
    });
    const url = new URL(baseUrl);
    Object.entries(definition).forEach(([key, value]) => {
      if (key !== "id") url.searchParams.set(key, String(value));
    });
    url.searchParams.set("clean", "1");
    await page.goto(url.toString(), { waitUntil: "networkidle", timeout: 45_000 });
    await page.waitForFunction(
      () => typeof window.render_character_lab_to_text === "function",
      null,
      { timeout: 30_000 },
    );
    await page.waitForTimeout(120);
    const snapshot = JSON.parse(await page.evaluate(() => window.render_character_lab_to_text()));
    await page.screenshot({ path: path.join(outputDirectory, `${definition.id}.png`) });
    const characters = Object.values(snapshot.characters);
    if (characters.length === 0) throw new Error(`${definition.id} created no characters.`);
    for (const character of characters) {
      if (character.runtime.source !== definition.provider) {
        throw new Error(`${definition.id} resolved ${character.runtime.source} instead of ${definition.provider}.`);
      }
      if (definition.provider === "gltf" && character.runtime.skeletonBoneCount <= 0) {
        throw new Error(`${definition.id} did not create a cloned GLTF skeleton.`);
      }
      if (definition.provider === "gltf") {
        const inspection = character.runtime.inspection;
        if (!inspection || inspection.skinnedMeshes <= 0 || inspection.triangles <= 0) {
          throw new Error(`${definition.id} did not expose a complete GLTF asset inspection.`);
        }
        if (!character.runtime.groundAligned || character.runtime.forwardAxis !== "+Z") {
          throw new Error(`${definition.id} is not grounded and normalized to +Z.`);
        }
      }
    }
    if (definition.id === "gltf-action" && characters[0].runtime.animationState !== "action") {
      throw new Error(`GLTF action state is ${characters[0].runtime.animationState}.`);
    }
    if (definition.id === "gltf-recovery" && characters[0].runtime.animationState !== "recovery") {
      throw new Error(`GLTF recovery state is ${characters[0].runtime.animationState}.`);
    }
    results.push({ id: definition.id, url: url.toString(), snapshot });
    await context.close();
  }
} finally {
  await browser.close();
}

const report = {
  schemaVersion: 1,
  capturedAt: new Date().toISOString(),
  status: browserIssues.length === 0 ? "passed" : "failed",
  nativeClipStatus: "Production V5R rigs use project-authored semantic THREE.AnimationClip sets; rejected Tripo preset motions are not part of runtime playback.",
  results,
  browserIssues,
};
await writeFile(path.join(outputDirectory, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  outputDirectory,
  status: report.status,
  cases: results.map((result) => result.id),
  browserIssues,
}, null, 2));
if (report.status !== "passed") process.exitCode = 1;
