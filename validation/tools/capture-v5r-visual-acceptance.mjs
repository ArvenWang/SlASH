import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const argumentsList = process.argv.slice(2);
const section = readArgument("--section") ?? "rig";
const baseUrl = new URL(readArgument("--url") ?? "http://127.0.0.1:4176/validation/tools/character-lab.html");
const outputRoot = path.resolve(readArgument("--output") ?? "validation/visual-redesign");
const actorFilter = readArgument("--actor");
const nameFilter = new Set((readArgument("--names") ?? "").split(",").map((entry) => entry.trim()).filter(Boolean));
const mergeExistingReport = argumentsList.includes("--merge");
const browserIssues = [];
const artifacts = [];
let activeArtifact = "startup";

function readArgument(name) {
  const index = argumentsList.indexOf(name);
  return index >= 0 ? argumentsList[index + 1] : null;
}

function labUrl(parameters) {
  const url = new URL(baseUrl);
  url.search = "";
  const defaults = {
    provider: "gltf",
    projection: "orthographic",
    clean: 1,
  };
  for (const [key, value] of Object.entries({ ...defaults, ...parameters })) {
    if (value !== null && value !== undefined) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1024, height: 1024 },
  deviceScaleFactor: 1,
  colorScheme: "dark",
});
const page = await context.newPage();
page.on("console", (message) => {
  if (message.type() === "error") browserIssues.push({ artifact: activeArtifact, type: "console", message: message.text() });
});
page.on("pageerror", (error) => browserIssues.push({ artifact: activeArtifact, type: "pageerror", message: error.message }));

async function capture(relativePath, parameters, viewport = { width: 1024, height: 1024 }) {
  activeArtifact = relativePath;
  await page.setViewportSize(viewport);
  const url = labUrl(parameters);
  await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
  await page.waitForFunction(
    () => typeof window.render_character_lab_to_text === "function" && Boolean(window.character_lab_validation),
    null,
    { timeout: 20_000 },
  );
  await page.waitForTimeout(120);
  const snapshot = JSON.parse(await page.evaluate(() => window.render_character_lab_to_text()));
  const target = path.join(outputRoot, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await page.screenshot({ path: target });
  artifacts.push({ path: relativePath, url, viewport, snapshot });
}

async function captureRigSection() {
  const poses = ["apose", "arms-forward", "overhead", "deep-squat", "lunge-left", "lunge-right", "max-stride"];
  for (const actor of ["hero", "enemy"]) {
    if (actorFilter && actorFilter !== actor) continue;
    for (const pose of poses.filter((candidate) => nameFilter.size === 0 || nameFilter.has(candidate))) {
      await capture(`rig/${actor}-${pose}.png`, {
        actor,
        view: pose === "deep-squat"
          ? "side"
          : pose === "lunge-left" || pose === "lunge-right" || pose === "max-stride"
            ? "three-quarter"
            : "front",
        animate: 0,
        weapon: 0,
        debug: 1,
        stress: pose,
      });
    }
  }
}

async function captureModelSection() {
  const views = ["front", "side", "back", "right", "three-quarter"];
  for (const actor of ["hero", "enemy"]) {
    if (actorFilter && actorFilter !== actor) continue;
    for (const view of views.filter((candidate) => nameFilter.size === 0 || nameFilter.has(candidate))) {
      await capture(`model/${actor}-${view}.png`, {
        actor,
        view,
        animate: 0,
        weapon: 0,
        stress: "apose",
      });
    }
    if (nameFilter.size === 0 || nameFilter.has("silhouette")) {
      await capture(`model/${actor}-silhouette-64px.png`, {
        actor,
        view: "three-quarter",
        animate: 0,
        weapon: 1,
        stress: "apose",
        silhouette: 1,
      }, { width: 96, height: 96 });
    }
    if (nameFilter.has("overlay")) {
      for (const [view, label] of [["front", "front"], ["side", "left"], ["back", "back"], ["right", "right"]]) {
        await capture(`model/overlay-raw/${actor}-${label}.png`, {
          actor,
          view,
          animate: 0,
          weapon: 0,
          stress: "apose",
          silhouette: 1,
          comparison: 1,
        });
      }
    }
    if (nameFilter.has("lod")) {
      for (const lod of ["near", "far"]) {
        await capture(`model/${actor}-lod-${lod}-64px.png`, {
          actor,
          view: "three-quarter",
          animate: 0,
          weapon: 1,
          stress: "apose",
          silhouette: 1,
          lod,
        }, { width: 96, height: 96 });
      }
    }
  }
}

async function captureWeaponSection() {
  const states = [
    { name: "ready", state: "idle", freezeMs: 650 },
    { name: "anticipation", state: "anticipation", progress: 0.12, freezeMs: 240 },
    { name: "dash", state: "action", progress: 0.48, freezeMs: 240 },
    { name: "arrival", state: "arrival", progress: 0.88, freezeMs: 240 },
    { name: "recovery", state: "recovery", progress: 0.55, freezeMs: 240 },
    { name: "vector-focus", state: "idle", variant: "focus-selection", freezeMs: 550 },
    { name: "death", state: "death", progress: 0.85, freezeMs: 260 },
  ];
  for (const entry of states) {
    const parameters = {
      actor: "hero",
      view: "three-quarter",
      framing: "grip",
      state: entry.state,
      variant: entry.variant,
      progress: entry.progress,
      freezeMs: entry.freezeMs,
    };
    await capture(`weapon/grip-${entry.name}.png`, parameters);
    if (["ready", "dash", "vector-focus"].includes(entry.name)) {
      await capture(`weapon/debug-${entry.name}.png`, { ...parameters, debug: 1 });
    }
  }
}

async function captureAnimationSection() {
  const heroStates = [
    { name: "ready", state: "idle", freezeMs: 650 },
    { name: "micro-turn", state: "idle", variant: "turn", freezeMs: 85 },
    { name: "dash-anticipation", state: "anticipation", progress: 0.12, freezeMs: 240 },
    { name: "dash-travel", state: "action", progress: 0.48, freezeMs: 240 },
    { name: "arrival", state: "arrival", progress: 0.88, freezeMs: 240 },
    { name: "recovery", state: "recovery", progress: 0.55, freezeMs: 240 },
    { name: "focus-activate", state: "idle", variant: "focus-activate", freezeMs: 220 },
    { name: "focus-selection", state: "idle", variant: "focus-selection", freezeMs: 550 },
    { name: "chain-1", state: "action", variant: "chain-1", progress: 0.72, freezeMs: 240 },
    { name: "chain-2", state: "action", variant: "chain-2", progress: 0.72, freezeMs: 240 },
    { name: "chain-3", state: "action", variant: "chain-3", progress: 0.72, freezeMs: 240 },
    { name: "death", state: "death", progress: 0.85, freezeMs: 260 },
  ];
  const enemyStates = [
    { name: "idle", state: "idle", freezeMs: 650 },
    { name: "turn", state: "idle", variant: "turn", freezeMs: 110 },
    { name: "run", state: "action", freezeMs: 180 },
    { name: "threat", state: "action", variant: "threat", freezeMs: 300 },
    { name: "contact-attack", state: "action", variant: "attack", freezeMs: 320 },
    { name: "attack-recovery", state: "recovery", freezeMs: 210 },
    { name: "hit-left", state: "hit", progress: 0.76, freezeMs: 240 },
    { name: "hit-right", state: "hit", variant: "right", progress: 0.76, freezeMs: 240 },
    { name: "delayed-cut-hold", state: "hit", variant: "cut-hold", progress: 0.82, freezeMs: 240 },
    { name: "separation-transition", state: "death", progress: 0.78, freezeMs: 240 },
    { name: "fall", state: "death", variant: "fall", progress: 0.86, freezeMs: 260 },
  ];
  for (const [actor, entries] of [["hero", heroStates], ["enemy", enemyStates]]) {
    if (actorFilter && actorFilter !== actor) continue;
    for (const entry of entries.filter((candidate) => nameFilter.size === 0 || nameFilter.has(candidate.name))) {
      await capture(`animation/${actor}-${entry.name}.png`, {
        actor,
        view: "three-quarter",
        state: entry.state,
        variant: entry.variant,
        progress: entry.progress,
        freezeMs: entry.freezeMs,
      });
    }
  }
}

try {
  if (section === "model") await captureModelSection();
  else if (section === "rig") await captureRigSection();
  else if (section === "weapon") await captureWeaponSection();
  else if (section === "animation") await captureAnimationSection();
  else throw new Error(`Unsupported V5R acceptance section: ${section}`);
} finally {
  await context.close();
  await browser.close();
}

const reportPath = path.join(outputRoot, `${section}-report.json`);
let mergedArtifacts = artifacts;
let mergedBrowserIssues = browserIssues;
if (mergeExistingReport) {
  try {
    const previous = JSON.parse(await readFile(reportPath, "utf8"));
    const replacedPaths = new Set(artifacts.map((artifact) => artifact.path));
    mergedArtifacts = [
      ...(previous.artifacts ?? []).filter((artifact) => !replacedPaths.has(artifact.path)),
      ...artifacts,
    ];
    mergedBrowserIssues = [
      ...(previous.browserIssues ?? []).filter((issue) => !replacedPaths.has(issue.artifact)),
      ...browserIssues,
    ];
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}
const report = {
  generatedAt: new Date().toISOString(),
  section,
  baseUrl: baseUrl.toString(),
  browserIssues: mergedBrowserIssues,
  artifacts: mergedArtifacts,
  status: mergedBrowserIssues.length === 0 ? "captured-without-browser-errors" : "browser-errors-detected",
  note: "Screenshots and runtime diagnostics are evidence inputs. Subjective model, deformation, blade-direction and grip gates still require visual review.",
};
await mkdir(outputRoot, { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ section, capturedArtifacts: artifacts.length, reportArtifacts: mergedArtifacts.length, browserIssues: mergedBrowserIssues.length, report: reportPath }, null, 2));
