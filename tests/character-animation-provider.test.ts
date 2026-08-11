import * as THREE from "three";
import { describe, expect, test } from "vitest";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { createCharacterAnimationController } from "../src/presentation/animation/controller";
import { GltfCharacterProvider } from "../src/presentation/characters/gltf-provider";
import { createProceduralEnemyProvider } from "../src/presentation/characters/procedural-provider";
import { animationSetRegistry } from "../src/presentation/registry";

describe("character animation state machine", () => {
  test("transitions Idle to Action to Recovery through registered clip profiles", () => {
    const root = new THREE.Group();
    root.name = "animation-root";
    const clips = ["Idle", "Action", "Recovery"].map((name) => (
      new THREE.AnimationClip(name, 0.2, [
        new THREE.NumberKeyframeTrack("animation-root.position[x]", [0, 0.2], [0, 0.1]),
      ])
    ));
    const observed: string[] = [];
    const controller = createCharacterAnimationController({
      root,
      clips,
      createMixer: true,
      animationSet: animationSetRegistry.get("validation-native-clips-v1"),
      proceduralDriver: {
        update(frame) {
          observed.push(frame.activeState);
        },
        reset() {},
      },
    });

    controller.update({ state: "idle", timeSeconds: 0, deltaSeconds: 0.016 });
    controller.update({ state: "action", timeSeconds: 0.016, deltaSeconds: 0.016 });
    controller.update({ state: "recovery", timeSeconds: 0.032, deltaSeconds: 0.016 });

    expect(observed).toEqual(["idle", "action", "recovery"]);
    expect(controller.snapshot()).toMatchObject({
      state: "recovery",
      activeClip: "Recovery",
      mixerActive: true,
    });
    controller.dispose();
  });

  test("keeps Death terminal until the controller is explicitly reset", () => {
    const controller = createCharacterAnimationController({
      root: new THREE.Group(),
      animationSet: animationSetRegistry.get("hero-procedural-v5"),
    });
    controller.update({ state: "death", timeSeconds: 0, deltaSeconds: 0.1 });
    controller.update({ state: "idle", timeSeconds: 0.1, deltaSeconds: 0.1 });
    expect(controller.snapshot().state).toBe("death");
    controller.reset();
    expect(controller.snapshot().state).toBe("idle");
  });
});

describe("character providers", () => {
  test("keeps the current procedural enemy behind the shared runtime contract", async () => {
    const provider = createProceduralEnemyProvider();
    await provider.prepare();
    const character = provider.create({ role: "enemy", variant: 2 });
    expect(character.asset).toMatchObject({ source: "procedural", providerId: "procedural-enemy-v5" });
    expect(character.weaponMounts.has("primary-weapon")).toBe(true);
    expect(character.deathPresentation?.profileId).toBe("humanoid-soft-v1");
    character.animation.update({
      state: "action",
      timeSeconds: 0.2,
      deltaSeconds: 1 / 60,
      distanceMoved: 0.04,
      speedNormalized: 1,
    });
    expect(character.animation.snapshot().state).toBe("action");
    character.dispose();
  });

  test("clones skeletons, materials and mixers per GLTF character instance", async () => {
    const asset = await createAnimatedSkinnedGlbFixture();
    const provider = new GltfCharacterProvider({
      id: "test-gltf-provider",
      role: "hero",
      animationSetId: "validation-native-clips-v1",
      targetHeight: 3,
      load: async () => asset,
    });
    expect(() => provider.create({ role: "hero" })).toThrow(/prepared/);
    await provider.prepare();
    const first = provider.create({ role: "hero" });
    const second = provider.create({ role: "hero" });
    const firstMesh = findSkinnedMesh(first.root);
    const secondMesh = findSkinnedMesh(second.root);

    expect(firstMesh).not.toBe(secondMesh);
    expect(firstMesh.skeleton).not.toBe(secondMesh.skeleton);
    expect(firstMesh.skeleton.bones[0]).not.toBe(secondMesh.skeleton.bones[0]);
    expect(firstMesh.material).not.toBe(secondMesh.material);
    expect(first.asset.animationClipNames).toEqual([
      "Idle",
      "Anticipation",
      "Action",
      "Arrival",
      "Recovery",
      "Hit",
      "Death",
    ]);
    first.animation.update({ state: "idle", timeSeconds: 0, deltaSeconds: 0.016 });
    first.animation.update({ state: "action", timeSeconds: 0.016, deltaSeconds: 0.016 });
    first.animation.update({ state: "recovery", timeSeconds: 0.032, deltaSeconds: 0.016 });
    expect(first.animation.snapshot()).toMatchObject({ state: "recovery", mixerActive: true });

    first.dispose();
    second.dispose();
    provider.dispose();
  });
});

async function createAnimatedSkinnedGlbFixture(): Promise<GLTF> {
  const scene = new THREE.Group();
  scene.name = "fixture-scene";
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([
    -0.5, 0, 0,
    0.5, 0, 0,
    0, 1, 0,
  ], 3));
  geometry.setIndex([0, 1, 2]);
  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute([
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
  ], 4));
  geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute([
    1, 0, 0, 0,
    1, 0, 0, 0,
    1, 0, 0, 0,
  ], 4));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const material = new THREE.MeshStandardMaterial({ color: 0x778899 });
  const mesh = new THREE.SkinnedMesh(geometry, material);
  mesh.name = "fixture-skinned-mesh";
  const bone = new THREE.Bone();
  bone.name = "fixture-root-bone";
  mesh.add(bone);
  mesh.bind(new THREE.Skeleton([bone]));
  scene.add(mesh);
  const animations = ["Idle", "Anticipation", "Action", "Arrival", "Recovery", "Hit", "Death"].map(
    (name, index) => new THREE.AnimationClip(name, 0.2, [
      new THREE.NumberKeyframeTrack(
        "fixture-skinned-mesh.position[x]",
        [0, 0.2],
        [0, (index + 1) * 0.01],
      ),
    ]),
  );
  installNodeFileReader();
  const exported = await new GLTFExporter().parseAsync(scene, { binary: true, animations });
  if (!(exported instanceof ArrayBuffer)) throw new Error("Expected an in-memory GLB ArrayBuffer.");
  return new GLTFLoader().parseAsync(exported, "");
}

function installNodeFileReader(): void {
  if (typeof globalThis.FileReader !== "undefined") return;
  class NodeFileReader {
    result: string | ArrayBuffer | null = null;
    onloadend: ((event: { target: NodeFileReader }) => void) | null = null;
    onerror: ((error: unknown) => void) | null = null;

    readAsArrayBuffer(blob: Blob): void {
      void blob.arrayBuffer().then((value) => {
        this.result = value;
        this.onloadend?.({ target: this });
      }, (error: unknown) => this.onerror?.(error));
    }

    readAsDataURL(blob: Blob): void {
      void blob.arrayBuffer().then((value) => {
        this.result = `data:${blob.type};base64,${Buffer.from(value).toString("base64")}`;
        this.onloadend?.({ target: this });
      }, (error: unknown) => this.onerror?.(error));
    }
  }
  globalThis.FileReader = NodeFileReader as unknown as typeof FileReader;
}

function findSkinnedMesh(root: THREE.Object3D): THREE.SkinnedMesh {
  let result: THREE.SkinnedMesh | null = null;
  root.traverse((object) => {
    if (!result && object instanceof THREE.SkinnedMesh) result = object;
  });
  if (!result) throw new Error("Expected a SkinnedMesh.");
  return result;
}
