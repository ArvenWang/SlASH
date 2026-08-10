import * as THREE from "three";

interface TimedEffect {
  age: number;
  lifetime: number;
  object: THREE.Object3D;
  tick: (normalizedAge: number, dt: number) => void;
}

export interface SlashVfxOptions {
  start: THREE.Vector3;
  end: THREE.Vector3;
  killPositions: THREE.Vector3[];
  actor: THREE.Object3D;
  variant?: "normal" | "chain";
}

export interface KillImpactVfxOptions {
  position: THREE.Vector3;
  direction: THREE.Vector3;
  intensity?: number;
}

export interface VfxRuntime {
  spawnSlash(options: SlashVfxOptions): void;
  spawnCutContact(options: KillImpactVfxOptions): void;
  spawnKillImpact(options: KillImpactVfxOptions): void;
  seedBlood(position: THREE.Vector3, direction?: THREE.Vector3): void;
  clearStage(): void;
  update(dt: number): void;
}

function createBloodSplatTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to create blood decal texture.");
  context.clearRect(0, 0, 256, 256);
  context.translate(128, 128);
  context.fillStyle = "#ffffff";
  context.beginPath();
  for (let i = 0; i < 28; i += 1) {
    const angle = (i / 28) * Math.PI * 2;
    const radius = 48 + Math.sin(i * 8.73) * 13 + Math.sin(i * 2.31) * 9;
    const x = Math.cos(angle) * radius * 1.28;
    const y = Math.sin(angle) * radius * 0.72;
    if (i === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.closePath();
  context.fill();
  context.lineCap = "round";
  for (let i = 0; i < 9; i += 1) {
    const y = -34 + i * 8.7;
    context.lineWidth = 3 + (i % 3);
    context.beginPath();
    context.moveTo(34 + Math.sin(i * 2.8) * 13, y);
    context.lineTo(96 + Math.sin(i * 4.1) * 18, y + Math.cos(i) * 12);
    context.strokeStyle = "#ffffff";
    context.stroke();
  }
  for (let i = 0; i < 18; i += 1) {
    const angle = i * 2.399;
    const distance = 70 + (i % 5) * 10;
    const radius = 2 + (i % 4) * 1.4;
    context.beginPath();
    context.arc(Math.cos(angle) * distance, Math.sin(angle) * distance * 0.65, radius, 0, Math.PI * 2);
    context.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = "procedural-directional-blood-splat";
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

function createBloodMistTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to create blood mist texture.");
  const gradient = context.createRadialGradient(64, 64, 4, 64, 64, 62);
  gradient.addColorStop(0, "rgba(255,255,255,0.88)");
  gradient.addColorStop(0.28, "rgba(255,255,255,0.54)");
  gradient.addColorStop(0.68, "rgba(255,255,255,0.13)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = "procedural-blood-mist";
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

// A few large, torn sheets read as wet directional blood at the gameplay
// camera.  The previous all-over splat texture was designed for the floor and
// made airborne blood collapse into tiny red paper flecks from this distance.
function createBloodCurtainTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to create blood curtain texture.");
  context.clearRect(0, 0, 256, 128);
  context.fillStyle = "#ffffff";
  for (let lane = 0; lane < 4; lane += 1) {
    const y = 18 + lane * 27;
    const wobble = Math.sin(lane * 5.17) * 8;
    context.beginPath();
    context.moveTo(6, y + wobble * 0.25);
    context.bezierCurveTo(54, y - 14, 118, y + 11, 221, y + wobble);
    context.bezierCurveTo(166, y + 15, 76, y + 9, 6, y + 6);
    context.closePath();
    context.fill();
  }
  for (let drop = 0; drop < 7; drop += 1) {
    const x = 122 + drop * 17;
    const y = 14 + (drop * 31) % 91;
    const radius = 4 + (drop % 3) * 2;
    context.beginPath();
    context.ellipse(x, y, radius * 0.72, radius * 1.32, 0.34, 0, Math.PI * 2);
    context.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = "procedural-torn-directional-blood-curtain";
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

const bloodPoolGeometry = new THREE.PlaneGeometry(2, 2);
const bloodSplatTexture = createBloodSplatTexture();
const bloodMistTexture = createBloodMistTexture();
const bloodCurtainTexture = createBloodCurtainTexture();
const unitBox = new THREE.BoxGeometry(1, 1, 1);
const impactFlashGeometry = new THREE.OctahedronGeometry(0.34, 0);
const bloodDropGeometry = new THREE.TetrahedronGeometry(0.085, 0);
const bloodFanGeometry = new THREE.PlaneGeometry(1, 1);

const bloodFamilies = [
  {
    name: "wide-blade-fan",
    poolLength: 1.22,
    poolWidth: 0.54,
    fanWidth: 2.25,
    fanHeight: 0.74,
    fanYaw: -0.08,
    mistWidth: 2.35,
    mistHeight: 0.52,
    forwardMin: 6.8,
    forwardRange: 6.4,
    sideSpread: 2,
    verticalMin: 1,
    verticalRange: 3,
    dropCount: 6,
  },
  {
    name: "high-arterial-arc",
    poolLength: 0.92,
    poolWidth: 0.66,
    fanWidth: 1.48,
    fanHeight: 1.34,
    fanYaw: 0.16,
    mistWidth: 1.58,
    mistHeight: 0.96,
    forwardMin: 5.2,
    forwardRange: 5.2,
    sideSpread: 3.2,
    verticalMin: 2.8,
    verticalRange: 4.8,
    dropCount: 7,
  },
  {
    name: "low-ground-sweep",
    poolLength: 1.52,
    poolWidth: 0.42,
    fanWidth: 2.72,
    fanHeight: 0.48,
    fanYaw: -0.2,
    mistWidth: 2.78,
    mistHeight: 0.38,
    forwardMin: 8.2,
    forwardRange: 7.4,
    sideSpread: 1.35,
    verticalMin: 0.55,
    verticalRange: 1.9,
    dropCount: 5,
  },
] as const;

function createSeededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function orientedBeam(start: THREE.Vector3, end: THREE.Vector3, width: number, material: THREE.Material) {
  const delta = end.clone().sub(start);
  const length = Math.max(0.001, Math.hypot(delta.x, delta.z));
  const beam = new THREE.Mesh(unitBox, material);
  beam.position.copy(start).lerp(end, 0.5);
  beam.position.y += 0.04;
  beam.scale.set(length, 0.018, width);
  beam.rotation.y = -Math.atan2(delta.z, delta.x);
  beam.renderOrder = 9;
  return beam;
}

function bakeActorSilhouette(source: THREE.Object3D) {
  source.updateWorldMatrix(true, true);
  const sourceInverse = source.matrixWorld.clone().invert();
  const positions: number[] = [];
  const vertex = new THREE.Vector3();
  source.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.visible) return;
    const lowerName = child.name.toLowerCase();
    if (lowerName.includes("sword") || lowerName.includes("blade") || lowerName.includes("weapon")) return;
    const attribute = child.geometry.getAttribute("position");
    if (!(attribute instanceof THREE.BufferAttribute)) return;
    const localMatrix = sourceInverse.clone().multiply(child.matrixWorld);
    const index = child.geometry.index;
    const appendVertex = (vertexIndex: number) => {
      vertex.fromBufferAttribute(attribute, vertexIndex);
      if (child instanceof THREE.SkinnedMesh) {
        // BufferGeometry stores the bind-pose positions. Bake the currently
        // authored Tripo pose so the dash echoes match the live silhouette.
        child.applyBoneTransform(vertexIndex, vertex);
      }
      vertex.applyMatrix4(localMatrix);
      positions.push(vertex.x, vertex.y, vertex.z);
    };
    if (index) {
      for (let i = 0; i < index.count; i += 1) appendVertex(index.getX(i));
    } else {
      for (let i = 0; i < attribute.count; i += 1) appendVertex(i);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

export function createVfxRuntime(scene: THREE.Scene): VfxRuntime {
  const effects: TimedEffect[] = [];
  const persistentPools: THREE.Mesh[] = [];

  function addEffect(effect: TimedEffect) {
    scene.add(effect.object);
    effects.push(effect);
  }

  function seedBlood(position: THREE.Vector3, direction = new THREE.Vector3(1, 0, 0), intensity = 1) {
    const seed = (
      Math.imul(Math.round((position.x + 64) * 100), 73_856_093)
      ^ Math.imul(Math.round((position.z + 64) * 100), 19_349_663)
      ^ Math.imul(Math.round((direction.x + 2) * 1000), 83_492_791)
    ) >>> 0;
    const random = createSeededRandom(seed);
    const family = bloodFamilies[seed % bloodFamilies.length];
    const poolMaterial = new THREE.MeshStandardMaterial({
      color: 0x740009,
      emissive: 0x180001,
      emissiveIntensity: 0.24,
      alphaMap: bloodSplatTexture,
      roughness: 0.18,
      metalness: 0,
      transparent: true,
      opacity: 0.94,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    const pool = new THREE.Mesh(bloodPoolGeometry, poolMaterial);
    pool.name = `persistent-blood-pool-${family.name}`;
    pool.rotation.x = -Math.PI / 2;
    pool.position.copy(position);
    pool.position.y = 0.035;
    pool.scale.set(0.01, 0.01, 1);
    pool.rotation.z = Math.atan2(direction.z, direction.x);
    scene.add(pool);
    persistentPools.push(pool);
    if (persistentPools.length > 28) {
      const oldest = persistentPools.shift();
      if (oldest) {
        scene.remove(oldest);
        (oldest.material as THREE.Material).dispose();
      }
    }
    addEffect({
      age: 0,
      lifetime: 0.42,
      object: pool,
      tick: (t) => {
        const open = 1 - Math.pow(1 - Math.min(1, t * 2.1), 3);
        pool.scale.set(
          0.4 + open * family.poolLength,
          0.16 + open * family.poolWidth,
          1,
        );
      },
    });

    const fanMaterial = new THREE.MeshBasicMaterial({
      color: 0x670008,
      alphaMap: bloodCurtainTexture,
      transparent: true,
      opacity: 0.76,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const fanCoreMaterial = new THREE.MeshBasicMaterial({
      color: 0xa80016,
      alphaMap: bloodCurtainTexture,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const fanRoot = new THREE.Group();
    fanRoot.name = `directional-blood-sheet-${family.name}`;
    fanRoot.position.copy(position).addScaledVector(direction, 0.24);
    fanRoot.position.y = 0.38 + random() * 0.18;
    fanRoot.rotation.y = -Math.atan2(direction.z, direction.x) + family.fanYaw + (random() - 0.5) * 0.11;
    const fan = new THREE.Mesh(bloodFanGeometry, fanMaterial);
    fan.rotation.z = (random() - 0.5) * 0.18;
    fan.position.x = 0.32;
    fan.position.y = 0.42;
    const fanHeight = family.fanHeight * (0.9 + random() * 0.2);
    fan.scale.set(0.12, 0.16, 1);
    fan.renderOrder = 8;
    const fanCore = new THREE.Mesh(bloodFanGeometry, fanCoreMaterial);
    fanCore.rotation.z = fan.rotation.z - 0.08;
    fanCore.position.set(0.23, 0.25, 0.012);
    fanCore.scale.set(0.09, 0.11, 1);
    fanCore.renderOrder = 9;
    fanRoot.add(fan, fanCore);
    addEffect({
      age: 0,
      lifetime: 0.29,
      object: fanRoot,
      tick: (t) => {
        const open = 1 - Math.pow(1 - t, 4);
        fan.position.x = 0.32 + open * 0.42;
        fan.scale.set(0.12 + open * family.fanWidth * 0.86 * intensity, 0.16 + open * fanHeight * 1.22 * intensity, 1);
        fanCore.position.x = 0.23 + open * 0.34;
        fanCore.scale.set(0.09 + open * family.fanWidth * 0.42 * intensity, 0.11 + open * fanHeight * 0.54 * intensity, 1);
        fanMaterial.opacity = 0.76 * (1 - THREE.MathUtils.smoothstep(t, 0.46, 1));
        fanCoreMaterial.opacity = 0.62 * (1 - THREE.MathUtils.smoothstep(t, 0.34, 0.88));
      },
    });

    // Keep only a small local mist layer at the contact point.  The directional
    // curtains and heavy droplets stay legible; a large sprite turns five kills
    // into a red fog bank at the fixed gameplay camera.
    const mistMaterial = new THREE.SpriteMaterial({
      color: 0x540006,
      map: bloodMistTexture,
      alphaMap: bloodMistTexture,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    const mist = new THREE.Sprite(mistMaterial);
    mist.position.copy(position).add(new THREE.Vector3(0, 1.14, 0));
    mist.scale.set(0.42, 0.22, 1);
    mist.renderOrder = 7;
    addEffect({
      age: 0,
      lifetime: 0.22,
      object: mist,
      tick: (t) => {
        const open = 1 - Math.pow(1 - t, 3);
        mist.position.x = position.x + direction.x * open * 0.36;
        mist.position.z = position.z + direction.z * open * 0.36;
        mist.scale.set(0.42 + open * family.mistWidth * 0.36, 0.22 + open * family.mistHeight * 0.38, 1);
        mistMaterial.opacity = 0.16 * (1 - THREE.MathUtils.smoothstep(t, 0.08, 0.74));
      },
    });

    const side = new THREE.Vector3(-direction.z, 0, direction.x).normalize();
    const forward = direction.clone().setY(0).normalize();

    const dropCount = Math.round(family.dropCount * Math.min(1.25, intensity));
    const dropMaterial = new THREE.MeshBasicMaterial({ color: 0x9d0011, toneMapped: true });
    const drops = new THREE.InstancedMesh(bloodDropGeometry, dropMaterial, dropCount);
    drops.name = "directional-blood-droplets";
    drops.castShadow = false;
    drops.receiveShadow = false;
    drops.frustumCulled = false;
    drops.renderOrder = 8;
    const dropPositions: THREE.Vector3[] = [];
    const dropVelocities: THREE.Vector3[] = [];
    const dropScales: number[] = [];
    const dropTransform = new THREE.Object3D();
    for (let i = 0; i < dropCount; i += 1) {
      dropPositions.push(position.clone().add(new THREE.Vector3(0, 1.1 + random() * 0.48, 0)));
      const velocity = forward.clone().multiplyScalar((family.forwardMin * 0.72 + random() * family.forwardRange * 0.8) * intensity);
      velocity.addScaledVector(side, (random() - 0.5) * family.sideSpread * 1.25 * intensity);
      velocity.y = family.verticalMin + 0.6 + random() * family.verticalRange;
      dropVelocities.push(velocity);
      dropScales.push(1.15 + random() * 1.4);
    }
    addEffect({
      age: 0,
      lifetime: 0.54,
      object: drops,
      tick: (t, dt) => {
        for (let i = 0; i < dropCount; i += 1) {
          const velocity = dropVelocities[i];
          velocity.y -= 13.4 * dt;
          dropPositions[i].addScaledVector(velocity, dt);
          dropTransform.position.copy(dropPositions[i]);
          dropTransform.rotation.set(t * (i % 2 === 0 ? 4 : -4), t * (2.4 + i * 0.11), t * 3.2);
          const fade = 1 - THREE.MathUtils.smoothstep(t, 0.68, 1);
          const scale = dropScales[i] * fade;
          dropTransform.scale.set(scale * 0.82, scale * 1.82, scale * 0.82);
          dropTransform.updateMatrix();
          drops.setMatrixAt(i, dropTransform.matrix);
        }
        drops.instanceMatrix.needsUpdate = true;
      },
    });

    const shardCount = 5 + Math.round(Math.min(1, intensity) * 2);
    const shardMaterial = new THREE.MeshBasicMaterial({ color: 0x7d3027, transparent: true, opacity: 0.9 });
    const shards = new THREE.InstancedMesh(unitBox, shardMaterial, shardCount);
    shards.name = "mechanical-kill-fragments";
    shards.frustumCulled = false;
    const shardPositions: THREE.Vector3[] = [];
    const shardVelocities: THREE.Vector3[] = [];
    const shardScales: number[] = [];
    const shardTransform = new THREE.Object3D();
    for (let i = 0; i < shardCount; i += 1) {
      shardPositions.push(position.clone().add(new THREE.Vector3(0, 1.18 + random() * 0.44, 0)));
      const velocity = forward.clone().multiplyScalar(2.8 + random() * 3.2);
      velocity.addScaledVector(side, (random() - 0.5) * 3.8);
      velocity.y = 2.2 + random() * 3.6;
      shardVelocities.push(velocity);
      shardScales.push(0.06 + random() * 0.075);
    }
    addEffect({
      age: 0,
      lifetime: 0.3,
      object: shards,
      tick: (t, dt) => {
        for (let i = 0; i < shardCount; i += 1) {
          const velocity = shardVelocities[i];
          velocity.y -= 11 * dt;
          shardPositions[i].addScaledVector(velocity, dt);
          shardTransform.position.copy(shardPositions[i]);
          shardTransform.rotation.set(t * (5 + i), t * (3 + i * 0.6), t * (4 + i * 0.35));
          const scale = shardScales[i] * (1 - THREE.MathUtils.smoothstep(t, 0.76, 1));
          shardTransform.scale.set(scale * 1.7, scale * 0.52, scale);
          shardTransform.updateMatrix();
          shards.setMatrixAt(i, shardTransform.matrix);
        }
        shards.instanceMatrix.needsUpdate = true;
        shardMaterial.opacity = 0.9 * (1 - THREE.MathUtils.smoothstep(t, 0.62, 1));
      },
    });
  }

  function spawnKillImpact({ position, direction, intensity = 1 }: KillImpactVfxOptions) {
    const normalizedDirection = direction.clone().setY(0);
    if (normalizedDirection.lengthSq() < 0.0001) normalizedDirection.set(1, 0, 0);
    normalizedDirection.normalize();

    const flashMaterial = new THREE.MeshBasicMaterial({
      color: 0xff7040,
      transparent: true,
      opacity: 0.52,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const flash = new THREE.Mesh(impactFlashGeometry, flashMaterial);
    flash.position.copy(position).add(new THREE.Vector3(0, 1.36, 0));
    flash.scale.set(1.12, 0.12, 1.12);
    flash.rotation.y = Math.atan2(normalizedDirection.x, normalizedDirection.z);
    flash.renderOrder = 11;
    addEffect({
      age: 0,
      lifetime: 0.082,
      object: flash,
      tick: (t) => {
        const open = 1 - Math.pow(1 - t, 3);
        flash.scale.set(0.94 + open * 1.16, 0.1 + open * 0.07, 0.94 + open * 0.26);
        flashMaterial.opacity = 0.52 * (1 - t);
      },
    });

    seedBlood(position, normalizedDirection, intensity);
  }

  function spawnCutContact({ position, direction, intensity = 1 }: KillImpactVfxOptions) {
    const normalizedDirection = direction.clone().setY(0);
    if (normalizedDirection.lengthSq() < 0.0001) normalizedDirection.set(1, 0, 0);
    normalizedDirection.normalize();

    const root = new THREE.Group();
    root.name = "immediate-cut-contact";
    root.position.copy(position).addScaledVector(normalizedDirection, 0.08).setY(0.62);
    root.rotation.y = -Math.atan2(normalizedDirection.z, normalizedDirection.x);
    const flashMaterial = new THREE.MeshBasicMaterial({
      color: 0xff7b47,
      transparent: true,
      opacity: 0.46,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const flash = new THREE.Mesh(impactFlashGeometry, flashMaterial);
    flash.position.set(0.12, 0.72, 0);
    flash.scale.set(0.56, 0.045, 0.34);
    flash.renderOrder = 11;
    const cutTraceMaterial = new THREE.MeshBasicMaterial({
      color: 0x92000d,
      transparent: true,
      opacity: 0.96,
      depthWrite: false,
      toneMapped: true,
    });
    const cutTrace = new THREE.Mesh(unitBox, cutTraceMaterial);
    cutTrace.name = "immediate-deep-red-cut-trace";
    cutTrace.position.set(0.02, 0.67, -0.006);
    cutTrace.rotation.z = -0.18;
    cutTrace.scale.set(0.04, 0.036, 0.09);
    cutTrace.renderOrder = 12;
    const bloodMaterial = new THREE.MeshBasicMaterial({
      color: 0xf20a2c,
      alphaMap: bloodSplatTexture,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const firstBlood = new THREE.Mesh(bloodFanGeometry, bloodMaterial);
    firstBlood.position.set(0.22, 0.48, 0.01);
    firstBlood.scale.set(0.08, 0.12, 1);
    firstBlood.renderOrder = 10;
    const contactMistMaterial = new THREE.SpriteMaterial({
      color: 0xd90024,
      map: bloodMistTexture,
      alphaMap: bloodMistTexture,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      toneMapped: false,
    });
    const contactMist = new THREE.Sprite(contactMistMaterial);
    contactMist.position.set(0.26, 0.62, 0.025);
    contactMist.scale.set(0.2, 0.13, 1);
    contactMist.renderOrder = 9;
    root.add(firstBlood, contactMist, flash, cutTrace);
    addEffect({
      age: 0,
      lifetime: 0.18,
      object: root,
      tick: (t) => {
        const open = 1 - Math.pow(1 - t, 4);
        flash.scale.set(0.56 + open * 0.44, 0.045, 0.34 + open * 0.14);
        flashMaterial.opacity = 0.46 * (1 - THREE.MathUtils.smoothstep(t, 0.08, 0.52));
        cutTrace.scale.set(0.04 + open * 1.18 * intensity, 0.036, 0.09);
        cutTraceMaterial.opacity = 0.96 * (1 - THREE.MathUtils.smoothstep(t, 0.48, 1));
        firstBlood.position.x = 0.22 + open * 0.34;
        firstBlood.scale.set(
          0.08 + open * 0.82 * intensity,
          0.12 + open * 0.52 * intensity,
          1,
        );
        bloodMaterial.opacity = 0.88 * (1 - THREE.MathUtils.smoothstep(t, 0.42, 1));
        contactMist.position.x = 0.26 + open * 0.38;
        contactMist.scale.set(0.2 + open * 1.12 * intensity, 0.13 + open * 0.44 * intensity, 1);
        contactMistMaterial.opacity = 0.72 * (1 - THREE.MathUtils.smoothstep(t, 0.28, 0.9));
      },
    });
  }

  function spawnSlash({ start, end, killPositions, actor, variant = "normal" }: SlashVfxOptions) {
    const isChain = variant === "chain";
    const coreMaterial = new THREE.MeshBasicMaterial({
      color: 0xd8fbff,
      transparent: true,
      opacity: isChain ? 1 : 0.82,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const fringeMaterial = new THREE.MeshBasicMaterial({
      color: 0x6feaff,
      transparent: true,
      opacity: isChain ? 0.22 : 0.08,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const slash = new THREE.Group();
    const core = orientedBeam(start, end, isChain ? 0.085 : 0.038, coreMaterial);
    core.position.y = 0.66;
    const fringe = orientedBeam(start, end, isChain ? 0.22 : 0.065, fringeMaterial);
    fringe.position.y = 0.64;
    core.scale.x = 0.001;
    fringe.scale.x = 0.001;
    core.position.copy(start).setY(0.66);
    fringe.position.copy(start).setY(0.64);
    slash.add(fringe, core);
    const movingTail = start.clone();
    const movingHead = start.clone();
    addEffect({
      age: 0,
      lifetime: isChain ? 0.48 : killPositions.length >= 5 ? 0.34 : 0.3,
      object: slash,
      tick: (t) => {
        const reveal = THREE.MathUtils.smoothstep(t, 0, 0.34);
        const tail = Math.max(0, reveal - 0.24);
        movingTail.copy(start).lerp(end, tail);
        movingHead.copy(start).lerp(end, reveal);
        const segmentLength = Math.max(0.001, movingTail.distanceTo(movingHead));
        core.position.copy(movingTail).lerp(movingHead, 0.5).setY(0.66);
        fringe.position.copy(movingTail).lerp(movingHead, 0.5).setY(0.64);
        core.scale.x = segmentLength;
        fringe.scale.x = segmentLength;
        coreMaterial.opacity = (isChain ? 1 : 0.82) * (1 - THREE.MathUtils.smoothstep(t, isChain ? 0.55 : 0.38, 0.94));
        fringeMaterial.opacity = (isChain ? 0.22 : 0.08) * (1 - THREE.MathUtils.smoothstep(t, 0.12, isChain ? 0.86 : 0.72));
        fringe.scale.z = (isChain ? 0.22 : 0.065) * (1 + t * (isChain ? 0.75 : 0.32));
      },
    });

    const dashDirection = end.clone().sub(start).setY(0);
    if (dashDirection.lengthSq() < 0.0001) dashDirection.set(1, 0, 0);
    dashDirection.normalize();
    const wakeMaterial = new THREE.MeshBasicMaterial({
      color: 0xe8fdff,
      transparent: true,
      opacity: isChain ? 1 : 0.82,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const wakeStart = start.clone();
    const wakeEnd = start.clone().addScaledVector(dashDirection, 2.4);
    const heroBladeWake = orientedBeam(wakeStart, wakeEnd, 0.026, wakeMaterial);
    heroBladeWake.name = "actor-following-blade-wake";
    heroBladeWake.renderOrder = 10;
    const actorWorldPosition = new THREE.Vector3();
    addEffect({
      age: 0,
      lifetime: 0.18,
      object: heroBladeWake,
      tick: (t) => {
        actor.getWorldPosition(actorWorldPosition);
        // Keep the live blade wake in front of the actor.  If it extends behind
        // the hips it washes over the nearest afterimage and visually merges
        // the two, even when their transforms are correctly separated.
        heroBladeWake.position.copy(actorWorldPosition).addScaledVector(dashDirection, 0.82).setY(0.92);
        heroBladeWake.scale.x = 2.15 + Math.sin(Math.PI * Math.min(1, t * 1.7)) * 0.9;
        wakeMaterial.opacity = (isChain ? 1 : 0.82) * (1 - THREE.MathUtils.smoothstep(t, 0.55, 1));
      },
    });

    const bladeSide = new THREE.Vector3(-dashDirection.z, 0, dashDirection.x);
    const arcStart = end.clone().addScaledVector(dashDirection, -1.5).addScaledVector(bladeSide, -0.72).setY(0.72);
    const arcControl = end.clone().addScaledVector(dashDirection, -0.35).addScaledVector(bladeSide, 0.18).setY(1.32);
    const arcEnd = end.clone().addScaledVector(dashDirection, 0.58).addScaledVector(bladeSide, 0.68).setY(0.82);
    const arcCurve = new THREE.QuadraticBezierCurve3(arcStart, arcControl, arcEnd);
    const arcGeometry = new THREE.TubeGeometry(arcCurve, 10, 0.022, 4, false);
    const arcMaterial = new THREE.MeshBasicMaterial({
      color: 0xf1ffff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const bladeArc = new THREE.Mesh(arcGeometry, arcMaterial);
    bladeArc.name = "localized-arrival-blade-arc";
    bladeArc.renderOrder = 10;
    bladeArc.userData.disposeGeometry = true;
    addEffect({
      age: 0,
      lifetime: 0.2,
      object: bladeArc,
      tick: (t) => {
        const open = THREE.MathUtils.smoothstep(t, 0, 0.28);
        const appear = THREE.MathUtils.smoothstep(t, 0.32, 0.5);
        const fade = 1 - THREE.MathUtils.smoothstep(t, 0.62, 1);
        bladeArc.scale.setScalar(0.72 + open * 0.28);
        arcMaterial.opacity = 0.96 * appear * fade;
      },
    });

    const ghostGeometry = bakeActorSilhouette(actor);
    const ghosts = new THREE.Group();
    ghosts.name = "dash-afterimage-decay-chain";
    const actorQuaternion = new THREE.Quaternion();
    const actorScale = new THREE.Vector3();
    actor.getWorldQuaternion(actorQuaternion);
    actor.getWorldScale(actorScale);
    // These are world-space trailing distances, not fixed percentages along the
    // route.  Fixed route percentages can place a "ghost" ahead of the live
    // actor on a long dash, which reads as teleport noise instead of motion.
    // The dash pose is roughly three world-units long from trailing foot to
    // blade shoulder.  Keep the nearest echo farther back than that silhouette
    // length, then use near-even gaps so all three remain countable at 1080p.
    const ghostOpacities = isChain ? [0.58, 0.46, 0.36, 0.27, 0.19] : [0.42, 0.32, 0.24];
    const ghostScales = isChain ? [0.9, 0.82, 0.73, 0.64, 0.55] : [0.8, 0.68, 0.56];
    const ghostSideOffsets = isChain ? [2.7, 2.05, 1.4, 0.8, 0.28] : [2.4, 1.55, 0.75];
    const ghostMaterials: THREE.MeshBasicMaterial[] = [];
    const ghostMeshes: THREE.Mesh[] = [];
    ghostOpacities.forEach((opacity, index) => {
      const material = new THREE.MeshBasicMaterial({
        color: new THREE.Color().setRGB(
          isChain ? Math.max(0.18, 0.62 - index * 0.08) : 0.15 - index * 0.045,
          isChain ? Math.max(0.42, 0.92 - index * 0.09) : 0.55 - index * 0.16,
          isChain ? Math.max(0.48, 1 - index * 0.08) : 0.62 - index * 0.17,
        ),
        transparent: true,
        opacity,
        // Afterimages are temporal information: keep them readable when the
        // dash passes through a target row instead of letting enemy depth erase
        // one of the three beats.  Large world-space gaps prevent overlap.
        depthTest: false,
        depthWrite: false,
        blending: THREE.NormalBlending,
        side: THREE.FrontSide,
        toneMapped: false,
      });
      const ghost = new THREE.Mesh(ghostGeometry, material);
      ghost.name = `dash-afterimage-${index + 1}`;
      ghost.position.copy(start);
      ghost.quaternion.copy(actorQuaternion);
      ghost.scale.copy(actorScale).multiplyScalar(ghostScales[index]);
      ghost.castShadow = false;
      ghost.receiveShadow = false;
      ghost.frustumCulled = false;
      ghost.renderOrder = 8;
      ghost.userData.disposeGeometry = index === 0;
      ghostMaterials.push(material);
      ghostMeshes.push(ghost);
      ghosts.add(ghost);
    });
    const actorFromStart = new THREE.Vector3();
    addEffect({
      age: 0,
      lifetime: 0.2,
      object: ghosts,
      tick: (t) => {
        const fade = 1 - THREE.MathUtils.smoothstep(t, 0.02, 0.72);
        actor.getWorldPosition(actorWorldPosition);
        actorFromStart.subVectors(actorWorldPosition, start);
        const travelled = THREE.MathUtils.clamp(
          actorFromStart.dot(dashDirection),
          0,
          start.distanceTo(end),
        );
        // Divide the actually available trail into three equal slots.  A fixed
        // long distance makes multiple echoes clamp to the arena edge during
        // the first dash frame, stacking them into one bright figure.
          const ghostSpacing = Math.min(isChain ? 2.75 : 3.6, Math.max(0.01, (travelled - 0.45) / ghostOpacities.length));
        const chainEstablished = THREE.MathUtils.smoothstep(travelled, 2.2, 5.8);
        ghostMaterials.forEach((material, index) => {
          const trailingDistance = ghostSpacing * (index + 1);
          const ghost = ghostMeshes[index];
          const routeDistance = travelled - trailingDistance;
          ghost.position
            .copy(start)
            .addScaledVector(dashDirection, routeDistance)
            .addScaledVector(bladeSide, ghostSideOffsets[index])
            .setY(0);
          ghost.visible = chainEstablished > 0.01;
          material.opacity = ghostOpacities[index] * chainEstablished * fade;
        });
      },
    });

    if (isChain) {
      const ringMaterial = new THREE.MeshBasicMaterial({
        color: 0xdfffff,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      });
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.52, 32), ringMaterial);
      ring.name = "vector-chain-arrival-shock-ring";
      ring.rotation.x = -Math.PI / 2;
      ring.position.copy(end).setY(0.095);
      ring.renderOrder = 12;
      ring.userData.disposeGeometry = true;
      addEffect({
        age: 0,
        lifetime: 0.38,
        object: ring,
        tick: (t) => {
          ring.scale.setScalar(0.75 + t * 6.8);
          ringMaterial.opacity = 0.9 * (1 - THREE.MathUtils.smoothstep(t, 0.18, 1));
        },
      });
    }

    // Kill impacts intentionally happen later from the enemy death timeline.
    // The player must visibly pass through first, then the cut seam and blood fire.
  }

  function disposeEffectObject(object: THREE.Object3D) {
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh || child instanceof THREE.Points || child instanceof THREE.Sprite)) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) material.dispose();
      if ((child instanceof THREE.Mesh || child instanceof THREE.Points) && (child instanceof THREE.Points || child.userData.disposeGeometry === true)) {
        child.geometry.dispose();
      }
    });
  }

  function clearStage() {
    const removed = new Set<THREE.Object3D>();
    for (const effect of effects) {
      scene.remove(effect.object);
      if (!removed.has(effect.object)) disposeEffectObject(effect.object);
      removed.add(effect.object);
    }
    effects.length = 0;
    for (const pool of persistentPools) {
      scene.remove(pool);
      if (!removed.has(pool)) (pool.material as THREE.Material).dispose();
      removed.add(pool);
    }
    persistentPools.length = 0;
  }

  function update(dt: number) {
    for (let i = effects.length - 1; i >= 0; i -= 1) {
      const effect = effects[i];
      effect.age += dt;
      const normalized = Math.min(1, effect.age / effect.lifetime);
      effect.tick(normalized, dt);
      if (effect.age < effect.lifetime) continue;

      // Blood pools are intentionally persistent for the current stage.
      if (!persistentPools.includes(effect.object as THREE.Mesh)) {
        scene.remove(effect.object);
        disposeEffectObject(effect.object);
      }
      effects.splice(i, 1);
    }
  }

  return { spawnSlash, spawnCutContact, spawnKillImpact, seedBlood, clearStage, update };
}
