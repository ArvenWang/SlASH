import * as THREE from "three";
import { materialProfileRegistry } from "../profiles/definitions";

export function createStandardMaterial(
  profileId: string,
  overrides: THREE.MeshStandardMaterialParameters = {},
): THREE.MeshStandardMaterial {
  const profile = materialProfileRegistry.get(profileId);
  return new THREE.MeshStandardMaterial({
    color: profile.color,
    roughness: profile.roughness,
    metalness: profile.metalness,
    emissive: profile.emissive ?? 0x000000,
    emissiveIntensity: profile.emissiveIntensity ?? 0,
    ...overrides,
  });
}
