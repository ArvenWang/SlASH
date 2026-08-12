import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "../..");
const manifestPath = resolve(projectRoot, "docs/FULL_GAME_CONTENT_MANIFEST.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

function assert(condition, message) {
  if (!condition) throw new Error(`Full game design gate failed: ${message}`);
}

function assertCount(values, expected, label) {
  assert(Array.isArray(values), `${label} must be an array`);
  assert(values.length === expected, `${label} expected ${expected}, received ${values.length}`);
}

const skillIds = Object.values(manifest.skills).flat();
const enemyIds = Object.values(manifest.enemies).flat();
const allIds = [
  ...manifest.acts,
  ...skillIds,
  ...enemyIds,
  ...manifest.bosses,
  ...manifest.projectiles,
  ...manifest.obstacles,
  ...manifest.hazards,
];

assert(manifest.schemaVersion === 1, "schemaVersion must be 1");
assert(manifest.contentVersion === "full-game-v1", "contentVersion must be full-game-v1");
assert(manifest.implementationStatus === "in-production", "manifest must report the current in-production state");

assertCount(manifest.acts, 4, "acts");
assertCount(manifest.skills.basic, 12, "Basic skills");
assertCount(manifest.skills.charged, 9, "Charged skills");
assertCount(manifest.skills.ultimate, 6, "Ultimate skills");
assertCount(manifest.skills.shared, 1, "Shared skills");
assertCount(skillIds, manifest.run.purchasableSkillCount, "all skills");
assertCount(manifest.enemies.standard, 10, "standard enemies");
assertCount(manifest.enemies.elite, 4, "elite enemies");
assertCount(manifest.bosses, 4, "bosses");
assertCount(manifest.projectiles, 3, "projectiles");
assertCount(manifest.obstacles, 4, "obstacles");
assertCount(manifest.hazards, 2, "hazards");

assert(manifest.run.guaranteedSkillPoints === 10, "guaranteed SP must be 10");
assert(manifest.run.maximumSkillPoints === 12, "maximum SP must be 12");
assert(manifest.run.maximumSkillPoints < manifest.run.purchasableSkillCount, "a run must not buy every skill");
assert(
  manifest.run.maximumSkillPoints / manifest.run.purchasableSkillCount <= 0.43,
  "maximum purchasable share must stay at or below 43%",
);
assert(manifest.run.minimumVisitedNodes <= manifest.run.targetVisitedNodes, "minimum nodes exceeds target");
assert(manifest.run.targetVisitedNodes <= manifest.run.maximumVisitedNodes, "target nodes exceeds maximum");

assert(manifest.encounterTargets.standard === 28, "standard encounter target must be 28");
assert(manifest.encounterTargets.elite === 12, "elite encounter target must be 12");
assert(manifest.encounterTargets.challenge === 9, "challenge target must be 9");
assert(manifest.encounterTargets.boss === 4, "boss encounter target must be 4");
assert(manifest.implementedCounts.skills === 28, "all 28 skill hooks must be implemented");
assert(manifest.implementedCounts.standardEnemies === 10, "all 10 standard enemies must be implemented");
assert(manifest.implementedCounts.eliteEnemies === 4, "all 4 elite enemies must be implemented");
assert(manifest.implementedCounts.standardEncounters === 28, "all 28 standard encounters must be implemented");
assert(manifest.implementedCounts.eliteEncounters === 12, "all 12 elite encounters must be implemented");
assert(manifest.implementedCounts.challengeEncounters === 9, "all 9 challenge encounters must be implemented");
assert(manifest.implementedCounts.bossEncounters === 4, "all four P7 Boss encounters must be implemented");

const uniqueIds = new Set(allIds);
assert(uniqueIds.size === allIds.length, `duplicate stable IDs detected (${allIds.length - uniqueIds.size})`);
for (const id of allIds) {
  assert(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id), `invalid stable ID format: ${id}`);
}

for (const documentPath of manifest.requiredDocuments) {
  await access(resolve(projectRoot, documentPath));
}

const result = {
  ok: true,
  schemaVersion: manifest.schemaVersion,
  contentVersion: manifest.contentVersion,
  counts: {
    acts: manifest.acts.length,
    skills: skillIds.length,
    standardEnemies: manifest.enemies.standard.length,
    eliteEnemies: manifest.enemies.elite.length,
    bosses: manifest.bosses.length,
    projectiles: manifest.projectiles.length,
    obstacles: manifest.obstacles.length,
    hazards: manifest.hazards.length,
    encounterTemplates: Object.values(manifest.encounterTargets).reduce((sum, value) => sum + value, 0),
  },
  skillEconomy: {
    guaranteed: manifest.run.guaranteedSkillPoints,
    maximum: manifest.run.maximumSkillPoints,
    pool: manifest.run.purchasableSkillCount,
    maximumShare: manifest.run.maximumSkillPoints / manifest.run.purchasableSkillCount,
  },
};

console.log(JSON.stringify(result, null, 2));
