import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import type { GameEvent, GameState, PathSegmentState } from "../state";
import { distance, normalize, subtract } from "../math";
import { previewPrimaryPath } from "../game";
import { computeCameraFrame } from "./camera";
import { createGeometricArena } from "./environment-provider";
import { createPrimitiveVisualProvider } from "./primitive-provider";
import type {
  BossVisual,
  EnemyVisual,
  ObstacleVisual,
  ProjectileVisual,
} from "./types";
import { createGeometricVfx } from "./vfx-provider";

export interface PresentationRuntime {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  update(deltaSeconds: number, state: GameState): void;
  consume(events: readonly GameEvent[], state: GameState): void;
  pointerToWorld(clientX: number, clientY: number): { x: number; z: number } | null;
  resize(state: GameState): void;
  render(): void;
  snapshot(): {
    readonly providerId: string;
    readonly environmentId: string;
    readonly vfxId: string;
    readonly playerKind: "cursor-craft";
    readonly enemyVisualCount: number;
    readonly bossVisual: string | null;
    readonly previewSegmentCount: number;
    readonly previewWidth: number;
    readonly sceneObjects: number;
  };
  dispose(): void;
}

interface PreviewSegmentVisual {
  readonly mesh: THREE.Mesh;
  readonly geometry: THREE.PlaneGeometry;
  readonly material: THREE.MeshBasicMaterial;
}

function createPreviewSegment(): PreviewSegmentVisual {
  const geometry = new THREE.PlaneGeometry(1, 1, 1, 1);
  const material = new THREE.MeshBasicMaterial({
    color: 0x8df4ff,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI * 0.5;
  mesh.position.y = 0.08;
  mesh.renderOrder = 5;
  mesh.visible = false;
  return { mesh, geometry, material };
}

export function createPresentationRuntime(
  canvas: HTMLCanvasElement,
  state: GameState,
): PresentationRuntime {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x071015);
  scene.fog = new THREE.FogExp2(0x071015, 0.0065);
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 420);
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
    stencil: false,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.32, 0.4, 0.95);
  const output = new OutputPass();
  composer.addPass(renderPass);
  composer.addPass(bloom);
  composer.addPass(output);

  const hemisphere = new THREE.HemisphereLight(0xcdf0f3, 0x0a1014, 1.35);
  scene.add(hemisphere);
  const key = new THREE.DirectionalLight(0xe5fbff, 3.85);
  key.position.set(-24, 38, 26);
  key.castShadow = true;
  key.shadow.mapSize.set(1536, 1536);
  key.shadow.camera.left = -42;
  key.shadow.camera.right = 42;
  key.shadow.camera.top = 30;
  key.shadow.camera.bottom = -30;
  key.shadow.camera.near = 4;
  key.shadow.camera.far = 100;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.05;
  scene.add(key);
  const cyanRim = new THREE.PointLight(0x78e9f3, 180, 46, 2);
  cyanRim.position.set(24, 11, -16);
  scene.add(cyanRim);
  const redRim = new THREE.PointLight(0xff5939, 130, 38, 2);
  redRim.position.set(-22, 8, 16);
  scene.add(redRim);

  const provider = createPrimitiveVisualProvider();
  const environment = createGeometricArena(scene);
  const vfx = createGeometricVfx(scene);
  const playerVisual = provider.createPlayer();
  scene.add(playerVisual.root);
  const enemyVisuals = new Map<string, EnemyVisual>();
  const obstacleVisuals = new Map<string, ObstacleVisual>();
  const projectileVisuals = new Map<string, ProjectileVisual>();
  let bossVisual: BossVisual | null = null;
  let bossVisualId: string | null = null;
  const previewSegments = [createPreviewSegment(), createPreviewSegment(), createPreviewSegment()];
  previewSegments.forEach((preview) => scene.add(preview.mesh));
  const storedPreviewSegments = [createPreviewSegment(), createPreviewSegment(), createPreviewSegment()];
  storedPreviewSegments.forEach((preview) => {
    preview.material.color.setHex(0xff8f61);
    preview.material.opacity = 0.13;
    scene.add(preview.mesh);
  });
  let previewSegmentCount = 0;
  let previewWidth = 0;
  let disposed = false;
  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();
  const pointerPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const cameraLookTarget = new THREE.Vector3();

  function ensureEnemyVisuals(game: GameState): void {
    for (const enemy of game.enemies) {
      if (enemyVisuals.has(enemy.id)) continue;
      const visual = provider.createEnemy(enemy.archetype);
      enemyVisuals.set(enemy.id, visual);
      scene.add(visual.root);
      scene.add(visual.telegraphLine);
    }
    for (const [id, visual] of enemyVisuals) {
      const enemy = game.enemies.find((candidate) => candidate.id === id);
      if (enemy && (enemy.alive || enemy.deathElapsedMs < 850)) continue;
      visual.root.removeFromParent();
      visual.telegraphLine.removeFromParent();
      enemyVisuals.delete(id);
    }
  }

  function ensureObstacleVisuals(game: GameState): void {
    for (const obstacle of game.obstacles) {
      if (obstacleVisuals.has(obstacle.id)) continue;
      const visual = provider.createObstacle(obstacle.archetype);
      obstacleVisuals.set(obstacle.id, visual);
      scene.add(visual.root);
    }
    for (const [id, visual] of obstacleVisuals) {
      if (game.obstacles.some((obstacle) => obstacle.id === id)) continue;
      visual.root.removeFromParent();
      obstacleVisuals.delete(id);
    }
  }

  function ensureProjectileVisuals(game: GameState): void {
    for (const projectile of game.projectiles) {
      if (projectileVisuals.has(projectile.id)) continue;
      const visual = provider.createProjectile(projectile.kind);
      projectileVisuals.set(projectile.id, visual);
      scene.add(visual.root);
    }
    for (const [id, visual] of projectileVisuals) {
      if (game.projectiles.some((projectile) => projectile.id === id && projectile.alive)) continue;
      visual.root.removeFromParent();
      projectileVisuals.delete(id);
    }
  }

  function ensureBossVisual(game: GameState): void {
    if (!game.boss) {
      bossVisual?.root.removeFromParent();
      bossVisual?.telegraphLine.removeFromParent();
      bossVisual = null;
      bossVisualId = null;
      return;
    }
    if (bossVisualId === game.boss.id && bossVisual) return;
    bossVisual?.root.removeFromParent();
    bossVisual?.telegraphLine.removeFromParent();
    bossVisual = provider.createBoss(game.boss.archetype, game.boss.parts.map((part) => part.id));
    bossVisualId = game.boss.id;
    scene.add(bossVisual.root);
    scene.add(bossVisual.telegraphLine);
  }

  function syncPlayer(game: GameState, time: number): void {
    const player = game.player;
    const yaw = Math.atan2(player.facing.x, player.facing.z);
    const speedTilt = player.action === "dashing" ? -0.24 : player.action === "charging" ? 0.14 : 0;
    const idle = Math.sin(time * 2.7) * 0.045;
    playerVisual.root.position.set(player.position.x, player.height + idle, player.position.z);
    playerVisual.root.rotation.set(speedTilt, yaw, Math.sin(time * 2.1) * 0.035);
    const squash = player.action === "charging" ? 0.94 : player.action === "dashing" ? 0.88 : 1 + Math.sin(time * 3.4) * 0.018;
    playerVisual.root.scale.set(1.52 / squash, 1.52 * squash, 1.52 / squash);
    playerVisual.core.rotation.y += 0.04;
    playerVisual.core.rotation.x += 0.025;
    playerVisual.wake.visible = player.action === "dashing";
    if (player.action === "dashing") playerVisual.wake.scale.z = 1.1 + Math.sin(time * 24) * 0.16;
  }

  function syncEnemy(game: GameState, time: number): void {
    for (const enemy of game.enemies) {
      const visual = enemyVisuals.get(enemy.id);
      if (!visual) continue;
      const yaw = Math.atan2(enemy.facing.x, enemy.facing.z);
      const idlePhase = stablePhase(enemy.id);
      const idle = Math.sin(time * (2.2 + idlePhase * 0.4) + idlePhase * 8) * 0.06;
      visual.root.position.set(enemy.position.x, enemy.height + idle, enemy.position.z);
      visual.root.rotation.y = yaw;
      const activeLean = enemy.phase === "active" ? -0.22 : enemy.phase === "telegraph" ? 0.14 : 0;
      visual.body.rotation.x = activeLean;
      visual.body.rotation.y = enemy.archetype === "spinner" ? enemy.rotationRadians : Math.sin(time * 1.6 + idlePhase) * 0.035;
      const pulse = enemy.phase === "telegraph" ? 1 + Math.sin(time * 15) * 0.1 : 1 + Math.sin(time * 3 + idlePhase) * 0.025;
      visual.core.scale.setScalar((enemy.archetype === "splitter-shard" ? 0.32 : 0.42) * pulse);
      visual.telegraph.visible = enemy.alive && (enemy.phase === "telegraph" || enemy.phase === "airborne");
      visual.telegraph.scale.setScalar(enemy.archetype === "slammer" ? 4.2 : 1.4 + Math.sin(time * 7) * 0.15);
      visual.telegraphLine.visible = enemy.alive && enemy.phase === "telegraph" && enemy.lockedTarget !== null && enemy.archetype !== "spinner" && enemy.archetype !== "slammer";
      if (visual.telegraphLine.visible && enemy.lockedTarget) {
        setWorldLine(visual.telegraphLine, enemy.position, enemy.lockedTarget);
      }
      visual.movingParts.forEach((part, index) => {
        if (enemy.archetype === "spinner") part.rotation.y = time * (enemy.phase === "active" ? 8 : 2.4) + index * Math.PI / 3;
        else part.rotation.z = Math.sin(time * 3 + index * 1.7 + idlePhase) * 0.08;
      });
      if (enemy.alive) {
        const visualScale = enemy.archetype === "splitter-shard" ? 1.05 : 1.16;
        visual.root.scale.setScalar(visualScale);
      } else {
        const progress = Math.min(1, enemy.deathElapsedMs / 720);
        visual.root.scale.setScalar(1.16 * (1 - progress * 0.78));
        visual.root.rotation.z += 0.08;
      }
    }
  }

  function syncObstacles(game: GameState, time: number): void {
    for (const obstacle of game.obstacles) {
      const visual = obstacleVisuals.get(obstacle.id);
      if (!visual) continue;
      visual.root.position.set(obstacle.position.x, 0, obstacle.position.z);
      visual.root.rotation.y = obstacle.rotationRadians;
      const pulse = 0.88 + Math.sin(time * 2.4 + obstacle.pulsePhase) * 0.12;
      visual.pulse.scale.setScalar((obstacle.archetype === "pillar" ? 2 : 1.7) * pulse);
      visual.pulse.rotation.z += 0.004;
    }
  }

  function syncProjectiles(game: GameState, time: number): void {
    for (const projectile of game.projectiles) {
      const visual = projectileVisuals.get(projectile.id);
      if (!visual) continue;
      visual.root.position.set(projectile.position.x, projectile.height, projectile.position.z);
      visual.root.rotation.y = Math.atan2(projectile.velocity.x, projectile.velocity.z);
      visual.body.rotation.z = time * 7;
      const pulse = 0.9 + Math.sin(time * 14 + stablePhase(projectile.id) * 8) * 0.12;
      visual.root.scale.setScalar(pulse);
    }
  }

  function syncBoss(game: GameState, time: number): void {
    const boss = game.boss;
    const visual = bossVisual;
    if (!boss || !visual) return;
    visual.root.position.set(boss.position.x, boss.height + Math.sin(time * 1.8) * 0.08, boss.position.z);
    visual.root.rotation.y = Math.atan2(boss.facing.x, boss.facing.z);
    visual.body.rotation.y = boss.archetype === "cube-fortress" ? boss.orbitRadians * 0.35 : Math.sin(time * 1.2) * 0.07;
    visual.body.rotation.z = boss.archetype === "singularity-crown" ? Math.sin(time * 1.4) * 0.12 : 0;
    visual.core.visible = boss.actionPhase !== "defeated";
    visual.core.scale.setScalar((boss.archetype === "cube-fortress" ? 1.55 : 1.35) * (1 + Math.sin(time * 5) * 0.05));
    visual.shield.visible = !boss.vulnerable && boss.actionPhase !== "defeated";
    (visual.shield.material as THREE.MeshBasicMaterial).opacity = boss.shieldFlashMs > 0 ? 0.72 : 0.16;
    visual.shield.rotation.y += 0.012;
    visual.shield.rotation.x += 0.007;
    visual.telegraph.visible = boss.actionPhase === "telegraph";
    visual.telegraph.scale.setScalar((boss.archetype === "singularity-crown" ? 5.8 : 4.6) * (0.92 + Math.sin(time * 8) * 0.08));
    visual.telegraphLine.visible = boss.actionPhase === "telegraph" && boss.lockedTarget !== null;
    if (visual.telegraphLine.visible && boss.lockedTarget) {
      setWorldLine(visual.telegraphLine, boss.position, boss.lockedTarget);
    }
    boss.parts.forEach((part, index) => {
      const partRoot = visual.partRoots.get(part.id);
      if (!partRoot) return;
      partRoot.visible = part.alive || part.height > -4;
      const local = rotateXZ(part.localPosition, boss.orbitRadians);
      partRoot.position.set(local.x, part.height, local.z);
      partRoot.rotation.set(part.rotationRadians * 0.3, part.rotationRadians, part.rotationRadians * 0.22);
      if (!part.alive) {
        partRoot.position.y -= Math.min(6, (time + index * 0.1) * 0.02);
        partRoot.scale.setScalar(0.62);
      } else {
        partRoot.scale.setScalar(1);
      }
    });
    if (boss.actionPhase === "defeated") {
      const progress = Math.min(1, boss.defeatedElapsedMs / 1_000);
      visual.root.scale.setScalar(1 - progress * 0.72);
      visual.root.rotation.z = progress * 1.8;
    }
  }

  function syncPreview(game: GameState): void {
    const visible = game.phase === "combat"
      && game.player.action !== "dashing"
      && game.player.action !== "recovering"
      && game.player.action !== "dead";
    if (!visible) {
      previewSegments.forEach((preview) => { preview.mesh.visible = false; });
      previewSegmentCount = 0;
      previewWidth = 0;
    } else {
      const path = previewPrimaryPath(game);
      previewSegmentCount = path.segments.length;
      previewWidth = path.hitRadius;
      syncRibbonPreviews(previewSegments, path.segments, path.hitRadius, 0.2);
    }
    if (game.storedPath) {
      syncRibbonPreviews(storedPreviewSegments, game.storedPath.segments, 0.24, 0.12);
    } else {
      storedPreviewSegments.forEach((preview) => { preview.mesh.visible = false; });
    }
  }

  function consume(events: readonly GameEvent[], game: GameState): void {
    for (const event of events) {
      if (event.type === "dash-started") {
        vfx.spawnPath(event.dash.segments, event.dash.hitRadius, event.dash.kind === "charged" ? 0xffd05b : 0x8ff7ff, 0.32);
      } else if (event.type === "enemy-killed") {
        const direction = normalize(subtract(game.player.position, event.position), game.player.facing);
        vfx.spawnCut(event.position, direction);
      } else if (event.type === "projectile-cut") {
        vfx.spawnBurst(event.position, 1.2, 0x9ffaff);
      } else if (event.type === "cross-triggered") {
        vfx.spawnBurst(event.position, event.radius, 0xffc15c);
      } else if (event.type === "echo-triggered") {
        vfx.spawnPath(event.segments, event.hitRadius, 0xa4f7ff, 0.38);
      } else if (event.type === "boss-hit") {
        if (game.boss) vfx.spawnBurst(game.boss.position, 2.2, 0xffdb7a);
      } else if (event.type === "boss-shielded") {
        vfx.spawnShield(event.position);
      } else if (event.type === "boss-part-broken") {
        vfx.spawnCut(event.position, { x: 1, z: 0 }, 0xffb35c);
      } else if (event.type === "boss-defeated") {
        if (game.boss) vfx.spawnBurst(game.boss.position, 6.5, 0xffd36c);
      } else if (event.type === "slam-impact") {
        vfx.spawnBurst(event.position, event.radius, 0xff704a);
      }
    }
  }

  function update(deltaSeconds: number, game: GameState): void {
    if (disposed) return;
    ensureEnemyVisuals(game);
    ensureObstacleVisuals(game);
    ensureProjectileVisuals(game);
    ensureBossVisual(game);
    const time = game.elapsedMs / 1_000;
    syncPlayer(game, time);
    syncEnemy(game, time);
    syncObstacles(game, time);
    syncProjectiles(game, time);
    syncBoss(game, time);
    syncPreview(game);
    if (canvas.clientWidth / Math.max(1, canvas.clientHeight) < 0.72) {
      const frame = computeCameraFrame(canvas.clientWidth, canvas.clientHeight, game.player.position);
      const follow = 1 - Math.exp(-Math.max(0, deltaSeconds) * 3.8);
      camera.position.lerp(new THREE.Vector3(...frame.position), follow);
      cameraLookTarget.lerp(new THREE.Vector3(...frame.target), follow);
      camera.lookAt(cameraLookTarget);
    }
    environment.update(time, game.player.position.x, game.player.position.z);
    vfx.update(deltaSeconds);
  }

  function resize(game: GameState): void {
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    const frame = computeCameraFrame(width, height, game.player.position);
    const mobile = Math.min(width, height) < 700;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.2 : 1.65));
    renderer.setSize(width, height, false);
    camera.position.set(...frame.position);
    cameraLookTarget.set(...frame.target);
    camera.lookAt(cameraLookTarget);
    camera.fov = frame.fov;
    camera.aspect = frame.aspect;
    camera.near = frame.near;
    camera.far = frame.far;
    camera.updateProjectionMatrix();
    composer.setSize(width, height);
    bloom.resolution.set(width, height);
  }

  resize(state);
  update(0, state);
  return {
    scene,
    camera,
    renderer,
    update,
    consume,
    pointerToWorld(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      pointerNdc.set(
        (clientX - rect.left) / rect.width * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointerNdc, camera);
      const point = new THREE.Vector3();
      return raycaster.ray.intersectPlane(pointerPlane, point)
        ? { x: point.x, z: point.z }
        : null;
    },
    resize,
    render() {
      composer.render();
    },
    snapshot() {
      return {
        providerId: provider.id,
        environmentId: environment.root.name,
        vfxId: vfx.id,
        playerKind: "cursor-craft",
        enemyVisualCount: enemyVisuals.size,
        bossVisual: bossVisualId,
        previewSegmentCount,
        previewWidth,
        sceneObjects: scene.children.length,
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      previewSegments.forEach((preview) => {
        preview.mesh.removeFromParent();
        preview.geometry.dispose();
        preview.material.dispose();
      });
      storedPreviewSegments.forEach((preview) => {
        preview.mesh.removeFromParent();
        preview.geometry.dispose();
        preview.material.dispose();
      });
      enemyVisuals.forEach((visual) => visual.telegraphLine.removeFromParent());
      bossVisual?.telegraphLine.removeFromParent();
      vfx.dispose();
      environment.dispose();
      provider.dispose();
      composer.dispose();
      renderer.dispose();
    },
  };
}

function syncRibbonPreviews(
  visuals: readonly PreviewSegmentVisual[],
  segments: readonly PathSegmentState[],
  hitRadius: number,
  opacity: number,
): void {
  visuals.forEach((visual, index) => {
    const segment = segments[index];
    visual.mesh.visible = segment !== undefined;
    if (!segment) return;
    const segmentLength = distance(segment.from, segment.to);
    visual.mesh.position.set(
      (segment.from.x + segment.to.x) * 0.5,
      0.08,
      (segment.from.z + segment.to.z) * 0.5,
    );
    visual.mesh.rotation.set(-Math.PI * 0.5, 0, -Math.atan2(segment.to.z - segment.from.z, segment.to.x - segment.from.x));
    visual.mesh.scale.set(segmentLength, hitRadius * 2, 1);
    visual.material.color.setHex(segment.reflected ? 0xffc35a : 0x8df4ff);
    visual.material.opacity = segment.reflected ? opacity * 1.35 : opacity;
  });
}

function setWorldLine(
  mesh: THREE.Mesh,
  from: { x: number; z: number },
  to: { x: number; z: number },
): void {
  const deltaX = to.x - from.x;
  const deltaZ = to.z - from.z;
  mesh.position.set(
    (from.x + to.x) * 0.5,
    0.06,
    (from.z + to.z) * 0.5,
  );
  mesh.rotation.set(0, -Math.atan2(deltaZ, deltaX), 0);
  mesh.scale.set(Math.hypot(deltaX, deltaZ), 0.025, 0.14);
}

function stablePhase(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  return hash / 0xffffffff;
}

function rotateXZ(value: { x: number; z: number }, radians: number): { x: number; z: number } {
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    x: value.x * cosine - value.z * sine,
    z: value.x * sine + value.z * cosine,
  };
}
