export type CameraVector3 = readonly [x: number, y: number, z: number];

export interface GameplayCameraConfig {
  readonly fov: number;
  readonly near: number;
  readonly far: number;
  readonly position: CameraVector3;
  readonly target: CameraVector3;
}

/**
 * Single source of truth for the fixed production gameplay camera.
 * Browser validation reads the live camera snapshot instead of duplicating
 * these values in Node scripts.
 */
export const GAMEPLAY_CAMERA_CONFIG: GameplayCameraConfig = Object.freeze({
  fov: 28.5,
  near: 0.1,
  far: 260,
  position: [32.2, 31, 43.7] as const,
  target: [-0.5, -3, -3.5] as const,
});
