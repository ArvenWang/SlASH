import * as THREE from "three";
import type { PathSegmentState } from "../state";
import type { Vec2 } from "../math";

export const GEOMETRIC_VFX_PROVIDER_ID = "electric-geometry-v2.1";

interface TimedObject {
  readonly root: THREE.Object3D;
  readonly materials: readonly THREE.Material[];
  readonly geometries: readonly THREE.BufferGeometry[];
  age: number;
  duration: number;
  readonly update: (progress: number, deltaSeconds: number) => void;
}

export interface GeometricVfxRuntime {
  readonly id: typeof GEOMETRIC_VFX_PROVIDER_ID;
  spawnPath(segments: readonly PathSegmentState[], width: number, color?: number, duration?: number): void;
  spawnCut(position: Vec2, direction: Vec2, color?: number): void;
  spawnBurst(position: Vec2, radius: number, color?: number): void;
  spawnShockwave(position: Vec2, radius: number, color?: number): void;
  spawnShield(position: Vec2): void;
  update(deltaSeconds: number): void;
  dispose(): void;
}

function ribbonGeometry(start: Vec2, end: Vec2, width: number, y = 0.16): THREE.BufferGeometry {
  const directionX = end.x - start.x;
  const directionZ = end.z - start.z;
  const length = Math.max(0.001, Math.hypot(directionX, directionZ));
  const sideX = -directionZ / length * width;
  const sideZ = directionX / length * width;
  const positions = new Float32Array([
    start.x + sideX, y, start.z + sideZ,
    start.x - sideX, y, start.z - sideZ,
    end.x - sideX, y, end.z - sideZ,
    start.x + sideX, y, start.z + sideZ,
    end.x - sideX, y, end.z - sideZ,
    end.x + sideX, y, end.z + sideZ,
  ]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export function createGeometricVfx(scene: THREE.Scene): GeometricVfxRuntime {
  const effects: TimedObject[] = [];
  let disposed = false;

  function add(effect: TimedObject): void {
    effects.push(effect);
    scene.add(effect.root);
  }

  function spawnPath(
    segments: readonly PathSegmentState[],
    width: number,
    color = 0x8ff7ff,
    duration = 0.26,
  ): void {
    if (disposed) return;
    const root = new THREE.Group();
    root.name = "electric-path";
    const geometries: THREE.BufferGeometry[] = [];
    const materials: THREE.MeshBasicMaterial[] = [];
    for (const segment of segments) {
      const geometry = ribbonGeometry(segment.from, segment.to, Math.max(0.05, width));
      const material = new THREE.MeshBasicMaterial({
        color: segment.reflected ? 0xffc35a : color,
        transparent: true,
        opacity: 0.62,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        toneMapped: false,
      });
      const ribbon = new THREE.Mesh(geometry, material);
      ribbon.renderOrder = 6;
      root.add(ribbon);
      geometries.push(geometry);
      materials.push(material);
    }
    add({
      root,
      materials,
      geometries,
      age: 0,
      duration,
      update(progress) {
        materials.forEach((material) => { material.opacity = (1 - progress) * 0.62; });
        root.position.y = progress * 0.18;
      },
    });
  }

  function spawnCut(position: Vec2, direction: Vec2, color = 0x9ffaff): void {
    if (disposed) return;
    const root = new THREE.Group();
    root.name = "geometric-cut";
    root.position.set(position.x, 0.65, position.z);
    root.rotation.y = Math.atan2(direction.x, direction.z);
    const planeGeometry = new THREE.PlaneGeometry(2.4, 1.3);
    const planeMaterial = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const plane = new THREE.Mesh(planeGeometry, planeMaterial);
    plane.rotation.y = Math.PI * 0.5;
    root.add(plane);
    const shardGeometry = new THREE.TetrahedronGeometry(0.2, 0);
    const shardMaterial = planeMaterial.clone();
    const shards: THREE.Mesh[] = [];
    for (let index = 0; index < 8; index += 1) {
      const shard = new THREE.Mesh(shardGeometry, shardMaterial);
      shard.userData.velocity = new THREE.Vector3(
        Math.sin(index * 2.399) * (1.5 + index * 0.08),
        0.8 + index * 0.12,
        Math.cos(index * 2.399) * (1.2 + index * 0.06),
      );
      shards.push(shard);
      root.add(shard);
    }
    add({
      root,
      materials: [planeMaterial, shardMaterial],
      geometries: [planeGeometry, shardGeometry],
      age: 0,
      duration: 0.55,
      update(progress, deltaSeconds) {
        planeMaterial.opacity = (1 - progress) * 0.92;
        shardMaterial.opacity = (1 - progress) * 0.8;
        plane.scale.x = 1 + progress * 1.5;
        shards.forEach((shard) => {
          shard.position.addScaledVector(shard.userData.velocity as THREE.Vector3, deltaSeconds);
          shard.rotation.x += deltaSeconds * 7;
          shard.rotation.z += deltaSeconds * 5;
        });
      },
    });
  }

  function spawnBurst(position: Vec2, radius: number, color = 0xffc15c): void {
    if (disposed) return;
    const root = new THREE.Group();
    root.name = "geometric-burst";
    root.position.set(position.x, 0.12, position.z);
    const geometry = new THREE.RingGeometry(0.7, 1, 64);
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const ring = new THREE.Mesh(geometry, material);
    ring.rotation.x = -Math.PI * 0.5;
    root.add(ring);
    add({
      root,
      materials: [material],
      geometries: [geometry],
      age: 0,
      duration: 0.45,
      update(progress) {
        const size = 0.4 + progress * radius;
        root.scale.setScalar(size);
        material.opacity = (1 - progress) * 0.82;
      },
    });
  }

  function spawnShockwave(position: Vec2, radius: number, color = 0xb5fbff): void {
    if (disposed) return;
    const root = new THREE.Group();
    root.name = "charged-impact-shockwave";
    root.position.set(position.x, 0.18, position.z);
    const geometry = new THREE.RingGeometry(0.68, 1, 64);
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.84,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const ring = new THREE.Mesh(geometry, material);
    ring.rotation.x = -Math.PI * 0.5;
    const innerRing = ring.clone();
    innerRing.scale.setScalar(0.72);
    root.add(ring, innerRing);
    add({
      root,
      materials: [material],
      geometries: [geometry],
      age: 0,
      duration: 0.52,
      update(progress) {
        const eased = 1 - (1 - progress) ** 3;
        root.scale.setScalar(0.35 + eased * radius);
        material.opacity = (1 - progress) * 0.84;
        root.position.y = 0.18 + progress * 0.32;
      },
    });
  }

  function spawnShield(position: Vec2): void {
    if (disposed) return;
    const root = new THREE.Group();
    root.name = "shield-feedback";
    root.position.set(position.x, 1.1, position.z);
    const geometry = new THREE.IcosahedronGeometry(2.8, 1);
    const material = new THREE.MeshBasicMaterial({
      color: 0x6be7ff,
      wireframe: true,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const shield = new THREE.Mesh(geometry, material);
    root.add(shield);
    add({
      root,
      materials: [material],
      geometries: [geometry],
      age: 0,
      duration: 0.28,
      update(progress, deltaSeconds) {
        root.rotation.y += deltaSeconds * 4;
        root.scale.setScalar(0.85 + progress * 0.25);
        material.opacity = (1 - progress) * 0.65;
      },
    });
  }

  return {
    id: GEOMETRIC_VFX_PROVIDER_ID,
    spawnPath,
    spawnCut,
    spawnBurst,
    spawnShockwave,
    spawnShield,
    update(deltaSeconds) {
      if (disposed) return;
      for (let index = effects.length - 1; index >= 0; index -= 1) {
        const effect = effects[index]!;
        effect.age += Math.max(0, deltaSeconds);
        const progress = Math.min(1, effect.age / effect.duration);
        effect.update(progress, deltaSeconds);
        if (progress < 1) continue;
        effect.root.removeFromParent();
        effect.geometries.forEach((geometry) => geometry.dispose());
        effect.materials.forEach((material) => material.dispose());
        effects.splice(index, 1);
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      effects.forEach((effect) => {
        effect.root.removeFromParent();
        effect.geometries.forEach((geometry) => geometry.dispose());
        effect.materials.forEach((material) => material.dispose());
      });
      effects.length = 0;
    },
  };
}
