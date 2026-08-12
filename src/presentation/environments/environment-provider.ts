import type * as THREE from "three";

/**
 * Read-only gameplay facts supplied to Presentation. Environment providers may
 * visualize these bounds, but must never use them to create or mutate collision.
 */
export interface EnvironmentArenaBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export interface EnvironmentCreateOptions {
  readonly scene: THREE.Scene;
  readonly gameplayArena: EnvironmentArenaBounds;
}

export interface EnvironmentResourceSnapshot {
  readonly objects: number;
  readonly meshes: number;
  readonly lines: number;
  readonly lights: number;
  readonly geometries: number;
  readonly materials: number;
  readonly textures: number;
}

export interface EnvironmentSnapshot {
  readonly runtimeId: string;
  readonly providerId: string;
  readonly visualProfileId: string;
  readonly source: "procedural";
  readonly disposed: boolean;
  readonly activeModules: readonly string[];
  readonly rainDensity: 0;
  readonly fogDensity: 0;
  readonly rainParticles: 0;
  readonly legacyFeatures: {
    readonly city: false;
    readonly transit: false;
    readonly weather: false;
    readonly train: false;
  };
  readonly visualPlane: {
    readonly width: number;
    readonly depth: number;
    readonly surfaceY: number;
  };
  readonly gameplayArena: EnvironmentArenaBounds;
  readonly visualPlaneExceedsGameplayArena: boolean;
  readonly gameplayCollisionOwnedByProvider: false;
  readonly resources: EnvironmentResourceSnapshot;
}

export interface EnvironmentRuntime {
  readonly root: THREE.Group;
  /** Compatibility alias for pointer-to-ground projection; never a gameplay collider. */
  readonly arenaHitSurface: THREE.Object3D;
  /** Read-only copy of Gameplay bounds; Presentation must not mutate or derive collision from it. */
  readonly arenaBounds: EnvironmentArenaBounds;
  /** Explicit semantic alias for new integrations. */
  readonly pointerProjectionSurface: THREE.Object3D;
  reactToDash(start: THREE.Vector3, end: THREE.Vector3, intensity?: number): void;
  /** Compatibility no-op: Clean Arena does not create rain. */
  setRainDensity(density: number): void;
  /** Compatibility no-op: Clean Arena does not create fog. */
  setFogDensity(density: number): void;
  update(timeSeconds: number, deltaSeconds: number): void;
  snapshot(): EnvironmentSnapshot;
  dispose(): void;
}

export interface EnvironmentProvider {
  readonly id: string;
  create(options: EnvironmentCreateOptions): EnvironmentRuntime;
}
