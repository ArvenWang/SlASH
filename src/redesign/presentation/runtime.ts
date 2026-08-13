import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { GameEvent, GameState, PathSegmentState } from "../state";
import { distance, normalize, subtract } from "../math";
import { chargeProgress, currentWorldTimeScale, previewPrimaryPath, previewUltimatePath } from "../game";
import { computeCameraFrame } from "./camera";
import type { ArenaBounds } from "../config";
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
    readonly ultimatePreviewSegmentCount: number;
    readonly confirmedUltimateSegmentCount: number;
    readonly worldTimeScale: number;
    readonly bulletTimeEffect: number;
    readonly bossVisualScale: number | null;
    readonly ultimateCameraLocked: boolean;
    readonly ultimateVfxObjectCount: number;
    readonly sceneObjects: number;
  };
  dispose(): void;
}

interface PreviewSegmentVisual {
  readonly mesh: THREE.Mesh;
  readonly geometry: THREE.PlaneGeometry;
  readonly material: THREE.ShaderMaterial;
}

function createPreviewSegment(color = 0x8df4ff): PreviewSegmentVisual {
  const geometry = new THREE.PlaneGeometry(1, 1, 1, 1);
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uTime: { value: 0 },
      uCharge: { value: 0 },
      uOpacity: { value: 0.36 },
      uLength: { value: 1 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform vec3 uColor;
      uniform float uTime;
      uniform float uCharge;
      uniform float uOpacity;
      uniform float uLength;
      float chevron(vec2 uv) {
        vec2 cell = vec2(fract(uv.x), uv.y);
        float arm = abs(cell.y - 0.5) - max(0.0, 0.72 - cell.x) * 0.62;
        float band = 1.0 - smoothstep(0.025, 0.075, abs(arm));
        float clipRear = smoothstep(0.08, 0.2, cell.x);
        float clipFront = 1.0 - smoothstep(0.72, 0.9, cell.x);
        return band * clipRear * clipFront;
      }
      void main() {
        float lateral = abs(vUv.y - 0.5) * 2.0;
        float bodyMask = 1.0 - smoothstep(0.96, 1.0, lateral);
        float edgeLine = smoothstep(0.78, 0.94, lateral) * (1.0 - smoothstep(0.94, 1.0, lateral));
        float flowX = vUv.x * max(2.0, uLength / 3.2) - uTime * (1.7 + uCharge * 1.4);
        float flow = chevron(vec2(flowX, vUv.y));
        float base = 0.24 + uCharge * 0.2;
        float endCaps = smoothstep(0.0, 0.025, vUv.x) * smoothstep(0.0, 0.025, 1.0 - vUv.x);
        float alpha = (base + edgeLine * 0.58 + flow * (0.72 + uCharge * 0.38)) * bodyMask * endCaps * uOpacity;
        vec3 color = mix(uColor * 0.72, vec3(0.92, 1.0, 1.0), flow * 0.72 + uCharge * 0.18);
        gl_FragColor = vec4(color, alpha);
      }
    `,
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
  renderer.toneMappingExposure = 0.96;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const roomEnvironment = new RoomEnvironment();
  const environmentTarget = pmrem.fromScene(roomEnvironment, 0.04);
  scene.environment = environmentTarget.texture;
  scene.environmentIntensity = 0.42;
  roomEnvironment.dispose();
  pmrem.dispose();
  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.16, 0.28, 1.18);
  const bulletTimePass = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      uCenter: { value: new THREE.Vector2(0.5, 0.5) },
      uStrength: { value: 0 },
      uTime: { value: 0 },
      uAspect: { value: 1 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform vec2 uCenter;
      uniform float uStrength;
      uniform float uTime;
      uniform float uAspect;
      varying vec2 vUv;
      void main() {
        vec2 aspectDelta = vUv - uCenter;
        aspectDelta.x *= uAspect;
        float radius = length(aspectDelta);
        vec2 direction = normalize(aspectDelta + vec2(0.0001));
        direction.x /= uAspect;
        float pulse = 0.84 + sin(uTime * 3.4 - radius * 18.0) * 0.16;
        float shift = uStrength * pulse * (0.0009 + radius * 0.0028);
        vec2 redUv = clamp(vUv + direction * shift, vec2(0.001), vec2(0.999));
        vec2 cyanUv = clamp(vUv - direction * shift * 0.55, vec2(0.001), vec2(0.999));
        vec4 base = texture2D(tDiffuse, vUv);
        float red = texture2D(tDiffuse, redUv).r;
        vec2 cyan = texture2D(tDiffuse, cyanUv).gb;
        float radial = smoothstep(0.04, 0.78, radius);
        vec3 shifted = vec3(red, cyan);
        vec3 graded = base.rgb * vec3(
          1.0 + radial * uStrength * 0.12,
          1.0 - radial * uStrength * 0.045,
          1.0 - radial * uStrength * 0.065
        );
        shifted += vec3(0.055, -0.006, -0.012) * uStrength * radial;
        shifted *= 1.0 - radial * uStrength * 0.04;
        gl_FragColor = vec4(mix(graded, shifted, uStrength * 0.42), base.a);
      }
    `,
  });
  const output = new OutputPass();
  composer.addPass(renderPass);
  composer.addPass(bloom);
  composer.addPass(bulletTimePass);
  composer.addPass(output);

  const hemisphere = new THREE.HemisphereLight(0xc8d9dc, 0x10171a, 1.05);
  scene.add(hemisphere);
  const key = new THREE.DirectionalLight(0xfff4e5, 2.15);
  key.position.set(-32, 44, 30);
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
  const fill = new THREE.DirectionalLight(0x89aeb5, 0.72);
  fill.position.set(30, 20, -24);
  scene.add(fill);

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
  const previewSegments = Array.from({ length: 8 }, () => createPreviewSegment());
  previewSegments.forEach((preview) => scene.add(preview.mesh));
  const storedPreviewSegments = [createPreviewSegment(0xff8f61), createPreviewSegment(0xff8f61), createPreviewSegment(0xff8f61)];
  storedPreviewSegments.forEach((preview) => {
    preview.material.uniforms.uOpacity!.value = 0.2;
    scene.add(preview.mesh);
  });
  let previewSegmentCount = 0;
  let previewWidth = 0;
  let ultimatePreviewSegmentCount = 0;
  let confirmedUltimateSegmentCount = 0;
  let bulletTimeMix = 0;
  let presentationElapsed = 0;
  let currentBossVisualScale: number | null = null;
  let ultimateCameraBounds: ArenaBounds | null = null;
  let ultimateCameraReleaseAt = -1;
  let lastUltimateAfterimageTime = -1;
  let lastUltimateAfterimagePosition: { x: number; z: number } | null = null;
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
    const chargedDash = player.action === "dashing" && player.dash?.kind === "charged";
    const ultimateDash = player.action === "dashing" && player.dash?.kind === "ultimate";
    const ultimatePlanning = player.action === "ultimate-planning";
    const charge = chargeProgress(game);
    playerVisual.shockShell.visible = chargedDash || ultimateDash || charge > 0.02 || ultimatePlanning;
    playerVisual.shockCone.visible = chargedDash || ultimateDash;
    if (player.action === "dashing") {
      playerVisual.wake.scale.set(
        ultimateDash ? 1.48 : chargedDash ? 1.18 : 0.68,
        ultimateDash ? 0.26 : chargedDash ? 0.2 : 0.1,
        (ultimateDash ? 3.4 : chargedDash ? 2.2 : 1.1) + Math.sin(time * 24) * 0.16,
      );
      playerVisual.shockShell.scale.setScalar((ultimateDash ? 1.24 : 0.9) + Math.sin(time * 28) * 0.12);
      playerVisual.shockShell.rotation.z += ultimateDash ? 0.3 : chargedDash ? 0.18 : 0;
      playerVisual.shockCone.scale.set(
        1.05 + Math.sin(time * 32) * 0.08,
        1.05 + Math.sin(time * 32) * 0.08,
        1.35 + Math.sin(time * 22) * 0.12,
      );
    }
    if (ultimatePlanning) {
      playerVisual.shockShell.scale.setScalar(1.3 + Math.sin(presentationElapsed * 7) * 0.09);
      playerVisual.shockShell.rotation.z += 0.085;
    } else if (!chargedDash && charge > 0.02) {
      playerVisual.shockShell.scale.setScalar(0.65 + charge * 0.72 + Math.sin(time * 10) * 0.04);
      playerVisual.shockShell.rotation.z += 0.025 + charge * 0.04;
    }
    const shockMaterial = playerVisual.shockShell.material as THREE.MeshBasicMaterial;
    shockMaterial.color.setHex(ultimatePlanning || ultimateDash ? 0xff4d5f : 0xb9fbff);
    shockMaterial.opacity = ultimatePlanning ? 0.68 : ultimateDash ? 0.82 : chargedDash ? 0.5 : 0.16 + charge * 0.34;
    const shockConeMaterial = playerVisual.shockCone.material as THREE.MeshBasicMaterial;
    shockConeMaterial.color.setHex(ultimateDash ? 0xff6972 : 0x9ff8ff);
    shockConeMaterial.opacity = ultimateDash ? 0.34 : chargedDash ? 0.2 : 0;
    playerVisual.core.scale.setScalar(0.3 + charge * 0.22 + Math.sin(time * 14) * charge * 0.03);
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
        const visualScale = enemyVisualScale(enemy.archetype);
        visual.root.scale.setScalar(visualScale);
      } else {
        const progress = Math.min(1, enemy.deathElapsedMs / 720);
        visual.root.scale.setScalar(enemyVisualScale(enemy.archetype) * (1 - progress * 0.78));
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
    const baseScale = bossVisualScale(boss.archetype);
    currentBossVisualScale = baseScale;
    visual.root.position.set(boss.position.x, boss.height + Math.sin(time * 1.8) * 0.08, boss.position.z);
    visual.root.scale.setScalar(baseScale);
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
      visual.root.scale.setScalar(baseScale * (1 - progress * 0.72));
      visual.root.rotation.z = progress * 1.8;
    }
  }

  function syncPreview(game: GameState): void {
    const visible = game.phase === "combat"
      && game.player.action !== "dashing"
      && (game.player.action !== "recovering" || game.player.bufferedPrimary !== null)
      && game.player.action !== "dead";
    if (!visible) {
      previewSegments.forEach((preview) => { preview.mesh.visible = false; });
      previewSegmentCount = 0;
      previewWidth = 0;
      ultimatePreviewSegmentCount = 0;
      confirmedUltimateSegmentCount = 0;
    } else if (game.player.action === "ultimate-planning") {
      const path = previewUltimatePath(game);
      previewSegmentCount = path.segments.length;
      previewWidth = path.hitRadius;
      ultimatePreviewSegmentCount = path.segments.length;
      confirmedUltimateSegmentCount = path.confirmedSegmentCount;
      syncRibbonPreviews(
        previewSegments,
        path.segments,
        path.hitRadius,
        0.62,
        presentationElapsed,
        1,
        path.confirmedSegmentCount,
        0xff5545,
        0xffb06b,
      );
    } else {
      const path = previewPrimaryPath(game);
      const buffered = game.player.action === "recovering" && game.player.bufferedPrimary !== null;
      previewSegmentCount = path.segments.length;
      previewWidth = path.hitRadius;
      ultimatePreviewSegmentCount = 0;
      confirmedUltimateSegmentCount = 0;
      syncRibbonPreviews(
        previewSegments,
        path.segments,
        path.hitRadius,
        buffered ? 0.44 : 0.5,
        presentationElapsed,
        chargeProgress(game),
        path.segments.length,
        buffered ? 0xffc66d : 0x8df4ff,
      );
    }
    if (game.storedPath) {
      syncRibbonPreviews(storedPreviewSegments, game.storedPath.segments, 0.24, 0.2, game.elapsedMs / 1_000, 0);
    } else {
      storedPreviewSegments.forEach((preview) => { preview.mesh.visible = false; });
    }
  }

  function consume(events: readonly GameEvent[], game: GameState): void {
    for (const event of events) {
      if (event.type === "dash-started") {
        if (event.dash.kind === "ultimate") {
          vfx.spawnUltimateRoute(event.dash.segments, event.dash.hitRadius);
          ultimateCameraBounds = boundsForUltimateRoute(event.dash.segments);
          ultimateCameraReleaseAt = -1;
          lastUltimateAfterimageTime = -1;
          lastUltimateAfterimagePosition = null;
        } else {
          vfx.spawnPath(
            event.dash.segments,
            event.dash.hitRadius,
            event.dash.kind === "charged" ? 0xd9fdff : 0x8ff7ff,
            event.dash.kind === "charged" ? 0.52 : 0.32,
          );
        }
        if (event.dash.kind === "charged") {
          vfx.spawnShockwave(event.dash.segments[0]?.from ?? game.player.position, 2.8, 0xbafcff);
        }
      } else if (event.type === "ultimate-segment-started") {
        const direction = normalize(subtract(event.segment.to, event.segment.from));
        vfx.spawnUltimateSegment(event.segment, event.segmentIndex);
        vfx.spawnUltimateAfterimage(event.segment.from, direction, 1.08);
      } else if (event.type === "dash-ended") {
        if (event.kind === "ultimate") {
          vfx.spawnShockwave(event.position, 5.2, 0xff5868);
          vfx.spawnBurst(event.position, 4.4, 0xffe4d5);
          ultimateCameraReleaseAt = presentationElapsed + 0.46;
          lastUltimateAfterimagePosition = null;
        }
        if (event.kind === "charged") {
          vfx.spawnShockwave(event.position, 4.2 + event.hitRadius, 0xd8fdff);
          vfx.spawnBurst(event.position, 2.8 + event.hitRadius, 0xd8fdff);
        }
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
    presentationElapsed += Math.max(0, deltaSeconds);
    if (ultimateCameraReleaseAt >= 0 && presentationElapsed >= ultimateCameraReleaseAt) {
      ultimateCameraBounds = null;
      ultimateCameraReleaseAt = -1;
    }
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
    const ultimateDashing = game.player.action === "dashing" && game.player.dash?.kind === "ultimate";
    if (ultimateDashing && (
      lastUltimateAfterimageTime < 0
      || presentationElapsed - lastUltimateAfterimageTime >= 0.055
    ) && (
      !lastUltimateAfterimagePosition
      || distance(lastUltimateAfterimagePosition, game.player.position) >= 1.4
    )) {
      vfx.spawnUltimateAfterimage(game.player.position, game.player.facing, 0.88);
      lastUltimateAfterimageTime = presentationElapsed;
      lastUltimateAfterimagePosition = { ...game.player.position };
    }
    const frame = computeCameraFrame(
      canvas.clientWidth,
      canvas.clientHeight,
      game.player.position,
      ultimateCameraBounds ?? undefined,
    );
    const follow = 1 - Math.exp(-Math.max(0, deltaSeconds) * (ultimateCameraBounds ? 2.1 : 4.6));
    camera.position.lerp(new THREE.Vector3(...frame.position), follow);
    cameraLookTarget.lerp(new THREE.Vector3(...frame.target), follow);
    camera.lookAt(cameraLookTarget);
    const projectedPlayer = new THREE.Vector3(
      game.player.position.x,
      game.player.height,
      game.player.position.z,
    ).project(camera);
    const focusEffectTarget = game.player.action === "ultimate-planning" ? 1 : ultimateDashing ? 0.46 : 0;
    bulletTimeMix += (focusEffectTarget - bulletTimeMix)
      * (1 - Math.exp(-Math.max(0, deltaSeconds) * 8.5));
    bloom.strength += ((ultimateDashing ? 0.44 : 0.16) - bloom.strength)
      * (1 - Math.exp(-Math.max(0, deltaSeconds) * 10));
    bulletTimePass.uniforms.uCenter!.value.set(
      projectedPlayer.x * 0.5 + 0.5,
      projectedPlayer.y * 0.5 + 0.5,
    );
    bulletTimePass.uniforms.uStrength!.value = bulletTimeMix;
    bulletTimePass.uniforms.uTime!.value = presentationElapsed;
    environment.update(time, game.player.position.x, game.player.position.z);
    vfx.update(deltaSeconds);
  }

  function resize(game: GameState): void {
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    const frame = computeCameraFrame(width, height, game.player.position, ultimateCameraBounds ?? undefined);
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
    bulletTimePass.uniforms.uAspect!.value = width / height;
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
        ultimatePreviewSegmentCount,
        confirmedUltimateSegmentCount,
        worldTimeScale: currentWorldTimeScale(state),
        bulletTimeEffect: bulletTimeMix,
        bossVisualScale: currentBossVisualScale,
        ultimateCameraLocked: ultimateCameraBounds !== null,
        ultimateVfxObjectCount: countNamedObjects(scene, "vector-focus"),
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
      environmentTarget.dispose();
      renderer.dispose();
    },
  };
}

function syncRibbonPreviews(
  visuals: readonly PreviewSegmentVisual[],
  segments: readonly PathSegmentState[],
  hitRadius: number,
  opacity: number,
  time: number,
  charge: number,
  confirmedSegmentCount = segments.length,
  confirmedColor = 0x8df4ff,
  pendingColor = confirmedColor,
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
    const pathColor = index < confirmedSegmentCount ? confirmedColor : pendingColor;
    visual.material.uniforms.uColor!.value.setHex(segment.reflected ? 0xffc35a : pathColor);
    visual.material.uniforms.uTime!.value = time;
    visual.material.uniforms.uCharge!.value = charge;
    const confirmationOpacity = index < confirmedSegmentCount ? 1 : 0.72;
    visual.material.uniforms.uOpacity!.value = (segment.reflected ? opacity * 1.18 : opacity) * confirmationOpacity;
    visual.material.uniforms.uLength!.value = segmentLength;
  });
}

function enemyVisualScale(archetype: string): number {
  if (archetype === "splitter-shard") return 0.76;
  if (archetype === "shooter") return 1.08;
  if (archetype === "chaser") return 1.18;
  if (archetype === "splitter") return 1.3;
  if (archetype === "spinner") return 1.42;
  if (archetype === "slammer") return 1.56;
  return 1.16;
}

function bossVisualScale(archetype: string): number {
  if (archetype === "prism-hound") return 1.36;
  if (archetype === "cube-fortress") return 1.5;
  return 1.62;
}

function boundsForUltimateRoute(segments: readonly PathSegmentState[]): ArenaBounds {
  const points = segments.flatMap((segment) => [segment.from, segment.to]);
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minZ = Math.min(...points.map((point) => point.z));
  const maxZ = Math.max(...points.map((point) => point.z));
  const centerX = (minX + maxX) * 0.5;
  const centerZ = (minZ + maxZ) * 0.5;
  const halfWidth = Math.max(18, (maxX - minX) * 0.5 + 5);
  const halfDepth = Math.max(12, (maxZ - minZ) * 0.5 + 5);
  return {
    minX: centerX - halfWidth,
    maxX: centerX + halfWidth,
    minZ: centerZ - halfDepth,
    maxZ: centerZ + halfDepth,
  };
}

function countNamedObjects(root: THREE.Object3D, token: string): number {
  let count = 0;
  root.traverse((object) => {
    if (object.name.includes(token)) count += 1;
  });
  return count;
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
