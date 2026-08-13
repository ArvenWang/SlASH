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
  spawnUltimateRoute(segments: readonly PathSegmentState[], width: number): void;
  spawnUltimateSegment(segment: PathSegmentState, segmentIndex: number): void;
  spawnUltimateAfterimage(position: Vec2, direction: Vec2, scale?: number): void;
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

  function spawnUltimateRoute(segments: readonly PathSegmentState[], width: number): void {
    if (disposed) return;
    const root = new THREE.Group();
    root.name = "vector-focus-luminous-route";
    const geometries: THREE.BufferGeometry[] = [];
    const materials: THREE.MeshBasicMaterial[] = [];
    for (const [index, segment] of segments.entries()) {
      const outerGeometry = ribbonGeometry(segment.from, segment.to, Math.max(0.18, width * 0.68), 0.12);
      const coreGeometry = ribbonGeometry(segment.from, segment.to, Math.max(0.075, width * 0.11), 0.2);
      const outerMaterial = new THREE.MeshBasicMaterial({
        color: index % 2 === 0 ? 0xff394f : 0xff8a59,
        transparent: true,
        opacity: 0.17,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        toneMapped: false,
      });
      const coreMaterial = new THREE.MeshBasicMaterial({
        color: 0xf8ffff,
        transparent: true,
        opacity: 0.94,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        toneMapped: false,
      });
      const outer = new THREE.Mesh(outerGeometry, outerMaterial);
      const core = new THREE.Mesh(coreGeometry, coreMaterial);
      outer.renderOrder = 7;
      core.renderOrder = 8;
      root.add(outer, core);
      geometries.push(outerGeometry, coreGeometry);
      materials.push(outerMaterial, coreMaterial);
    }
    add({
      root,
      materials,
      geometries,
      age: 0,
      duration: 1.08,
      update(progress) {
        const fade = 1 - THREE.MathUtils.smoothstep(progress, 0.62, 1);
        materials.forEach((material, index) => {
          material.opacity = (index % 2 === 0 ? 0.17 : 0.94) * fade;
        });
        root.position.y = progress * 0.16;
      },
    });
  }

  function spawnUltimateSegment(segment: PathSegmentState, segmentIndex: number): void {
    if (disposed) return;
    const root = new THREE.Group();
    root.name = `vector-focus-segment-${segmentIndex + 1}`;
    const direction = new THREE.Vector3(segment.to.x - segment.from.x, 0, segment.to.z - segment.from.z);
    const segmentLength = Math.max(0.001, direction.length());
    direction.normalize();
    const side = new THREE.Vector3(-direction.z, 0, direction.x);
    const geometries: THREE.BufferGeometry[] = [];
    const materials: THREE.MeshBasicMaterial[] = [];
    for (let lane = -2; lane <= 2; lane += 1) {
      const offset = lane * 0.26;
      const from = { x: segment.from.x + side.x * offset, z: segment.from.z + side.z * offset };
      const to = { x: segment.to.x + side.x * offset, z: segment.to.z + side.z * offset };
      const geometry = ribbonGeometry(from, to, lane === 0 ? 0.12 : 0.045, 0.25 + Math.abs(lane) * 0.035);
      const material = new THREE.MeshBasicMaterial({
        color: lane === 0 ? 0xffffff : lane < 0 ? 0xff4059 : 0x7ff8ff,
        transparent: true,
        opacity: lane === 0 ? 1 : 0.72,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        toneMapped: false,
      });
      const beam = new THREE.Mesh(geometry, material);
      beam.renderOrder = 10;
      root.add(beam);
      geometries.push(geometry);
      materials.push(material);
    }
    const sparkGeometry = new THREE.OctahedronGeometry(0.16, 0);
    const sparkMaterial = new THREE.MeshBasicMaterial({
      color: 0xfff4e6,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const sparks: THREE.Mesh[] = [];
    for (let index = 0; index < 12; index += 1) {
      const spark = new THREE.Mesh(sparkGeometry, sparkMaterial);
      const along = ((index * 0.61803398875) % 1) * segmentLength;
      spark.position.set(
        segment.from.x + direction.x * along + side.x * Math.sin(index * 2.2) * 0.55,
        0.32 + index % 3 * 0.08,
        segment.from.z + direction.z * along + side.z * Math.sin(index * 2.2) * 0.55,
      );
      spark.scale.setScalar(0.55 + index % 4 * 0.12);
      sparks.push(spark);
      root.add(spark);
    }
    geometries.push(sparkGeometry);
    materials.push(sparkMaterial);
    add({
      root,
      materials,
      geometries,
      age: 0,
      duration: 0.48,
      update(progress, deltaSeconds) {
        const fade = 1 - THREE.MathUtils.smoothstep(progress, 0.42, 1);
        materials.forEach((material, index) => {
          material.opacity = (index === 0 ? 1 : 0.72) * fade;
        });
        sparks.forEach((spark, index) => {
          spark.position.y += deltaSeconds * (0.7 + index % 3 * 0.3);
          spark.rotation.x += deltaSeconds * 7;
          spark.rotation.z += deltaSeconds * 5;
        });
      },
    });
    spawnShockwave(segment.from, 2.6 + segmentIndex * 0.35, segmentIndex % 2 === 0 ? 0xff5364 : 0xffa36a);
  }

  function spawnUltimateAfterimage(position: Vec2, direction: Vec2, scale = 1): void {
    if (disposed) return;
    const root = new THREE.Group();
    root.name = "vector-focus-geometric-afterimage";
    root.position.set(position.x, 0.78, position.z);
    root.rotation.y = Math.atan2(direction.x, direction.z);
    const geometry = new THREE.ConeGeometry(0.9 * scale, 2.6 * scale, 3, 1, false, Math.PI);
    const outerMaterial = new THREE.MeshBasicMaterial({
      color: 0xff4f64,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const innerMaterial = outerMaterial.clone();
    innerMaterial.color.setHex(0xb6fbff);
    innerMaterial.opacity = 0.46;
    const outer = new THREE.Mesh(geometry, outerMaterial);
    const inner = new THREE.Mesh(geometry, innerMaterial);
    outer.rotation.x = Math.PI * 0.5;
    inner.rotation.x = Math.PI * 0.5;
    inner.scale.setScalar(0.62);
    root.add(outer, inner);
    add({
      root,
      materials: [outerMaterial, innerMaterial],
      geometries: [geometry],
      age: 0,
      duration: 0.3,
      update(progress) {
        root.scale.setScalar(1 + progress * 0.28);
        root.position.y = 0.78 + progress * 0.24;
        outerMaterial.opacity = (1 - progress) * 0.34;
        innerMaterial.opacity = (1 - progress) * 0.46;
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
    spawnUltimateRoute,
    spawnUltimateSegment,
    spawnUltimateAfterimage,
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
