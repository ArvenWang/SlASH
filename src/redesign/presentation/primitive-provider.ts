import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { BossArchetype, EnemyArchetype, ObstacleArchetype } from "../run";
import type {
  BossVisual,
  EnemyVisual,
  ObstacleVisual,
  PlayerVisual,
  ProjectileVisual,
  VisualProvider,
} from "./types";

export const PRIMITIVE_VISUAL_PROVIDER_ID = "geometric-forms-v2.1";

const HERO_BASE = 0x9ce7e8;
const HERO_CORE = 0xeaffff;
const HOSTILE_BASE = 0xe4563d;
const HOSTILE_DARK = 0x351416;
const HOSTILE_CORE = 0xffb05c;
const BOSS_CORE = 0xfff2b1;
const REFLECTOR = 0x61dbef;

function trianglePrismGeometry(): THREE.BufferGeometry {
  const bottom = -0.42;
  const top = 0.42;
  const points = [
    [-0.9, -0.74],
    [0.9, -0.74],
    [0, 1.38],
  ] as const;
  const positions: number[] = [];
  const normals: number[] = [];
  const pushTriangle = (a: readonly [number, number], b: readonly [number, number], c: readonly [number, number], y: number, normalY: number): void => {
    positions.push(a[0], y, a[1], b[0], y, b[1], c[0], y, c[1]);
    normals.push(0, normalY, 0, 0, normalY, 0, 0, normalY, 0);
  };
  pushTriangle(points[0], points[2], points[1], top, 1);
  pushTriangle(points[0], points[1], points[2], bottom, -1);
  for (let index = 0; index < 3; index += 1) {
    const a = points[index]!;
    const b = points[(index + 1) % 3]!;
    const edgeX = b[0] - a[0];
    const edgeZ = b[1] - a[1];
    const normal = new THREE.Vector3(edgeZ, 0, -edgeX).normalize();
    positions.push(
      a[0], bottom, a[1],
      b[0], bottom, b[1],
      b[0], top, b[1],
      a[0], bottom, a[1],
      b[0], top, b[1],
      a[0], top, a[1],
    );
    for (let vertex = 0; vertex < 6; vertex += 1) normals.push(normal.x, 0, normal.z);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

export function createPrimitiveVisualProvider(): VisualProvider {
  const geometries = {
    triangle: trianglePrismGeometry(),
    roundedSmall: new RoundedBoxGeometry(1, 1, 1, 3, 0.12),
    roundedLarge: new RoundedBoxGeometry(1, 1, 1, 4, 0.16),
    tetra: new THREE.TetrahedronGeometry(0.5, 0),
    octa: new THREE.OctahedronGeometry(0.6, 0),
    dodeca: new THREE.DodecahedronGeometry(0.72, 0),
    icosa: new THREE.IcosahedronGeometry(0.78, 0),
    cone: new THREE.ConeGeometry(0.58, 1.35, 4, 1, false, Math.PI * 0.25),
    cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
    ring: new THREE.TorusGeometry(1, 0.09, 8, 40),
    shield: new THREE.IcosahedronGeometry(1, 1),
    projectile: new RoundedBoxGeometry(0.38, 0.32, 1.25, 2, 0.09),
    groundRing: new THREE.RingGeometry(0.72, 0.88, 40),
  };

  const material = (color: number, roughness: number, metalness: number, emissive = 0, emissiveIntensity = 0): THREE.MeshStandardMaterial => (
    new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive, emissiveIntensity })
  );
  const materials = {
    hero: material(HERO_BASE, 0.28, 0.65, 0x173b43, 0.55),
    heroDark: material(0x142d33, 0.5, 0.45),
    heroCore: material(HERO_CORE, 0.15, 0.1, HERO_CORE, 2.8),
    hostile: material(HOSTILE_BASE, 0.36, 0.52, 0x4b120a, 0.4),
    hostileDark: material(HOSTILE_DARK, 0.62, 0.25),
    hostileCore: material(HOSTILE_CORE, 0.18, 0.12, HOSTILE_CORE, 2.5),
    boss: material(0x6d2530, 0.29, 0.7, 0x3d0710, 0.5),
    bossDark: material(0x171014, 0.52, 0.58),
    bossCore: material(BOSS_CORE, 0.14, 0.12, BOSS_CORE, 3.2),
    obstacle: material(0x28343a, 0.74, 0.36),
    reflector: material(0x1e5962, 0.24, 0.72, REFLECTOR, 1.3),
    hazard: material(0x5b2619, 0.42, 0.48, 0xff4c26, 1.1),
    projectile: material(0xff7b4f, 0.18, 0.24, 0xff4a28, 3.6),
    bossProjectile: material(0xffd05c, 0.16, 0.2, 0xffa32f, 4.2),
    telegraph: new THREE.MeshBasicMaterial({
      color: 0xff6044,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    }),
    wake: new THREE.MeshBasicMaterial({
      color: 0x8af5ff,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    }),
    shield: new THREE.MeshBasicMaterial({
      color: 0x6fe8ff,
      wireframe: true,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      toneMapped: false,
    }),
  };

  const allRoots = new Set<THREE.Group>();
  const mesh = (geometry: THREE.BufferGeometry, surface: THREE.Material): THREE.Mesh => {
    const result = new THREE.Mesh(geometry, surface);
    result.castShadow = true;
    result.receiveShadow = true;
    return result;
  };
  const own = <T extends THREE.Group>(root: T): T => {
    allRoots.add(root);
    return root;
  };

  function createTelegraph(): THREE.Mesh {
    const telegraph = mesh(geometries.groundRing, materials.telegraph);
    telegraph.rotation.x = -Math.PI * 0.5;
    telegraph.position.y = -0.62;
    telegraph.visible = false;
    telegraph.castShadow = false;
    telegraph.receiveShadow = false;
    return telegraph;
  }

  function createTelegraphLine(): THREE.Mesh {
    const line = mesh(geometries.roundedSmall, materials.telegraph);
    line.name = "attack-telegraph-line";
    line.scale.set(1, 0.025, 0.14);
    line.position.y = -0.58;
    line.visible = false;
    line.castShadow = false;
    line.receiveShadow = false;
    return line;
  }

  function createPlayer(): PlayerVisual {
    const root = own(new THREE.Group());
    root.name = "v2-player-tri-prism";
    const shell = mesh(geometries.triangle, materials.hero);
    shell.scale.set(1.05, 0.9, 1.05);
    const rear = mesh(geometries.roundedSmall, materials.heroDark);
    rear.scale.set(1.26, 0.32, 0.28);
    rear.position.set(0, -0.05, -0.61);
    const core = mesh(geometries.tetra, materials.heroCore);
    core.scale.setScalar(0.5);
    core.position.set(0, 0.5, 0.05);
    core.rotation.set(0.65, Math.PI * 0.25, 0.2);
    const wake = mesh(geometries.cone, materials.wake);
    wake.scale.set(0.85, 0.12, 1.35);
    wake.rotation.x = Math.PI * 0.5;
    wake.position.set(0, -0.2, -1.2);
    wake.visible = false;
    root.add(shell, rear, core, wake);
    return { root, shell, core, wake };
  }

  function createEnemy(archetype: EnemyArchetype): EnemyVisual {
    const root = own(new THREE.Group());
    root.name = `v2-enemy-${archetype}`;
    const body = new THREE.Group();
    const movingParts: THREE.Object3D[] = [];
    const core = mesh(geometries.octa, materials.hostileCore);
    core.scale.setScalar(archetype === "splitter-shard" ? 0.32 : 0.42);

    if (archetype === "chaser") {
      const block = mesh(geometries.roundedLarge, materials.hostile);
      block.scale.set(1.42, 1.05, 1.28);
      const prow = mesh(geometries.cone, materials.hostileDark);
      prow.scale.set(0.7, 0.75, 0.7);
      prow.rotation.x = Math.PI * 0.5;
      prow.position.z = 0.95;
      body.add(block, prow);
      movingParts.push(prow);
    } else if (archetype === "shooter") {
      const left = mesh(geometries.roundedSmall, materials.hostile);
      const right = mesh(geometries.roundedSmall, materials.hostile);
      left.scale.set(0.8, 0.9, 1.05);
      right.scale.copy(left.scale);
      left.position.x = -0.58;
      right.position.x = 0.58;
      const barrel = mesh(geometries.projectile, materials.hostileDark);
      barrel.scale.set(0.75, 0.75, 0.85);
      barrel.position.set(0, 0.28, 0.78);
      body.add(left, right, barrel);
      movingParts.push(left, right, barrel);
    } else if (archetype === "spinner") {
      const center = mesh(geometries.dodeca, materials.hostileDark);
      center.scale.setScalar(0.9);
      body.add(center);
      for (let index = 0; index < 3; index += 1) {
        const bar = mesh(geometries.roundedSmall, materials.hostile);
        bar.scale.set(2.15, 0.26, 0.34);
        bar.rotation.y = index * Math.PI / 3;
        body.add(bar);
        movingParts.push(bar);
      }
    } else if (archetype === "splitter" || archetype === "splitter-shard") {
      const count = archetype === "splitter" ? 4 : 2;
      for (let index = 0; index < count; index += 1) {
        const block = mesh(geometries.roundedSmall, index % 2 === 0 ? materials.hostile : materials.hostileDark);
        const radius = archetype === "splitter" ? 0.72 : 0.4;
        block.scale.setScalar(archetype === "splitter" ? 0.72 : 0.48);
        block.position.set(Math.sin(index * Math.PI * 2 / count) * radius, 0, Math.cos(index * Math.PI * 2 / count) * radius);
        body.add(block);
        movingParts.push(block);
      }
    } else {
      const lower = mesh(geometries.dodeca, materials.hostileDark);
      lower.scale.set(1.18, 0.9, 1.18);
      const upper = mesh(geometries.icosa, materials.hostile);
      upper.scale.set(0.92, 0.82, 0.92);
      upper.position.y = 0.68;
      body.add(lower, upper);
      movingParts.push(upper);
    }
    body.add(core);
    const telegraph = createTelegraph();
    const telegraphLine = createTelegraphLine();
    root.add(body, telegraph, telegraphLine);
    return { root, body, core, movingParts, telegraph, telegraphLine };
  }

  function createBoss(archetype: BossArchetype, partIds: readonly string[]): BossVisual {
    const root = own(new THREE.Group());
    root.name = `v2-boss-${archetype}`;
    const body = new THREE.Group();
    const movingParts: THREE.Object3D[] = [];
    const partRoots = new Map<string, THREE.Object3D>();
    const core = mesh(archetype === "cube-fortress" ? geometries.roundedLarge : geometries.icosa, materials.bossCore);
    core.scale.setScalar(archetype === "cube-fortress" ? 1.55 : 1.35);
    const shield = mesh(geometries.shield, materials.shield);
    shield.scale.setScalar(archetype === "cube-fortress" ? 3.6 : 3.05);
    shield.castShadow = false;
    shield.receiveShadow = false;

    if (archetype === "prism-hound") {
      const hull = mesh(geometries.triangle, materials.boss);
      hull.scale.set(2.15, 1.55, 2.35);
      const spine = mesh(geometries.roundedLarge, materials.bossDark);
      spine.scale.set(0.7, 1.1, 2.4);
      spine.position.y = 0.35;
      body.add(hull, spine);
      movingParts.push(spine);
    } else if (archetype === "cube-fortress") {
      const inner = mesh(geometries.roundedLarge, materials.bossDark);
      inner.scale.setScalar(2.25);
      body.add(inner);
      movingParts.push(inner);
    } else {
      const center = mesh(geometries.dodeca, materials.boss);
      center.scale.setScalar(2.35);
      const crown = mesh(geometries.ring, materials.bossDark);
      crown.scale.setScalar(2.2);
      crown.rotation.x = Math.PI * 0.5;
      body.add(center, crown);
      movingParts.push(center, crown);
    }

    partIds.forEach((partId, index) => {
      const partRoot = new THREE.Group();
      const block = mesh(
        archetype === "singularity-crown" ? geometries.dodeca : geometries.roundedLarge,
        index % 2 === 0 ? materials.boss : materials.bossDark,
      );
      block.scale.setScalar(archetype === "cube-fortress" ? 1.15 : 0.92);
      partRoot.add(block);
      partRoots.set(partId, partRoot);
      movingParts.push(partRoot);
      root.add(partRoot);
    });
    const telegraph = createTelegraph();
    telegraph.scale.setScalar(archetype === "singularity-crown" ? 5.8 : 4.6);
    const telegraphLine = createTelegraphLine();
    body.add(core, shield);
    root.add(body, telegraph, telegraphLine);
    return { root, core, shield, body, partRoots, movingParts, telegraph, telegraphLine };
  }

  function createObstacle(archetype: ObstacleArchetype): ObstacleVisual {
    const root = own(new THREE.Group());
    root.name = `v2-obstacle-${archetype}`;
    let main: THREE.Mesh;
    if (archetype === "pillar") {
      main = mesh(geometries.cylinder, materials.obstacle);
      main.scale.set(2.1, 3.4, 2.1);
      main.position.y = 1.7;
    } else if (archetype === "reflector") {
      main = mesh(geometries.triangle, materials.reflector);
      main.scale.set(1.9, 2.2, 0.95);
      main.rotation.x = Math.PI * 0.5;
      main.position.y = 1.15;
    } else {
      main = mesh(geometries.octa, materials.hazard);
      main.scale.set(1.45, 2.25, 1.45);
      main.position.y = 1.25;
    }
    const pulse = mesh(geometries.groundRing, archetype === "reflector" ? materials.wake : materials.telegraph);
    pulse.rotation.x = -Math.PI * 0.5;
    pulse.position.y = 0.04;
    pulse.scale.setScalar(archetype === "pillar" ? 2 : 1.7);
    pulse.castShadow = false;
    root.add(main, pulse);
    return { root, pulse };
  }

  function createProjectile(kind: "pulse" | "radial" | "boss"): ProjectileVisual {
    const root = own(new THREE.Group());
    root.name = `v2-projectile-${kind}`;
    const body = mesh(
      kind === "radial" ? geometries.octa : geometries.projectile,
      kind === "boss" ? materials.bossProjectile : materials.projectile,
    );
    if (kind === "radial") body.scale.setScalar(0.5);
    root.add(body);
    return { root, body };
  }

  return {
    id: PRIMITIVE_VISUAL_PROVIDER_ID,
    createPlayer,
    createEnemy,
    createBoss,
    createObstacle,
    createProjectile,
    dispose() {
      allRoots.forEach((root) => root.removeFromParent());
      Object.values(geometries).forEach((geometry) => geometry.dispose());
      Object.values(materials).forEach((surface) => surface.dispose());
      allRoots.clear();
    },
  };
}
