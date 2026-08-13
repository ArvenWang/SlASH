import type * as THREE from "three";
import type { BossArchetype, EnemyArchetype, ObstacleArchetype } from "../run";

export interface PlayerVisual {
  readonly root: THREE.Group;
  readonly shell: THREE.Mesh;
  readonly core: THREE.Mesh;
  readonly wake: THREE.Mesh;
  readonly shockShell: THREE.Mesh;
  readonly shockCone: THREE.Mesh;
}

export interface EnemyVisual {
  readonly root: THREE.Group;
  readonly body: THREE.Object3D;
  readonly core: THREE.Mesh;
  readonly movingParts: readonly THREE.Object3D[];
  readonly telegraph: THREE.Mesh;
  readonly telegraphLine: THREE.Mesh;
}

export interface BossVisual {
  readonly root: THREE.Group;
  readonly core: THREE.Mesh;
  readonly shield: THREE.Mesh;
  readonly body: THREE.Object3D;
  readonly partRoots: ReadonlyMap<string, THREE.Object3D>;
  readonly movingParts: readonly THREE.Object3D[];
  readonly telegraph: THREE.Mesh;
  readonly telegraphLine: THREE.Mesh;
}

export interface ObstacleVisual {
  readonly root: THREE.Group;
  readonly pulse: THREE.Mesh;
}

export interface ProjectileVisual {
  readonly root: THREE.Group;
  readonly body: THREE.Mesh;
}

export interface VisualProvider {
  readonly id: string;
  createPlayer(): PlayerVisual;
  createEnemy(archetype: EnemyArchetype): EnemyVisual;
  createBoss(archetype: BossArchetype, partIds: readonly string[]): BossVisual;
  createObstacle(archetype: ObstacleArchetype): ObstacleVisual;
  createProjectile(kind: "pulse" | "radial" | "boss"): ProjectileVisual;
  dispose(): void;
}

export interface EnvironmentProviderRuntime {
  readonly root: THREE.Group;
  update(timeSeconds: number, playerX: number, playerZ: number): void;
  dispose(): void;
}
