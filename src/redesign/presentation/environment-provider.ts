import * as THREE from "three";
import { VISUAL_PLATFORM_SIZE } from "../config";
import type { EnvironmentProviderRuntime } from "./types";

export const GEOMETRIC_ARENA_PROVIDER_ID = "continuous-geometric-field-v2.2";

function disposeObject(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh || object instanceof THREE.LineSegments)) return;
    geometries.add(object.geometry);
    const entries = Array.isArray(object.material) ? object.material : [object.material];
    entries.forEach((material) => materials.add(material));
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}

export function createGeometricArena(scene: THREE.Scene): EnvironmentProviderRuntime {
  const root = new THREE.Group();
  root.name = GEOMETRIC_ARENA_PROVIDER_ID;

  const fieldGeometry = new THREE.BoxGeometry(
    VISUAL_PLATFORM_SIZE.width,
    0.64,
    VISUAL_PLATFORM_SIZE.depth,
  );
  const fieldMaterial = new THREE.MeshStandardMaterial({
    color: 0x15272d,
    roughness: 0.82,
    metalness: 0.08,
  });
  const field = new THREE.Mesh(fieldGeometry, fieldMaterial);
  field.name = "continuous-arena-field";
  field.position.y = -0.34;
  field.receiveShadow = true;
  root.add(field);

  const detailPositions: number[] = [];
  for (let x = -168; x <= 168; x += 12) {
    detailPositions.push(x, 0.018, -102, x, 0.018, 102);
  }
  for (let z = -96; z <= 96; z += 12) {
    detailPositions.push(-174, 0.018, z, 174, 0.018, z);
  }
  const detailGeometry = new THREE.BufferGeometry();
  detailGeometry.setAttribute("position", new THREE.Float32BufferAttribute(detailPositions, 3));
  const detailMaterial = new THREE.LineBasicMaterial({
    color: 0x719097,
    transparent: true,
    opacity: 0.055,
    depthWrite: false,
  });
  const details = new THREE.LineSegments(detailGeometry, detailMaterial);
  details.name = "continuous-field-grid";
  root.add(details);

  const pointerGeometry = new THREE.PlaneGeometry(VISUAL_PLATFORM_SIZE.width, VISUAL_PLATFORM_SIZE.depth);
  const pointerMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
    colorWrite: false,
    side: THREE.DoubleSide,
  });
  const pointerSurface = new THREE.Mesh(pointerGeometry, pointerMaterial);
  pointerSurface.name = "arena-pointer-surface";
  pointerSurface.rotation.x = -Math.PI * 0.5;
  pointerSurface.position.y = 0.04;
  pointerSurface.userData.pointerSurface = true;
  root.add(pointerSurface);

  scene.add(root);
  let disposed = false;
  return {
    root,
    update() {},
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      disposeObject(root);
    },
  };
}
