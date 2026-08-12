import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const options = parseArguments(process.argv.slice(2));
const baseUrl = new URL(options.url ?? "http://127.0.0.1:4176/validation/tools/tripo-model-lab.html");
const outputDirectory = path.resolve(options.output ?? "validation/tripo-model-lab");
const modelPath = normalizeModelPath(options.model);
const sourceYawDegrees = Number(options.yaw ?? 0);
const requestedViews = splitList(options.views) ?? ["front", "side", "back", "right", "three-quarter"];
const requestedSurfaces = splitList(options.surfaces);
const clipNames = splitList(options.clips) ?? [null];
const samplePhases = splitList(options.phases)?.map(Number) ?? [null];
const captures = clipNames.flatMap((clip) => samplePhases.flatMap((phase) => {
  if (clip === null && phase !== null) throw new Error("--phases requires --clips");
  if (phase !== null && (!Number.isFinite(phase) || phase < 0 || phase > 1)) {
    throw new Error(`Invalid animation phase: ${phase}`);
  }
  if (requestedSurfaces) {
    return requestedViews.flatMap((view) => requestedSurfaces.map((surface) => ({ view, surface, clip, phase })));
  }
  return [
    ...requestedViews.map((view) => ({ view, surface: "source", clip, phase })),
    ...["front", "three-quarter"]
      .filter((view) => requestedViews.includes(view))
      .flatMap((view) => [
        { view, surface: "normal", clip, phase },
        { view, surface: "wireframe", clip, phase },
      ]),
  ];
}));

if (!Number.isFinite(sourceYawDegrees)) throw new Error(`Invalid --yaw value: ${options.yaw}`);
await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const browserIssues = [];
page.on("console", (message) => {
  if (message.type() === "error") browserIssues.push({ type: "console", text: message.text() });
});
page.on("pageerror", (error) => browserIssues.push({ type: "pageerror", text: error.message }));

const results = [];
try {
  for (const capture of captures) {
    const url = new URL(baseUrl);
    url.searchParams.set("model", modelPath);
    url.searchParams.set("view", capture.view);
    url.searchParams.set("yaw", String(sourceYawDegrees));
    url.searchParams.set("surface", capture.surface);
    if (capture.clip !== null) url.searchParams.set("clip", capture.clip);
    if (capture.phase !== null) url.searchParams.set("phase", String(capture.phase));
    url.searchParams.set("clean", "1");

    await page.goto(url.toString(), { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForFunction(
      () => document.documentElement.dataset.ready === "ready" || document.documentElement.dataset.ready === "error",
      null,
      { timeout: 30_000 },
    );
    const snapshot = await page.evaluate(() => window.tripo_model_validation.snapshot());
    if (snapshot.status !== "ready") {
      throw new Error(`Model Lab failed for ${capture.view}/${capture.surface}: ${snapshot.error ?? snapshot.status}`);
    }
    await page.waitForTimeout(150);
    const clipPrefix = capture.clip === null
      ? ""
      : `${safeFilename(capture.clip)}-p${String(Math.round(capture.phase * 100)).padStart(3, "0")}-`;
    const filename = `${clipPrefix}${capture.surface}-${capture.view}.png`;
    await page.screenshot({ path: path.join(outputDirectory, filename) });
    results.push({ filename, url: url.toString(), snapshot });
  }
} finally {
  await context.close();
  await browser.close();
}

const report = {
  generatedAt: new Date().toISOString(),
  modelPath,
  sourceYawDegrees,
  browserIssues,
  captures: results,
};
await writeFile(path.join(outputDirectory, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
if (browserIssues.length > 0) {
  throw new Error(`Captured ${browserIssues.length} browser issue(s); see ${path.join(outputDirectory, "report.json")}`);
}
console.log(JSON.stringify({ outputDirectory, captures: results.length, stats: results[0]?.snapshot.stats ?? null }, null, 2));

function parseArguments(argumentsList) {
  const options = {};
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (["--model", "--output", "--url", "--yaw", "--views", "--surfaces", "--clips", "--phases"].includes(argument)) {
      const value = argumentsList[++index];
      if (!value) throw new Error(`Missing value for ${argument}`);
      options[argument.slice(2)] = value;
    } else if (argument === "--help" || argument === "-h") {
      console.log("Usage: node validation/tools/capture-tripo-model-lab.mjs --model PATH [--yaw DEG] [--views LIST] [--surfaces LIST] [--clips LIST --phases LIST] [--output DIR] [--url URL]");
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (!options.model) throw new Error("--model is required");
  return options;
}

function splitList(value) {
  if (!value) return null;
  const values = value.split(",").map((entry) => entry.trim()).filter(Boolean);
  return values.length > 0 ? values : null;
}

function safeFilename(value) {
  return value.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replaceAll(/^-|-$/g, "");
}

function normalizeModelPath(value) {
  const normalized = value.replaceAll("\\", "/");
  if (/^https?:\/\//.test(normalized)) return normalized;
  const workspaceMarker = "/Users/nefish/Desktop/Coding/Slash/";
  const relative = normalized.startsWith(workspaceMarker) ? normalized.slice(workspaceMarker.length) : normalized.replace(/^\.\//, "");
  return `/${relative.replace(/^\//, "")}`;
}
