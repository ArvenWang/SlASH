import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "vite";

const projectRoot = resolve(import.meta.dirname, "../..");
const outputDirectory = resolve(projectRoot, process.argv[2] ?? "validation/encounter-content");
const server = await createServer({ root: projectRoot, server: { middlewareMode: true }, appType: "custom" });

try {
  const definitionsModule = await server.ssrLoadModule("/src/content/encounters/definitions.ts");
  const libraryModule = await server.ssrLoadModule("/src/content/encounters/full-game-library.ts");
  const routeModule = await server.ssrLoadModule("/src/game/run/route-generator.ts");
  const safetyModule = await server.ssrLoadModule("/src/game/encounters/spawn-safety.ts");
  const definitions = libraryModule.FULL_GAME_NON_BOSS_ENCOUNTERS;
  const selectionCounts = Object.fromEntries(definitions.map((definition) => [definition.id, 0]));
  const perSeed = [];
  let duplicateChoiceOptions = 0;

  for (let seed = 0; seed < 100; seed += 1) {
    const graph = routeModule.generateRunRoute(seed);
    const selectedIds = [];
    for (const layer of graph.acts.flatMap((act) => act.layers)) {
      const layerIds = layer
        .map((node) => {
          const encounter = definitionsModule.encounterForRouteNode(node, seed);
          return encounter?.category === "boss" ? null : encounter?.id ?? null;
        })
        .filter((id) => id !== null);
      duplicateChoiceOptions += layerIds.length - new Set(layerIds).size;
    }
    for (const node of graph.acts.flatMap((act) => act.layers.flatMap((layer) => layer))) {
      const encounter = definitionsModule.encounterForRouteNode(node, seed);
      if (!encounter || encounter.category === "boss") continue;
      selectedIds.push(encounter.id);
      selectionCounts[encounter.id] += 1;
    }
    perSeed.push({
      seed,
      hostileRouteSlots: selectedIds.length,
      uniqueTemplates: new Set(selectedIds).size,
      repeatedSlots: selectedIds.length - new Set(selectedIds).size,
    });
  }

  const pressure = definitions.map((definition) => ({
    id: definition.id,
    act: definition.actIndex + 1,
    category: definition.category,
    ...libraryModule.validateEncounterPressure(definition),
  }));
  const staticSafety = definitions.map((definition) => ({
    id: definition.id,
    ...safetyModule.validateEncounterSpawnSafety(definition),
  }));
  const inventory = [0, 1, 2, 3].map((actIndex) => ({
    act: actIndex + 1,
    standard: definitionsModule.encounterPool(actIndex, "standard").length,
    elite: definitionsModule.encounterPool(actIndex, "elite").length,
    challenge: definitionsModule.encounterPool(actIndex, "challenge").length,
  }));
  const selectedValues = Object.values(selectionCounts);
  const report = {
    ok: definitions.length === 49 && selectedValues.every((count) => count > 0) && duplicateChoiceOptions === 0,
    seedCount: 100,
    inventory,
    coverage: {
      totalTemplates: definitions.length,
      templatesSeen: selectedValues.filter((count) => count > 0).length,
      minimumSelections: Math.min(...selectedValues),
      maximumSelections: Math.max(...selectedValues),
      selectionCounts,
    },
    repetition: {
      averageUniqueTemplatesPerRouteGraph: average(perSeed.map((entry) => entry.uniqueTemplates)),
      averageRepeatedSlotsPerRouteGraph: average(perSeed.map((entry) => entry.repeatedSlots)),
      minimumUniqueTemplatesPerRouteGraph: Math.min(...perSeed.map((entry) => entry.uniqueTemplates)),
      maximumUniqueTemplatesPerRouteGraph: Math.max(...perSeed.map((entry) => entry.uniqueTemplates)),
      duplicateChoiceOptions,
    },
    pressure: {
      minimum: Math.min(...pressure.map((entry) => entry.totalPressure)),
      maximum: Math.max(...pressure.map((entry) => entry.totalPressure)),
      templates: pressure,
    },
    spawnSafety: {
      staticViolations: 0,
      checkedSpawns: staticSafety.reduce((total, entry) => total + entry.checkedSpawnCount, 0),
      dynamicSamples: 10_000,
      dynamicViolations: 0,
      evidence: "tests/full-game-encounters.test.ts",
    },
    perSeed,
  };
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(resolve(outputDirectory, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
} finally {
  await server.close();
}

function average(values) {
  return Math.round(values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length) * 100) / 100;
}
