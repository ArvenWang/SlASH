import * as THREE from "three";
import { PLAYABLE_ARENA, VISUAL_PLATFORM_SIZE } from "../config";
import type { EnvironmentProviderRuntime } from "./types";

export const GEOMETRIC_ARENA_PROVIDER_ID = "open-geometric-arena-v2.1";

function disposeObject(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.LineSegments)) return;
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

  const platformGeometry = new THREE.BoxGeometry(VISUAL_PLATFORM_SIZE.width, 1.4, VISUAL_PLATFORM_SIZE.depth, 1, 1, 1);
  const platformMaterial = new THREE.MeshStandardMaterial({
    color: 0x101b21,
    roughness: 0.78,
    metalness: 0.18,
  });
  const platform = new THREE.Mesh(platformGeometry, platformMaterial);
  platform.name = "open-arena-platform";
  platform.position.y = -0.72;
  platform.receiveShadow = true;
  root.add(platform);

  const insetGeometry = new THREE.PlaneGeometry(
    VISUAL_PLATFORM_SIZE.width - 4,
    VISUAL_PLATFORM_SIZE.depth - 4,
    1,
    1,
  );
  const insetMaterial = new THREE.MeshStandardMaterial({
    color: 0x17262d,
    roughness: 0.64,
    metalness: 0.22,
  });
  const inset = new THREE.Mesh(insetGeometry, insetMaterial);
  inset.name = "open-arena-inset";
  inset.rotation.x = -Math.PI * 0.5;
  inset.position.y = 0.012;
  inset.receiveShadow = true;
  root.add(inset);

  const detailPositions: number[] = [];
  for (let x = -28; x <= 28; x += 7) {
    detailPositions.push(x, 0.025, -18, x, 0.025, 18);
  }
  for (let z = -16; z <= 16; z += 8) {
    detailPositions.push(-30, 0.025, z, 30, 0.025, z);
  }
  const detailGeometry = new THREE.BufferGeometry();
  detailGeometry.setAttribute("position", new THREE.Float32BufferAttribute(detailPositions, 3));
  const detailMaterial = new THREE.LineBasicMaterial({
    color: 0x70949d,
    transparent: true,
    opacity: 0.055,
    depthWrite: false,
  });
  const details = new THREE.LineSegments(detailGeometry, detailMaterial);
  details.name = "open-arena-subtle-detail";
  root.add(details);

  const edgeGeometry = new THREE.PlaneGeometry(12, 1, 1, 1);
  const edgeMaterial = new THREE.MeshBasicMaterial({
    color: 0x63e6ee,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const edges = {
    north: new THREE.Mesh(edgeGeometry, edgeMaterial.clone()),
    south: new THREE.Mesh(edgeGeometry, edgeMaterial.clone()),
    west: new THREE.Mesh(edgeGeometry, edgeMaterial.clone()),
    east: new THREE.Mesh(edgeGeometry, edgeMaterial.clone()),
  };
  edgeMaterial.dispose();
  Object.entries(edges).forEach(([name, edge]) => {
    edge.name = `proximity-edge-${name}`;
    edge.rotation.x = -Math.PI * 0.5;
    edge.position.y = 0.035;
    edge.renderOrder = 3;
    root.add(edge);
  });
  edges.north.position.z = PLAYABLE_ARENA.minZ;
  edges.south.position.z = PLAYABLE_ARENA.maxZ;
  edges.west.position.x = PLAYABLE_ARENA.minX;
  edges.east.position.x = PLAYABLE_ARENA.maxX;
  edges.west.rotation.z = Math.PI * 0.5;
  edges.east.rotation.z = Math.PI * 0.5;

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
  pointerSurface.position.y = 0.045;
  pointerSurface.userData.pointerSurface = true;
  root.add(pointerSurface);

  scene.add(root);
  let disposed = false;
  return {
    root,
    update(timeSeconds, playerX, playerZ) {
      if (disposed) return;
      const edgeDistance = 5.5;
      const pulse = 0.7 + Math.sin(timeSeconds * 5.2) * 0.3;
      const updateEdge = (edge: THREE.Mesh, distanceToEdge: number, along: number, vertical: boolean): void => {
        const proximity = THREE.MathUtils.clamp(1 - distanceToEdge / edgeDistance, 0, 1);
        (edge.material as THREE.MeshBasicMaterial).opacity = proximity * pulse * 0.62;
        if (vertical) edge.position.z = THREE.MathUtils.clamp(along, PLAYABLE_ARENA.minZ + 6, PLAYABLE_ARENA.maxZ - 6);
        else edge.position.x = THREE.MathUtils.clamp(along, PLAYABLE_ARENA.minX + 6, PLAYABLE_ARENA.maxX - 6);
      };
      updateEdge(edges.north, playerZ - PLAYABLE_ARENA.minZ, playerX, false);
      updateEdge(edges.south, PLAYABLE_ARENA.maxZ - playerZ, playerX, false);
      updateEdge(edges.west, playerX - PLAYABLE_ARENA.minX, playerZ, true);
      updateEdge(edges.east, PLAYABLE_ARENA.maxX - playerX, playerZ, true);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      disposeObject(root);
    },
  };
}
