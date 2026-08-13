import { execFileSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { join } from "node:path";

function walk(root) {
  if (!existsSync(root)) return [];
  return readdirSync(root).flatMap((entry) => {
    const path = join(root, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .trim()
  .split("\n")
  .filter((path) => path && existsSync(path));

const workspaceFiles = [
  ...walk("src"),
  ...walk("public"),
  ...walk("docs"),
  ...walk("art"),
  ...walk("tools"),
  ...walk("validation"),
  ...walk("dist"),
];

const forbiddenPaths = [...new Set([...tracked, ...workspaceFiles])].filter((path) => (
  path.startsWith("public/models/")
  || path.startsWith("src/game/")
  || path.startsWith("src/content/")
  || path.startsWith("src/presentation/")
  || path.startsWith("src/runtime/")
  || path.startsWith("art/")
  || path.startsWith("tools/")
  || path.startsWith("validation/")
  || path.startsWith("dist/models/")
  || /(?:v5r|gltf|weapon|corpse|gore|blood|skill-tree|full-game)/i.test(path)
));

const productionFiles = workspaceFiles.filter((path) => (
  path === "src/main.ts" || path.startsWith("src/redesign/")
));
const unexpectedSourceFiles = workspaceFiles.filter((path) => (
  path.startsWith("src/")
  && path !== "src/main.ts"
  && path !== "src/vite-env.d.ts"
  && !path.startsWith("src/redesign/")
));
const forbiddenSource = /V5R|GLTF|SkinnedMesh|WeaponRuntime|SkinnedCorpse|blood-current|FULL_GAME_SKILL|skill-tree|rail-hound-v1|siege-choir-v1|mirror-regent-v1|last-conductor-v1/;
const forbiddenSourceHits = productionFiles.flatMap((path) => {
  const source = readFileSync(path, "utf8");
  return forbiddenSource.test(source) ? [path] : [];
});

const main = readFileSync("src/main.ts", "utf8");
if (!main.includes('"./redesign/application"')) {
  throw new Error("Production main.ts does not exclusively load the V2.1 application.");
}
if (
  forbiddenPaths.length > 0
  || unexpectedSourceFiles.length > 0
  || forbiddenSourceHits.length > 0
) {
  throw new Error(JSON.stringify({
    forbiddenPaths,
    unexpectedSourceFiles,
    forbiddenSourceHits,
  }, null, 2));
}

console.log(JSON.stringify({
  ok: true,
  trackedFiles: tracked.length,
  productionFiles: productionFiles.length,
  forbiddenPathCount: 0,
  unexpectedSourceCount: 0,
  forbiddenSourceCount: 0,
}));
