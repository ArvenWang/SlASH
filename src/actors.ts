import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

export interface ActorVisual {
  root: THREE.Group;
  blade?: THREE.Mesh;
  energyMaterials: THREE.MeshStandardMaterial[];
}

const shared = {
  capsule: new THREE.CapsuleGeometry(0.18, 0.78, 5, 8),
  smallCapsule: new THREE.CapsuleGeometry(0.13, 0.56, 5, 8),
  torso: new RoundedBoxGeometry(0.92, 1.05, 0.5, 4, 0.12),
  enemyTorso: new RoundedBoxGeometry(1.18, 1.1, 0.64, 4, 0.12),
  cube: new THREE.BoxGeometry(1, 1, 1),
  sphere: new THREE.SphereGeometry(1, 12, 8),
  ring: new THREE.TorusGeometry(0.62, 0.018, 4, 40),
};

function standard(
  color: number,
  roughness: number,
  metalness: number,
  emissive = 0x000000,
  emissiveIntensity = 0,
) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    emissive,
    emissiveIntensity,
  });
}

function mesh(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  position: [number, number, number],
  scale: [number, number, number] = [1, 1, 1],
) {
  const part = new THREE.Mesh(geometry, material);
  part.position.set(...position);
  part.scale.set(...scale);
  part.castShadow = true;
  part.receiveShadow = true;
  return part;
}

export function createPlayerVisual(): ActorVisual {
  const root = new THREE.Group();
  root.name = "player-visual";

  const graphite = standard(0x0d1217, 0.36, 0.82);
  const graphiteEdge = standard(0x28323a, 0.24, 0.9);
  const carbon = standard(0x05070a, 0.68, 0.44);
  const cyan = standard(0x9cf6ff, 0.17, 0.68, 0x83f4ff, 3.8);
  const whiteEnergy = standard(0xf0ffff, 0.08, 0.7, 0xd6ffff, 7.2);

  const leftLeg = mesh(shared.capsule, carbon, [-0.25, 0.67, 0], [0.84, 1.18, 0.82]);
  const rightLeg = mesh(shared.capsule, carbon, [0.25, 0.67, 0], [0.84, 1.18, 0.82]);
  leftLeg.rotation.z = -0.05;
  rightLeg.rotation.z = 0.05;
  root.add(leftLeg, rightLeg);

  root.add(
    mesh(shared.cube, graphiteEdge, [-0.25, 0.73, 0.04], [0.32, 0.62, 0.28]),
    mesh(shared.cube, graphiteEdge, [0.25, 0.73, 0.04], [0.32, 0.62, 0.28]),
    mesh(shared.cube, graphite, [0, 1.2, 0], [0.66, 0.27, 0.42]),
  );

  const torso = mesh(shared.torso, graphite, [0, 1.72, 0], [0.92, 1.12, 0.92]);
  torso.rotation.x = -0.035;
  root.add(torso);
  root.add(
    mesh(shared.cube, graphiteEdge, [-0.51, 1.95, 0], [0.28, 0.22, 0.56]),
    mesh(shared.cube, graphiteEdge, [0.51, 1.95, 0], [0.28, 0.22, 0.56]),
  );

  const leftArm = mesh(shared.smallCapsule, carbon, [-0.54, 1.45, 0.04], [0.82, 1, 0.82]);
  const rightArm = mesh(shared.smallCapsule, carbon, [0.54, 1.43, 0.08], [0.82, 1, 0.82]);
  leftArm.rotation.z = -0.15;
  rightArm.rotation.z = 0.15;
  root.add(leftArm, rightArm);

  const neck = mesh(shared.cube, carbon, [0, 2.22, 0], [0.28, 0.2, 0.26]);
  const helmet = mesh(shared.sphere, graphiteEdge, [0, 2.52, 0.02], [0.36, 0.3, 0.42]);
  const crown = mesh(shared.cube, graphite, [0, 2.73, -0.04], [0.18, 0.25, 0.44]);
  crown.rotation.x = -0.18;
  root.add(neck, helmet, crown);

  const visor = new THREE.Group();
  for (let i = -2; i <= 2; i += 1) {
    const optic = mesh(shared.sphere, cyan, [i * 0.105, 2.54 + Math.abs(i) * 0.018, 0.37], [0.045, 0.032, 0.032]);
    optic.castShadow = false;
    visor.add(optic);
  }
  root.add(visor);

  root.add(
    mesh(shared.cube, cyan, [0, 1.75, -0.285], [0.055, 0.72, 0.035]),
    mesh(shared.cube, cyan, [-0.37, 1.72, 0.27], [0.055, 0.36, 0.035]),
    mesh(shared.cube, cyan, [0.37, 1.72, 0.27], [0.055, 0.36, 0.035]),
  );

  const sword = new THREE.Group();
  sword.position.set(0.72, 1.28, 0.3);
  sword.rotation.set(-0.18, 0, -1.02);
  const bladeBody = mesh(shared.cube, graphiteEdge, [0, 1.1, 0], [0.115, 2.2, 0.07]);
  const bladeEdge = mesh(shared.cube, whiteEnergy, [0.085, 1.1, 0.001], [0.045, 2.24, 0.028]);
  const guard = mesh(shared.cube, graphiteEdge, [0, -0.08, 0], [0.48, 0.09, 0.16]);
  const handle = mesh(shared.cube, carbon, [0, -0.38, 0], [0.13, 0.56, 0.14]);
  sword.add(bladeBody, bladeEdge, guard, handle);
  root.add(sword);

  const groundRing = new THREE.Mesh(
    shared.ring,
    new THREE.MeshBasicMaterial({ color: 0xa8f9ff, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  groundRing.rotation.x = Math.PI / 2;
  groundRing.position.y = 0.025;
  groundRing.castShadow = false;
  root.add(groundRing);

  root.scale.setScalar(1.16);
  return { root, blade: bladeEdge, energyMaterials: [cyan, whiteEnergy] };
}

export function createEnemyVisual(variant = 0): ActorVisual {
  const root = new THREE.Group();
  root.name = "enemy-visual";

  const armor = standard(0x15181b, 0.43, 0.74);
  const armorEdge = standard(0x35393b, 0.32, 0.82);
  const undersuit = standard(0x08090a, 0.72, 0.3);
  const hostile = standard(0xff3b20, 0.2, 0.6, 0xff3118, 6.2);
  const hostileDim = standard(0x6e170e, 0.4, 0.6, 0xff2b13, 2.7);

  const leftLeg = mesh(shared.capsule, undersuit, [-0.31, 0.62, 0], [1, 1.05, 1]);
  const rightLeg = mesh(shared.capsule, undersuit, [0.31, 0.62, 0], [1, 1.05, 1]);
  leftLeg.rotation.z = -0.08;
  rightLeg.rotation.z = 0.08;
  root.add(leftLeg, rightLeg);
  root.add(
    mesh(shared.cube, armorEdge, [-0.31, 0.7, 0.04], [0.38, 0.65, 0.34]),
    mesh(shared.cube, armorEdge, [0.31, 0.7, 0.04], [0.38, 0.65, 0.34]),
    mesh(shared.cube, armor, [0, 1.16, 0], [0.78, 0.3, 0.48]),
  );

  root.add(mesh(shared.enemyTorso, armor, [0, 1.67, 0], [1, 1.02, 1]));
  root.add(
    mesh(shared.cube, armorEdge, [-0.68, 1.91, 0], [0.4, 0.32, 0.68]),
    mesh(shared.cube, armorEdge, [0.68, 1.91, 0], [0.4, 0.32, 0.68]),
  );
  const leftArm = mesh(shared.smallCapsule, undersuit, [-0.67, 1.43, 0], [1.05, 1.08, 1.05]);
  const rightArm = mesh(shared.smallCapsule, undersuit, [0.67, 1.43, 0], [1.05, 1.08, 1.05]);
  leftArm.rotation.z = -0.22;
  rightArm.rotation.z = 0.22;
  root.add(leftArm, rightArm);

  root.add(
    mesh(shared.cube, hostileDim, [0, 1.76, 0.34], [0.72, 0.23, 0.04]),
    mesh(shared.cube, hostile, [variant % 2 === 0 ? -0.37 : 0.37, 1.95, 0.37], [0.11, 0.14, 0.04]),
  );

  const helmet = mesh(shared.sphere, armorEdge, [0, 2.46, 0], [0.42, 0.34, 0.44]);
  root.add(helmet);
  root.add(mesh(shared.cube, hostile, [0, 2.47, 0.4], [0.34, 0.065, 0.035]));

  const weapon = new THREE.Group();
  weapon.position.set(0.78, 1.1, 0.26);
  weapon.rotation.z = -0.12;
  weapon.add(
    mesh(shared.cube, armorEdge, [0, 0.72, 0], [0.13, 1.5, 0.12]),
    mesh(shared.cube, hostileDim, [0.05, 1.42, 0], [0.05, 0.42, 0.05]),
  );
  root.add(weapon);

  const groundRing = new THREE.Mesh(
    shared.ring,
    new THREE.MeshBasicMaterial({ color: 0xff3c26, transparent: true, opacity: 0.11, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  groundRing.rotation.x = Math.PI / 2;
  groundRing.position.y = 0.022;
  root.add(groundRing);

  root.scale.setScalar(1.16 + (variant % 3) * 0.018);
  return { root, energyMaterials: [hostile, hostileDim] };
}

export function setActorHeading(actor: THREE.Object3D, dx: number, dz: number) {
  if (Math.abs(dx) + Math.abs(dz) < 0.0001) return;
  actor.rotation.y = Math.atan2(dx, dz);
}

export function setActorDashPose(actor: THREE.Group, amount: number) {
  const eased = THREE.MathUtils.smoothstep(amount, 0, 1);
  actor.rotation.x = -0.25 * eased;
  actor.scale.set(1.16 + eased * 0.14, 1.16 - eased * 0.09, 1.16 + eased * 0.14);
}
