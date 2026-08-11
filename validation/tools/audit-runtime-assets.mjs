import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const outputPath = path.resolve(process.argv[2] ?? "validation/licenses/asset-audit.txt");
await mkdir(path.dirname(outputPath), { recursive: true });

async function filesBelow(relativeDirectory) {
  const root = path.join(projectRoot, relativeDirectory);
  const entries = await readdir(root, { recursive: true, withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(projectRoot, path.join(entry.parentPath, entry.name)))
    .sort();
}

const runtimeFiles = [
  ...(await filesBelow("src")),
  ...(await filesBelow("public")),
  "index.html",
].filter((file, index, values) => values.indexOf(file) === index);
const distFiles = await filesBelow("dist");
const binaryAssetPattern = /\.(?:avif|bin|fbx|glb|gltf|hdr|jpeg|jpg|ktx2?|mp3|obj|ogg|png|tga|wav|webm|webp|woff2?)$/i;
const runtimeBinaryAssets = distFiles.filter((file) => binaryAssetPattern.test(file));
const declaredFirstPartyBinaryAssets = new Set([
  "dist/models/characters/hero-v5-rigged.glb",
  "dist/models/characters/enemy-v5-rigged.glb",
]);
const undeclaredBinaryAssets = runtimeBinaryAssets.filter((file) => !declaredFirstPartyBinaryAssets.has(file));

const sourceTextFiles = runtimeFiles.filter((file) => /\.(?:css|html|js|json|mjs|ts)$/i.test(file));
const secretPatterns = [
  { label: "OpenAI-style key", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  { label: "AWS access key", pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  { label: "Private key block", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
];
const secretFindings = [];
const externalRuntimeUrls = [];
for (const file of sourceTextFiles) {
  const text = await readFile(path.join(projectRoot, file), "utf8");
  for (const { label, pattern } of secretPatterns) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) secretFindings.push(`${label}: ${file}`);
  }
  for (const match of text.matchAll(/https?:\/\/[^\s"')`]+/g)) {
    externalRuntimeUrls.push(`${file}: ${match[0]}`);
  }
}

const dependencyNames = ["three", "lil-gui", "playwright", "typescript", "vite", "vitest", "@types/three"];
const dependencies = [];
for (const name of dependencyNames) {
  const manifestPath = path.join(projectRoot, "node_modules", name, "package.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  dependencies.push({ name, version: manifest.version, license: manifest.license ?? "UNKNOWN" });
}

const allowedLicenses = new Set(["MIT", "Apache-2.0"]);
const unknownDependencies = dependencies.filter(({ license }) => !allowedLicenses.has(license));
const assetLicenseManifest = await readFile(path.join(projectRoot, "ASSET_LICENSES.md"), "utf8");
const gates = {
  packagedBinaryAssetsDeclared: undeclaredBinaryAssets.length === 0
    && runtimeBinaryAssets.every((file) => assetLicenseManifest.includes(path.basename(file))),
  noRuntimeExternalUrls: externalRuntimeUrls.length === 0,
  noSecretPatterns: secretFindings.length === 0,
  dependencyLicensesKnown: unknownDependencies.length === 0,
  licenseManifestPresent: assetLicenseManifest.includes("Runtime dependencies"),
};
const passed = Object.values(gates).every(Boolean);

const lines = [
  "Project Slash runtime asset and license audit",
  `Generated: ${new Date().toISOString()}`,
  `Status: ${passed ? "PASSED" : "FAILED"}`,
  "",
  "Scope",
  `- Runtime source files inspected: ${runtimeFiles.length}`,
  `- Production build files inspected: ${distFiles.length}`,
  "- Concept art and validation evidence are not imported by the production runtime.",
  "",
  "Packaged binary art/audio",
  ...(runtimeBinaryAssets.length > 0 ? runtimeBinaryAssets.map((file) => `- ${file}`) : ["- None"]),
  ...(undeclaredBinaryAssets.length > 0 ? ["- Undeclared:", ...undeclaredBinaryAssets.map((file) => `  - ${file}`)] : []),
  "",
  "Runtime external URLs",
  ...(externalRuntimeUrls.length > 0 ? externalRuntimeUrls.map((url) => `- ${url}`) : ["- None"]),
  "",
  "Secret-pattern findings",
  ...(secretFindings.length > 0 ? secretFindings.map((finding) => `- ${finding}`) : ["- None"]),
  "",
  "Dependency licenses",
  ...dependencies.map(({ name, version, license }) => `- ${name}@${version}: ${license}`),
  "",
  "Gates",
  ...Object.entries(gates).map(([name, value]) => `- ${name}: ${value ? "PASS" : "FAIL"}`),
  "",
  "Conclusion",
  passed
    ? "- Production runtime contains only declared first-party binary assets and no undeclared third-party art or audio. Declared dependencies use approved licenses."
    : "- Audit failed. Resolve every failed gate before public delivery.",
  "",
];

await writeFile(outputPath, lines.join("\n"));
console.log(JSON.stringify({ outputPath, passed, gates, runtimeBinaryAssets, externalRuntimeUrls, secretFindings, dependencies }, null, 2));
if (!passed) process.exitCode = 1;
