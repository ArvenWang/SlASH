import * as THREE from "three";
import { describe, expect, test, vi } from "vitest";
import {
  CLEAN_ARENA_PROVIDER_ID,
  cleanArenaProvider,
} from "../src/presentation/environments/clean-arena-provider";

const GAMEPLAY_ARENA = Object.freeze({
  minX: -20,
  maxX: 20,
  minZ: -12.5,
  maxZ: 12.5,
});

describe("V2 Clean Arena provider", () => {
  test("creates a procedural high platform larger than the gameplay arena", () => {
    const scene = new THREE.Scene();
    const previousBackground = new THREE.Color(0x112233);
    scene.background = previousBackground;
    const runtime = cleanArenaProvider.create({ scene, gameplayArena: GAMEPLAY_ARENA });

    expect(cleanArenaProvider.id).toBe(CLEAN_ARENA_PROVIDER_ID);
    expect(runtime.root.parent).toBe(scene);
    expect(runtime.arenaHitSurface).toBe(runtime.pointerProjectionSurface);
    expect(runtime.pointerProjectionSurface.parent).toBe(runtime.root);
    expect(runtime.arenaBounds).toEqual(GAMEPLAY_ARENA);
    expect(runtime.arenaBounds).not.toBe(GAMEPLAY_ARENA);
    const raycaster = new THREE.Raycaster(
      new THREE.Vector3(0, 10, 0),
      new THREE.Vector3(0, -1, 0),
    );
    runtime.arenaHitSurface.updateMatrixWorld(true);
    expect(raycaster.intersectObject(runtime.arenaHitSurface, false).length).toBeGreaterThan(0);
    expect(runtime.snapshot()).toMatchInlineSnapshot(`
      {
        "activeModules": [
          "clean-arena/surface",
          "clean-arena/surface-detail",
          "clean-arena/boundary-light",
          "clean-arena/lighting",
        ],
        "disposed": false,
        "fogDensity": 0,
        "gameplayArena": {
          "maxX": 20,
          "maxZ": 12.5,
          "minX": -20,
          "minZ": -12.5,
        },
        "gameplayCollisionOwnedByProvider": false,
        "legacyFeatures": {
          "city": false,
          "train": false,
          "transit": false,
          "weather": false,
        },
        "providerId": "clean-arena-v2",
        "rainDensity": 0,
        "rainParticles": 0,
        "resources": {
          "geometries": 4,
          "lights": 0,
          "lines": 1,
          "materials": 4,
          "meshes": 6,
          "objects": 9,
          "textures": 0,
        },
        "runtimeId": "clean-arena-v2",
        "source": "procedural",
        "visualPlane": {
          "depth": 1400,
          "surfaceY": 0,
          "width": 1600,
        },
        "visualPlaneExceedsGameplayArena": true,
        "visualProfileId": "clean-arena-v2",
      }
    `);

    const forbiddenModules = /city|transit|train|weather/i;
    expect(runtime.snapshot().activeModules.every((module) => !forbiddenModules.test(module))).toBe(true);

    runtime.dispose();
    expect(runtime.root.parent).toBeNull();
    expect(scene.background).toBe(previousBackground);
    expect(runtime.snapshot().disposed).toBe(true);
  });

  test("updates safely and releases each owned render resource once", () => {
    const scene = new THREE.Scene();
    const runtime = cleanArenaProvider.create({ scene, gameplayArena: GAMEPLAY_ARENA });
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    runtime.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh || object instanceof THREE.Line)) return;
      geometries.add(object.geometry);
      const entries = Array.isArray(object.material) ? object.material : [object.material];
      entries.forEach((material) => materials.add(material));
    });
    const geometryDisposals = [...geometries].map((geometry) => vi.spyOn(geometry, "dispose"));
    const materialDisposals = [...materials].map((material) => vi.spyOn(material, "dispose"));

    expect(() => {
      runtime.reactToDash(new THREE.Vector3(-5, 0, 0), new THREE.Vector3(8, 0, 2), 1.2);
      runtime.setRainDensity(1);
      runtime.setFogDensity(0.04);
      runtime.update(4, 1 / 60);
      runtime.update(Number.NaN, Number.POSITIVE_INFINITY);
    }).not.toThrow();
    expect(runtime.snapshot()).toMatchObject({
      rainDensity: 0,
      fogDensity: 0,
      rainParticles: 0,
    });

    runtime.dispose();
    runtime.dispose();
    runtime.update(8, 1 / 60);
    geometryDisposals.forEach((dispose) => expect(dispose).toHaveBeenCalledTimes(1));
    materialDisposals.forEach((dispose) => expect(dispose).toHaveBeenCalledTimes(1));
    expect(scene.children).not.toContain(runtime.root);
  });

  test("rejects invalid gameplay facts instead of inventing collision bounds", () => {
    const scene = new THREE.Scene();
    expect(() => cleanArenaProvider.create({
      scene,
      gameplayArena: { minX: 0, maxX: 0, minZ: -1, maxZ: 1 },
    })).toThrow(/positive gameplay arena dimensions/);
    expect(scene.children).toHaveLength(0);
  });
});
