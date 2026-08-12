import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const rawBaseUrl = process.argv[2] ?? "http://127.0.0.1:5173/";
const outputDirectory = path.resolve(
  process.argv[3] ?? "validation/redesign-v2/clean-arena",
);

const viewports = [
  {
    id: "1920x1080",
    width: 1920,
    height: 1080,
    screenshotName: "combat-1920x1080.png",
  },
  {
    id: "1366x768",
    width: 1366,
    height: 768,
    screenshotName: "combat-1366x768.png",
  },
  {
    id: "390x844",
    width: 390,
    height: 844,
    screenshotName: "combat-390x844.png",
    isMobile: true,
  },
];

await fs.mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader"],
});
const results = [];

try {
  for (const viewport of viewports) {
    results.push(await captureViewport(browser, viewport));
  }
} finally {
  await browser.close();
}

const report = {
  ok:
    results.length === viewports.length &&
    results.every((result) => result.ok && typeof result.screenshotPath === "string"),
  baseUrl: rawBaseUrl,
  capturedAt: new Date().toISOString(),
  expectedEnvironment: {
    runtimeId: "clean-arena-v2",
    forbiddenLegacyFeatures: ["city", "transit", "weather", "train"],
  },
  expectedScreenshots: viewports.map((viewport) => viewport.screenshotName),
  consoleErrorCount: results.reduce(
    (count, result) => count + (result.browserIssues?.length ?? 0),
    0,
  ),
  results,
};

await fs.writeFile(
  path.join(outputDirectory, "report.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);

console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;

async function captureViewport(currentBrowser, viewport) {
  const browserIssues = [];
  const context = await currentBrowser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    hasTouch: viewport.isMobile ?? false,
    isMobile: viewport.isMobile ?? false,
  });
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") {
      browserIssues.push({ type: "console", text: message.text() });
    }
  });
  page.on("pageerror", (error) => {
    browserIssues.push({ type: "pageerror", text: String(error) });
  });

  try {
    const url = new URL(rawBaseUrl);
    url.searchParams.set("campaign", "1");
    url.searchParams.set("validation", "1");
    url.searchParams.set("deterministic", "1");

    await page.goto(url.toString(), {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await page.waitForSelector("#loading.ready", { state: "attached" });
    await page.waitForFunction(
      () => getComputedStyle(document.querySelector("#loading")).visibility === "hidden",
      null,
      { timeout: 30_000 },
    );
    await page.waitForFunction(
      () => typeof window.render_game_to_text === "function",
      null,
      { timeout: 30_000 },
    );
    await waitForCampaignPhase(page, "title");

    const titleSnapshot = await readGameSnapshot(page);
    await page.locator('[data-action="start-run"]').click();
    await waitForCampaignPhase(page, "combat");
    await page.evaluate(() => new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    }));

    const combatSnapshot = await readGameSnapshot(page);
    const environmentSnapshot = combatSnapshot.presentation?.environment ?? null;
    const runtimeId = readEnvironmentRuntimeId(environmentSnapshot);
    const legacyFeatures = Object.fromEntries(
      ["city", "transit", "weather", "train"].map((feature) => [
        feature,
        inspectLegacyFeature(environmentSnapshot, feature),
      ]),
    );
    const layout = await page.evaluate(() => {
      const documentElement = document.documentElement;
      const body = document.body;
      const canvas = document.querySelector("#game-canvas");
      const canvasRect = canvas?.getBoundingClientRect() ?? null;
      return {
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        documentClientWidth: documentElement.clientWidth,
        documentScrollWidth: documentElement.scrollWidth,
        bodyClientWidth: body.clientWidth,
        bodyScrollWidth: body.scrollWidth,
        canvas: canvasRect
          ? {
              backingWidth: canvas instanceof HTMLCanvasElement ? canvas.width : 0,
              backingHeight: canvas instanceof HTMLCanvasElement ? canvas.height : 0,
              left: canvasRect.left,
              right: canvasRect.right,
              top: canvasRect.top,
              bottom: canvasRect.bottom,
              width: canvasRect.width,
              height: canvasRect.height,
            }
          : null,
      };
    });

    const screenshotPath = path.join(outputDirectory, viewport.screenshotName);
    await page.screenshot({ path: screenshotPath });

    const gates = {
      titleReached: titleSnapshot.campaign?.phase === "title",
      combatReached: combatSnapshot.campaign?.phase === "combat",
      cameraSnapshotValid: isValidCameraSnapshot(combatSnapshot.camera),
      presentationEnvironmentPresent: isPlainObject(environmentSnapshot),
      cleanArenaRuntimeId: runtimeId === "clean-arena-v2",
      cityAbsent: legacyFeatures.city.absent,
      transitAbsent: legacyFeatures.transit.absent,
      weatherAbsent: legacyFeatures.weather.absent,
      trainAbsent: legacyFeatures.train.absent,
      canvasCoversViewport: canvasCoversViewport(layout),
      noHorizontalOverflow: hasNoHorizontalOverflow(layout),
      consoleClean: browserIssues.length === 0,
    };

    return {
      id: viewport.id,
      ok: Object.values(gates).every(Boolean),
      viewport: { width: viewport.width, height: viewport.height },
      screenshotPath,
      phases: {
        title: titleSnapshot.campaign?.phase ?? null,
        combat: combatSnapshot.campaign?.phase ?? null,
      },
      camera: combatSnapshot.camera ?? null,
      environment: environmentSnapshot,
      environmentRuntimeId: runtimeId,
      legacyFeatures,
      layout,
      gates,
      browserIssues,
    };
  } catch (error) {
    return {
      id: viewport.id,
      ok: false,
      viewport: { width: viewport.width, height: viewport.height },
      error: error instanceof Error ? error.message : String(error),
      browserIssues,
    };
  } finally {
    await context.close();
  }
}

async function waitForCampaignPhase(page, expectedPhase) {
  await page.waitForFunction(
    (phase) => {
      try {
        const raw = window.render_game_to_text?.();
        return raw ? JSON.parse(raw).campaign?.phase === phase : false;
      } catch {
        return false;
      }
    },
    expectedPhase,
    { timeout: 30_000 },
  );
}

async function readGameSnapshot(page) {
  return JSON.parse(await page.evaluate(() => window.render_game_to_text()));
}

function readEnvironmentRuntimeId(environmentSnapshot) {
  if (!isPlainObject(environmentSnapshot)) return null;
  return typeof environmentSnapshot.runtimeId === "string"
    ? environmentSnapshot.runtimeId
    : null;
}

function inspectLegacyFeature(environmentSnapshot, feature) {
  if (!isPlainObject(environmentSnapshot)) {
    return { absent: false, evidenceFound: false, observations: [] };
  }

  const normalizedFeature = normalizeKey(feature);
  const directKeys = new Set([
    `${normalizedFeature}count`,
    `${normalizedFeature}modulecount`,
    `${normalizedFeature}objectcount`,
    `${normalizedFeature}entitycount`,
    `has${normalizedFeature}`,
    `${normalizedFeature}enabled`,
    `${normalizedFeature}present`,
    `${normalizedFeature}visible`,
    `${normalizedFeature}active`,
  ]);
  const nestedMarkerKeys = new Set([
    "count",
    "modulecount",
    "objectcount",
    "entitycount",
    "has",
    "enabled",
    "present",
    "visible",
    "active",
  ]);
  const observations = [];
  const queue = [{ value: environmentSnapshot, path: "presentation.environment", depth: 0 }];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || !isPlainObject(current.value) || current.depth > 4) continue;

    for (const [key, value] of Object.entries(current.value)) {
      const normalizedKey = normalizeKey(key);
      const currentPath = `${current.path}.${key}`;
      const parentMentionsFeature = normalizeKey(current.path).includes(normalizedFeature);
      const isDirectMarker = directKeys.has(normalizedKey);
      const isNestedMarker = parentMentionsFeature && nestedMarkerKeys.has(normalizedKey);
      const isNamedFeatureMarker = normalizedKey === normalizedFeature && isMarkerValue(value);

      if (isDirectMarker || isNestedMarker || isNamedFeatureMarker) {
        observations.push({ path: currentPath, value });
      }

      if (isPlainObject(value)) {
        queue.push({ value, path: currentPath, depth: current.depth + 1 });
      } else if (Array.isArray(value) && normalizedKey === "activemodules") {
        for (const [index, moduleId] of value.entries()) {
          if (
            typeof moduleId === "string" &&
            normalizeKey(moduleId).includes(normalizedFeature)
          ) {
            observations.push({
              path: `${currentPath}[${index}]`,
              value: true,
              moduleId,
            });
          }
        }
      }
    }
  }

  return {
    absent:
      observations.length > 0 &&
      observations.every((observation) => isAbsentMarker(observation.value)),
    evidenceFound: observations.length > 0,
    observations,
  };
}

function isValidCameraSnapshot(camera) {
  return (
    isPlainObject(camera) &&
    Number.isFinite(camera.fov) &&
    Number.isFinite(camera.near) &&
    Number.isFinite(camera.far) &&
    isFiniteVector3(camera.position) &&
    isFiniteVector3(camera.target)
  );
}

function isFiniteVector3(vector) {
  return (
    isPlainObject(vector) &&
    Number.isFinite(vector.x) &&
    Number.isFinite(vector.y) &&
    Number.isFinite(vector.z)
  );
}

function hasNoHorizontalOverflow(layout) {
  const tolerance = 1;
  const documentFits =
    layout.documentScrollWidth <= layout.documentClientWidth + tolerance;
  const bodyFits = layout.bodyScrollWidth <= layout.viewportWidth + tolerance;
  const canvasFits =
    layout.canvas !== null &&
    layout.canvas.left >= -tolerance &&
    layout.canvas.right <= layout.viewportWidth + tolerance;
  return documentFits && bodyFits && canvasFits;
}

function canvasCoversViewport(layout) {
  if (layout.canvas === null) return false;
  const tolerance = 1;
  return (
    layout.canvas.left <= tolerance &&
    layout.canvas.top <= tolerance &&
    layout.canvas.right >= layout.viewportWidth - tolerance &&
    layout.canvas.bottom >= layout.viewportHeight - tolerance &&
    layout.canvas.width >= layout.viewportWidth - tolerance &&
    layout.canvas.height >= layout.viewportHeight - tolerance
  );
}

function isMarkerValue(value) {
  return typeof value === "boolean" || typeof value === "number";
}

function isAbsentMarker(value) {
  return value === false || value === 0;
}

function normalizeKey(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
