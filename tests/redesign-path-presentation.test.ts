import * as THREE from "three";
import { describe, expect, test } from "vitest";
import { PLAYABLE_ARENA, VISUAL_PLATFORM_SIZE } from "../src/redesign/config";
import { planDashPath } from "../src/redesign/path";
import type { CoreSkillBuild, CoreUpgradeId, SkillFamilyId, SkillRank } from "../src/redesign/skills";
import { validateBuild } from "../src/redesign/skills";
import { computeCameraFrame } from "../src/redesign/presentation/camera";
import { createGeometricArena } from "../src/redesign/presentation/environment-provider";
import { createPrimitiveVisualProvider } from "../src/redesign/presentation/primitive-provider";

function build(entries: readonly [SkillFamilyId, SkillRank][]): CoreSkillBuild {
  const ranks: Record<SkillFamilyId, SkillRank> = {
    "wide-slash": 0,
    refraction: 0,
    "cross-execution": 0,
    "echo-slash": 0,
    "kill-momentum": 0,
  };
  const equippedFamilyIds: SkillFamilyId[] = [];
  const selectedUpgradeIds: CoreUpgradeId[] = [];
  for (const [familyId, rank] of entries) {
    ranks[familyId] = rank;
    equippedFamilyIds.push(familyId);
    for (let level = 1; level <= rank; level += 1) {
      selectedUpgradeIds.push(`skill-${familyId}-v2-r${level}` as CoreUpgradeId);
    }
  }
  const result = { ranks, equippedFamilyIds, selectedUpgradeIds };
  validateBuild(result);
  return result;
}

describe("V2.1 shared dash path", () => {
  test("uses the same widened radius and full reflected segment for preview and execution", () => {
    const upgrades = build([["wide-slash", 3], ["refraction", 3]]);
    const path = planDashPath(
      { x: 0, z: 0 },
      { x: 20, z: 0 },
      20,
      0.72,
      upgrades,
      [{ id: "reflector", archetype: "reflector", position: { x: 8, z: 0 }, rotationRadians: 0, pulsePhase: 0 }],
    );
    expect(path.hitRadius).toBeCloseTo(0.95 * 1.8, 8);
    expect(path.segments).toHaveLength(2);
    expect(path.segments[0]?.reflectionPoint).not.toBeNull();
    expect(path.segments[0]?.reflectionNormal).not.toBeNull();
    expect(path.segments[1]?.reflected).toBe(true);
    const firstLength = Math.hypot(
      path.segments[0]!.to.x - path.segments[0]!.from.x,
      path.segments[0]!.to.z - path.segments[0]!.from.z,
    );
    const reflectedLength = Math.hypot(
      path.segments[1]!.to.x - path.segments[1]!.from.x,
      path.segments[1]!.to.z - path.segments[1]!.from.z,
    );
    expect(reflectedLength).toBeCloseTo((20 - firstLength) * 1.1, 6);
  });

  test("stops at the same obstacle when refraction is not equipped", () => {
    const path = planDashPath(
      { x: 0, z: 0 },
      { x: 20, z: 0 },
      20,
      0.72,
      build([]),
      [{ id: "reflector", archetype: "reflector", position: { x: 8, z: 0 }, rotationRadians: 0, pulsePhase: 0 }],
    );
    expect(path.segments).toHaveLength(1);
    expect(path.terminalBlocked).toBe(true);
  });
});

describe("V2.1 modular geometric presentation", () => {
  test("creates a triangular-prism player and distinct enemy/Boss geometry without skinned meshes or weapons", () => {
    const provider = createPrimitiveVisualProvider();
    const player = provider.createPlayer();
    expect(provider.id).toBe("geometric-forms-v2.1");
    expect(player.root.name).toContain("tri-prism");
    expect((player.shell.geometry.getAttribute("position")?.count ?? 0)).toBeGreaterThanOrEqual(24);
    const enemies = ["chaser", "shooter", "spinner", "splitter", "slammer"] as const;
    const signatures = enemies.map((archetype) => {
      const visual = provider.createEnemy(archetype);
      return `${visual.body.children.length}:${visual.movingParts.length}`;
    });
    expect(new Set(signatures).size).toBeGreaterThanOrEqual(4);
    const boss = provider.createBoss("cube-fortress", ["a", "b", "c", "d"]);
    expect(boss.partRoots.size).toBe(4);
    const allRoots = [player.root, boss.root];
    let skinnedMeshCount = 0;
    let forbiddenNameCount = 0;
    allRoots.forEach((root) => root.traverse((object) => {
      if (object instanceof THREE.SkinnedMesh) skinnedMeshCount += 1;
      if (/weapon|sword|blade|blood|gore/i.test(object.name)) forbiddenNameCount += 1;
    }));
    expect(skinnedMeshCount).toBe(0);
    expect(forbiddenNameCount).toBe(0);
    provider.dispose();
  });

  test("uses a large visual deck and only reveals local edge feedback near the player", () => {
    const scene = new THREE.Scene();
    const environment = createGeometricArena(scene);
    const platform = environment.root.getObjectByName("open-arena-platform") as THREE.Mesh<THREE.BoxGeometry>;
    expect(platform.geometry.parameters.width).toBe(VISUAL_PLATFORM_SIZE.width);
    expect(platform.geometry.parameters.depth).toBe(VISUAL_PLATFORM_SIZE.depth);
    environment.update(0, 0, 0);
    const edges = environment.root.children.filter((object) => object.name.startsWith("proximity-edge-")) as THREE.Mesh[];
    expect(edges).toHaveLength(4);
    expect(edges.every((edge) => (edge.material as THREE.MeshBasicMaterial).opacity === 0)).toBe(true);
    environment.update(0.2, PLAYABLE_ARENA.minX + 1, 0);
    expect(edges.filter((edge) => (edge.material as THREE.MeshBasicMaterial).opacity > 0)).toHaveLength(1);
    environment.dispose();
    expect(environment.root.parent).toBeNull();
  });

  test("frames the real 64 by 40 arena on desktop and follows a large arena on portrait", () => {
    const desktop = computeCameraFrame(1920, 1080, { x: 0, z: 0 });
    expect(desktop.framedBounds.maxX - desktop.framedBounds.minX).toBeGreaterThanOrEqual(64);
    expect(desktop.framedBounds.maxZ - desktop.framedBounds.minZ).toBeGreaterThanOrEqual(40);
    const portraitCenter = computeCameraFrame(390, 844, { x: 0, z: 0 });
    const portraitRight = computeCameraFrame(390, 844, { x: 18, z: 0 });
    expect(portraitCenter.target).not.toEqual(portraitRight.target);
    expect(portraitRight.framedBounds.maxX).toBeLessThanOrEqual(PLAYABLE_ARENA.maxX);
  });
});
