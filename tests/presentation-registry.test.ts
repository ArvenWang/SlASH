import { describe, expect, test } from "vitest";
import { enemyDefinitions } from "../src/content/enemies/definitions";
import { LEVEL_DEFINITIONS } from "../src/content/levels/definitions";
import {
  abilityPresentationRegistry,
  assertPresentationRegistryIntegrity,
  characterPresentationRegistry,
  enemyPresentationRegistry,
  environmentRegistry,
} from "../src/presentation/registry";

describe("presentation registry", () => {
  test("resolves every current gameplay definition without importing renderer code", () => {
    const result = assertPresentationRegistryIntegrity();
    expect(result.ok).toBe(true);
    expect(result.checked).toContain("ability:dash-slash");
    expect(result.checked).toContain("ability:vector-focus");
    expect(result.checked).toContain("enemy:enemy-grunt-v1");
    expect(result.checked).toContain("level:stage-03-redline");
    expect(result.checked).toContain("projectile:projectile-standard-round-v1");
    expect(result.checked).toContain("obstacle:obstacle-static-reflector-v1");
    expect(result.checked).toContain("hazard:hazard-armed-mine-v1");
  });

  test("keeps gameplay IDs separate from swappable presentation profiles", () => {
    const enemy = enemyDefinitions.get("enemy-grunt-v1");
    const presentation = enemyPresentationRegistry.get(enemy.id);
    expect(characterPresentationRegistry.get(presentation.characterId).providerId).toBe(
      "gltf-enemy-v5r",
    );
    expect(abilityPresentationRegistry.get("dash-slash").vfxProfileId).toBe(
      "dash-slash-current-v1",
    );
    expect(abilityPresentationRegistry.get("vector-focus")).toMatchObject({
      vfxProfileId: "vector-focus-chain-v1",
      audioProfileId: "vector-focus-chain-v1",
      cameraProfileId: "vector-focus-impact-v1",
    });
    expect(environmentRegistry.get(LEVEL_DEFINITIONS[0]!.environmentId).postFxProfileId).toBe(
      "cinematic-current-v1",
    );
  });
});
