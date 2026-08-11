import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const SOURCE_ROOT = fileURLToPath(new URL("../src/", import.meta.url));
const IMPORT_PATTERN = /(?:from\s+|import\s*\(\s*|import\s+)["']([^"']+)["']/g;

function collectTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectTypeScriptFiles(path);
    return entry.isFile() && entry.name.endsWith(".ts") ? [path] : [];
  });
}

function importSpecifiers(file: string): string[] {
  return [...readFileSync(file, "utf8").matchAll(IMPORT_PATTERN)]
    .map((match) => match[1])
    .filter((specifier): specifier is string => Boolean(specifier));
}

function resolveSourceImport(file: string, specifier: string, sourceFiles: ReadonlySet<string>): string | null {
  if (!specifier.startsWith(".")) return null;
  const base = resolve(dirname(file), specifier);
  for (const candidate of [`${base}.ts`, join(base, "index.ts")]) {
    if (sourceFiles.has(candidate)) return candidate;
  }
  return null;
}

describe("Phase 2A architecture boundaries", () => {
  const sourceFiles = collectTypeScriptFiles(SOURCE_ROOT);
  const sourceFileSet = new Set(sourceFiles);

  test("keeps gameplay and content independent from rendering and runtime orchestration", () => {
    const protectedRoots = [join(SOURCE_ROOT, "game"), join(SOURCE_ROOT, "content")];
    const forbiddenTopLevelDirectories = new Set(["characters", "presentation", "runtime", "scene"]);
    const violations: string[] = [];

    for (const protectedRoot of protectedRoots) {
      for (const file of collectTypeScriptFiles(protectedRoot)) {
        for (const specifier of importSpecifiers(file)) {
          if (specifier === "three" || specifier.startsWith("three/")) {
            violations.push(`${relative(SOURCE_ROOT, file)} -> ${specifier}`);
            continue;
          }
          const dependency = resolveSourceImport(file, specifier, sourceFileSet);
          if (!dependency) continue;
          const [topLevelDirectory] = relative(SOURCE_ROOT, dependency).split("/");
          if (topLevelDirectory && forbiddenTopLevelDirectories.has(topLevelDirectory)) {
            violations.push(`${relative(SOURCE_ROOT, file)} -> ${relative(SOURCE_ROOT, dependency)}`);
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });

  test("has no circular local TypeScript imports", () => {
    const graph = new Map<string, string[]>();
    for (const file of sourceFiles) {
      graph.set(file, importSpecifiers(file).flatMap((specifier) => {
        const dependency = resolveSourceImport(file, specifier, sourceFileSet);
        return dependency ? [dependency] : [];
      }));
    }

    const visiting = new Set<string>();
    const visited = new Set<string>();
    const stack: string[] = [];
    const cycles: string[][] = [];
    const visit = (file: string): void => {
      if (visiting.has(file)) {
        const cycleStart = stack.indexOf(file);
        cycles.push([...stack.slice(cycleStart), file].map((entry) => relative(SOURCE_ROOT, entry)));
        return;
      }
      if (visited.has(file)) return;
      visiting.add(file);
      stack.push(file);
      for (const dependency of graph.get(file) ?? []) visit(dependency);
      stack.pop();
      visiting.delete(file);
      visited.add(file);
    };

    for (const file of sourceFiles) visit(file);
    expect(cycles).toEqual([]);
  });

  test("keeps main.ts as bootstrap only", () => {
    const mainSource = readFileSync(join(SOURCE_ROOT, "main.ts"), "utf8");
    expect(mainSource).toContain('import { bootstrapSlashApplication } from "./application";');
    expect(mainSource).not.toMatch(/from ["']\.\/(game|runtime|presentation|characters|scene)\//);
  });
});
