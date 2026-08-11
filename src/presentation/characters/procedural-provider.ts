import * as THREE from "three";
import { createEnemyAnimator, createHeroAnimator } from "../../characters/animation";
import { createCorpseRuntime } from "../../characters/corpse";
import { createEnemyCharacter } from "../../characters/enemy";
import { createHeroCharacter } from "../../characters/hero";
import {
  createCharacterAnimationController,
  type CharacterAnimationFrame,
  type ProceduralAnimationDriver,
} from "../animation/controller";
import { animationSetRegistry } from "../registry";
import type { CharacterProvider, CharacterRuntime } from "./types";

function energyController(materials: readonly THREE.MeshStandardMaterial[]) {
  const baselines = materials.map((material) => material.emissiveIntensity);
  return (level: number) => {
    const safeLevel = THREE.MathUtils.clamp(level, 0, 4);
    materials.forEach((material, index) => {
      material.emissiveIntensity = (baselines[index] ?? 0) * safeLevel;
    });
  };
}

function heroDriver(): { actor: ReturnType<typeof createHeroCharacter>; driver: ProceduralAnimationDriver } {
  const actor = createHeroCharacter();
  const animator = createHeroAnimator(actor.rig);
  return {
    actor,
    driver: {
      update(frame: CharacterAnimationFrame) {
        const dashState = frame.activeState === "anticipation"
          || frame.activeState === "action"
          || frame.activeState === "arrival";
        animator.update({
          time: frame.timeSeconds,
          dt: frame.deltaSeconds,
          turn: frame.turn ?? 0,
          dashProgress: dashState ? (frame.sourceProgress ?? 0) : null,
          recoveryProgress: frame.activeState === "recovery" ? (frame.sourceProgress ?? 0) : null,
          deathProgress: frame.activeState === "death" ? (frame.sourceProgress ?? 0) : null,
        });
      },
      reset: animator.reset,
    },
  };
}

function enemyDriver(variant: number): {
  actor: ReturnType<typeof createEnemyCharacter>;
  driver: ProceduralAnimationDriver;
} {
  const actor = createEnemyCharacter(variant);
  const animator = createEnemyAnimator(actor.rig, variant * 0.77);
  return {
    actor,
    driver: {
      update(frame: CharacterAnimationFrame) {
        animator.update({
          time: frame.timeSeconds,
          dt: frame.deltaSeconds,
          distanceMoved: frame.distanceMoved ?? 0,
          speedNormalized: frame.speedNormalized ?? 0,
          turn: frame.turn ?? 0,
          threat: frame.threat ?? 0,
          deathAge: frame.activeState === "hit" || frame.activeState === "death"
            ? (frame.hitAgeSeconds ?? 0)
            : null,
        });
      },
      reset: animator.reset,
    },
  };
}

function baseRuntime(
  role: "hero" | "enemy",
  providerId: string,
  root: THREE.Object3D,
  animation: CharacterRuntime["animation"],
  weaponMount: THREE.Object3D,
  landmarks: ReadonlyMap<string, THREE.Object3D>,
  setEnergyLevel: (level: number) => void,
): Omit<CharacterRuntime, "deathPresentation" | "dispose"> {
  return {
    role,
    root,
    animation,
    weaponMounts: new Map([["primary-weapon", weaponMount]]),
    landmarks,
    afterimageSource: root,
    asset: {
      source: "procedural",
      providerId,
      animationClipNames: [],
      skeletonBoneCount: 0,
      forwardAxis: "+Z",
      groundAligned: true,
    },
    setPosition(position, y = 0) {
      root.position.set(position.x, y, position.z);
    },
    setFacingRadians(radians) {
      root.rotation.y = radians;
    },
    setVisible(visible) {
      root.visible = visible;
    },
    setEnergyLevel,
  };
}

export function createProceduralHeroProvider(): CharacterProvider {
  return {
    id: "procedural-hero-v5",
    source: "procedural",
    ready: true,
    async prepare() {},
    create(options) {
      if (options.role !== "hero") throw new Error("procedural-hero-v5 only creates heroes.");
      const { actor, driver } = heroDriver();
      const animation = createCharacterAnimationController({
        root: actor.root,
        animationSet: animationSetRegistry.get("hero-procedural-v5"),
        proceduralDriver: driver,
      });
      const runtime: CharacterRuntime = {
        ...baseRuntime(
          "hero",
          "procedural-hero-v5",
          actor.root,
          animation,
          actor.swordHand,
          new Map([
            ["left-shoulder", actor.rig.leftShoulder],
            ["right-shoulder", actor.rig.rightShoulder],
            ["left-upper-leg", actor.rig.leftUpperLeg],
            ["right-upper-leg", actor.rig.rightUpperLeg],
            ["left-shin", actor.rig.leftShin],
            ["right-shin", actor.rig.rightShin],
          ]),
          energyController(actor.energyMaterials),
        ),
        deathPresentation: null,
        dispose() {
          animation.dispose();
          const geometries = new Set<THREE.BufferGeometry>();
          const materials = new Set<THREE.Material>();
          actor.root.traverse((object) => {
            if (!(object instanceof THREE.Mesh)) return;
            geometries.add(object.geometry);
            const entries = Array.isArray(object.material) ? object.material : [object.material];
            entries.forEach((material) => materials.add(material));
          });
          geometries.forEach((geometry) => geometry.dispose());
          materials.forEach((material) => material.dispose());
          actor.root.removeFromParent();
        },
      };
      return runtime;
    },
    dispose() {},
  };
}

export function createProceduralEnemyProvider(): CharacterProvider {
  return {
    id: "procedural-enemy-v5",
    source: "procedural",
    ready: true,
    async prepare() {},
    create(options) {
      if (options.role !== "enemy") throw new Error("procedural-enemy-v5 only creates enemies.");
      const variant = Math.max(0, Math.floor(options.variant ?? 0));
      const { actor, driver } = enemyDriver(variant);
      const animation = createCharacterAnimationController({
        root: actor.root,
        animationSet: animationSetRegistry.get("enemy-procedural-v5"),
        proceduralDriver: driver,
      });
      const runtime: CharacterRuntime = {
        ...baseRuntime(
          "enemy",
          "procedural-enemy-v5",
          actor.root,
          animation,
          actor.rig.weaponPivot,
          new Map([
            ["left-shoulder", actor.rig.leftShoulder],
            ["right-shoulder", actor.rig.rightShoulder],
            ["left-upper-leg", actor.rig.leftUpperLeg],
            ["right-upper-leg", actor.rig.rightUpperLeg],
            ["left-shin", actor.rig.leftShin],
            ["right-shin", actor.rig.rightShin],
          ]),
          energyController(actor.energyMaterials),
        ),
        deathPresentation: {
          profileId: "humanoid-soft-v1",
          setCutVisible: actor.cutSeam.setVisible,
          setCutHeat: actor.cutSeam.setHeat,
          separate(scene, direction, seed) {
            return createCorpseRuntime(scene, actor.root, actor.deathModules, direction, seed);
          },
        },
        dispose() {
          animation.dispose();
          actor.cutSeam.dispose();
          actor.root.removeFromParent();
        },
      };
      return runtime;
    },
    dispose() {},
  };
}
